// The core engine: load an agent config, then walk its step graph starting
// from `config.start`.
//
// Flow for each regular step:
//   render prompt (fill in {{step.output}} placeholders from earlier steps)
//     -> call Claude
//     -> if the step has a tool, force Claude to call it and run it for real
//     -> store the result as this step's output, for later steps to use
//     -> move to step.next (or stop, if there isn't one)
//
// A branch step instead asks Claude to classify a prior step's output into
// one of a fixed set of labels, then jumps to that label's `next` step.
//
// A user_input step pauses the run entirely and returns a "waiting_for_input"
// result — there's no live process to keep paused across an HTTP request, so
// resuming means calling runAgent again with the same config plus a `resume`
// option carrying the context built up so far and the answer to that step.

import fs from "node:fs";
import yaml from "js-yaml";
import Anthropic from "@anthropic-ai/sdk";
import type { AgentConfig, AgentStepConfig, StepConfig, Tool, JSONSchema } from "./types";
import { toolRegistry } from "./tools/registry";

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

// Safety cap on total steps executed in one run — without this, a cycle
// accidentally wired up in the branch editor would loop forever, calling
// Claude (and racking up cost) on every iteration.
const MAX_STEPS = 50;

export function loadAgentConfig(path: string): AgentConfig {
  const raw = fs.readFileSync(path, "utf8");
  return yaml.load(raw) as AgentConfig;
}

// Replaces `{{step_id.output}}` in a prompt with that step's stored output.
// `ownerStepId` is only for the error message — it's the step whose prompt
// is being rendered, so whoever sees the error knows which field to fix
// (the placeholder's own step id gives no clue by itself).
function renderPrompt(template: string, context: Record<string, string>, ownerStepId: string): string {
  return template.replace(/\{\{\s*(\w+)\.output\s*\}\}/g, (_match, stepId: string) => {
    if (!(stepId in context)) {
      const available = Object.keys(context);
      const hint = available.length
        ? ` Steps run so far: ${available.join(", ")}.`
        : " No steps have run yet at this point.";
      throw new Error(
        `Step "${ownerStepId}"'s prompt references "{{${stepId}.output}}", but there's no step ` +
          `with id "${stepId}" — replace it with an actual step's id.${hint}`
      );
    }
    return context[stepId];
  });
}

// Removes any properties from a tool's schema that the step config already
// fixes, so Claude only has to decide the remaining, genuinely dynamic
// arguments (e.g. it fills in `values` to write, but never the destination
// `spreadsheetId`/`range` if those are already set in the config).
function reduceSchema(tool: Tool, fixedParams: Record<string, unknown>): JSONSchema {
  const properties = { ...(tool.input_schema.properties ?? {}) };
  for (const key of Object.keys(fixedParams)) {
    delete properties[key];
  }
  const required = (tool.input_schema.required ?? []).filter(
    (key) => !(key in fixedParams)
  );
  return { type: "object", properties, required };
}

// One entry per executed step — this is what the web UI renders, and what
// the CLI's console.log calls are also drawn from.
export interface StepResult {
  id: string;
  tool?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: unknown;
  output: string;
}

// What a user_input step needs answered before the run can continue.
export interface PendingInput {
  stepId: string;
  prompt: string;
  mode: "text" | "approval";
  options?: string[]; // mode: "approval" only — the branch labels to choose from
}

export type RunResult =
  | { status: "done"; context: Record<string, string>; steps: StepResult[] }
  | { status: "waiting_for_input"; context: Record<string, string>; steps: StepResult[]; pending: PendingInput };

// Carries a paused run's state back in: which step was waiting, what the
// context looked like when it paused, and the answer to resume it with.
export interface ResumeOptions {
  stepId: string;
  context: Record<string, string>;
  answer: string;
}

async function runToolStep(
  model: string,
  prompt: string,
  step: AgentStepConfig,
  tool: Tool
): Promise<{ output: string; toolInput: Record<string, unknown>; toolResult: unknown }> {
  const fixedParams = step.tool_params ?? {};

  // Force Claude to call this exact tool, so the step deterministically
  // exercises the integration rather than Claude choosing to skip it.
  // Thinking is disabled — extended thinking is on by default for this
  // model and can burn through most of max_tokens on internal reasoning
  // before ever producing the tool call, truncating it with nothing usable
  // left. This call needs a reliable structured tool call, not deliberation.
  const response = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
    tools: [
      {
        name: tool.name,
        description: tool.description,
        input_schema: reduceSchema(tool, fixedParams),
      },
    ],
    tool_choice: { type: "tool", name: tool.name },
    thinking: { type: "disabled" },
  } as Anthropic.MessageCreateParamsNonStreaming);

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUse) {
    throw new Error(`Step "${step.id}" expected a tool call but Claude didn't make one.`);
  }

  // Config-fixed params always win, so Claude can never redirect a write to
  // somewhere other than what the step config specifies.
  const finalParams = {
    ...(toolUse.input as Record<string, unknown>),
    ...fixedParams,
  };

  console.log(`  -> calling tool "${tool.name}" with:`, finalParams);
  const result = await tool.run(finalParams);
  console.log("  <- tool result:", result);

  return {
    output: JSON.stringify(result, null, 2),
    toolInput: finalParams,
    toolResult: result,
  };
}

