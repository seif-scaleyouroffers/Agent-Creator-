// Powers the "Create with AI" wizard's chat: one request per turn, carrying
// the whole conversation so far (no server-side session — same stateless
// pattern as /api/run-agent). Each reply may also carry a freshly proposed
// (or revised) agent draft and a log of any Google Sheet links checked along
// the way.

import { NextRequest, NextResponse } from "next/server";
import { runWizardTurn, type WizardMessage } from "../../../src/agentWizard";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { messages } = (await req.json()) as { messages?: WizardMessage[] };

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ ok: false, error: "Missing 'messages'." }, { status: 400 });
  }

  try {
    const result = await runWizardTurn(messages);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 200 }
    );
  }
}
