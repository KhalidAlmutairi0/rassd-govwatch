// src/worker/scheduler.ts
// This runs as a SEPARATE process: `npm run worker`

import cron from "node-cron";
import { prisma } from "../lib/prisma";
import { executeAITest } from "../lib/ai-executor";
import { processRunResult } from "../lib/incidents";
import { initWebSocketServer } from "../lib/ws-server";
import { checkEscalations } from "../lib/escalation";
import { storeSiteScore } from "../lib/scoring";
import path from "path";

console.log("🚀 GovWatch Worker started");

// Initialize WebSocket server for live browser streaming
const wsPort = parseInt(process.env.WORKER_PORT || "3003");
initWebSocketServer(wsPort);
console.log(`📡 WebSocket server running on ws://localhost:${wsPort}`);

console.log("⏰ Scheduler running (checks every minute)");

// Run every minute, check which sites need execution
cron.schedule("* * * * *", async () => {
  // Check escalation timers every minute
  checkEscalations().catch(console.error);

  try {
    const sites = await prisma.site.findMany({
      where: { isActive: true, schedule: { gt: 0 } },
      include: { journeys: { where: { isDefault: true } } },
    });

    for (const site of sites) {
      // Check if it's time to run (based on schedule interval)
      const minutesSinceLastRun = site.lastRunAt
        ? (Date.now() - site.lastRunAt.getTime()) / 60000
        : Infinity;

      if (minutesSinceLastRun < site.schedule) continue;

      // Process each journey for this site
      for (const journey of site.journeys) {
        await runJourney(site, journey);
      }
    }
  } catch (error) {
    console.error("Scheduler error:", error);
  }
});

async function runJourney(site: any, journey: any) {
  console.log(`▶️  Running AI-powered test for ${site.name}`);

  // Create run record
  const run = await prisma.run.create({
    data: {
      siteId: site.id,
      journeyId: journey.id,
      status: "running",
      triggeredBy: "scheduler",
      totalSteps: 0,
    },
  });

  // Broadcast to any live viewers watching this run
  const { broadcast } = await import("../lib/ws-server");
  broadcast(run.id, { type: "run-status", status: "running" });

  try {
    // Set up artifacts directory
    const artifactsDir = path.join(process.cwd(), "artifacts", site.id, run.id);

    // Execute AI test — broadcast frames so governor can watch live
    const result = await executeAITest({
      url: site.baseUrl,
      runId: run.id,
      siteId: site.id,
      artifactsDir,
      maxElements: 80,
      timeoutPerElement: 5000,
      onBroadcast: (msg: object) => broadcast(run.id, msg),
      onProgress: (event) => {
        console.log(`  ${event.phase}: ${event.description}`);
        broadcast(run.id, {
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

    // Normalize return shape
    const elementResults = result.results ?? (result as any).elementResults ?? [];
    const overallStatus = result.overallStatus ?? (result as any).status ?? "passed";
    const durationMs = result.totalDuration ?? (result as any).durationMs ?? 0;

    // Determine final status
    const passedCount = elementResults.filter((e: any) => e.status === "passed" || e.status === "warning").length;
    const failedCount = elementResults.filter((e: any) => e.status === "failed").length;
    const finalStatus = failedCount > 0 ? "failed" : "passed";

    // Update run with final results
    await prisma.run.update({
      where: { id: run.id },
      data: {
        status: finalStatus,
        totalSteps: elementResults.length,
        passedSteps: passedCount,
        failedSteps: failedCount,
        durationMs,
        finishedAt: new Date(),
      },
    });

    // Broadcast completion so live view redirects to report
    broadcast(run.id, { type: "run-complete", status: finalStatus });

    console.log(`✅ ${site.name}: ${finalStatus} (${durationMs}ms, ${elementResults.length} elements tested)`);

    // Update site last run time
    await prisma.site.update({
      where: { id: site.id },
      data: { lastRunAt: new Date() },
    });

    // Process incidents based on element test results
    const failedElements = elementResults.filter(
      (e: any) => e.status === "failed" || e.status === "error"
    );

    if (failedElements.length > 0) {
      // Map element results to incident-compatible format
      const failedSteps = failedElements.map((e: any) => ({
        status: e.status,
        error: e.error,
      }));

      await processRunResult(
        run.id,
        site.id,
        journey.id,
        "failed",
        failedSteps as any
      );
    } else if (overallStatus === "error") {
      await processRunResult(
        run.id,
        site.id,
        journey.id,
        "error",
        [{ status: "failed", error: (result as any).error || "Unknown error" }] as any
      );
    } else {
      // All passed - resolve any open incidents
      await processRunResult(
        run.id,
        site.id,
        journey.id,
        "passed",
        [] as any
      );
    }

    // Store a score snapshot after every completed run
    await storeSiteScore(site.id);

  } catch (error: any) {
    await prisma.run.update({
      where: { id: run.id },
      data: {
        status: "error",
        errorJson: JSON.stringify({ message: error.message }),
        finishedAt: new Date(),
      },
    });
    broadcast(run.id, { type: "run-complete", status: "error" });
    console.error(`❌ ${site.name}: ${error.message}`);
  }
}
