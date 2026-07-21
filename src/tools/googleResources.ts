// Fetches read-only content from Google Docs/Sheets links pasted as
// "resources" for the Knowledge agent, so their content is pulled into the
// conversation automatically instead of being copy-pasted by hand. Same
// service-account pattern as googleSheets.ts, but its own read-only-scoped
// auth client — this is purely for grounding a prompt, never for writing.

import { google } from "googleapis";
import { extractSpreadsheetId } from "./googleSheets";

// Long enough to be genuinely useful context, short enough not to blow past
// a reasonable prompt size if someone links a big doc or sheet.
const MAX_RESOURCE_CHARS = 12000;

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !rawKey) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY. " +
        "See .env.example for setup instructions."
    );
  }

  const privateKey = rawKey.replace(/\\n/g, "\n");
  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes: [
      "https://www.googleapis.com/auth/documents.readonly",
      "https://www.googleapis.com/auth/spreadsheets.readonly",
    ],
  });
}

function extractDocId(urlOrId: string): string | null {
  const match = urlOrId.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9-_]+$/.test(urlOrId.trim())) return urlOrId.trim();
  return null;
}

function truncate(text: string): string {
  return text.length > MAX_RESOURCE_CHARS ? `${text.slice(0, MAX_RESOURCE_CHARS)}\n...(truncated)` : text;
}

function accessErrorMessage(err: unknown): string {
  const status = (err as { code?: number })?.code;
  return status === 403 || status === 404
    ? "Can't access this — make sure it's shared with the service account's email (Viewer access is enough)."
    : `Google error: ${err instanceof Error ? err.message : String(err)}`;
}

export interface ResourceResult {
  url: string;
  ok: boolean;
  message: string;
  title?: string;
  text?: string; // present only when ok — fetched content, truncated
}

interface DocParagraphElement {
  textRun?: { content?: string };
}
interface DocContentElement {
  paragraph?: { elements?: DocParagraphElement[] };
}

// Flattens a Doc's structural content into plain text — good enough to
// ground a prompt, not a faithful re-render of headings/formatting.
function flattenDocText(content: DocContentElement[]): string {
  const lines: string[] = [];
  for (const el of content) {
    const text = (el.paragraph?.elements ?? []).map((e) => e.textRun?.content ?? "").join("");
    if (text.trim()) lines.push(text.replace(/\n$/, ""));
  }
  return lines.join("\n");
}

async function fetchDoc(url: string): Promise<ResourceResult> {
  const docId = extractDocId(url);
  if (!docId) return { url, ok: false, message: "Couldn't find a document ID in that URL." };
  try {
    const docs = google.docs({ version: "v1", auth: getAuth() });
    const res = await docs.documents.get({ documentId: docId });
    const text = flattenDocText((res.data.body?.content ?? []) as DocContentElement[]);
    return {
      url,
      ok: true,
      message: `Connected: "${res.data.title}"`,
      title: res.data.title ?? undefined,
      text: truncate(text),
    };
  } catch (err) {
    return { url, ok: false, message: accessErrorMessage(err) };
  }
}

async function fetchSheet(url: string): Promise<ResourceResult> {
  const spreadsheetId = extractSpreadsheetId(url);
  if (!spreadsheetId) return { url, ok: false, message: "Couldn't find a spreadsheet ID in that URL." };
  try {
    const sheets = google.sheets({ version: "v4", auth: getAuth() });
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "properties.title,sheets.properties.title",
    });
    const title = meta.data.properties?.title ?? "(untitled)";
    const firstTab = meta.data.sheets?.[0]?.properties?.title;
    if (!firstTab) return { url, ok: false, message: `Connected to "${title}" but it has no tabs.` };

    const values = await sheets.spreadsheets.values.get({ spreadsheetId, range: firstTab });
    const rows = values.data.values ?? [];
    const text = rows.map((r) => r.join("\t")).join("\n");
    return {
      url,
      ok: true,
      message: `Connected: "${title}" (tab: ${firstTab})`,
      title,
      text: truncate(text),
    };
  } catch (err) {
    return { url, ok: false, message: accessErrorMessage(err) };
  }
}

export async function fetchResource(url: string): Promise<ResourceResult> {
  if (/\/document\/d\//.test(url)) return fetchDoc(url);
  if (/\/spreadsheets\/d\//.test(url)) return fetchSheet(url);
  return { url, ok: false, message: "Only Google Docs and Google Sheets links are supported." };
}
