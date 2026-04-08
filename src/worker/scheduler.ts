// src/worker/scheduler.ts
// This runs as a SEPARATE process: `npm run worker`

import cron from "node-cron";
import { prisma } from "../lib/prisma";
import { executeAITest } from "../lib/ai-executor";
import { processRunResult } from "../lib/incidents";
import { initWebSocketServer } from "../lib/ws-server";
import path from "path";

console.log("🚀 GovWatch Worker started");

// Initialize WebSocket server for live browser streaming
const wsPort = parseInt(process.env.WORKER_PORT || "3003");
initWebSocketServer(wsPort);
console.log(`📡 WebSocket server running on ws://localhost:${wsPort}`);

console.log("⏰ Scheduler running (checks every minute)");

// Run every minute, check which sites need execution
cron.schedule("* * * * *", async () => {
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
      status: "queued",
      triggeredBy: "scheduler",
      totalSteps: 0, // AI will determine this dynamically
    },
  });

  try {
    // Set up artifacts directory
    const artifactsDir = path.join(process.cwd(), "artifacts", site.id, run.id);

    // Execute AI test (no WebSocket broadcasting for scheduled runs)
    const result = await executeAITest({
      url: site.baseUrl,
      runId: run.id,
      siteId: site.id,
      artifactsDir,
      maxElements: 80,
      timeoutPerElement: 5000,
      onProgress: (event) => {
        // Just log progress for scheduled runs (no WebSocket)
        console.log(`  ${event.phase}: ${event.description}`);
      },
    });

    // Normalize return shape: executor returns { results, overallStatus, totalDuration }
    const elementResults = result.results ?? result.elementResults ?? [];
    const status = result.overallStatus ?? result.status ?? "error";
    const durationMs = result.totalDuration ?? result.durationMs ?? 0;

    console.log(`✅ ${site.name}: ${status} (${durationMs}ms, ${elementResults.length} elements tested)`);

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
    } else if (status === "error") {
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
  } catch (error: any) {
    await prisma.run.update({
      where: { id: run.id },
      data: {
        status: "error",
        errorJson: JSON.stringify({ message: error.message }),
        finishedAt: new Date(),
      },
    });
    console.error(`❌ ${site.name}: ${error.message}`);
  }
}
