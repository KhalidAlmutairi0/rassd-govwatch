import "./env";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { fork, type ChildProcess } from "node:child_process";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { claimNextRun, enqueueRun, finishRun, recoverExpiredRuns, MAX_CONCURRENT_RUNS, RUN_TIMEOUT_MS, QueueError, type RunCompletion } from "../lib/run-queue";
import { broadcast, initWebSocketServer } from "../lib/ws-server";
import { cleanupArtifacts, removeArtifactDirectory } from "../lib/artifact-retention";
import { killProcessGroup, terminateRunProcesses } from "./process-control";
import { artifactRoot, hasArtifactCapacity } from "../lib/storage";

interface ActiveRun { child: ChildProcess; timer: NodeJS.Timeout; browserPid?: number; directory: string; finalizing?: Promise<void> }
const active = new Map<string, ActiveRun>();
let stopping = false;
let ticking = false;
let lastScheduledAt = 0;
let lastCleanupAt = 0;
let maintenance: Promise<void> | undefined;
let scheduling: Promise<void> | undefined;
let lastDiskWarningAt = 0;
const completionSchema = z.object({ status: z.enum(["passed", "failed", "warning", "error", "timeout"]), summary: z.string().max(50_000).optional(), error: z.string().max(4000).optional() });

function complete(runId: string, completion: RunCompletion): Promise<void> {
  const state = active.get(runId);
  if (!state) return Promise.resolve();
  if (state.finalizing) return state.finalizing;
  clearTimeout(state.timer);
  state.finalizing = Promise.resolve().then(async () => {
    await terminateRunProcesses(state.child, state.browserPid);
    let runtimeRemoved = false;
    try {
      await removeArtifactDirectory(state.directory);
      runtimeRemoved = true;
    } catch (error) { console.error("Runtime cleanup deferred", error); }
    const saved = await finishRun(runId, completion);
    if (saved) broadcast(runId, { type: "run-complete", status: saved.status });
    if (runtimeRemoved) await prisma.artifactCleanup.deleteMany({ where: { id: state.directory } });
    active.delete(runId);
  }).catch((error) => {
    state.finalizing = undefined;
    state.timer = setTimeout(() => { void complete(runId, completion).catch(console.error); }, 1000);
    throw error;
  });
  return state.finalizing;
}

async function scheduleDueSites() {
  if (process.env.SCHEDULER_ENABLED === "false") return;
  let cursor: string | undefined;
  do {
    const sites = await prisma.site.findMany({
      where: { isActive: true, schedule: { gt: 0 } }, orderBy: [{ lastRunAt: "asc" }, { id: "asc" }], take: 50,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, schedule: true, lastRunAt: true, journeys: { where: { isDefault: true }, select: { id: true } } },
    });
    for (const site of sites) {
      if (site.lastRunAt && Date.now() - site.lastRunAt.getTime() < site.schedule * 60_000) continue;
      for (const journey of site.journeys) {
        if (stopping) return;
        try { await enqueueRun(site.id, journey.id, "scheduler"); }
        catch (error) { if (error instanceof QueueError && error.status === 429) return; throw error; }
      }
    }
    cursor = sites.length === 50 ? sites[sites.length - 1].id : undefined;
  } while (cursor && !stopping);
}

