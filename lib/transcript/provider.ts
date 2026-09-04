import type { NormalisedTranscript } from "./types";

/**
 * Every transcript provider adapter implements this. The orchestration
 * service (service.ts) only ever talks to this interface — it does not
 * know which concrete provider it is calling.
 *
 * Implementations must throw `TranscriptProviderError` (see types.ts) for
 * any failure, never return partial/undefined data, and never fall back to
 * speech-to-text.
 */
export interface TranscriptProvider {
  readonly name: NormalisedTranscript["provider"];
  fetchTranscript(videoId: string): Promise<NormalisedTranscript>;
}
