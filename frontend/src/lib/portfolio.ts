import { reportScores } from "./report-data";

export interface RunSummary {
  id: string; status: string; totalSteps: number; passedSteps: number; failedSteps: number;
  durationMs: number | null; startedAt: string; finishedAt?: string | null;
}

export interface Platform {
  id: string; name: string; nameAr?: string | null; baseUrl: string; status: string;
  schedule: number; isActive: boolean; lastRunAt?: string | null;
  _count: { runs: number; incidents: number };
  latestRun: RunSummary | null; recentRuns: RunSummary[];
}

export interface IncidentSummary {
  id: string; siteId: string; journeyId: string | null; title: string; description?: string | null;
  severity: string; status: string; lastSeenAt: string; occurrences: number;
  site: { id: string; name: string; nameAr?: string | null; baseUrl: string };
}

export interface OverviewData {
  sites: Platform[];
  health: { total: number; known: number; healthy: number; score: number | null };
  incidents: IncidentSummary[];
  openIncidents: number;
  recentRuns: Array<RunSummary & { site: { name: string; nameAr?: string | null }; siteId: string }>;
}

export function trendValues(runs: RunSummary[]) {
  return [...runs].reverse().map((run) => reportScores(run).overall);
}
