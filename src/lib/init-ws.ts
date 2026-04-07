// src/lib/init-ws.ts
// Initialize WebSocket server for live browser streaming
import { initWebSocketServer } from "./ws-server";

let initialized = false;

export function ensureWebSocketServer() {
  if (initialized) return;

  try {
    const port = parseInt(process.env.WORKER_PORT || "3003");
    initWebSocketServer(port);
    initialized = true;
    console.log(`[WS] WebSocket server initialized on port ${port}`);
  } catch (error: any) {
    // Port already in use = WS server already running (e.g. worker process)
    if (error.code === "EADDRINUSE") {
      console.log("[WS] WebSocket server already running on port");
      initialized = true;
    } else {
      console.error("[WS] Failed to start WebSocket server:", error);
    }
  }
}
