// src/app/api/runs/[runId]/start/route.ts
// This route just signals that the client is ready. The actual execution
// happens in the worker process (scheduler.ts) which owns the WS server
// and can broadcast frames directly — no cross-process relay needed.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    console.log(`[START] Client ready for run ${runId}`);

    const run = await prisma.run.findUnique({
      where: { id: runId },
      select: { id: true, status: true },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    if (run.status === "running") {
      return NextResponse.json({ success: true, alreadyRunning: true });
    }

    if (["passed", "failed", "error"].includes(run.status)) {
      return NextResponse.json(
        { error: `Run already ${run.status}`, redirect: `/report/${runId}` },
        { status: 400 }
      );
    }

    // Run stays "queued" — the worker picks it up within 2 seconds
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in start route:", error);
    return NextResponse.json(
      { error: error.message || "Failed" },
      { status: 500 }
    );
  }
}
