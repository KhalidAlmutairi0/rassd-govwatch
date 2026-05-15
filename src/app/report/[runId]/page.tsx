"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Globe,
  FileText,
  RefreshCw,
  Share2,
  Star,
  ChevronRight,
  ExternalLink,
  Zap,
  AlertTriangle,
  CheckCircle,
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
  metadata?: string;
}

interface ElementResult {
  id: string;
  elementType: string;
  elementText?: string;
  elementSelector: string;
  parentSection?: string;
  action: string;
  status: string;
  responseTimeMs?: number;
  urlBefore?: string;
  urlAfter?: string;
  urlChanged: boolean;
  screenshotBefore?: string;
  screenshotAfter?: string;
  error?: string;
  domChanges?: string;
}

interface Run {
  id: string;
  status: string;
  durationMs: number;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  summaryJson: string;
  startedAt: string;
  site: { name: string; baseUrl: string; nameAr?: string };
  steps: RunStep[];
  elementResults?: ElementResult[];
}

interface Issue {
  id: string;
  severity: "Critical" | "High" | "Low" | "Medium";
  category: string;
  title: string;
  page: string;
  description?: string;
  elementType?: string;
  section?: string;
  responseTimeMs?: number;
  urlBefore?: string;
  urlAfter?: string;
  screenshotAfter?: string;
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
    case "Accessibility": return "border-blue-500 text-blue-400";
    case "UX": return "border-purple-500 text-purple-400";
    case "QA": return "border-cyan-500 text-cyan-400";
    case "Performance": return "border-orange-500 text-orange-400";
    default: return "border-gray-500 text-gray-400";
  }
}

function ScoreCircle({ score, size = 80 }: { score: number; size?: number }) {
  const radius = 40;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#f97316" : "#ef4444";
  const grade = score >= 90 ? "A" : score >= 80 ? "B+" : score >= 70 ? "B" : score >= 60 ? "C" : "D";

  return (
    <div className="flex flex-col items-center gap-1">
      <div style={{ width: size, height: size }} className="relative">
        <svg width={size} height={size} viewBox="0 0 100 100" className="-rotate-90">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
          <circle
            cx="50" cy="50" r={radius} fill="none"
            stroke={color} strokeWidth="8"
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-white leading-none">{score}</span>
        </div>
      </div>
    </div>
  );
}

function MiniCircle({ score, label }: { score: number; label: string }) {
  const radius = 30;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#f97316" : "#ef4444";

  return (
    <div className="flex flex-col items-center gap-2">
      <div style={{ width: 80, height: 80 }} className="relative">
        <svg width={80} height={80} viewBox="0 0 80 80" className="-rotate-90">
          <circle cx="40" cy="40" r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
          <circle
            cx="40" cy="40" r={radius} fill="none"
            stroke={color} strokeWidth="6"
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-white">{score}</span>
        </div>
      </div>
      <p className="text-xs text-[hsl(var(--muted-foreground))] text-center">{label}</p>
    </div>
  );
}

/** Renders summary text with proper paragraph breaks and highlighted key terms */
function SummaryText({ text, rtl }: { text: string; rtl?: boolean }) {
  const cleaned = text
    .replace(/\*\*/g, "")
    .replace(/^#+\s+/gm, "")
    .replace(/^[-*]\s+/gm, "");

  const paragraphs = cleaned
    .split(/\n\n+/)
    .flatMap((p) => p.split(/(?<=[.!؟])\s{2,}/))
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div
      className={`space-y-3 ${rtl ? "text-right" : ""}`}
      dir={rtl ? "rtl" : undefined}
      lang={rtl ? "ar" : undefined}
    >
      {paragraphs.map((para, i) => (
        <p
          key={i}
          className={`text-sm text-white/85 leading-[2.1] font-light ${
            rtl ? "font-cairo tracking-normal" : "tracking-wide"
          }`}
        >
          {para}
        </p>
      ))}
    </div>
  );
}

