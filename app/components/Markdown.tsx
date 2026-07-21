"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Renders chat message text as actual markdown — bold, tables, code blocks,
// numbered/bulleted lists — instead of raw text. Both the wizard and
// knowledge-agent system prompts are told these render properly, so a
// response with e.g. a table of error codes shows as a real table instead of
// literal "|" and "-" characters.
export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
