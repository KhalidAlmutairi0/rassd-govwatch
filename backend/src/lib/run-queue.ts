import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { executionTimeout } from "./run-limits";

export const MAX_CONCURRENT_RUNS = 3;
export const RUN_TIMEOUT_MS = executionTimeout();
export const MAX_QUEUED_RUNS = 100;
export const terminalStatuses = ["passed", "failed", "warning", "error", "timeout"];
export type TerminalStatus = "passed" | "failed" | "warning" | "error" | "timeout";
export interface RunCompletion { status: TerminalStatus; summary?: string; error?: string }

export class QueueError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function queueTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Take SQLite's write lock before reading shared queue capacity.
        await tx.$executeRaw`INSERT INTO QueueLock (id, revision) VALUES (1, 0) ON CONFLICT(id) DO UPDATE SET revision = revision + 1`;
        return operation(tx);
      }, { maxWait: 10_000, timeout: 10_000 });
    } catch (error) {
      if (attempt >= 2 || !(error instanceof Prisma.PrismaClientKnownRequestError) || !["P1008", "P2028", "P2034"].includes(error.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}

async function checkCapacity(tx: Prisma.TransactionClient) {
  if (await tx.run.count({ where: { status: "queued" } }) >= MAX_QUEUED_RUNS) throw new QueueError("Run queue is full. Try again later.", 429);
}

export async function enqueueRun(siteId: string, journeyId: string, triggeredBy: "manual" | "api" | "scheduler") {
  return queueTransaction(async (tx) => {
    const journey = await tx.journey.findFirst({ where: { id: journeyId, siteId }, include: { site: true } });
    if (!journey) throw new QueueError("Journey not found for this site", 404);
    if (triggeredBy === "scheduler" && (!journey.site.isActive || journey.site.schedule <= 0)) return null;
    const existing = await tx.run.findFirst({ where: { siteId, journeyId, status: { in: ["queued", "running"] } } });
    if (existing) return existing;
    if (triggeredBy === "scheduler") {
      const last = await tx.run.findFirst({ where: { journeyId }, orderBy: { queuedAt: "desc" }, select: { queuedAt: true } });
      if (last && Date.now() - last.queuedAt.getTime() < journey.site.schedule * 60_000) return null;
    }
    await checkCapacity(tx);
    return tx.run.create({ data: { siteId, journeyId, triggeredBy } });
  });
}

export async function enqueueInstantTest(url: string) {
  return queueTransaction(async (tx) => {
    await checkCapacity(tx);
    const name = new URL(url).hostname.replace(/^www\./, "");
    const site = await tx.site.create({ data: {
      name, baseUrl: url, schedule: 0, isActive: false, description: "Temporary site for instant test",
      journeys: { create: { name: `${name} Instant Test`, stepsJson: "[]", isDefault: true } },
    }, include: { journeys: true } });
    return tx.run.create({ data: { siteId: site.id, journeyId: site.journeys[0].id, triggeredBy: "api" } });
  });
}

export async function claimNextRun() {
  return queueTransaction(async (tx) => {
    await tx.run.updateMany({ where: {
      status: "queued", triggeredBy: "scheduler", site: { OR: [{ isActive: false }, { schedule: { lte: 0 } }] },
    }, data: { status: "warning", finishedAt: new Date(), summaryJson: JSON.stringify({ text: "Scheduled run cancelled because monitoring was disabled." }) } });
    const running = await tx.run.findMany({ where: { status: "running" }, select: { siteId: true } });
    if (running.length >= MAX_CONCURRENT_RUNS) return null;
    const next = await tx.run.findFirst({
      where: { status: "queued", siteId: { notIn: running.map((run) => run.siteId) } },
      orderBy: [{ queuedAt: "asc" }, { id: "asc" }],
    });
    if (!next) return null;
    const now = new Date();
    const run = await tx.run.update({ where: { id: next.id }, data: {
      status: "running", startedAt: now, deadlineAt: new Date(now.getTime() + RUN_TIMEOUT_MS),
    }, include: { site: true, journey: true } });
    await tx.site.update({ where: { id: run.siteId }, data: { lastRunAt: now } });
    return run;
  });
}

export async function finishRun(runId: string, completion: RunCompletion) {
  return queueTransaction(async (tx) => {
    const run = await tx.run.findFirst({ where: { id: runId, status: "running" }, include: { steps: true, journey: true } });
    if (!run) return null;
    const passedSteps = run.steps.filter((step) => step.status === "passed").length;
    const failedSteps = run.steps.filter((step) => step.status === "failed").length;
    let status = completion.status;
    if (!["error", "timeout"].includes(status)) {
      status = failedSteps > 0 ? "failed" : run.steps.length === 0 || run.steps.length < run.totalSteps || passedSteps !== run.steps.length ? "warning" : status;
    }
    const now = new Date();
    const error = completion.error?.slice(0, 2000);
    const saved = await tx.run.update({ where: { id: runId }, data: {
      status, durationMs: Math.max(0, now.getTime() - run.startedAt.getTime()),
      totalSteps: Math.max(run.totalSteps, run.steps.length), passedSteps, failedSteps, finishedAt: now,
      summaryJson: JSON.stringify({ text: completion.summary || error || "Run ended without a summary. Review the recorded evidence." }),
      aiSummary: completion.summary, errorJson: error ? JSON.stringify({ message: error }) : null,
    } });
    const where = { siteId: run.siteId, journeyId: run.journeyId, status: { in: ["open", "investigating"] } };
    if (failedSteps > 0 || status === "failed") {
      const existing = await tx.incident.findFirst({ where });
      const description = run.steps.filter((step) => step.status === "failed").map((step) => step.error || step.description).join("; ").slice(0, 4000);
      const occurrences = (existing?.occurrences || 0) + 1;
      const severity = occurrences >= 3 ? "critical" : occurrences >= 2 ? "high" : "medium";
      if (existing) await tx.incident.update({ where: { id: existing.id }, data: { occurrences: { increment: 1 }, lastSeenAt: now, description, severity } });
      else await tx.incident.create({ data: { siteId: run.siteId, journeyId: run.journeyId, title: `${run.journey.name} failed`, description, severity } });
    } else if (status === "passed") {
      await tx.incident.updateMany({ where, data: { status: "resolved", resolvedAt: now } });
    }
    const open = await tx.incident.count({ where: { siteId: run.siteId, status: { in: ["open", "investigating"] } } });
    await tx.site.update({ where: { id: run.siteId }, data: {
      status: open > 0 || status === "failed" ? "degraded" : status === "passed" ? "healthy" : "unknown",
    } });
    return saved;
  });
}

export async function recoverExpiredRuns(excludeIds: string[] = []) {
  const expired = await prisma.run.findMany({ where: {
    status: "running", id: { notIn: excludeIds }, OR: [{ deadlineAt: { lte: new Date() } }, { deadlineAt: null }],
  }, select: { id: true }, take: 100 });
  for (const run of expired) await finishRun(run.id, { status: "timeout", error: "Execution deadline expired or the worker stopped before completion." });
  return expired.length;
}
