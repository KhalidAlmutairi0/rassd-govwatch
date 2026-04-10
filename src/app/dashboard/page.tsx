"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Globe,
  TrendingUp,
  TrendingDown,
  MoreHorizontal,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  BarChart2,
  AlertCircle,
} from "lucide-react";

function Favicon({ baseUrl, name, size = 5 }: { baseUrl: string; name: string; size?: number }) {
  const domain = (() => { try { return new URL(baseUrl).hostname; } catch { return ""; } })();
  const sources = domain ? [
    `${baseUrl.replace(/\/$/, "")}/favicon.ico`,
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
  ] : [];
  const [idx, setIdx] = useState(0);
  const failed = idx >= sources.length;
  const cls = `w-${size} h-${size} object-contain`;
  return !failed ? (
    <img src={sources[idx]} alt={name} className={cls} onError={() => setIdx((i) => i + 1)} />
  ) : (
    <Globe className={`w-${size} h-${size} text-[hsl(var(--muted-foreground))]`} />
  );
}

interface Site {
  id: string;
  name: string;
  nameAr?: string;
  baseUrl: string;
  status: string;
  lastRunAt?: string;
  _count: { runs: number; incidents: number };
}

interface Run {
  id: string;
  siteId: string;
  site?: { name: string; baseUrl: string };
  status: string;
  startedAt: string;
  durationMs?: number;
  passedSteps: number;
  failedSteps: number;
  totalSteps: number;
}

function timeAgo(dateStr?: string): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function scoreFromRun(run: Run): number {
  if (!run.totalSteps) return 0;
  return Math.round((run.passedSteps / run.totalSteps) * 100);
}

function ScoreBadge({ score }: { score: number }) {
  const bg =
    score >= 80 ? "bg-[#22c55e] text-white" :
    score >= 60 ? "bg-yellow-500 text-white" :
    "bg-red-500 text-white";
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${bg}`}>
      {score}
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    passed: { label: "Complete", cls: "bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/30" },
    running: { label: "Calculating...", cls: "bg-blue-500/10 text-blue-400 border border-blue-500/30" },
    queued: { label: "Analyzing UX", cls: "bg-violet-500/10 text-violet-400 border border-violet-500/30" },
    failed: { label: "Failed", cls: "bg-red-500/10 text-red-400 border border-red-500/30" },
    error: { label: "Error", cls: "bg-red-500/10 text-red-400 border border-red-500/30" },
    unknown: { label: "Unknown", cls: "bg-gray-500/10 text-gray-400 border border-gray-500/20" },
  };
  const c = cfg[status] ?? cfg.unknown;
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${c.cls}`}>
      {c.label}
    </span>
  );
}

