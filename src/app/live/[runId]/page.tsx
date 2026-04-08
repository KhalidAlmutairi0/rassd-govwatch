"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnimatedCursor } from "@/components/live/AnimatedCursor";
import Link from "next/link";

interface StepStatus {
  index: number;
  action: string;
  description: string;
  status: "pending" | "running" | "passed" | "failed" | "skipped";
  durationMs?: number;
  error?: string;
}

export default function LiveViewPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.runId as string;

  // Canvas-based frame rendering — bypasses React state for every frame,
  // giving smooth real-time updates without re-render overhead.
  const [hasFrame, setHasFrame] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgBufferRef = useRef<HTMLImageElement | null>(null);

  const [steps, setSteps] = useState<StepStatus[]>([]);
  const [runStatus, setRunStatus] = useState<string>("connecting");
  const [elapsed, setElapsed] = useState(0);
  const [cursorState, setCursorState] = useState({
    x: 0,
    y: 0,
    clicking: false,
    text: '',
    type: ''
  });
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const timerStartRef = useRef<number | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef<boolean>(false);
  const cleanupRef = useRef<boolean>(false);

  const startTimer = () => {
    if (timerStartRef.current !== null) return; // already running
    timerStartRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - timerStartRef.current!) / 1000));
    }, 1000);
  };

  useEffect(() => {
    // Skip if already initialized (React Strict Mode double-mount protection)
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      console.log("WebSocket already exists, reusing connection");
      cleanupRef.current = false;
      return () => {
        cleanupRef.current = true;
      };
    }

    cleanupRef.current = false;
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3003";
    const ws = new WebSocket(`${wsUrl}/live/${runId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      setRunStatus("connecting");

      // Only trigger execution once (not on reconnections)
      if (!startedRef.current) {
        startedRef.current = true;
        fetch(`/api/runs/${runId}/start`, { method: "POST" })
          .then(async (res) => {
            const data = await res.json();
            if (!res.ok) {
              // Check if we should redirect to report (test already completed)
              if (data.redirect) {
                console.log("Test already completed, redirecting to report...");
                router.push(data.redirect);
                return;
              }
              console.error("Failed to start run:", data.error);
            } else if (data.alreadyRunning) {
              console.log("Test is already running, watching...");
            }
          })
          .catch((err) => {
            console.error("Error starting run:", err);
          });
      }
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "browser-frame":
          // Start timer on first real frame from the browser
          startTimer();
          // Draw directly to canvas — no React state update per frame,
          // so all frames render smoothly at full ~16fps.
          if (!imgBufferRef.current) imgBufferRef.current = new Image();
          imgBufferRef.current.onload = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            ctx.drawImage(imgBufferRef.current!, 0, 0, canvas.width, canvas.height);
            // Trigger one React state update only for the first frame
            // (to swap spinner → canvas visibility)
            if (canvas.dataset.hasFrame !== "true") {
              canvas.dataset.hasFrame = "true";
              setHasFrame(true);
            }
          };
          imgBufferRef.current.src = data.image;
          break;

        case "cursor_move":
          // Scale coordinates to match the displayed browser frame size
          if (frameRef.current) {
            const rect = frameRef.current.getBoundingClientRect();
            const scaleX = rect.width / 1280;  // assuming 1280 viewport
            const scaleY = rect.height / 720;
            setCursorState({
              x: data.data.x * scaleX,
              y: data.data.y * scaleY,
              clicking: false,
              text: data.data.elementText,
              type: data.data.elementType
            });
          }
          break;

        case "cursor_click":
          setCursorState(prev => ({ ...prev, clicking: true }));
          setTimeout(() => setCursorState(prev => ({ ...prev, clicking: false })), 300);
          break;

        case "step-update":
          setSteps((prev) => {
            const updated = [...prev];
            while (updated.length <= data.step.index) {
              updated.push({
                index: updated.length,
                action: "",
                description: "",
                status: "pending",
              });
            }
            updated[data.step.index] = data.step;
            return updated;
          });
          break;

        case "run-status":
          startTimer(); // also start timer when execution begins
          setRunStatus(data.status || "running");
          break;

        case "run-complete":
          setRunStatus(data.status || "completed");
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
          // Auto-redirect to report after 2 seconds
          setTimeout(() => {
            router.push(`/report/${runId}`);
          }, 2000);
          break;
      }
    };

    ws.onerror = () => {
      console.error("WebSocket error");
      setRunStatus("error");
    };

    ws.onclose = () => {
      console.log("WebSocket closed");
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };

    return () => {
      // Only cleanup if this is a true unmount, not React Strict Mode
      if (!cleanupRef.current) {
        console.log("Skipping cleanup (React Strict Mode)");
        cleanupRef.current = true;
        return;
      }

      console.log("Cleaning up WebSocket connection");
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  }, [runId, router]);

  const completedSteps = steps.filter(
    (s) => s.status === "passed" || s.status === "failed" || s.status === "skipped"
  ).length;
  const totalSteps = steps.length || 1;
  const progressPercent = Math.round((completedSteps / totalSteps) * 100);

  const statusIcon = (status: string) => {
    switch (status) {
      case "passed": return "✅";
      case "failed": return "❌";
      case "running": return "⏳";
      case "skipped": return "⏭️";
      default: return "🔲";
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case "running": return "bg-blue-50 border border-blue-200 shadow-sm";
      case "passed": return "bg-green-50/50";
      case "failed": return "bg-red-50/50";
      case "pending": return "opacity-50";
      default: return "";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <nav className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <Link href="/dashboard">
            <Button variant="ghost" className="hover:bg-gray-100">
              ← Back to Dashboard
            </Button>
          </Link>
          <Badge className={
            runStatus === "running" ? "bg-gradient-to-r from-blue-500 to-violet-500" :
            runStatus === "passed" ? "bg-green-500" :
            runStatus === "failed" ? "bg-red-500" : "bg-gray-500"
          }>
            {runStatus.toUpperCase()}
          </Badge>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-4">
          {/* Browser + Steps Layout */}
          <div className="flex gap-4 h-[520px]">
            {/* LEFT: Browser Live View */}
            <div
              ref={frameRef}
              className="flex-1 relative rounded-xl overflow-hidden border-2 border-gray-200 bg-gray-950 shadow-xl"
            >
              {/* Live Badge */}
              {hasFrame && (
                <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-2 rounded-full text-xs font-bold shadow-2xl">
                  <span className="w-2.5 h-2.5 bg-white rounded-full animate-pulse" />
                  LIVE
                </div>
              )}

              {/* Elapsed Time */}
              <div className="absolute top-4 right-4 z-10 bg-black/70 backdrop-blur-sm text-white px-4 py-2 rounded-full text-xs font-mono font-semibold shadow-lg">
                ⏱️ {Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, "0")}
              </div>

              {/* Browser Frame — canvas renders each JPEG frame directly,
                  bypassing React state for smooth real-time streaming. */}
              <canvas
                ref={canvasRef}
                width={1280}
                height={720}
                className="w-full h-full object-contain"
                style={{ display: hasFrame ? "block" : "none" }}
              />
              {!hasFrame && (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3 absolute inset-0">
                  <div className="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
                  <p className="text-sm">Connecting to browser...</p>
                </div>
              )}

              {/* Animated Cursor Overlay */}
              {cursorState.text && runStatus === "running" && (
                <AnimatedCursor
                  targetX={cursorState.x}
                  targetY={cursorState.y}
                  isClicking={cursorState.clicking}
                  elementText={cursorState.text}
                  elementType={cursorState.type}
                />
              )}
            </div>

            {/* RIGHT: Steps Panel */}
            <div className="w-80 border-2 border-gray-200 rounded-xl flex flex-col bg-white shadow-xl">
              <div className="p-4 border-b bg-gradient-to-r from-gray-50 to-white">
                <h3 className="font-bold text-sm text-gray-900">Test Steps</h3>
                <p className="text-xs text-gray-600 mt-1 font-medium">
                  {completedSteps}/{totalSteps} completed
                </p>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {steps.map((step, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg text-sm transition-all ${getStatusClass(step.status)}`}
                  >
                    <span className="text-base mt-0.5 shrink-0">
                      {statusIcon(step.status)}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 truncate">
                        {step.description || step.action}
                      </p>
                      {step.durationMs && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {(step.durationMs / 1000).toFixed(1)}s
                        </p>
                      )}
                      {step.error && (
                        <p className="text-xs text-red-600 mt-1 line-clamp-2">
                          {step.error}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <Card className="p-5 shadow-lg border-2 border-gray-200">
            <div className="flex justify-between text-sm font-semibold text-gray-700 mb-2">
              <span className="flex items-center gap-2">
                Step {completedSteps}/{totalSteps}
                {runStatus === "running" && (
                  <span className="text-blue-600 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse" />
                    Running...
                  </span>
                )}
                {runStatus === "passed" && " — ✅ All tests passed"}
                {runStatus === "failed" && " — ❌ Some tests failed"}
              </span>
              <span className="text-gray-900 font-bold">{progressPercent}%</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden shadow-inner">
              <div
                className={`h-full transition-all duration-700 ease-out rounded-full shadow-sm ${
                  runStatus === "passed"
                    ? "bg-gradient-to-r from-green-400 to-green-500"
                    : runStatus === "failed"
                    ? "bg-gradient-to-r from-green-500 via-yellow-500 to-red-500"
                    : "bg-gradient-to-r from-blue-500 via-violet-500 to-purple-500"
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
