import { describe, it, expect } from "vitest";
import { parseYoutubeUrl } from "@/lib/youtube";

describe("parseYoutubeUrl", () => {
  it("extracts the ID from a standard watch URL", () => {
    const result = parseYoutubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(result).toEqual({
      ok: true,
      videoId: "dQw4w9WgXcQ",
      normalisedUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
  });

  it("extracts the ID from a youtu.be short URL", () => {
    const result = parseYoutubeUrl("https://youtu.be/dQw4w9WgXcQ?si=abc123");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.videoId).toBe("dQw4w9WgXcQ");
  });

  it("extracts the ID from a shorts URL", () => {
    const result = parseYoutubeUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.videoId).toBe("dQw4w9WgXcQ");
  });

  it("extracts the ID from an embed URL", () => {
    const result = parseYoutubeUrl("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.videoId).toBe("dQw4w9WgXcQ");
  });

  it("accepts a bare video ID", () => {
    const result = parseYoutubeUrl("dQw4w9WgXcQ");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.videoId).toBe("dQw4w9WgXcQ");
  });

  it("strips extra query params and normalises to a canonical URL", () => {
    const result = parseYoutubeUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PLxyz");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.normalisedUrl).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("rejects an empty string", () => {
    const result = parseYoutubeUrl("");
    expect(result).toEqual({ ok: false, reason: "EMPTY" });
  });

  it("rejects a non-URL string", () => {
    const result = parseYoutubeUrl("not a url at all $$$");
    expect(result.ok).toBe(false);
  });

  it("rejects a non-YouTube URL", () => {
    const result = parseYoutubeUrl("https://vimeo.com/12345678");
    expect(result).toEqual({ ok: false, reason: "NOT_YOUTUBE" });
  });

  it("rejects a YouTube URL with no video ID", () => {
    const result = parseYoutubeUrl("https://www.youtube.com/channel/UCabc123");
    expect(result).toEqual({ ok: false, reason: "NO_VIDEO_ID" });
  });
});
