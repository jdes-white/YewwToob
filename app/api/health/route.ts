import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkDatabase, checkAnthropic, checkFreeTranscriptApi, checkSupadata } from "@/lib/health";

export async function GET() {
  const [database, anthropic, freeTranscriptApi, supadata] = await Promise.all([
    checkDatabase(),
    checkAnthropic(),
    checkFreeTranscriptApi(),
    checkSupadata(),
  ]);

  let lastImport = null;
  try {
    lastImport = await prisma.video.findFirst({
      orderBy: { updatedAt: "desc" },
      include: {
        creator: true,
        analyses: { orderBy: { createdAt: "desc" }, take: 1 },
        importLogs: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    });
  } catch {
    // Database check already reports this failure; leave lastImport null.
  }

  return NextResponse.json({
    checks: [database, anthropic, freeTranscriptApi, supadata],
    lastImport,
  });
}
