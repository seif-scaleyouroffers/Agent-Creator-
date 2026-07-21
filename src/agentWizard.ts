// The conversational "Create with AI" wizard: unlike generateAgent.ts's
// one-shot draft (a single prompt in, a single graph out), this walks the
// user through building an agent turn by turn — restating what it understood,
// asking clarifying questions, verifying any Google Sheets it's asked to
// connect, and only proposing (or revising) the graph once it actually has
// enough to work with.

import Anthropic from "@anthropic-ai/sdk";
import type { GeneratedAgent } from "./types";
import { PROPOSE_AGENT_SCHEMA } from "./generateAgent";
import { extractSpreadsheetId, checkSpreadsheetAccess } from "./tools/googleSheets";

const anthropic = new Anthropic();

const MAX_TOOL_ROUNDS = 6;

// A real multi-stage agent (several steps, each with a substantial prompt —
// branch instructions, financial-style formulas spelled out for Claude to
// follow, style-guide text, etc.) can easily need more than a few thousand
// output tokens for a single propose_agent call. Too low a limit here means
// the response gets cut off mid-tool-call with nothing usable recovered.
const MAX_OUTPUT_TOKENS = 8192;

export interface WizardMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SheetCheckNote {
  url: string;
  ok: boolean;
  message: string;
}

export interface WizardTurnResult {
  reply: string;
  agent?: GeneratedAgent;
  sheetChecks: SheetCheckNote[];
}

const CHECK_SHEET_TOOL = {
  name: "check_google_sheet",
  description:
    "Verifies a Google Sheets URL is actually accessible (shared with the service account) and reports its " +
    "title and tab names. Call this whenever the person gives you a sheet link the agent needs to read or " +
    "write, before finalizing anything that depends on it.",
  input_schema: {
    type: "object" as const,
    properties: {
      url: { type: "string", description: "The Google Sheets URL the person pasted." },
    },
    required: ["url"],
  },
};

const PROPOSE_AGENT_TOOL = {
  name: "propose_agent",
  description:
    "Finalize (or revise) the complete agent step graph once you have enough information and every Google " +
    "Sheet dependency has been verified. Always pass the full graph, not a partial diff.",
  input_schema: PROPOSE_AGENT_SCHEMA,
};

function buildSystemPrompt(): string {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;

  return `You are helping a non-technical person design an agent for a Claude-powered agent builder, through conversation rather than a single prompt. An agent is a directed graph of steps:

- An "agent" step sends a prompt to Claude. It may optionally call one tool: google_sheets_read (needs a "range" like "Sheet1!A2:D") or google_sheets_write (needs a "range" like "Results!A1"). Leave "tool" empty for a plain reasoning/text step with no tool call.
- A "branch" step classifies a prior step's output into one of several labeled cases, each routing to a different step. Use "instructions" to tell the classifier what each label means.
- A "user_input" step pauses the agent and asks a real person something. Use mode "text" for an open question, or "approval" for a fixed set of labeled options like Approve/Reject (for a confirm/review step). Its question doesn't need a {{...}} placeholder — whatever step feeds into it is included automatically.
- Every step's "next" (or each branch/approval case's "next") points at the id of the following step. Leave it unset to end the agent on that path.
- Prompts may reference any earlier step's output via {{step_id.output}}, and whatever the end user types when testing the agent via {{user_input.output}}.

How to run this conversation:
1. First, restate in your own words what you understood the person wants this agent to do, and confirm it's right — don't jump straight to proposing a graph unless the request is already simple and unambiguous.
2. Ask whatever clarifying questions you genuinely need (which data/columns, what should trigger a branch, what a confirm step should check, tone/format of outputs). Don't silently guess at anything that would change the design.
3. If the agent needs to read or write a Google Sheet, ask for that sheet's URL, then call check_google_sheet to verify access before finalizing anything that depends on it. If it fails, tell them exactly why (e.g. "share it with ${serviceAccountEmail ?? "the service account's email"} as an Editor") and ask them to fix sharing or give a different link — never finalize a graph that depends on an unverified sheet.
4. Once you have enough information and every sheet dependency is verified, call propose_agent with the complete graph, then give a brief closing summary of what you built.
5. If they ask for changes afterward, revise and call propose_agent again with the complete, updated graph.
6. Keep it as simple as the request actually needs — don't invent steps, branches, or tools beyond what's needed.

Keep responses conversational and concise — this is a chat with a non-technical person, not a spec document.`;
}

