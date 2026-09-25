import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();

vi.mock("@/lib/anthropic", () => ({
  getAnthropicClient: () => ({ messages: { create: mockCreate } }),
  ANALYSIS_MODEL: "claude-haiku-test",
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
  it("returns the stored analysis without calling Anthropic when one already exists", async () => {
    fakeDb.videoAnalysis.findUnique.mockResolvedValue({ id: "existing-1", structuredJson: VALID_JASON_OUTPUT });

    const result = await analyzeVideo(VIDEO, "transcript text");

    expect(result).toEqual({ code: "SUCCESS", analysisId: "existing-1", structuredJson: VALID_JASON_OUTPUT, reused: true });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(fakeDb.videoAnalysis.upsert).not.toHaveBeenCalled();
  });
});

describe("analyzeVideo — AI failure", () => {
  beforeEach(() => {
    fakeDb.videoAnalysis.findUnique.mockResolvedValue(null);
  });

  it("returns ANALYSIS_FAILED and logs it when the Anthropic call throws", async () => {
    mockCreate.mockRejectedValue(new Error("connection reset"));

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

  it("returns ANALYSIS_FAILED when the model responds with no tool_use block", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: "I could not extract this." }] });

    const result = await analyzeVideo(VIDEO, "transcript text");

    expect(result.code).toBe("ANALYSIS_FAILED");
    expect(fakeDb.videoAnalysis.upsert).not.toHaveBeenCalled();
  });
});

describe("analyzeVideo — malformed provider response", () => {
  beforeEach(() => {
    fakeDb.videoAnalysis.findUnique.mockResolvedValue(null);
  });

  it("rejects a tool_use input missing required fields and never persists it", async () => {
    const { overallMarket, ...malformed } = VALID_JASON_OUTPUT;
    void overallMarket;
    mockCreate.mockResolvedValue({ content: [{ type: "tool_use", name: "record_analysis", input: malformed }] });

    const result = await analyzeVideo(VIDEO, "transcript text");

    expect(result.code).toBe("ANALYSIS_FAILED");
    if (result.code === "ANALYSIS_FAILED") {
      expect(result.message).toContain("Schema validation failed");
    }
    expect(fakeDb.videoAnalysis.upsert).not.toHaveBeenCalled();
  });

  it("rejects a tool_use input with the wrong type for a field", async () => {
    const malformed = { ...VALID_JASON_OUTPUT, materialChanges: "not an array" };
    mockCreate.mockResolvedValue({ content: [{ type: "tool_use", name: "record_analysis", input: malformed }] });

    const result = await analyzeVideo(VIDEO, "transcript text");

    expect(result.code).toBe("ANALYSIS_FAILED");
    expect(fakeDb.videoAnalysis.upsert).not.toHaveBeenCalled();
  });
});

describe("analyzeVideo — success path", () => {
  beforeEach(() => {
    fakeDb.videoAnalysis.findUnique.mockResolvedValue(null);
  });

  it("validates and persists a well-formed tool_use response", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "tool_use", name: "record_analysis", input: VALID_JASON_OUTPUT }] });

    const result = await analyzeVideo(VIDEO, "transcript text");

    expect(result.code).toBe("SUCCESS");
    if (result.code === "SUCCESS") {
      expect(result.reused).toBe(false);
    }
    expect(fakeDb.videoAnalysis.upsert).toHaveBeenCalledTimes(1);
  });
});
