"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatedCursor } from "@/components/live/AnimatedCursor";
import {
  Globe,
  Camera,
  Zap,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Monitor,
  Clock,
  Navigation,
  Search,
} from "lucide-react";

interface StepStatus {
  index: number;
  action: string;
  description: string;
  status: "pending" | "running" | "passed" | "failed" | "skipped";
  durationMs?: number;
  error?: string;
}

interface ActivityEntry {
  message: string;
  timestamp: string;
  type: "info" | "warn" | "success" | "error";
  icon: string;
}

function getStepIcon(action: string): string {
  const map: Record<string, string> = {
    navigate: "→",
    screenshot: "📷",
    click: "→",
    type: "✎",
    assert_element: "✓",
    assert_title: "✓",
    detect_search: "🔍",
    detect_forms: "☷",
  };
  return map[action] || "→";
}

function stepToActivity(step: StepStatus): ActivityEntry {
  const iconMap: Record<string, string> = {
    navigate: "→",
    screenshot: "cam",
    click: "→",
    type: "✎",
    assert_element: "✓",
    assert_title: "✓",
    detect_search: "search",
    detect_forms: "warn",
  };
  const typeMap: Record<string, "info" | "warn" | "success" | "error"> = {
    passed: "info",
    failed: "error",
    running: "info",
    pending: "info",
    skipped: "warn",
  };
  return {
    message: step.description || step.action,
    timestamp: step.durationMs
      ? new Date(Date.now() - step.durationMs).toLocaleTimeString()
      : new Date().toLocaleTimeString(),
    type: typeMap[step.status] ?? "info",
    icon: iconMap[step.action] ?? "→",
  };
}

const PHASES = [
  { key: "crawling", label: "Crawling", icon: Globe },
  { key: "ux", label: "UX Analysis", icon: Zap },
  { key: "qa", label: "QA Check", icon: ShieldCheck },
  { key: "ai", label: "AI Insights", icon: Sparkles },
];

