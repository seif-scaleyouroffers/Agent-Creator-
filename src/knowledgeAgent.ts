// The "Knowledge agent" type: unlike the step-graph engine, there's no graph
// at all here — just a standing chat grounded in a pasted knowledge base
// about one topic. Each turn resends the whole conversation (no server-side
// session, same stateless pattern as the rest of the app), but unlike the
// step-agent tester (which starts a fresh run per message), this genuinely
// keeps conversation memory turn to turn — that's the natural behavior for a
// chat assistant answering follow-up questions.

import Anthropic from "@anthropic-ai/sdk";
import { fetchResource, type ResourceResult } from "./tools/googleResources";

const anthropic = new Anthropic();

export interface KnowledgeChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ResourceCheck {
  url: string;
  ok: boolean;
  message: string;
}

function buildSystemPrompt(
  topic: string,
  knowledgeBase: string,
  instructions: string,
  toneReference: string,
  resources: ResourceResult[]
): string {
  const resourcesSection = resources.length
    ? `\nLinked resources (fetched live from the Google Docs/Sheets links provided — treat their content the same way you'd treat the pasted knowledge base, as either reference facts or process material depending on what they contain):\n${resources
        .map((r) =>
          r.ok
            ? `--- ${r.title ?? r.url} ---\n${r.text}`
            : `--- ${r.url} (couldn't load: ${r.message}) ---`
        )
        .join("\n\n")}\n`
    : "";

  const toneSection = toneReference
    ? `\nTone reference — sample copy showing the voice/style to write in. When you produce any generated content, mimic this voice (word choice, rhythm, level of formality) — but treat it purely as a style example, never as factual knowledge, and never quote or repeat it as if it were an answer to something:\n"""\n${toneReference}\n"""\n`
    : "";

  return `You are an assistant for "${topic || "this topic"}", operating entirely from the knowledge base below (and any linked resources/tone reference provided). The knowledge base may contain two different kinds of things, and you need to recognize which applies to a given conversation:

1. **Reference facts** — docs, FAQs, specs. When someone asks a question, answer using ONLY what's there — if it's not covered, say you don't have that information rather than guessing or using outside knowledge.
2. **A process, checklist, or template to follow** — e.g. steps for writing a job description, running through an intake checklist, drafting something in a specific format. When the knowledge base describes this kind of thing, actually DO it: ask for whatever information each step needs, and once you have enough, produce the actual deliverable it describes (a document, a draft, a recommendation) — don't just describe the process or refuse because the specific output isn't pre-written anywhere. Following the process and producing its output is the job, not "making things up."

How to run either kind of conversation: walk through it ONE step, question, or check at a time. Give the first thing, then stop and wait for their answer or what they found before continuing — don't dump the whole sequence, or the final deliverable, in one message unless they explicitly ask for everything up front.

Explain things in plain, simple language, the way you'd walk a beginner through it — regardless of whether the topic is technical.

Your replies are rendered as markdown, so use it where it genuinely helps: **bold** for emphasis, tables for structured comparisons (e.g. error codes and what they mean), code blocks for commands/URLs, numbered or bulleted lists for short sequences. Don't overuse formatting — plain sentences are fine when a list or table isn't actually clearer.
${instructions ? `\nAdditional instructions from whoever set you up: ${instructions}\n` : ""}${toneSection}${resourcesSection}
Knowledge base:
"""
${knowledgeBase}
"""`;
}

export interface KnowledgeChatResult {
  reply: string;
  resourceChecks: ResourceCheck[];
}

export async function runKnowledgeChat(
  topic: string,
  knowledgeBase: string,
  instructions: string,
  toneReference: string,
  resourceLinks: string,
  messages: KnowledgeChatMessage[],
  model = "claude-sonnet-5"
): Promise<KnowledgeChatResult> {
  const urls = resourceLinks
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const resources = await Promise.all(urls.map(fetchResource));

  const response = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    system: buildSystemPrompt(topic, knowledgeBase, instructions, toneReference, resources),
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    thinking: { type: "disabled" },
  } as Anthropic.MessageCreateParamsNonStreaming);

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );

  return {
    reply: textBlock?.text ?? "(no response)",
    resourceChecks: resources.map(({ url, ok, message }) => ({ url, ok, message })),
  };
}
