import { prisma } from "../lib/prisma";
import { apiError } from "../lib/api";
import { summarizeHealth } from "../lib/site-health";
import { platformInclude, incidentSelect, runSummarySelect } from "../lib/portfolio-query";

export async function GET() {
  try {
    const [sites, groups, incidents, openIncidents, recentRuns] = await Promise.all([
      prisma.site.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 8, include: platformInclude }),
      prisma.site.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.incident.findMany({ where: { status: { in: ["open", "investigating"] } }, orderBy: { lastSeenAt: "desc" }, take: 5, select: incidentSelect }),
      prisma.incident.count({ where: { status: { in: ["open", "investigating"] } } }),
      prisma.run.findMany({ where: { finishedAt: { not: null } }, orderBy: [{ startedAt: "desc" }, { id: "desc" }], take: 5, select: { ...runSummarySelect, siteId: true, site: { select: { name: true, nameAr: true } } } }),
    ]);
    return Response.json({ sites: sites.map(({ runs, ...site }) => ({ ...site, latestRun: runs[0] || null, recentRuns: runs })), health: summarizeHealth(groups), incidents, openIncidents, recentRuns }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
