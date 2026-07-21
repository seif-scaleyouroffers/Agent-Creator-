// Validates a pasted Google Sheets URL: extracts the spreadsheet ID and
// confirms the service account can actually see it (i.e. it's been shared).
// This is what powers the "paste a sheet URL and see if it works" step in
// the agent builder UI.

import { NextRequest, NextResponse } from "next/server";
import { extractSpreadsheetId, checkSpreadsheetAccess } from "../../../../src/tools/googleSheets";

export async function POST(req: NextRequest) {
  const { url } = await req.json();

  if (!url || typeof url !== "string") {
    return NextResponse.json({ ok: false, error: "Missing 'url'." }, { status: 400 });
  }

  const spreadsheetId = extractSpreadsheetId(url);
  if (!spreadsheetId) {
    return NextResponse.json(
      { ok: false, error: "Couldn't find a spreadsheet ID in that URL." },
      { status: 400 }
    );
  }

  try {
    const info = await checkSpreadsheetAccess(spreadsheetId);
    return NextResponse.json({ ok: true, spreadsheetId, ...info });
  } catch (err: unknown) {
    const status = (err as { code?: number })?.code;
    const message =
      status === 403 || status === 404
        ? "Can't access this sheet — make sure it's shared with the service account's email (Editor access)."
        : `Google Sheets error: ${err instanceof Error ? err.message : String(err)}`;
    return NextResponse.json({ ok: false, spreadsheetId, error: message }, { status: 200 });
  }
}
