import { prisma } from "@/lib/db";
import { OpenAiAnalysisProvider } from "@/lib/llm/openai";
import { AnalysisProviderError } from "@/lib/llm/types";
import { getAnalysisProfile, PROMPT_VERSION } from "./profiles";

export type AnalysisFetchResult =
  | { code: "SUCCESS"; analysisId: string; structuredJson: unknown; reused: boolean }
  | { code: "ANALYSIS_FAILED"; message: string };

const MAX_TRANSCRIPT_CHARS = 150_000;

/**
 * The active structured-analysis provider. Swapping providers (this project
 * already did once, Anthropic -> OpenAI) means changing this one line plus
 * adding a lib/llm/<provider>.ts implementing StructuredAnalysisProvider —
 * nothing else in this file, or in lib/analysis/profiles.ts or schemas.ts,
 * needs to change.
 */
const analysisProvider = new OpenAiAnalysisProvider();

async function loadPriorViewContext(creatorId: string, analysisType: string, excludeVideoId: string): Promise<string | null> {
  const prior = await prisma.videoAnalysis.findFirst({
    where: { analysisType, video: { creatorId, id: { not: excludeVideoId } } },
    orderBy: { createdAt: "desc" },
  });
  if (!prior) return null;
  return JSON.stringify(prior.structuredJson);
}

/**
 * Runs the single structured-extraction LLM call for a video and persists
 * the validated result. Caches by default — a video with an existing
 * VideoAnalysis row for this profile is returned as-is unless `force` is
 * set, which is reserved for the diagnostics "Reanalyse" action.
 */
export async function analyzeVideo(
  video: { id: string; creatorId: string },
  transcriptFullText: string,
  options: { force?: boolean } = {},
): Promise<AnalysisFetchResult> {
  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: video.creatorId } });
  const profile = getAnalysisProfile(creator.analysisProfile);

  if (!options.force) {
    const existing = await prisma.videoAnalysis.findUnique({
      where: { videoId_analysisType: { videoId: video.id, analysisType: profile.analysisType } },
    });
    if (existing) {
      return { code: "SUCCESS", analysisId: existing.id, structuredJson: existing.structuredJson, reused: true };
    }
  }

  const priorViewJson = await loadPriorViewContext(video.creatorId, profile.analysisType, video.id);
  const truncated = transcriptFullText.length > MAX_TRANSCRIPT_CHARS;
  const transcriptForPrompt = truncated ? transcriptFullText.slice(0, MAX_TRANSCRIPT_CHARS) : transcriptFullText;

  const userMessage = [
    priorViewJson
      ? `Previously stored view for this creator (for computing materialChanges):\n${priorViewJson}\n`
      : "No previously stored view exists for this creator yet — materialChanges should be an empty array.\n",
    truncated ? "NOTE: transcript was truncated to fit context limits.\n" : "",
    "Transcript:\n",
    transcriptForPrompt,
  ].join("\n");

  const startedAt = Date.now();
  let structuredJson: unknown;
  let modelUsed: string;
  try {
    const result = await analysisProvider.generate({
      systemPrompt: profile.systemPrompt,
      userMessage,
      schema: profile.schema,
      schemaName: profile.schemaName,
    });
    structuredJson = result.data;
    modelUsed = result.model;
  } catch (err) {
    const message = err instanceof AnalysisProviderError || err instanceof Error ? err.message : "Unknown analysis provider error";
    await logAnalysisAttempt(video.id, "FAILED", message, Date.now() - startedAt);
    return { code: "ANALYSIS_FAILED", message };
  }

  const saved = await prisma.videoAnalysis.upsert({
    where: { videoId_analysisType: { videoId: video.id, analysisType: profile.analysisType } },
    create: {
      videoId: video.id,
      analysisType: profile.analysisType,
      structuredJson: JSON.parse(JSON.stringify(structuredJson)),
      model: modelUsed,
      promptVersion: PROMPT_VERSION,
    },
    update: {
      structuredJson: JSON.parse(JSON.stringify(structuredJson)),
      model: modelUsed,
      promptVersion: PROMPT_VERSION,
    },
  });

  await logAnalysisAttempt(video.id, "SUCCESS", null, Date.now() - startedAt);
  return { code: "SUCCESS", analysisId: saved.id, structuredJson, reused: false };
}

async function logAnalysisAttempt(videoId: string, resultCode: "SUCCESS" | "FAILED", errorMessage: string | null, durationMs: number): Promise<void> {
  const video = await prisma.video.findUnique({ where: { id: videoId }, select: { youtubeUrl: true } });
  await prisma.importLog.create({
    data: {
      videoId,
      youtubeUrl: video?.youtubeUrl ?? "",
      stage: "analysis",
      provider: analysisProvider.name,
      resultCode,
      errorMessage,
      durationMs,
    },
  });
}
