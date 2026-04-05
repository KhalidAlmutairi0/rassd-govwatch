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
  } catch (error: any) {
    // If port is already in use, it means WS server is already running
    if (error.code === "EADDRINUSE") {
      console.log("WebSocket server already running");
      initialized = true;
    } else {
      console.error("Failed to start WebSocket server:", error);
    }
  }
}

// Auto-initialize on import (server-side only)
if (typeof window === "undefined") {
  ensureWebSocketServer();
}
