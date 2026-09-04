import type { TranscriptProvider } from "./provider";
import type { NormalisedTranscript, NormalisedTranscriptSegment } from "./types";
import { TranscriptProviderError } from "./types";
import { fetchWithTimeout, providerHttpError } from "./httpError";

const PROVIDER_NAME = "SUPADATA" as const;
const DEFAULT_BASE_URL = "https://api.supadata.ai/v1";

/**
 * NOTE ON FIELD MAPPING: same caveat as freeTranscriptApi.ts — exact
 * response field names could not be verified against live docs from this
 * build environment. `extractSegments` accepts several plausible key
 * spellings, isolated entirely to this file.
 *
 * CRITICAL: `mode=native` is required on every request. Supadata's default
 * behaviour falls back to AI-generated transcription when a video has no
 * existing captions; the BUILD BRIEF explicitly forbids speech-to-text.
 * `mode=native` restricts Supadata to native/existing captions only, so a
 * caption-less video must surface as NO_CAPTIONS here rather than silently
 * producing an ASR transcript. Do not remove this parameter.
 */

function firstDefined<T>(...values: (T | undefined | null)[]): T | undefined {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

// Supadata reports offset/duration in milliseconds; normalise to seconds.
function toSeconds(value: number): number {
  return value / 1000;
}

function extractSegments(payload: unknown): NormalisedTranscriptSegment[] {
  const raw = (payload as Record<string, unknown>) ?? {};
  const list = firstDefined<unknown[]>(raw.content as unknown[], raw.segments as unknown[]);
  if (!Array.isArray(list)) return [];

  return list
    .map((entry): NormalisedTranscriptSegment | null => {
      const e = entry as Record<string, unknown>;
      const text = firstDefined<string>(e.text as string);
      const start = firstDefined<number>(e.offset as number, e.start as number);
      const duration = firstDefined<number>(e.duration as number);
      if (text === undefined || start === undefined) return null;
      return {
        text,
        startSeconds: toSeconds(start),
        durationSeconds: duration !== undefined ? toSeconds(duration) : 0,
      };
    })
    .filter((s): s is NormalisedTranscriptSegment => s !== null);
}

export class SupadataProvider implements TranscriptProvider {
  readonly name = PROVIDER_NAME;

  private get apiKey(): string {
    const key = process.env.SUPADATA_API_KEY;
    if (!key) {
      throw new TranscriptProviderError("AUTH_ERROR", PROVIDER_NAME, "SUPADATA_API_KEY is not configured");
    }
    return key;
  }

  private get baseUrl(): string {
    return process.env.SUPADATA_API_BASE_URL ?? DEFAULT_BASE_URL;
  }

  async fetchTranscript(videoId: string): Promise<NormalisedTranscript> {
    const url = new URL(`${this.baseUrl}/youtube/transcript`);
    url.searchParams.set("videoId", videoId);
    // Native captions only — never let Supadata fall back to AI transcription.
    url.searchParams.set("mode", "native");
    url.searchParams.set("text", "false");

    let response: Response;
    try {
      response = await fetchWithTimeout(url.toString(), {
        headers: { "x-api-key": this.apiKey },
      });
    } catch (err) {
      throw new TranscriptProviderError(
        "PROVIDER_DOWN",
        PROVIDER_NAME,
        `Network error contacting Supadata: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }

    if (!response.ok) {
      const bodySnippet = await response.text().catch(() => "");
      if (response.status === 404 || /no.*(caption|transcript)/i.test(bodySnippet)) {
        throw new TranscriptProviderError("NO_CAPTIONS", PROVIDER_NAME, "No native captions available for this video");
      }
      throw providerHttpError(PROVIDER_NAME, response.status, bodySnippet);
    }

    const payload = await response.json();
    const segments = extractSegments(payload);
    if (segments.length === 0) {
      throw new TranscriptProviderError("NO_CAPTIONS", PROVIDER_NAME, "Provider returned zero native-caption segments");
    }

    const raw = payload as Record<string, unknown>;
    const language = firstDefined<string>(raw.lang as string, raw.language as string) ?? null;
    const title = firstDefined<string>(raw.title as string) ?? null;
    const fullText = segments.map((s) => s.text).join(" ");

    return {
      videoId,
      language,
      title,
      segments,
      fullText,
      provider: PROVIDER_NAME,
    };
  }
}