function deriveIssues(steps: RunStep[]): Issue[] {
  const issues: Issue[] = [];
  steps.forEach((s, i) => {
    if (s.status === "failed" && s.error) {
      let severity: Issue["severity"] = "Medium";
      const err = s.error.toLowerCase();
      if (i === 0 || err.includes("navigation") || err.includes("timeout") || err.includes("crash")) {
        severity = "Critical";
      } else if (err.includes("not found") || err.includes("blocked") || err.includes("refused") || err.includes("500") || err.includes("404")) {
        severity = "High";
      } else if (err.includes("warning") || err.includes("slow") || err.includes("deprecated")) {
        severity = "Low";
      }

      let cat = "QA";
      if (err.includes("timeout") || err.includes("slow") || err.includes("network")) cat = "Performance";
      else if (err.includes("aria") || err.includes("label") || err.includes("focus")) cat = "Accessibility";
      else if (err.includes("navigation") || err.includes("click") || err.includes("not found")) cat = "UX";

      issues.push({
        id: `issue-${i}`,
        severity,
        category: cat,
        title: s.description || s.error.slice(0, 60),
        page: s.url ? (() => { try { return new URL(s.url!).pathname; } catch { return "/"; } })() : "/",
        description: s.error,
        responseTimeMs: s.durationMs,
        screenshotAfter: s.screenshotPath ?? undefined,
      });
    }
  });
  return issues;
}

function deriveIssuesFromElements(elements: ElementResult[]): Issue[] {
  const issues: Issue[] = [];
  elements.forEach((el, i) => {
    if (el.status !== "failed") return;
    const err = (el.error || el.domChanges || "").toLowerCase();

    // Skip false positives — these are normal behaviors, not real issues
    if (
      !err ||
      err.includes("element not found") ||
      err.includes("selector not found") ||
      err.includes("not interactable") ||
      err.includes("element interaction completed") ||
      err.includes("element responded") ||
      err.includes("navigation successful") ||
      err.includes("completed in") ||
      err.includes("page transition") ||
      err.includes("frame was detached") ||
      err.includes("target closed") ||
      err.includes("context was destroyed") ||
      err.includes("navigation timeout") ||
      err.includes("page.goto") ||
      err.includes("page.click") ||
      err.includes("page.waitfor") ||
      err.includes("waiting until") ||
      err.includes("call log")
    ) return;

    // Only show genuinely broken things
    const isRealProblem =
      err.includes("500") || err.includes("502") || err.includes("503") ||
      err.includes("404") || err.includes("403") ||
      err.includes("blank page") || err.includes("error page") ||
      err.includes("crash") || err.includes("refused") ||
      err.includes("blocked") || err.includes("ssl") ||
      err.includes("certificate") || err.includes("security") ||
      err.includes("mixed content");

    if (!isRealProblem) return;

    let severity: Issue["severity"] = "Medium";
    if (err.includes("500") || err.includes("crash") || err.includes("blank page")) {
      severity = "Critical";
    } else if (err.includes("404") || err.includes("blocked") || err.includes("refused")) {
      severity = "High";
    } else if (err.includes("slow") || err.includes("warning")) {
      severity = "Low";
    }

    let cat = "QA";
    if (err.includes("timeout") || err.includes("slow") || err.includes("network") || err.includes("502") || err.includes("503")) cat = "Performance";
    else if (err.includes("aria") || err.includes("label") || err.includes("focus") || err.includes("accessibility")) cat = "Accessibility";
    else if (err.includes("404") || err.includes("refused") || err.includes("blocked")) cat = "UX";

    issues.push({
      id: `issue-${i}`,
      severity,
      category: cat,
      title: el.elementText || el.error?.slice(0, 60) || "Element issue",
      page: el.urlAfter ? (() => { try { return new URL(el.urlAfter!).pathname; } catch { return "/"; } })() : "/",
      description: el.error || el.domChanges || "",
      elementType: el.elementType,
      section: el.parentSection ?? undefined,
      responseTimeMs: el.responseTimeMs ?? undefined,
      urlBefore: el.urlBefore ?? undefined,
      urlAfter: el.urlAfter ?? undefined,
      screenshotAfter: el.screenshotAfter ?? undefined,
    });
  });
  return issues;
}

function derivePages(steps: RunStep[]) {
  const seen = new Set<string>();
  return steps
    .filter((s) => s.action === "navigate" && s.url)
    .filter((s) => {
      if (seen.has(s.url!)) return false;
      seen.add(s.url!);
      return true;
    })
    .map((s) => {
      let pathname = "/";
      try { pathname = new URL(s.url!).pathname || "/"; } catch {}
      return {
        url: s.url!,
        path: pathname,
        name: s.description?.replace(/^(Open|Navigate to|Go to) /i, "").replace(/["'"]/g, "") || pathname || "Homepage",
        durationMs: s.durationMs,
        errorCount: steps.filter(st => st.url === s.url && st.status === "failed").length,
      };
    });
}

