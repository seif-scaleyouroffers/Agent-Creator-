import { NextRequest, NextResponse } from "next/server";
import { getAnthropicClient, CHAT_MODEL } from "@/lib/anthropic";
import { VOICE_GUIDE } from "@/lib/voice-guide";
import { curriculumAsText } from "@/lib/curriculum";
import { BUSINESS_CONTEXT } from "@/lib/business-context";
import type Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

const FINALIZE_TOOL: Anthropic.Tool = {
  name: "finalize_session",
  description:
    "Call this ONLY once you have enough information to build a real, specific coaching session plan — not a generic one. Do not call it just because the conversation has gone a few turns; call it when you could hand these fields to someone else and they'd know exactly what this Tuesday/Thursday session is about.",
  input_schema: {
    type: "object",
    properties: {
      client_name: {
        type: "string",
        description: "Name of the client/operator this session is for.",
      },
      session_day: {
        type: "string",
        enum: ["Tuesday", "Thursday", "Other"],
        description: "Which recurring session this is.",
      },
      primary_topic: {
        type: "string",
        description:
          "The main thing this session needs to cover, in specific terms (e.g. 'client is stuck pricing a rev-share deal with a $200K/mo creator' not 'pricing').",
      },
      context: {
        type: "string",
        description:
          "Relevant background: what's happened recently, wins, blockers, where they are in the curriculum, anything Patrick should already know walking in.",
      },
      goals_for_session: {
        type: "string",
        description:
          "What a good outcome looks like by the end of this specific session.",
      },
      related_modules: {
        type: "array",
        items: { type: "string" },
        description:
          "Module numbers/titles from the curriculum that are relevant to reinforce (if any).",
      },
      slides_needed: {
        type: "boolean",
        description: "Whether this session needs a slide deck.",
      },
      slides_reason: {
        type: "string",
        description:
          "If slides are needed, what they should visually walk through (e.g. a framework, a pricing structure, a before/after).",
      },
    },
    required: [
      "client_name",
      "session_day",
      "primary_topic",
      "context",
      "goals_for_session",
      "slides_needed",
    ],
  },
};

function buildSystemPrompt() {
  return `
You are the session-prep assistant for Patrick, founder of Scale Your Offers.
Patrick runs live 1:1-style coaching calls with clients every Tuesday and
Thursday. Your job in THIS conversation is to help whoever is chatting with
you (Patrick or someone on his team) prep for an upcoming session by asking
sharp, specific questions — the way a great chief of staff would — until you
have enough to build a real plan.

Ask about things like: which client this is for, what's actually going on in
their business right now, what prompted this session, what a good outcome
looks like, and whether visuals/slides would help this time (most weeks they
won't — no presentation is the default, only ask if it's not obvious).

Rules:
- Ask ONE question at a time. Don't interrogate with a list of 5 questions at once.
- If the person gives you enough in their first message, don't force extra
  questions just to seem thorough — move straight to finalizing.
- Keep your own messages short and conversational, like a sharp colleague, not
  a form. You can use Patrick's voice/energy a little here too, but this part
  of the conversation is YOU talking to Patrick's team, not Patrick talking to
  a client — so keep it plain and efficient rather than performing the brand voice.
- Once you have: who the client is, the real topic/situation, what a good
  outcome looks like, and whether slides are needed — call finalize_session.
  Don't ask permission first, just call it.

Reference context — Patrick's curriculum (use to connect the session to
existing frameworks where relevant, don't force it):
${curriculumAsText()}

Reference context — what Scale Your Offers the agency actually does (use to
understand the business, not to pitch it to whoever you're talking to):
${BUSINESS_CONTEXT}

You are NOT writing the actual session plan in this conversation — that
happens after finalize_session is called, in a separate step. Here you are
only gathering context.
`.trim();
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = (await req.json()) as {
      messages: Anthropic.MessageParam[];
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "messages array is required" },
        { status: 400 }
      );
    }

    const anthropic = getAnthropicClient();

    const response = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 1024,
      system: buildSystemPrompt(),
      tools: [FINALIZE_TOOL],
      messages,
    });

    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === "text"
    );
    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    return NextResponse.json({
      reply: textBlocks.map((b) => b.text).join("\n").trim(),
      finalized: toolUse ? toolUse.input : null,
      rawAssistantContent: response.content, // needed to keep conversation history correct
    });
  } catch (err: any) {
    console.error("chat route error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Something went wrong" },
      { status: 500 }
    );
  }
}
