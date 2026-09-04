import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const video = await prisma.video.findUnique({
    where: { id },
    include: {
      creator: true,
      transcript: { include: { segments: { orderBy: { index: "asc" } } } },
      analyses: { orderBy: { createdAt: "desc" } },
      importLogs: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  return NextResponse.json({ video });
}
