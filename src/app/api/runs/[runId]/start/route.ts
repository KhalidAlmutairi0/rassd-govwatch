// src/app/api/runs/[runId]/start/route.ts
// Triggers scan execution directly in the Next.js process.
// Broadcasts live frames through global.__liveSessions (set by server.js).
import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { executeAITest } from "@/server/browser/ai-executor";
import { processRunResult } from "@/server/db/incidents";
import { storeSiteScore } from "@/server/db/scoring";
import path from "path";

function createRelay(runId: string): { send: (msg: object) => void; close: () => void } {
  const port = parseInt(process.env.PORT || "3000", 10);
  const url = `http://localhost:${port}/relay-push/${runId}`;
  let frameCount = 0;

  return {
    send(msg: object) {
      const body = JSON.stringify(msg);
      if ((msg as any).type === "browser-frame") {
        frameCount++;
        if (frameCount <= 3 || frameCount % 30 === 0) {
          console.log(`[RELAY] Frame #${frameCount} sent for run ${runId}`);
        }
      }
      fetch(url, {
        method: "POST",
        body,
        headers: { "Content-Type": "application/json" },
      }).catch((err) => {
        console.error(`[RELAY] HTTP push failed: ${err.message}`);
      });
    },
    close() {
      console.log(`[RELAY] Closed for run ${runId} (${frameCount} frames sent)`);
    },
  };
}

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

  const relay = createRelay(runId);
  const send = (msg: object) => relay.send(msg);

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
    relay.close();
  }
}
