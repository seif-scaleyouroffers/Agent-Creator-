// Powers the Knowledge agent's chat: one request per turn, carrying the
// whole conversation plus the knowledge base/instructions/tone/resource
// links (no server-side session or persistence — same stateless pattern as
// the rest of the app).

import { NextRequest, NextResponse } from "next/server";
import { runKnowledgeChat, type KnowledgeChatMessage } from "../../../src/knowledgeAgent";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { topic, knowledgeBase, instructions, toneReference, resourceLinks, messages } =
    (await req.json()) as {
      topic?: string;
      knowledgeBase?: string;
      instructions?: string;
      toneReference?: string;
      resourceLinks?: string;
      messages?: KnowledgeChatMessage[];
    };

  if (!knowledgeBase || typeof knowledgeBase !== "string") {
    return NextResponse.json({ ok: false, error: "Missing 'knowledgeBase'." }, { status: 400 });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ ok: false, error: "Missing 'messages'." }, { status: 400 });
  }

  try {
    const result = await runKnowledgeChat(
      topic ?? "",
      knowledgeBase,
      instructions ?? "",
      toneReference ?? "",
      resourceLinks ?? "",
      messages
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 200 }
    );
  }
}
