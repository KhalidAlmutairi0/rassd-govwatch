// src/app/api/gov/needs-attention/route.ts
// Powers Screen 4 — Needs Your Attention (critical items requiring governor action)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

type ActionType = "issue_directive" | "follow_up" | "escalate";
type Severity = "critical" | "warning" | "info";

interface AttentionItem {
  id: string;
  siteId: string;
  siteName: string;
  siteNameAr: string | null;
  severity: Severity;
  description: string;
  action: ActionType;
  actionLabel: string;
  incidentId?: string;
  directiveId?: string;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "governor") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const items: AttentionItem[] = [];

    // ── 1. Critical open incidents ────────────────────────────────────────────
    const criticalIncidents = await prisma.incident.findMany({
      where: {
        status: { in: ["open", "investigating"] },
        severity: { in: ["critical", "high"] },
      },
      include: { site: true },
      orderBy: { lastSeenAt: "desc" },
      take: 10,
    });

    for (const inc of criticalIncidents) {
      const isCritical = inc.severity === "critical";
      items.push({
        id: `incident-${inc.id}`,
        siteId: inc.siteId,
        siteName: inc.site.name,
        siteNameAr: inc.site.nameAr,
        severity: isCritical ? "critical" : "warning",
        description: inc.description || inc.title,
        action: isCritical ? "issue_directive" : "follow_up",
        actionLabel: isCritical ? "Issue Directive" : "Follow Up",
        incidentId: inc.id,
      });
    }

    // ── 2. Overdue open directives ────────────────────────────────────────────
    const now = new Date();
    const overdueDirectives = await (prisma as any).directive.findMany({
      where: {
        status: "open",
        dueDate: { lt: now },
      },
      include: { site: true },
      orderBy: { dueDate: "asc" },
      take: 5,
    });

    for (const dir of overdueDirectives) {
      const daysOverdue = Math.floor(
        (now.getTime() - new Date(dir.dueDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      items.push({
        id: `directive-overdue-${dir.id}`,
        siteId: dir.siteId,
        siteName: dir.site.name,
        siteNameAr: dir.site.nameAr,
        severity: "warning",
        description: `Overdue directive: ${dir.title} — ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} past deadline.`,
        action: "follow_up",
        actionLabel: "Follow Up",
        directiveId: dir.id,
      });
    }

    // ── 3. Sites with no run in past 24h (possibly down with no data) ─────────
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const staleSites = await prisma.site.findMany({
      where: {
        isActive: true,
        OR: [{ lastRunAt: null }, { lastRunAt: { lt: oneDayAgo } }],
      },
      take: 3,
    });

    for (const site of staleSites) {
      items.push({
        id: `stale-${site.id}`,
        siteId: site.id,
        siteName: site.name,
        siteNameAr: site.nameAr,
        severity: "warning",
        description: "No monitoring data in the last 24 hours. Verify the scanner is running.",
        action: "follow_up",
        actionLabel: "Follow Up",
      });
    }

    // Sort: critical first
    items.sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("[NEEDS-ATTENTION] Error:", error);
    return NextResponse.json({ error: "Failed to load attention items" }, { status: 500 });
  }
}
