// src/app/api/sites/[id]/runs/[runId]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/sites/[id]/runs/[runId] - Get run details
export async function GET(
  request: Request,
  { params }: { params: { id: string; runId: string } }
) {
  try {
    const run = await prisma.run.findUnique({
      where: { id: params.runId },
      include: {
        site: true,
        journey: true,
        steps: {
          orderBy: { stepIndex: "asc" },
        },
        artifacts: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    return NextResponse.json({ run });
  } catch (error) {
    console.error("Error fetching run:", error);
    return NextResponse.json(
      { error: "Failed to fetch run" },
      { status: 500 }
    );
  }
}
