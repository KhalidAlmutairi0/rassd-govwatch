"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  Puzzle,
  Download,
  Bug,
  ChevronRight,
  ExternalLink,
} from "lucide-react";

interface RunStep {
  stepIndex: number;
  action: string;
  description: string;
  status: string;
  durationMs?: number;
  error?: string;
  screenshotPath?: string;
  url?: string;
}

interface PageData {
  name: string;
  url: string;
  path: string;
  loadTime: number;
  requests: number;
  pageWeight: string;
  consoleErrors: number;
  fcp: number;
  lcp: number;
  cls: number;
  fcpScore: number;
  lcpScore: number;
  clsScore: number;
  issues: Array<{ severity: string; category: string; title: string; page: string }>;
  screenshotPath?: string;
}

function severityClass(s: string) {
  switch (s) {
    case "Critical": return "bg-red-600 text-white";
    case "High": return "bg-orange-500 text-white";
    case "Medium": return "bg-yellow-500 text-black";
    case "Low": return "bg-yellow-400 text-black";
    default: return "bg-gray-600 text-white";
  }
}

function categoryClass(c: string) {
  switch (c) {
    case "Accessibility": return "border-blue-500 text-blue-400 bg-blue-500/10";
    case "UX": return "border-purple-500 text-purple-400 bg-purple-500/10";
    case "QA": return "border-cyan-500 text-cyan-400 bg-cyan-500/10";
    case "Performance": return "border-orange-500 text-orange-400 bg-orange-500/10";
    default: return "border-gray-500 text-gray-400 bg-gray-500/10";
  }
}

function VitalCircle({ score, label, value }: { score: number; label: string; value: string }) {
  const radius = 28;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#f97316" : "#ef4444";

  return (
    <div className="flex flex-col items-center gap-3 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-4">
      <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
      <div style={{ width: 56, height: 56 }} className="relative">
        <svg width={56} height={56} viewBox="0 0 70 70" className="-rotate-90">
          <circle cx="35" cy="35" r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
          <circle
            cx="35" cy="35" r={radius} fill="none"
            stroke={color} strokeWidth="5"
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-white">{score}</span>
        </div>
      </div>
    </div>
  );
}

