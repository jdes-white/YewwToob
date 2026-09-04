import { prisma } from "@/lib/db";
import { FreeTranscriptApiProvider } from "./freeTranscriptApi";
import { SupadataProvider } from "./supadata";
import type { TranscriptProvider } from "./provider";
import type { NormalisedTranscript, TranscriptFetchResult, TranscriptResultCode, TranscriptProviderName } from "./types";
import { TranscriptProviderError } from "./types";

/**
 * Providers are tried in order. FreeTranscriptAPI is primary; Supadata
 * (native captions only — see supadata.ts) is the fallback. The rest of the
 * app calls only `getTranscript` and never imports a provider adapter
 * directly.
 */
const PROVIDERS: TranscriptProvider[] = [new FreeTranscriptApiProvider(), new SupadataProvider()];

interface VideoRef {
  id: string;
  youtubeVideoId: string;
}

async function loadStoredTranscript(video: VideoRef): Promise<NormalisedTranscript | null> {
  const stored = await prisma.transcript.findUnique({
    where: { videoId: video.id },
    include: { segments: { orderBy: { index: "asc" } }, video: true },
  });
  if (!stored) return null;

  return {
    videoId: video.youtubeVideoId,
    language: stored.language,
    title: stored.video.title,
    segments: stored.segments.map((s) => ({
      text: s.text,
      startSeconds: s.startSeconds,
      durationSeconds: s.durationSeconds,
    })),
    fullText: stored.fullText,
    provider: stored.provider,
  };
}

async function persistTranscript(dbVideoId: string, transcript: NormalisedTranscript): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const created = await tx.transcript.upsert({
      where: { videoId: dbVideoId },
      create: {
        videoId: dbVideoId,
        language: transcript.language,
        fullText: transcript.fullText,
        provider: transcript.provider,
      },
      update: {
        language: transcript.language,
        fullText: transcript.fullText,
        provider: transcript.provider,
      },
    });

    await tx.transcriptSegment.deleteMany({ where: { transcriptId: created.id } });
    if (transcript.segments.length > 0) {
      await tx.transcriptSegment.createMany({
        data: transcript.segments.map((s, index) => ({
          transcriptId: created.id,
          text: s.text,
          startSeconds: s.startSeconds,
          durationSeconds: s.durationSeconds,
          index,
        })),
      });
    }

    if (transcript.title) {
      await tx.video.update({ where: { id: dbVideoId }, data: { title: transcript.title } });
    }
  });
}

function toProviderError(err: unknown, provider: TranscriptProviderName): TranscriptProviderError {
  if (err instanceof TranscriptProviderError) return err;
  const message = err instanceof Error ? err.message : "Unknown provider error";
  return new TranscriptProviderError("UNKNOWN_ERROR", provider, message);
}

async function logAttempt(
  videoId: string,
  provider: string | null,
  resultCode: TranscriptResultCode | "UNKNOWN_ERROR",
  errorMessage: string | null,
  durationMs: number,
  youtubeUrl: string,
): Promise<void> {
  await prisma.importLog.create({
    data: {
      videoId,
      youtubeUrl,
      stage: "transcript",
      provider,
      resultCode,
      errorMessage,
      durationMs,
    },
  });
}

/**
 * Provider-independent transcript retrieval. Callers never learn which
 * provider served the transcript except via the informational `provider`
 * field on the result — behaviour never branches on it outside this file.
 *
 * Flow: check DB -> return if present -> try providers in order, persisting
 * on first success -> typed failure if every provider fails. Never falls
 * back to speech-to-text.
 */
export async function getTranscript(video: VideoRef, youtubeUrl: string): Promise<TranscriptFetchResult> {
  const existing = await loadStoredTranscript(video);
  if (existing) {
    return { code: "SUCCESS", transcript: existing };
  }

  let lastFailure: { code: Exclude<TranscriptResultCode, "SUCCESS">; provider: TranscriptProviderName; message: string } | null = null;

  for (const provider of PROVIDERS) {
    const startedAt = Date.now();
    try {
      const transcript = await provider.fetchTranscript(video.youtubeVideoId);
      await logAttempt(video.id, provider.name, "SUCCESS", null, Date.now() - startedAt, youtubeUrl);
      await persistTranscript(video.id, transcript);
      return { code: "SUCCESS", transcript };
    } catch (err) {
      const providerError = toProviderError(err, provider.name);
      await logAttempt(video.id, provider.name, providerError.code, providerError.message, Date.now() - startedAt, youtubeUrl);
      lastFailure = { code: providerError.code, provider: provider.name, message: providerError.message };
    }
  }

  if (!lastFailure) {
    // Unreachable unless PROVIDERS is empty.
    return { code: "UNKNOWN_ERROR", provider: "FREE_TRANSCRIPT_API", message: "No transcript providers configured" };
  }
  return lastFailure;
}
