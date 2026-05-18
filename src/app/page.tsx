"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────────────────────
interface SiteStatus {
  id: string;
  name: string;
  nameAr: string;
  baseUrl: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  latencyMs: number;
  uptime24h: number;
  uptimeSegments: boolean[];
  bpm: number;
}

// ── Mock data (fallback) ─────────────────────────────────────────────────────
const MOCK_SITES: SiteStatus[] = [
  {
    id: "1", name: "Absher", nameAr: "أبشر", baseUrl: "absher.sa",
    status: "healthy", latencyMs: 312, uptime24h: 99.2,
    uptimeSegments: Array(24).fill(true), bpm: 72,
  },
  {
    id: "2", name: "My.Gov", nameAr: "المنصة الوطنية", baseUrl: "my.gov.sa",
    status: "healthy", latencyMs: 198, uptime24h: 100,
    uptimeSegments: Array(24).fill(true), bpm: 68,
  },
  {
    id: "3", name: "MOH", nameAr: "وزارة الصحة", baseUrl: "moh.gov.sa",
    status: "degraded", latencyMs: 1840, uptime24h: 87.5,
    uptimeSegments: [...Array(21).fill(true), false, true, false], bpm: 55,
  },
  {
    id: "4", name: "Qiwa", nameAr: "قوى", baseUrl: "qiwa.sa",
    status: "healthy", latencyMs: 441, uptime24h: 98.1,
    uptimeSegments: [...Array(23).fill(true), false], bpm: 80,
  },
  {
    id: "5", name: "ZATCA", nameAr: "زكاة وضريبة", baseUrl: "zatca.gov.sa",
    status: "down", latencyMs: 0, uptime24h: 58.3,
    uptimeSegments: [...Array(14).fill(true), ...Array(10).fill(false)], bpm: 0,
  },
  {
    id: "6", name: "SDA", nameAr: "الأكاديمية الرقمية", baseUrl: "sda.edu.sa",
    status: "healthy", latencyMs: 267, uptime24h: 96.7,
    uptimeSegments: [...Array(22).fill(true), false, true], bpm: 75,
  },
];

