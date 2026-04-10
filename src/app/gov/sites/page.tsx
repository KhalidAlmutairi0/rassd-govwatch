"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

function Favicon({ baseUrl, name }: { baseUrl: string; name: string }) {
  const domain = (() => { try { return new URL(baseUrl).hostname; } catch { return ""; } })();
  const sources = domain ? [
    `${baseUrl.replace(/\/$/, "")}/favicon.ico`,
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
  ] : [];
  const [idx, setIdx] = useState(0);
  const failed = idx >= sources.length;
  return (
    <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
      {!failed ? (
        <img src={sources[idx]} alt={name} className="w-5 h-5 object-contain" onError={() => setIdx((i) => i + 1)} />
      ) : (
        <span className="text-white font-bold text-sm">{name.charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}

interface SiteRow {
  siteId: string;
  name: string;
  baseUrl: string;
  rag: string;
  successRate: number | null;
  activeIncidentCount: number;
  lastCheckedAt: string | null;
}

function StatusDot({ rag }: { rag: string }) {
  const cls = rag === "green" ? "bg-green-500" : rag === "yellow" ? "bg-yellow-500" : rag === "red" ? "bg-red-500" : "bg-gray-500";
  return <span className={`w-2 h-2 rounded-full ${cls} shrink-0`} />;
}

function ragLabel(rag: string) {
  if (rag === "green")  return { label: "Healthy",  cls: "text-green-400 bg-green-500/10 border-green-500/20" };
  if (rag === "yellow") return { label: "Degraded", cls: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" };
  if (rag === "red")    return { label: "Down",     cls: "text-red-400 bg-red-500/10 border-red-500/20" };
  return { label: "Unknown", cls: "text-gray-400 bg-gray-500/10 border-gray-500/20" };
}

function timeAgo(d?: string | null) {
  if (!d) return "Never";
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function GovSitesPage() {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/gov/dashboard")
      .then((r) => r.json())
      .then((d) => setSites(d.ministryCards ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-[900px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">All Sites</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">{sites.length} sites under supervision</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1,2,3,4,5].map(i => <div key={i} className="h-16 bg-white/5 rounded-xl" />)}
        </div>
      ) : (
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_120px_80px_80px_40px] px-5 py-3 border-b border-[hsl(var(--border))]">
            {["Site", "Status", "Score", "Last Check", ""].map(h => (
              <span key={h} className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">{h}</span>
            ))}
          </div>
          <div className="divide-y divide-[hsl(var(--border))]">
            {sites.map((s) => {
              const { label, cls } = ragLabel(s.rag);
              const score = Math.round((s.successRate ?? 50) * 0.9 + 5);
              return (
                <Link
                  key={s.siteId}
                  href={`/gov/platform/${s.siteId}`}
                  className="grid grid-cols-[1fr_120px_80px_80px_40px] px-5 py-4 items-center hover:bg-white/[0.02] transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Favicon baseUrl={s.baseUrl} name={s.name} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{s.name}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))] font-mono truncate">{s.baseUrl.replace(/^https?:\/\//, "")}</p>
                    </div>
                  </div>
                  <div>
                    <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${cls}`}>{label}</span>
                  </div>
                  <span className="text-sm font-bold text-white">{score}</span>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">{timeAgo(s.lastCheckedAt)}</span>
                  <ChevronRight className="w-4 h-4 text-[hsl(var(--muted-foreground))] group-hover:text-white transition-colors justify-self-end" />
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
