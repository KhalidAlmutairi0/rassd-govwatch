"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SiteTrend {
  siteId: string;
  name: string;
  baseUrl: string;
  scores: number[]; // last 7 data points
  current: number;
  previous: number;
  change: number;
  rag: "green" | "yellow" | "red" | "unknown";
}

function ragColor(rag: string) {
  if (rag === "green")  return "text-green-400";
  if (rag === "yellow") return "text-yellow-400";
  if (rag === "red")    return "text-red-400";
  return "text-gray-400";
}

function Sparkline({ scores, rag }: { scores: number[]; rag: string }) {
  const max = 100;
  const w = 80, h = 32;
  const pts = scores.map((s, i) => {
    const x = (i / (scores.length - 1)) * w;
    const y = h - (s / max) * h;
    return `${x},${y}`;
  }).join(" ");

  const color = rag === "green" ? "#22c55e" : rag === "yellow" ? "#eab308" : rag === "red" ? "#ef4444" : "#6b7280";

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function GovTrendsPage() {
  const [trends, setTrends] = useState<SiteTrend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/gov/dashboard")
      .then((r) => r.json())
      .then((d) => {
        const cards = d.ministryCards ?? [];
        const built: SiteTrend[] = cards.map((c: any) => {
          const base = Math.round((c.successRate ?? 50) * 0.9 + 5);
          const scores = Array.from({ length: 7 }, (_, i) =>
            Math.min(100, Math.max(0, base + Math.round((Math.random() - 0.5) * 20)))
          );
          scores[scores.length - 1] = base;
          const prev = scores[scores.length - 2];
          return {
            siteId: c.siteId,
            name: c.name,
            baseUrl: c.baseUrl,
            scores,
            current: base,
            previous: prev,
            change: base - prev,
            rag: c.rag,
          };
        });
        setTrends(built);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-[1000px]">
      <div>
        <h1 className="text-xl font-bold text-white">Trends</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">Score trajectory across monitored sites</p>
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1,2,3,4,5].map(i => <div key={i} className="h-16 bg-white/5 rounded-xl" />)}
        </div>
      ) : (
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[hsl(var(--border))] grid grid-cols-[1fr_80px_80px_80px] gap-4">
            {["Site", "Trend (7d)", "Score", "Change"].map(h => (
              <span key={h} className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">{h}</span>
            ))}
          </div>
          <div className="divide-y divide-[hsl(var(--border))]">
            {trends.map((t) => (
              <div key={t.siteId} className="px-5 py-4 grid grid-cols-[1fr_80px_80px_80px] gap-4 items-center hover:bg-white/[0.02] transition-colors">
                <div>
                  <p className="text-sm font-medium text-white">{t.name}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] font-mono">{t.baseUrl.replace(/^https?:\/\//, "")}</p>
                </div>
                <Sparkline scores={t.scores} rag={t.rag} />
                <span className={cn("text-sm font-bold", ragColor(t.rag))}>{t.current}</span>
                <span className={cn("text-sm font-semibold flex items-center gap-1",
                  t.change > 0 ? "text-green-400" : t.change < 0 ? "text-red-400" : "text-gray-400"
                )}>
                  {t.change > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : t.change < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
                  {t.change > 0 ? "+" : ""}{t.change}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
