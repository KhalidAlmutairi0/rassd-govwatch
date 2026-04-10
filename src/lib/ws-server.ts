// src/lib/ws-server.ts
import { WebSocketServer, WebSocket } from "ws";

interface LiveSession {
  runId: string;
  clients: Set<WebSocket>;
}

// Use global to share sessions and server instance across Next.js hot reloads
const sessions = (global as any).__wsSessions || ((global as any).__wsSessions = new Map<string, LiveSession>());
let wss: WebSocketServer | null = (global as any).__wsServer || null;

export function initWebSocketServer(port: number = 3001) {
  if (wss) {
    console.log(`WebSocket server already running on ws://localhost:${port}`);
    return wss;
  }

  wss = new WebSocketServer({ port });
  (global as any).__wsServer = wss; // persist across hot reloads

  // Handle port-in-use gracefully (happens in Next.js dev with multiple processes)
  wss.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.log(`[WS] Port ${port} already in use — another process has the WS server`);
    } else {
      console.error("[WS] Server error:", err);
    }
  });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url!, `http://localhost:${port}`);
    const pathParts = url.pathname.split("/");
    const pathType = pathParts[1]; // "live" or "relay"
    const runId = pathParts[pathParts.length - 1];

    if (!runId) {
      ws.close(1008, "Missing runId");
      return;
    }

    // ── RELAY path: /relay/{runId} ──
    // Used by the Next.js API process to push messages to viewer clients
    if (pathType === "relay") {
      console.log(`[WS] Relay client connected for run: ${runId}`);
      ws.on("message", (data) => {
        const session = sessions.get(runId);
        const payload = data.toString();
        const msgType = (() => { try { return JSON.parse(payload).type; } catch { return "?"; } })();
        console.log(`[WS] Relay → ${session?.clients.size || 0} viewers for run ${runId} (type: ${msgType})`);
        if (!session) return;
        for (const client of (session.clients as Set<WebSocket>)) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        }
      });
      ws.on("error", () => {});
      return; // Don't add relay clients to viewer sessions
    }

    // ── LIVE path: /live/{runId} ──
    // Used by browser clients watching a run
    let session = sessions.get(runId);
    if (!session) {
      session = { runId, clients: new Set() };
      sessions.set(runId, session);
      console.log(`[WS] Created new session for run: ${runId}`);
    }
    session.clients.add(ws);

    console.log(`Client connected to run: ${runId} (total sessions: ${sessions.size}, clients in this session: ${session.clients.size})`);

    ws.on("close", () => {
      session?.clients.delete(ws);
      if (session?.clients.size === 0) {
        sessions.delete(runId);
        console.log(`Session closed for run: ${runId}`);
      }
    });

    ws.on("error", (error) => {
      console.error(`WebSocket error for run ${runId}:`, error);
    });
  });

  console.log(`✅ WebSocket server running on ws://localhost:${port}`);
  return wss;
}

// Create a persistent relay connection to the worker's WS server.
// Use this from the Next.js API process to push messages to viewer clients.
export function createRelayConnection(runId: string, port?: number): WebSocket {
  const workerPort = port || parseInt(process.env.WORKER_PORT || "3003");
  const relay = new WebSocket(`ws://localhost:${workerPort}/relay/${runId}`);
  relay.on("error", (err) => {
    console.error(`[RELAY] Connection error for run ${runId}:`, err.message);
  });
  return relay;
}

// Send one message through a relay connection (fire and forget)
export function relaySend(relay: WebSocket, message: object) {
  if (relay.readyState === WebSocket.OPEN) {
    relay.send(JSON.stringify(message));
  }
}

// Broadcast a message to all clients watching a specific run
export function broadcast(runId: string, message: object) {
  const session = sessions.get(runId);
  const allRunIds = Array.from(sessions.keys());
  console.log(`[BROADCAST] runId=${runId}, hasSession=${!!session}, clientCount=${session?.clients.size || 0}, messageType=${(message as any).type}, allSessions=[${allRunIds.join(', ')}]`);
  if (!session) return;

  const data = JSON.stringify(message);
  const clients = Array.from(session.clients);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
      console.log(`[BROADCAST] Sent ${(message as any).type} to client`);
    }
  }
}

// Get WebSocket server instance
export function getWebSocketServer() {
  return wss;
}

// Broadcast types:
// { type: "browser-frame", image: "data:image/jpeg;base64,..." }
// { type: "step-update", step: { index, action, description, status, durationMs } }
// { type: "step-log", log: { level, message, timestamp } }
// { type: "run-status", status: "running" | "passed" | "failed" }
// { type: "run-complete", summary: { ... } }
