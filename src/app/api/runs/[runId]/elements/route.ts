// src/app/api/runs/[runId]/elements/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: { runId: string } }
) {
  try {
    const { runId } = params;

    // Fetch element test results for the run
    const elements = await prisma.elementTestResult.findMany({
      where: { runId },
      orderBy: { createdAt: "asc" },
    });

    // Group elements by status
    const summary = {
      total: elements.length,
      passed: elements.filter((e) => e.status === "passed").length,
      failed: elements.filter((e) => e.status === "failed").length,
      byType: {} as Record<string, { total: number; passed: number; failed: number }>,
    };

    // Calculate stats by element type
    elements.forEach((element) => {
      if (!summary.byType[element.elementType]) {
        summary.byType[element.elementType] = { total: 0, passed: 0, failed: 0 };
      }
      summary.byType[element.elementType].total++;
      if (element.status === "passed") {
        summary.byType[element.elementType].passed++;
      } else if (element.status === "failed") {
        summary.byType[element.elementType].failed++;
      }
    });

    return NextResponse.json({
      elements,
      summary,
    });
  } catch (error: any) {
    console.error("[GET /api/runs/[runId]/elements] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch element test results" },
      { status: 500 }
    );
  }
}
