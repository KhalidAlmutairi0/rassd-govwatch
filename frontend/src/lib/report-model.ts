import type { RunSummary } from "./portfolio";
import type { ReportStep } from "./report-data";

export interface RunReport extends RunSummary {
  siteId: string;
  journeyId: string;
  summaryJson: string | null;
  errorJson: string | null;
  site: { id: string; name: string; nameAr?: string | null; baseUrl: string };
  steps: ReportStep[];
  artifacts: Array<{ id: string; type: string; path: string }>;
}