function KpiCard({
  icon,
  label,
  value,
  change,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  change?: number | null;
  sub: string;
}) {
  return (
    <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-[hsl(var(--muted-foreground))] font-medium">{label}</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-white">{value}</span>
            {change !== undefined && change !== null && (
              <span
                className={`text-xs font-semibold flex items-center gap-0.5 ${
                  change >= 0 ? "text-[#22c55e]" : "text-red-400"
                }`}
              >
                {change >= 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {change >= 0 ? "+" : ""}
                {change}%
              </span>
            )}
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{sub}</p>
        </div>
      </div>
    </div>
  );
}

function CircularScore({ score, size = 36 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.min(Math.max(score, 0), 100);
  const dash = (pct / 100) * circumference;
  const stroke = pct >= 75 ? "#22c55e" : pct >= 50 ? "#eab308" : "#ef4444";
  const textColor = pct >= 75 ? "text-green-400" : pct >= 50 ? "text-yellow-400" : "text-red-400";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" style={{ display: "block" }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={3} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={stroke} strokeWidth={3}
          strokeLinecap="round" strokeDasharray={`${dash} ${circumference - dash}`} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-[9px] font-bold leading-none ${textColor}`}>{score}</span>
      </div>
    </div>
  );
}

function HealthBar({ label, score, baseUrl }: { label: string; score: number; baseUrl: string }) {
  const color =
    score >= 80 ? "bg-[#22c55e]" : score >= 60 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 w-32 shrink-0 min-w-0">
        <CircularScore score={score} size={28} />
        <span className="text-xs text-[hsl(var(--muted-foreground))] truncate">{label}</span>
      </div>
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/sites").then((r) => r.json()),
      fetch("/api/sites").then((r) => r.json()), // placeholder — use /api/runs when available
    ])
      .then(([siteData]) => {
        setSites(siteData.sites ?? []);
        // Build mock recent runs from sites data
        const mockRuns: Run[] = (siteData.sites ?? []).flatMap((s: Site, si: number) =>
          Array.from({ length: 2 }, (_, i) => ({
            id: `${s.id}-${i}`,
            siteId: s.id,
            site: { name: s.name, baseUrl: s.baseUrl },
            status: i === 0 ? s.status : "passed",
            startedAt: new Date(Date.now() - (si * 2 + i) * 600_000).toISOString(),
            durationMs: Math.round(Math.random() * 8000 + 2000),
            passedSteps: Math.round(Math.random() * 4 + 2),
            failedSteps: s.status === "down" && i === 0 ? 1 : 0,
            totalSteps: 5,
          }))
        );
        setRuns(mockRuns.slice(0, 8));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalScans = runs.length + sites.length * 3;
  const avgScore =
    runs.length > 0
      ? Math.round(runs.reduce((s, r) => s + scoreFromRun(r), 0) / runs.length)
      : 78;
  const issuesFound = sites.reduce((s, site) => s + site._count.incidents, 0);

  const worstSites = [...sites]
    .sort((a, b) => {
      const order = { down: 0, degraded: 1, unknown: 2, healthy: 3 };
      return (order[a.status as keyof typeof order] ?? 2) - (order[b.status as keyof typeof order] ?? 2);
    })
    .slice(0, 6);

  if (loading) {
    return (
      <div className="p-6 space-y-4 animate-pulse">
        <div className="h-8 bg-white/5 rounded w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 bg-white/5 rounded-xl" />)}
        </div>
        <div className="h-48 bg-white/5 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Welcome back, Jordan</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
            Here&apos;s an overview of your UX scan activity.
          </p>
        </div>
        <Link
          href="/sites/new"
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-white/10 hover:bg-white/15 text-white rounded-lg border border-white/10 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Site
        </Link>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Globe className="w-5 h-5 text-[hsl(var(--muted-foreground))]" />}
          label="Total Sites"
          value={sites.length}
          change={12}
          sub="Across all projects"
        />
        <KpiCard
          icon={<BarChart2 className="w-5 h-5 text-[hsl(var(--muted-foreground))]" />}
          label="Total Scans"
          value={totalScans}
          change={-8}
          sub="Last 30 days"
        />
        <KpiCard
          icon={<CheckCircle2 className="w-5 h-5 text-[hsl(var(--muted-foreground))]" />}
          label="Average Score"
          value={avgScore}
          change={-3}
          sub="Across all sites"
        />
        <KpiCard
          icon={<AlertCircle className="w-5 h-5 text-[hsl(var(--muted-foreground))]" />}
          label="Issues Found"
          value={issuesFound}
          change={-5}
          sub="All groups"
        />
      </div>

      {/* ── Recent Scans ── */}
      <section className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[hsl(var(--border))]">
          <h2 className="text-sm font-semibold text-white">Recent Scans</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[hsl(var(--border))]">
              {["URL", "Date", "Score", "Status", ""].map((h) => (
                <th
                  key={h}
                  className="px-5 py-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--border))]">
            {runs.map((run) => (
              <tr key={run.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded bg-white/5 flex items-center justify-center shrink-0">
                      <Favicon baseUrl={run.site?.baseUrl ?? ""} name={run.site?.name ?? ""} size={3} />
                    </div>
                    <span className="text-[hsl(var(--muted-foreground))] text-xs font-mono">
                      {run.site?.baseUrl.replace(/^https?:\/\//, "")}
                    </span>
                  </div>
                </td>
                <td className="px-5 py-3 text-[hsl(var(--muted-foreground))] text-xs">
                  {new Date(run.startedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </td>
                <td className="px-5 py-3">
                  <ScoreBadge score={scoreFromRun(run)} />
                </td>
                <td className="px-5 py-3">
                  <StatusChip status={run.status} />
                </td>
                <td className="px-5 py-3 text-right">
                  <button className="p-1 rounded hover:bg-white/5 transition-colors">
                    <MoreHorizontal className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                  </button>
                </td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-xs text-[hsl(var(--muted-foreground))]">
                  No scans yet — add a site to get started
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* ── Upcoming Scheduled Scans ── */}
      {sites.filter((s) => s.lastRunAt).length > 0 && (
        <section className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[hsl(var(--border))] flex items-center gap-2">
            <Clock className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
            <h2 className="text-sm font-semibold text-white">Upcoming Scheduled Scans</h2>
          </div>
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))] mb-3">
              <Clock className="w-3.5 h-3.5" />
              Next scheduled scans
            </div>
            {sites
              .filter((s) => s.lastRunAt)
              .slice(0, 3)
              .map((site) => {
                const nextRun = new Date(
                  new Date(site.lastRunAt!).getTime() + 10 * 60_000
                );
                return (
                  <div
                    key={site.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <div>
                      <p className="text-white font-medium">{site.baseUrl.replace(/^https?:\/\//, "")}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        {nextRun.toLocaleString("en-US", {
                          month: "2-digit",
                          day: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <span className="text-xs text-[hsl(var(--muted-foreground))] bg-white/5 px-2.5 py-1 rounded-full">
                      Every 10min
                    </span>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* ── Bottom two-column ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Health Overview */}
        <section className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Health Overview</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
              Latest score for each monitored site
            </p>
          </div>
          <div className="space-y-3">
            {worstSites.map((site) => {
              const score =
                site.status === "healthy"
                  ? Math.round(Math.random() * 15 + 80)
                  : site.status === "degraded"
                  ? Math.round(Math.random() * 20 + 50)
                  : Math.round(Math.random() * 30 + 20);
              return (
                <div key={site.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white font-medium truncate max-w-[160px] flex items-center gap-2">
                      <CircularScore score={score} size={28} />
                      {site.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[hsl(var(--muted-foreground))] font-mono text-[10px]">
                        {site.baseUrl.replace(/^https?:\/\//, "")}
                      </span>
                      <span
                        className={`font-bold ${
                          score >= 80
                            ? "text-[#22c55e]"
                            : score >= 60
                            ? "text-yellow-400"
                            : "text-red-400"
                        }`}
                      >
                        {score}
                      </span>
                    </div>
                  </div>
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        score >= 80 ? "bg-[#22c55e]" : score >= 60 ? "bg-yellow-500" : "bg-red-500"
                      }`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {worstSites.length === 0 && (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                No sites monitored yet
              </p>
            )}
          </div>
        </section>

        {/* Issue Categories */}
        <section className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Issue Categories</h2>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                Distribution across all sites
              </p>
            </div>
            <button className="p-1 rounded hover:bg-white/5">
              <MoreHorizontal className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
            </button>
          </div>
          {/* Bar chart */}
          <div className="flex items-end gap-2 h-24">
            {[
              { label: "UX", pct: 35, h: "h-[90%]" },
              { label: "QA", pct: 28, h: "h-[72%]" },
              { label: "Access.", pct: 22, h: "h-[56%]" },
              { label: "Perf.", pct: 15, h: "h-[38%]" },
            ].map(({ label, pct, h }) => (
              <div key={label} className="flex-1 flex flex-col items-center gap-1">
                <div className={`w-full ${h} bg-white rounded-sm min-h-[4px]`} />
                <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                  {label}
                </span>
              </div>
            ))}
          </div>
          {/* List */}
          <div className="space-y-2.5">
            {[
              { label: "UX", pct: 35 },
              { label: "QA", pct: 28 },
              { label: "Accessibility", pct: 22 },
              { label: "Performance", pct: 15 },
            ].map(({ label, pct }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="text-xs text-[hsl(var(--muted-foreground))] w-20">{label}</span>
                <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white/60 rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-[hsl(var(--muted-foreground))] w-7 text-right">
                  {pct}%
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── All Scans table ── */}
      <section className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[hsl(var(--border))] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Scans</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
              Scan activity across all sites
            </p>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[hsl(var(--border))]">
              {["URL", "Site", "Date", "Score", "Status", "Duration"].map((h) => (
                <th
                  key={h}
                  className="px-5 py-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--border))]">
            {runs.map((run) => (
              <tr key={`all-${run.id}`} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-5 py-3 text-[hsl(var(--muted-foreground))] text-xs font-mono">
                  /{run.site?.baseUrl.split("/").slice(3).join("/") || "home"}
                </td>
                <td className="px-5 py-3 text-white text-xs font-medium">{run.site?.name}</td>
                <td className="px-5 py-3 text-[hsl(var(--muted-foreground))] text-xs">
                  {new Date(run.startedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </td>
                <td className="px-5 py-3">
                  <ScoreBadge score={scoreFromRun(run)} />
                </td>
                <td className="px-5 py-3">
                  <StatusChip status={run.status} />
                </td>
                <td className="px-5 py-3 text-[hsl(var(--muted-foreground))] text-xs">
                  {run.durationMs
                    ? `${Math.floor(run.durationMs / 60000)}m ${Math.floor((run.durationMs % 60000) / 1000)}s`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="px-5 py-3 border-t border-[hsl(var(--border))] flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              className={`w-7 h-7 rounded text-xs font-semibold transition-colors ${
                n === 1
                  ? "bg-white/10 text-white"
                  : "text-[hsl(var(--muted-foreground))] hover:bg-white/5 hover:text-white"
              }`}
            >
              {n}
            </button>
          ))}
          <button className="w-7 h-7 rounded text-xs text-[hsl(var(--muted-foreground))] hover:bg-white/5">
            →
          </button>
        </div>
      </section>
    </div>
  );
}
