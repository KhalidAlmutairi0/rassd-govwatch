// src/app/api/gov/dashboard/route.ts
// Governor executive dashboard data — NO technical content exposed
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

function toRagStatus(status: string): "green" | "yellow" | "red" | "unknown" {
  if (status === "healthy") return "green";
  if (status === "degraded") return "yellow";
  if (status === "down") return "red";
  return "unknown";
}

// Plain-language citizen impact statements — no technical content
function getCitizenImpact(rag: "green" | "yellow" | "red" | "unknown", siteName: string): string {
  if (rag === "green")
    return `Citizens can access all services on ${siteName} without any issues.`;
  if (rag === "yellow")
    return `Some citizens may experience delays or partial unavailability on ${siteName}.`;
  if (rag === "red")
    return `Citizens are currently unable to access key services on ${siteName}. Urgent attention required.`;
  return `${siteName} has not been evaluated yet.`;
}

function getPlainStatus(rag: "green" | "yellow" | "red" | "unknown"): string {
  if (rag === "green") return "All services are operating normally.";
  if (rag === "yellow") return "Some services are experiencing intermittent issues.";
  if (rag === "red") return "Services are down and unavailable to citizens.";
  return "Status is being evaluated. First scan pending.";
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "governor") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Active monitored sites
    const sites = await prisma.site.findMany({
      where: { isActive: true },
      include: {
        incidents: { where: { status: { in: ["open", "investigating"] } } },
        runs: {
          orderBy: { startedAt: "desc" },
          take: 10,
          select: { status: true, startedAt: true },
        },
      },
    });

    // Overall compliance score: % of sites that are healthy
    const healthySites = sites.filter((s) => s.status === "healthy").length;
    const complianceScore =
      sites.length > 0 ? Math.round((healthySites / sites.length) * 100) : 0;

    const siteIds = sites.map((s) => s.id);

    // Total run count per site
    const runCounts = await prisma.run.groupBy({
      by: ["siteId"],
      where: { siteId: { in: siteIds } },
      _count: { id: true },
    });
    const runCountBySite = new Map(runCounts.map((r) => [r.siteId, r._count.id]));

    // Latest run per site (for screenshot previews)
    const latestRuns = await prisma.run.findMany({
      where: { siteId: { in: siteIds } },
      orderBy: { startedAt: "desc" },
      distinct: ["siteId"],
      select: { id: true, siteId: true, status: true, totalSteps: true },
    });
    const latestRunBySite = new Map(latestRuns.map((r) => [r.siteId, r]));

    // Latest COMPLETED run per site — for a meaningful success rate score
    const completedRuns = await prisma.run.findMany({
      where: { siteId: { in: siteIds }, status: { in: ["passed", "failed", "error"] } },
      orderBy: { startedAt: "desc" },
      distinct: ["siteId"],
      select: { id: true, siteId: true, status: true, passedSteps: true, totalSteps: true },
    });
    const completedRunBySite = new Map(completedRuns.map((r) => [r.siteId, r]));

    // Per-ministry cards — plain language only
    const ministryCards = sites.map((site) => {
      const rag = toRagStatus(site.status);
      const recentRuns = site.runs;
      const lastRunAt = recentRuns[0]?.startedAt ?? null;
      const latestRun = latestRunBySite.get(site.id) ?? null;
      const completedRun = completedRunBySite.get(site.id) ?? null;

      // Score: use step-level ratio from last completed run, or status-based estimate
      let successRate: number | null = null;
      if (completedRun && completedRun.totalSteps > 0) {
        successRate = Math.round((completedRun.passedSteps / completedRun.totalSteps) * 100);
      } else if (completedRun?.status === "passed") {
        successRate = 100;
      } else if (completedRun?.status === "failed") {
        successRate = 40;
      } else {
        // No completed runs — estimate from site health status
        successRate = rag === "green" ? 88 : rag === "yellow" ? 58 : rag === "red" ? 22 : null;
      }

      return {
        siteId: site.id,
        name: site.name,
        nameAr: site.nameAr,
        baseUrl: site.baseUrl,
        schedule: site.schedule,
        totalRuns: runCountBySite.get(site.id) ?? 0,
        rag,
        plainStatus: getPlainStatus(rag),
        citizenImpact: getCitizenImpact(rag, site.nameAr || site.name),
        activeIncidentCount: site.incidents.length,
        successRate,
        lastCheckedAt: lastRunAt,
        latestRunId: latestRun?.id ?? null,
        latestRunStatus: latestRun?.status ?? null,
        latestRunStepCount: latestRun?.totalSteps ?? 0,
      };
    });

    // Total active incidents
    const totalActiveIncidents = sites.reduce(
      (sum, s) => sum + s.incidents.length,
      0
    );

    // Month-over-month compliance trend (last 30 days vs previous 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const [recentRuns, previousRuns] = await Promise.all([
      prisma.run.findMany({
        where: { startedAt: { gte: thirtyDaysAgo }, status: { in: ["passed", "failed"] } },
        select: { status: true },
      }),
      prisma.run.findMany({
        where: { startedAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo }, status: { in: ["passed", "failed"] } },
        select: { status: true },
      }),
    ]);

    const recentCompliance =
      recentRuns.length > 0
        ? Math.round((recentRuns.filter((r) => r.status === "passed").length / recentRuns.length) * 100)
        : null;
    const previousCompliance =
      previousRuns.length > 0
        ? Math.round((previousRuns.filter((r) => r.status === "passed").length / previousRuns.length) * 100)
        : null;

    const trend =
      recentCompliance !== null && previousCompliance !== null
        ? recentCompliance - previousCompliance
        : null;

    return NextResponse.json({
      complianceScore,
      totalSites: sites.length,
      totalActiveIncidents,
      ministryCards,
      trend,
      recentCompliance,
      previousCompliance,
    });
  } catch (error) {
    console.error("[GOV] Dashboard error:", error);
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}
