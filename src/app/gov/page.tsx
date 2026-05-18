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

interface IssueCategory {
  label: string;
  count: number;
  pct: number;
}

interface DashboardData {
  complianceScore: number;
  totalSites: number;
  totalActiveIncidents: number;
  ministryCards: MinistryCard[];
  trend: number | null;
  issueCategories?: IssueCategory[];
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

type TabId = "overview" | "alerts" | "directives" | "kpi";

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

function ScreenshotCarousel({ siteId, isRunning, hasRuns }: { siteId: string; runId: string | null; stepCount: number; isRunning: boolean; hasRuns: boolean }) {
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
      </>) : isRunning ? (
        /* Test currently running — scanning animation */
        <div className="absolute inset-0 flex flex-col justify-center gap-2.5 px-6 bg-[#050505]">
          {[3/4, 1, 5/6, 2/3, 4/5].map((w, i) => (
            <div key={i} className="h-2 bg-blue-500/20 rounded-sm animate-pulse" style={{ width: `${w * 100}%`, animationDelay: `${i * 120}ms` }} />
          ))}
        </div>
      ) : !hasRuns ? (
        /* No tests have ever run — empty/prompt state */
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#050505]">
          <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
            <svg className="w-4 h-4 text-white/30" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3 2.5l10 5.5-10 5.5V2.5z" />
            </svg>
          </div>
          <p className="text-[10px] text-white/30 font-medium">No tests run yet</p>
        </div>
      ) : (
        /* Has past runs but screenshots not loaded yet */
        <div className="absolute inset-0 flex flex-col justify-center gap-2.5 px-6 bg-[#050505]">
          {[3/4, 1, 5/6, 2/3, 4/5].map((w, i) => (
            <div key={i} className="h-2 bg-white/[0.06] rounded-sm animate-pulse" style={{ width: `${w * 100}%`, animationDelay: `${i * 120}ms` }} />
          ))}
        </div>
      )}

      {/* Subtle vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.35)_100%)] pointer-events-none z-10" />

      {/* LIVE badge — only when a test is actively running */}
      {isRunning && (
        <div className="absolute top-2 left-2 z-20 flex items-center gap-1 bg-red-600/90 backdrop-blur-sm text-white text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-widest">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          Live
        </div>
      )}
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
        <div className="flex-1 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl flex flex-col overflow-hidden max-h-[420px]">
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
                className="max-w-full max-h-[360px] object-contain object-top"
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

