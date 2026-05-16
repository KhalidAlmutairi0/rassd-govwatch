// src/app/api/runs/[runId]/start/route.ts
// Triggers scan execution directly in the Next.js process.
// This removes the dependency on the worker being available/idle.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeAITest } from "@/lib/ai-executor";
import { processRunResult } from "@/lib/incidents";
import { storeSiteScore } from "@/lib/scoring";
import { createRelayConnection, relaySend } from "@/lib/ws-server";
import path from "path";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    console.log(`[START] Executing run ${runId} inline`);

    const run = await prisma.run.findUnique({
      where: { id: runId },
      include: { site: true, journey: true },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    if (["passed", "failed", "error"].includes(run.status)) {
      return NextResponse.json(
        { error: `Run already ${run.status}`, redirect: `/report/${runId}` },
        { status: 400 }
      );
    }

    if (run.status === "running") {
      return NextResponse.json({ success: true, alreadyRunning: true });
    }

    // Mark as running immediately so worker doesn't also pick it up
    await prisma.run.update({
      where: { id: runId },
      data: { status: "running" },
    });

    // Fire-and-forget: execute the scan in the background
    executeScan(run).catch((err) => {
      console.error(`[START] Background scan error for ${runId}:`, err);
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in start route:", error);
    return NextResponse.json(
      { error: error.message || "Failed" },
      { status: 500 }
    );
  }
}

async function executeScan(run: any) {
  const { id: runId, site, journey } = run;
  const artifactsDir = path.join(process.cwd(), "artifacts", site.id, runId);

  // Relay WS broadcasts through the worker's WS server so browsers get live frames
  const relay = createRelayConnection(runId);
  const send = (msg: object) => relaySend(relay, msg);

  console.log(`[SCAN] Starting AI test for ${site.name} (run ${runId})`);
  send({ type: "run-status", status: "running" });

  try {
    const result = await executeAITest({
      url: site.baseUrl,
      runId,
      siteId: site.id,
      artifactsDir,
      maxElements: 50,
      timeoutPerElement: 5000,
      onBroadcast: (msg: object) => send(msg),
      onProgress: (event) => {
        console.log(`  [SCAN] ${event.phase}: ${event.description}`);
        send({
          type: "step-update",
          step: {
            index: event.currentStep ?? 0,
            total: event.totalSteps ?? 0,
            description: event.description,
            status: event.status === "running" ? "running" : event.status === "completed" ? "passed" : event.status,
          },
        });
      },
    });

    const elementResults = result.results ?? [];
    const passedCount = elementResults.filter((e: any) => e.status === "passed" || e.status === "warning").length;
    const failedCount = elementResults.filter((e: any) => e.status === "failed").length;
    const finalStatus = failedCount > 0 ? "failed" : "passed";
    const durationMs = result.totalDuration ?? 0;

    await prisma.run.update({
      where: { id: runId },
      data: {
        status: finalStatus,
        totalSteps: elementResults.length,
        passedSteps: passedCount,
        failedSteps: failedCount,
        durationMs,
        finishedAt: new Date(),
      },
    });

    send({ type: "run-complete", status: finalStatus });

    await prisma.site.update({
      where: { id: site.id },
      data: { lastRunAt: new Date() },
    });

    // Process incidents
    const failedElements = elementResults.filter((e: any) => e.status === "failed" || e.status === "error");
    if (failedElements.length > 0) {
      await processRunResult(runId, site.id, journey?.id, "failed",
        failedElements.map((e: any) => ({ status: e.status, error: e.error })) as any
      );
    } else {
      await processRunResult(runId, site.id, journey?.id, "passed", [] as any);
    }

    await storeSiteScore(site.id).catch(() => {});
    console.log(`[SCAN] ${site.name}: ${finalStatus} (${durationMs}ms, ${elementResults.length} elements)`);

  } catch (error: any) {
    await prisma.run.update({
      where: { id: runId },
      data: {
        status: "error",
        errorJson: JSON.stringify({ message: error.message }),
        finishedAt: new Date(),
      },
    });
    send({ type: "run-complete", status: "error" });
    console.error(`[SCAN] ${site.name}: ${error.message}`);
  } finally {
    if (relay && relay.readyState !== undefined) {
      try { relay.close(); } catch {}
    }
  }
}