async function runCheckGoogleSheet(url: string): Promise<{ ok: boolean; message: string; payload: Record<string, unknown> }> {
  const spreadsheetId = extractSpreadsheetId(url);
  if (!spreadsheetId) {
    const message = "Couldn't find a spreadsheet ID in that URL.";
    return { ok: false, message, payload: { ok: false, error: message } };
  }
  try {
    const info = await checkSpreadsheetAccess(spreadsheetId);
    const message = `Connected: "${info.title}" (tabs: ${info.tabs.join(", ")})`;
    return { ok: true, message, payload: { ok: true, spreadsheetId, ...info } };
  } catch (err) {
    const status = (err as { code?: number })?.code;
    const message =
      status === 403 || status === 404
        ? "Can't access this sheet — make sure it's shared with the service account's email (Editor access)."
        : `Google Sheets error: ${err instanceof Error ? err.message : String(err)}`;
    return { ok: false, message, payload: { ok: false, error: message } };
  }
}

async function callModel(model: string, messages: Anthropic.MessageParam[]) {
  const response = await anthropic.messages.create({
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: buildSystemPrompt(),
    messages,
    tools: [CHECK_SHEET_TOOL, PROPOSE_AGENT_TOOL],
    // Extended thinking is on by default for this model and can burn through
    // most of max_tokens on internal reasoning before ever starting the
    // propose_agent JSON, truncating it with nothing usable left — this call
    // needs a reliable structured tool call, not deliberation. The installed
    // SDK version predates typed support for this field, hence the cast.
    thinking: { type: "disabled" },
  } as Anthropic.MessageCreateParamsNonStreaming);
  const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  const textReply = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return { response, toolUses, textReply };
}

export async function runWizardTurn(history: WizardMessage[], model = "claude-sonnet-5"): Promise<WizardTurnResult> {
  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  const sheetChecks: SheetCheckNote[] = [];
  let agent: GeneratedAgent | undefined;
  let lastText = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let { response, toolUses, textReply } = await callModel(model, messages);

    // An empty completion (no text, no tool call) is almost always a fluke
    // rather than a deliberate "nothing to say" — retry once before treating
    // it as a real dead end.
    if (toolUses.length === 0 && !textReply) {
      ({ response, toolUses, textReply } = await callModel(model, messages));
    }

    if (textReply) lastText = textReply;

    if (toolUses.length === 0) {
      if (textReply) {
        return { reply: textReply, agent, sheetChecks };
      }
      // Still nothing usable after the retry. A truncated response (the
      // model ran out of room composing a large propose_agent call) is the
      // most likely cause for a complex request — say so plainly instead of
      // a silent dead end.
      const reply =
        lastText ||
        (response.stop_reason === "max_tokens"
          ? "This agent is complex enough that I ran out of room composing a reply — try splitting your last message into a couple of smaller ones, or ask me to simplify the design."
          : "I didn't get a usable reply that time — could you try rephrasing your last message?");
      return { reply, agent, sheetChecks };
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUses) {
      if (block.name === "check_google_sheet") {
        const url = (block.input as { url?: string })?.url ?? "";
        const { ok, message, payload } = await runCheckGoogleSheet(url);
        sheetChecks.push({ url, ok, message });
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(payload) });
      } else if (block.name === "propose_agent") {
        agent = block.input as GeneratedAgent;
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: "Recorded — continue the conversation, or give your closing summary now.",
        });
      } else {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Unknown tool "${block.name}".`,
          is_error: true,
        });
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  return {
    reply: lastText || "I'm having trouble wrapping this up — try rephrasing your last message.",
    agent,
    sheetChecks,
  };
}