function SiteCard({ card, onRemove }: { card: MinistryCard; onRemove?: (siteId: string) => void }) {
  const isScheduled = card.schedule > 0;
  const isRunning = card.latestRunStatus === "running" || card.latestRunStatus === "queued";
  const hasRuns = card.latestRunId !== null || card.totalRuns > 0;
  const [launching, setLaunching] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function handleRemove() {
    setRemoving(true);
    try {
      const res = await fetch(`/api/sites/${card.siteId}`, { method: "DELETE" });
      if (res.ok) onRemove?.(card.siteId);
    } catch {}
    setRemoving(false);
    setConfirmRemove(false);
  }

  // ── State classification ──────────────────────────────────────────────────
  // 1.1: Auto monitoring ON + test currently running → join live view
  // 1.2: Auto monitoring ON + test done → show last results (no manual trigger)
  // 2:   Auto monitoring OFF + has previous runs → results + Run Now button
  // 3:   Auto monitoring OFF + no runs at all → empty state + Run First Test

  const ragLabel = card.rag === "green" ? "Healthy" : card.rag === "yellow" ? "Degraded" : card.rag === "red" ? "Down" : "Unknown";
  const ragDotCls = card.rag === "green" ? "bg-green-500" : card.rag === "yellow" ? "bg-yellow-500" : card.rag === "red" ? "bg-red-500" : "bg-gray-500";
  const ragTextCls = card.rag === "green" ? "text-green-400" : card.rag === "yellow" ? "text-yellow-400" : card.rag === "red" ? "text-red-400" : "text-gray-400";

  function watchLive() {
    if (card.latestRunId) {
      window.location.href = `/live/${card.latestRunId}`;
    }
  }

  function viewReport() {
    if (card.latestRunId) {
      window.location.href = `/report/${card.latestRunId}`;
    }
  }

  async function startNewScan() {
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
      console.error("[startNewScan] fetch error:", err);
    }
    setLaunching(false);
  }

  return (
    <>
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-4 flex flex-col gap-3 hover:border-white/20 hover:shadow-lg hover:shadow-black/20 transition-all relative group/card">
        {/* Remove button */}
        {onRemove && !confirmRemove && (
          <button
            onClick={() => setConfirmRemove(true)}
            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/5 flex items-center justify-center opacity-0 group-hover/card:opacity-100 hover:bg-red-500/20 hover:text-red-400 text-[hsl(var(--muted-foreground))] transition-all z-10"
            title="Remove site"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        {confirmRemove && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm rounded-xl z-20 flex flex-col items-center justify-center gap-3 p-4">
            <p className="text-sm text-white text-center font-medium">Remove <span className="text-red-400">{card.nameAr || card.name}</span>?</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] text-center">This will delete all scan history and data for this site.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmRemove(false)}
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRemove}
                disabled={removing}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors disabled:opacity-50"
              >
                {removing ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        )}

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

        {/* Screenshots — click to watch live or view report */}
        <button
          onClick={isRunning ? watchLive : viewReport}
          disabled={!card.latestRunId}
          className="w-full text-left focus:outline-none group/video relative"
        >
          <ScreenshotCarousel siteId={card.siteId} runId={card.latestRunId} stepCount={card.latestRunStepCount} isRunning={isRunning} hasRuns={hasRuns} />
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

        {/* Action buttons — 3 states */}
        {isRunning ? (
          /* Scan in progress (dev / scheduler / manual) → watch it live */
          <button
            onClick={watchLive}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition-colors"
          >
            <Activity className="w-3 h-3" />
            Watch Live
          </button>
        ) : hasRuns ? (
          /* Finished scan exists → view report + run new scan */
          <div className="flex gap-2">
            <button
              onClick={viewReport}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white text-xs font-semibold hover:bg-white/15 transition-colors"
            >
              <Eye className="w-3 h-3" />
              View Report
            </button>
            <button
              onClick={startNewScan}
              disabled={launching}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white text-[#0a0a0a] text-xs font-semibold hover:bg-white/90 transition-colors disabled:opacity-60"
            >
              {launching ? (
                <div className="w-3 h-3 border border-[#0a0a0a]/40 border-t-[#0a0a0a] rounded-full animate-spin" />
              ) : (
                <>
                  <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3 2.5l10 5.5-10 5.5V2.5z" />
                  </svg>
                  Run Scan
                </>
              )}
            </button>
          </div>
        ) : (
          /* No scans yet → run first test */
          <button
            onClick={startNewScan}
            disabled={launching}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white text-[#0a0a0a] text-xs font-semibold hover:bg-white/90 transition-colors disabled:opacity-60"
          >
            {launching ? (
              <>
                <div className="w-3 h-3 border border-[#0a0a0a]/40 border-t-[#0a0a0a] rounded-full animate-spin" />
                Starting…
              </>
            ) : (
              <>
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3 2.5l10 5.5-10 5.5V2.5z" />
                </svg>
                Run First Test
              </>
            )}
          </button>
        )}
      </div>
    </>
  );
}

// ─── Critical Issues Section ─────────────────────────────────────────────────

interface CriticalIssue {
  id: string;
  severity: string;
  category: string;
  title: string;
  page: string;
  description: string;
  elementType: string;
  section: string | null;
  responseTimeMs: number | null;
  urlBefore: string | null;
  urlAfter: string | null;
  screenshotAfter: string | null;
  siteName: string;
  siteNameAr: string | null;
  siteUrl: string;
}

function severityBadge(s: string) {
  if (s === "Critical") return "bg-red-600 text-white";
  if (s === "High") return "bg-orange-500 text-white";
  if (s === "Medium") return "bg-yellow-500 text-black";
  return "bg-yellow-400 text-black";
}

function categoryBadge(c: string) {
  if (c === "Accessibility") return "border-blue-500 text-blue-400";
  if (c === "UX") return "border-purple-500 text-purple-400";
  if (c === "QA") return "border-cyan-500 text-cyan-400";
  if (c === "Performance") return "border-orange-500 text-orange-400";
  return "border-gray-500 text-gray-400";
}

function CriticalIssuesSection({ refreshKey = 0 }: { refreshKey?: number }) {
  const [issues, setIssues] = useState<CriticalIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch("/api/critical-issues")
      .then((r) => r.json())
      .then((d) => setIssues(d.issues ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading) return null;
  if (issues.length === 0) return null;

  const criticalCount = issues.filter((i) => i.severity === "Critical").length;
  const highCount = issues.filter((i) => i.severity === "High").length;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          <h2 className="text-sm font-bold text-white">
            {issues.length} Critical Issue{issues.length !== 1 ? "s" : ""} Detected
          </h2>
          <div className="flex items-center gap-1.5 ml-2">
            {criticalCount > 0 && (
              <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-red-600 text-white">
                {criticalCount} Critical
              </span>
            )}
            {highCount > 0 && (
              <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-orange-500 text-white">
                {highCount} High
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          {expanded ? "Hide" : `View all ${issues.length}`}
        </button>
      </div>

      {expanded && issues.map((issue) => {
        const borderCls = issue.severity === "Critical" ? "border-red-600/60" : issue.severity === "High" ? "border-orange-500/60" : "border-yellow-500/40";
        const bgCls = issue.severity === "Critical" ? "bg-red-950/30" : issue.severity === "High" ? "bg-orange-950/20" : "bg-yellow-950/10";
        const dotCls = issue.severity === "Critical" ? "bg-red-500" : issue.severity === "High" ? "bg-orange-500" : "bg-yellow-500";

        return (
          <div key={issue.id} className={`rounded-xl border ${borderCls} ${bgCls} overflow-hidden`}>
            <div className="px-5 py-4 flex items-start gap-4">
              <div className="shrink-0 mt-0.5">
                <div className={`w-3 h-3 rounded-full ${dotCls}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${severityBadge(issue.severity)}`}>
                    {issue.severity}
                  </span>
                  <span className={`px-2 py-0.5 text-[10px] border rounded ${categoryBadge(issue.category)}`}>
                    {issue.category}
                  </span>
                  {issue.elementType && (
                    <span className="px-2 py-0.5 text-[10px] border border-white/10 rounded text-white/40">
                      {issue.elementType}
                    </span>
                  )}
                  <span className="px-2 py-0.5 text-[10px] border border-white/10 rounded text-white/40 ml-auto">
                    {issue.siteNameAr || issue.siteName}
                  </span>
                </div>

                <p className="text-sm font-semibold text-white mb-1.5">{issue.title}</p>

                {issue.description && (
                  <div className="bg-black/30 rounded-lg px-3 py-2 mb-3">
                    <p className="text-xs text-red-300/90 font-mono leading-relaxed break-words line-clamp-3">
                      {issue.description}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                  {issue.page && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[hsl(var(--muted-foreground))]">Page:</span>
                      <span className="text-white/70 font-mono truncate">{issue.page}</span>
                    </div>
                  )}
                  {issue.responseTimeMs !== null && issue.responseTimeMs !== undefined && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[hsl(var(--muted-foreground))]">Response:</span>
                      <span className={`font-mono ${issue.responseTimeMs > 5000 ? "text-red-400" : issue.responseTimeMs > 2000 ? "text-yellow-400" : "text-white/70"}`}>
                        {(issue.responseTimeMs / 1000).toFixed(1)}s
                      </span>
                    </div>
                  )}
                  {issue.urlBefore && issue.urlAfter && issue.urlBefore !== issue.urlAfter && (
                    <div className="col-span-2 flex items-center gap-1.5">
                      <span className="text-[hsl(var(--muted-foreground))]">URL changed:</span>
                      <span className="text-white/50 font-mono truncate text-[11px]">
                        {(() => { try { return new URL(issue.urlBefore).pathname; } catch { return issue.urlBefore; } })()}
                      </span>
                      <span className="text-[hsl(var(--muted-foreground))]">&rarr;</span>
                      <span className="text-white/70 font-mono truncate text-[11px]">
                        {(() => { try { return new URL(issue.urlAfter).pathname; } catch { return issue.urlAfter; } })()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {issue.screenshotAfter && (
                <div className="shrink-0 w-28 h-18 rounded-lg overflow-hidden border border-white/10 bg-black/40">
                  <img
                    src={`/api/artifacts/${issue.screenshotAfter.replace(/^.*?artifacts[\\/]/, "")}`}
                    alt="Error screenshot"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ data, runs, onRefresh }: { data: DashboardData | null; runs: MockRun[]; onRefresh?: () => void }) {
  const [refreshKey, setRefreshKey] = useState(0);

  function handleSiteRemoved() {
    setRefreshKey((k) => k + 1);
    onRefresh?.();
  }

  if (!data) return null;
  const { ministryCards, complianceScore, totalActiveIncidents, trend } = data;

  const totalScans = runs.length;
  const avgScore = ministryCards.length > 0
    ? Math.round(ministryCards.reduce((s, c) => s + (c.successRate ?? 0), 0) / ministryCards.length)
    : complianceScore;

  const siteScores = ministryCards.map((c) => ({
    name: c.name,
    url: c.baseUrl,
    score: c.successRate ?? 0,
    rag: c.rag,
  }));

  return (
    <div className="space-y-6">
      {/* ── 4 KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<Globe className="w-5 h-5 text-[hsl(var(--muted-foreground))]" />}
          label="Total Sites" value={data.totalSites} change={null} sub="Actively monitored" />
        <KpiCard icon={<BarChart2 className="w-5 h-5 text-[hsl(var(--muted-foreground))]" />}
          label="Total Scans" value={totalScans} change={null} sub="Last 30 days" />
        <KpiCard icon={<CheckCircle2 className="w-5 h-5 text-[hsl(var(--muted-foreground))]" />}
          label="Average Score" value={avgScore} change={trend} sub="Across all sites" />
        <KpiCard icon={<AlertTriangle className="w-5 h-5 text-[hsl(var(--muted-foreground))]" />}
          label="Open Incidents" value={totalActiveIncidents}
          change={totalActiveIncidents > 0 ? null : 0} sub="Needs attention" />
      </div>

      {/* ── Critical Issues ── */}
      <CriticalIssuesSection refreshKey={refreshKey} />

      {/* ── Site Cards ── */}
      <section>
        <h2 className="text-sm font-semibold text-white mb-4">Monitored Sites</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {ministryCards.map((card) => <SiteCard key={card.siteId} card={card} onRemove={handleSiteRemoved} />)}
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
        <IssueCategoriesCard categories={data?.issueCategories} />
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

// ─── KPI Dashboard Tab ───────────────────────────────────────────────────────

interface PlatformKPI {
  siteId: string;
  name: string;
  nameAr: string | null;
  baseUrl: string;
  ministryName: string | null;
  rag: string;
  availability24h: number | null;
  availability72h: number | null;
  availability7d: number | null;
  avgResponseMs: number | null;
  peakResponseMs: number | null;
  siteMttrMs: number | null;
  siteMttdMs: number | null;
  totalOutageMs: number | null;
  longestOutageMs: number | null;
  activeIncidents: number;
  totalIncidents30d: number;
  resolvedIncidents30d: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  totalRuns24h: number;
  totalRuns7d: number;
  completedRuns24h: number;
  completedRuns7d: number;
}

interface KPISummary {
  totalSites: number;
  healthyCount: number;
  degradedCount: number;
  downCount: number;
  unknownCount: number;
  overallAvailability: number | null;
  totalActiveIncidents: number;
  globalMttrMs: number | null;
  avgScanIntervalMin: number;
  totalPlatformOutageMs: number | null;
  totalResolvedIncidents30d: number;
}

function fmtMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

function fmtDuration(ms: number | null): string {
  if (ms === null || ms === 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

function AvailabilityGauge({ pct, size = 80, label }: { pct: number | null; size?: number; label?: string }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const val = pct ?? 0;
  const dash = (val / 100) * circ;
  const color = val >= 95 ? "#22c55e" : val >= 80 ? "#eab308" : val >= 50 ? "#f97316" : "#ef4444";
  const textCls = val >= 95 ? "text-green-400" : val >= 80 ? "text-yellow-400" : val >= 50 ? "text-orange-400" : "text-red-400";
  const fontSize = size >= 100 ? "text-2xl" : size >= 70 ? "text-lg" : "text-sm";

  return (
    <div className="relative flex flex-col items-center" style={{ width: size }}>
      <div style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" style={{ display: "block" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={5} />
          {val > 0 && (
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={5}
              strokeLinecap="round" strokeDasharray={`${dash} ${circ - dash}`}
              style={{ transition: "stroke-dasharray 0.8s ease" }} />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ width: size, height: size }}>
          <span className={`${fontSize} font-black leading-none ${textCls}`}>
            {pct !== null ? `${pct}%` : "—"}
          </span>
        </div>
      </div>
      {label && <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1.5 text-center">{label}</p>}
    </div>
  );
}

function EcgCardCanvas({ rag, offset = 0 }: { rag: string; offset?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 120, H = 36, mid = H / 2;
    const color =
      rag === "green" ? "#22c55e" :
      rag === "yellow" ? "#f59e0b" :
      rag === "red" ? "#ef4444" :
      "#6b7280";

    const isFlat = rag === "red" || rag === "unknown";
    const isIrregular = rag === "yellow";
    const speed = isIrregular ? 36 : 54;
    const cycleLen = isIrregular ? 88 : 64;
    const amp = H * 0.40;

    function getY(phase: number, cycleNum: number): number {
      if (isFlat) return mid;
      if (isIrregular) {
        const scale = cycleNum % 2 === 0 ? 1 : 0.65;
        if (phase >= 0.30 && phase < 0.41) {
          const t = (phase - 0.30) / 0.11;
          return mid - Math.sin(t * Math.PI) * amp * 0.88 * scale;
        }
        if (phase >= 0.41 && phase < 0.50) {
          const t = (phase - 0.41) / 0.09;
          return mid + Math.sin(t * Math.PI) * amp * 0.28 * scale;
        }
        if (phase >= 0.60 && phase < 0.74) {
          const t = (phase - 0.60) / 0.14;
          return mid - Math.sin(t * Math.PI) * amp * 0.18 * scale;
        }
        return mid;
      }
      // healthy: classic P-QRS-T
      if (phase >= 0.10 && phase < 0.20) {
        const t = (phase - 0.10) / 0.10;
        return mid - Math.sin(t * Math.PI) * H * 0.13;
      }
      if (phase >= 0.28 && phase < 0.33) {
        const t = (phase - 0.28) / 0.05;
        return mid + Math.sin(t * Math.PI) * H * 0.17;
      }
      if (phase >= 0.33 && phase < 0.43) {
        const t = (phase - 0.33) / 0.10;
        return mid - Math.sin(t * Math.PI) * amp;
      }
      if (phase >= 0.43 && phase < 0.50) {
        const t = (phase - 0.43) / 0.07;
        return mid + Math.sin(t * Math.PI) * H * 0.21;
      }
      if (phase >= 0.56 && phase < 0.73) {
        const t = (phase - 0.56) / 0.17;
        return mid - Math.sin(t * Math.PI) * H * 0.19;
      }
      return mid;
    }

    let startTs = 0;
    function draw(ts: number) {
      if (!startTs) startTs = ts;
      const elapsed = (ts - startTs) / 1000 + offset;
      ctx!.clearRect(0, 0, W, H);

      ctx!.strokeStyle = "rgba(255,255,255,0.05)";
      ctx!.lineWidth = 0.5;
      ctx!.beginPath(); ctx!.moveTo(0, mid); ctx!.lineTo(W, mid); ctx!.stroke();

      ctx!.shadowColor = color; ctx!.shadowBlur = isFlat ? 2 : 4;
      ctx!.strokeStyle = color; ctx!.lineWidth = 1.5;
      ctx!.lineJoin = "round"; ctx!.lineCap = "round";
      ctx!.beginPath();

      const pixOff = (elapsed * speed) % cycleLen;
      for (let x = 0; x <= W; x++) {
        const cx = (x + pixOff) % cycleLen;
        const phase = cx / cycleLen;
        const cycleNum = Math.floor((x + pixOff) / cycleLen);
        const y = getY(phase, cycleNum);
        x === 0 ? ctx!.moveTo(x, y) : ctx!.lineTo(x, y);
      }
      ctx!.stroke();
      ctx!.shadowBlur = 0;
      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [rag, offset]);

  return <canvas ref={canvasRef} width={120} height={36} style={{ display: "block" }} />;
}

function KPIDashboardTab() {
  const [summary, setSummary] = useState<KPISummary | null>(null);
  const [platforms, setPlatforms] = useState<PlatformKPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  function loadData() {
    fetch("/api/gov/kpi-dashboard")
      .then((r) => r.json())
      .then((d) => {
        setSummary(d.summary ?? null);
        setPlatforms(d.platforms ?? []);
        setLastRefresh(new Date());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadData();
    const iv = setInterval(loadData, 30000);
    return () => clearInterval(iv);
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-6 gap-3">{[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-28 bg-white/5 rounded-xl" />)}</div>
        <div className="h-96 bg-white/5 rounded-xl" />
      </div>
    );
  }

  if (!summary) return <p className="text-sm text-[hsl(var(--muted-foreground))]">Failed to load data</p>;

  const ragDot = (rag: string) =>
    rag === "green" ? "bg-green-500" : rag === "yellow" ? "bg-yellow-500" : rag === "red" ? "bg-red-500" : "bg-gray-500";
  const ragText = (rag: string) =>
    rag === "green" ? "text-green-400" : rag === "yellow" ? "text-yellow-400" : rag === "red" ? "text-red-400" : "text-gray-400";
  const ragLabel = (rag: string) =>
    rag === "green" ? "Healthy" : rag === "yellow" ? "Degraded" : rag === "red" ? "Down" : "Unknown";
  const ragBg = (rag: string) =>
    rag === "green" ? "bg-green-500/10 border-green-500/20" : rag === "yellow" ? "bg-yellow-500/10 border-yellow-500/20" : rag === "red" ? "bg-red-500/10 border-red-500/20" : "bg-gray-500/10 border-gray-500/20";

  const sortedByAvailability = [...platforms].sort((a, b) => (b.availability24h ?? -1) - (a.availability24h ?? -1));
  const sortedByResponse = [...platforms].sort((a, b) => (a.avgResponseMs ?? 999999) - (b.avgResponseMs ?? 999999));

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Performance KPI Dashboard — Monitoring Center</h1>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
            Real-time data — Last updated {lastRefresh ? lastRefresh.toLocaleTimeString("en-US") : "now"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-900/30 border border-green-700/30">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[11px] text-green-400 font-semibold">LIVE</span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 1: Platform & Digital Services Status                        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}

      <section className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[hsl(var(--border))]">
          <h2 className="text-sm font-bold text-white">1. Platform & Digital Services Status</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">Real-time status of all monitored platforms</p>
        </div>

        {/* Status summary chips */}
        <div className="px-5 py-3 flex items-center gap-3 border-b border-[hsl(var(--border))] bg-white/[0.01]">
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-white font-semibold">{summary.healthyCount}</span>
              <span className="text-[hsl(var(--muted-foreground))]">Healthy</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-yellow-500" />
              <span className="text-white font-semibold">{summary.degradedCount}</span>
              <span className="text-[hsl(var(--muted-foreground))]">Degraded</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-white font-semibold">{summary.downCount}</span>
              <span className="text-[hsl(var(--muted-foreground))]">Down</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-gray-500" />
              <span className="text-white font-semibold">{summary.unknownCount}</span>
              <span className="text-[hsl(var(--muted-foreground))]">Unknown</span>
            </span>
          </div>
          <div className="ml-auto text-[10px] text-[hsl(var(--muted-foreground))]">
            Total: {summary.totalSites} platforms
          </div>
        </div>

        {/* Platform status cards grid */}
        <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {platforms.map((p, idx) => (
            <div key={p.siteId} className={`rounded-xl border p-3 ${ragBg(p.rag)} transition-all`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-2.5 h-2.5 rounded-full ${ragDot(p.rag)} ${p.rag !== "green" && p.rag !== "unknown" ? "animate-pulse" : ""}`} />
                <span className={`text-[11px] font-bold ${ragText(p.rag)}`}>{ragLabel(p.rag)}</span>
              </div>
              <p className="text-sm font-bold text-white leading-tight">{p.name}</p>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] font-mono mt-0.5">{p.baseUrl.replace(/^https?:\/\//, "")}</p>
              {p.ministryName && <p className="text-[9px] text-[hsl(var(--muted-foreground))] mt-0.5">{p.ministryName}</p>}
              <div className="mt-2 mb-1 flex justify-center">
                <EcgCardCanvas rag={p.rag} offset={idx * 0.41} />
              </div>
              <div className="flex items-center justify-between mt-1 pt-2 border-t border-white/5">
                <span className="text-[9px] text-[hsl(var(--muted-foreground))]">Last scan</span>
                <span className="text-[10px] text-white/70">{timeAgo(p.lastRunAt)}</span>
              </div>
              {p.activeIncidents > 0 && (
                <div className="flex items-center gap-1 mt-1.5">
                  <AlertTriangle className="w-3 h-3 text-red-400" />
                  <span className="text-[10px] text-red-400 font-semibold">{p.activeIncidents} open incidents</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 2: Availability Rates                                        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}

      <section className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[hsl(var(--border))]">
          <h2 className="text-sm font-bold text-white">2. Availability Rate per Platform</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">Percentage of time each platform is operational and accessible</p>
        </div>

        {/* Overall availability gauge */}
        <div className="px-5 py-5 flex items-center gap-8 border-b border-[hsl(var(--border))] bg-white/[0.01]">
          <AvailabilityGauge pct={summary.overallAvailability} size={100} />
          <div>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Overall Availability — Last 24 Hours</p>
            <p className="text-3xl font-black text-white mt-1">
              {summary.overallAvailability !== null ? `${summary.overallAvailability}%` : "—"}
            </p>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
              Average availability across all monitored platforms
            </p>
          </div>
        </div>

        {/* Per-platform availability with gauges */}
        <div className="p-5">
          <div className="grid grid-cols-5 gap-4 mb-6">
            {sortedByAvailability.slice(0, 10).map((p) => (
              <div key={p.siteId} className="flex flex-col items-center gap-1">
                <AvailabilityGauge pct={p.availability24h} size={64} />
                <p className="text-[10px] text-white/80 font-medium text-center mt-1">{p.name}</p>
                <p className="text-[9px] text-[hsl(var(--muted-foreground))]">24h</p>
              </div>
            ))}
          </div>

          {/* Availability comparison bars: 24h vs 72h vs 7d */}
          <div className="space-y-4 mt-4">
            <p className="text-xs text-[hsl(var(--muted-foreground))] font-medium">Availability Comparison: 24h | 72h | 7 days</p>
            {platforms.map((p) => {
              const bars = [
                { label: "24h", val: p.availability24h, color: "bg-emerald-500" },
                { label: "72h", val: p.availability72h, color: "bg-blue-500" },
                { label: "7d", val: p.availability7d, color: "bg-purple-500" },
              ];
              return (
                <div key={p.siteId} className="flex items-center gap-3">
                  <span className="text-xs text-white/80 w-24 truncate font-medium">{p.name}</span>
                  <div className="flex-1 space-y-1">
                    {bars.map((b) => (
                      <div key={b.label} className="flex items-center gap-2">
                        <span className="text-[9px] text-[hsl(var(--muted-foreground))] w-6">{b.label}</span>
                        <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${b.color} transition-all duration-700`} style={{ width: `${b.val ?? 0}%` }} />
                        </div>
                        <span className={`text-[10px] w-8 text-left font-bold tabular-nums ${
                          b.val === null ? "text-gray-500" : b.val >= 95 ? "text-green-400" : b.val >= 80 ? "text-yellow-400" : "text-red-400"
                        }`}>
                          {b.val !== null ? `${b.val}%` : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 3: Mean Time to Recovery & Outage Duration                   */}
      {/* ══════════════════════════════════════════════════════════════════════ */}

      <section className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[hsl(var(--border))]">
          <h2 className="text-sm font-bold text-white">3. Mean Time to Recovery & Outage Duration</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">Fault detection and service recovery metrics — Last 30 days</p>
        </div>

        {/* Global MTTR/MTTD summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-5 border-b border-[hsl(var(--border))]">
          <div className="bg-white/[0.03] rounded-xl p-4 text-center">
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider font-medium mb-2">Mean Time to Recovery</p>
            <p className="text-xl font-black text-white">{fmtMs(summary.globalMttrMs)}</p>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">MTTR</p>
          </div>
          <div className="bg-white/[0.03] rounded-xl p-4 text-center">
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider font-medium mb-2">Scan Interval (Detection)</p>
            <p className="text-xl font-black text-white">{summary.avgScanIntervalMin} min</p>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">MTTD</p>
          </div>
          <div className="bg-white/[0.03] rounded-xl p-4 text-center">
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider font-medium mb-2">Total Outage Duration</p>
            <p className="text-xl font-black text-white">{fmtDuration(summary.totalPlatformOutageMs)}</p>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">All platforms — 30 days</p>
          </div>
          <div className="bg-white/[0.03] rounded-xl p-4 text-center">
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider font-medium mb-2">Resolved Incidents</p>
            <p className="text-xl font-black text-green-400">{summary.totalResolvedIncidents30d}</p>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">Last 30 days</p>
          </div>
        </div>

        {/* Per-platform MTTR / outage table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--border))]">
                {["Platform", "Recovery (MTTR)", "Detection (MTTD)", "Total Outage", "Longest Outage", "Incidents (30d)", "Resolved"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--border))]">
              {platforms.map((p) => (
                <tr key={p.siteId} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${ragDot(p.rag)}`} />
                      <span className="text-sm font-semibold text-white">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold tabular-nums ${
                      p.siteMttrMs === null ? "text-gray-500" :
                      p.siteMttrMs < 3600000 ? "text-green-400" :
                      p.siteMttrMs < 86400000 ? "text-yellow-400" : "text-red-400"
                    }`}>
                      {fmtDuration(p.siteMttrMs)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono text-white/70">{fmtMs(p.siteMttdMs)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold ${p.totalOutageMs ? "text-red-400" : "text-green-400"}`}>
                      {fmtDuration(p.totalOutageMs)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-white/70">{fmtDuration(p.longestOutageMs)}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-sm font-bold ${p.totalIncidents30d > 0 ? "text-orange-400" : "text-green-400"}`}>
                      {p.totalIncidents30d}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm font-bold text-green-400">{p.resolvedIncidents30d}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 4: Performance & Resource KPIs                               */}
      {/* ══════════════════════════════════════════════════════════════════════ */}

      <section className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[hsl(var(--border))]">
          <h2 className="text-sm font-bold text-white">4. Performance & Resource Metrics</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">Average and peak response times and scan volume per platform</p>
        </div>

        {/* Global perf summary */}
        <div className="grid grid-cols-3 gap-4 p-5 border-b border-[hsl(var(--border))]">
          {(() => {
            const allAvg = platforms.filter((p) => p.avgResponseMs !== null).map((p) => p.avgResponseMs!);
            const globalAvg = allAvg.length > 0 ? Math.round(allAvg.reduce((a, b) => a + b, 0) / allAvg.length) : null;
            const allPeak = platforms.filter((p) => p.peakResponseMs !== null).map((p) => p.peakResponseMs!);
            const globalPeak = allPeak.length > 0 ? Math.max(...allPeak) : null;
            const totalScans = platforms.reduce((s, p) => s + p.totalRuns24h, 0);
            return (
              <>
                <div className="bg-white/[0.03] rounded-xl p-4 text-center">
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider font-medium mb-2">Avg Response Time</p>
                  <p className={`text-2xl font-black ${
                    globalAvg === null ? "text-gray-500" : globalAvg < 3000 ? "text-green-400" : globalAvg < 8000 ? "text-yellow-400" : "text-red-400"
                  }`}>{fmtMs(globalAvg)}</p>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">All platforms — 24h</p>
                </div>
                <div className="bg-white/[0.03] rounded-xl p-4 text-center">
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider font-medium mb-2">Peak Response Time</p>
                  <p className={`text-2xl font-black ${
                    globalPeak === null ? "text-gray-500" : globalPeak < 5000 ? "text-green-400" : globalPeak < 15000 ? "text-yellow-400" : "text-red-400"
                  }`}>{fmtMs(globalPeak)}</p>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">Highest recorded — 24h</p>
                </div>
                <div className="bg-white/[0.03] rounded-xl p-4 text-center">
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider font-medium mb-2">Total Scans</p>
                  <p className="text-2xl font-black text-white">{totalScans}</p>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">Last 24 hours</p>
                </div>
              </>
            );
          })()}
        </div>

        {/* Response time visual bars */}
        <div className="p-5 space-y-4">
          <p className="text-xs text-[hsl(var(--muted-foreground))] font-medium mb-3">Response Time per Platform (Avg | Peak)</p>

          {sortedByResponse.map((p) => {
            const avgMs = p.avgResponseMs ?? 0;
            const peakMs = p.peakResponseMs ?? 0;
            const maxScale = 30000;
            const avgPct = Math.min((avgMs / maxScale) * 100, 100);
            const peakPct = Math.min((peakMs / maxScale) * 100, 100);
            const avgColor = avgMs < 3000 ? "bg-green-500" : avgMs < 8000 ? "bg-yellow-500" : "bg-red-500";
            const peakColor = avgMs < 3000 ? "bg-green-500/30" : avgMs < 8000 ? "bg-yellow-500/30" : "bg-red-500/30";
            return (
              <div key={p.siteId} className="flex items-center gap-3">
                <span className="text-xs text-white/80 w-24 truncate font-medium">{p.name}</span>
                <div className="flex-1 relative">
                  <div className="h-3 bg-white/5 rounded-full overflow-hidden relative">
                    <div className={`absolute inset-y-0 left-0 rounded-full ${peakColor} transition-all duration-500`} style={{ width: `${peakPct}%` }} />
                    <div className={`absolute inset-y-0 left-0 rounded-full ${avgColor} transition-all duration-700`} style={{ width: `${avgPct}%` }} />
                  </div>
                </div>
                <div className="flex items-center gap-2 w-32">
                  <span className={`text-[10px] font-bold tabular-nums ${
                    p.avgResponseMs === null ? "text-gray-500" : avgMs < 3000 ? "text-green-400" : avgMs < 8000 ? "text-yellow-400" : "text-red-400"
                  }`}>
                    {fmtMs(p.avgResponseMs)}
                  </span>
                  <span className="text-[9px] text-[hsl(var(--muted-foreground))]">/</span>
                  <span className="text-[10px] text-white/50 tabular-nums">{fmtMs(p.peakResponseMs)}</span>
                </div>
              </div>
            );
          })}

          {/* Legend */}
          <div className="flex items-center gap-4 pt-2 border-t border-white/5 text-[10px] text-[hsl(var(--muted-foreground))]">
            <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-green-500" /> Avg Response</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-green-500/30" /> Peak Response</span>
          </div>
        </div>

        {/* Scan volume per platform */}
        <div className="px-5 pb-5">
          <p className="text-xs text-[hsl(var(--muted-foreground))] font-medium mb-3">Scan Volume per Platform</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {platforms.map((p) => (
              <div key={p.siteId} className="bg-white/[0.03] rounded-lg p-3 text-center">
                <p className="text-[10px] text-[hsl(var(--muted-foreground))] truncate mb-1">{p.name}</p>
                <div className="flex items-baseline justify-center gap-1">
                  <p className="text-lg font-bold text-white tabular-nums">{p.totalRuns24h}</p>
                  <p className="text-[9px] text-[hsl(var(--muted-foreground))]">/ 24h</p>
                </div>
                <p className="text-[9px] text-[hsl(var(--muted-foreground))] mt-0.5">{p.totalRuns7d} scans / 7d</p>
                <div className="h-1 bg-white/5 rounded-full mt-2 overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500/60 transition-all" style={{ width: `${p.completedRuns24h > 0 ? 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}

// ─── Issue Categories Card ────────────────────────────────────────────────────

function IssueCategoriesCard({ categories }: { categories?: IssueCategory[] }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"pct" | "count">("pct");
  const [expanded, setExpanded] = useState(false);

  const cats = categories?.length
    ? [...categories].sort((a, b) => sortBy === "pct" ? b.pct - a.pct : b.count - a.count)
    : [
        { label: "UX", count: 0, pct: 0 },
        { label: "QA", count: 0, pct: 0 },
        { label: "Accessibility", count: 0, pct: 0 },
        { label: "Performance", count: 0, pct: 0 },
      ];

  const shortLabel: Record<string, string> = { Accessibility: "Access.", Performance: "Perf." };
  const barColors: Record<string, string> = {
    UX: "bg-purple-400",
    QA: "bg-cyan-400",
    Accessibility: "bg-blue-400",
    Performance: "bg-orange-400",
  };
  const textColors: Record<string, string> = {
    UX: "text-purple-400",
    QA: "text-cyan-400",
    Accessibility: "text-blue-400",
    Performance: "text-orange-400",
  };
  const descriptions: Record<string, string> = {
    UX: "Navigation, buttons, links, tabs, and menus that are broken or unresponsive",
    QA: "Form inputs, search, data display, and general functional issues",
    Accessibility: "Missing labels, poor contrast, focus issues, and ARIA violations",
    Performance: "Slow responses (>3s), timeouts, and network errors",
  };
  const totalIssues = cats.reduce((s, c) => s + c.count, 0);
  const maxPct = Math.max(...cats.map((c) => c.pct), 1);

  const fmtPct = (pct: number, count: number) => {
    if (count === 0) return "0%";
    if (pct < 1) return "<1%";
    return `${pct}%`;
  };

  return (
    <section className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5 space-y-4 relative">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Issue Categories</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
            Distribution across all sites (latest scan)
          </p>
        </div>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <MoreHorizontal className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-50 w-48 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg shadow-xl py-1">
                <button
                  onClick={() => { setSortBy("pct"); setMenuOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-white/5 transition-colors ${sortBy === "pct" ? "text-emerald-400" : "text-white/70"}`}
                >
                  Sort by percentage
                </button>
                <button
                  onClick={() => { setSortBy("count"); setMenuOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-white/5 transition-colors ${sortBy === "count" ? "text-emerald-400" : "text-white/70"}`}
                >
                  Sort by count
                </button>
                <div className="border-t border-[hsl(var(--border))] my-1" />
                <button
                  onClick={() => { setExpanded(!expanded); setMenuOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-white/70 hover:bg-white/5 transition-colors"
                >
                  {expanded ? "Collapse details" : "Show details"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-3 h-28">
        {cats.map(({ label, pct, count }) => (
          <div key={label} className="flex-1 flex flex-col items-center gap-1.5">
            <span className={`text-[11px] font-semibold ${textColors[label] || "text-white/70"}`}>
              {fmtPct(pct, count)}
            </span>
            <div
              className={`w-full rounded-t-md ${barColors[label] || "bg-white"} transition-all duration-700`}
              style={{
                height: `${count > 0 ? Math.max((pct / maxPct) * 80, 8) : 4}px`,
                opacity: count > 0 ? 1 : 0.15,
              }}
            />
            <span className="text-[10px] text-[hsl(var(--muted-foreground))] font-medium">
              {shortLabel[label] || label}
            </span>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider font-medium">
          Total Issues
        </span>
        <span className="text-sm font-bold text-white">{totalIssues}</span>
      </div>

      {/* List */}
      <div className="space-y-3">
        {cats.map(({ label, pct, count }) => (
          <div key={label}>
            <div className="flex items-center gap-3">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${barColors[label] || "bg-white"}`} />
              <span className="text-xs text-white/80 w-24 font-medium">{label}</span>
              <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${barColors[label] || "bg-white/60"}`}
                  style={{ width: `${count > 0 ? Math.max(pct, 2) : 0}%` }}
                />
              </div>
              <span className={`text-xs w-8 text-right font-semibold ${textColors[label] || "text-white/70"}`}>
                {fmtPct(pct, count)}
              </span>
              <span className="text-[11px] text-[hsl(var(--muted-foreground))] w-8 text-right tabular-nums">
                {count}
              </span>
            </div>
            {/* Expanded description */}
            {expanded && (
              <p className="text-[11px] text-[hsl(var(--muted-foreground))] ml-[22px] mt-1">
                {descriptions[label] || ""}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "kpi", label: "KPI Dashboard" },
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

  function refreshData() {
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
          issueCategories: dash.issueCategories ?? [],
        });
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
  }

  useEffect(() => { refreshData(); }, []);

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
          {tab === "overview" && <OverviewTab data={data} runs={runs} onRefresh={refreshData} />}
          {tab === "kpi" && <KPIDashboardTab />}
          {tab === "alerts" && <AlertsTab />}
          {tab === "directives" && <DirectivesTab />}
        </>
      )}

      {showBriefModal && <BriefModal onClose={() => setShowBriefModal(false)} />}
    </div>
  );
}
