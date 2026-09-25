import { prisma } from "@/lib/db";
import OpenAI from "openai";
import { ANALYSIS_MODEL } from "@/lib/llm/openai";
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
    return { name: "Database", state: "CONNECTED", detail: "Postgres reachable via Prisma", checkedAt };
  } catch (err) {
    return { name: "Database", state: "FAILED", detail: safeMessage(err), checkedAt };
  }
}

export async function checkOpenAi(): Promise<HealthCheckResult> {
  const checkedAt = new Date().toISOString();
  if (!process.env.OPENAI_API_KEY) {
    return { name: "OpenAI", state: "NOT_CONFIGURED", detail: "OPENAI_API_KEY not set", checkedAt };
  }
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    await client.responses.create({
      model: ANALYSIS_MODEL,
      input: "ping",
      max_output_tokens: 16,
    });
    return { name: "OpenAI", state: "CONNECTED", detail: `Reached ${ANALYSIS_MODEL}`, checkedAt };
  } catch (err) {
    return { name: "OpenAI", state: "FAILED", detail: safeMessage(err), checkedAt };
  }
}

export async function checkFreeTranscriptApi(): Promise<HealthCheckResult> {
  const checkedAt = new Date().toISOString();
  try {
    await new FreeTranscriptApiProvider().fetchTranscript(PROBE_VIDEO_ID);
    const mode = process.env.FREE_TRANSCRIPT_API_KEY ? "authenticated" : "keyless free tier";
    return { name: "FreeTranscriptAPI", state: "CONNECTED", detail: `Probe transcript fetched successfully (${mode})`, checkedAt };
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
