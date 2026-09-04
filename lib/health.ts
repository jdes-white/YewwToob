import { prisma } from "@/lib/db";
import { getAnthropicClient, ANALYSIS_MODEL } from "@/lib/anthropic";
import { FreeTranscriptApiProvider } from "@/lib/transcript/freeTranscriptApi";
import { SupadataProvider } from "@/lib/transcript/supadata";
import { TranscriptProviderError } from "@/lib/transcript/types";

export type HealthState = "CONNECTED" | "FAILED" | "NOT_CONFIGURED";

export interface HealthCheckResult {
  name: string;
  state: HealthState;
  detail: string;
  checkedAt: string;
}

/** Publicly known video with long-standing native captions — used only as a
 * connectivity probe for the two transcript providers, never persisted. */
const PROBE_VIDEO_ID = "dQw4w9WgXcQ";

export async function checkDatabase(): Promise<HealthCheckResult> {
  const checkedAt = new Date().toISOString();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { name: "Database", state: "CONNECTED", detail: "Neon Postgres reachable via Prisma", checkedAt };
  } catch (err) {
    return { name: "Database", state: "FAILED", detail: safeMessage(err), checkedAt };
  }
}

export async function checkAnthropic(): Promise<HealthCheckResult> {
  const checkedAt = new Date().toISOString();
  if (!process.env.ANTHROPIC_API_KEY) {
    return { name: "Anthropic", state: "NOT_CONFIGURED", detail: "ANTHROPIC_API_KEY not set", checkedAt };
  }
  try {
    const client = getAnthropicClient();
    await client.messages.create({
      model: ANALYSIS_MODEL,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    return { name: "Anthropic", state: "CONNECTED", detail: `Reached ${ANALYSIS_MODEL}`, checkedAt };
  } catch (err) {
    return { name: "Anthropic", state: "FAILED", detail: safeMessage(err), checkedAt };
  }
}

export async function checkFreeTranscriptApi(): Promise<HealthCheckResult> {
  const checkedAt = new Date().toISOString();
  if (!process.env.FREE_TRANSCRIPT_API_KEY) {
    return { name: "FreeTranscriptAPI", state: "NOT_CONFIGURED", detail: "FREE_TRANSCRIPT_API_KEY not set", checkedAt };
  }
  try {
    await new FreeTranscriptApiProvider().fetchTranscript(PROBE_VIDEO_ID);
    return { name: "FreeTranscriptAPI", state: "CONNECTED", detail: "Probe transcript fetched successfully", checkedAt };
  } catch (err) {
    return { name: "FreeTranscriptAPI", state: "FAILED", detail: safeMessage(err), checkedAt };
  }
}

export async function checkSupadata(): Promise<HealthCheckResult> {
  const checkedAt = new Date().toISOString();
  if (!process.env.SUPADATA_API_KEY) {
    return { name: "Supadata", state: "NOT_CONFIGURED", detail: "SUPADATA_API_KEY not set", checkedAt };
  }
  try {
    await new SupadataProvider().fetchTranscript(PROBE_VIDEO_ID);
    return { name: "Supadata", state: "CONNECTED", detail: "Probe transcript fetched successfully (native captions)", checkedAt };
  } catch (err) {
    return { name: "Supadata", state: "FAILED", detail: safeMessage(err), checkedAt };
  }
}

function safeMessage(err: unknown): string {
  if (err instanceof TranscriptProviderError) {
    return `${err.code}: ${err.message}`;
  }
  if (err instanceof Error) {
    // Strip anything that looks like it could be an Authorization header/key.
    return err.message.replace(/Bearer\s+\S+/gi, "Bearer <redacted>").slice(0, 300);
  }
  return "Unknown error";
}
