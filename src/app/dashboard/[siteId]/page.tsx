"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Globe,
  Play,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ExternalLink,
  Loader2,
} from "lucide-react";

interface RunStep {
  id: string;
  action: string;
  description: string;
  status: string;
  durationMs?: number;
  error?: string;
}

interface Run {
  id: string;
  status: string;
  startedAt: string;
  durationMs?: number;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  journey?: { name: string };
}

interface Incident {
  id: string;
  title: string;
  severity: string;
  status: string;
  occurrences: number;
  lastSeenAt: string;
}

interface Site {
  id: string;
  name: string;
  nameAr?: string;
  baseUrl: string;
  status: string;
  lastRunAt?: string;
  schedule: number;
  runs: Run[];
  incidents: Incident[];
  _count?: { runs: number; incidents: number };
}

const STATUS_CFG = {
  healthy: { label: "Healthy", dot: "bg-green-500", text: "text-green-400" },
  degraded: { label: "Degraded", dot: "bg-yellow-500", text: "text-yellow-400" },
  down: { label: "Down", dot: "bg-red-500", text: "text-red-400" },
  unknown: { label: "Pending", dot: "bg-gray-500", text: "text-gray-400" },
};

const RUN_CFG: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
  passed: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: "Passed", cls: "text-green-400" },
  failed: { icon: <XCircle className="w-3.5 h-3.5" />, label: "Failed", cls: "text-red-400" },
  error: { icon: <XCircle className="w-3.5 h-3.5" />, label: "Error", cls: "text-red-400" },
  running: { icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, label: "Running", cls: "text-blue-400" },
  queued: { icon: <Clock className="w-3.5 h-3.5" />, label: "Queued", cls: "text-violet-400" },
};

function fmtDuration(ms?: number): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function fmtRelative(dateStr?: string): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const SEVERITY_CLS: Record<string, string> = {
  critical: "bg-red-500/15 text-red-400 border border-red-500/30",
  high: "bg-orange-500/15 text-orange-400 border border-orange-500/30",
  medium: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30",
  low: "bg-gray-500/15 text-gray-400 border border-gray-500/30",
};

