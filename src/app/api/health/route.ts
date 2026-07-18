import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";

export async function GET() {
  try {
    const [queuedRuns, runningRuns, recentRuns] = await Promise.all([
      prisma.run.count({ where: { status: "queued" } }),
      prisma.run.count({ where: { status: "running" } }),
      prisma.run.findMany({
        orderBy: { startedAt: "desc" },
        take: 3,
        select: { id: true, status: true, startedAt: true, triggeredBy: true },
      }),
    ]);
    return NextResponse.json({
      status: "ok",
      queued: queuedRuns,
      running: runningRuns,
      recentRuns,
    });
  } catch {
    return NextResponse.json({ status: "ok" });
  }
}
