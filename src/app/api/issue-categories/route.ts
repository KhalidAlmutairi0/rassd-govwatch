import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";

export async function GET() {
  try {
    // Only look at the LATEST completed run per site — not all historical data
    const sites = await prisma.site.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    const latestRunIds: string[] = [];
    for (const site of sites) {
      const latestRun = await prisma.run.findFirst({
        where: { siteId: site.id, status: { in: ["passed", "failed"] } },
        orderBy: { startedAt: "desc" },
        select: { id: true },
      });
      if (latestRun) latestRunIds.push(latestRun.id);
    }

    if (latestRunIds.length === 0) {
      return NextResponse.json({
        categories: [
          { label: "UX", count: 0, pct: 0 },
          { label: "QA", count: 0, pct: 0 },
          { label: "Accessibility", count: 0, pct: 0 },
          { label: "Performance", count: 0, pct: 0 },
        ],
        total: 0,
      });
    }

    const elements = await prisma.elementTestResult.findMany({
      where: {
        runId: { in: latestRunIds },
        status: { in: ["failed", "warning"] },
      },
      select: { elementType: true, error: true, domChanges: true, responseTimeMs: true },
    });

    const catCounts: Record<string, number> = { UX: 0, QA: 0, Accessibility: 0, Performance: 0 };

    for (const el of elements) {
      const err = ((el.error || "") + " " + (el.domChanges || "")).toLowerCase();
      const type = (el.elementType || "").toLowerCase();

      if (
        err.includes("timeout") || err.includes("slow") || err.includes("network") ||
        err.includes("502") || err.includes("503") ||
        (el.responseTimeMs && el.responseTimeMs > 3000)
      ) {
        catCounts.Performance++;
      } else if (
        err.includes("aria") || err.includes("label") || err.includes("focus") ||
        err.includes("accessibility") || err.includes("contrast") || err.includes("alt")
      ) {
        catCounts.Accessibility++;
      } else if (
        type.includes("nav") || type.includes("link") || type.includes("button") ||
        type.includes("tab") || type.includes("menu") || type.includes("cta") ||
        err.includes("navigation") || err.includes("click") || err.includes("not found")
      ) {
        catCounts.UX++;
      } else {
        catCounts.QA++;
      }
    }

    const total = Object.values(catCounts).reduce((a, b) => a + b, 0);
    const categories = Object.entries(catCounts)
      .map(([label, count]) => ({
        label,
        count,
        pct: total > 0 ? Math.max(count > 0 ? 1 : 0, Math.round((count / total) * 100)) : 0,
      }))
      .sort((a, b) => b.pct - a.pct);

    return NextResponse.json({ categories, total });
  } catch (error) {
    console.error("[ISSUE CATEGORIES] Error:", error);
    return NextResponse.json({ categories: [], total: 0 }, { status: 500 });
  }
}
