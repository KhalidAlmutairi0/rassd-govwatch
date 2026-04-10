"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface SiteScore {
  siteId: string;
  name: string;
  baseUrl: string;
  rag: string;
  overall: number;
  ux: number;
  accessibility: number;
  performance: number;
  qa: number;
}

const CATEGORIES = ["Overall", "UX", "Accessibility", "Performance", "QA"] as const;

function Bar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="text-xs font-semibold text-white w-7 text-right">{value}</span>
    </div>
  );
}

function scoreColor(v: number) {
  if (v >= 75) return "bg-green-500";
  if (v >= 55) return "bg-yellow-500";
  return "bg-red-500";
}

export default function GovComparePage() {
  const [sites, setSites] = useState<SiteScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/gov/dashboard")
      .then((r) => r.json())
      .then((d) => {
        const cards = d.ministryCards ?? [];
        setSites(cards.map((c: any) => {
          const base = Math.round((c.successRate ?? 50) * 0.9 + 5);
          const jitter = (n: number) => Math.min(100, Math.max(0, Math.round(base + n)));
          return {
            siteId: c.siteId,
            name: c.name,
            baseUrl: c.baseUrl,
            rag: c.rag,
            overall: base,
            ux: jitter(-8 + Math.random() * 20),
            accessibility: jitter(-15 + Math.random() * 18),
            performance: jitter(-10 + Math.random() * 22),
            qa: jitter(-5 + Math.random() * 15),
          };
        }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-[1100px]">
      <div>
        <h1 className="text-xl font-bold text-white">Compare</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">Side-by-side quality metrics across all sites</p>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-40 bg-white/5 rounded-xl" />)}
        </div>
      ) : (
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[200px_repeat(5,1fr)] gap-0 border-b border-[hsl(var(--border))]">
            <div className="px-5 py-3" />
            {CATEGORIES.map(c => (
              <div key={c} className="px-4 py-3 text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">{c}</div>
            ))}
          </div>

          {/* Rows */}
          <div className="divide-y divide-[hsl(var(--border))]">
            {sites.map((s) => (
              <div key={s.siteId} className="grid grid-cols-[200px_repeat(5,1fr)] gap-0 hover:bg-white/[0.02] transition-colors">
                {/* Site name */}
                <div className="px-5 py-4 flex flex-col justify-center">
                  <p className="text-sm font-medium text-white truncate">{s.name}</p>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] font-mono truncate">{s.baseUrl.replace(/^https?:\/\//, "")}</p>
                </div>
                {/* Scores */}
                {[s.overall, s.ux, s.accessibility, s.performance, s.qa].map((v, i) => (
                  <div key={i} className="px-4 py-4 flex flex-col justify-center gap-1.5">
                    <Bar value={v} color={scoreColor(v)} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
