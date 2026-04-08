// src/lib/init-ws.ts
// Initialize WebSocket server for live browser streaming
import { initWebSocketServer } from "./ws-server";

let initialized = false;

export function ensureWebSocketServer() {
  if (initialized) return;
  initialized = true; // Mark immediately to prevent double-init

  const port = parseInt(process.env.WORKER_PORT || "3003");
  // initWebSocketServer handles EADDRINUSE via an 'error' event handler
  initWebSocketServer(port);
  console.log(`[WS] WebSocket server init requested on port ${port}`);
}
