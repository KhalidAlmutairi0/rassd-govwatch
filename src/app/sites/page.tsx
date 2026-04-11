"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  Globe,
  Calendar,
  Play,
  Clock,
  RefreshCw,
} from "lucide-react";

interface Site {
  id: string;
  name: string;
  nameAr?: string;
  baseUrl: string;
  status: string;
  lastRunAt?: string;
  schedule: number;
  isActive: boolean;
  _count: { runs: number; incidents: number };
}

const STATUS_CONFIG = {
  healthy: { label: "Healthy", dot: "bg-green-500", text: "text-green-600", bg: "bg-green-50 border-green-200" },
  degraded: { label: "Degraded", dot: "bg-yellow-500", text: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200" },
  down: { label: "Down", dot: "bg-red-500", text: "text-red-600", bg: "bg-red-50 border-red-200" },
  unknown: { label: "Pending", dot: "bg-gray-400", text: "text-gray-500", bg: "bg-gray-50 border-gray-200" },
};

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

function scheduleLabel(schedule: number): string {
  if (schedule === 0) return "Manual only";
  if (schedule < 60) return `Every ${schedule} min`;
  return `Every ${schedule / 60}h`;
}

function SiteCard({ site, onScheduleToggle, onRunNow }: {
  site: Site;
  onScheduleToggle: (id: string, newSchedule: number) => void;
  onRunNow: (id: string) => void;
}) {
  const cfg = STATUS_CONFIG[site.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.unknown;
  const isScheduled = site.schedule > 0;
  const [runLoading, setRunLoading] = useState(false);
  const [schedLoading, setSchedLoading] = useState(false);

  const handleRunNow = async () => {
    setRunLoading(true);
    await onRunNow(site.id);
    setRunLoading(false);
  };

  const handleToggleSchedule = async () => {
    setSchedLoading(true);
    await onScheduleToggle(site.id, isScheduled ? 0 : 10);
    setSchedLoading(false);
  };

  return (
    <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5 flex flex-col gap-4 hover:border-white/20 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{site.name}</p>
          {site.nameAr && (
            <p className="text-xs text-[hsl(var(--muted-foreground))] font-medium" dir="rtl">{site.nameAr}</p>
          )}
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5 truncate font-mono">
            {site.baseUrl.replace(/^https?:\/\//, "")}
          </p>
        </div>
        {/* Status dot + label */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
          <span className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-white/5 rounded-lg py-2">
          <p className="text-xs font-bold text-white">{site._count.runs}</p>
          <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">Runs</p>
        </div>
        <div className="bg-white/5 rounded-lg py-2">
          <p className={`text-xs font-bold ${site._count.incidents > 0 ? "text-red-400" : "text-[#22c55e]"}`}>
            {site._count.incidents}
          </p>
          <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">Incidents</p>
        </div>
        <div className="bg-white/5 rounded-lg py-2">
          <p className="text-xs font-bold text-white">{fmtRelative(site.lastRunAt)}</p>
          <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">Last run</p>
        </div>
      </div>

      {/* Schedule toggle row */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            {scheduleLabel(site.schedule)}
          </span>
        </div>
        <button
          onClick={handleToggleSchedule}
          disabled={schedLoading}
          className={`relative w-10 h-5 rounded-full transition-colors shrink-0 disabled:opacity-50 overflow-hidden ${
            isScheduled ? "bg-emerald-600" : "bg-white/20"
          }`}
          title={isScheduled ? "Disable scheduled scans" : "Enable scheduled scans (every 10 min)"}
        >
          <span
            className={`absolute top-0.5 left-0 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              isScheduled ? "translate-x-[22px]" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleRunNow}
          disabled={runLoading}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white text-black hover:bg-white/90 disabled:opacity-50 transition-colors"
        >
          {runLoading ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          {runLoading ? "Starting..." : "Run Now"}
        </button>
        <Link
          href={`/dashboard/${site.id}`}
          className="flex-1 flex items-center justify-center px-3 py-2 text-xs font-medium rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-white hover:border-white/30 transition-colors"
        >
          View Details
        </Link>
      </div>
    </div>
  );
}

export default function AllSitesPage() {
  const router = useRouter();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const loadSites = () => {
    fetch("/api/sites")
      .then((r) => r.json())
      .then((d) => setSites(d.sites ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSites();
    // Auto-refresh every 30s to show updated lastRunAt
    const interval = setInterval(loadSites, 30_000);
    return () => clearInterval(interval);
  }, []);

  const handleScheduleToggle = async (id: string, newSchedule: number) => {
    // Optimistic update
    setSites((prev) =>
      prev.map((s) => (s.id === id ? { ...s, schedule: newSchedule } : s))
    );
    await fetch(`/api/sites/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schedule: newSchedule }),
    });
  };

  const handleRunNow = async (id: string) => {
    const res = await fetch(`/api/sites/${id}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data.run?.id) {
      router.push(`/live/${data.run.id}`);
    }
  };

  const filtered = sites.filter((s) => {
    const matchSearch =
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.baseUrl.toLowerCase().includes(search.toLowerCase()) ||
      (s.nameAr?.includes(search) ?? false);
    const matchFilter =
      filter === "all" ||
      (filter === "scheduled" && s.schedule > 0) ||
      (filter === "manual" && s.schedule === 0) ||
      (filter === "active" && s.status === "healthy") ||
      (filter === "issues" && (s.status === "down" || s.status === "degraded" || s._count.incidents > 0));
    return matchSearch && matchFilter;
  });

  const scheduledCount = sites.filter((s) => s.schedule > 0).length;

  return (
    <div className="p-6 space-y-5 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Sites</h1>
          {!loading && (
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
              {sites.length} sites · {scheduledCount} auto-scanning
            </p>
          )}
        </div>
        <Link
          href="/sites/new"
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-white/10 hover:bg-white/15 text-white rounded-lg border border-white/10 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Site
        </Link>
      </div>

      {/* Search + filter */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
          <input
            type="text"
            placeholder="Search sites..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-white/20"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20"
        >
          <option value="all">All Sites</option>
          <option value="scheduled">Auto-Scanning</option>
          <option value="manual">Manual Only</option>
          <option value="active">Healthy</option>
          <option value="issues">Has Issues</option>
        </select>
        <button
          onClick={loadSites}
          className="p-2 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-white hover:border-white/30 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-52 bg-white/5 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <Globe className="w-10 h-10 mx-auto text-[hsl(var(--muted-foreground))] opacity-30" />
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            {search ? "No sites match your search" : "No sites yet"}
          </p>
          <Link
            href="/sites/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-white text-black font-semibold rounded-lg"
          >
            <Plus className="w-4 h-4" /> Add Your First Site
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((site) => (
            <SiteCard
              key={site.id}
              site={site}
              onScheduleToggle={handleScheduleToggle}
              onRunNow={handleRunNow}
            />
          ))}
        </div>
      )}
    </div>
  );
}
