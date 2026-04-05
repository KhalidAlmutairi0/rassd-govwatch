// src/lib/ws-server.ts
import { WebSocketServer, WebSocket } from "ws";

interface LiveSession {
  runId: string;
  clients: Set<WebSocket>;
}

// Use global to share sessions across Next.js serverless functions
const sessions = (global as any).__wsSessions || ((global as any).__wsSessions = new Map<string, LiveSession>());
let wss: WebSocketServer | null = (global as any).__wsServer || null;

export function initWebSocketServer(port: number = 3001) {
  if (wss) {
    console.log(`WebSocket server already running on ws://localhost:${port}`);
    return wss;
  }

  wss = new WebSocketServer({ port });

  wss.on("connection", (ws, req) => {
    // URL format: ws://localhost:3001/live/{runId}
    const url = new URL(req.url!, `http://localhost:${port}`);
    const pathParts = url.pathname.split("/");
    const runId = pathParts[pathParts.length - 1];

    if (!runId) {
      ws.close(1008, "Missing runId");
      return;
    }

    // Register client to session
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
