import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { WebSocketServer } from "ws";

// Run against the frontend and worker dev servers. The run snapshot is a fixture
// so this checks the live view without launching a paid scan or changing data.
test("live view opens and releases its socket without aborting a handshake", async () => {
  const server = createServer();
  const sockets = new WebSocketServer({ noServer: true });
  server.on("upgrade", (request, socket, head) => {
    setTimeout(() => sockets.handleUpgrade(request, socket, head, ws => sockets.emit("connection", ws, request)), 1000);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const endpoint = `ws://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const warnings = [];
    page.on("console", message => {
      if (/WebSocket.*(failed|closed before)/i.test(message.text())) warnings.push(message.text());
    });
    await page.addInitScript(endpoint => {
      window.socketLifecycle = [];
      const NativeSocket = WebSocket;
      window.WebSocket = class extends NativeSocket {
        constructor(url, protocols) {
          super(String(url).includes("/live/") ? endpoint + new URL(url).pathname : url, protocols);
        }
        close(...args) {
          if (this.url.includes("/live/")) window.socketLifecycle.push(this.readyState);
          return super.close(...args);
        }
      };
    }, endpoint);
    await page.route("**/api/runs/lifecycle-check", route => route.fulfill({
      json: { run: { status: "running", totalSteps: 1, steps: [], startedAt: new Date().toISOString() } },
    }));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    const liveSockets = new Set();
    let opened = 0;
    cdp.on("Network.webSocketCreated", event => {
      if (event.url.includes("/live/")) liveSockets.add(event.requestId);
    });
    cdp.on("Network.webSocketHandshakeResponseReceived", event => {
      if (liveSockets.has(event.requestId) && event.response.status === 101) opened++;
    });
    cdp.on("Network.webSocketClosed", event => liveSockets.delete(event.requestId));
    await page.goto("http://localhost:3000/live/lifecycle-check");
    await assert.doesNotReject(async () => {
      const deadline = Date.now() + 10_000;
      while (!opened && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
      assert.ok(opened > 0, "live socket should complete a handshake");
    });
    await page.locator(".brand").click();
    await page.waitForURL("http://localhost:3000/");
    const deadline = Date.now() + 5000;
    while (liveSockets.size && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(liveSockets.size, 0, "leaving the live view should release every socket");
    const closedStates = await page.evaluate(() => window.socketLifecycle);
    assert.ok(!closedStates.includes(0), "cleanup must not close sockets while CONNECTING");
    assert.deepEqual(warnings, [], "browser should report no WebSocket handshake warnings");

    // Navigate away as soon as a new connection starts, before the slow server
    // accepts it. This also covers development remount cleanup during a handshake.
    const connecting = page.waitForEvent("websocket", socket => socket.url().includes("/live/"));
    await page.goto("http://localhost:3000/live/lifecycle-check");
    await connecting;
    await page.locator(".brand").click();
    await page.waitForURL("http://localhost:3000/");
    const pendingDeadline = Date.now() + 5000;
    while (liveSockets.size && Date.now() < pendingDeadline) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(liveSockets.size, 0, "pending sockets should close after their handshake completes");
    assert.ok(!(await page.evaluate(() => window.socketLifecycle)).includes(0), "navigation during a handshake must not close a CONNECTING socket");
    assert.deepEqual(warnings, [], "rapid navigation should not produce WebSocket warnings");
  } finally {
    await browser.close();
    for (const socket of sockets.clients) socket.terminate();
    await new Promise(resolve => sockets.close(resolve));
    await new Promise(resolve => server.close(resolve));
  }
});
