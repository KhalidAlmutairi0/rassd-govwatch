// src/instrumentation.ts
// The WS server is owned by the worker process (npm run worker) which
// broadcasts live CDP frames. Next.js does NOT start a WS server to
// avoid port conflicts — the worker must be running for live view.
export async function register() {
  // no-op: worker owns the WebSocket server
}
