// src/app/api/gov/portfolio-health/route.ts
// Powers Screen 2 — Portfolio Health (overall score, grade, sparkline, improved/declined/stable)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { computeSiteScores, getGrade, getScoreHistory } from "@/lib/scoring";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "governor") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const sites = await prisma.site.findMany({
      where: { isActive: true },
      select: { id: true, name: true, nameAr: true },
    });

    if (sites.length === 0) {
      return NextResponse.json({
        overallScore: 0,
        grade: "F",
        improved: 0,
        declined: 0,
        stable: 0,
        weeklyChange: null,
        sparkline: [],
      });
    }

    // Get current + previous scores for each site
    const now = Date.now();
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    const siteScores = await Promise.all(
      sites.map(async (site) => {
        // Current score
        const current = await (prisma as any).siteScore.findFirst({
          where: { siteId: site.id },
          orderBy: { computedAt: "desc" },
        });

        // Previous score (> 7 days ago)
        const previous = await (prisma as any).siteScore.findFirst({
          where: {
            siteId: site.id,
            computedAt: { lt: new Date(now - ONE_WEEK_MS) },
          },
          orderBy: { computedAt: "desc" },
        });

        // If no stored score, compute live
        let currentScore: number;
        if (current) {
          currentScore = current.overallScore;
        } else {
          const live = await computeSiteScores(site.id);
          currentScore = live.overall;
        }

        const previousScore = previous?.overallScore ?? null;
        return { siteId: site.id, current: currentScore, previous: previousScore };
      })
    );

    // Classify each site vs last week
    let improved = 0, declined = 0, stable = 0;
    for (const s of siteScores) {
      if (s.previous === null) { stable++; continue; }
      const diff = s.current - s.previous;
      if (diff >= 3) improved++;
      else if (diff <= -3) declined++;
      else stable++;
    }

    // Portfolio overall = average of all site scores
    const avgCurrent = Math.round(
      siteScores.reduce((sum, s) => sum + s.current, 0) / siteScores.length
    );
    const previousWithData = siteScores.filter((s) => s.previous !== null);
    const avgPrevious =
      previousWithData.length > 0
        ? Math.round(
            previousWithData.reduce((sum, s) => sum + s.previous!, 0) /
              previousWithData.length
          )
        : null;

    const weeklyChange =
      avgPrevious !== null ? avgCurrent - avgPrevious : null;

    // Aggregate sparkline: average across all sites per week bucket
    const allHistories = await Promise.all(
      sites.map((s) => getScoreHistory(s.id))
    );
    const maxLen = Math.max(...allHistories.map((h) => h.length), 0);
    const sparkline: number[] = [];
    for (let i = 0; i < maxLen; i++) {
      const vals = allHistories
        .map((h) => h[i])
        .filter((v) => v !== undefined && v > 0);
      sparkline.push(
        vals.length > 0 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0
      );
    }

    return NextResponse.json({
      overallScore: avgCurrent,
      grade: getGrade(avgCurrent),
      improved,
      declined,
      stable,
      weeklyChange,
      sparkline,
      totalSites: sites.length,
    });
  } catch (error) {
    console.error("[PORTFOLIO-HEALTH] Error:", error);
    return NextResponse.json({ error: "Failed to load portfolio health" }, { status: 500 });
  }
}
