// Turns a plain-English description into a draft agent step graph, via
// Claude tool-use (same "structured output via forced tool call" trick the
// engine uses for tool steps and branch classification). The result is a
// first draft for a human to review/edit on the canvas — never run directly.

import Anthropic from "@anthropic-ai/sdk";
import type { GeneratedAgent } from "./types";

const anthropic = new Anthropic();

// Shared by both the one-shot "Generate with AI" flow and the conversational
// wizard — same schema either way, since both ultimately hand the user a
// draft step graph to review on the canvas.
export const PROPOSE_AGENT_SCHEMA = {
  type: "object" as const,
  properties: {
    name: { type: "string", description: "Short, kebab-or-snake-case name for the agent." },
    start: { type: "string", description: "id of the first step to run." },
    steps: {
      type: "array",
      description: "Every step in the agent, in any order — connections are via id references.",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Short, unique, snake_case id for this step." },
          kind: { type: "string", enum: ["agent", "branch", "user_input"] },
          prompt: {
            type: "string",
            description:
              "For kind=agent: the prompt sent to Claude. For kind=user_input: the question or confirmation " +
              "message shown to a person. Either may reference {{other_step_id.output}} or {{user_input.output}}, " +
              "but a user_input step's question doesn't need to — whatever step feeds into it is included " +
              "automatically.",
          },
          tool: {
            type: "string",
            enum: ["", "google_sheets_read", "google_sheets_write"],
            description: "For kind=agent only: leave empty unless this step needs to read/write a Google Sheet.",
          },
          range: {
            type: "string",
            description: "For kind=agent with a tool only: suggested A1 range, e.g. 'Sheet1!A2:D' or 'Results!A1'.",
          },
          next: {
            type: "string",
            description:
              "For kind=agent, or kind=user_input in \"text\" mode: id of the step to run afterward. Omit to " +
              "end the agent here.",
          },
          basedOn: {
            type: "string",
            description: "For kind=branch only: id of the earlier step whose output gets classified.",
          },
          instructions: {
            type: "string",
            description: "For kind=branch only: what each label/case means, for the classifier.",
          },
          mode: {
            type: "string",
            enum: ["text", "approval"],
            description:
              "For kind=user_input only: \"text\" pauses to ask an open question (the answer becomes this " +
              "step's output). \"approval\" pauses to ask a person to pick one of a fixed set of labeled options " +
              "(e.g. Approve/Reject) — use this for a confirm/review step.",
          },
          branches: {
            type: "array",
            description:
              "For kind=branch, or kind=user_input in \"approval\" mode: the labeled cases/options.",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                next: { type: "string", description: "id of the step this case leads to. Omit to end here." },
              },
              required: ["label"],
            },
          },
        },
        required: ["id", "kind"],
      },
    },
  },
  required: ["name", "start", "steps"],
};

function buildPrompt(description: string): string {
  return `You are designing a workflow for a Claude-powered agent builder. An agent is a directed graph of steps:

- An "agent" step sends a prompt to Claude. It may optionally call one tool: google_sheets_read (needs a "range" like "Sheet1!A2:D") or google_sheets_write (needs a "range" like "Results!A1"). Leave "tool" empty for a plain reasoning/text step with no tool call.
- A "branch" step classifies a prior step's output (its id given as "basedOn") into one of several labeled cases ("branches"), each routing to a different "next" step id. Use "instructions" to tell the classifier what each label means.
- A "user_input" step pauses the agent and asks a real person something, via "prompt". Use "mode": "text" for an open question (routes onward via "next"), or "mode": "approval" for a fixed set of labeled options like Approve/Reject (each its own "branches" entry with its own "next") — use this for a confirm/review step. Its question doesn't need a {{...}} placeholder — whatever step feeds into it is included automatically.
- Every step's "next" (or each branch/approval case's "next") points at the id of the following step. Leave it unset to end the agent on that path.
- Prompts may reference any earlier step's output via {{step_id.output}}, and whatever the end user types when testing the agent via {{user_input.output}}.
- Keep it as simple as possible for what was asked: only add a branch or user_input step if the request genuinely implies conditional behavior or a human check-in, and don't invent steps or tool calls beyond what's needed.

Given the user's request below, propose a complete step graph via the propose_agent tool.

User's request:
${description}`;
}

export async function generateAgentDraft(
  description: string,
  model = "claude-sonnet-5"
): Promise<GeneratedAgent> {
  // Thinking is disabled — extended thinking is on by default for this
  // model and can burn through most of max_tokens on internal reasoning
  // before ever producing the tool call, truncating a complex proposal with
  // nothing usable left.
  const response = await anthropic.messages.create({
    model,
    max_tokens: 8192,
    messages: [{ role: "user", content: buildPrompt(description) }],
    tools: [
      {
        name: "propose_agent",
        description: "Propose a complete agent step graph matching the user's request.",
        input_schema: PROPOSE_AGENT_SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: "propose_agent" },
    thinking: { type: "disabled" },
  } as Anthropic.MessageCreateParamsNonStreaming);

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUse) {
    throw new Error("Claude didn't propose an agent — try rephrasing the description.");
  }

  return toolUse.input as GeneratedAgent;
}
