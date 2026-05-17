import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;

  const run = await prisma.run.findUnique({
    where: { id: runId },
    select: {
      status: true,
      durationMs: true,
      totalSteps: true,
      passedSteps: true,
      failedSteps: true,
      errorJson: true,
      site: { select: { baseUrl: true, name: true } },
    },
  });

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const elements = await prisma.elementTestResult.findMany({
    where: { runId },
    select: {
      elementType: true,
      elementText: true,
      action: true,
      status: true,
      responseTimeMs: true,
      error: true,
    },
    orderBy: { id: "asc" },
  });

  return NextResponse.json({ ...run, elements });
}
