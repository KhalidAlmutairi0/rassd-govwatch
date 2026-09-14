"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, isStandalone, liveSocketUrl } from "./api-client";

export interface LiveStep {
  index: number; action: string; description: string;
  status: "pending" | "running" | "passed" | "failed" | "skipped" | "warning";
  durationMs?: number; error?: string; url?: string; timestamp?: string;
}

const terminal = new Set(["passed", "failed", "warning", "error", "timeout"]);

export function useLiveRun(runId: string) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [hasFrame, setHasFrame] = useState(false);
  const [steps, setSteps] = useState<LiveStep[]>([]);
  const [plannedSteps, setPlannedSteps] = useState(0);
  const [runStatus, setRunStatus] = useState("connecting");
  const [elapsed, setElapsed] = useState(0);
  const [currentUrl, setCurrentUrl] = useState("");
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [cursorState, setCursorState] = useState({ x: 0, y: 0, clicking: false, text: "", type: "" });

  useEffect(() => {
    if (isStandalone) {
      setRunStatus("standalone");
      setSteps([]);
      setPlannedSteps(0);
      setHasFrame(false);
      setCurrentUrl("");
      setElapsed(0);
      return;
    }
    let disposed = false;
    let done = false;
    let ws: WebSocket | undefined;
    let image: HTMLImageElement | undefined;
    let controller: AbortController | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let clickTimer: ReturnType<typeof setTimeout> | undefined;
    let redirect: ReturnType<typeof setTimeout> | undefined;
    let startedAt: number | undefined;
    let decoding = false;
    let eventVersion = 0;
    setHasFrame(false);
    setSteps([]);
    setPlannedSteps(0);
    setRunStatus("connecting");
    setCurrentUrl("");
    setElapsed(0);
    setPhaseIndex(0);
    const finish = (status: string, refresh = true) => {
      if (done) return;
      done = true;
      setRunStatus(status);
      clearTimeout(reconnect);
      clearTimeout(pollTimer);
      const navigate = () => { if (!disposed) redirect = setTimeout(() => router.push(`/report/${runId}`), 2000); };
      if (refresh) { controller?.abort(); void poll(true).catch(() => {}).finally(navigate); }
      else navigate();
    };
    const updateStep = (step: LiveStep, updateUrl = true) => {
      if (!Number.isInteger(step.index) || step.index < 0 || step.index >= 100) return;
      if (step.url && updateUrl) setCurrentUrl(step.url);
      setSteps((previous) => {
        const entries = new Map(previous.map((item) => [item.index, item]));
        const existing = entries.get(step.index);
        entries.set(step.index, { ...step, timestamp: existing?.timestamp || new Date().toLocaleTimeString() });
        return Array.from(entries.values()).sort((a, b) => a.index - b.index);
      });
    };
    const connect = () => {
      if (disposed || done) return;
      const endpoint = liveSocketUrl(runId);
      if (!endpoint) return;
      ws = new WebSocket(endpoint);
      ws.onmessage = (event) => {
        if (disposed || done || typeof event.data !== "string" || event.data.length > 512_000) return;
        let data;
        try { data = JSON.parse(event.data); } catch { return; }
        if (!data || typeof data !== "object") return;
        switch (data.type) {
          case "browser-frame":
            if (decoding || typeof data.image !== "string" || !data.image.startsWith("data:image/jpeg;base64,")) break;
            decoding = true;
            image ||= new Image();
            image.onload = () => {
              decoding = false;
              const canvas = canvasRef.current;
              if (disposed || !canvas) return;
              canvas.getContext("2d")?.drawImage(image!, 0, 0, canvas.width, canvas.height);
              setHasFrame(true);
            };
            image.onerror = () => { decoding = false; };
            image.src = data.image;
            break;
          case "test-plan":
            eventVersion++;
            if (Number.isInteger(data.totalSteps) && data.totalSteps > 0 && data.totalSteps <= 100) setPlannedSteps((previous) => Math.max(previous, data.totalSteps));
            break;
          case "step-update":
            eventVersion++;
            if (data.step) { updateStep(data.step); setPhaseIndex(2); }
            break;
          case "run-status":
            eventVersion++;
            setRunStatus(data.status);
            if (data.phaseCode) setPhaseIndex(data.phaseCode === "summary" ? 3 : data.phaseCode === "analysis" ? 1 : 0);
            break;
          case "run-complete":
            eventVersion++;
            if (terminal.has(data.status)) finish(data.status);
            break;
          case "cursor_move": {
            if (!data.data || !Number.isFinite(data.data.x) || !Number.isFinite(data.data.y)) break;
            const box = frameRef.current?.getBoundingClientRect();
            if (box) {
              const scale = Math.min(box.width / 1280, box.height / 720);
              setCursorState({ x: (box.width - 1280 * scale) / 2 + data.data.x * scale, y: (box.height - 720 * scale) / 2 + data.data.y * scale, clicking: false, text: data.data.elementText || "", type: data.data.elementType || "" });
            }
            break;
          }
          case "cursor_click":
            setCursorState((value) => ({ ...value, clicking: true }));
            clearTimeout(clickTimer);
            clickTimer = setTimeout(() => setCursorState((value) => ({ ...value, clicking: false })), 300);
            break;
        }
      };
      ws.onerror = () => {};
      ws.onclose = () => { if (!disposed && !done) reconnect = setTimeout(connect, 3000); };
    };
    const poll = async (finalSnapshot = false) => {
      const snapshotVersion = eventVersion;
      const requestController = new AbortController();
      controller = requestController;
      const timeout = setTimeout(() => requestController.abort(), 8000);
      try {
        const response = await apiFetch(`/api/runs/${runId}`, { signal: requestController.signal, cache: "no-store" });
        if (!response.ok) return;
        const { run } = await response.json();
        if (disposed || (done && !finalSnapshot) || !run) return;
        const terminalSnapshot = terminal.has(run.status);
        if (finalSnapshot && !terminalSnapshot) return;
        const currentSnapshot = eventVersion === snapshotVersion;
        if (currentSnapshot) setRunStatus((previous) => previous === "running" && run.status === "queued" ? previous : run.status);
        setPlannedSteps((previous) => Math.max(previous, run.totalSteps));
        if (run.site?.baseUrl) setCurrentUrl((previous) => previous || run.site.baseUrl);
        if (terminalSnapshot) {
          setSteps((previous) => {
            const timestamps = new Map(previous.map((step) => [step.index, step.timestamp]));
            return run.steps.map((step: LiveStep & { stepIndex: number }) => ({ ...step, index: step.stepIndex, timestamp: timestamps.get(step.stepIndex) || new Date().toLocaleTimeString() }));
          });
          const lastUrl = run.steps[run.steps.length - 1]?.url || run.site?.baseUrl;
          if (lastUrl) setCurrentUrl(lastUrl);
        } else for (const step of run.steps) updateStep({ ...step, index: step.stepIndex }, currentSnapshot);
        if (run.status !== "queued") startedAt = new Date(run.startedAt).getTime();
        if (run.finishedAt && startedAt) setElapsed(Math.max(0, Math.floor((new Date(run.finishedAt).getTime() - startedAt) / 1000)));
        if (terminalSnapshot) finish(run.status, false);
      } finally {
        clearTimeout(timeout);
        if (!disposed && !done) pollTimer = setTimeout(() => { void poll().catch(() => {}); }, 2000);
      }
    };
    const timer = setInterval(() => { if (startedAt && !done) setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000))); }, 1000);
    connect();
    void poll().catch(() => {});
    return () => {
      disposed = true;
      controller?.abort();
      clearInterval(timer);
      for (const timeout of [pollTimer, reconnect, clickTimer, redirect]) clearTimeout(timeout);
      if (ws) {
        const socket = ws;
        socket.onmessage = socket.onerror = socket.onclose = null;
        // Closing during CONNECTING aborts the handshake and produces a browser
        // warning on rapid navigation or development effect remounts.
        if (socket.readyState === WebSocket.CONNECTING) socket.onopen = () => socket.close();
        else if (socket.readyState === WebSocket.OPEN) socket.close();
      }
      if (image) image.onload = image.onerror = null;
    };
  }, [runId, router]);

  const completedSteps = steps.filter((step) => !["running", "pending"].includes(step.status)).length;
  const totalSteps = Math.max(plannedSteps, steps.length, 1);
  return { canvasRef, frameRef, hasFrame, steps, runStatus, elapsed, currentUrl, cursorState, phaseIndex, isComplete: terminal.has(runStatus), progressPercent: Math.min(100, Math.round(completedSteps / totalSteps * 100)) };
}
