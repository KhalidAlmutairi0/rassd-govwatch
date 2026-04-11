// Custom Next.js server
// - Serves Next.js on PORT (what Render assigns)
// - Proxies WebSocket connections (/live/* and /relay/*) to the scheduler's
//   internal WS server on WORKER_PORT (3003) so only one port is needed publicly.
"use strict";

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { WebSocketServer, WebSocket } = require("ws");

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);
const wsPort = parseInt(process.env.WORKER_PORT || "3003", 10);

const app = next({ dev, hostname: "0.0.0.0", port });
const handle = app.getRequestHandler();

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

  // Proxy WebSocket upgrade requests → scheduler's internal WS server
  httpServer.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url);

    if (
      pathname &&
      (pathname.startsWith("/live/") || pathname.startsWith("/relay/"))
    ) {
      proxyWebSocket(req, socket, head, pathname, wsPort);
    } else {
      socket.destroy();
    }
  });

  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`> Next.js ready on http://0.0.0.0:${port}`);
    console.log(
      `> WebSocket proxy: port ${port} → ws://localhost:${wsPort} (paths /live/* /relay/*)`
    );
  });
});

/**
 * Proxy an HTTP upgrade (WebSocket) request to the internal WS server.
 * Retries a few times to handle race where scheduler hasn't started yet.
 */
function proxyWebSocket(req, socket, head, pathname, targetPort, attempt = 0) {
  const target = new WebSocket(`ws://localhost:${targetPort}${pathname}`, {
    headers: {
      host: `localhost:${targetPort}`,
      "x-forwarded-for":
        req.headers["x-forwarded-for"] || req.socket.remoteAddress,
    },
  });

  target.on("open", () => {
    // Complete the WebSocket handshake with the browser client
    const proxyWss = new WebSocketServer({ noServer: true });
    proxyWss.handleUpgrade(req, socket, head, (clientWs) => {
      // Bridge messages bidirectionally
      clientWs.on("message", (data, isBinary) => {
        if (target.readyState === WebSocket.OPEN) {
          target.send(data, { binary: isBinary });
        }
      });
      target.on("message", (data, isBinary) => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(data, { binary: isBinary });
        }
      });

      clientWs.on("close", (code, reason) => {
        if (target.readyState !== WebSocket.CLOSED) target.close(code, reason);
      });
      target.on("close", (code, reason) => {
        if (clientWs.readyState !== WebSocket.CLOSED) clientWs.close(code, reason);
      });

      clientWs.on("error", () => {
        if (target.readyState !== WebSocket.CLOSED) target.close();
      });
      target.on("error", () => {
        if (clientWs.readyState !== WebSocket.CLOSED) clientWs.close();
      });
    });
  });

  target.on("error", (err) => {
    if (attempt < 8) {
      // Retry with back-off — scheduler may still be starting
      const delay = Math.min(500 * (attempt + 1), 3000);
      setTimeout(() => proxyWebSocket(req, socket, head, pathname, targetPort, attempt + 1), delay);
    } else {
      console.error(
        `[WS Proxy] Could not connect to ws://localhost:${targetPort}${pathname} after ${attempt} attempts:`,
        err.message
      );
      if (!socket.destroyed) socket.destroy();
    }
  });
}
