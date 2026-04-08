"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Globe, Plus, AlertCircle, Clock, RefreshCw } from "lucide-react";

interface Site {
  id: string;
  name: string;
  nameAr?: string;
  baseUrl: string;
  status: string;
  lastRunAt?: string;
  _count: { runs: number; incidents: number };
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    healthy: "bg-emerald-500",
    degraded: "bg-yellow-500",
    down: "bg-red-500",
    unknown: "bg-gray-500",
  };
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${colors[status] ?? colors.unknown}`} />
  );
}

function StatusLabel({ status }: { status: string }) {
  const labels: Record<string, { text: string; cls: string }> = {
    healthy: { text: "Healthy", cls: "text-emerald-400" },
    degraded: { text: "Degraded", cls: "text-yellow-400" },
    down: { text: "Down", cls: "text-red-400" },
    unknown: { text: "Unknown", cls: "text-gray-400" },
  };
  const cfg = labels[status] ?? labels.unknown;
  return <span className={`text-xs font-medium ${cfg.cls}`}>{cfg.text}</span>;
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

export default function Dashboard() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);

  useEffect(() => {
    fetchSites();
  }, []);

  const fetchSites = async () => {
    try {
      const res = await fetch("/api/sites");
      const data = await res.json();
      setSites(data.sites ?? []);
    } catch {}
    setLoading(false);
  };

  const triggerRun = async (siteId: string) => {
    setTriggering(siteId);
    try {
      const res = await fetch(`/api/sites/${siteId}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.run) window.location.href = `/live/${data.run.id}`;
    } catch {}
    setTriggering(null);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">All Sites</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
            {loading ? "Loading..." : `${sites.length} site${sites.length !== 1 ? "s" : ""} monitored`}
          </p>
        </div>
        <Link
          href="/sites/new"
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Site
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 animate-pulse"
            >
              <div className="h-4 bg-white/10 rounded w-1/2 mb-3" />
              <div className="h-3 bg-white/5 rounded w-3/4 mb-4" />
              <div className="h-8 bg-white/5 rounded" />
            </div>
          ))}
        </div>
      ) : sites.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Globe className="w-12 h-12 text-[hsl(var(--muted-foreground))] mb-4" />
          <h3 className="text-white font-medium mb-1">No sites yet</h3>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">
            Add your first site to start monitoring
          </p>
          <Link
            href="/sites/new"
            className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white transition-colors"
          >
            Add First Site
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sites.map((site) => (
            <div
              key={site.id}
              className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 hover:border-white/20 transition-colors group"
            >
              {/* Site header */}
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusDot status={site.status} />
                    <h3 className="text-sm font-semibold text-white truncate">{site.name}</h3>
                  </div>
                  {site.nameAr && (
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5 mr-4" dir="rtl">
                      {site.nameAr}
                    </p>
                  )}
                  <p className="text-xs text-[hsl(var(--muted-foreground))] truncate mt-0.5">
                    {site.baseUrl}
                  </p>
                </div>
                <StatusLabel status={site.status} />
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-white/[0.03] rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-white">{site._count.runs}</p>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Scans</p>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-2 text-center">
                  <p className={`text-lg font-bold ${site._count.incidents > 0 ? "text-red-400" : "text-white"}`}>
                    {site._count.incidents}
                  </p>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Issues</p>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-2 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Clock className="w-3 h-3 text-[hsl(var(--muted-foreground))]" />
                    <p className="text-xs text-white">{timeAgo(site.lastRunAt)}</p>
                  </div>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">Last scan</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => triggerRun(site.id)}
                  disabled={triggering === site.id}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-900/50 hover:bg-emerald-800/60 text-emerald-400 border border-emerald-800/40 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${triggering === site.id ? "animate-spin" : ""}`} />
                  {triggering === site.id ? "Starting..." : "Scan Now"}
                </button>
                <Link
                  href={`/dashboard/${site.id}`}
                  className="flex-1 flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-md bg-white/5 hover:bg-white/10 text-[hsl(var(--muted-foreground))] hover:text-white border border-white/10 transition-colors"
                >
                  View Details
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