function derivePagesFromElements(elements: ElementResult[], siteUrl: string) {
  const seen = new Set<string>();
  const pages: Array<{ url: string; path: string; name: string; durationMs?: number; errorCount: number }> = [];

  // Add the base site URL as homepage
  try {
    const base = new URL(siteUrl);
    const homePath = base.pathname || "/";
    seen.add(siteUrl);
    pages.push({
      url: siteUrl,
      path: homePath,
      name: "Homepage",
      errorCount: 0,
    });
  } catch {}

  // Collect unique URLs from element navigation
  for (const el of elements) {
    if (el.urlChanged && el.urlAfter && !seen.has(el.urlAfter)) {
      seen.add(el.urlAfter);
      let pathname = "/";
      try { pathname = new URL(el.urlAfter).pathname || "/"; } catch { continue; }
      pages.push({
        url: el.urlAfter,
        path: pathname,
        name: el.elementText || pathname,
        durationMs: el.responseTimeMs,
        errorCount: elements.filter(e => e.urlAfter === el.urlAfter && e.status === "failed").length,
      });
    }
  }

  return pages;
}

export default function ReportPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.runId as string;
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [issuesExpanded, setIssuesExpanded] = useState(false);

  useEffect(() => {
    fetch(`/api/sites/_/runs/${runId}`)
      .then((r) => r.json())
      .then((d) => setRun(d.run))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [runId]);

  if (loading) {
    return (
      <div className="p-6 space-y-4 animate-pulse">
        <div className="h-8 bg-white/10 rounded w-48" />
        <div className="h-40 bg-white/5 rounded-xl" />
        <div className="h-32 bg-white/5 rounded-xl" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full py-20 text-[hsl(var(--muted-foreground))]">
        <Globe className="w-12 h-12 mb-4 opacity-30" />
        <p className="text-sm">Report not found</p>
        <Link href="/dashboard" className="mt-3 text-xs text-emerald-400 hover:underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  // Parse summary — supports both new structured format and legacy { text } format
  let summary: { executive?: string; executiveAr?: string; technicalDetails?: string; recommendations?: string[] } | null = null;
  try {
    const parsed = JSON.parse(run.summaryJson);
    if (parsed.executive || parsed.executiveAr) {
      summary = {
        executive: parsed.executive || null,
        executiveAr: parsed.executiveAr || null,
        technicalDetails: parsed.technicalDetails,
        recommendations: parsed.recommendations,
      };
    } else if (parsed.text) {
      // Legacy format: parse the plain text into structured fields client-side
      const raw = parsed.text as string;
      const arabicHeaders = [/arabic\s+summary/i, /الملخص\s+العربي/, /الملخص\s+التنفيذي/, /العربية[:\s]/i];
      let splitIdx = -1;
      for (const re of arabicHeaders) {
        const m = raw.search(re);
        if (m > 0) { splitIdx = m; break; }
      }
      if (splitIdx < 0) {
        const arabicRun = raw.search(/[؀-ۿ]{10,}/);
        if (arabicRun > 0) {
          const lineStart = raw.lastIndexOf("\n", arabicRun);
          splitIdx = lineStart > 0 ? lineStart : arabicRun;
        }
      }
      const strip = (s: string) => s.replace(/^(english\s+summary|executive\s+summary|arabic\s+summary|الملخص\s+العربي|الملخص\s+التنفيذي|العربية)\s*[:.]?\s*/gim, "").replace(/^\s*[-=]+\s*/gm, "").trim();
      if (splitIdx > 0) {
        summary = {
          executive: strip(raw.slice(0, splitIdx)) || null,
          executiveAr: strip(raw.slice(splitIdx)) || null,
        };
      } else {
        summary = { executive: raw.trim() || null };
      }
    }
    if (!summary?.executive && !summary?.executiveAr) summary = null;
  } catch {}

  const overallScore = run.totalSteps > 0 ? Math.round((run.passedSteps / run.totalSteps) * 100) : 0;
  // Sub-scores derived from real data — no arbitrary adjustments
  const funcScore = overallScore; // Functionality = % steps passed
  const easeScore = run.totalSteps > 0 ? Math.round(((run.totalSteps - run.failedSteps) / run.totalSteps) * 100) : 0; // Ease = non-failing steps
  const coverageScore = run.totalSteps > 0 ? Math.min(100, Math.round((run.totalSteps / Math.max(run.totalSteps, 10)) * 100)) : 0; // Coverage = breadth of test
  const grade = overallScore >= 90 ? "A" : overallScore >= 80 ? "B+" : overallScore >= 70 ? "B" : overallScore >= 60 ? "C" : "D";

  const hasSteps = run.steps && run.steps.length > 0;
  const hasElements = run.elementResults && run.elementResults.length > 0;
  const issues = hasSteps ? deriveIssues(run.steps) : hasElements ? deriveIssuesFromElements(run.elementResults!) : [];
  const pages = hasSteps ? derivePages(run.steps) : hasElements ? derivePagesFromElements(run.elementResults!, run.site.baseUrl) : [];
  const scannedAt = new Date(run.startedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      {/* Score header */}
      <div className="flex items-start gap-6">
        {/* Big score */}
        <div className="relative">
          <ScoreCircle score={overallScore} size={110} />
          <div className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-xs font-bold text-white">
            {grade}
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))] text-center mt-1">Overall Score</p>
        </div>

        {/* Site info */}
        <div className="flex-1 min-w-0 pt-2">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
            <span className="text-sm text-[hsl(var(--muted-foreground))]">{run.site.baseUrl}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
            <span>📅</span>
            <span>Scanned on {scannedAt}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-white hover:border-white/30 transition-colors">
            <FileText className="w-3.5 h-3.5" /> Export PDF
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-white hover:border-white/30 transition-colors">
            <Share2 className="w-3.5 h-3.5" /> Share Report
          </button>
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-white hover:border-white/30 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Re-scan
          </button>
        </div>
      </div>

      {/* Sub-scores */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Functionality", score: funcScore },
          { label: "Ease of use", score: easeScore },
          { label: "Coverage", score: coverageScore },
        ].map(({ label, score }) => (
          <div key={label} className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-4 flex justify-center">
            <MiniCircle score={score} label={label} />
          </div>
        ))}
      </div>

      {/* AI Summary */}
      {summary && (
        <div className="relative rounded-2xl overflow-hidden border border-emerald-900/50 shadow-lg shadow-emerald-950/20">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-950 to-[hsl(var(--card))] px-6 py-4 flex items-center justify-between border-b border-emerald-900/40">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30">
                <Star className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">AI Executive Summary</p>
                <p className="text-[11px] text-emerald-500/80 mt-0.5">Generated by Claude · Powered by Rassd</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-900/40 border border-emerald-800/40">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] text-emerald-400 font-medium">AI Analysis</span>
            </div>
          </div>

          {/* Body */}
          <div className="bg-[hsl(var(--card))] divide-y divide-white/[0.06]">

            {/* English block */}
            {summary.executive && (
              <div className="px-6 py-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-500 mb-4 flex items-center gap-2">
                  <span className="w-3 h-px bg-emerald-500" />
                  Executive Summary
                </p>
                <SummaryText text={summary.executive} />
              </div>
            )}

            {/* Arabic block */}
            {summary.executiveAr && (
              <div className="px-6 py-5 font-cairo" dir="rtl" lang="ar">
                <p className="text-[10px] font-bold tracking-[0.15em] text-emerald-500 mb-4 flex items-center gap-2 justify-end">
                  الملخص التنفيذي
                  <span className="w-3 h-px bg-emerald-500" />
                </p>
                <SummaryText text={summary.executiveAr} rtl />
              </div>
            )}

            {/* Recommendations */}
            {summary.recommendations && summary.recommendations.length > 0 && (
              <div className="px-6 py-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[hsl(var(--muted-foreground))] mb-4 flex items-center gap-2">
                  <span className="w-3 h-px bg-[hsl(var(--muted-foreground))]" />
                  Recommendations
                </p>
                <ul className="space-y-3">
                  {summary.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="mt-1 flex-shrink-0 w-5 h-5 rounded-full bg-emerald-900/50 border border-emerald-700/40 flex items-center justify-center text-[10px] font-bold text-emerald-400">
                        {i + 1}
                      </span>
                      <span className="text-sm text-white/80 leading-relaxed">{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Elements Tested & Pages Discovered */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-4">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-400" />
            <div>
              <p className="text-sm font-medium text-white">{run.totalSteps} Elements Tested</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                {run.passedSteps} passed, {run.failedSteps} failed{run.totalSteps - run.passedSteps - run.failedSteps > 0 ? `, ${run.totalSteps - run.passedSteps - run.failedSteps} warnings` : ""}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-4">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
            <div>
              <p className="text-sm font-medium text-white">{pages.length} Pages Discovered</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Unique pages found during the crawl and element testing.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Issues or All Clear */}
      {issues.length > 0 ? (
        <div className="space-y-3">
          {/* Section header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <p className="text-sm font-bold text-white">{issues.length} Critical Issue{issues.length !== 1 ? "s" : ""} Detected</p>
              <div className="flex items-center gap-1.5 ml-2">
                {issues.filter((i) => i.severity === "Critical").length > 0 && (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-red-600 text-white">
                    {issues.filter((i) => i.severity === "Critical").length} Critical
                  </span>
                )}
                {issues.filter((i) => i.severity === "High").length > 0 && (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-orange-500 text-white">
                    {issues.filter((i) => i.severity === "High").length} High
                  </span>
                )}
                {issues.filter((i) => i.severity === "Medium").length > 0 && (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-yellow-500 text-black">
                    {issues.filter((i) => i.severity === "Medium").length} Medium
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => setIssuesExpanded(!issuesExpanded)}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              {issuesExpanded ? "Hide" : `View all ${issues.length}`}
            </button>
          </div>

          {/* Detailed issue cards — collapsed by default */}
          {issuesExpanded && issues.slice(0, 10).map((issue) => {
            const severityBorder = issue.severity === "Critical" ? "border-red-600/60" : issue.severity === "High" ? "border-orange-500/60" : "border-yellow-500/40";
            const severityBg = issue.severity === "Critical" ? "bg-red-950/30" : issue.severity === "High" ? "bg-orange-950/20" : "bg-yellow-950/10";
            const severityIcon = issue.severity === "Critical" ? "bg-red-500" : issue.severity === "High" ? "bg-orange-500" : "bg-yellow-500";

            return (
              <div
                key={issue.id}
                className={`rounded-xl border ${severityBorder} ${severityBg} overflow-hidden`}
              >
                {/* Issue header */}
                <div className="px-5 py-4 flex items-start gap-4">
                  {/* Severity indicator */}
                  <div className="shrink-0 mt-0.5">
                    <div className={`w-3 h-3 rounded-full ${severityIcon}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Title + badges */}
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${severityClass(issue.severity)}`}>
                        {issue.severity}
                      </span>
                      <span className={`px-2 py-0.5 text-[10px] border rounded ${categoryClass(issue.category)}`}>
                        {issue.category}
                      </span>
                      {issue.elementType && (
                        <span className="px-2 py-0.5 text-[10px] border border-white/10 rounded text-white/40">
                          {issue.elementType}
                        </span>
                      )}
                      {issue.section && (
                        <span className="px-2 py-0.5 text-[10px] border border-white/10 rounded text-white/40">
                          {issue.section}
                        </span>
                      )}
                    </div>

                    {/* Element name */}
                    <p className="text-sm font-semibold text-white mb-1.5">{issue.title}</p>

                    {/* Error description */}
                    {issue.description && (
                      <div className="bg-black/30 rounded-lg px-3 py-2 mb-3">
                        <p className="text-xs text-red-300/90 font-mono leading-relaxed break-words">
                          {issue.description}
                        </p>
                      </div>
                    )}

                    {/* Detail grid */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                      {issue.page && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[hsl(var(--muted-foreground))]">Page:</span>
                          <span className="text-white/70 font-mono truncate">{issue.page}</span>
                        </div>
                      )}
                      {issue.responseTimeMs !== undefined && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[hsl(var(--muted-foreground))]">Response:</span>
                          <span className={`font-mono ${issue.responseTimeMs > 5000 ? "text-red-400" : issue.responseTimeMs > 2000 ? "text-yellow-400" : "text-white/70"}`}>
                            {(issue.responseTimeMs / 1000).toFixed(1)}s
                          </span>
                        </div>
                      )}
                      {issue.urlBefore && issue.urlAfter && issue.urlBefore !== issue.urlAfter && (
                        <div className="col-span-2 flex items-center gap-1.5">
                          <span className="text-[hsl(var(--muted-foreground))]">URL changed:</span>
                          <span className="text-white/50 font-mono truncate text-[11px]">
                            {(() => { try { return new URL(issue.urlBefore).pathname; } catch { return issue.urlBefore; } })()}
                          </span>
                          <span className="text-[hsl(var(--muted-foreground))]">&rarr;</span>
                          <span className="text-white/70 font-mono truncate text-[11px]">
                            {(() => { try { return new URL(issue.urlAfter).pathname; } catch { return issue.urlAfter; } })()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Screenshot thumbnail */}
                  {issue.screenshotAfter && (
                    <div className="shrink-0 w-32 h-20 rounded-lg overflow-hidden border border-white/10 bg-black/40">
                      <img
                        src={`/api/artifacts/${issue.screenshotAfter.replace(/^.*?artifacts[\\/]/, "")}`}
                        alt="Error screenshot"
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : run.totalSteps > 0 ? (
        <div className="bg-[hsl(var(--card))] border border-emerald-900/50 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <p className="text-sm font-medium text-white">No Critical Issues Detected</p>
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1 ml-6">
            All tested elements responded without critical errors.
          </p>
        </div>
      ) : null}
    </div>
  );
}
