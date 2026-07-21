// Runs an agent config (built in the UI) through the same engine the CLI
// uses, and returns each step's result as JSON for the UI to render.
//
// A run can come back "waiting_for_input" instead of "done" if it hit a
// user_input step — there's no live process to keep paused between HTTP
// requests, so resuming means calling this route again with `resume`
// (the context built up so far, which step was waiting, and the answer).
//
// Note: this is a single request/response, not a stream — fine for a POC,
// but a multi-step run with several tool calls can take a while, and
// Vercel's serverless functions have execution time limits. See
// ROADMAP.md item 4 for the planned fix (background job / streaming).

import { NextRequest, NextResponse } from "next/server";
import { runAgent, type ResumeOptions } from "../../../src/engine";
import type { AgentConfig } from "../../../src/types";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    config: AgentConfig;
    input?: string;
    resume?: ResumeOptions;
  };
  const { config, input, resume } = body;

  if (!config?.steps?.length) {
    return NextResponse.json({ ok: false, error: "Agent has no steps." }, { status: 400 });
  }

  try {
    const result = await runAgent(config, input, resume);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 200 }
    );
  }
}
