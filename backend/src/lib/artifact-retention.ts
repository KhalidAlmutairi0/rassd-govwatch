import path from "node:path";
import { lstat, realpath, rm } from "node:fs/promises";
import { prisma } from "./prisma";
import { queueTransaction, terminalStatuses, QueueError } from "./run-queue";
import { artifactRoot } from "./storage";

export function artifactPath(key: string) {
  const parts = key.split("/");
  if (!parts.length || parts.some((part) => !/^[a-zA-Z0-9_.-]+$/.test(part) || part === "." || part === "..")) throw new Error("Invalid artifact path");
  return path.join(artifactRoot(), ...parts);
}

export async function removeArtifactDirectory(key: string) {
  const target = artifactPath(key);
  let current = artifactRoot();
  try {
    if ((await lstat(current)).isSymbolicLink()) throw new Error("Artifact root is a symlink");
    for (const part of key.split("/")) {
      current = path.join(current, part);
      if ((await lstat(current)).isSymbolicLink()) throw new Error("Artifact path contains a symlink");
    }
    const root = await realpath(artifactRoot());
    if (!(await realpath(target)).startsWith(root + path.sep)) throw new Error("Invalid artifact directory");
    await rm(target, { recursive: true, force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function deleteSite(siteId: string) {
  return queueTransaction(async (tx) => {
    if (await tx.run.count({ where: { siteId, status: "running" } })) throw new QueueError("Site has an active run. Try again after it finishes.", 409);
    await tx.artifactCleanup.upsert({ where: { id: siteId }, create: { id: siteId }, update: { dueAt: new Date() } });
    return tx.site.delete({ where: { id: siteId } });
  });
}

export async function cleanupArtifacts() {
  const rawDays = Number(process.env.ARTIFACT_RETENTION_DAYS || 7);
  const days = Number.isFinite(rawDays) ? Math.min(365, Math.max(1, rawDays)) : 7;
  const runs = await prisma.run.findMany({ where: {
    status: { in: terminalStatuses }, evidenceDeletedAt: null, finishedAt: { lt: new Date(Date.now() - days * 86_400_000) },
  }, select: { id: true, siteId: true }, take: 50, orderBy: { finishedAt: "asc" } });
  for (const run of runs) {
    try {
      await removeArtifactDirectory(`${run.siteId}/${run.id}`);
      await prisma.$transaction([
        prisma.artifact.deleteMany({ where: { runId: run.id } }),
        prisma.runStep.updateMany({ where: { runId: run.id }, data: { screenshotPath: null } }),
        prisma.elementTestResult.updateMany({ where: { runId: run.id }, data: { screenshotBefore: null, screenshotAfter: null } }),
        prisma.run.update({ where: { id: run.id }, data: { evidenceDeletedAt: new Date() } }),
      ]);
    } catch (error) { console.error(`Artifact retention deferred for ${run.id}`, error); }
  }
  const pending = await prisma.artifactCleanup.findMany({ where: { dueAt: { lte: new Date() } }, orderBy: { dueAt: "asc" }, take: 50 });
  for (const job of pending) {
    try {
      const parts = job.id.split("/");
      if (parts.length === 3 && parts[2] === "runtime" && await prisma.run.count({ where: { id: parts[1], status: { in: ["queued", "running"] } } })) continue;
      await removeArtifactDirectory(job.id);
      await prisma.artifactCleanup.deleteMany({ where: { id: job.id } });
    } catch (error) {
      console.error(`Artifact cleanup deferred for ${job.id}`, error);
      await prisma.artifactCleanup.updateMany({ where: { id: job.id }, data: { dueAt: new Date(Date.now() + 60_000) } });
    }
  }
}
