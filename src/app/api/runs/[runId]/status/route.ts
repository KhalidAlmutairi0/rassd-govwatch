import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;

  const run = await prisma.run.findUnique({
    where: { id: runId },
    select: {
      status: true,
      siteId: true,
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
      screenshotAfter: true,
      cursorX: true,
      cursorY: true,
    },
    orderBy: { id: "asc" },
  });

  // Build URL for the latest viewport screenshot (NOT full-page)
  let latestScreenshot: string | null = null;
  let cursorX: number | null = null;
  let cursorY: number | null = null;
  const lastEl = [...elements].reverse().find(e => e.screenshotAfter);
  if (lastEl?.screenshotAfter) {
    const absPath = lastEl.screenshotAfter;
    const idx = absPath.replace(/\\/g, "/").indexOf("artifacts/");
    if (idx >= 0) {
      latestScreenshot = "/" + absPath.replace(/\\/g, "/").substring(idx);
    }
    cursorX = lastEl.cursorX;
    cursorY = lastEl.cursorY;
  }

  return NextResponse.json({ ...run, elements, latestScreenshot, cursorX, cursorY });
}
