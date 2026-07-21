// Shared types for the agent engine. Keeping these in one small file is what
// lets `engine.ts` and every tool module agree on the same shapes without
// importing from each other.

// A JSON Schema object, in the same shape Claude's `tools` API expects for
// `input_schema`. Kept loose (not a full JSON Schema type) since we only ever
// build simple object schemas by hand.
export interface JSONSchema {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

// The contract every tool module must implement. This is the ONLY thing the
// engine knows about a tool — add a new integration by writing one file that
// satisfies this interface and registering it in tools/registry.ts. The
// engine itself never needs to change.
export interface Tool {
  name: string;
  description: string;
  input_schema: JSONSchema;
  run(params: Record<string, unknown>): Promise<unknown>;
}

// A regular step: a prompt, plus an optional tool call. `next` points at the
// step to run afterward; omit it (or point at "end") to stop the agent here.
export interface AgentStepConfig {
  id: string;
  kind?: "agent";
  // Prompt sent to Claude for this step. May reference prior steps' outputs
  // via `{{step_id.output}}` placeholders.
  prompt: string;
  // Name of a tool (must match a key in the tool registry). Omit for a
  // plain "ask Claude something" step with no tool call.
  tool?: string;
  // Parameters already known ahead of time (e.g. which spreadsheet/range).
  // These are fixed by config and always win over anything Claude supplies.
  tool_params?: Record<string, unknown>;
  next?: string;
}

// One labeled path out of a branch step.
export interface BranchCase {
  label: string;
  next?: string;
}

// A branch step: classifies a prior step's output into one of several
// labeled cases (via Claude), then continues down that case's path. This is
// what an "If/else" node in the UI compiles down to.
export interface BranchStepConfig {
  id: string;
  kind: "branch";
  // Which prior step's output to classify.
  basedOn: string;
  // Extra guidance for the classifier — what each label means, etc.
  instructions: string;
  branches: BranchCase[];
}

// A human-in-the-loop step: pauses the run and asks the person testing/using
// the agent something, then continues once they answer.
//   - mode "text": a free-form question; the answer becomes this step's
//     output, referenceable as {{step_id.output}} in later prompts.
//   - mode "approval": a fixed set of labeled options (e.g. Approve/Reject),
//     each its own path — like a branch step, but the human picks instead of
//     Claude classifying.
// `prompt` may reference {{other_step.output}} the same way any step's does.
export interface UserInputStepConfig {
  id: string;
  kind: "user_input";
  mode: "text" | "approval";
  prompt: string;
  next?: string; // mode: "text"
  branches?: BranchCase[]; // mode: "approval"
}

export type StepConfig = AgentStepConfig | BranchStepConfig | UserInputStepConfig;

// The full shape of an agent definition file (agents/*.yaml). Steps form a
// graph, not just a list — `start` is where execution begins, and each
// step's `next` (or branch's `next`) says where to go afterward.
export interface AgentConfig {
  name: string;
  model: string;
  start: string;
  steps: StepConfig[];
}

// Loose shape Claude fills in when asked to draft an agent from a plain-
// English description (see generateAgent.ts). Deliberately more permissive
// than AgentConfig/StepConfig — every field is optional except id/kind,
// since this is a first draft for a human to review, not something the
// engine runs directly.
export interface GeneratedBranchCase {
  label: string;
  next?: string;
}

export interface GeneratedStep {
  id: string;
  kind: "agent" | "branch" | "user_input";
  prompt?: string; // kind: agent (the prompt) or user_input (the question)
  tool?: "" | "google_sheets_read" | "google_sheets_write"; // kind: agent only
  range?: string; // kind: agent with a tool only
  next?: string; // kind: agent, or user_input in "text" mode
  basedOn?: string; // kind: branch only
  instructions?: string; // kind: branch only
  branches?: GeneratedBranchCase[]; // kind: branch, or user_input in "approval" mode
  mode?: "text" | "approval"; // kind: user_input only
}

export interface GeneratedAgent {
  name: string;
  start: string;
  steps: GeneratedStep[];
}
