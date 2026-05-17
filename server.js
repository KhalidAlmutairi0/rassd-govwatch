// Custom Next.js server
// - Serves Next.js on PORT
// - Handles WebSocket connections for /live/* directly (no proxy needed)
// - Shares live sessions with API routes via global.__liveSessions
"use strict";

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { WebSocketServer, WebSocket } = require("ws");

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname: "0.0.0.0", port });
const handle = app.getRequestHandler();

// Live-view sessions shared with Next.js API routes via globalThis
const sessions = new Map();
global.__liveSessions = sessions;

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error handling request:", err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  });

  // WebSocket server — handles /live/{runId} connections directly
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url);

    if (pathname && pathname.startsWith("/live/")) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        const parts = pathname.split("/").filter(Boolean);
        const runId = parts[parts.length - 1];
        if (!runId) { ws.close(1008, "Missing runId"); return; }

        let session = sessions.get(runId);
        if (!session) {
          session = { runId, clients: new Set() };
          sessions.set(runId, session);
        }
        session.clients.add(ws);
        console.log(`[WS] Live viewer connected for run ${runId} (${session.clients.size} viewer(s))`);

        // Keepalive ping every 25s to prevent Railway/proxy idle timeout
        const keepalive = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.ping();
        }, 25000);

        ws.on("pong", () => { /* connection alive */ });

        ws.on("close", () => {
          clearInterval(keepalive);
          session.clients.delete(ws);
          if (session.clients.size === 0) sessions.delete(runId);
        });
        ws.on("error", () => {
          clearInterval(keepalive);
        });
      });
    } else {
      socket.destroy();
    }
  });

  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`> Next.js ready on http://0.0.0.0:${port}`);
    console.log(`> WebSocket: /live/* handled on port ${port} (no proxy)`);
  });
});
