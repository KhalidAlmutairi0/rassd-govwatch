export interface ReportStep {
  stepIndex: number;
  action: string;
  description: string;
  status: string;
  url?: string | null;
  durationMs?: number | null;
  screenshotPath?: string | null;
  error?: string | null;
  metadata?: string | null;
}

export interface ReportIssue {
  id: string;
  severity: string;
  category: string;
  title: string;
  page: string;
  description: string;
  impact: string;
  screenshotPath?: string;
}

export function stepMetadata(step: ReportStep): Record<string, unknown> {
  try {
    const value = JSON.parse(step.metadata || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function pagePath(value?: string | null) {
  try { return new URL(value || "").pathname || "/"; } catch { return "/"; }
}

export function deriveIssues(steps: ReportStep[]): ReportIssue[] {
  return steps.filter((step) => step.status === "failed").map((step) => ({
    id: `issue-${step.stepIndex}`, severity: step.action === "navigate" ? "High" : "Medium", category: "QA",
    title: step.description || step.error?.slice(0, 80) || "Failed check", page: pagePath(step.url),
    description: step.error || "The recorded check failed.",
    impact: "This browser check failed. The affected interaction and its recorded evidence require investigation; broader user impact has not been measured.",
    screenshotPath: step.screenshotPath || undefined,
  }));
}

export interface ReportPageData {
  id: string; url: string; path: string; name: string;
  durationMs?: number; errorCount: number; screenshotPath?: string;
  loadTime: number | null; requests: number | null; pageWeight: string;
  consoleErrors: number | null; fcp: number | null; lcp: number | null; cls: number | null;
  fcpScore: number | null; lcpScore: number | null; clsScore: number | null;
  issues: ReportIssue[];
}

export function derivePages(steps: ReportStep[]): ReportPageData[] {
  const pages = new Map<string, ReportPageData>();
  let current: ReportPageData | undefined;
  for (const step of steps) {
    const metadata = stepMetadata(step);
    let url: URL | undefined;
    if (step.url) {
      try { url = new URL(step.url); } catch { current = undefined; continue; }
      if (!["http:", "https:"].includes(url.protocol)) { current = undefined; continue; }
    }
    if ((step.action === "navigate" || metadata.urlChanged === true) && url) {
      current = pages.get(url.href);
      if (!current) {
        current = {
          id: `page-${step.stepIndex}`, url: url.href, path: url.pathname || "/",
          name: url.pathname === "/" ? "Homepage" : step.description || url.pathname,
          durationMs: step.durationMs ?? undefined, errorCount: 0,
          screenshotPath: step.screenshotPath || undefined, loadTime: null, requests: null, pageWeight: "—",
          consoleErrors: null, fcp: null, lcp: null, cls: null, fcpScore: null, lcpScore: null, clsScore: null, issues: [],
        };
        pages.set(url.href, current);
      }
    } else if (url) {
      current = pages.get(url.href);
    }
    if (!current) continue;
    if (Array.isArray(metadata.consoleErrors)) current.consoleErrors = (current.consoleErrors || 0) + metadata.consoleErrors.length;
    if (step.status === "failed") {
      current.issues.push(...deriveIssues([step]));
      current.errorCount++;
    }
  }
  return Array.from(pages.values());
}

export function reportScores(run: { totalSteps: number; passedSteps: number; failedSteps: number; status: string }) {
  const ratio = (count: number) => run.totalSteps > 0 ? Math.min(100, Math.max(0, Math.round(count / run.totalSteps * 100))) : null;
  return { overall: ["passed", "failed"].includes(run.status) ? ratio(run.passedSteps) : null, functionality: ratio(run.passedSteps), ease: null, coverage: ratio(run.passedSteps + run.failedSteps) };
}

export function parseReportSummary(value: string | null): { executive?: string; executiveAr?: string; recommendations?: string[] } | null {
  try {
    const parsed = JSON.parse(value || "null");
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.executive === "string" || typeof parsed.executiveAr === "string") return {
      executive: typeof parsed.executive === "string" ? parsed.executive : undefined,
      executiveAr: typeof parsed.executiveAr === "string" ? parsed.executiveAr : undefined,
      recommendations: Array.isArray(parsed.recommendations) ? (parsed.recommendations as unknown[]).filter((item): item is string => typeof item === "string") : undefined,
    };
    if (typeof parsed.text !== "string" || !parsed.text.trim()) return null;
    const commentaryAt = parsed.text.indexOf("\n\nAI commentary:\n");
    const body = commentaryAt < 0 ? parsed.text : parsed.text.slice(0, commentaryAt);
    const commentary = commentaryAt < 0 ? "" : parsed.text.slice(commentaryAt);
    const separator = "\n\n**Arabic Summary (الملخص العربي):**\n";
    const boundary = body.indexOf(separator);
    return {
      executive: (boundary < 0 ? body : body.slice(0, boundary)).replace(/^\*\*English Summary:\*\*\s*/, "").trim() + commentary,
      executiveAr: boundary < 0 ? undefined : body.slice(boundary + separator.length).trim(),
      recommendations: undefined,
    };
  } catch { return null; }
}
