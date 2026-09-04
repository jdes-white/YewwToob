const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export type YoutubeUrlParseResult =
  | { ok: true; videoId: string; normalisedUrl: string }
  | { ok: false; reason: "EMPTY" | "NOT_A_URL" | "NOT_YOUTUBE" | "NO_VIDEO_ID" };

/**
 * Extracts a YouTube video ID from any of the common URL shapes
 * (watch, youtu.be, shorts, embed, live) or a bare 11-char ID, and
 * returns it alongside a canonical `https://www.youtube.com/watch?v=<id>`
 * URL. Never throws — callers get a typed result instead.
 */
export function parseYoutubeUrl(input: string): YoutubeUrlParseResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, reason: "EMPTY" };
  }

  if (VIDEO_ID_PATTERN.test(trimmed)) {
    return {
      ok: true,
      videoId: trimmed,
      normalisedUrl: `https://www.youtube.com/watch?v=${trimmed}`,
    };
  }

  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return { ok: false, reason: "NOT_A_URL" };
  }

  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
  const isYoutubeHost = host === "youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com";
  if (!isYoutubeHost) {
    return { ok: false, reason: "NOT_YOUTUBE" };
  }

  let videoId: string | null = null;

  if (host === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (url.pathname === "/watch") {
    videoId = url.searchParams.get("v");
  } else {
    const segments = url.pathname.split("/").filter(Boolean);
    const prefixIndex = segments.findIndex((s) => s === "shorts" || s === "embed" || s === "live" || s === "v");
    if (prefixIndex !== -1 && segments[prefixIndex + 1]) {
      videoId = segments[prefixIndex + 1];
    }
  }

  if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) {
    return { ok: false, reason: "NO_VIDEO_ID" };
  }

  return {
    ok: true,
    videoId,
    normalisedUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}
