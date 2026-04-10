// GET /api/gov/runs — real recent runs across all sites for the governor view
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "governor") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const runs = await prisma.run.findMany({
      orderBy: { startedAt: "desc" },
      take: 20,
      select: {
        id: true,
        status: true,
        triggeredBy: true,
        passedSteps: true,
        failedSteps: true,
        totalSteps: true,
        durationMs: true,
        startedAt: true,
        finishedAt: true,
        site: {
          select: { id: true, name: true, nameAr: true, baseUrl: true },
        },
      },
    });

    return NextResponse.json({ runs });
  } catch (error) {
    console.error("[GOV] Runs error:", error);
    return NextResponse.json({ error: "Failed to load runs" }, { status: 500 });
  }
}
