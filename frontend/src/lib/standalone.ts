import type { RunReport } from "./report-model";

function platform(id: string) {
  return { id, name: "Platform preview", nameAr: "معاينة المنصة", baseUrl: "https://example.com", status: "standalone", schedule: 0, isActive: false, lastRunAt: null, _count: { runs: 0, incidents: 0 }, latestRun: null, recentRuns: [], runs: [], incidents: [] };
}

function report(id: string): RunReport {
  const site = platform("preview");
  return {
    id, siteId: site.id, journeyId: "preview", site,
    status: "standalone", totalSteps: 0, passedSteps: 0, failedSteps: 0,
    durationMs: null, startedAt: "", finishedAt: null, summaryJson: null, errorJson: null, artifacts: [],
    steps: [{ stepIndex: 0, action: "navigate", description: "Page preview", status: "pending", url: site.baseUrl, durationMs: null, screenshotPath: null, metadata: null }],
  };
}

export function standaloneResponse(resource: string): Response {
  const pathname = new URL(resource, "http://standalone").pathname;
  if (pathname === "/api/overview") return Response.json({ sites: [], health: { total: 0, known: 0, healthy: 0, score: null }, incidents: [], openIncidents: 0, recentRuns: [] });
  if (pathname === "/api/sites") return Response.json({ sites: [], nextCursor: null });
  if (pathname === "/api/incidents") return Response.json({ incidents: [], nextCursor: null });
  const run = /^\/api\/sites\/[^/]+\/runs\/([^/]+)$/.exec(pathname);
  if (run) return Response.json({ run: report(decodeURIComponent(run[1])) });
  const site = /^\/api\/sites\/([^/]+)$/.exec(pathname);
  if (site) return Response.json({ site: platform(decodeURIComponent(site[1])) });
  return Response.json({ error: "Backend not connected" }, { status: 503 });
}
