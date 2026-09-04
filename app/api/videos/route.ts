import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const videos = await prisma.video.findMany({
    include: { creator: true },
    orderBy: { importedAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ videos });
}
