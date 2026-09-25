import { prisma } from "@/lib/db";
import { parseYoutubeUrl } from "@/lib/youtube";
import { getTranscript } from "@/lib/transcript/service";
import { analyzeVideo } from "@/lib/analysis/service";
import type { Video } from "@/generated/prisma/client";

export type ImportResult =
  | { code: "OK"; video: Video; transcriptReused: boolean; analysisReused: boolean }
  | { code: "INVALID_URL"; message: string }
  | { code: "CREATOR_NOT_FOUND"; message: string }
  | { code: "TRANSCRIPT_FAILED"; message: string; video: Video }
  | { code: "ANALYSIS_FAILED"; message: string; video: Video };

/**
 * End-to-end pipeline: YouTube URL -> normalise/validate -> upsert Video
 * (duplicate-safe on youtubeVideoId) -> getTranscript -> analyzeVideo.
 * Both getTranscript and analyzeVideo are themselves idempotent (return the
 * stored result if one already exists), so re-importing the same URL is
 * cheap and makes no redundant transcript-provider or LLM calls.
 */
export async function importVideo(creatorSlug: string, rawUrl: string): Promise<ImportResult> {
  const parsed = parseYoutubeUrl(rawUrl);
  if (!parsed.ok) {
    return { code: "INVALID_URL", message: `Could not extract a YouTube video ID (${parsed.reason})` };
  }

  const creator = await prisma.creator.findUnique({ where: { slug: creatorSlug } });
  if (!creator) {
    return { code: "CREATOR_NOT_FOUND", message: `No creator with slug "${creatorSlug}"` };
  }

  let video = await prisma.video.findUnique({ where: { youtubeVideoId: parsed.videoId } });
  if (!video) {
    video = await prisma.video.create({
      data: {
        creatorId: creator.id,
        youtubeUrl: parsed.normalisedUrl,
        youtubeVideoId: parsed.videoId,
        processingStatus: "IMPORTED",
      },
    });
  }

  const hadTranscriptAlready = video.processingStatus !== "IMPORTED" && video.processingStatus !== "TRANSCRIPT_FAILED";

  video = await prisma.video.update({ where: { id: video.id }, data: { processingStatus: "FETCHING_TRANSCRIPT" } });

  const transcriptResult = await getTranscript({ id: video.id, youtubeVideoId: video.youtubeVideoId }, video.youtubeUrl);

  if (transcriptResult.code !== "SUCCESS") {
    video = await prisma.video.update({
      where: { id: video.id },
      data: {
        processingStatus: "TRANSCRIPT_FAILED",
        lastErrorCode: transcriptResult.code,
        lastErrorMessage: transcriptResult.message,
      },
    });
    return { code: "TRANSCRIPT_FAILED", message: transcriptResult.message, video };
  }

  video = await prisma.video.update({
    where: { id: video.id },
    data: {
      processingStatus: "ANALYSING",
      transcriptProvider: transcriptResult.transcript.provider,
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });

  const analysisResult = await analyzeVideo({ id: video.id, creatorId: video.creatorId }, transcriptResult.transcript.fullText);

  if (analysisResult.code !== "SUCCESS") {
    video = await prisma.video.update({
      where: { id: video.id },
      data: {
        processingStatus: "ANALYSIS_FAILED",
        lastErrorCode: "ANALYSIS_FAILED",
        lastErrorMessage: analysisResult.message,
      },
    });
    return { code: "ANALYSIS_FAILED", message: analysisResult.message, video };
  }

  video = await prisma.video.update({
    where: { id: video.id },
    data: { processingStatus: "READY", lastErrorCode: null, lastErrorMessage: null },
  });

  return { code: "OK", video, transcriptReused: hadTranscriptAlready, analysisReused: analysisResult.reused };
}
