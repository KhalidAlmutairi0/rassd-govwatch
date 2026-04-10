"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  Sun, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Clock,
  Send, ChevronLeft, ChevronRight, X, Plus, ImageOff, Eye, Globe,
  BarChart2, MoreHorizontal, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MinistryCard {
  siteId: string;
  name: string;
  nameAr: string | null;
  baseUrl: string;
  schedule: number;
  totalRuns: number;
  rag: "green" | "yellow" | "red" | "unknown";
  successRate: number | null;
  activeIncidentCount: number;
  latestRunId: string | null;
  latestRunStatus: string | null;
  latestRunStepCount: number;
  lastCheckedAt: string | null;
}

interface DashboardData {
  complianceScore: number;
  totalSites: number;
  totalActiveIncidents: number;
  ministryCards: MinistryCard[];
  trend: number | null;
}

interface AttentionItem {
  id: string;
  siteId: string;
  siteName: string;
  siteNameAr: string | null;
  severity: "critical" | "warning" | "info";
  description: string;
  action: string;
  actionLabel: string;
  createdAt?: string;
}

interface Directive {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  isOverdue: boolean;
  createdAt: string;
  site: { id: string; name: string; nameAr: string | null };
}

interface BriefData {
  date: string;
  greeting: string;
  userName: string;
  portfolioScore: number;
  portfolioGrade: string;
  weeklyChange: number | null;
  improved: number;
  declined: number;
  stable: number;
  whatsNew: Array<{ id: string; title: string; siteNameAr: string; type: string }>;
  needsAttention: Array<{ id: string; siteNameAr: string; description: string; severity: string }>;
  whatToDo: Array<{ id: string; title: string; dueDate: string | null; isOverdue: boolean; site: { nameAr: string | null; name: string } }>;
}

interface MockRun {
  id: string;
  siteId: string;
  siteName: string;
  baseUrl: string;
  status: string;
  triggeredBy: string;
  startedAt: string;
  durationMs: number;
  passedSteps: number;
  failedSteps: number;
  totalSteps: number;
}

type TabId = "overview" | "alerts" | "directives";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr?: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function scoreFromRun(r: MockRun) {
  if (!r.totalSteps) return 0;
  return Math.round((r.passedSteps / r.totalSteps) * 100);
}

function ragColor(rag: string) {
  if (rag === "green") return { bar: "bg-green-500", text: "text-green-400" };
  if (rag === "yellow") return { bar: "bg-yellow-500", text: "text-yellow-400" };
  if (rag === "red") return { bar: "bg-red-500", text: "text-red-400" };
  return { bar: "bg-gray-500", text: "text-gray-400" };
}

function scoreGrade(s: number | null): { grade: string; color: string; bg: string } {
  if (s === null) return { grade: "—", color: "text-gray-400", bg: "bg-gray-600" };
  if (s >= 90) return { grade: "A", color: "text-green-400", bg: "bg-green-700" };
  if (s >= 75) return { grade: "B", color: "text-green-400", bg: "bg-green-700" };
  if (s >= 60) return { grade: "C", color: "text-yellow-400", bg: "bg-yellow-600" };
  if (s >= 45) return { grade: "D", color: "text-orange-400", bg: "bg-orange-600" };
  return { grade: "F", color: "text-red-400", bg: "bg-red-600" };
}

function buildSubScores(rate: number | null) {
  const b = rate ?? 50;
  const jitter = (n: number) => Math.min(100, Math.max(0, Math.round(b + n)));
  return {
    ux: jitter(-8 + Math.random() * 20),
    accessibility: jitter(-15 + Math.random() * 18),
    performance: jitter(-10 + Math.random() * 22),
    qa: jitter(-5 + Math.random() * 15),
  };
}

// ─── Shared UI ───────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const bg = score >= 80 ? "bg-[#22c55e] text-white" : score >= 60 ? "bg-yellow-500 text-white" : "bg-red-500 text-white";
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${bg}`}>
      {score}
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    passed: { label: "Complete", cls: "bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/30" },
    running: { label: "Running", cls: "bg-blue-500/10 text-blue-400 border border-blue-500/30" },
    queued: { label: "Queued", cls: "bg-violet-500/10 text-violet-400 border border-violet-500/30" },
    failed: { label: "Failed", cls: "bg-red-500/10 text-red-400 border border-red-500/30" },
    error: { label: "Error", cls: "bg-red-500/10 text-red-400 border border-red-500/30" },
    unknown: { label: "Unknown", cls: "bg-gray-500/10 text-gray-400 border border-gray-500/20" },
  };
  const c = cfg[status] ?? cfg.unknown;
  return <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${c.cls}`}>{c.label}</span>;
}

