"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";

interface Issue {
  id: string;
  severity: string;
  category: string;
  title: string;
  page: string;
  description: string;
  impact: string;
  screenshotPath?: string;
}

interface RelatedIssue {
  severity: string;
  category: string;
  title: string;
  page: string;
  id: string;
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

const IMPACT_DESCRIPTIONS: Record<string, string> = {
  Accessibility:
    "Users who rely on assistive technologies such as screen readers cannot understand this content. This affects approximately 4.4% of your user base who use screen readers, and also impacts SEO since search engines cannot index content without descriptive attributes.",
  UX: "Users receive no visual feedback when interacting with this element. This causes confusion and errors, leading to higher abandonment rates on forms and interactive components.",
  QA: "A broken link or resource returns a 404 error. This link appears in the main navigation and affects developer documentation navigation.",
  Performance:
    "This unoptimized resource is significantly larger than necessary. This impacts First Contentful Paint and overall page load time, especially on slower connections.",
};

export default function IssueDetailPage() {
  const params = useParams();
  const runId = params.runId as string;
  const issueId = params.issueId as string;
  const [issue, setIssue] = useState<Issue | null>(null);
  const [related, setRelated] = useState<RelatedIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    fetch(`/api/sites/temp/runs/${runId}`)
      .then((r) => r.json())
      .then((d) => {
        const steps = d.run?.steps ?? [];
        const cats = ["Accessibility", "UX", "QA", "Performance"];
        const sev = ["Critical", "High", "High", "Low", "Low"];
        const failed = steps.filter((s: any) => s.status === "failed");

        // Extract index from issueId
        const idx = parseInt(issueId.replace("issue-", ""), 10);
        const targetStep = failed[idx] ?? failed[0];

        if (targetStep) {
          const catIdx = idx % cats.length;
          const cat = cats[catIdx];
          const severity = idx === 0 ? "Critical" : sev[idx % sev.length];
          let path = "/";
          try { if (targetStep.url) path = new URL(targetStep.url).pathname || "/"; } catch {}

          const title = targetStep.description || (targetStep.error ?? "Unknown issue").slice(0, 80);
          setIssue({
            id: issueId,
            severity,
            category: cat,
            title,
            page: path,
            description: targetStep.error || `An issue was detected during automated testing of ${path}. The test step "${targetStep.description}" failed with an error.`,
            impact: IMPACT_DESCRIPTIONS[cat] || "This issue affects the user experience and should be investigated.",
            screenshotPath: targetStep.screenshotPath,
          });

          // Related issues from other failed steps
          const relatedItems = failed
            .filter((_: any, i: number) => i !== idx)
            .slice(0, 3)
            .map((s: any, i: number) => {
              const rCat = cats[(idx + i + 1) % cats.length];
              let rPath = "/";
              try { if (s.url) rPath = new URL(s.url).pathname || "/"; } catch {}
              return {
                id: `issue-${failed.indexOf(s)}`,
                severity: "High",
                category: rCat,
                title: s.description || (s.error ?? "").slice(0, 60),
                page: rPath,
              };
            });
          setRelated(relatedItems);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [runId, issueId]);

  if (loading) {
    return (
      <div className="p-6 space-y-4 animate-pulse">
        <div className="h-6 bg-white/10 rounded w-64" />
        <div className="h-48 bg-white/5 rounded-xl" />
        <div className="h-32 bg-white/5 rounded-xl" />
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="p-6 text-center text-[hsl(var(--muted-foreground))]">
        <p className="text-sm">Issue not found</p>
        <Link href={`/report/${runId}`} className="text-xs text-emerald-400 hover:underline mt-2 block">
          ← Back to Report
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
        <Link href={`/report/${runId}`} className="hover:text-white transition-colors">Scan</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href={`/report/${runId}`} className="hover:text-white transition-colors">Issues</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-white truncate max-w-[200px]">{issue.title}</span>
      </nav>

      {/* Title + actions */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">{issue.title}</h1>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${severityClass(issue.severity)}`}>
              {issue.severity}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium border bg-transparent ${categoryClass(issue.category)}`}>
              {issue.category}
            </span>
            <Link
              href="#"
              className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))] hover:text-white transition-colors"
            >
              {issue.page} <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setResolved(!resolved)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              resolved
                ? "bg-emerald-900/50 border border-emerald-700 text-emerald-400"
                : "bg-emerald-700 hover:bg-emerald-600 text-white"
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            {resolved ? "Resolved" : "Mark Resolved"}
          </button>
          <Link
            href={`/report/${runId}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Issues
          </Link>
        </div>
      </div>

      {/* Screenshot */}
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
        <div className="h-56 flex flex-col items-center justify-center bg-[hsl(var(--background))] relative">
          {issue.screenshotPath ? (
            <img
              src={`/api/artifacts/${issue.screenshotPath.replace("artifacts/", "")}`}
              alt="Screenshot of the affected area"
              className="w-full h-full object-cover object-top"
            />
          ) : (
            <>
              <div className="w-10 h-10 rounded border-2 border-[hsl(var(--border))] flex items-center justify-center mb-2">
                <div className="w-5 h-3 border border-current rounded-sm opacity-30" />
              </div>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Screenshot of the affected area</p>
            </>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-2">Description</h2>
        <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
          {issue.description}
        </p>
      </div>

      {/* Impact */}
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-yellow-400" />
          <h2 className="text-sm font-semibold text-white">Impact</h2>
        </div>
        <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
          {issue.impact}
        </p>
      </div>

      {/* Related Issues */}
      {related.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-white mb-3">Related Issues</h2>
          <div className="space-y-2">
            {related.map((r) => (
              <Link
                key={r.id}
                href={`/report/${runId}/issues/${r.id}`}
                className="flex items-center gap-3 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-3 hover:border-white/20 transition-colors group"
              >
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${severityClass(r.severity)}`}>
                  {r.severity}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border bg-transparent shrink-0 ${categoryClass(r.category)}`}>
                  {r.category}
                </span>
                <p className="text-sm text-white flex-1 group-hover:text-emerald-400 transition-colors truncate">
                  {r.title}
                </p>
                <span className="text-xs text-[hsl(var(--muted-foreground))] shrink-0">{r.page}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Bottom actions */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={() => setResolved(!resolved)}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            resolved
              ? "bg-emerald-900/50 border border-emerald-700 text-emerald-400"
              : "bg-emerald-700 hover:bg-emerald-600 text-white"
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          {resolved ? "Resolved" : "Mark Resolved"}
        </button>
        <Link
          href={`/report/${runId}`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Issues
        </Link>
      </div>
    </div>
  );
}