export default function SiteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const siteId = params.siteId as string;

  const [site, setSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);
  const [runLoading, setRunLoading] = useState(false);
  const [error, setError] = useState("");

  const loadSite = () => {
    setLoading(true);
    fetch(`/api/sites/${siteId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.site) setSite(d.site);
        else setError("Site not found");
      })
      .catch(() => setError("Failed to load site"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadSite(); }, [siteId]);

  const handleRunNow = async () => {
    setRunLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sites/${siteId}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start run");
      if (data.run?.id) {
        router.push(`/live/${data.run.id}`);
      } else {
        throw new Error("No run ID returned");
      }
    } catch (err: any) {
      setError(err.message);
      setRunLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4 animate-pulse">
        <div className="h-6 bg-white/5 rounded w-48" />
        <div className="h-24 bg-white/5 rounded-xl" />
        <div className="h-64 bg-white/5 rounded-xl" />
      </div>
    );
  }

  if (error && !site) {
    return (
      <div className="p-6">
        <Link href="/sites" className="flex items-center gap-1.5 text-sm text-[hsl(var(--muted-foreground))] hover:text-white mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Sites
        </Link>
        <div className="text-red-400 text-sm">{error}</div>
      </div>
    );
  }

  if (!site) return null;

  const statusCfg = STATUS_CFG[site.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.unknown;
  const recentRuns = site.runs ?? [];
  const passRate = recentRuns.length > 0
    ? Math.round(recentRuns.filter((r) => r.status === "passed").length / recentRuns.length * 100)
    : null;
  const avgDuration = recentRuns.filter((r) => r.durationMs).length > 0
    ? Math.round(recentRuns.filter((r) => r.durationMs).reduce((s, r) => s + (r.durationMs ?? 0), 0) / recentRuns.filter((r) => r.durationMs).length)
    : null;

  return (
    <div className="p-6 space-y-5 max-w-[1200px]">
      {/* Back */}
      <Link href="/sites" className="inline-flex items-center gap-1.5 text-sm text-[hsl(var(--muted-foreground))] hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Sites
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-white/5 border border-[hsl(var(--border))] flex items-center justify-center shrink-0 mt-0.5">
            <Globe className="w-5 h-5 text-[hsl(var(--muted-foreground))]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-white">{site.name}</h1>
              {site.nameAr && (
                <span className="text-sm text-[hsl(var(--muted-foreground))]" dir="rtl">{site.nameAr}</span>
              )}
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${statusCfg.dot}`} />
                <span className={`text-xs font-medium ${statusCfg.text}`}>{statusCfg.label}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-[hsl(var(--muted-foreground))] font-mono truncate">
                {site.baseUrl}
              </span>
              <a href={site.baseUrl} target="_blank" rel="noopener noreferrer" className="text-[hsl(var(--muted-foreground))] hover:text-white transition-colors">
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={loadSite}
            className="p-2 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-white hover:border-white/30 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleRunNow}
            disabled={runLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-white text-black rounded-lg hover:bg-white/90 disabled:opacity-50 transition-colors"
          >
            {runLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {runLoading ? "Starting..." : "Run Scan"}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="text-sm text-red-400 bg-red-950/40 border border-red-900/40 px-4 py-2 rounded-lg">
          {error}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Runs", value: recentRuns.length > 0 ? recentRuns.length.toString() : "0" },
          { label: "Pass Rate", value: passRate !== null ? `${passRate}%` : "—" },
          { label: "Avg Duration", value: avgDuration !== null ? fmtDuration(avgDuration) : "—" },
          { label: "Open Incidents", value: (site.incidents ?? []).length.toString() },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-4">
            <p className="text-xs text-[hsl(var(--muted-foreground))] font-medium">{label}</p>
            <p className="text-2xl font-bold text-white mt-1">{value}</p>
          </div>
        ))}
      </div>

      {/* Open Incidents */}
      {site.incidents && site.incidents.length > 0 && (
        <section className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[hsl(var(--border))] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <h2 className="text-sm font-semibold text-white">Open Incidents</h2>
          </div>
          <div className="divide-y divide-[hsl(var(--border))]">
            {site.incidents.map((incident) => (
              <div key={incident.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{incident.title}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                    {incident.occurrences} occurrences · Last seen {fmtRelative(incident.lastSeenAt)}
                  </p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${SEVERITY_CLS[incident.severity] ?? SEVERITY_CLS.low}`}>
                  {incident.severity}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent Runs */}
      <section className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[hsl(var(--border))] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Recent Runs</h2>
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            Last {recentRuns.length} runs
          </span>
        </div>

        {recentRuns.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Globe className="w-8 h-8 mx-auto text-[hsl(var(--muted-foreground))] opacity-30 mb-3" />
            <p className="text-sm text-[hsl(var(--muted-foreground))]">No runs yet</p>
            <button
              onClick={handleRunNow}
              disabled={runLoading}
              className="mt-3 px-4 py-2 text-sm font-semibold bg-white text-black rounded-lg hover:bg-white/90 disabled:opacity-50"
            >
              Run First Scan
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--border))]">
                {["Status", "Journey", "Started", "Duration", "Steps", ""].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--border))]">
              {recentRuns.map((run) => {
                const cfg = RUN_CFG[run.status] ?? RUN_CFG.queued;
                return (
                  <tr key={run.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3">
                      <div className={`flex items-center gap-1.5 ${cfg.cls}`}>
                        {cfg.icon}
                        <span className="text-xs font-medium">{cfg.label}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-[hsl(var(--muted-foreground))] text-xs">
                      {run.journey?.name ?? "Smoke Test"}
                    </td>
                    <td className="px-5 py-3 text-[hsl(var(--muted-foreground))] text-xs">
                      {fmtRelative(run.startedAt)}
                    </td>
                    <td className="px-5 py-3 text-[hsl(var(--muted-foreground))] text-xs">
                      {fmtDuration(run.durationMs)}
                    </td>
                    <td className="px-5 py-3 text-xs">
                      <span className="text-green-400">{run.passedSteps}✓</span>
                      {run.failedSteps > 0 && (
                        <span className="text-red-400 ml-1">{run.failedSteps}✗</span>
                      )}
                      <span className="text-[hsl(var(--muted-foreground))]">/{run.totalSteps}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/report/${run.id}`}
                        className="text-xs text-[hsl(var(--muted-foreground))] hover:text-white transition-colors flex items-center gap-1 justify-end"
                      >
                        View Report <ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
