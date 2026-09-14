import "../config/env.cjs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { routeRequest } from "./router";
import { corsHeaders, isAllowedOrigin } from "./lib/cors";
import { prisma } from "./lib/prisma";

const BODY_LIMIT = 64 * 1024;
class BodyLimitError extends Error {}

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const cleanup = () => { request.off("data", data); request.off("end", end); request.off("error", error); request.off("aborted", aborted); };
    const error = (cause: Error) => { cleanup(); reject(cause); };
    const aborted = () => error(new Error("Request aborted"));
    const end = () => { cleanup(); resolve(Buffer.concat(chunks)); };
    const data = (chunk: Buffer) => {
      size += chunk.length;
      if (size > BODY_LIMIT) { cleanup(); chunks.length = 0; request.resume(); reject(new BodyLimitError()); return; }
      chunks.push(chunk);
    };
    request.on("data", data);
    request.once("end", end);
    request.once("error", error);
    request.once("aborted", aborted);
  });
}

async function send(result: Response, request: IncomingMessage, response: ServerResponse) {
  if (response.destroyed) { await result.body?.cancel().catch(() => {}); return; }
  const headers = Object.fromEntries(result.headers.entries());
  response.writeHead(result.status, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers, ...corsHeaders(request.headers.origin) });
  if (request.method === "HEAD" || !result.body) { await result.body?.cancel().catch(() => {}); response.end(); return; }
  await pipeline(Readable.fromWeb(result.body as unknown as NodeReadableStream), response);
}

const server = createServer({ maxHeaderSize: 16 * 1024, requestTimeout: 15_000, headersTimeout: 10_000, keepAliveTimeout: 5000 }, (incoming, outgoing) => {
  const controller = new AbortController();
  incoming.once("aborted", () => controller.abort());
  incoming.on("error", () => controller.abort());
  outgoing.on("error", () => controller.abort());
  outgoing.once("close", () => { if (!outgoing.writableFinished) controller.abort(); });
  outgoing.setTimeout(35_000, () => { controller.abort(); outgoing.destroy(); });
  void (async () => {
    try {
      if (!isAllowedOrigin(incoming.headers.origin)) { incoming.resume(); await send(Response.json({ error: "Origin not allowed" }, { status: 403 }), incoming, outgoing); return; }
      if (incoming.method === "OPTIONS") { incoming.resume(); await send(new Response(null, { status: 204 }), incoming, outgoing); return; }
      if (Number(incoming.headers["content-length"] || 0) > BODY_LIMIT) throw new BodyLimitError();
      const body = await readBody(incoming);
      const headers = new Headers();
      for (let index = 0; index < incoming.rawHeaders.length; index += 2) headers.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1]);
      const method = incoming.method || "GET";
      const request = new Request(new URL(incoming.url || "/", "http://localhost"), { method, headers, signal: controller.signal, body: !["GET", "HEAD"].includes(method) && body.length ? body.toString("utf8") : undefined });
      await send(await routeRequest(request), incoming, outgoing);
    } catch (error) {
      if (outgoing.destroyed) return;
      if (outgoing.headersSent) { outgoing.destroy(); return; }
      incoming.resume();
      const tooLarge = error instanceof BodyLimitError;
      if (!tooLarge && !controller.signal.aborted) console.error("HTTP request failed", error);
      await send(Response.json({ error: tooLarge ? "Request body too large" : "Request failed" }, { status: tooLarge ? 413 : 500, headers: { Connection: "close" } }), incoming, outgoing).catch(() => outgoing.destroy());
    }
  })();
});

server.maxConnections = 1000;
server.on("clientError", (_error, socket) => socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n"));
server.on("upgrade", (_request, socket) => socket.end("HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\n\r\n"));
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => server.closeAllConnections(), 10_000);
  deadline.unref();
  server.close(() => {
    clearTimeout(deadline);
    void prisma.$disconnect().finally(() => { if (process.connected) process.disconnect(); });
  });
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
process.once("disconnect", shutdown);
const port = Number(process.env.PORT || process.env.API_PORT || 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid API port");
server.on("error", (error) => { console.error("API could not start", error); process.exit(1); });
server.listen(port, process.env.API_HOST || "127.0.0.1", () => console.log(`Rasd API listening on port ${port}`));
