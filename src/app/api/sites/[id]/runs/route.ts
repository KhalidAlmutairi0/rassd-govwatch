// src/app/api/sites/[id]/runs/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PlaywrightExecutor } from "@/lib/executor";
import { processRunResult } from "@/lib/incidents";
import { generateRunSummary } from "@/lib/ai-summary";

// GET /api/sites/[id]/runs - List runs for a site
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const runs = await prisma.run.findMany({
      where: { siteId: params.id },
      orderBy: { startedAt: "desc" },
      take: 50,
      include: {
        journey: true,
      },
    });

    return NextResponse.json({ runs });
  } catch (error) {
    console.error("Error fetching runs:", error);
    return NextResponse.json(
      { error: "Failed to fetch runs" },
      { status: 500 }
    );
  }
}

// POST /api/sites/[id]/runs - Trigger a new run
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { journeyId } = body;

    // Get site
    const site = await prisma.site.findUnique({
      where: { id: params.id },
    });

    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    // Get journey (or use default)
    let journey;
    if (journeyId) {
      journey = await prisma.journey.findUnique({
        where: { id: journeyId },
      });
    } else {
      journey = await prisma.journey.findFirst({
        where: { siteId: params.id, isDefault: true },
      });
    }

    if (!journey) {
      return NextResponse.json({ error: "No journey found" }, { status: 404 });
    }

    // Create run record (keep as "queued" - execution starts when client connects)
    const run = await prisma.run.create({
      data: {
        siteId: params.id,
        journeyId: journey.id,
        status: "queued",
        triggeredBy: "manual",
      },
    });

    // Store execution data for later (when client signals ready)
    global.pendingRuns = global.pendingRuns || new Map();
    global.pendingRuns.set(run.id, {
      siteId: site.id,
      baseUrl: site.baseUrl,
      journeyId: journey.id,
      stepsJson: journey.stepsJson,
    });
    console.log(`[PENDING] Stored run ${run.id} in pendingRuns (size: ${global.pendingRuns.size})`);

    return NextResponse.json({ run }, { status: 201 });
  } catch (error: any) {
    console.error("Error triggering run:", error);
    return NextResponse.json(
      { error: error.message || "Failed to trigger run" },
      { status: 500 }
    );
  }
}

// Export for use by other routes
export async function executeRun(
  runId: string,
  siteId: string,
  baseUrl: string,
  journeyId: string,
  stepsJson: string
) {
  try {
    const steps = JSON.parse(stepsJson);
    const executor = new PlaywrightExecutor();

    const result = await executor.execute({
      runId,
      siteId,
      baseUrl,
      steps,
      enableScreencast: true,
      enableTrace: true,
      enableVideo: false,
    });

    // Generate AI summary
    const site = await prisma.site.findUnique({ where: { id: siteId } });
    const summary = await generateRunSummary(
      baseUrl,
      site?.name || "Unknown Site",
      result.overallStatus,
      result.steps,
      result.durationMs
    );

    // Update run with results
    await prisma.run.update({
      where: { id: runId },
      data: {
        status: result.overallStatus,
        durationMs: result.durationMs,
        totalSteps: result.steps.length,
        passedSteps: result.steps.filter((s) => s.status === "passed").length,
        failedSteps: result.steps.filter((s) => s.status === "failed").length,
        summaryJson: JSON.stringify(summary),
        finishedAt: new Date(),
      },
    });

    // Update site lastRunAt
    await prisma.site.update({
      where: { id: siteId },
      data: { lastRunAt: new Date() },
    });

    // Process incidents
    await processRunResult(runId, siteId, journeyId, result.overallStatus, result.steps);
  } catch (error) {
    console.error(`Error executing run ${runId}:`, error);
    await prisma.run.update({
      where: { id: runId },
      data: {
        status: "error",
        errorJson: JSON.stringify({ message: (error as Error).message }),
        finishedAt: new Date(),
      },
    });
  }
}