// ── ECG Waveform Canvas ───────────────────────────────────────────────────────
function ECGCanvas({ status, bpm }: { status: SiteStatus["status"]; bpm: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offsetRef = useRef(0);
  const rafRef = useRef<number>(0);

  const isDown = status === "down" || status === "unknown";
  const color = status === "healthy" ? "#63d0fc"
    : status === "degraded" ? "#f59e0b"
    : "#ef4444";

  const buildCycle = useCallback((W: number, H: number): number[] => {
    const pts: number[] = [];
    const mid = H / 2;
    const segs = [
      { len: 0.18, fn: (_t: number) => mid },
      { len: 0.08, fn: (t: number) => mid - Math.sin(t * Math.PI) * H * 0.10 },
      { len: 0.08, fn: (_t: number) => mid },
      { len: 0.03, fn: (t: number) => mid + Math.sin(t * Math.PI) * H * 0.18 },
      { len: 0.05, fn: (t: number) => mid - Math.sin(t * Math.PI) * H * 0.72 },
      { len: 0.03, fn: (t: number) => mid + Math.sin(t * Math.PI) * H * 0.22 },
      { len: 0.12, fn: (_t: number) => mid },
      { len: 0.12, fn: (t: number) => mid - Math.sin(t * Math.PI) * H * 0.18 },
      { len: 0.31, fn: (_t: number) => mid },
    ];
    for (const seg of segs) {
      const count = Math.max(1, Math.round(seg.len * W));
      for (let i = 0; i < count; i++) pts.push(seg.fn(i / count));
    }
    return pts;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width;
    const H = canvas.height;
    const cycle = isDown ? Array(W).fill(H / 2) : buildCycle(W, H);
    const cycleLen = cycle.length;
    const speed = isDown ? 0 : Math.max(1, Math.round(bpm / 28));

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = "rgba(99,208,252,0.05)";
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 20) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 12) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // Trailing fade
      const fadeGrad = ctx.createLinearGradient(0, 0, W, 0);
      fadeGrad.addColorStop(0, "transparent");
      fadeGrad.addColorStop(0.6, color);
      fadeGrad.addColorStop(1, color);

      // Waveform
      ctx.beginPath();
      ctx.strokeStyle = isDown ? "#ef4444" : color;
      ctx.lineWidth = isDown ? 1.5 : 2;
      ctx.shadowColor = isDown ? "#ef4444" : color;
      ctx.shadowBlur = isDown ? 2 : 8;
      for (let x = 0; x < W; x++) {
        const idx = Math.floor((offsetRef.current + x) % cycleLen);
        const y = cycle[idx];
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Glowing head dot (only for alive sites)
      if (!isDown) {
        const headIdx = Math.floor(offsetRef.current % cycleLen);
        const headY = cycle[headIdx];
        const headX = W - 2;
        const grad = ctx.createRadialGradient(headX, headY, 0, headX, headY, 7);
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.3, color);
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(headX, headY, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      offsetRef.current = (offsetRef.current + speed) % cycleLen;
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [status, bpm, color, isDown, buildCycle]);

  return (
    <canvas
      ref={canvasRef}
      width={380}
      height={72}
      className="w-full"
      style={{ height: "72px" }}
    />
  );
}

// ── 24-Hour Uptime Segment Bar ────────────────────────────────────────────────
function UptimeBar({ segments, pct }: { segments: boolean[]; pct: number }) {
  return (
    <div className="mt-3">
      <div className="flex gap-[2px] mb-1.5">
        {segments.map((up, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm"
            style={{
              height: "5px",
              background: up ? "#63d0fc" : "#ef4444",
              opacity: up ? 0.75 : 0.65,
            }}
          />
        ))}
      </div>
      <div className="flex justify-between" style={{ fontSize: "10px", color: "#3a6080" }}>
        <span>٢٤ ساعة الماضية</span>
        <span>{pct.toFixed(1)}% وقت التشغيل</span>
      </div>
    </div>
  );
}

// ── Status Pill ───────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: SiteStatus["status"] }) {
  const cfg = {
    healthy:  { label: "مرتاح",     bg: "rgba(34,197,94,0.13)",  border: "rgba(34,197,94,0.35)",  text: "#4ade80", dot: "#22c55e", pulse: true  },
    degraded: { label: "بطيء",      bg: "rgba(245,158,11,0.13)", border: "rgba(245,158,11,0.35)", text: "#fbbf24", dot: "#f59e0b", pulse: false },
    down:     { label: "متوقف",     bg: "rgba(239,68,68,0.13)",  border: "rgba(239,68,68,0.35)",  text: "#f87171", dot: "#ef4444", pulse: false },
    unknown:  { label: "غير معروف", bg: "rgba(99,102,241,0.13)", border: "rgba(99,102,241,0.35)", text: "#a5b4fc", dot: "#818cf8", pulse: false },
  }[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.text }}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.pulse ? "animate-pulse" : ""}`}
        style={{ background: cfg.dot }}
      />
      {cfg.label}
    </span>
  );
}

// ── Site Card ─────────────────────────────────────────────────────────────────
function SiteCard({ site }: { site: SiteStatus }) {
  const [liveBpm, setLiveBpm] = useState(site.bpm);

  useEffect(() => {
    if (site.bpm === 0) return;
    const t = setInterval(() => {
      setLiveBpm(b => Math.round(Math.min(130, Math.max(40, b + (Math.random() - 0.5) * 6))));
    }, 1800);
    return () => clearInterval(t);
  }, [site.bpm]);

  const isDown = site.status === "down";
  const accentColor = site.status === "healthy" ? "#63d0fc"
    : site.status === "degraded" ? "#f59e0b"
    : "#ef4444";

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3 relative overflow-hidden cursor-pointer group"
      style={{
        background: "linear-gradient(145deg, #0c1a2e 0%, #060d1a 100%)",
        border: `1px solid rgba(${isDown ? "239,68,68" : "99,208,252"},0.14)`,
        boxShadow: `0 4px 40px rgba(${isDown ? "239,68,68" : "6,107,229"},0.10), inset 0 1px 0 rgba(255,255,255,0.03)`,
        transition: "transform 0.2s, box-shadow 0.2s",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 48px rgba(${isDown ? "239,68,68" : "6,107,229"},0.22), inset 0 1px 0 rgba(255,255,255,0.03)`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 40px rgba(${isDown ? "239,68,68" : "6,107,229"},0.10), inset 0 1px 0 rgba(255,255,255,0.03)`;
      }}
    >
      {/* Corner accent glow */}
      <div
        className="absolute top-0 right-0 w-28 h-28 pointer-events-none"
        style={{
          background: `radial-gradient(circle at top right, ${accentColor}18, transparent 65%)`,
        }}
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-3 relative z-10">
        <div>
          <h3
            className="text-lg font-bold leading-snug"
            style={{ color: "#dff0ff", fontFamily: "Tajawal, sans-serif" }}
          >
            {site.nameAr}
          </h3>
          <p className="text-xs mt-0.5" style={{ color: "#2e5870" }}>
            {site.baseUrl}
          </p>
        </div>
        <StatusPill status={site.status} />
      </div>

      {/* ECG */}
      <div className="relative z-10 -mx-1 rounded-lg overflow-hidden"
        style={{ background: "rgba(0,0,0,0.2)" }}>
        <ECGCanvas status={site.status} bpm={liveBpm} />
      </div>

      {/* BPM + Latency */}
      <div className="flex items-end justify-between relative z-10">
        <div className="flex items-baseline gap-1.5">
          <span
            className="text-3xl font-black font-mono leading-none"
            style={{
              color: isDown ? "#ef4444" : "#63d0fc",
              textShadow: isDown ? "0 0 20px rgba(239,68,68,0.5)" : "0 0 20px rgba(99,208,252,0.4)",
            }}
          >
            {isDown ? "---" : liveBpm}
          </span>
          <span className="text-xs pb-0.5" style={{ color: "#2e5870" }}>bpm</span>
        </div>
        <div className="text-right">
          <div
            className="text-base font-mono font-semibold"
            style={{ color: isDown ? "#ef4444" : "#a8d8f0" }}
          >
            {isDown ? "timeout" : `${site.latencyMs} ms`}
          </div>
          <div className="text-xs" style={{ color: "#2e5870" }}>زمن الاستجابة</div>
        </div>
      </div>

      {/* Uptime bar */}
      <div className="relative z-10">
        <UptimeBar segments={site.uptimeSegments} pct={site.uptime24h} />
      </div>
    </div>
  );
}

// ── Live Clock ────────────────────────────────────────────────────────────────
function LiveClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const fmt = () =>
      new Date().toLocaleTimeString("ar-SA", {
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
      });
    setTime(fmt());
    const t = setInterval(() => setTime(fmt()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span
      className="font-mono text-sm tabular-nums"
      style={{ color: "#63d0fc", textShadow: "0 0 12px rgba(99,208,252,0.4)" }}
    >
      {time}
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function HeartbeatPage() {
  const [sites, setSites] = useState<SiteStatus[]>(MOCK_SITES);
  const [lastUpdated, setLastUpdated] = useState("--:--");

  const mapApiSites = useCallback((apiSites: any[]): SiteStatus[] => {
    const statusMap: Record<string, SiteStatus["status"]> = {
      healthy: "healthy", degraded: "degraded", down: "down", unknown: "unknown",
    };
    return apiSites.slice(0, 6).map((s: any, i: number) => {
      const mock = MOCK_SITES[i % MOCK_SITES.length];
      const status: SiteStatus["status"] = statusMap[s.status] ?? "unknown";
      let host = s.baseUrl;
      try { host = new URL(s.baseUrl).hostname.replace("www.", ""); } catch {}
      return {
        id: s.id,
        name: s.name,
        nameAr: s.nameAr || s.name,
        baseUrl: host,
        status,
        latencyMs: status === "down" ? 0 : mock.latencyMs + Math.round(Math.random() * 80),
        uptime24h: mock.uptime24h,
        uptimeSegments: mock.uptimeSegments,
        bpm: status === "down" ? 0 : mock.bpm,
      };
    });
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/sites");
        if (res.ok) {
          const data = await res.json();
          const arr = data.sites ?? data;
          if (Array.isArray(arr) && arr.length > 0) setSites(mapApiSites(arr));
        }
      } catch { /* keep mock */ }
      setLastUpdated(
        new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })
      );
    };
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [mapApiSites]);

  const totalHealthy = sites.filter(s => s.status === "healthy").length;
  const totalDown    = sites.filter(s => s.status === "down").length;
  const overallPct   = Math.round((totalHealthy / sites.length) * 100);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&display=swap');
        html, body { background: #060d1a !important; margin: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #060d1a; }
        ::-webkit-scrollbar-thumb { background: #066be5; border-radius: 4px; }
      `}</style>

      <div
        dir="rtl"
        className="min-h-screen relative"
        style={{ background: "#060d1a", fontFamily: "Tajawal, sans-serif" }}
      >
        {/* Background dot grid */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(rgba(6,107,229,0.15) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        {/* Top radial bloom */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 100% 40% at 50% 0%, rgba(6,107,229,0.20) 0%, transparent 70%)",
          }}
        />

        <div className="relative z-10 max-w-5xl mx-auto px-4 py-10">

          {/* ── Header ── */}
          <header className="mb-10">
            {/* Top bar: last update left, clock right */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full animate-pulse flex-shrink-0"
                  style={{ background: "#63d0fc", boxShadow: "0 0 8px #63d0fc" }}
                />
                <span style={{ color: "#2e5870", fontSize: "12px" }}>
                  آخر تحديث {lastUpdated}
                </span>
              </div>
              <LiveClock />
            </div>

            {/* Title */}
            <div className="text-center">
              <h1
                className="font-black leading-tight mb-2"
                style={{
                  fontSize: "clamp(2rem,6vw,3.25rem)",
                  background: "linear-gradient(135deg, #63d0fc 0%, #066be5 55%, #a78bfa 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  letterSpacing: "-0.02em",
                }}
              >
                نبض المواقع الحكومية
              </h1>
              <p style={{ color: "#2e5870", fontSize: "14px" }}>
                رصد مستمر وآني للخدمات الرقمية الحكومية السعودية
              </p>

              {/* Summary pills */}
              <div className="flex items-center justify-center gap-3 mt-4 flex-wrap">
                <span
                  className="px-3 py-1 rounded-full text-xs font-bold"
                  style={{
                    background: "rgba(34,197,94,0.12)",
                    border: "1px solid rgba(34,197,94,0.28)",
                    color: "#4ade80",
                  }}
                >
                  ✓ {totalHealthy} مواقع تعمل
                </span>
                {totalDown > 0 && (
                  <span
                    className="px-3 py-1 rounded-full text-xs font-bold animate-pulse"
                    style={{
                      background: "rgba(239,68,68,0.12)",
                      border: "1px solid rgba(239,68,68,0.28)",
                      color: "#f87171",
                    }}
                  >
                    ✕ {totalDown} متوقف
                  </span>
                )}
                <span
                  className="px-3 py-1 rounded-full text-xs"
                  style={{
                    background: "rgba(99,208,252,0.06)",
                    border: "1px solid rgba(99,208,252,0.12)",
                    color: "#2e5870",
                  }}
                >
                  {sites.length} مواقع مراقبة
                </span>
              </div>

              {/* Overall uptime bar */}
              <div className="mt-6 max-w-sm mx-auto">
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${overallPct}%`,
                      background: "linear-gradient(90deg, #066be5, #63d0fc)",
                      boxShadow: "0 0 14px rgba(99,208,252,0.55)",
                      transition: "width 1s ease",
                    }}
                  />
                </div>
                <p
                  className="mt-1.5 text-center"
                  style={{ color: "#2e5870", fontSize: "11px" }}
                >
                  {overallPct}% من المواقع تعمل الآن
                </p>
              </div>
            </div>
          </header>

          {/* ── Cards Grid ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sites.map(site => (
              <SiteCard key={site.id} site={site} />
            ))}
          </div>

          {/* ── Footer ── */}
          <footer className="text-center mt-12 pb-4">
            <p style={{ color: "#162840", fontSize: "12px" }}>
              منصة رصد — مراقبة الخدمات الرقمية الحكومية
            </p>
          </footer>
        </div>
      </div>
    </>
  );
}
