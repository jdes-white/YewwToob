/**
 * Provider-independent transcript types. Nothing outside lib/transcript
 * should ever see a FreeTranscriptAPI or Supadata response shape directly —
 * adapters normalise into these before returning.
 */

export type TranscriptResultCode =
  | "SUCCESS"
  | "NO_CAPTIONS"
  | "VIDEO_NOT_FOUND"
  | "RATE_LIMITED"
  | "PROVIDER_DOWN"
  | "AUTH_ERROR"
  | "UNKNOWN_ERROR";

export type TranscriptProviderName = "FREE_TRANSCRIPT_API" | "SUPADATA";

export interface NormalisedTranscriptSegment {
  text: string;
  startSeconds: number;
  durationSeconds: number;
}

export interface NormalisedTranscript {
  videoId: string;
  language: string | null;
  title: string | null;
  segments: NormalisedTranscriptSegment[];
  fullText: string;
  provider: TranscriptProviderName;
}

export type TranscriptFetchResult =
  | { code: "SUCCESS"; transcript: NormalisedTranscript }
  | {
      code: Exclude<TranscriptResultCode, "SUCCESS">;
      provider: TranscriptProviderName;
      /** Privacy-safe diagnostic message — never includes API keys or raw payloads. */
      message: string;
    };

/**
 * A provider-independent reason a single provider call failed, used
 * internally by adapters and the orchestration service to decide whether
 * to fall back to the next provider.
 */
export class TranscriptProviderError extends Error {
  readonly code: Exclude<TranscriptResultCode, "SUCCESS">;
  readonly provider: TranscriptProviderName;

  constructor(code: Exclude<TranscriptResultCode, "SUCCESS">, provider: TranscriptProviderName, message: string) {
    super(message);
    this.name = "TranscriptProviderError";
    this.code = code;
    this.provider = provider;
  }
}
