// src/app/api/gov/sites/[siteId]/route.ts
// Powers Screen 5 — Site Detail (scores, executive summary, top issues)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getLatestScore, getGrade, getScoreColor, getScoreHistory } from "@/lib/scoring";

export async function GET(
  request: NextRequest,
  { params }: { params: { siteId: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "governor") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { siteId } = params;

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      include: {
        incidents: {
          where: { status: { in: ["open", "investigating"] } },
          orderBy: { severity: "asc" },
          take: 5,
        },
      },
    });

    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    // Scores
    const scores = await getLatestScore(siteId);
    const history = await getScoreHistory(siteId);

    // Latest run's AI summary (if any)
    const latestRun = await prisma.run.findFirst({
      where: { siteId, status: { in: ["passed", "failed"] } },
      orderBy: { startedAt: "desc" },
      select: { aiSummary: true, summaryJson: true },
    });

    // Try aiSummary → summaryJson.text → stored execSummary → fallback
    let execSummary = "";
    if (latestRun?.aiSummary) {
      execSummary = latestRun.aiSummary;
    } else if (latestRun?.summaryJson) {
      try {
        const parsed = JSON.parse(latestRun.summaryJson);
        execSummary = parsed.text || "";
      } catch {}
    }
    if (!execSummary) {
      // Try stored score summary
      const storedScore = await (prisma as any).siteScore.findFirst({
        where: { siteId, execSummary: { not: null } },
        orderBy: { computedAt: "desc" },
        select: { execSummary: true },
      });
      execSummary = storedScore?.execSummary || buildTemplateSummary(site, scores);
    }

    // Top issues from open incidents
    const topIssues = site.incidents.map((inc) => ({
      id: inc.id,
      title: inc.title,
      description: inc.description || "",
      severity: inc.severity,
      color: inc.severity === "critical" ? "#af0818" : inc.severity === "high" ? "#af0818" : "#e67700",
      occurrences: inc.occurrences,
    }));

    // Open directives for this site
    const directives = await (prisma as any).directive.findMany({
      where: { siteId, status: { in: ["open", "overdue"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, title: true, status: true, dueDate: true, createdAt: true },
    });

    return NextResponse.json({
      id: site.id,
      name: site.name,
      nameAr: site.nameAr,
      baseUrl: site.baseUrl,
      status: site.status,
      scores: {
        overall: scores.overall,
        grade: scores.grade,
        ux: scores.ux,
        qa: scores.qa,
        accessibility: scores.accessibility,
        performance: scores.performance,
        color: getScoreColor(scores.overall),
        computedAt: scores.computedAt,
      },
      scoreHistory: history,
      execSummary,
      topIssues,
      directives,
      openIncidentCount: site.incidents.length,
    });
  } catch (error) {
    console.error("[GOV SITE DETAIL] Error:", error);
    return NextResponse.json({ error: "Failed to load site detail" }, { status: 500 });
  }
}

function buildTemplateSummary(
  site: { name: string; status: string },
  scores: { overall: number; grade: string; qa: number; performance: number }
): string {
  const { overall, grade, qa, performance } = scores;

  if (grade === "A" || grade === "B") {
    return `${site.name} is performing well with an overall score of ${overall}/100 (${grade}). QA checks pass at ${qa}% and page performance is within acceptable thresholds. No immediate action required.`;
  }
  if (grade === "C") {
    return `${site.name} shows moderate performance (${overall}/100, grade ${grade}). Some QA checks are failing and performance may be impacting citizen experience. Monitoring is recommended.`;
  }
  return `${site.name} requires immediate attention with a low score of ${overall}/100 (${grade}). QA pass rate is ${qa}% and average performance is degraded. A directive to the technical team is recommended.`;
}