async function runPromptStep(model: string, prompt: string): Promise<string> {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
    thinking: { type: "disabled" },
  } as Anthropic.MessageCreateParamsNonStreaming);

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );
  return textBlock?.text ?? "";
}

// Asks Claude to pick exactly one of `labels` for the given content, via a
// forced tool call — the same "structured output via tool-use" trick the
// tool steps use, just with an enum instead of a Sheets schema.
async function classifyBranch(model: string, prompt: string, labels: string[]): Promise<string> {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
    tools: [
      {
        name: "choose_branch",
        description: "Choose which case this content falls into.",
        input_schema: {
          type: "object",
          properties: { label: { type: "string", enum: labels } },
          required: ["label"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "choose_branch" },
    thinking: { type: "disabled" },
  } as Anthropic.MessageCreateParamsNonStreaming);

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  const label = (toolUse?.input as { label?: string } | undefined)?.label;
  if (!label || !labels.includes(label)) {
    throw new Error(`Branch classification returned an unexpected label: ${JSON.stringify(label)}`);
  }
  return label;
}

export async function runAgent(
  config: AgentConfig,
  input?: string,
  resume?: ResumeOptions
): Promise<RunResult> {
  const byId = new Map(config.steps.map((s) => [s.id, s]));
  const context: Record<string, string> = { ...(resume?.context ?? {}) };
  const results: StepResult[] = [];

  // Whatever the tester typed is available to any prompt as
  // {{user_input.output}} — treating it as a pseudo-step's output means the
  // existing {{step_id.output}} placeholder syntax just works, no new syntax.
  if (input !== undefined && !resume) {
    context.user_input = input;
  }

  let currentId: string | undefined;

  if (resume) {
    // Apply the answer to the step that was waiting, then move on from it
    // exactly like a normal step would — an approval answer picks a branch
    // case, a text answer just becomes this step's output.
    const pausedStep = byId.get(resume.stepId);
    context[resume.stepId] = resume.answer;
    results.push({ id: resume.stepId, output: resume.answer });

    if (pausedStep?.kind === "user_input" && pausedStep.mode === "approval") {
      const branchCase = pausedStep.branches?.find((b) => b.label === resume.answer);
      currentId = branchCase?.next;
    } else if (pausedStep?.kind === "user_input") {
      currentId = pausedStep.next;
    }
  } else {
    currentId = config.start;
  }

  let guard = 0;

  while (currentId) {
    if (++guard > MAX_STEPS) {
      throw new Error(
        `Agent exceeded ${MAX_STEPS} steps — check the branch connections for a cycle.`
      );
    }

    const step: StepConfig | undefined = byId.get(currentId);
    if (!step) {
      throw new Error(`Unknown step "${currentId}".`);
    }

    console.log(`\n=== Step "${step.id}" ===`);

    if (step.kind === "user_input") {
      const prompt = renderPrompt(step.prompt, context, step.id);
      console.log(`  paused — waiting for input: ${prompt}`);
      return {
        status: "waiting_for_input",
        context,
        steps: results,
        pending: {
          stepId: step.id,
          prompt,
          mode: step.mode,
          options: step.mode === "approval" ? step.branches?.map((b) => b.label) : undefined,
        },
      };
    }

    if (step.kind === "branch") {
      const basedOnOutput = context[step.basedOn];
      if (basedOnOutput === undefined) {
        throw new Error(`Branch step "${step.id}" refers to unknown step "${step.basedOn}".`);
      }
      const labels = step.branches.map((b) => b.label);
      const prompt = `${step.instructions}\n\nContent to classify:\n${basedOnOutput}`;
      const chosen = await classifyBranch(config.model, prompt, labels);

      console.log(`  branch chosen: ${chosen}`);
      results.push({ id: step.id, output: `-> ${chosen}` });

      const branchCase = step.branches.find((b) => b.label === chosen);
      currentId = branchCase?.next;
      continue;
    }

    const prompt = renderPrompt(step.prompt, context, step.id);
    let stepResult: StepResult;
    if (step.tool) {
      const tool = toolRegistry[step.tool];
      if (!tool) {
        throw new Error(`Unknown tool "${step.tool}" referenced by step "${step.id}".`);
      }
      const { output, toolInput, toolResult } = await runToolStep(config.model, prompt, step, tool);
      stepResult = { id: step.id, tool: tool.name, toolInput, toolResult, output };
    } else {
      const output = await runPromptStep(config.model, prompt);
      stepResult = { id: step.id, output };
    }

    console.log(`Output:\n${stepResult.output}`);
    context[step.id] = stepResult.output;
    results.push(stepResult);
    currentId = step.next;
  }

  return { status: "done", context, steps: results };
}
