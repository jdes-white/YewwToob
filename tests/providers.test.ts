import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { FreeTranscriptApiProvider } from "@/lib/transcript/freeTranscriptApi";
import { SupadataProvider } from "@/lib/transcript/supadata";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("FreeTranscriptApiProvider", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.FREE_TRANSCRIPT_API_KEY;
  });

  it("normalises a successful response into the internal transcript shape", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        language: "en",
        title: "Test Video",
        transcript: [
          { text: "Hello", start: 0, duration: 2 },
          { text: "world", start: 2, duration: 1.5 },
        ],
      }),
    );

    const provider = new FreeTranscriptApiProvider();
    const result = await provider.fetchTranscript("abc12345678");

    expect(result).toEqual({
      videoId: "abc12345678",
      language: "en",
      title: "Test Video",
      segments: [
        { text: "Hello", startSeconds: 0, durationSeconds: 2 },
        { text: "world", startSeconds: 2, durationSeconds: 1.5 },
      ],
      fullText: "Hello world",
      provider: "FREE_TRANSCRIPT_API",
    });
  });

  it("works without an API key (confirmed keyless free tier) and sends no Authorization header", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(200, { language: "en", transcript: [{ text: "hi", start: 0, duration: 1 }] }));
    global.fetch = fetchSpy;
    const provider = new FreeTranscriptApiProvider();

    await provider.fetchTranscript("abc12345678");

    const [, init] = fetchSpy.mock.calls[0]!;
    expect((init as RequestInit).headers).toEqual({});
  });

  it("sends an Authorization header when an API key is configured", async () => {
    process.env.FREE_TRANSCRIPT_API_KEY = "test-key";
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(200, { language: "en", transcript: [{ text: "hi", start: 0, duration: 1 }] }));
    global.fetch = fetchSpy;
    const provider = new FreeTranscriptApiProvider();

    await provider.fetchTranscript("abc12345678");

    const [, init] = fetchSpy.mock.calls[0]!;
    expect((init as RequestInit).headers).toEqual({ Authorization: "Bearer test-key" });
  });

  it("sends the video as a video_url query parameter", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(200, { language: "en", transcript: [{ text: "hi", start: 0, duration: 1 }] }));
    global.fetch = fetchSpy;
    const provider = new FreeTranscriptApiProvider();

    await provider.fetchTranscript("abc12345678");

    const calledUrl = new URL(fetchSpy.mock.calls[0]![0] as string);
    expect(calledUrl.searchParams.get("video_url")).toBe("https://www.youtube.com/watch?v=abc12345678");
  });

  it("maps a 401 response to AUTH_ERROR", async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(401, { error: "invalid key" }));
    const provider = new FreeTranscriptApiProvider();

    await expect(provider.fetchTranscript("abc12345678")).rejects.toMatchObject({
      code: "AUTH_ERROR",
      provider: "FREE_TRANSCRIPT_API",
    });
  });

  it("maps a 429 response to RATE_LIMITED", async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(429, { error: "too many requests" }));
    const provider = new FreeTranscriptApiProvider();

    await expect(provider.fetchTranscript("abc12345678")).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("maps a 5xx response to PROVIDER_DOWN", async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(503, { error: "down for maintenance" }));
    const provider = new FreeTranscriptApiProvider();

    await expect(provider.fetchTranscript("abc12345678")).rejects.toMatchObject({ code: "PROVIDER_DOWN" });
  });

  it("maps zero segments to NO_CAPTIONS", async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { language: "en", transcript: [] }));
    const provider = new FreeTranscriptApiProvider();

    await expect(provider.fetchTranscript("abc12345678")).rejects.toMatchObject({ code: "NO_CAPTIONS" });
  });
});

describe("SupadataProvider", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.SUPADATA_API_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.SUPADATA_API_KEY;
  });

  it("always requests native-caption mode", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        lang: "en",
        content: [{ text: "Hi", offset: 0, duration: 1000 }],
      }),
    );
    global.fetch = fetchSpy;

    const provider = new SupadataProvider();
    await provider.fetchTranscript("abc12345678");

    const calledUrl = new URL((fetchSpy.mock.calls[0]![0] as string));
    expect(calledUrl.searchParams.get("mode")).toBe("native");
  });

  it("converts millisecond offsets to seconds", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        lang: "en",
        content: [{ text: "Hi", offset: 1500, duration: 2000 }],
      }),
    );

    const provider = new SupadataProvider();
    const result = await provider.fetchTranscript("abc12345678");

    expect(result.segments).toEqual([{ text: "Hi", startSeconds: 1.5, durationSeconds: 2 }]);
  });

  it("maps a no-native-captions response to NO_CAPTIONS", async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(404, { error: "no native captions found" }));
    const provider = new SupadataProvider();

    await expect(provider.fetchTranscript("abc12345678")).rejects.toMatchObject({ code: "NO_CAPTIONS" });
  });
});
