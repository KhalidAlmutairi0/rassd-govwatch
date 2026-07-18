// src/lib/ws-server.ts
// On Vercel: uses Ably for real-time broadcasting (no persistent WS server)
// Locally: uses a WebSocket server on a separate port

import { ablyBroadcast, isAblyEnabled } from "@/server/notifications/ably-broadcast";

const IS_VERCEL = !!process.env.VERCEL;

// ── Local WebSocket state (only used outside Vercel) ──────────────────────────
type WS = import("ws").WebSocket;
type WSServer = import("ws").WebSocketServer;

interface LiveSession {
  runId: string;
  clients: Set<WS>;
}

const sessions: Map<string, LiveSession> = IS_VERCEL
  ? new Map()
  : ((global as any).__wsSessions || ((global as any).__wsSessions = new Map()));

let wss: WSServer | null = IS_VERCEL
  ? null
  : ((global as any).__wsServer || null);

// ── Init (local dev only) ─────────────────────────────────────────────────────
export function initWebSocketServer(port = 3001) {
  if (IS_VERCEL) return null; // Ably handles this on Vercel

  if (wss) {
    console.log(`[WS] WebSocket server init requested on port ${port}`);
    return wss;
  }

  const { WebSocketServer } = require("ws") as typeof import("ws");

  wss = new WebSocketServer({ port });
  (global as any).__wsServer = wss;

  wss!.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.log(`[WS] Port ${port} already in use — another process has the WS server`);
    } else {
      console.error("[WS] Server error:", err);
    }
  });

  wss!.on("connection", (ws: WS, req: any) => {
    const url = new URL(req.url!, `http://localhost:${port}`);
    const pathParts = url.pathname.split("/");
    const pathType = pathParts[1];
    const runId = pathParts[pathParts.length - 1];

    if (!runId) { ws.close(1008, "Missing runId"); return; }

    // Relay path: worker pushes messages through here to viewer clients
    if (pathType === "relay") {
      ws.on("message", (data: any) => {
        const session = sessions.get(runId);
        if (!session) return;
        const payload = data.toString();
        for (const client of session.clients) {
          if ((client as any).readyState === 1) client.send(payload);
        }
      });
      ws.on("error", () => {});
      return;
    }

    // Live path: browser viewer subscribes
    let session = sessions.get(runId);
    if (!session) {
      session = { runId, clients: new Set() };
      sessions.set(runId, session);
    }
    session.clients.add(ws);

    ws.on("close", () => {
      session?.clients.delete(ws);
      if (session?.clients.size === 0) sessions.delete(runId);
    });
    ws.on("error", () => {});
  });

  console.log(`✅ WebSocket server running on ws://localhost:${port}`);
  return wss;
}

// ── Relay helper (local dev only) ─────────────────────────────────────────────
export function createRelayConnection(runId: string, port?: number) {
  if (IS_VERCEL) return null as any;
  const { WebSocket } = require("ws") as typeof import("ws");
  const workerPort = port || parseInt(process.env.WORKER_PORT || "3003");
  const relay = new WebSocket(`ws://localhost:${workerPort}/relay/${runId}`);
  relay.on("error", (err: Error) => {
    console.error(`[RELAY] Connection error for run ${runId}:`, err.message);
  });
  return relay;
}

export function relaySend(relay: any, message: object) {
  if (relay && relay.readyState === 1) {
    relay.send(JSON.stringify(message));
  }
}

// ── Main broadcast — Ably on Vercel, local WS otherwise ───────────────────────
export function broadcast(runId: string, message: object): void {
  if (IS_VERCEL || isAblyEnabled()) {
    ablyBroadcast(runId, message).catch(() => {});
    return;
  }

  const session = sessions.get(runId);
  if (!session) return;
  const data = JSON.stringify(message);
  for (const client of session.clients) {
    if ((client as any).readyState === 1) (client as any).send(data);
  }
}

export function getWebSocketServer() {
  return wss;
}
