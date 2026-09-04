import { NextResponse } from "next/server";
import { importVideo } from "@/lib/import";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const { creatorSlug, url } = (body ?? {}) as { creatorSlug?: unknown; url?: unknown };
  if (typeof creatorSlug !== "string" || typeof url !== "string") {
    return NextResponse.json({ error: "Body must include creatorSlug and url as strings" }, { status: 400 });
  }

  const result = await importVideo(creatorSlug, url);

  switch (result.code) {
    case "OK":
      return NextResponse.json({
        status: "OK",
        video: result.video,
        transcriptReused: result.transcriptReused,
        analysisReused: result.analysisReused,
      });
    case "INVALID_URL":
    case "CREATOR_NOT_FOUND":
      return NextResponse.json({ status: result.code, error: result.message }, { status: 400 });
    case "TRANSCRIPT_FAILED":
    case "ANALYSIS_FAILED":
      return NextResponse.json({ status: result.code, error: result.message, video: result.video }, { status: 502 });
  }
}
