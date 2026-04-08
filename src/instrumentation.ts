// src/instrumentation.ts
// Runs once when the Next.js server starts — perfect place to boot the WS server.
export async function register() {
  // Only run in the Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureWebSocketServer } = await import("./lib/init-ws");
    ensureWebSocketServer();
  }
}
