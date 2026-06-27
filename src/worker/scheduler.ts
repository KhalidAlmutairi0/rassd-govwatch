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
import { promises as fs } from "fs";

console.log("🚀 GovWatch Worker started");

// Initialize WebSocket server for live browser streaming
const wsPort = parseInt(process.env.WORKER_PORT || "3003");
initWebSocketServer(wsPort);
console.log(`📡 WebSocket server running on ws://localhost:${wsPort}`);

// ── Global scan lock: only ONE Chromium at a time ──
let scanBusy = false;

// Clean up stuck runs (running > 3 min or queued > 5 min)
async function cleanupStuckRuns() {
  try {
    const r = await prisma.run.updateMany({
      where: {
        OR: [
          { status: "running", startedAt: { lt: new Date(Date.now() - 30 * 60 * 1000) } },
          { status: "queued", startedAt: { lt: new Date(Date.now() - 15 * 60 * 1000) } },
        ],
      },
      data: { status: "error", errorJson: JSON.stringify({ message: "Timed out" }), finishedAt: new Date() },
    });
    if (r.count > 0) console.log(`🧹 Cleaned up ${r.count} stuck runs`);
  } catch (e) {
    console.error("Cleanup error:", e);
  }
}
cleanupStuckRuns();

// ── Fast poll: pick up manually-queued runs every 2 seconds ──
console.log("⏰ Manual run poll starting (every 2s)");
setInterval(async () => {
  if (scanBusy) return;
  try {
    const queued = await prisma.run.findFirst({
      where: { status: "queued", triggeredBy: "scheduler" },
      include: { site: true, journey: true },
      orderBy: { startedAt: "asc" },
    });
    if (!queued) return;

    console.log(`▶️  Scheduled run picked up: ${queued.id} for ${queued.site.name}`);
    scanBusy = true;
    await runJourney(queued.site, queued.journey, queued.id);
  } catch (error) {
    console.error("Manual run error:", error);
  } finally {
    scanBusy = false;
  }
}, 2000);

// ── Periodic stuck-run cleanup every 60s ──
setInterval(() => cleanupStuckRuns(), 60_000);

// ── Artifact retention: delete on-disk files + Artifact rows for runs > N days old ──
const ARTIFACT_RETENTION_DAYS = parseInt(process.env.ARTIFACT_RETENTION_DAYS || "7", 10);

async function pruneOldArtifacts() {
  try {
    const cutoff = new Date(Date.now() - ARTIFACT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const stale = await prisma.run.findMany({
      where: { startedAt: { lt: cutoff } },
      select: { id: true, siteId: true },
    });
    if (stale.length === 0) return;

    let removed = 0;
    for (const r of stale) {
      const dir = path.join(process.cwd(), "artifacts", r.siteId, r.id);
      const result = await fs.rm(dir, { recursive: true, force: true }).then(() => true).catch(() => false);
      if (result) removed++;
    }
    const { count } = await prisma.artifact.deleteMany({
      where: { runId: { in: stale.map((r) => r.id) } },
    });
    console.log(`🧹 Pruned ${removed} artifact dirs and ${count} Artifact rows older than ${ARTIFACT_RETENTION_DAYS}d`);
  } catch (e) {
    console.error("Artifact retention error:", e);
  }
}

// Run once on startup, then daily at 03:00
pruneOldArtifacts();
cron.schedule("0 3 * * *", () => pruneOldArtifacts());

// ── Scheduled scans: every 5 minutes ──
cron.schedule("*/5 * * * *", async () => {
  checkEscalations().catch(console.error);

  if (scanBusy) {
    console.log("⏳ Scan in progress, skipping scheduled tick");
    return;
  }

  // Skip if any run is already executing (e.g. manual scan from the API process)
  const runningCount = await prisma.run.count({ where: { status: "running" } }).catch(() => 0);
  if (runningCount > 0) {
    console.log(`⏳ ${runningCount} run(s) already executing, skipping scheduled tick`);
    return;
  }

  try {
    // Cutoff = "now minus the shortest possible schedule" — filter further per-site below
    // since each site has its own schedule interval and SQLite doesn't support cross-column math.
    const candidates = await prisma.site.findMany({
      where: {
        isActive: true,
        schedule: { gt: 0 },
        OR: [
          { lastRunAt: null },
          { lastRunAt: { lt: new Date(Date.now() - 60_000) } }, // at least 1 min old
        ],
      },
      include: { journeys: { where: { isDefault: true } } },
    });

    for (const site of candidates) {
      if (scanBusy) break;

      const minutesSinceLastRun = site.lastRunAt
        ? (Date.now() - site.lastRunAt.getTime()) / 60000
        : Infinity;
      if (minutesSinceLastRun < site.schedule) continue;

      for (const journey of site.journeys) {
        if (scanBusy) break;
        scanBusy = true;
        try {
          await runJourney(site, journey);
        } finally {
          scanBusy = false;
        }
      }
    }
  } catch (error) {
    console.error("Scheduler error:", error);
  }
});

async function runJourney(site: any, journey: any, existingRunId?: string) {
  console.log(`▶️  Running AI-powered test for ${site.name}${existingRunId ? ` (manual run ${existingRunId})` : ""}`);

  // Use existing run record (manual) or create a new one (scheduled)
  let run;
  if (existingRunId) {
    run = await prisma.run.update({
      where: { id: existingRunId },
      data: { status: "running" },
    });
  } else {
    run = await prisma.run.create({
      data: {
        siteId: site.id,
        journeyId: journey.id,
        status: "running",
        triggeredBy: "scheduler",
        totalSteps: 0,
      },
    });
  }

  // Broadcast to any live viewers watching this run
  const { broadcast } = await import("../lib/ws-server");
  broadcast(run.id, { type: "run-status", status: "running" });

  try {
    // Set up artifacts directory
    const artifactsDir = path.join(process.cwd(), "artifacts", site.id, run.id);

    // Scheduled runs have no live viewer — skip screencast + cursor jitter.
    const result = await executeAITest({
      url: site.baseUrl,
      runId: run.id,
      siteId: site.id,
      artifactsDir,
      maxElements: 50,
      timeoutPerElement: 5000,
      liveView: false,
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
