import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("../src/lib/api-client.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function client(api = "", ws = "") {
  const calls = [];
  const exports = {};
  runInNewContext(source, {
    exports, URL, Response, DOMException,
    process: { env: { NEXT_PUBLIC_API_URL: api, NEXT_PUBLIC_WS_URL: ws } },
    window: { location: { origin: "https://rasd.example.com" } },
    require: () => ({ standaloneResponse: () => Response.json({ preview: true }) }),
    fetch: async (...args) => { calls.push(args); return Response.json({ ok: true }); },
  });
  return { ...exports, calls };
}

test("same-origin deployments connect API, artifacts and secure live updates", async () => {
  const api = client("same-origin", "same-origin");
  assert.equal(api.isStandalone, false);
  await api.apiFetch("/api/sites", { method: "POST", body: "{}" });
  assert.equal(api.calls[0][0], "https://rasd.example.com/api/sites");
  assert.equal(api.calls[0][1].method, "POST");
  assert.equal(api.artifactUrl("artifacts/run 1/screen.png"), "https://rasd.example.com/api/artifacts/run%201/screen.png");
  assert.equal(api.liveSocketUrl("run-1"), "wss://rasd.example.com/live/run-1");
});

test("empty configuration preserves read-only standalone preview", async () => {
  const api = client();
  assert.equal(api.isStandalone, true);
  assert.equal((await api.apiFetch("/api/sites", { method: "POST" })).status, 503);
  assert.equal(api.liveSocketUrl("run-1"), null);
  assert.equal(api.calls.length, 0);
});

test("separate backend configuration keeps its original URLs", async () => {
  const api = client("https://api.example.com/", "wss://live.example.com/");
  await api.apiFetch("/api/overview");
  assert.equal(api.calls[0][0], "https://api.example.com/api/overview");
  assert.equal(api.liveSocketUrl("run-1"), "wss://live.example.com/live/run-1");
});
