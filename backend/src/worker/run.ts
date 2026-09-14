import "./env";
import path from "node:path";
import { executeAITest, RunDeadlineError } from "../lib/ai-executor";
import { prisma } from "../lib/prisma";
import { killProcessGroup } from "./process-control";
import { artifactRoot } from "../lib/storage";

let browserPid: number | undefined;
let orphaned = false;
let sending = false;
process.once("disconnect", () => { orphaned = true; killProcessGroup(browserPid); });

function send(message: object) {
  if (!process.connected) return;
  process.send?.(message, (error) => { if (error) orphaned = true; });
}

async function main() {
  const run = await prisma.run.findUniqueOrThrow({ where: { id: process.argv[2] }, include: { site: true } });
  if (run.status !== "running" || !run.deadlineAt) throw new Error("Run has not been claimed");
  let completion;
  try {
    const result = await executeAITest({
      url: run.site.baseUrl, runId: run.id, siteId: run.siteId,
      timeoutMs: Math.max(1, run.deadlineAt.getTime() - Date.now() - 5000),
      artifactsDir: path.join(artifactRoot(), run.siteId, run.id),
      onBrowserProcess: (pid) => {
        browserPid = pid || undefined;
        if (orphaned) killProcessGroup(browserPid);
        else send({ type: "browser-process", pid });
      },
      onBroadcast: (event) => {
        if (orphaned) throw new Error("Worker disconnected");
        const frame = (event as { type?: string }).type === "browser-frame";
        if ((frame && sending) || !process.connected) return;
        if (frame) sending = true;
        process.send?.({ type: "progress", event }, () => { if (frame) sending = false; });
      },
    });
    completion = { status: result.overallStatus, summary: result.summary };
  } catch (error) {
    completion = { status: error instanceof RunDeadlineError ? "timeout" : "error", error: error instanceof Error ? error.message.slice(0, 2000) : "Execution failed" };
  } finally { await prisma.$disconnect(); }
  if (process.connected) await new Promise<void>((resolve) => process.send?.({ type: "result", completion }, () => resolve()));
}

main().catch((error) => { console.error("Run process failed", error); process.exitCode = 1; }).finally(() => {
  killProcessGroup(browserPid);
  if (process.connected) process.disconnect();
});
