// Rewrites rough, typed-in-a-hurry text into something clearer for the
// agent it's going into — used by the "Clean up with AI" button under each
// prompt/instructions/question field in the builder.

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export type RefineKind = "agent_prompt" | "branch_instructions" | "user_input_question";

const INSTRUCTIONS: Record<RefineKind, string> = {
  agent_prompt:
    "Rewrite the following into a clear, direct instruction for an AI agent step to follow. " +
    "Preserve any {{step_id.output}} or {{user_input.output}} placeholders exactly as written — " +
    "do not alter, remove, or invent new ones. Return ONLY the rewritten prompt text, nothing else.",
  branch_instructions:
    "Rewrite the following into clear, concise classification instructions for an AI that must " +
    "choose between a fixed set of labeled cases. Return ONLY the rewritten instructions, nothing else.",
  user_input_question:
    "Rewrite the following into a clear, concise question or confirmation message to show a human " +
    "user. Preserve any {{step_id.output}} placeholders exactly as written. Return ONLY the " +
    "rewritten text, nothing else.",
};

export async function refineText(
  text: string,
  kind: RefineKind,
  model = "claude-sonnet-5"
): Promise<string> {
  const instructions = INSTRUCTIONS[kind] ?? INSTRUCTIONS.agent_prompt;
  const response = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    messages: [{ role: "user", content: `${instructions}\n\nText to rewrite:\n${text}` }],
    thinking: { type: "disabled" },
  } as Anthropic.MessageCreateParamsNonStreaming);

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );
  return (textBlock?.text ?? text).trim();
}