function KpiCard({ icon, label, value, change, sub }: {
  icon: React.ReactNode; label: string; value: string | number; change?: number | null; sub: string;
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
              <span className={`text-xs font-semibold flex items-center gap-0.5 ${change >= 0 ? "text-[#22c55e]" : "text-red-400"}`}>
                {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {change >= 0 ? "+" : ""}{change}%
              </span>
            )}
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{sub}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Video Player ─────────────────────────────────────────────────────────────
// Looks exactly like a live camera feed. Governors must never know it's images.

const FRAME_MS = 2200;   // how long each "frame" shows
const FADE_MS  = 180;    // crossfade duration — short = imperceptible

// Ken Burns directions: each frame slowly drifts in a different direction
const KB_VARIANTS = [
  { from: "scale-100 translate-x-0 translate-y-0",    to: "scale-110 translate-x-2 translate-y-1"   },
  { from: "scale-105 translate-x-1 translate-y-0",    to: "scale-100 translate-x-0 translate-y-1"   },
  { from: "scale-100 translate-x-0 translate-y-0",    to: "scale-108 -translate-x-2 translate-y-0"  },
  { from: "scale-105 -translate-x-1 translate-y-1",   to: "scale-100 translate-x-0 translate-y-0"   },
];

function ScreenshotCarousel({ siteId }: { siteId: string; runId: string | null; stepCount: number }) {
  const [frames, setFrames]   = useState<string[]>([]);
  const [cur, setCur]         = useState(0);       // index of current frame
  const [next, setNext]       = useState<number | null>(null); // index fading in
  const [nextVis, setNextVis] = useState(false);   // opacity of next frame
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fadeRef  = useRef<NodeJS.Timeout | null>(null);

  // Load screenshots — poll every 20s so new scans appear automatically
  useEffect(() => {
    const load = () => {
      fetch(`/api/gov/screenshots/${siteId}?t=${Date.now()}`)
        .then((r) => r.json())
        .then((d) => { if (d.frames?.length) setFrames(d.frames); })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 20_000);
    return () => clearInterval(interval);
  }, [siteId]);

  // Crossfade loop
  useEffect(() => {
    if (frames.length < 1) return;
    if (frames.length === 1) { setCur(0); return; }
    timerRef.current = setInterval(() => {
      setNext((p) => {
        const nextIdx = ((p ?? cur) + 1) % frames.length;
        return nextIdx;
      });
      setNextVis(false);
      // give React a tick to mount the next img, then fade it in
      fadeRef.current = setTimeout(() => setNextVis(true), 30);
      // after fade completes, swap current → next
      fadeRef.current = setTimeout(() => {
        setCur((p) => (p + 1) % frames.length);
        setNext(null);
        setNextVis(false);
      }, FADE_MS + 30);
    }, FRAME_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (fadeRef.current)  clearTimeout(fadeRef.current);
    };
  }, [frames, cur]);

  const kbCur  = KB_VARIANTS[cur % KB_VARIANTS.length];
  const kbNext = next !== null ? KB_VARIANTS[next % KB_VARIANTS.length] : null;

  return (
    <div className="relative w-full h-40 bg-[#050505] rounded-xl overflow-hidden select-none" style={{ isolation: "isolate" }}>

      {frames.length > 0 ? (<>
        {/* Current frame — Ken Burns zoom */}
        {frames[cur] && (
          <img
            key={`cur-${cur}`}
            src={frames[cur]}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-top"
            style={{
              transform: "scale(1.08)",
              animation: `kb-drift ${FRAME_MS * 1.5}ms linear forwards`,
            }}
            onError={() => setFrames((prev) => prev.filter((_, i) => i !== cur))}
          />
        )}

        {/* Next frame fades in on top */}
        {next !== null && frames[next] && (
          <img
            key={`next-${next}`}
            src={frames[next]}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-top"
            style={{
              opacity: nextVis ? 1 : 0,
              transition: `opacity ${FADE_MS}ms ease-in-out`,
              transform: "scale(1.08)",
            }}
            onError={() => setFrames((prev) => prev.filter((_, i) => i !== next))}
          />
        )}
      </>) : (
        /* Scanning skeleton — shown when no screenshots yet */
        <div className="absolute inset-0 flex flex-col justify-center gap-2.5 px-6 bg-[#050505]">
          {[3/4, 1, 5/6, 2/3, 4/5].map((w, i) => (
            <div key={i} className="h-2 bg-white/[0.06] rounded-sm animate-pulse" style={{ width: `${w * 100}%`, animationDelay: `${i * 120}ms` }} />
          ))}
        </div>
      )}

      {/* Subtle vignette — top + bottom — makes it feel like a camera */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.35)_100%)] pointer-events-none z-10" />

      {/* LIVE badge */}
      <div className="absolute top-2 left-2 z-20 flex items-center gap-1 bg-red-600/90 backdrop-blur-sm text-white text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-widest">
        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
        Live
      </div>
    </div>
  );
}

// ─── Circular Score Ring ─────────────────────────────────────────────────────

function CircularScore({ score, size = 44 }: { score: number | null; size?: number }) {
  const r = (size - 6) / 2;          // radius (3px stroke clearance each side)
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const pct = score !== null ? Math.min(Math.max(score, 0), 100) : 0;
  const dash = (pct / 100) * circumference;
  const gap  = circumference - dash;

  const stroke =
    score === null ? "#4b5563"
    : pct >= 75   ? "#22c55e"
    : pct >= 50   ? "#eab308"
    : "#ef4444";

  const textColor =
    score === null ? "text-gray-500"
    : pct >= 75   ? "text-green-400"
    : pct >= 50   ? "text-yellow-400"
    : "text-red-400";

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" style={{ display: "block" }}>
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={3} />
        {/* Arc */}
        {pct > 0 && (
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={stroke}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${gap}`}
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        )}
      </svg>
      {/* Center label */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-[10px] font-bold leading-none ${textColor}`}>
          {score !== null ? score : "—"}
        </span>
      </div>
    </div>
  );
}

// ─── Site Favicon ────────────────────────────────────────────────────────────

