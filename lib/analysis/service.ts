import { prisma } from "@/lib/db";
import { getAnthropicClient, ANALYSIS_MODEL } from "@/lib/anthropic";
import { getAnalysisProfile, PROMPT_VERSION } from "./profiles";

export type AnalysisFetchResult =
  | { code: "SUCCESS"; analysisId: string; structuredJson: unknown; reused: boolean }
  | { code: "ANALYSIS_FAILED"; message: string };

const MAX_TRANSCRIPT_CHARS = 150_000;
const TOOL_NAME = "record_analysis";

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
  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: ANALYSIS_MODEL,
      max_tokens: 4096,
      system: profile.systemPrompt,
      tools: [
        {
          name: TOOL_NAME,
          description: `Record the structured analysis. Match this shape exactly:\n${profile.outputShape}`,
          input_schema: profile.toolInputSchema as never,
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [{ role: "user", content: userMessage }],
    });

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      await logAnalysisAttempt(video.id, "FAILED", "Model did not return a tool_use block", Date.now() - startedAt);
      return { code: "ANALYSIS_FAILED", message: "Model did not return structured output" };
    }
    structuredJson = toolUse.input;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Anthropic API error";
    await logAnalysisAttempt(video.id, "FAILED", message, Date.now() - startedAt);
    return { code: "ANALYSIS_FAILED", message };
  }

  const validation = profile.schema.safeParse(structuredJson);
  if (!validation.success) {
    const message = `Schema validation failed: ${validation.error.issues.map((i) => i.message).join("; ")}`;
    await logAnalysisAttempt(video.id, "FAILED", message, Date.now() - startedAt);
    return { code: "ANALYSIS_FAILED", message };
  }

  const saved = await prisma.videoAnalysis.upsert({
    where: { videoId_analysisType: { videoId: video.id, analysisType: profile.analysisType } },
    create: {
      videoId: video.id,
      analysisType: profile.analysisType,
      structuredJson: JSON.parse(JSON.stringify(validation.data)),
      model: ANALYSIS_MODEL,
      promptVersion: PROMPT_VERSION,
    },
    update: {
      structuredJson: JSON.parse(JSON.stringify(validation.data)),
      model: ANALYSIS_MODEL,
      promptVersion: PROMPT_VERSION,
    },
  });

  await logAnalysisAttempt(video.id, "SUCCESS", null, Date.now() - startedAt);
  return { code: "SUCCESS", analysisId: saved.id, structuredJson: validation.data, reused: false };
}

async function logAnalysisAttempt(videoId: string, resultCode: "SUCCESS" | "FAILED", errorMessage: string | null, durationMs: number): Promise<void> {
  const video = await prisma.video.findUnique({ where: { id: videoId }, select: { youtubeUrl: true } });
  await prisma.importLog.create({
    data: {
      videoId,
      youtubeUrl: video?.youtubeUrl ?? "",
      stage: "analysis",
      provider: ANALYSIS_MODEL,
      resultCode,
      errorMessage,
      durationMs,
    },
  });
}
