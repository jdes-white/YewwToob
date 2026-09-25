import type { TranscriptProvider } from "./provider";
import type { NormalisedTranscript, NormalisedTranscriptSegment } from "./types";
import { TranscriptProviderError } from "./types";
import { fetchWithTimeout, providerHttpError } from "./httpError";

const PROVIDER_NAME = "FREE_TRANSCRIPT_API" as const;
const DEFAULT_BASE_URL = "https://api.freetranscriptapi.com/v1";

/**
 * Targets FreeTranscriptAPI.com — confirmed as a real, current product
 * (https://freetranscriptapi.com/, API at api.freetranscriptapi.com/v1/transcript)
 * with the request/response shape below verified against its own published
 * documentation and examples, though not against a live call from this
 * build environment (outbound access to freetranscriptapi.com is blocked
 * from this sandbox).
 *
 * Confirmed:
 *  - GET {base}/transcript?video_url=<url-or-bare-video-id>
 *  - No API key or signup required for the free tier (50 requests/hour/IP).
 *    An API key is optional — only sent if FREE_TRANSCRIPT_API_KEY is set,
 *    for the higher-limit authenticated tier.
 *  - Response includes `language`, `title`, and `transcript` fields.
 *
 * Not confirmed: the exact per-segment field names within `transcript`
 * (timestamp/text field spellings) — `extractSegments` below accepts
 * several plausible spellings defensively. If the real API differs, only
 * this file needs to change.
 */

function firstDefined<T>(...values: (T | undefined | null)[]): T | undefined {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function extractSegments(payload: unknown): NormalisedTranscriptSegment[] {
  const raw = (payload as Record<string, unknown>) ?? {};
  const list = firstDefined<unknown[]>(
    raw.transcript as unknown[],
    raw.segments as unknown[],
    raw.items as unknown[],
  );
  if (!Array.isArray(list)) return [];

  return list
    .map((entry): NormalisedTranscriptSegment | null => {
      const e = entry as Record<string, unknown>;
      const text = firstDefined<string>(e.text as string, e.content as string);
      const start = firstDefined<number>(e.start as number, e.startSeconds as number, e.offset as number);
      const duration = firstDefined<number>(e.duration as number, e.durationSeconds as number, e.dur as number);
      if (text === undefined || start === undefined) return null;
      return {
        text,
        startSeconds: start,
        durationSeconds: duration ?? 0,
      };
    })
    .filter((s): s is NormalisedTranscriptSegment => s !== null);
}

export class FreeTranscriptApiProvider implements TranscriptProvider {
  readonly name = PROVIDER_NAME;

  private get baseUrl(): string {
    return process.env.FREE_TRANSCRIPT_API_BASE_URL ?? DEFAULT_BASE_URL;
  }

  async fetchTranscript(videoId: string): Promise<NormalisedTranscript> {
    const url = new URL(`${this.baseUrl}/transcript`);
    url.searchParams.set("video_url", `https://www.youtube.com/watch?v=${videoId}`);

    const apiKey = process.env.FREE_TRANSCRIPT_API_KEY;
    const headers: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

    let response: Response;
    try {
      response = await fetchWithTimeout(url.toString(), { headers });
    } catch (err) {
      throw new TranscriptProviderError(
        "PROVIDER_DOWN",
        PROVIDER_NAME,
        `Network error contacting FreeTranscriptAPI: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }

    if (!response.ok) {
      const bodySnippet = await response.text().catch(() => "");
      if (response.status === 404 && /caption|transcript/i.test(bodySnippet)) {
        throw new TranscriptProviderError("NO_CAPTIONS", PROVIDER_NAME, "No transcript available for this video");
      }
      throw providerHttpError(PROVIDER_NAME, response.status, bodySnippet);
    }

    const payload = await response.json();
    const segments = extractSegments(payload);
    if (segments.length === 0) {
      throw new TranscriptProviderError("NO_CAPTIONS", PROVIDER_NAME, "Provider returned zero transcript segments");
    }

    const raw = payload as Record<string, unknown>;
    const language = firstDefined<string>(raw.language as string, raw.lang as string) ?? null;
    const title = firstDefined<string>(raw.title as string, raw.videoTitle as string) ?? null;
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