async function tick() {
  if (ticking || stopping) return;
  ticking = true;
  try {
    if (!maintenance && Date.now() - lastCleanupAt >= 60_000) {
      lastCleanupAt = Date.now();
      maintenance = cleanupArtifacts().catch(console.error).finally(() => { maintenance = undefined; });
    }
    await prisma.workerState.upsert({ where: { id: "primary" }, create: { id: "primary" }, update: { heartbeatAt: new Date() } });
    await recoverExpiredRuns([...active.keys()]);
    if (!scheduling && Date.now() - lastScheduledAt >= 60_000) {
      lastScheduledAt = Date.now();
      scheduling = scheduleDueSites().catch((error) => console.error("Scheduling failed", error)).finally(() => { scheduling = undefined; });
    }
    if (!await hasArtifactCapacity()) {
      if (Date.now() - lastDiskWarningAt >= 60_000) {
        lastDiskWarningAt = Date.now();
        console.error("Browser admission paused: artifact disk reserve reached");
      }
      return;
    }
    while (!stopping && active.size < MAX_CONCURRENT_RUNS) {
      const run = await claimNextRun();
      if (!run) break;
      try {
        if (stopping) { await finishRun(run.id, { status: "error", error: "Worker is shutting down" }); break; }
        const directory = `${run.siteId}/${run.id}/runtime`;
        const runtimePath = path.join(artifactRoot(), directory);
        await prisma.artifactCleanup.create({ data: { id: directory, dueAt: new Date(Date.now() + RUN_TIMEOUT_MS + 60_000) } });
        await mkdir(runtimePath, { recursive: true });
        const development = __filename.endsWith(".ts");
        const child = fork(path.join(__dirname, development ? "run.ts" : "run.js"), [run.id], {
          execArgv: development ? ["--import", require.resolve("tsx")] : [], detached: process.platform !== "win32", stdio: ["ignore", "inherit", "inherit", "ipc"],
          env: { ...process.env, TMPDIR: runtimePath, TMP: runtimePath, TEMP: runtimePath },
        });
        const fail = (error: unknown) => console.error(`Run ${run.id} finalization failed`, error);
        const timer = setTimeout(() => { void complete(run.id, { status: "timeout", error: `Run exceeded the ${RUN_TIMEOUT_MS / 1000}-second deadline` }).catch(fail); }, Math.max(1, run.deadlineAt!.getTime() - Date.now()));
        active.set(run.id, { child, timer, directory });
        console.info(JSON.stringify({ event: "run-started", runId: run.id, pid: child.pid }));
        child.on("message", (message: unknown) => {
          if (!message || typeof message !== "object") return;
          const data = message as { type?: string; completion?: unknown; event?: object; pid?: number };
          const state = active.get(run.id);
          if (!state || state.finalizing) return;
          if (data.type === "browser-process" && Number.isInteger(data.pid) && data.pid! >= 0) {
            state.browserPid = data.pid || undefined;
            if (data.pid) console.info(JSON.stringify({ event: "browser-started", runId: run.id, pid: data.pid }));
          }
          if (data.type === "progress" && data.event) broadcast(run.id, data.event);
          if (data.type === "result") {
            const parsed = completionSchema.safeParse(data.completion);
            void complete(run.id, parsed.success ? parsed.data : { status: "error", error: "Invalid execution result" }).catch(fail);
          }
        });
        child.once("error", (error) => { void complete(run.id, { status: "error", error: error.message }).catch(fail); });
        child.once("exit", () => { void complete(run.id, { status: "error", error: "Browser worker exited before reporting a result" }).catch(fail); });
        broadcast(run.id, { type: "run-status", status: "running", startedAt: run.startedAt });
      } catch (error) {
        await finishRun(run.id, { status: "error", error: error instanceof Error ? error.message : "Runner startup failed" });
      }
    }
  } catch (error) { console.error("Worker tick failed", error); }
  finally { ticking = false; }
}

async function main() {
  if (process.platform === "win32") throw new Error("Worker execution requires POSIX process groups");
  await mkdir(artifactRoot(), { recursive: true });
  const server = initWebSocketServer();
  await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  if (process.env.INVOCATION_ID && process.env.RASD_SYSTEMD_MANAGED === "true") {
    // systemd has terminated the previous invocation's entire control group before this start.
    const interrupted = await prisma.run.findMany({ where: { status: "running" }, select: { id: true, siteId: true } });
    for (const run of interrupted) await removeArtifactDirectory(`${run.siteId}/${run.id}/runtime`);
    for (const run of interrupted) await finishRun(run.id, { status: "error", error: "Worker service restarted before completion" });
  }
  await prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL");
  const interval = setInterval(() => { void tick(); }, 1000);
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(interval);
    const deadline = setTimeout(() => {
      for (const state of active.values()) {
        try { killProcessGroup(state.browserPid); } catch (error) { console.error(error); }
        try { killProcessGroup(state.child.pid); } catch (error) { console.error(error); }
      }
      process.exit(1);
    }, 20_000);
    while (ticking) await new Promise((resolve) => setTimeout(resolve, 50));
    await Promise.allSettled([...active.keys()].map((id) => complete(id, { status: "error", error: "Worker shut down before completion" })));
    await maintenance;
    await scheduling;
    for (const socket of server.clients) socket.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.workerState.deleteMany({ where: { id: "primary" } });
    await prisma.$disconnect();
    clearTimeout(deadline);
    process.exit(active.size ? 1 : 0);
  };
  process.once("SIGINT", () => { void shutdown(); });
  process.once("SIGTERM", () => { void shutdown(); });
  process.once("disconnect", () => { void shutdown(); });
  await tick();
  console.info(JSON.stringify({ event: "worker-ready", pid: process.pid }));
  console.log(`Worker ready: ${MAX_CONCURRENT_RUNS} browser slots; ${RUN_TIMEOUT_MS / 1000}s deadline`);
}

main().catch((error) => { console.error("Worker could not start", error); process.exit(1); });
