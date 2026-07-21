// First tool integration: read/write rows in a Google Sheet via a service
// account. This is a template for future tools (Fathom, Slack, etc.) — each
// one just needs to export objects matching the `Tool` interface below.

import { google } from "googleapis";
import type { Tool } from "../types";

// Builds an authenticated Sheets client from service-account credentials in
// env vars. Using two separate env vars (rather than a JSON key file) is the
// simplest thing to paste into Vercel's environment variable settings later.
function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !rawKey) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY. " +
        "See .env.example for setup instructions."
    );
  }

  // Private keys in .env files store newlines as the literal characters
  // "\n" (real newlines break the key=value format), so they need unescaping.
  const privateKey = rawKey.replace(/\\n/g, "\n");

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

// Pulls the spreadsheet ID out of a full Google Sheets URL (the segment
// between "/d/" and the next "/"), so the UI can accept a pasted URL instead
// of requiring the user to hunt for the raw ID themselves.
export function extractSpreadsheetId(urlOrId: string): string | null {
  const match = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  // Also accept a bare ID (no URL) — IDs only ever contain these characters.
  if (/^[a-zA-Z0-9-_]+$/.test(urlOrId.trim())) return urlOrId.trim();
  return null;
}

// Used by the UI's "check connection" step: confirms the service account can
// actually see this spreadsheet (i.e. it's been shared with it) and reports
// back its title and tab names so the user gets real feedback, not a guess.
export async function checkSpreadsheetAccess(spreadsheetId: string) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "properties.title,sheets.properties.title",
  });
  return {
    title: res.data.properties?.title ?? "(untitled)",
    tabs: (res.data.sheets ?? []).map((s) => s.properties?.title ?? "(untitled tab)"),
  };
}

export const googleSheetsRead: Tool = {
  name: "google_sheets_read",
  description:
    "Reads a range of cells from a Google Sheet and returns the raw rows.",
  input_schema: {
    type: "object",
    properties: {
      spreadsheetId: {
        type: "string",
        description: "The ID of the spreadsheet to read from.",
      },
      range: {
        type: "string",
        description: "A1 notation range to read, e.g. 'Sheet1!A2:D100'.",
      },
    },
    required: ["spreadsheetId", "range"],
  },
  async run(params) {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: params.spreadsheetId as string,
      range: params.range as string,
    });
    return { rows: res.data.values ?? [] };
  },
};

export const googleSheetsWrite: Tool = {
  name: "google_sheets_write",
  description:
    "Writes rows of values into a Google Sheet starting at the given range.",
  input_schema: {
    type: "object",
    properties: {
      spreadsheetId: {
        type: "string",
        description: "The ID of the spreadsheet to write to.",
      },
      range: {
        type: "string",
        description: "A1 notation start range, e.g. 'Results!A1'.",
      },
      values: {
        type: "array",
        description:
          "Rows to write, each an array of cell values for that row.",
        items: {
          type: "array",
          items: { type: ["string", "number"] },
        },
      },
    },
    required: ["spreadsheetId", "range", "values"],
  },
  async run(params) {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.update({
      spreadsheetId: params.spreadsheetId as string,
      range: params.range as string,
      valueInputOption: "RAW",
      requestBody: { values: params.values as unknown[][] },
    });
    return {
      updatedRange: res.data.updatedRange,
      updatedCells: res.data.updatedCells,
    };
  },
};