export default function LiveViewPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.runId as string;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgBufferRef = useRef<HTMLImageElement | null>(null);
  const [hasFrame, setHasFrame] = useState(false);
  const [latestFrame, setLatestFrame] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepStatus[]>([]);
  const [runStatus, setRunStatus] = useState<string>("connecting");
  const [elapsed, setElapsed] = useState(0);
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const [cursorState, setCursorState] = useState({ x: 0, y: 0, clicking: false, text: "", type: "" });

  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const timerStartRef = useRef<number | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef<boolean>(false);
  const cleanupRef = useRef<boolean>(false);
  const runStatusRef = useRef<string>("connecting");
  const retryCountRef = useRef<number>(0);

  const startTimer = () => {
    if (timerStartRef.current !== null) return;
    timerStartRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - timerStartRef.current!) / 1000));
    }, 1000);
  };

  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      cleanupRef.current = false;
      return () => { cleanupRef.current = true; };
    }
    cleanupRef.current = false;
    // Derive WS URL from the current browser host so it works in Docker
    // (localhost:3000 → ws://localhost:3000) and on Render (same origin).
    // NEXT_PUBLIC_WS_URL can override at build time for special setups.
    const wsUrl =
      process.env.NEXT_PUBLIC_WS_URL ||
      (typeof window !== "undefined"
        ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`
        : "ws://localhost:3003");
    const ws = new WebSocket(`${wsUrl}/live/${runId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setRunStatus("connecting");
      if (!startedRef.current) {
        startedRef.current = true;
        fetch(`/api/runs/${runId}/start`, { method: "POST" })
          .then(async (res) => {
            const data = await res.json();
            if (!res.ok && data.redirect) router.push(data.redirect);
          })
          .catch(console.error);
      }
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case "browser-frame":
          startTimer();
          setLatestFrame(data.image);
          if (!imgBufferRef.current) imgBufferRef.current = new Image();
          imgBufferRef.current.onload = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            ctx.drawImage(imgBufferRef.current!, 0, 0, canvas.width, canvas.height);
            if (canvas.dataset.hasFrame !== "true") {
              canvas.dataset.hasFrame = "true";
              setHasFrame(true);
            }
          };
          imgBufferRef.current.src = data.image;
          break;
        case "cursor_move":
          if (frameRef.current) {
            const rect = frameRef.current.getBoundingClientRect();
            setCursorState({
              x: data.data.x * (rect.width / 1280),
              y: data.data.y * (rect.height / 720),
              clicking: false,
              text: data.data.elementText,
              type: data.data.elementType,
            });
          }
          break;
        case "cursor_click":
          setCursorState((prev) => ({ ...prev, clicking: true }));
          setTimeout(() => setCursorState((prev) => ({ ...prev, clicking: false })), 300);
          break;
        case "step-update":
          setSteps((prev) => {
            const updated = [...prev];
            while (updated.length <= data.step.index) {
              updated.push({ index: updated.length, action: "", description: "", status: "pending" });
            }
            updated[data.step.index] = data.step;
            if (data.step.url) setCurrentUrl(data.step.url);
            return updated;
          });
          break;
        case "run-status":
          startTimer();
          runStatusRef.current = data.status || "running";
          setRunStatus(data.status || "running");
          break;
        case "run-complete":
          runStatusRef.current = data.status || "completed";
          setRunStatus(data.status || "completed");
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
          setTimeout(() => router.push(`/report/${runId}`), 2000);
          break;
      }
    };

    ws.onerror = () => console.error("WebSocket error");
    ws.onclose = (event) => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      const terminal = ["passed", "failed", "completed", "error"];
      if (!cleanupRef.current && !terminal.includes(runStatusRef.current) && retryCountRef.current < 5) {
        retryCountRef.current += 1;
        setRunStatus("connecting");
        setTimeout(() => { if (!cleanupRef.current) window.location.reload(); }, retryCountRef.current * 1000);
      }
    };

    return () => {
      if (!cleanupRef.current) { cleanupRef.current = true; return; }
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  }, [runId, router]);

  const completedSteps = steps.filter((s) => ["passed", "failed", "skipped"].includes(s.status)).length;
  const totalSteps = steps.length || 1;
  const progressPercent = Math.min(Math.round((completedSteps / totalSteps) * 100), 100);
  const isComplete = ["passed", "failed", "completed", "error"].includes(runStatus);

  // Determine active phase based on progress
  const phaseIndex = Math.min(Math.floor(progressPercent / 25), 3);

  // Activity log from steps
  const activityItems = steps
    .filter((s) => s.status !== "pending")
    .map((s) => stepToActivity(s));

  const formatElapsed = () => {
    const mins = Math.floor(elapsed / 60);
    const secs = (elapsed % 60).toString().padStart(2, "0");
    return mins > 0 ? `${mins}:${secs}` : `0:${secs}`;
  };

  return (
    <div className="flex flex-col min-h-full p-5 gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">
            {isComplete ? "Scan Complete" : "Scanning..."}
          </h1>
          {currentUrl && (
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5 truncate max-w-sm">
              {currentUrl}
            </p>
          )}
        </div>
        <div className="text-2xl font-bold text-white tabular-nums">
          {progressPercent}%
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="h-1.5 bg-[hsl(var(--border))] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              isComplete && runStatus !== "failed" ? "bg-emerald-500" :
              runStatus === "failed" ? "bg-red-500" : "bg-emerald-500"
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        {isComplete && (
          <div className="flex items-center gap-1.5 mt-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span className="text-sm text-emerald-400 font-medium">Scan complete!</span>
          </div>
        )}
      </div>

      {/* Phase pills */}
      <div className="flex items-center gap-2">
        {PHASES.map((phase, i) => {
          const done = i < phaseIndex || isComplete;
          const active = i === phaseIndex && !isComplete;
          return (
            <div
              key={phase.key}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                active
                  ? "bg-emerald-900/50 border-emerald-700 text-emerald-400"
                  : done
                  ? "bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]"
                  : "bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] opacity-40"
              }`}
            >
              <phase.icon className="w-3 h-3" />
              {phase.label}
              {done && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
            </div>
          );
        })}
      </div>

      {/* Main content: Agent Activity + Latest Screenshot */}
      <div className="flex gap-4 flex-1 min-h-0" style={{ minHeight: "520px" }}>

        {/* Left: Agent Activity */}
        <div className="w-72 shrink-0 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[hsl(var(--border))]">
            <Clock className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
            <span className="text-sm font-medium text-white">Agent Activity</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {activityItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[hsl(var(--muted-foreground))]">
                <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin mb-2" />
                <p className="text-xs">Initializing agent...</p>
              </div>
            ) : (
              <ul className="space-y-0.5">
                {activityItems.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    <span className={`mt-0.5 shrink-0 ${
                      item.type === "error" ? "text-red-400" :
                      item.type === "warn" ? "text-yellow-400" :
                      item.type === "success" ? "text-emerald-400" :
                      "text-blue-400"
                    }`}>
                      {item.type === "error" ? (
                        <AlertTriangle className="w-3.5 h-3.5" />
                      ) : item.type === "success" ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Circle className="w-3.5 h-3.5 fill-current" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">{item.message}</p>
                    </div>
                    <span className="text-xs text-[hsl(var(--muted-foreground))] shrink-0 tabular-nums">
                      {item.timestamp}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: Latest Screenshot — flex-1 so it fills remaining space */}
        <div className="flex-1 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[hsl(var(--border))]">
            <Monitor className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
            <span className="text-sm font-medium text-white">Latest Screenshot</span>
          </div>

          {/* Browser canvas — always mounted so canvasRef is valid on first frame */}
          <div ref={frameRef} className="flex-1 relative bg-[hsl(var(--background))] overflow-hidden" style={{ minHeight: 200 }}>
            {/* Placeholder shown until first frame arrives */}
            {!hasFrame && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[hsl(var(--muted-foreground))] z-10">
                <Monitor className="w-10 h-10 opacity-30" />
                <p className="text-xs">Live screenshot preview</p>
              </div>
            )}

            {/* Canvas always in DOM so ref is always available */}
            <canvas
              ref={canvasRef}
              width={1280}
              height={720}
              className="w-full h-full object-cover"
              style={{ display: hasFrame ? "block" : "none" }}
            />

            {/* Overlays on top of canvas */}
            {hasFrame && cursorState.text && runStatus === "running" && (
              <AnimatedCursor
                targetX={cursorState.x}
                targetY={cursorState.y}
                isClicking={cursorState.clicking}
                elementText={cursorState.text}
                elementType={cursorState.type}
              />
            )}
            {hasFrame && runStatus === "running" && (
              <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm rounded-full px-2 py-1 z-10">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full live-dot" />
                <span className="text-[10px] text-white font-medium">LIVE</span>
              </div>
            )}
          </div>

          {/* URL below screenshot */}
          {currentUrl && (
            <div className="px-3 py-2 border-t border-[hsl(var(--border))]">
              <p className="text-xs font-medium text-white truncate">
                {new URL(currentUrl).pathname || "Homepage"}
              </p>
              <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">{currentUrl}</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm text-[hsl(var(--muted-foreground))]">
          <Clock className="w-4 h-4" />
          Estimated time remaining: ~{Math.max(0, 2 - Math.floor(elapsed / 30))} min
        </div>
        {isComplete && (
          <button
            onClick={() => router.push(`/report/${runId}`)}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white transition-colors"
          >
            View Results
          </button>
        )}
      </div>
    </div>
  );
}
