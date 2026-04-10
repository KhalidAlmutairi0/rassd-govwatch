// src/app/api/gov/daily-brief/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getGreeting, toHijriDate, getGrade } from "@/lib/scoring";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "governor") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const now = new Date();

    // ── Portfolio aggregate score ────────────────────────────────────────────
    const sites = await prisma.site.findMany({
      where: { isActive: true },
      select: { id: true, name: true, nameAr: true },
    });

    // Latest score per site
    let totalScore = 0;
    let scoredSites = 0;
    let improved = 0;
    let declined = 0;
    let stable = 0;
    let weeklyChange: number | null = null;

    for (const site of sites) {
      const latest = await (prisma as any).siteScore.findFirst({
        where: { siteId: site.id },
        orderBy: { computedAt: "desc" },
      });
      const prev = await (prisma as any).siteScore.findFirst({
        where: { siteId: site.id },
        orderBy: { computedAt: "desc" },
        skip: 1,
      });

      if (latest) {
        totalScore += latest.overallScore;
        scoredSites++;
        if (prev) {
          const diff = latest.overallScore - prev.overallScore;
          if (diff > 2) improved++;
          else if (diff < -2) declined++;
          else stable++;
        } else {
          stable++;
        }
      }
    }

    const portfolioScore = scoredSites > 0 ? Math.round(totalScore / scoredSites) : 50;
    const portfolioGrade = getGrade(portfolioScore);

    // Weekly change: compare this week's avg to last week's avg
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const thisWeekScores = await (prisma as any).siteScore.findMany({
      where: { computedAt: { gte: oneWeekAgo } },
      select: { overallScore: true },
    });
    const lastWeekScores = await (prisma as any).siteScore.findMany({
      where: { computedAt: { gte: twoWeeksAgo, lt: oneWeekAgo } },
      select: { overallScore: true },
    });

    if (thisWeekScores.length > 0 && lastWeekScores.length > 0) {
      const thisAvg = Math.round(
        thisWeekScores.reduce((s: number, r: { overallScore: number }) => s + r.overallScore, 0) / thisWeekScores.length
      );
      const lastAvg = Math.round(
        lastWeekScores.reduce((s: number, r: { overallScore: number }) => s + r.overallScore, 0) / lastWeekScores.length
      );
      weeklyChange = thisAvg - lastAvg;
    }

    // ── What's new: recent incidents (last 48h) ──────────────────────────────
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const recentIncidents = await prisma.incident.findMany({
      where: { firstSeenAt: { gte: twoDaysAgo } },
      include: { site: { select: { nameAr: true, name: true } } },
      orderBy: { firstSeenAt: "desc" },
      take: 10,
    });
    const recentResolved = await prisma.incident.findMany({
      where: { resolvedAt: { gte: twoDaysAgo } },
      include: { site: { select: { nameAr: true, name: true } } },
      orderBy: { resolvedAt: "desc" },
      take: 5,
    });

    const whatsNew = [
      ...recentResolved.map((i) => ({
        id: i.id + "-resolved",
        title: `تعافت: ${i.title}`,
        siteNameAr: i.site.nameAr || i.site.name,
        type: "recovery",
        createdAt: i.resolvedAt?.toISOString() ?? now.toISOString(),
      })),
      ...recentIncidents.map((i) => ({
        id: i.id,
        title: i.title,
        siteNameAr: i.site.nameAr || i.site.name,
        type: "incident",
        createdAt: i.firstSeenAt.toISOString(),
      })),
    ].slice(0, 8);

    // ── Needs attention: open/investigating incidents ────────────────────────
    const openIncidents = await prisma.incident.findMany({
      where: { status: { in: ["open", "investigating"] } },
      include: { site: { select: { nameAr: true, name: true } } },
      orderBy: [{ severity: "desc" }, { lastSeenAt: "desc" }],
      take: 8,
    });

    const needsAttention = openIncidents.map((i) => ({
      id: i.id,
      siteNameAr: i.site.nameAr || i.site.name,
      description: i.description || i.title,
      severity: i.severity,
    }));

    // ── What to do: open directives ──────────────────────────────────────────
    const openDirectives = await (prisma as any).directive.findMany({
      where: { status: { in: ["open", "overdue"] } },
      include: { site: { select: { nameAr: true, name: true } } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 8,
    });

    const whatToDo = openDirectives.map((d: any) => ({
      id: d.id,
      title: d.title,
      dueDate: d.dueDate?.toISOString() ?? null,
      isOverdue: d.dueDate ? new Date(d.dueDate) < now : false,
      site: {
        nameAr: d.site.nameAr ?? null,
        name: d.site.name,
      },
    }));

    return NextResponse.json({
      date: toHijriDate(now),
      greeting: getGreeting(),
      userName: user.nameAr || user.name || user.email.split("@")[0],
      portfolioScore,
      portfolioGrade,
      weeklyChange,
      improved,
      declined,
      stable,
      whatsNew,
      needsAttention,
      whatToDo,
    });
  } catch (error) {
    console.error("[DAILY-BRIEF] Error:", error);
    return NextResponse.json({ error: "Failed to load daily brief" }, { status: 500 });
  }
}
