import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Add it in your Vercel project's Environment Variables."
      );
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

// Central place to change models for the whole app.
export const CHAT_MODEL = "claude-sonnet-4-6";
export const DRAFTING_MODEL = "claude-sonnet-4-6";
