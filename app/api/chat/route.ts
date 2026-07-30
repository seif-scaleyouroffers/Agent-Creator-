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
    "Call this as soon as you have a workable topic, audience/client, and rough goal — even if some fields need reasonable assumptions filled in. Bias toward calling this quickly (within 1-2 follow-up questions max) rather than gathering exhaustive detail. A usable plan fast beats a perfectly-scoped plan that took five turns.",
  input_schema: {
    type: "object",
    properties: {
      group_name: {
        type: "string",
        description:
          "Name/label for the group or cohort this session is for (e.g. 'Boardroom — Thursday Group', or a topic-based label like 'Growth Operators $1M+ Cohort' if there's no fixed name).",
      },
      session_day: {
        type: "string",
        enum: ["Tuesday", "Thursday", "Other"],
        description: "Which recurring session this is.",
      },
      primary_topic: {
        type: "string",
        description:
          "The main thing this session needs to cover, in specific terms (e.g. 'the group is stuck on how to renegotiate rev-share deals without losing income' not 'pricing').",
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
      "group_name",
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
Patrick runs live GROUP coaching calls with his Boardroom operators every
Tuesday and Thursday — not 1:1 sessions. Your job in THIS conversation is to
help whoever is chatting with you (Patrick or someone on his team) prep for
an upcoming session by asking sharp, specific questions — the way a great
chief of staff would — until you have enough to build a real plan.

Speed matters more than thoroughness here. This is Patrick's own prep tool,
not a client-facing intake form — the person using it is busy and wants a
usable plan fast, not a polished interview. Default to finalizing after ONE
follow-up question, two at the absolute most. A rough plan they can glance at
and mentally adjust beats a perfectly-scoped plan that took five round trips
to get to.

Rules:
- If the very first message already gives you a topic, a group/audience, and
  something like a goal — even loosely — call finalize_session immediately.
  Do not ask a clarifying question just because you technically could.
- If something important is genuinely missing (e.g. you have no idea what
  the topic even is), ask ONE question that covers as much ground as
  possible at once (it's fine to ask about two related things in the same
  message, e.g. "who's this for, and what's the goal by the end?") — do not
  spread that across multiple separate turns.
- Never ask more than 2 questions total before finalizing. After the 2nd
  answer, fill any remaining gaps with reasonable assumptions and call
  finalize_session — do not ask a 3rd question.
- Slides: assume NOT needed unless the person says otherwise or it's
  obviously a visual topic (e.g. a framework/structure/numbers walkthrough).
  Don't ask about slides as a separate question — just decide.
- Keep your own messages short and conversational, like a sharp colleague, not
  a form. You can use Patrick's voice/energy a little here too, but this part
  of the conversation is YOU talking to Patrick's team, not Patrick talking to
  the group — so keep it plain and efficient rather than performing the brand voice.

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
      rawAssistantContent: response.content,
    });
  } catch (err: any) {
    console.error("chat route error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Something went wrong" },
      { status: 500 }
    );
  }
}
