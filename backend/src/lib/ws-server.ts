import { WebSocketServer, WebSocket } from "ws";
import { isAllowedOrigin } from "./cors";

const sessions = new Map<string, Set<WebSocket>>();
let wss: WebSocketServer | null = null;
const MAX_BUFFER = 512_000;

export function initWebSocketServer(port = Number(process.env.WORKER_PORT || 4001)) {
  if (wss) return wss;
  const server = new WebSocketServer({ host: process.env.WORKER_HOST || "127.0.0.1", port, maxPayload: 4096, perMessageDeflate: false });
  wss = server;
  const alive = new WeakSet<WebSocket>();
  server.on("connection", (socket, request) => {
    if (!isAllowedOrigin(request.headers.origin)) { socket.close(1008, "Origin not allowed"); return; }
    const match = /^\/live\/([a-zA-Z0-9_-]{1,100})$/.exec(new URL(request.url || "/", "http://localhost").pathname);
    if (!match || server.clients.size > 100) { socket.close(1008, "Invalid subscription or viewer limit exceeded"); return; }
    const runId = match[1];
    let clients = sessions.get(runId);
    if (!clients) { clients = new Set(); sessions.set(runId, clients); }
    if (clients.size >= 20) { socket.close(1008, "Viewer limit exceeded"); return; }
    clients.add(socket);
    alive.add(socket);
    socket.on("pong", () => alive.add(socket));
    socket.on("message", () => socket.close(1008, "Read-only connection"));
    socket.on("error", () => socket.terminate());
    socket.on("close", () => { clients.delete(socket); if (!clients.size) sessions.delete(runId); });
  });
  const heartbeat = setInterval(() => {
    for (const socket of server.clients) {
      if (!alive.has(socket)) socket.terminate();
      else { alive.delete(socket); socket.ping(); }
    }
  }, 15_000);
  server.on("close", () => { clearInterval(heartbeat); sessions.clear(); wss = null; });
  return server;
}

export function broadcast(runId: string, message: object) {
  const clients = sessions.get(runId);
  if (!clients?.size) return;
  const data = JSON.stringify(message);
  if (Buffer.byteLength(data) > MAX_BUFFER) return;
  for (const client of clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    if (client.bufferedAmount > MAX_BUFFER) { client.terminate(); continue; }
    client.send(data, (error) => { if (error) client.terminate(); });
  }
}

export function getWebSocketServer() { return wss; }
