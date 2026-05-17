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
    passed: "success",
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
  const [polledScreenshot, setPolledScreenshot] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepStatus[]>([]);
  const [runStatus, setRunStatus] = useState<string>("connecting");
  const [elapsed, setElapsed] = useState(0);
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const [cursorState, setCursorState] = useState({ x: 0, y: 0, clicking: false, text: "", type: "" });
  const [expectedTotal, setExpectedTotal] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const timerStartRef = useRef<number | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const activityEndRef = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef<boolean>(false);
  const cleanupRef = useRef<boolean>(false);
  const runStatusRef = useRef<string>("connecting");
  const retryCountRef = useRef<number>(0);
  const lastScreenshotPathRef = useRef<string | null>(null);

  const startTimer = () => {
    if (timerStartRef.current !== null) return;
    timerStartRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - timerStartRef.current!) / 1000));
    }, 1000);
  };

  // Auto-scroll activity list to bottom when new items appear
  useEffect(() => {
    activityEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [steps]);

  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      cleanupRef.current = false;
      return () => { cleanupRef.current = true; };
    }
    cleanupRef.current = false;

    // ── 1. Signal the worker to start the run (fire once) ──
    if (!startedRef.current) {
      startedRef.current = true;
      fetch(`/api/runs/${runId}/start`, { method: "POST" })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok && data.redirect) router.push(data.redirect);
        })
        .catch(console.error);
    }

    // ── 2. Poll DB for run status + element progress (always, independent of WS) ──
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/runs/${runId}/status`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.site?.baseUrl) setCurrentUrl((prev: string) => prev || data.site.baseUrl);

        if (data.status === "running" && runStatusRef.current !== "running") {
          startTimer();
          runStatusRef.current = "running";
          setRunStatus("running");
        }

        // Use totalSteps from run record as the progress denominator
        if (data.totalSteps && data.totalSteps > 0) {
          setExpectedTotal((prev) => prev !== data.totalSteps ? data.totalSteps : prev);
        }

        if (data.elements && data.elements.length > 0) {
          const nextSteps: StepStatus[] = data.elements.map((el: any, i: number) => ({
            index: i,
            action: el.action || el.elementType,
            description: el.elementText || `${el.elementType}: ${el.action}`,
            status: el.status === "passed" || el.status === "warning" ? "passed"
              : el.status === "failed" ? "failed"
              : el.status === "pending" ? "running" : el.status,
            durationMs: el.responseTimeMs,
            error: el.error,
          }));
          setSteps((prev) => {
            // Skip update when nothing changed (avoids unnecessary re-renders)
            if (prev.length === nextSteps.length && prev.every((s, i) =>
              s.status === nextSteps[i].status &&
              s.action === nextSteps[i].action &&
              s.durationMs === nextSteps[i].durationMs &&
              s.error === nextSteps[i].error
            )) {
              return prev;
            }
            return nextSteps;
          });
        }

        // Display latest viewport screenshot — only re-download when path changes
        if (data.latestScreenshot && data.latestScreenshot !== lastScreenshotPathRef.current) {
          lastScreenshotPathRef.current = data.latestScreenshot;
          setPolledScreenshot(data.latestScreenshot + "?t=" + Date.now());
        }
        // Update cursor position — account for object-contain letterbox offset
        if (data.cursorX != null && data.cursorY != null && frameRef.current) {
          const rect = frameRef.current.getBoundingClientRect();
          const lastEl = data.elements?.[data.elements.length - 1];
          const imgAspect = 1280 / 720;
          const boxAspect = rect.width / rect.height;
          let renderedW: number, renderedH: number, offsetX: number, offsetY: number;
          if (boxAspect > imgAspect) {
            renderedH = rect.height;
            renderedW = rect.height * imgAspect;
            offsetX = (rect.width - renderedW) / 2;
            offsetY = 0;
          } else {
            renderedW = rect.width;
            renderedH = rect.width / imgAspect;
            offsetX = 0;
            offsetY = (rect.height - renderedH) / 2;
          }
          setCursorState({
            x: offsetX + (data.cursorX / 1280) * renderedW,
            y: offsetY + (data.cursorY / 720) * renderedH,
            clicking: false,
            text: lastEl?.elementText || "",
            type: lastEl?.elementType || "",
          });
        }

        if (data.status && ["passed", "failed", "error"].includes(data.status)) {
          clearInterval(pollInterval);
          runStatusRef.current = data.status;
          setRunStatus(data.status);
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
          if (data.status === "error" && data.errorJson) {
            try {
              const err = JSON.parse(data.errorJson);
              setErrorMessage(err.message || data.errorJson);
            } catch {
              setErrorMessage(data.errorJson);
            }
          }
        }
      } catch {}
    }, 1500);

    // ── 3. Connect WebSocket for live frames (best-effort, not required) ──
    // Always derive WS URL from current page location (same host, same port)
    const wsProto = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${wsProto}://${window.location.host}`;
    console.log(`[WS] Connecting to ${wsUrl}/live/${runId}`);
    const ws = new WebSocket(`${wsUrl}/live/${runId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WS] Connected to live stream");
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
            const imgA = 1280 / 720;
            const boxA = rect.width / rect.height;
            let rW: number, rH: number, oX: number, oY: number;
            if (boxA > imgA) {
              rH = rect.height; rW = rect.height * imgA;
              oX = (rect.width - rW) / 2; oY = 0;
            } else {
              rW = rect.width; rH = rect.width / imgA;
              oX = 0; oY = (rect.height - rH) / 2;
            }
            setCursorState({
              x: oX + (data.data.x / 1280) * rW,
              y: oY + (data.data.y / 720) * rH,
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
          setSteps((prev) =>
            prev.map((s) =>
              s.status === "pending" || s.status === "running"
                ? { ...s, status: "skipped" as const }
                : s
            )
          );
          break;
      }
    };

    ws.onerror = () => console.error("[WS] WebSocket error (polling continues)");
    ws.onclose = () => {
      console.log("[WS] WebSocket closed (polling continues)");
    };

    return () => {
      clearInterval(pollInterval);
      if (!cleanupRef.current) { cleanupRef.current = true; return; }
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  }, [runId, router]);

  const completedSteps = steps.filter((s) => ["passed", "failed", "skipped"].includes(s.status)).length;
  // Use expectedTotal from the run record (set early by executor) so progress increments gradually
  const totalSteps = Math.max(expectedTotal, steps.length, 1);
  const isComplete = ["passed", "failed", "completed", "error"].includes(runStatus);
  const progressPercent = isComplete ? 100 : Math.min(Math.round((completedSteps / totalSteps) * 100), 99);

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
    <div className="flex flex-col h-full p-5 gap-4 overflow-hidden">
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
              runStatus === "error" ? "bg-red-500" : "bg-emerald-500"
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        {isComplete && runStatus !== "error" && (
          <div className="flex items-center gap-1.5 mt-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span className="text-sm text-emerald-400 font-medium">Scan complete!</span>
          </div>
        )}
        {runStatus === "error" && (
          <div className="flex items-start gap-2 mt-2 p-3 rounded-lg bg-red-950/50 border border-red-800">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <div>
              <span className="text-sm text-red-400 font-medium">Scan failed</span>
              {errorMessage && (
                <p className="text-xs text-red-300/80 mt-1">{errorMessage}</p>
              )}
            </div>
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
      <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">

        {/* Left: Agent Activity — fixed size, scrollable */}
        <div className="w-72 h-[710px] shrink-0 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[hsl(var(--border))] shrink-0">
            <Clock className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
            <span className="text-sm font-medium text-white">Agent Activity</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-2">
            {activityItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[hsl(var(--muted-foreground))]">
                <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin mb-2" />
                <p className="text-xs">
                  {runStatus === "running" ? "Agent launching browser..." : runStatus === "error" ? "Scan failed" : "Waiting for agent..."}
                </p>
                <p className="text-[10px] mt-1 opacity-50">Status: {runStatus}</p>
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
                <div ref={activityEndRef} />
              </ul>
            )}
          </div>
        </div>

        {/* Right: Latest Screenshot — flex-1, constrained to box */}
        <div className="flex-1 min-w-0 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[hsl(var(--border))] shrink-0">
            <Monitor className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
            <span className="text-sm font-medium text-white">Latest Screenshot</span>
          </div>

          {/* Browser view — fills the entire box */}
          <div ref={frameRef} className="flex-1 relative bg-black overflow-hidden min-h-0">
            {/* Placeholder */}
            {!polledScreenshot && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[hsl(var(--muted-foreground))]">
                <Monitor className="w-10 h-10 opacity-30" />
                <p className="text-xs">
                  {runStatus === "running" ? "Waiting for first screenshot..." : runStatus === "connecting" ? "Starting scan..." : "Live screenshot preview"}
                </p>
              </div>
            )}

            {/* Polled screenshot — contained inside the box, no cropping */}
            {polledScreenshot && (
              <img
                src={polledScreenshot}
                alt="Agent browser view"
                className="absolute inset-0 w-full h-full object-contain"
              />
            )}

            {/* Canvas for CDP WebSocket frames */}
            <canvas
              ref={canvasRef}
              width={1280}
              height={720}
              className="absolute inset-0 w-full h-full object-contain"
              style={{ display: hasFrame ? "block" : "none" }}
            />

            {/* Cursor overlay */}
            {polledScreenshot && (cursorState.x > 0 || cursorState.y > 0) && runStatus === "running" && (
              <AnimatedCursor
                targetX={cursorState.x}
                targetY={cursorState.y}
                isClicking={cursorState.clicking}
                elementText={cursorState.text}
                elementType={cursorState.type}
              />
            )}
            {/* LIVE badge */}
            {runStatus === "running" && (
              <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm rounded-full px-2 py-1 z-20">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full live-dot" />
                <span className="text-[10px] text-white font-medium">LIVE</span>
              </div>
            )}
          </div>

          {/* URL below screenshot */}
          {currentUrl && (
            <div className="px-3 py-2 border-t border-[hsl(var(--border))] shrink-0">
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
        {!isComplete ? (
          <div className="flex items-center gap-1.5 text-sm text-[hsl(var(--muted-foreground))]">
            <Clock className="w-4 h-4" />
            Estimated time remaining: ~{Math.max(0, 2 - Math.floor(elapsed / 30))} min
          </div>
        ) : runStatus === "error" ? (
          <div className="flex items-center gap-1.5 text-sm text-red-400">
            <AlertTriangle className="w-4 h-4" />
            Scan failed — {errorMessage || "unknown error"}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-sm text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            Scan finished — {completedSteps} of {totalSteps} elements tested
          </div>
        )}
        {isComplete && (
          <button
            onClick={() => router.push(`/report/${runId}`)}
            className="px-5 py-2.5 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-lg shadow-emerald-900/30"
          >
            View Report
          </button>
        )}
      </div>
    </div>
  );
}
