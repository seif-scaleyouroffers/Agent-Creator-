// UI-only types for the agent builder canvas. Kept separate from src/types.ts
// (which is shared with the CLI/engine) since these describe draft/editable
// state in the browser, not the AgentConfig shape sent to the API.
//
// Execution order/routing lives in the canvas's edges (drawn by the user),
// not in these drafts — a draft only holds a node's own configuration plus
// its canvas position.

export type ToolChoice = "" | "google_sheets_read" | "google_sheets_write";

export interface CanvasPosition {
  x: number;
  y: number;
}

export interface SheetCheck {
  status: "idle" | "checking" | "ok" | "error";
  message: string;
  spreadsheetId?: string;
  title?: string;
  tabs?: string[];
}

export const IDLE_SHEET_CHECK: SheetCheck = { status: "idle", message: "" };

export interface AgentStepDraft {
  kind: "agent";
  key: string; // stable React/Flow node id, independent of the editable `id` below
  id: string; // the engine step id, referenced by {{id.output}} in later prompts
  prompt: string;
  tool: ToolChoice;
  range: string;
  sheetUrl: string; // per-step — each step can point at a different spreadsheet
  sheetCheck: SheetCheck;
  position: CanvasPosition;
}

export interface BranchStepDraft {
  kind: "branch";
  key: string;
  id: string;
  basedOn: string; // id of the step whose output gets classified
  instructions: string; // what each label means, for the classifier prompt
  branches: string[]; // case labels — each renders as its own source handle
  position: CanvasPosition;
}

// A human-in-the-loop step: pauses the run and asks whoever is testing/using
// the agent something. mode "text" is a free-form question (the answer
// becomes this step's output); mode "approval" is a fixed set of labeled
// options (e.g. Approve/Reject), each its own connectable path, like a
// branch step but decided by the human instead of Claude.
export interface UserInputStepDraft {
  kind: "user_input";
  key: string;
  id: string;
  mode: "text" | "approval";
  prompt: string;
  options: string[]; // mode: "approval" only — each its own source handle
  position: CanvasPosition;
}

// A purely visual terminator — not a real engine step. An edge pointing at
// one just means "stop here", same as an edge pointing at nothing.
export interface EndStepDraft {
  kind: "end";
  key: string;
  position: CanvasPosition;
}

export type CanvasStep = AgentStepDraft | BranchStepDraft | UserInputStepDraft | EndStepDraft;

export interface RunStepResult {
  id: string;
  tool?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: unknown;
  output: string;
}

export interface ChatMessage {
  role: "user" | "agent";
  text: string;
  steps?: RunStepResult[]; // agent messages only — full step-by-step detail
  isError?: boolean;
  isPending?: boolean; // agent messages only — this is a paused question, not a final reply
}

