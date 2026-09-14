import { prisma } from "../lib/prisma";
import { hasArtifactCapacity } from "../lib/storage";

export async function GET() {
  try {
    const worker = await prisma.workerState.findUnique({ where: { id: "primary" } });
    const healthy = !!worker && Date.now() - worker.heartbeatAt.getTime() < 30_000;
    const storage = await hasArtifactCapacity().catch(() => false);
    const [queued, running, oldest] = await Promise.all([
      prisma.run.count({ where: { status: "queued" } }),
      prisma.run.count({ where: { status: "running" } }),
      prisma.run.findFirst({ where: { status: "queued" }, orderBy: { queuedAt: "asc" }, select: { queuedAt: true } }),
    ]);
    return Response.json({ database: "ok", worker: healthy ? "ok" : "unavailable", storage: storage ? "ok" : "unavailable", queue: { queued, running, oldestAgeMs: oldest ? Date.now() - oldest.queuedAt.getTime() : 0 } }, { status: healthy && storage ? 200 : 503 });
  } catch { return Response.json({ database: "unavailable", worker: "unknown" }, { status: 503 }); }
}