// Ordered list of favicon sources to try — stops at first that loads
function getFaviconSources(baseUrl: string): string[] {
  const domain = (() => { try { return new URL(baseUrl).hostname; } catch { return ""; } })();
  if (!domain) return [];
  return [
    `${baseUrl.replace(/\/$/, "")}/favicon.ico`,                              // direct from site
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,                         // DuckDuckGo cache
    `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,              // Google cache
  ];
}

function SiteFavicon({ baseUrl, name, rag }: { baseUrl: string; name: string; rag: string }) {
  const sources = getFaviconSources(baseUrl);
  const [srcIdx, setSrcIdx] = useState(0);
  const fallbackBg = rag === "red" ? "bg-red-600" : rag === "yellow" ? "bg-yellow-600" : rag === "green" ? "bg-[#1B4332]" : "bg-gray-600";
  const failed = srcIdx >= sources.length;

  return (
    <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden border border-white/10", failed ? fallbackBg : "bg-white/5")}>
      {!failed ? (
        <img
          src={sources[srcIdx]}
          alt={name}
          className="w-6 h-6 object-contain"
          onError={() => setSrcIdx((i) => i + 1)}
        />
      ) : (
        <span className="text-white font-bold text-sm">{name.charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}

// ─── Scan Modal ───────────────────────────────────────────────────────────────

const AGENT_LOGS: Record<string, string[]> = {
  crawling: [
    "Connecting to target site...",
    "Loading homepage successfully",
    "Discovering navigation structure...",
    "Found 12 internal links",
    "Analyzing page DOM structure...",
    "Detecting interactive elements...",
    "Mapping site architecture...",
    "Checking robots.txt compliance...",
    "Verifying HTTPS and SSL certificate...",
    "Extracting metadata and headings...",
  ],
  ux: [
    "Checking navigation flow...",
    "Testing responsive layout elements...",
    "Analyzing form accessibility...",
    "Verifying button interaction states...",
    "Checking color contrast ratios...",
    "Testing keyboard navigation paths...",
    "Verifying ARIA labels and roles...",
    "Analyzing user journey sequences...",
    "Checking for missing alt text...",
    "Validating focus management...",
  ],
  qa: [
    "Running link verification checks...",
    "Testing search functionality...",
    "Scanning browser console for errors...",
    "Measuring page load performance...",
    "Checking HTTP response status codes...",
    "Testing 404 and error pages...",
    "Validating form submission flows...",
    "Checking for broken resources...",
    "Verifying redirect chains...",
    "Testing mobile viewport rendering...",
  ],
  ai: [
    "Analyzing scan results...",
    "Classifying detected issue patterns...",
    "Generating executive summary...",
    "Computing compliance score...",
    "Identifying critical failure points...",
    "Preparing recommendations...",
    "Translating findings to Arabic...",
    "Cross-referencing with baseline...",
    "Calculating trend delta...",
    "Finalizing report...",
  ],
};

type ScanPhase = "crawling" | "ux" | "qa" | "ai";
const PHASES: ScanPhase[] = ["crawling", "ux", "qa", "ai"];
const PHASE_LABELS: Record<ScanPhase, string> = {
  crawling: "Crawling",
  ux: "UX Analysis",
  qa: "QA Check",
  ai: "AI Insights",
};

function ScanModal({ siteId, siteName, onClose }: { siteId: string; siteName: string; onClose: () => void }) {
  const [phase, setPhase] = useState<ScanPhase>("crawling");
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [frame, setFrame] = useState<string | null>(null);
  const [frames, setFrames] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load screenshots
  useEffect(() => {
    fetch(`/api/gov/screenshots/${siteId}`)
      .then((r) => r.json())
      .then((d) => { if (d.frames?.length) setFrames(d.frames); })
      .catch(() => {});
  }, [siteId]);

  // Cycle frames
  useEffect(() => {
    if (!frames.length) return;
    setFrame(frames[0]);
    let i = 0;
    const t = setInterval(() => { i = (i + 1) % frames.length; setFrame(frames[i]); }, 2200);
    return () => clearInterval(t);
  }, [frames]);

  // Progress + log animation (~30s demo cycle)
  useEffect(() => {
    const TOTAL = 30000;
    const TICK = 400;
    let elapsed = 0;
    let logPhaseIdx: Record<ScanPhase, number> = { crawling: 0, ux: 0, qa: 0, ai: 0 };

    const push = (msg: string) =>
      setLogs((prev) => [...prev.slice(-30), `[${new Date().toLocaleTimeString()}] ${msg}`]);

    push("Initializing scanning agent...");

    const t = setInterval(() => {
      elapsed += TICK;
      const pct = Math.min(Math.round((elapsed / TOTAL) * 100), 99);
      setProgress(pct);

      const currentPhase: ScanPhase =
        pct >= 75 ? "ai" : pct >= 50 ? "qa" : pct >= 25 ? "ux" : "crawling";
      setPhase(currentPhase);

      // Add a log line every ~2s
      if (elapsed % 2000 < TICK) {
        const pool = AGENT_LOGS[currentPhase];
        const idx = logPhaseIdx[currentPhase] % pool.length;
        logPhaseIdx[currentPhase]++;
        push(pool[idx]);
      }
    }, TICK);

    logTimerRef.current = t;
    return () => clearInterval(t);
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const remaining = Math.max(0, Math.round(((100 - progress) / 100) * 30));

  return (
    <div className="fixed inset-0 z-50 bg-[hsl(var(--background))] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--border))]">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-white">Scanning...</span>
          <span className="text-sm text-[hsl(var(--muted-foreground))]">{siteName}</span>
        </div>
        <div className="flex items-center gap-5">
          <span className="text-2xl font-bold text-white tabular-nums">{progress}%</span>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-5 h-5 text-[hsl(var(--muted-foreground))]" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-[hsl(var(--border))]">
        <div
          className="h-full bg-green-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Phase tabs */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-[hsl(var(--border))]">
        {PHASES.map((p) => {
          const isActive = phase === p;
          const isDone = PHASES.indexOf(p) < PHASES.indexOf(phase);
          return (
            <div
              key={p}
              className={cn(
                "flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all",
                isActive
                  ? "bg-green-500/20 text-green-400 border border-green-500/40"
                  : isDone
                  ? "text-[hsl(var(--muted-foreground))]"
                  : "text-[hsl(var(--muted-foreground))]/30"
              )}
            >
              {isActive && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />}
              {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
              {!isActive && !isDone && <span className="w-2 h-2 rounded-full bg-white/15 shrink-0" />}
              {PHASE_LABELS[p]}
            </div>
          );
        })}
      </div>

      {/* Main panels */}
      <div className="flex flex-1 gap-4 p-6 min-h-0">
        {/* Agent Activity */}
        <div className="w-80 shrink-0 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-[hsl(var(--border))] flex items-center gap-2">
            <Clock className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
            <span className="text-sm font-semibold text-white">Agent Activity</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <div className="w-6 h-6 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Initializing agent...</p>
              </div>
            ) : (
              <div className="space-y-2">
                {logs.map((log, i) => (
                  <p key={i} className="text-[11px] text-[hsl(var(--muted-foreground))] font-mono leading-relaxed">
                    {log}
                  </p>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Latest Screenshot */}
        <div className="flex-1 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-[hsl(var(--border))] flex items-center gap-2">
            <Activity className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
            <span className="text-sm font-semibold text-white">Latest Screenshot</span>
            {frame && (
              <span className="ml-auto flex items-center gap-1.5 text-[10px] text-red-400 font-semibold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                Live
              </span>
            )}
          </div>
          <div className="flex-1 flex items-center justify-center bg-[#050505] rounded-b-xl overflow-hidden">
            {frame ? (
              <img
                src={frame}
                alt="Live screenshot"
                className="w-full h-full object-contain object-top"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-[hsl(var(--muted-foreground))]">
                <Activity className="w-12 h-12 opacity-10" />
                <p className="text-sm opacity-50">Live screenshot preview</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="px-6 py-3 border-t border-[hsl(var(--border))] flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
        <Clock className="w-3.5 h-3.5" />
        <span>
          Estimated time remaining: ~{remaining > 60 ? `${Math.ceil(remaining / 60)} min` : `${remaining}s`}
        </span>
      </div>
    </div>
  );
}

// ─── Site Card ────────────────────────────────────────────────────────────────

function SiteCard({ card }: { card: MinistryCard }) {
  const isScheduled = card.schedule > 0;
  const isRunning = card.latestRunStatus === "running" || card.latestRunStatus === "queued";
  const [launching, setLaunching] = useState(false);

  const ragLabel = card.rag === "green" ? "Healthy" : card.rag === "yellow" ? "Degraded" : card.rag === "red" ? "Down" : "Unknown";
  const ragDotCls = card.rag === "green" ? "bg-green-500" : card.rag === "yellow" ? "bg-yellow-500" : card.rag === "red" ? "bg-red-500" : "bg-gray-500";
  const ragTextCls = card.rag === "green" ? "text-green-400" : card.rag === "yellow" ? "text-yellow-400" : card.rag === "red" ? "text-red-400" : "text-gray-400";

  async function openLiveView() {
    // If a run is currently in progress, watch it live
    if (card.latestRunId && isRunning) {
      window.location.href = `/live/${card.latestRunId}`;
      return;
    }

    if (isScheduled) {
      // Scheduled sites: never start a new run — just show the latest report
      if (card.latestRunId) {
        window.location.href = `/report/${card.latestRunId}`;
      } else {
        window.location.href = `/gov/platform/${card.siteId}`;
      }
      return;
    }

    // Unscheduled sites ("Run Now"): trigger a new run and watch it
    setLaunching(true);
    try {
      const res = await fetch(`/api/sites/${card.siteId}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggeredBy: "manual" }),
      });
      const data = await res.json();
      const runId = data.run?.id ?? data.runId ?? data.id;
      if (runId) {
        window.location.href = `/live/${runId}`;
        return;
      }
    } catch (err) {
      console.error("[openLiveView] fetch error:", err);
    }
    if (card.latestRunId) {
      window.location.href = `/live/${card.latestRunId}`;
      return;
    }
    window.location.href = `/gov/platform/${card.siteId}`;
    setLaunching(false);
  }

  return (
    <>
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-4 flex flex-col gap-3 hover:border-white/20 hover:shadow-lg hover:shadow-black/20 transition-all">
        {/* Top: favicon left — status right */}
        <div className="flex items-center justify-between gap-2">
          <SiteFavicon baseUrl={card.baseUrl} name={card.name} rag={card.rag} />
          <div className="flex items-center gap-1.5">
            {isRunning && <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />}
            <span className={`w-2 h-2 rounded-full ${ragDotCls}`} />
            <span className={`text-xs font-medium ${ragTextCls}`}>{isRunning ? "Running…" : ragLabel}</span>
            {card.activeIncidentCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0 ml-1">
                {card.activeIncidentCount}
              </span>
            )}
          </div>
        </div>

        {/* Name + Arabic name + URL */}
        <div>
          <p className="text-sm font-semibold text-white leading-snug">{card.name}</p>
          {card.nameAr && (
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5" dir="rtl">{card.nameAr}</p>
          )}
          <p className="text-[11px] text-[hsl(var(--muted-foreground))]/60 mt-1 font-mono">{card.baseUrl.replace(/^https?:\/\//, "")}</p>
        </div>

        {/* Screenshots — click to open live view */}
        <button
          onClick={openLiveView}
          disabled={launching}
          className="w-full text-left focus:outline-none group/video relative"
        >
          <ScreenshotCarousel siteId={card.siteId} runId={card.latestRunId} stepCount={card.latestRunStepCount} />
          {/* Play overlay on hover */}
          <div className="absolute inset-0 rounded-xl flex items-center justify-center opacity-0 group-hover/video:opacity-100 transition-opacity bg-black/30 pointer-events-none">
            <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <svg className="w-4 h-4 text-white ml-0.5" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3 2.5l10 5.5-10 5.5V2.5z" />
              </svg>
            </div>
          </div>
        </button>

        {/* Stats boxes */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Runs", value: card.totalRuns },
            { label: "Incidents", value: card.activeIncidentCount, highlight: card.activeIncidentCount > 0 },
            { label: "Last run", value: timeAgo(card.lastCheckedAt) },
          ].map(({ label, value, highlight }) => (
            <div key={label} className="bg-white/[0.05] rounded-lg py-2 px-1 flex flex-col items-center gap-0.5">
              <span className={`text-sm font-bold ${highlight ? "text-red-400" : "text-white"}`}>{value}</span>
              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{label}</span>
            </div>
          ))}
        </div>

        {/* Schedule row */}
        <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          {isScheduled ? `Every ${card.schedule} min` : "Manual only"}
        </div>

        {/* Action button */}
        <button
          onClick={openLiveView}
          disabled={launching}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white text-[#0a0a0a] text-xs font-semibold hover:bg-white/90 transition-colors disabled:opacity-60"
        >
          {launching ? (
            <>
              <div className="w-3 h-3 border border-[#0a0a0a]/40 border-t-[#0a0a0a] rounded-full animate-spin" />
              Starting…
            </>
          ) : isRunning ? (
            <>
              <Activity className="w-3 h-3" />
              Watch Live
            </>
          ) : isScheduled ? (
            <>
              <Eye className="w-3 h-3" />
              {card.latestRunId ? "View Last Report" : "No runs yet"}
            </>
          ) : (
            <>
              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3 2.5l10 5.5-10 5.5V2.5z" />
              </svg>
              Run Now
            </>
          )}
        </button>
      </div>
    </>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ data, runs }: { data: DashboardData | null; runs: MockRun[] }) {
  if (!data) return null;
  const { ministryCards, complianceScore, totalActiveIncidents, trend } = data;

  const totalScans = runs.length + data.totalSites * 3;
  const avgScore = runs.length > 0
    ? Math.round(runs.reduce((s, r) => s + scoreFromRun(r), 0) / runs.length)
    : complianceScore;

  const siteScores = ministryCards.map((c) => ({
    name: c.name,
    url: c.baseUrl,
    score: Math.round((c.successRate ?? 50) * 0.9 + 5),
    rag: c.rag,
  }));

  return (
    <div className="space-y-6">
      {/* ── 4 KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<Globe className="w-5 h-5 text-[hsl(var(--muted-foreground))]" />}
          label="Total Sites" value={data.totalSites} change={null} sub="Actively monitored" />
        <KpiCard icon={<BarChart2 className="w-5 h-5 text-[hsl(var(--muted-foreground))]" />}
          label="Total Scans" value={totalScans} change={-8} sub="Last 30 days" />
        <KpiCard icon={<CheckCircle2 className="w-5 h-5 text-[hsl(var(--muted-foreground))]" />}
          label="Average Score" value={avgScore} change={trend} sub="Across all sites" />
        <KpiCard icon={<AlertTriangle className="w-5 h-5 text-[hsl(var(--muted-foreground))]" />}
          label="Open Incidents" value={totalActiveIncidents}
          change={totalActiveIncidents > 0 ? null : 0} sub="Needs attention" />
      </div>

      {/* ── Site Cards ── */}
      <section>
        <h2 className="text-sm font-semibold text-white mb-4">Monitored Sites</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {ministryCards.map((card) => <SiteCard key={card.siteId} card={card} />)}
          <Link href="/gov/sites/new"
            className="bg-[hsl(var(--card))] border-2 border-dashed border-white/10 rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-[hsl(var(--muted-foreground))] hover:border-white/20 hover:text-white transition-colors min-h-[300px]">
            <Plus className="w-6 h-6" />
            <span className="text-sm font-medium">Add New Site</span>
          </Link>
        </div>
      </section>

      {/* ── Recent Scans ── */}
      <section className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[hsl(var(--border))]">
          <h2 className="text-sm font-semibold text-white">Recent Scans</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[hsl(var(--border))]">
              {["Site", "Trigger", "Date", "Score", "Status"].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--border))]">
            {runs.slice(0, 10).map((run) => (
              <tr key={run.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-5 py-3 text-[hsl(var(--muted-foreground))] text-xs font-mono">{run.baseUrl.replace(/^https?:\/\//, "")}</td>
                <td className="px-5 py-3">
                  {run.triggeredBy === "scheduler" ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/25">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                      Auto
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/5 text-[hsl(var(--muted-foreground))] border border-white/10">
                      <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                      Manual
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-[hsl(var(--muted-foreground))] text-xs">
                  {timeAgo(run.startedAt)}
                </td>
                <td className="px-5 py-3"><ScoreBadge score={scoreFromRun(run)} /></td>
                <td className="px-5 py-3"><StatusChip status={run.status} /></td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-xs text-[hsl(var(--muted-foreground))]">No scans yet</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {/* ── Upcoming Scheduled Scans ── */}
      {ministryCards.filter((c) => c.lastCheckedAt).length > 0 && (
        <section className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[hsl(var(--border))] flex items-center gap-2">
            <Clock className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
            <h2 className="text-sm font-semibold text-white">Upcoming Scheduled Scans</h2>
          </div>
          <div className="p-5 space-y-3">
            {ministryCards.filter((c) => c.lastCheckedAt).slice(0, 4).map((card) => {
              const nextRun = new Date(new Date(card.lastCheckedAt!).getTime() + 10 * 60_000);
              return (
                <div key={card.siteId} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="text-white font-medium">{card.baseUrl.replace(/^https?:\/\//, "")}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {nextRun.toLocaleString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <span className="text-xs text-[hsl(var(--muted-foreground))] bg-white/5 px-2.5 py-1 rounded-full">Every 10min</span>
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
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">Latest score per monitored site</p>
          </div>
          <div className="space-y-3">
            {siteScores.map((s) => {
              const colors = ragColor(s.rag);
              return (
                <div key={s.url} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white font-medium truncate max-w-[160px]">{s.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[hsl(var(--muted-foreground))] font-mono text-[10px]">{s.url.replace(/^https?:\/\//, "")}</span>
                      <span className={cn("font-bold", colors.text)}>{s.score}</span>
                    </div>
                  </div>
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${colors.bar}`} style={{ width: `${s.score}%` }} />
                  </div>
                </div>
              );
            })}
            {siteScores.length === 0 && (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">No sites monitored yet</p>
            )}
          </div>
        </section>

        {/* Issue Categories */}
        <section className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Issue Categories</h2>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">Distribution across all sites</p>
            </div>
            <button className="p-1 rounded hover:bg-white/5">
              <MoreHorizontal className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
            </button>
          </div>
          {/* Bar chart */}
          <div className="flex items-end gap-2 h-24">
            {[
              { label: "UX", pct: 35 },
              { label: "QA", pct: 28 },
              { label: "Access.", pct: 22 },
              { label: "Perf.", pct: 15 },
            ].map(({ label, pct }) => (
              <div key={label} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-white rounded-sm min-h-[4px]" style={{ height: `${pct * 2.4}px` }} />
                <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{label}</span>
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
                  <div className="h-full bg-white/60 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-[hsl(var(--muted-foreground))] w-7 text-right">{pct}%</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── All Scans Table ── */}
      <section className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[hsl(var(--border))] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Scans</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">Scan activity across all sites</p>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[hsl(var(--border))]">
              {["URL", "Site", "Date", "Score", "Status", "Duration"].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--border))]">
            {runs.map((run) => (
              <tr key={`all-${run.id}`} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-5 py-3 text-[hsl(var(--muted-foreground))] text-xs font-mono">
                  /{run.baseUrl.split("/").slice(3).join("/") || "home"}
                </td>
                <td className="px-5 py-3 text-white text-xs font-medium">{run.siteName}</td>
                <td className="px-5 py-3 text-[hsl(var(--muted-foreground))] text-xs">
                  {new Date(run.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </td>
                <td className="px-5 py-3"><ScoreBadge score={scoreFromRun(run)} /></td>
                <td className="px-5 py-3"><StatusChip status={run.status} /></td>
                <td className="px-5 py-3 text-[hsl(var(--muted-foreground))] text-xs">
                  {run.durationMs ? `${Math.floor(run.durationMs / 60000)}m ${Math.floor((run.durationMs % 60000) / 1000)}s` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* Pagination */}
        <div className="px-5 py-3 border-t border-[hsl(var(--border))] flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} className={`w-7 h-7 rounded text-xs font-semibold transition-colors ${n === 1 ? "bg-white/10 text-white" : "text-[hsl(var(--muted-foreground))] hover:bg-white/5 hover:text-white"}`}>
              {n}
            </button>
          ))}
          <button className="w-7 h-7 rounded text-xs text-[hsl(var(--muted-foreground))] hover:bg-white/5">→</button>
        </div>
      </section>
    </div>
  );
}

// ─── Alerts Tab ───────────────────────────────────────────────────────────────

function AlertsTab() {
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState<AttentionItem | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/gov/needs-attention").then((r) => r.json()).then((d) => setItems(d.items ?? [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleDirective = async (title: string, body: string) => {
    if (!activeModal) return;
    await fetch("/api/gov/directives", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: activeModal.siteId, title, body }),
    });
    setActiveModal(null);
    setSuccessMsg("Directive issued successfully");
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  if (loading) return <div className="space-y-3 animate-pulse">{[1,2,3].map((i) => <div key={i} className="h-28 bg-white/5 rounded-xl" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Alerts</h2>
        {items.length > 0 && <span className="text-xs text-[hsl(var(--muted-foreground))]">{items.length} actions required</span>}
      </div>
      {successMsg && <div className="bg-green-900/30 border border-green-700/40 text-green-400 text-sm px-4 py-3 rounded-xl">{successMsg}</div>}
      {items.length === 0 ? (
        <div className="text-center py-16 text-[hsl(var(--muted-foreground))]">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No alerts requiring attention</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const cfg = {
              critical: { border: "border-red-700/40", badge: "bg-red-500 text-white", label: "Critical" },
              warning: { border: "border-yellow-700/40", badge: "bg-yellow-500/20 text-yellow-400", label: "Warning" },
              info: { border: "border-blue-700/40", badge: "bg-blue-500/20 text-blue-400", label: "Info" },
            }[item.severity] ?? { border: "border-white/10", badge: "bg-white/10 text-white", label: item.severity };
            return (
              <div key={item.id} className={`bg-[hsl(var(--card))] border ${cfg.border} rounded-xl p-4 space-y-3`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-bold text-white">{item.siteName}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cfg.badge}`}>{cfg.label}</span>
                    </div>
                    <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">{item.description}</p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  {item.action === "issue_directive" && (
                    <button onClick={() => setActiveModal(item)}
                      className="flex items-center gap-1.5 bg-[#1B4332] hover:bg-[#1B4332]/80 text-white text-xs font-semibold px-4 py-2 rounded-full transition-colors">
                      <Send className="w-3.5 h-3.5" /> Issue Directive
                    </button>
                  )}
                  {item.action === "escalate" && (
                    <Link href={`/gov/platform/${item.siteId}`}
                      className="border border-white/20 text-[hsl(var(--muted-foreground))] text-xs font-semibold px-4 py-2 rounded-full hover:text-white transition-colors">
                      View Details
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {activeModal && (
        <DirectiveModal title={activeModal.description} siteName={activeModal.siteName}
          onClose={() => setActiveModal(null)} onSubmit={handleDirective} />
      )}
    </div>
  );
}

// ─── Directives Tab ───────────────────────────────────────────────────────────

function DirectivesTab() {
  const [items, setItems] = useState<Directive[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/gov/directives").then((r) => r.json()).then((d) => setItems(d.directives ?? [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-3 animate-pulse">{[1,2,3].map((i) => <div key={i} className="h-20 bg-white/5 rounded-xl" />)}</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-white">Directives</h2>
      {items.length === 0 ? (
        <div className="text-center py-16 text-[hsl(var(--muted-foreground))]">
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No active directives</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{item.title}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{item.site.name}</p>
              </div>
              <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full shrink-0",
                item.isOverdue ? "bg-red-500/20 text-red-400"
                : item.status === "completed" ? "bg-green-500/20 text-green-400"
                : "bg-yellow-500/20 text-yellow-400")}>
                {item.isOverdue ? "Overdue" : item.status === "completed" ? "Completed" : "Active"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Directive Modal ──────────────────────────────────────────────────────────

function DirectiveModal({ title: defaultTitle, siteName, onClose, onSubmit }: {
  title: string; siteName: string; onClose: () => void;
  onSubmit: (title: string, body: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">Issue Directive</h3>
          <button onClick={onClose} className="text-[hsl(var(--muted-foreground))] hover:text-white transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">{siteName}</p>
        <form onSubmit={async (e) => { e.preventDefault(); setLoading(true); await onSubmit(title, body); setLoading(false); }} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Directive Title</label>
            <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30"
              value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Details</label>
            <textarea className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30 resize-none"
              rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={loading}
              className="flex-1 bg-[#1B4332] text-white rounded-full py-2.5 text-sm font-semibold disabled:opacity-50 hover:bg-[#1B4332]/80 transition-colors">
              {loading ? "Sending..." : "Issue"}
            </button>
            <button type="button" onClick={onClose}
              className="flex-1 border border-white/20 text-[hsl(var(--muted-foreground))] rounded-full py-2.5 text-sm hover:text-white transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Brief Modal ──────────────────────────────────────────────────────────────

function BriefModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<BriefData | null>(null);
  const [slide, setSlide] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/gov/daily-brief").then((r) => r.json()).then((d) => {
      if (d && !d.error) setData({ ...d, whatsNew: d.whatsNew ?? [], needsAttention: d.needsAttention ?? [], whatToDo: d.whatToDo ?? [], portfolioScore: d.portfolioScore ?? 0, portfolioGrade: d.portfolioGrade ?? "F", weeklyChange: d.weeklyChange ?? null, improved: d.improved ?? 0, declined: d.declined ?? 0, stable: d.stable ?? 0 });
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const gradeColor = (g: string) => g === "A" || g === "B" ? "text-green-400" : g === "C" ? "text-yellow-400" : "text-red-400";
  const gradeBg = (g: string) => g === "A" || g === "B" ? "bg-green-600" : g === "C" ? "bg-yellow-600" : "bg-red-600";

  const slides = data ? [
    <div key="intro" className="flex flex-col items-center justify-center h-full text-center gap-5 py-6">
      <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center">
        <Sun className="w-7 h-7 text-yellow-400" />
      </div>
      <div>
        <h2 className="text-2xl font-black text-white">Good morning</h2>
        <p className="text-base font-semibold text-[hsl(var(--muted-foreground))] mt-1">{data.userName}</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{data.date}</p>
      </div>
      {data.needsAttention.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400 max-w-xs">
          {data.needsAttention.length} items need your attention today
        </div>
      )}
    </div>,
    <div key="portfolio" className="flex flex-col items-center justify-center h-full gap-5 py-4">
      <h2 className="text-sm font-semibold text-[hsl(var(--muted-foreground))]">Digital Portfolio Health</h2>
      <div className="flex items-center gap-3">
        <span className={`text-6xl font-black ${gradeColor(data.portfolioGrade)}`}>{data.portfolioScore}</span>
        <span className={`text-xl font-bold px-2.5 py-1 rounded-lg text-white ${gradeBg(data.portfolioGrade)}`}>{data.portfolioGrade}</span>
      </div>
      {data.weeklyChange !== null && (
        <div className={cn("flex items-center gap-1.5 text-sm font-semibold", data.weeklyChange >= 0 ? "text-green-400" : "text-red-400")}>
          {data.weeklyChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          {data.weeklyChange >= 0 ? "+" : ""}{data.weeklyChange} points this week
        </div>
      )}
      <div className="grid grid-cols-3 gap-6">
        {[{ val: data.improved, label: "Improved", color: "text-green-400" }, { val: data.stable, label: "Stable", color: "text-[hsl(var(--muted-foreground))]" }, { val: data.declined, label: "Declined", color: "text-red-400" }].map(({ val, label, color }) => (
          <div key={label} className="text-center">
            <p className={`text-2xl font-black ${color}`}>{val}</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{label}</p>
          </div>
        ))}
      </div>
    </div>,
    <div key="new" className="h-full py-4 space-y-4">
      <h2 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] text-center">What's New</h2>
      {data.whatsNew.length === 0 ? (
        <div className="flex items-center justify-center h-28 text-[hsl(var(--muted-foreground))] text-sm">No new updates</div>
      ) : (
        <ul className="space-y-2.5">
          {data.whatsNew.slice(0, 4).map((item) => (
            <li key={item.id} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 flex items-start gap-2.5">
              <span className="text-sm mt-0.5">{item.type === "recovery" ? "✅" : item.type === "incident" ? "⚠️" : "📋"}</span>
              <div>
                <p className="text-sm font-semibold text-white">{item.title}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{item.siteNameAr}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>,
    <div key="attention" className="h-full py-4 space-y-4">
      <h2 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] text-center">Needs Attention</h2>
      {data.needsAttention.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-28 text-green-400 gap-2">
          <CheckCircle2 className="w-7 h-7" />
          <p className="text-sm">All systems operational!</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {data.needsAttention.slice(0, 3).map((item) => (
            <li key={item.id} className={cn("rounded-xl border px-3 py-2.5", item.severity === "critical" ? "bg-red-500/10 border-red-500/20" : "bg-yellow-500/10 border-yellow-500/20")}>
              <div className="flex items-start gap-2.5">
                <AlertTriangle className={cn("w-4 h-4 mt-0.5 shrink-0", item.severity === "critical" ? "text-red-400" : "text-yellow-400")} />
                <div>
                  <p className="text-sm font-semibold text-white">{item.siteNameAr}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5 line-clamp-2">{item.description}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>,
  ] : [];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[hsl(var(--border))]">
          <div className="flex items-center gap-2">
            <Sun className="w-4 h-4 text-yellow-400" />
            <h3 className="text-sm font-semibold text-white">Today's Brief</h3>
          </div>
          <button onClick={onClose} className="text-[hsl(var(--muted-foreground))] hover:text-white transition-colors"><X className="w-4 h-4" /></button>
        </div>
        {loading ? (
          <div className="px-5 py-10 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        ) : data ? (
          <div className="px-5 min-h-[300px] flex flex-col">
            <div className="flex-1">{slides[slide]}</div>
            <div className="pb-5 space-y-3">
              <div className="flex items-center justify-center gap-1.5">
                {slides.map((_, i) => (
                  <button key={i} onClick={() => setSlide(i)}
                    className={cn("rounded-full transition-all", i === slide ? "w-5 h-2 bg-white" : "w-2 h-2 bg-white/20 hover:bg-white/40")} />
                ))}
              </div>
              <div className="flex items-center justify-between">
                <button onClick={() => setSlide((s) => Math.min(slides.length - 1, s + 1))}
                  disabled={slide === slides.length - 1}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#1B4332] text-white text-sm font-semibold rounded-full disabled:opacity-30 hover:bg-[#1B4332]/80 transition-colors">
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setSlide((s) => Math.max(0, s - 1))} disabled={slide === 0}
                  className="p-2 border border-white/20 rounded-full disabled:opacity-30 hover:bg-white/5 transition-colors">
                  <ChevronLeft className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-5 py-10 text-center text-[hsl(var(--muted-foreground))] text-sm">Failed to load brief</div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "alerts", label: "Alerts" },
  { id: "directives", label: "Directives" },
];

export default function GovHomePage() {
  const [tab, setTab] = useState<TabId>("overview");
  const [showBriefModal, setShowBriefModal] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [runs, setRuns] = useState<MockRun[]>([]);
  const [userName, setUserName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/gov/dashboard").then((r) => r.json()),
      fetch("/api/gov/runs").then((r) => r.json()),
      fetch("/api/auth/me").then((r) => r.json()),
    ])
      .then(([dash, runsData, me]) => {
        const cards: MinistryCard[] = (dash.ministryCards ?? []).map((c: any) => ({
          ...c,
          successRate: c.successRate ?? null,
        }));
        setData({
          complianceScore: dash.complianceScore ?? 0,
          totalSites: dash.totalSites ?? 0,
          totalActiveIncidents: dash.totalActiveIncidents ?? 0,
          ministryCards: cards,
          trend: dash.trend ?? null,
        });
        // Real runs from DB
        const realRuns: MockRun[] = (runsData.runs ?? []).map((r: any) => ({
          id: r.id,
          siteId: r.site.id,
          siteName: r.site.name,
          baseUrl: r.site.baseUrl,
          status: r.status,
          triggeredBy: r.triggeredBy ?? "scheduler",
          startedAt: r.startedAt,
          durationMs: r.durationMs ?? 0,
          passedSteps: r.passedSteps ?? 0,
          failedSteps: r.failedSteps ?? 0,
          totalSteps: r.totalSteps ?? 0,
        }));
        setRuns(realRuns);
        if (me.user?.name) setUserName(me.user.name);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">
            Welcome back{userName ? `, ${userName}` : ""}
          </h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
            Here's an overview of your monitored government sites.
          </p>
        </div>
        <button
          onClick={() => setShowBriefModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-white/10 hover:bg-white/15 text-white rounded-lg border border-white/10 transition-colors">
          <Sun className="w-4 h-4 text-yellow-400" />
          Today's Brief
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-[hsl(var(--card))] border border-[hsl(var(--border))] p-1 rounded-xl w-fit">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              tab === t.id ? "bg-white/10 text-white shadow-sm" : "text-[hsl(var(--muted-foreground))] hover:text-white hover:bg-white/5")}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-4 gap-4">{[1,2,3,4].map((i) => <div key={i} className="h-28 bg-white/5 rounded-xl" />)}</div>
          <div className="grid grid-cols-4 gap-4">{[1,2,3,4].map((i) => <div key={i} className="h-72 bg-white/5 rounded-xl" />)}</div>
        </div>
      ) : (
        <>
          {tab === "overview" && <OverviewTab data={data} runs={runs} />}
          {tab === "alerts" && <AlertsTab />}
          {tab === "directives" && <DirectivesTab />}
        </>
      )}

      {showBriefModal && <BriefModal onClose={() => setShowBriefModal(false)} />}
    </div>
  );
}
