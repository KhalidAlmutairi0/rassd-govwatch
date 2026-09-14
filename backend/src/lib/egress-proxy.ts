import { Agent, createServer, request as httpRequest, type OutgoingHttpHeaders } from "node:http";
import { connect, isIP, type Socket } from "node:net";
import { lookup } from "node:dns/promises";
import { randomBytes } from "node:crypto";
import { BrowserPolicyError, isPublicAddress } from "./browser-safety";
import { HttpUrlSchema } from "./validators";

type Resolver = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

export async function resolvePublicTarget(value: string, resolve: Resolver = (hostname) => lookup(hostname, { all: true, verbatim: true })) {
  const url = new URL(HttpUrlSchema.parse(value));
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await resolve(hostname);
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new BrowserPolicyError("Proxy connections require public destinations");
  return { address: addresses[0].address, family: addresses[0].family, addresses: addresses.slice(0, 8), port: Number(url.port || (url.protocol === "https:" ? 443 : 80)), url };
}

export interface ProxyFailure { url: string; message: string; definite: boolean }

export async function createEgressProxy(onFailure?: (failure: ProxyFailure) => void, resolve?: Resolver) {
  const password = randomBytes(24).toString("hex");
  const authorization = `Basic ${Buffer.from(`browser:${password}`).toString("base64")}`;
  const sockets = new Set<Socket>();
  let closed = false;
  const track = (socket: Socket) => {
    sockets.add(socket);
    socket.on("error", () => socket.destroy());
    socket.once("close", () => sockets.delete(socket));
    socket.setTimeout(30_000, () => socket.destroy());
  };
  const dial = async (target: Awaited<ReturnType<typeof resolvePublicTarget>>) => {
    const deadline = Date.now() + 10_000;
    const errors: NodeJS.ErrnoException[] = [];
    for (const address of target.addresses) {
      if (closed || sockets.size >= 128 || Date.now() >= deadline) break;
      try {
        return await new Promise<Socket>((resolve, reject) => {
          const socket = connect({ host: address.address, family: address.family, port: target.port });
          track(socket);
          const timer = setTimeout(() => socket.destroy(Object.assign(new Error("Connection timed out"), { code: "ETIMEDOUT" })), Math.min(2000, deadline - Date.now()));
          const failed = (error: Error) => { clearTimeout(timer); reject(error); };
          socket.once("error", failed);
          socket.once("close", () => failed(new Error("Connection closed")));
          socket.once("connect", () => {
            clearTimeout(timer);
            socket.removeListener("error", failed);
            resolve(socket);
          });
        });
      } catch (error) { errors.push(error as NodeJS.ErrnoException); }
    }
    const definite = errors.length === target.addresses.length && errors.every((error) => error.code === "ECONNREFUSED");
    onFailure?.({ url: target.url.href, message: definite ? "Target refused all connection attempts" : "Proxy could not establish a target connection", definite });
    throw new Error("Upstream connection unavailable");
  };
  const server = createServer({ requestTimeout: 30_000, headersTimeout: 5000 }, (request, response) => {
    if (request.headers["proxy-authorization"] !== authorization) { response.writeHead(407, { "Proxy-Authenticate": 'Basic realm="browser"' }).end(); return; }
    void (async () => {
      try {
        if (!["GET", "HEAD"].includes(request.method || "")) throw new BrowserPolicyError("Read-only proxy");
        const target = await resolvePublicTarget(request.url || "", resolve);
        if (closed || response.destroyed) return;
        if (sockets.size >= 128 || target.url.protocol !== "http:") throw new BrowserPolicyError("Connection unavailable");
        const headers: OutgoingHttpHeaders = { ...request.headers, host: target.url.host };
        delete headers["proxy-authorization"];
        delete headers["proxy-connection"];
        const socket = await dial(target);
        if (closed || response.destroyed) { socket.destroy(); return; }
        const agent = new Agent({ keepAlive: false });
        agent.createConnection = () => socket;
        const upstream = httpRequest({ hostname: target.url.hostname, port: target.port, path: target.url.pathname + target.url.search, method: request.method, headers, timeout: 20_000, agent }, (incoming) => {
          response.writeHead(incoming.statusCode || 502, incoming.headers);
          incoming.pipe(response);
        });
        upstream.on("timeout", () => upstream.destroy());
        upstream.on("error", () => {
          onFailure?.({ url: target.url.href, message: "Proxy upstream request failed", definite: false });
          if (!response.headersSent) response.writeHead(502, { "X-Rasd-Proxy-Error": "upstream-unavailable" });
          response.end();
        });
        request.on("aborted", () => upstream.destroy());
        response.on("close", () => { upstream.destroy(); agent.destroy(); });
        request.pipe(upstream);
      } catch {
        onFailure?.({ url: request.url || "", message: "Proxy request unavailable", definite: false });
        if (!response.headersSent) response.writeHead(502, { "X-Rasd-Proxy-Error": "upstream-unavailable" });
        response.end();
      }
    })();
  });
  server.on("connection", (socket) => { if (sockets.size >= 128) socket.destroy(); else track(socket); });
  server.on("clientError", (_error, socket) => socket.destroy());
  server.on("upgrade", (_request, socket) => socket.destroy());
  server.on("connect", (request, client, head) => {
    if (request.headers["proxy-authorization"] !== authorization) { client.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="browser"\r\nContent-Length: 0\r\n\r\n'); return; }
    void (async () => {
      try {
        const target = await resolvePublicTarget(`https://${request.url}`, resolve);
        if (closed || client.destroyed) return;
        if (sockets.size >= 128) throw new BrowserPolicyError("Connection limit exceeded");
        const upstream = await dial(target);
        if (closed || client.destroyed) { upstream.destroy(); return; }
        client.once("close", () => upstream.destroy());
        upstream.once("close", () => client.destroy());
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        client.pipe(upstream).pipe(client);
      } catch {
        onFailure?.({ url: `https://${request.url}`, message: "Proxy tunnel unavailable", definite: false });
        client.end("HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n");
      }
    })();
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to start browser proxy");
  return {
    settings: { server: `http://127.0.0.1:${address.port}`, username: "browser", password, bypass: "<-loopback>" },
    async close() {
      closed = true;
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
