import { describe, it, expect, vi, beforeEach } from "vitest";
import { TranscriptProviderError } from "@/lib/transcript/types";
import type { NormalisedTranscript } from "@/lib/transcript/types";

const mockFreeFetch = vi.fn();
const mockSupadataFetch = vi.fn();

vi.mock("@/lib/transcript/freeTranscriptApi", () => ({
  FreeTranscriptApiProvider: class {
    name = "FREE_TRANSCRIPT_API";
    fetchTranscript = mockFreeFetch;
  },
}));

vi.mock("@/lib/transcript/supadata", () => ({
  SupadataProvider: class {
    name = "SUPADATA";
    fetchTranscript = mockSupadataFetch;
  },
}));

const fakeDb = {
  transcript: {
    findUnique: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ id: "transcript-1" }),
  },
  transcriptSegment: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  video: {
    update: vi.fn(),
  },
  importLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn(async (fn: (tx: typeof fakeDb) => Promise<unknown>) => fn(fakeDb)),
};

vi.mock("@/lib/db", () => ({ prisma: fakeDb }));

const { getTranscript } = await import("@/lib/transcript/service");

const VIDEO = { id: "video-db-id", youtubeVideoId: "abc12345678" };
const URL_ = "https://www.youtube.com/watch?v=abc12345678";

const SAMPLE_TRANSCRIPT: NormalisedTranscript = {
  videoId: "abc12345678",
  language: "en",
  title: "Sample",
  segments: [{ text: "hi", startSeconds: 0, durationSeconds: 1 }],
  fullText: "hi",
  provider: "SUPADATA",
};

beforeEach(() => {
  vi.clearAllMocks();
  fakeDb.transcript.upsert.mockResolvedValue({ id: "transcript-1" });
  fakeDb.$transaction.mockImplementation(async (fn: (tx: typeof fakeDb) => Promise<unknown>) => fn(fakeDb));
});

describe("getTranscript — duplicate prevention", () => {
  it("returns the stored transcript without calling any provider when one already exists", async () => {
    fakeDb.transcript.findUnique.mockResolvedValue({
      language: "en",
      fullText: "stored text",
      provider: "FREE_TRANSCRIPT_API",
      segments: [{ text: "stored text", startSeconds: 0, durationSeconds: 5 }],
      video: { title: "Stored Title" },
    });

    const result = await getTranscript(VIDEO, URL_);

    expect(result.code).toBe("SUCCESS");
    expect(mockFreeFetch).not.toHaveBeenCalled();
    expect(mockSupadataFetch).not.toHaveBeenCalled();
  });
});

describe("getTranscript — provider fallback", () => {
  beforeEach(() => {
    fakeDb.transcript.findUnique.mockResolvedValue(null);
  });

  it("falls back to Supadata when FreeTranscriptAPI fails, and persists the result", async () => {
    mockFreeFetch.mockRejectedValue(new TranscriptProviderError("PROVIDER_DOWN", "FREE_TRANSCRIPT_API", "down"));
    mockSupadataFetch.mockResolvedValue(SAMPLE_TRANSCRIPT);

    const result = await getTranscript(VIDEO, URL_);

    expect(result.code).toBe("SUCCESS");
    if (result.code === "SUCCESS") {
      expect(result.transcript.provider).toBe("SUPADATA");
    }
    expect(mockFreeFetch).toHaveBeenCalledTimes(1);
    expect(mockSupadataFetch).toHaveBeenCalledTimes(1);
    expect(fakeDb.transcript.upsert).toHaveBeenCalledTimes(1);
  });

  it("returns a typed failure when both providers fail", async () => {
    mockFreeFetch.mockRejectedValue(new TranscriptProviderError("NO_CAPTIONS", "FREE_TRANSCRIPT_API", "no captions"));
    mockSupadataFetch.mockRejectedValue(new TranscriptProviderError("NO_CAPTIONS", "SUPADATA", "no native captions"));

    const result = await getTranscript(VIDEO, URL_);

    expect(result.code).toBe("NO_CAPTIONS");
    expect(fakeDb.transcript.upsert).not.toHaveBeenCalled();
  });

  it("never invokes speech-to-text as a fallback — only the two configured providers are called", async () => {
    mockFreeFetch.mockRejectedValue(new TranscriptProviderError("PROVIDER_DOWN", "FREE_TRANSCRIPT_API", "down"));
    mockSupadataFetch.mockRejectedValue(new TranscriptProviderError("PROVIDER_DOWN", "SUPADATA", "down"));

    const result = await getTranscript(VIDEO, URL_);

    expect(result.code).toBe("PROVIDER_DOWN");
    expect(mockFreeFetch).toHaveBeenCalledTimes(1);
    expect(mockSupadataFetch).toHaveBeenCalledTimes(1);
  });

  it("survives a malformed provider response (e.g. a JSON parse crash) as a typed UNKNOWN_ERROR instead of throwing", async () => {
    // Providers are only contractually required to throw TranscriptProviderError, but a bad response
    // (invalid JSON, a shape change) could throw a raw SyntaxError/TypeError instead. getTranscript
    // must not propagate that uncaught — it should be caught, logged, and typed like any other failure.
    mockFreeFetch.mockRejectedValue(new SyntaxError("Unexpected token < in JSON at position 0"));
    mockSupadataFetch.mockRejectedValue(new TypeError("Cannot read properties of undefined (reading 'content')"));

    const result = await getTranscript(VIDEO, URL_);

    expect(result.code).toBe("UNKNOWN_ERROR");
    expect(fakeDb.transcript.upsert).not.toHaveBeenCalled();
    expect(fakeDb.importLog.create).toHaveBeenCalledTimes(2);
  });
});
