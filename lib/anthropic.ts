import Anthropic from "@anthropic-ai/sdk";

/**
 * Cheapest model that reliably completes structured extraction, per the
 * BUILD BRIEF's cost-control directive. Override via env for experimentation
 * without a code change.
 */
export const ANALYSIS_MODEL = process.env.ANTHROPIC_ANALYSIS_MODEL ?? "claude-haiku-4-5-20251001";

let client: Anthropic | undefined;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}
