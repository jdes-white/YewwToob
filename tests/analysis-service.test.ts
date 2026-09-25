import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerate = vi.fn();

vi.mock("@/lib/llm/openai", () => ({
  OpenAiAnalysisProvider: class {
    name = "openai";
    generate = mockGenerate;
  },
}));

const fakeDb = {
  creator: {
    findUniqueOrThrow: vi.fn(),
  },
  videoAnalysis: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    upsert: vi.fn(),
  },
  video: {
    findUnique: vi.fn(),
  },
  importLog: {
    create: vi.fn(),
  },
};

vi.mock("@/lib/db", () => ({ prisma: fakeDb }));

const { analyzeVideo } = await import("@/lib/analysis/service");
const { AnalysisProviderError } = await import("@/lib/llm/types");

const VIDEO = { id: "video-1", creatorId: "creator-1" };

const VALID_JASON_OUTPUT = {
  overallMarket: {
    stance: "bullish",
    expectedDirection: "grinding higher",
    summary: "s",
    evidence: [],
    turningPoints: [],
    conditions: [],
    invalidation: [],
  },
  btc: { stance: "bullish", structure: "uptrend", summary: "s", keyLevels: [], conditions: [], invalidation: [] },
  eth: { stance: "neutral", structure: "range", summary: "s", keyLevels: [], conditions: [], invalidation: [] },
  otherMentions: [],
  materialChanges: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  fakeDb.creator.findUniqueOrThrow.mockResolvedValue({ id: "creator-1", analysisProfile: "jason_pizzino" });
  fakeDb.videoAnalysis.findFirst.mockResolvedValue(null);
  fakeDb.videoAnalysis.upsert.mockResolvedValue({ id: "analysis-1" });
  fakeDb.video.findUnique.mockResolvedValue({ youtubeUrl: "https://www.youtube.com/watch?v=abc12345678" });
});

describe("analyzeVideo — duplicate/cache prevention", () => {
  it("returns the stored analysis without calling the LLM provider when one already exists", async () => {
    fakeDb.videoAnalysis.findUnique.mockResolvedValue({ id: "existing-1", structuredJson: VALID_JASON_OUTPUT });

    const result = await analyzeVideo(VIDEO, "transcript text");

    expect(result).toEqual({ code: "SUCCESS", analysisId: "existing-1", structuredJson: VALID_JASON_OUTPUT, reused: true });
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(fakeDb.videoAnalysis.upsert).not.toHaveBeenCalled();
  });
});

describe("analyzeVideo — AI / malformed-response failure", () => {
  beforeEach(() => {
    fakeDb.videoAnalysis.findUnique.mockResolvedValue(null);
  });

  it("returns ANALYSIS_FAILED and logs it when the provider call rejects (network failure)", async () => {
    mockGenerate.mockRejectedValue(new AnalysisProviderError("OpenAI request failed: connection reset"));

    const result = await analyzeVideo(VIDEO, "transcript text");

    expect(result.code).toBe("ANALYSIS_FAILED");
    if (result.code === "ANALYSIS_FAILED") {
      expect(result.message).toContain("connection reset");
    }
    expect(fakeDb.videoAnalysis.upsert).not.toHaveBeenCalled();
    expect(fakeDb.importLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stage: "analysis", resultCode: "FAILED" }) }),
    );
  });

  it("returns ANALYSIS_FAILED when the provider rejects a malformed/incomplete response", async () => {
    // The OpenAI provider validates against the Zod schema internally (via zodTextFormat) and
    // rejects with AnalysisProviderError on a schema mismatch or an incomplete response — it
    // never returns unvalidated data to analyzeVideo. See lib/llm/openai.ts.
    mockGenerate.mockRejectedValue(new AnalysisProviderError("OpenAI did not return valid structured output (max_output_tokens)"));

    const result = await analyzeVideo(VIDEO, "transcript text");

    expect(result.code).toBe("ANALYSIS_FAILED");
    if (result.code === "ANALYSIS_FAILED") {
      expect(result.message).toContain("max_output_tokens");
    }
    expect(fakeDb.videoAnalysis.upsert).not.toHaveBeenCalled();
  });
});

describe("analyzeVideo — success path", () => {
  beforeEach(() => {
    fakeDb.videoAnalysis.findUnique.mockResolvedValue(null);
  });

  it("persists a well-formed provider response", async () => {
    mockGenerate.mockResolvedValue({ data: VALID_JASON_OUTPUT, model: "gpt-5.6-luna" });

    const result = await analyzeVideo(VIDEO, "transcript text");

    expect(result.code).toBe("SUCCESS");
    if (result.code === "SUCCESS") {
      expect(result.reused).toBe(false);
      expect(result.structuredJson).toEqual(VALID_JASON_OUTPUT);
    }
    expect(fakeDb.videoAnalysis.upsert).toHaveBeenCalledTimes(1);
    expect(fakeDb.videoAnalysis.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ model: "gpt-5.6-luna" }),
      }),
    );
  });
});
