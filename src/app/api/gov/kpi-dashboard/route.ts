import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "governor") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const sites = await prisma.site.findMany({
      where: { isActive: true },
      include: {
        incidents: true,
        runs: {
          orderBy: { startedAt: "desc" },
          take: 100,
          select: {
            id: true,
            status: true,
            startedAt: true,
            finishedAt: true,
            durationMs: true,
            passedSteps: true,
            failedSteps: true,
            totalSteps: true,
          },
        },
      },
    });

    const now = Date.now();
    const h24 = 24 * 60 * 60 * 1000;
    const h72 = 72 * 60 * 60 * 1000;
    const d7 = 7 * 24 * 60 * 60 * 1000;
    const d30 = 30 * 24 * 60 * 60 * 1000;

    // Fetch element-level response times for latest run per site
    const siteIds = sites.map((s) => s.id);
    const latestCompletedRuns = await prisma.run.findMany({
      where: { siteId: { in: siteIds }, status: { in: ["passed", "failed"] } },
      orderBy: { startedAt: "desc" },
      distinct: ["siteId"],
      select: { id: true, siteId: true },
    });
    const latestRunBySite = new Map(latestCompletedRuns.map((r) => [r.siteId, r.id]));

    // Get element response times for each site's latest run
    const allLatestRunIds = latestCompletedRuns.map((r) => r.id);
    const elementResults = allLatestRunIds.length > 0
      ? await prisma.elementTestResult.findMany({
          where: { runId: { in: allLatestRunIds }, responseTimeMs: { gt: 0 } },
          select: { runId: true, responseTimeMs: true },
        })
      : [];
    const elementsByRun = new Map<string, number[]>();
    for (const el of elementResults) {
      if (!elementsByRun.has(el.runId)) elementsByRun.set(el.runId, []);
      elementsByRun.get(el.runId)!.push(el.responseTimeMs!);
    }

    const platformKPIs = sites.map((site) => {
      // Only count completed runs (passed/failed), not error/queued/running
      const completedStatuses = ["passed", "failed"];
      const allRuns24h = site.runs.filter((r) => now - new Date(r.startedAt).getTime() < h24);
      const allRuns72h = site.runs.filter((r) => now - new Date(r.startedAt).getTime() < h72);
      const allRuns7d = site.runs.filter((r) => now - new Date(r.startedAt).getTime() < d7);
      const runs24h = allRuns24h.filter((r) => completedStatuses.includes(r.status));
      const runs72h = allRuns72h.filter((r) => completedStatuses.includes(r.status));
      const runs7d = allRuns7d.filter((r) => completedStatuses.includes(r.status));

      function calcAvailability(runs: typeof runs24h) {
        if (runs.length === 0) return null;
        const totalSteps = runs.reduce((s, r) => s + (r.totalSteps || 0), 0);
        const passedSteps = runs.reduce((s, r) => s + (r.passedSteps || 0), 0);
        if (totalSteps === 0) return null;
        return Math.round((passedSteps / totalSteps) * 100);
      }

      const availability24h = calcAvailability(runs24h);
      const availability72h = calcAvailability(runs72h);
      const availability7d = calcAvailability(runs7d);

      // Response time: use element-level responseTimeMs, not scan duration
      const latestRunId = latestRunBySite.get(site.id);
      const elemTimes = latestRunId ? (elementsByRun.get(latestRunId) || []) : [];
      const avgResponseMs = elemTimes.length > 0
        ? Math.round(elemTimes.reduce((a, b) => a + b, 0) / elemTimes.length)
        : null;
      const peakResponseMs = elemTimes.length > 0 ? Math.max(...elemTimes) : null;

      // Incidents in last 30d
      const incidents30d = site.incidents.filter(
        (inc) => now - new Date(inc.firstSeenAt).getTime() < d30
      );
      const activeIncidents = site.incidents.filter((inc) =>
        ["open", "investigating"].includes(inc.status)
      );
      const resolvedSiteIncidents = incidents30d.filter(
        (inc) => inc.status === "resolved" && inc.resolvedAt
      );

      // MTTR: time from firstSeen to resolved, capped at 7 days max per incident
      let siteMttrMs: number | null = null;
      if (resolvedSiteIncidents.length > 0) {
        const maxIncidentDuration = 24 * 60 * 60 * 1000;
        const total = resolvedSiteIncidents.reduce((sum, inc) => {
          const duration = new Date(inc.resolvedAt!).getTime() - new Date(inc.firstSeenAt).getTime();
          return sum + Math.min(duration, maxIncidentDuration);
        }, 0);
        siteMttrMs = Math.round(total / resolvedSiteIncidents.length);
      }

      // MTTD: scan interval (how quickly we detect issues)
      const siteMttdMs = site.schedule * 60 * 1000;

      // Outage: estimate from failed completed runs — each failed run = ~scanInterval of outage
      const failedRuns30d = site.runs.filter(
        (r) => r.status === "failed" && now - new Date(r.startedAt).getTime() < d30
      );
      const completedRuns30d = site.runs.filter(
        (r) => completedStatuses.includes(r.status) && now - new Date(r.startedAt).getTime() < d30
      );
      const scanIntervalMs = site.schedule * 60 * 1000;
      const totalOutageMs = failedRuns30d.length * scanIntervalMs;

      // Longest consecutive outage
      let longestOutageMs = 0;
      let currentStreak = 0;
      const sortedRuns = [...site.runs]
        .filter((r) => ["passed", "failed"].includes(r.status))
        .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
      for (const r of sortedRuns) {
        if (r.status === "failed") {
          currentStreak++;
          longestOutageMs = Math.max(longestOutageMs, currentStreak * scanIntervalMs);
        } else {
          currentStreak = 0;
        }
      }

      const rag = site.status === "healthy" ? "green"
        : site.status === "degraded" ? "yellow"
        : site.status === "down" ? "red" : "unknown";

      return {
        siteId: site.id,
        name: site.name,
        nameAr: site.nameAr,
        baseUrl: site.baseUrl,
        ministryName: site.ministryName,
        rag,
        availability24h,
        availability72h,
        availability7d,
        avgResponseMs,
        peakResponseMs,
        siteMttrMs,
        siteMttdMs,
        totalOutageMs: totalOutageMs > 0 ? totalOutageMs : null,
        longestOutageMs: longestOutageMs > 0 ? longestOutageMs : null,
        totalRuns24h: runs24h.length,
        totalRuns7d: runs7d.length,
        completedRuns24h: runs24h.length,
        completedRuns7d: runs7d.length,
        activeIncidents: activeIncidents.length,
        totalIncidents30d: incidents30d.length,
        resolvedIncidents30d: resolvedSiteIncidents.length,
        lastRunAt: (() => {
          const completed = site.runs.find((r) => completedStatuses.includes(r.status));
          return completed?.startedAt ?? site.runs[0]?.startedAt ?? null;
        })(),
        lastRunStatus: (() => {
          const completed = site.runs.find((r) => completedStatuses.includes(r.status));
          return completed?.status ?? (site.runs[0]?.status === "error" ? "error" : null);
        })(),
        totalSteps: (() => {
          const completed = site.runs.find((r) => completedStatuses.includes(r.status));
          return completed?.totalSteps ?? 0;
        })(),
        passedSteps: (() => {
          const completed = site.runs.find((r) => completedStatuses.includes(r.status));
          return completed?.passedSteps ?? 0;
        })(),
        failedSteps: (() => {
          const completed = site.runs.find((r) => completedStatuses.includes(r.status));
          return completed?.failedSteps ?? 0;
        })(),
      };
    });

    // Global stats
    const resolvedIncidents30d = await prisma.incident.findMany({
      where: { status: "resolved", resolvedAt: { gte: new Date(now - d30) } },
      select: { firstSeenAt: true, resolvedAt: true },
    });

    let globalMttrMs: number | null = null;
    if (resolvedIncidents30d.length > 0) {
      const maxDuration = 24 * 60 * 60 * 1000;
      const total = resolvedIncidents30d.reduce((sum, inc) => {
        if (!inc.resolvedAt) return sum;
        const dur = inc.resolvedAt.getTime() - inc.firstSeenAt.getTime();
        return sum + Math.min(dur, maxDuration);
      }, 0);
      globalMttrMs = Math.round(total / resolvedIncidents30d.length);
    }

    const avgScheduleMin = sites.length > 0
      ? Math.round(sites.reduce((s, site) => s + site.schedule, 0) / sites.length)
      : 10;

    const healthyCount = platformKPIs.filter((p) => p.rag === "green").length;
    const degradedCount = platformKPIs.filter((p) => p.rag === "yellow").length;
    const downCount = platformKPIs.filter((p) => p.rag === "red").length;
    const unknownCount = platformKPIs.filter((p) => p.rag === "unknown").length;

    const withAvail = platformKPIs.filter((p) => p.availability24h !== null);
    const overallAvailability = withAvail.length > 0
      ? Math.round(withAvail.reduce((s, p) => s + p.availability24h!, 0) / withAvail.length)
      : null;

    const totalActiveIncidents = platformKPIs.reduce((s, p) => s + p.activeIncidents, 0);
    const totalPlatformOutageMs = platformKPIs.reduce((s, p) => s + (p.totalOutageMs ?? 0), 0);

    return NextResponse.json({
      summary: {
        totalSites: sites.length,
        healthyCount,
        degradedCount,
        downCount,
        unknownCount,
        overallAvailability,
        totalActiveIncidents,
        globalMttrMs,
        avgScanIntervalMin: avgScheduleMin,
        totalPlatformOutageMs: totalPlatformOutageMs > 0 ? totalPlatformOutageMs : null,
        totalResolvedIncidents30d: resolvedIncidents30d.length,
      },
      platforms: platformKPIs,
    });
  } catch (error) {
    console.error("[KPI-DASHBOARD] Error:", error);
    return NextResponse.json({ error: "Failed to load KPI dashboard" }, { status: 500 });
  }
}