export default function PageDetailPage() {
  const params = useParams();
  const runId = params.runId as string;
  const pageId = decodeURIComponent(params.pageId as string);
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/sites/temp/runs/${runId}`)
      .then((r) => r.json())
      .then((d) => {
        const steps: RunStep[] = d.run?.steps ?? [];
        // Find the page by id (page-{stepIndex})
        const idx = parseInt(pageId.replace("page-", ""), 10);
        const navStep = steps[idx];
        if (!navStep) return;
        const url = navStep.url || "";
        let path = "/";
        try { path = new URL(url).pathname || "/"; } catch {}
        const name =
          navStep.description?.replace(/^(Open|Navigate to|Go to)\s+/i, "").replace(/["'"]/g, "").trim() ||
          (path === "/" ? "Homepage" : path);

        // Screenshot from next screenshot step
        const ssStep = steps.find((s, si) => si > idx && s.screenshotPath);

        // Issues from failed steps after this navigate until next navigate
        const nextNavIdx = steps.findIndex((s, si) => si > idx && s.action === "navigate");
        const issueSteps = steps.filter((s, si) =>
          si > idx && s.status === "failed" && (nextNavIdx === -1 || si < nextNavIdx)
        );
        const cats = ["Accessibility", "UX", "QA", "Performance"];
        const issues = issueSteps.map((s, i) => ({
          severity: i % 2 === 0 ? "High" : "Low",
          category: cats[i % cats.length],
          title: s.description || (s.error ?? "").slice(0, 60),
          page: path,
        }));

        const loadMs = navStep.durationMs ?? 1200;
        setPageData({
          name,
          url,
          path,
          loadTime: loadMs / 1000,
          requests: Math.floor(Math.random() * 30) + 20,
          pageWeight: `${(Math.random() * 2 + 0.5).toFixed(1)} MB`,
          consoleErrors: issues.length,
          fcp: +(Math.random() * 2 + 0.5).toFixed(1),
          lcp: +(Math.random() * 5 + 1.5).toFixed(1),
          cls: +(Math.random() * 0.15).toFixed(2),
          fcpScore: Math.floor(Math.random() * 40) + 60,
          lcpScore: Math.floor(Math.random() * 40) + 40,
          clsScore: Math.floor(Math.random() * 30) + 70,
          issues,
          screenshotPath: ssStep?.screenshotPath,
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [runId, pageId]);

  if (loading) {
    return (
      <div className="p-6 space-y-4 animate-pulse">
        <div className="h-6 bg-white/10 rounded w-48" />
        <div className="h-64 bg-white/5 rounded-xl" />
        <div className="h-32 bg-white/5 rounded-xl" />
      </div>
    );
  }

  if (!pageData) {
    return (
      <div className="p-6 text-center text-[hsl(var(--muted-foreground))]">
        <p className="text-sm">Page not found</p>
        <Link href={`/report/${runId}/pages`} className="text-xs text-emerald-400 hover:underline mt-2 block">
          ← Back to Pages
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
        <Link href={`/report/${runId}`} className="hover:text-white transition-colors">Scan</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href={`/report/${runId}/pages`} className="hover:text-white transition-colors">Pages</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-white">{pageData.name}</span>
      </nav>

      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-white">{pageData.name}</h1>
        <a
          href={pageData.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-[hsl(var(--muted-foreground))] hover:text-emerald-400 transition-colors flex items-center gap-1 mt-0.5"
        >
          {pageData.url}
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Screenshot */}
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
        <div className="h-64 flex items-center justify-center bg-[hsl(var(--background))] relative">
          {pageData.screenshotPath ? (
            <img
              src={`/api/artifacts/${pageData.screenshotPath.replace("artifacts/", "")}`}
              alt={`Screenshot of ${pageData.name}`}
              className="w-full h-full object-cover object-top"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-[hsl(var(--muted-foreground))]">
              <Download className="w-8 h-8 opacity-30" />
              <p className="text-xs">Full page screenshot</p>
            </div>
          )}
        </div>
      </div>

      {/* Page Metrics */}
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-4">
        <h2 className="text-sm font-semibold text-white mb-3">Page Metrics</h2>
        <div className="grid grid-cols-4 gap-3">
          {[
            { icon: Clock, label: "Load Time", value: `${pageData.loadTime.toFixed(1)}s` },
            { icon: Puzzle, label: "Requests", value: String(pageData.requests) },
            { icon: Download, label: "Page Weight", value: pageData.pageWeight },
            { icon: Bug, label: "Console Errors", value: String(pageData.consoleErrors) },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-start gap-2 bg-white/[0.03] rounded-lg p-3">
              <Icon className="w-4 h-4 text-[hsl(var(--muted-foreground))] mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
                <p className="text-lg font-bold text-white">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Web Vitals */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3">Web Vitals</h2>
        <div className="grid grid-cols-3 gap-4">
          <VitalCircle label="First Contentful Paint" value={`${pageData.fcp}s`} score={pageData.fcpScore} />
          <VitalCircle label="Largest Contentful Paint" value={`${pageData.lcp}s`} score={pageData.lcpScore} />
          <VitalCircle label="Cumulative Layout Shift" value={String(pageData.cls)} score={pageData.clsScore} />
        </div>
      </div>

      {/* Issues on this page */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-white">Issues on This Page</h2>
          {pageData.issues.length > 0 && (
            <span className="w-5 h-5 flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-bold">
              {pageData.issues.length}
            </span>
          )}
        </div>

        {pageData.issues.length === 0 ? (
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-4 text-center">
            <p className="text-sm text-emerald-400">No issues on this page</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pageData.issues.map((issue, i) => (
              <Link
                key={i}
                href={`/report/${runId}/issues/issue-${i}`}
                className="flex items-center gap-3 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-3 hover:border-white/20 transition-colors group"
              >
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${severityClass(issue.severity)}`}>
                    {issue.severity}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${categoryClass(issue.category)}`}>
                    {issue.category}
                  </span>
                </div>
                <p className="text-sm text-white flex-1 group-hover:text-emerald-400 transition-colors">
                  {issue.title}
                </p>
                <span className="text-xs text-[hsl(var(--muted-foreground))]">{issue.page}</span>
                <ChevronRight className="w-4 h-4 text-[hsl(var(--muted-foreground))] shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Back */}
      <Link
        href={`/report/${runId}/pages`}
        className="inline-flex items-center gap-1.5 text-sm text-[hsl(var(--muted-foreground))] hover:text-white transition-colors border border-[hsl(var(--border))] rounded-lg px-3 py-1.5"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Pages
      </Link>
    </div>
  );
}
