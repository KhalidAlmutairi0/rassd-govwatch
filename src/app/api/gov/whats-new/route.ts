// src/app/api/gov/whats-new/route.ts
// Powers Screen 3 — What's New (event feed since last visit)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

type EventColor = "red" | "green" | "orange" | "blue";
type EventAction = "view" | "acknowledge";

interface FeedEvent {
  id: string;
  color: EventColor;
  title: string;
  time: Date;
  action: EventAction;
  siteId?: string;
  incidentId?: string;
  directiveId?: string;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "governor") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const events: FeedEvent[] = [];
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // last 7 days

    // ── 1. New / escalated critical incidents (red / orange) ─────────────────
    const openIncidents = await prisma.incident.findMany({
      where: {
        status: { in: ["open", "investigating"] },
        firstSeenAt: { gte: cutoff },
      },
      include: { site: true },
      orderBy: { firstSeenAt: "desc" },
      take: 10,
    });
    for (const inc of openIncidents) {
      events.push({
        id: `incident-new-${inc.id}`,
        color: inc.severity === "critical" ? "red" : "orange",
        title: `${inc.site.nameAr || inc.site.name}: ${inc.title}`,
        time: inc.firstSeenAt,
        action: "view",
        siteId: inc.siteId,
        incidentId: inc.id,
      });
    }

    // ── 2. Resolved incidents (green) ────────────────────────────────────────
    const resolvedIncidents = await prisma.incident.findMany({
      where: {
        status: "resolved",
        resolvedAt: { gte: cutoff },
      },
      include: { site: true },
      orderBy: { resolvedAt: "desc" },
      take: 5,
    });
    for (const inc of resolvedIncidents) {
      events.push({
        id: `incident-resolved-${inc.id}`,
        color: "green",
        title: `${inc.site.nameAr || inc.site.name}: Issue resolved — ${inc.title}`,
        time: inc.resolvedAt!,
        action: "acknowledge",
        siteId: inc.siteId,
        incidentId: inc.id,
      });
    }

    // ── 3. Recently resolved / closed directives (green) ─────────────────────
    const resolvedDirectives = await (prisma as any).directive.findMany({
      where: {
        status: "resolved",
        resolvedAt: { gte: cutoff },
      },
      include: { site: true },
      orderBy: { resolvedAt: "desc" },
      take: 5,
    });
    for (const dir of resolvedDirectives) {
      events.push({
        id: `directive-resolved-${dir.id}`,
        color: "green",
        title: `Directive resolved: ${dir.title}`,
        time: dir.resolvedAt,
        action: "acknowledge",
        siteId: dir.siteId,
        directiveId: dir.id,
      });
    }

    // ── 4. Score milestones — sites that recently reached A/B grade (blue) ───
    const recentScores = await (prisma as any).siteScore.findMany({
      where: {
        computedAt: { gte: cutoff },
        grade: { in: ["A", "B"] },
      },
      include: { site: true },
      orderBy: { computedAt: "desc" },
      take: 5,
      distinct: ["siteId"],
    });
    for (const score of recentScores) {
      events.push({
        id: `score-milestone-${score.id}`,
        color: "blue",
        title: `${score.site.nameAr || score.site.name} achieved ${score.grade} rating (${score.overallScore}/100)`,
        time: score.computedAt,
        action: "acknowledge",
        siteId: score.siteId,
      });
    }

    // ── 5. Score drops > 10 points (red) ─────────────────────────────────────
    // For each site compare newest vs previous score
    const sites = await prisma.site.findMany({ where: { isActive: true }, select: { id: true, name: true, nameAr: true } });
    for (const site of sites) {
      const latest2 = await (prisma as any).siteScore.findMany({
        where: { siteId: site.id },
        orderBy: { computedAt: "desc" },
        take: 2,
      });
      if (latest2.length === 2) {
        const drop = latest2[1].overallScore - latest2[0].overallScore;
        if (drop >= 10 && new Date(latest2[0].computedAt).getTime() >= cutoff.getTime()) {
          events.push({
            id: `score-drop-${site.id}-${latest2[0].id}`,
            color: "red",
            title: `${site.nameAr || site.name} dropped from ${latest2[1].overallScore} to ${latest2[0].overallScore}`,
            time: latest2[0].computedAt,
            action: "view",
            siteId: site.id,
          });
        }
      }
    }

    // Sort newest first
    events.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    return NextResponse.json({ events: events.slice(0, 15) });
  } catch (error) {
    console.error("[WHATS-NEW] Error:", error);
    return NextResponse.json({ error: "Failed to load feed" }, { status: 500 });
  }
}
