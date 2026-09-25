import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetTranscript = vi.fn();
const mockAnalyzeVideo = vi.fn();

vi.mock("@/lib/transcript/service", () => ({ getTranscript: mockGetTranscript }));
vi.mock("@/lib/analysis/service", () => ({ analyzeVideo: mockAnalyzeVideo }));

const fakeDb = {
  creator: { findUnique: vi.fn() },
  video: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
};

vi.mock("@/lib/db", () => ({ prisma: fakeDb }));

const { importVideo } = await import("@/lib/import");

const CREATOR = { id: "creator-1", slug: "jason-pizzino" };

function videoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "video-1",
    creatorId: "creator-1",
    youtubeUrl: "https://www.youtube.com/watch?v=abc12345678",
    youtubeVideoId: "abc12345678",
    processingStatus: "IMPORTED",
    transcriptProvider: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeDb.creator.findUnique.mockResolvedValue(CREATOR);
  fakeDb.video.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    videoRow({ ...data }),
  );
});

describe("importVideo — input validation", () => {
  it("rejects an invalid YouTube URL before touching the database", async () => {
    const result = await importVideo("jason-pizzino", "not a url");

    expect(result.code).toBe("INVALID_URL");
    expect(fakeDb.creator.findUnique).not.toHaveBeenCalled();
  });

  it("reports an unknown creator slug", async () => {
    fakeDb.creator.findUnique.mockResolvedValue(null);

    const result = await importVideo("nonexistent-creator", "https://www.youtube.com/watch?v=abc12345678");

    expect(result.code).toBe("CREATOR_NOT_FOUND");
    expect(fakeDb.video.findUnique).not.toHaveBeenCalled();
  });
});

describe("importVideo — duplicate import prevention", () => {
  it("creates a new Video row on first import of a URL", async () => {
    fakeDb.video.findUnique.mockResolvedValue(null);
    fakeDb.video.create.mockResolvedValue(videoRow());
    mockGetTranscript.mockResolvedValue({ code: "SUCCESS", transcript: { provider: "FREE_TRANSCRIPT_API", fullText: "hi" } });
    mockAnalyzeVideo.mockResolvedValue({ code: "SUCCESS", analysisId: "a1", structuredJson: {}, reused: false });

    const result = await importVideo("jason-pizzino", "https://www.youtube.com/watch?v=abc12345678");

    expect(fakeDb.video.create).toHaveBeenCalledTimes(1);
    expect(result.code).toBe("OK");
    if (result.code === "OK") {
      expect(result.transcriptReused).toBe(false);
      expect(result.analysisReused).toBe(false);
    }
  });

  it("does not create a second Video row when the same youtubeVideoId is re-submitted, and flags reuse", async () => {
    fakeDb.video.findUnique.mockResolvedValue(videoRow({ processingStatus: "READY" }));
    mockGetTranscript.mockResolvedValue({ code: "SUCCESS", transcript: { provider: "FREE_TRANSCRIPT_API", fullText: "hi" } });
    mockAnalyzeVideo.mockResolvedValue({ code: "SUCCESS", analysisId: "a1", structuredJson: {}, reused: true });

    const result = await importVideo("jason-pizzino", "https://www.youtube.com/watch?v=abc12345678");

    expect(fakeDb.video.create).not.toHaveBeenCalled();
    expect(result.code).toBe("OK");
    if (result.code === "OK") {
      // Video was already past IMPORTED/TRANSCRIPT_FAILED, so the duplicate submission is flagged as reused.
      expect(result.transcriptReused).toBe(true);
      expect(result.analysisReused).toBe(true);
    }
    // getTranscript/analyzeVideo are themselves idempotent (tested separately) — importVideo still calls
    // them, but relies on their own DB-backed caching rather than re-fetching/re-analysing itself.
    expect(mockGetTranscript).toHaveBeenCalledTimes(1);
    expect(mockAnalyzeVideo).toHaveBeenCalledTimes(1);
  });

  it("retries transcript fetch on re-submission of a video that previously failed", async () => {
    fakeDb.video.findUnique.mockResolvedValue(videoRow({ processingStatus: "TRANSCRIPT_FAILED", lastErrorCode: "PROVIDER_DOWN" }));
    mockGetTranscript.mockResolvedValue({ code: "SUCCESS", transcript: { provider: "SUPADATA", fullText: "hi" } });
    mockAnalyzeVideo.mockResolvedValue({ code: "SUCCESS", analysisId: "a1", structuredJson: {}, reused: false });

    const result = await importVideo("jason-pizzino", "https://www.youtube.com/watch?v=abc12345678");

    expect(result.code).toBe("OK");
    if (result.code === "OK") {
      expect(result.transcriptReused).toBe(false);
    }
  });
});

describe("importVideo — failure propagation", () => {
  it("stops at TRANSCRIPT_FAILED without calling analyzeVideo", async () => {
    fakeDb.video.findUnique.mockResolvedValue(null);
    fakeDb.video.create.mockResolvedValue(videoRow());
    mockGetTranscript.mockResolvedValue({ code: "NO_CAPTIONS", provider: "SUPADATA", message: "no captions available" });

    const result = await importVideo("jason-pizzino", "https://www.youtube.com/watch?v=abc12345678");

    expect(result.code).toBe("TRANSCRIPT_FAILED");
    expect(mockAnalyzeVideo).not.toHaveBeenCalled();
  });

  it("surfaces ANALYSIS_FAILED when the transcript succeeded but analysis did not", async () => {
    fakeDb.video.findUnique.mockResolvedValue(null);
    fakeDb.video.create.mockResolvedValue(videoRow());
    mockGetTranscript.mockResolvedValue({ code: "SUCCESS", transcript: { provider: "FREE_TRANSCRIPT_API", fullText: "hi" } });
    mockAnalyzeVideo.mockResolvedValue({ code: "ANALYSIS_FAILED", message: "Schema validation failed" });

    const result = await importVideo("jason-pizzino", "https://www.youtube.com/watch?v=abc12345678");

    expect(result.code).toBe("ANALYSIS_FAILED");
  });
});
