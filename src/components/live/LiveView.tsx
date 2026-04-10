"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface StepStatus {
  index: number;
  action: string;
  description: string;
  status: "pending" | "running" | "passed" | "failed" | "skipped";
  durationMs?: number;
  error?: string;
}

interface LiveViewProps {
  runId: string;
  onComplete?: (summary: any) => void;
}

export function LiveView({ runId, onComplete }: LiveViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [steps, setSteps] = useState<StepStatus[]>([]);
  const [runStatus, setRunStatus] = useState<string>("connecting");
  const [elapsed, setElapsed] = useState(0);
  const [hasFrame, setHasFrame] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const pendingFrameRef = useRef<string | null>(null);
  const stepsEndRef = useRef<HTMLDivElement | null>(null);

  // Smooth canvas rendering — decodes JPEG off the main thread pressure
  const drawFrame = useCallback((src: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      // Resize canvas to match frame once
      if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
      }
      ctx.drawImage(img, 0, 0);
      setHasFrame(true);
    };
    img.src = src;
  }, []);

  // Throttle rendering to rAF — prevents dropped frames from causing jitter
  const scheduleFrame = useCallback((src: string) => {
    pendingFrameRef.current = src;
    if (animFrameRef.current !== null) return; // already scheduled
    animFrameRef.current = requestAnimationFrame(() => {
      animFrameRef.current = null;
      if (pendingFrameRef.current) {
        drawFrame(pendingFrameRef.current);
        pendingFrameRef.current = null;
      }
    });
  }, [drawFrame]);

  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3003";
    const ws = new WebSocket(`${wsUrl}/live/${runId}`);
    wsRef.current = ws;

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    ws.onopen = () => setRunStatus("running");

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "browser-frame":
          scheduleFrame(data.image);
          break;

        case "step-update":
          setSteps((prev) => {
            const updated = [...prev];
            while (updated.length <= data.step.index) {
              updated.push({ index: updated.length, action: "", description: "", status: "pending" });
            }
            updated[data.step.index] = data.step;
            return updated;
          });
          // Auto-scroll steps panel to current running step
          setTimeout(() => stepsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
          break;

        case "run-status":
          setRunStatus(data.status);
          break;

        case "run-complete":
          setRunStatus(data.status || "completed");
          if (timerRef.current) clearInterval(timerRef.current);
          onComplete?.(data.summary);
          break;
      }
    };

    ws.onerror = () => setRunStatus("error");
    ws.onclose = () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };

    return () => {
      ws.close();
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
    };
  }, [runId, onComplete, scheduleFrame]);

  const completedSteps = steps.filter(
    (s) => s.status === "passed" || s.status === "failed" || s.status === "skipped"
  ).length;
  const totalSteps = steps.length || 1;
  const progressPercent = Math.round((completedSteps / totalSteps) * 100);

  const statusIcon = (status: string) => {
    switch (status) {
      case "passed":  return "✅";
      case "failed":  return "❌";
      case "running": return "⏳";
      case "skipped": return "⏭️";
      default:        return "🔲";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-4 h-[520px]">

        {/* LEFT: Browser Live View — canvas for smooth rendering */}
        <div className="flex-1 relative rounded-xl overflow-hidden border bg-gray-950">
          {/* Live badge */}
          {runStatus === "running" && (
            <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-red-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg pointer-events-none">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              LIVE
            </div>
          )}

          {/* Elapsed timer */}
          <div className="absolute top-3 right-3 z-10 bg-black/60 text-white px-3 py-1.5 rounded-full text-xs font-mono pointer-events-none">
            ⏱️ {Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, "0")}
          </div>

          {/* Canvas — always mounted, hidden until first frame */}
          <canvas
            ref={canvasRef}
            className={cn(
              "w-full h-full object-contain transition-opacity duration-300",
              hasFrame ? "opacity-100" : "opacity-0"
            )}
          />

          {/* Spinner shown until first frame arrives */}
          {!hasFrame && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 gap-3">
              <div className="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
              <p className="text-sm">
                {runStatus === "connecting" ? "Connecting to browser..." : "Waiting for first frame..."}
              </p>
            </div>
          )}
        </div>

        {/* RIGHT: Steps Panel */}
        <div className="w-80 border rounded-xl flex flex-col bg-white">
          <div className="p-4 border-b">
            <h3 className="font-semibold text-sm">Test Steps</h3>
            <p className="text-xs text-gray-500 mt-1">{completedSteps}/{totalSteps} completed</p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {steps.map((step, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2.5 p-2.5 rounded-lg text-sm transition-all duration-200",
                  step.status === "running" && "bg-blue-50 border border-blue-200 shadow-sm",
                  step.status === "passed"  && "bg-green-50/50",
                  step.status === "failed"  && "bg-red-50/50",
                  step.status === "pending" && "opacity-40"
                )}
              >
                <span className="text-base mt-0.5 shrink-0">{statusIcon(step.status)}</span>
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate">{step.description || step.action}</p>
                  {step.durationMs != null && (
                    <p className="text-xs text-gray-400 mt-0.5">{(step.durationMs / 1000).toFixed(1)}s</p>
                  )}
                  {step.error && (
                    <p className="text-xs text-red-600 mt-1 line-clamp-2">{step.error}</p>
                  )}
                </div>
              </div>
            ))}
            <div ref={stepsEndRef} />
          </div>
        </div>
      </div>

      {/* BOTTOM: Progress Bar */}
      <div>
        <div className="flex justify-between text-sm text-gray-500 mb-1.5">
          <span>
            Step {completedSteps}/{totalSteps}
            {runStatus === "running" && " — Running..."}
            {runStatus === "passed"  && " — ✅ All tests passed"}
            {runStatus === "failed"  && " — ❌ Some tests failed"}
            {runStatus === "error"   && " — ⚠️ Run errored"}
          </span>
          <span>{progressPercent}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500 ease-out",
              runStatus === "passed"
                ? "bg-green-500"
                : runStatus === "failed"
                ? "bg-gradient-to-r from-green-500 to-red-500"
                : "bg-gradient-to-r from-blue-500 to-violet-500"
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
