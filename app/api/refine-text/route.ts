// Powers the "Clean up with AI" button under a step's prompt/instructions/
// question field: takes whatever rough text was typed and asks Claude to
// tighten it into something clearer for that specific kind of field.

import { NextRequest, NextResponse } from "next/server";
import { refineText, type RefineKind } from "../../../src/refineText";

export async function POST(req: NextRequest) {
  const { text, kind } = (await req.json()) as { text?: string; kind?: RefineKind };

  if (!text || typeof text !== "string") {
    return NextResponse.json({ ok: false, error: "Missing 'text'." }, { status: 400 });
  }

  try {
    const refined = await refineText(text, kind ?? "agent_prompt");
    return NextResponse.json({ ok: true, text: refined });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 200 }
    );
  }
}
