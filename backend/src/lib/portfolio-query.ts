import type { Prisma } from "@prisma/client";

export const runSummarySelect = {
  id: true, status: true, totalSteps: true, passedSteps: true, failedSteps: true,
  durationMs: true, startedAt: true, finishedAt: true,
} satisfies Prisma.RunSelect;

export const platformInclude = {
  runs: { orderBy: [{ startedAt: "desc" }, { id: "desc" }], take: 7, select: runSummarySelect },
  _count: { select: { runs: true, incidents: { where: { status: { in: ["open", "investigating"] } } } } },
} satisfies Prisma.SiteInclude;

export const incidentSelect = {
  id: true, siteId: true, journeyId: true, title: true, description: true, severity: true, status: true, lastSeenAt: true, occurrences: true,
  site: { select: { id: true, name: true, nameAr: true, baseUrl: true } },
} satisfies Prisma.IncidentSelect;
