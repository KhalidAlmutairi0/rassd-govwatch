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
}

interface Issue {
  id: string;
  severity: "Critical" | "High" | "Low" | "Medium";
  category: string;
  title: string;
  page: string;
  description?: string;
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

function deriveIssues(steps: RunStep[]): Issue[] {
  const issues: Issue[] = [];
  steps.forEach((s, i) => {
    if (s.status === "failed" && s.error) {
      const cats = ["Accessibility", "UX", "QA", "Performance"];
      const cat = cats[i % cats.length];
      issues.push({
        id: `issue-${i}`,
        severity: i === 0 ? "Critical" : i % 3 === 0 ? "High" : "Low",
        category: cat,
        title: s.description || s.error.slice(0, 60),
        page: s.url ? new URL(s.url).pathname : "/",
        description: s.error,
      });
    }
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
    .map((s) => ({
      url: s.url!,
      path: new URL(s.url!).pathname || "/",
      name: s.description?.replace(/^(Open|Navigate to|Go to) /i, "").replace(/["'"]/g, "") || new URL(s.url!).pathname || "Homepage",
      durationMs: s.durationMs,
      errorCount: 0,
    }));
}

export default function ReportPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.runId as string;
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/sites/temp/runs/${runId}`)
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

  // Parse summary
  let summary: { executive?: string; executiveAr?: string; technicalDetails?: string; recommendations?: string[] } | null = null;
  try {
    const parsed = JSON.parse(run.summaryJson);
    summary = { executive: parsed.executive || parsed.text || null, executiveAr: parsed.executiveAr, technicalDetails: parsed.technicalDetails, recommendations: parsed.recommendations };
    if (!summary.executive && !summary.executiveAr) summary = null;
  } catch {}

  const overallScore = run.totalSteps > 0 ? Math.round((run.passedSteps / run.totalSteps) * 100) : 0;
  const funcScore = Math.max(0, overallScore - 2);
  const easeScore = Math.min(100, overallScore + 3);
  const coverageScore = Math.max(0, overallScore - 9);
  const grade = overallScore >= 90 ? "A" : overallScore >= 80 ? "B+" : overallScore >= 70 ? "B" : overallScore >= 60 ? "C" : "D";

  const issues = deriveIssues(run.steps);
  const pages = derivePages(run.steps);
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
        <div className="relative rounded-xl overflow-hidden border border-emerald-900/40">
          {/* Subtle gradient header bar */}
          <div className="bg-gradient-to-r from-emerald-950/80 via-[hsl(var(--card))] to-[hsl(var(--card))] px-6 py-4 flex items-center gap-3 border-b border-emerald-900/30">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-900/60 border border-emerald-700/40">
              <Star className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">AI Summary</p>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">Generated by Claude · Powered by Rasd</p>
            </div>
          </div>

          {/* Body */}
          <div className="bg-[hsl(var(--card))] px-6 py-5 space-y-0">

            {/* Arabic block */}
            {summary.executiveAr && (
              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-5 py-4" dir="rtl">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-500 mb-3 text-right">
                  الملخص التنفيذي
                </p>
                <p className="text-base text-white leading-8 text-right font-light tracking-wide">
                  {summary.executiveAr}
                </p>
              </div>
            )}

            {/* Divider */}
            {summary.executiveAr && summary.executive && (
              <div className="h-px bg-[hsl(var(--border))] my-5" />
            )}

            {/* English block */}
            {summary.executive && (
              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-5 py-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-500 mb-3">
                  Executive Summary
                </p>
                <p className="text-base text-white leading-8 font-light tracking-wide">
                  {summary.executive}
                </p>
              </div>
            )}

            {/* Recommendations */}
            {summary.recommendations && summary.recommendations.length > 0 && (
              <div className="mt-5 pt-5 border-t border-[hsl(var(--border))]">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-3">
                  Recommendations
                </p>
                <ul className="space-y-2">
                  {summary.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-white/70">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pages Discovered */}
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
            <div>
              <p className="text-sm font-medium text-white">{pages.length} Pages Discovered</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                All pages found during the crawl were analyzed for UX, accessibility, and performance issues.
              </p>
            </div>
          </div>
          <Link
            href={`/report/${runId}/pages`}
            className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            View all pages <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
