import { NextRequest, NextResponse } from "next/server";
import { getAnthropicClient, DRAFTING_MODEL } from "@/lib/anthropic";
import { VOICE_GUIDE } from "@/lib/voice-guide";
import { curriculumAsText } from "@/lib/curriculum";
import { BUSINESS_CONTEXT } from "@/lib/business-context";

export const runtime = "nodejs";

export interface FinalizedSession {
  group_name: string;
  session_day: string;
  primary_topic: string;
  context: string;
  goals_for_session: string;
  related_modules?: string[];
  slides_needed: boolean;
  slides_reason?: string;
}

const GENERATE_TOOL = {
  name: "return_session_output",
  description:
    "Return the finished session plan, and slides if they were requested.",
  input_schema: {
    type: "object" as const,
    properties: {
      plan_markdown: {
        type: "string" as const,
        description:
          "The full session talking-points plan, in markdown. Should read like Patrick's own prep notes for the call: a short framing of the situation, the key points to hit in order, questions to ask the group, and how to land the session (the next action for the group).",
      },
      slides: {
        type: "array" as const,
        description:
          "Only include if slides were requested. One entry per slide.",
        items: {
          type: "object" as const,
          properties: {
            title: { type: "string" as const },
            bullets: {
              type: "array" as const,
              items: { type: "string" as const },
            },
            speaker_note: {
              type: "string" as const,
              description:
                "One or two lines, in Patrick's voice, on what to say while this slide is up.",
            },
          },
          required: ["title", "bullets"],
        },
      },
    },
    required: ["plan_markdown"],
  },
};

function buildSystemPrompt(session: FinalizedSession) {
  return `
${VOICE_GUIDE}

---

You are drafting PATRICK'S OWN PREP NOTES for a live GROUP coaching call he is
about to run himself. This is not a document for the group to read — it's
what Patrick glances at right before and during the call to make sure he
hits the right points. Write it like his internal notes: direct, in his
voice, and genuinely useful to have open during the call — not a polished
handout.

Curriculum reference (connect to it only where it's actually relevant):
${curriculumAsText()}

${BUSINESS_CONTEXT}

Session details:
- Group: ${session.group_name}
- Day: ${session.session_day}
- Topic: ${session.primary_topic}
- Context: ${session.context}
- Goal for this session: ${session.goals_for_session}
- Related modules: ${(session.related_modules ?? []).join(", ") || "none specified"}
- Slides needed: ${session.slides_needed ? "yes" : "no"}
${session.slides_needed ? `- What the slides should walk through: ${session.slides_reason ?? "not specified — use your judgment"}` : ""}

Structure the plan_markdown roughly like this (adapt as needed, don't force
headers that don't fit):
## Where things stand
## What to hit today (in order)
## Questions to ask the group
## How to land it (the one clear next action for the group)

${
  session.slides_needed
    ? "Also produce a short slide deck (4-8 slides) that visually supports the framework or structure being taught — simple, not decorative. Each slide needs a title, a few short bullets (not paragraphs), and a one-line speaker note in Patrick's voice."
    : "Do not produce slides — none were requested."
}

Call return_session_output with the result. Do not include any other commentary.
`.trim();
}

export async function POST(req: NextRequest) {
  try {
    const session = (await req.json()) as FinalizedSession;

    if (!session?.group_name || !session?.primary_topic) {
      return NextResponse.json(
        { error: "Missing required session fields" },
        { status: 400 }
      );
    }

    const anthropic = getAnthropicClient();

    const response = await anthropic.messages.create({
      model: DRAFTING_MODEL,
      max_tokens: 4096,
      system: buildSystemPrompt(session),
      tools: [GENERATE_TOOL],
      tool_choice: { type: "tool", name: "return_session_output" },
      messages: [
        {
          role: "user",
          content:
            "Generate the session plan (and slides if requested) now, based on the system instructions.",
        },
      ],
    });

    const toolUse = response.content.find(
      (b): b is any => b.type === "tool_use"
    );

    if (!toolUse) {
      return NextResponse.json(
        { error: "Model did not return structured output" },
        { status: 502 }
      );
    }

    return NextResponse.json(toolUse.input);
  } catch (err: any) {
    console.error("generate route error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Something went wrong" },
      { status: 500 }
    );
  }
}
