// Generates a draft agent step graph from a plain-English description, for
// the "Generate with AI" option in the builder UI. The result is returned
// as-is for the client to lay out on the canvas — nothing runs here.

import { NextRequest, NextResponse } from "next/server";
import { generateAgentDraft } from "../../../src/generateAgent";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { description } = await req.json();

  if (!description || typeof description !== "string") {
    return NextResponse.json({ ok: false, error: "Missing 'description'." }, { status: 400 });
  }

  try {
    const agent = await generateAgentDraft(description);
    return NextResponse.json({ ok: true, agent });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 200 }
    );
  }
}
