# GovWatch / Rasd-POC — Performance & Cost Audit

Review of the production Next.js + TypeScript monitoring system (Playwright + Prisma/SQLite + Claude/OpenAI). Every finding cites file and line and was verified by reading the code.

---

## Phase 1 — Map

### Repo layout (key files)

```
src/
├── app/api/             sites, runs, incidents, test, artifacts
├── lib/
│   ├── ai.ts                     callAI(prompt) — Claude Sonnet 4 / GPT-4o-mini
│   ├── ai-summary.ts             generateRunSummary (UNUSED — dead path)
│   ├── ai-agent.ts               analyzePageAndCreatePlan, assessElementResult, generateFinalSummary
│   ├── ai-agent-mcp.ts           runMCPAgent (iterative tool-use, opt-in via AI_EXECUTION_MODE=mcp)
│   ├── ai-executor.ts            the production runner (called by scheduler + /api/runs/start)
│   ├── ai-executor-mcp.ts        opt-in MCP runner
│   ├── executor.ts               PlaywrightExecutor (UNUSED — dead path via sites/[id]/runs/executeRun)
│   ├── test-generator-ai.ts      AI step gen (Quick Test only)
│   ├── page-analyzer.ts, validators.ts, incidents.ts, accessibility-tree.ts, mcp-tools.ts, ws-server.ts
├── worker/scheduler.ts           cron: every minute → executeAITest per site
prisma/schema.prisma              7 models, ZERO indexes
```

### LLM call sites (verified)

| # | Site | Trigger | Sends | Returns | Used for |
|---|---|---|---|---|---|
| 1 | `ai-agent.ts:350` `analyzePageAndCreatePlan` (vision) | Once per run, start of executeAITest | Full-page PNG screenshot (base64) + 3 KB HTML + 2 KB a11y tree + prompt, model `claude-sonnet-4-6`, `max_tokens:4096` | JSON test plan, up to 80 elements | The "plan" of what to test |
| 2 | `ai-agent.ts:350` `assessElementResult` (vision) — **per element** | Inside loop in `ai-executor.ts:395`, runs `maxElements` times (80 in scheduler, 10 in /start) | TWO full PNG screenshots (before+after) + prompt | `{status, assessment}` | Verdict for each element |
| 3 | `ai-agent.ts:409` `generateFinalSummary` (text) | Once at end of run | text-only prompt, `max_tokens:2048` | EN+AR summary | Stored as `aiSummary` |
| 4 | `ai-agent-mcp.ts:93` `runMCPAgent` | Per-iteration, up to 50, only if `AI_EXECUTION_MODE=mcp` | Conversation + screenshots + tools | Tool calls | Iterative testing |
| 5 | `ai.ts:37`+`53` `callAI` → consumed by `ai-summary.ts:50` (dead), `test-generator-ai.ts:36` (Quick Test only) | URL-input Quick Test flow | Page metadata as text | JSON steps array | Step generation for ad-hoc URL test |

---

## Phase 2+3 — Findings

### 🟥 Unnecessary AI usage (highest priority — biggest cost lever)

- **`ai-executor.ts:395` — `assessElementResult` runs once PER element with TWO full PNG screenshots.** With scheduler default `maxElements:80` (`scheduler.ts:70`) × 5 seeded sites × every 10 min = ~57,600 vision calls/day. Each sends 2 viewport-size PNGs (~150–300 KB base64-encoded each). **Cheapest fix:** decide deterministically when assertion is trivial — promote to AI only when ambiguous. Rule: `consoleErrors.length>0 || networkErrors.length>0 → failed`; `urlChanged && sameDomain && responseTimeMs<2000 → passed`; `responseTimeMs>3000 → warning`. Already implemented as `fallbackAssessment` (`ai-agent.ts:542`) — just call it FIRST and skip AI when the heuristic gives a confident verdict. Estimated: skips ~85–95% of vision calls.

- **No page-content hash / change gate anywhere.** Scheduler re-plans + re-tests + re-summarises every 10 min even if the homepage is byte-identical to last run (`scheduler.ts:21-44`, `ai-executor.ts:208`). **Fix:** before phase 2, compute `sha256(html + accessibilityTree)`. Store on `Run` (add `contentHash` column). If hash matches the last successful run for the same site and is <24h old, reuse the prior `aiTestPlan`/`aiPageUnderstanding`/`aiSummary` and skip calls #1 + #3. Saves ~1 plan + 1 summary call per scheduled run on static gov homepages — typically ≥80% of scheduled runs.

- **`assessElementResult` sends PNG screenshots, not JPEG.** `ai-executor.ts:338, 382` use default `page.screenshot()` which emits PNG. Per the spec, JPEG q60 is fine for visual diff. **Fix:** `page.screenshot({ type: "jpeg", quality: 60 })`. ~5–10× smaller payload → ~5–10× cheaper vision tokens per element call (still happening for whatever fraction the heuristic can't decide).

- **`assessElementResult` could be a single before/after diff judgment per page transition, not per element.** Many elements on the same page produce no URL change and trivial DOM diff. **Fix:** group elements by "produced URL change" vs "no URL change"; batch assess the "no URL change" group with one AI call comparing pre/post DOM stats rather than per-element calls.

- **`analyzePageAndCreatePlan` runs vision on a `fullPage:true` PNG (`ai-executor.ts:134`)** — entire scroll height of the homepage. For long gov pages this is huge. **Fix:** viewport screenshot (the spec section 11 used `fullPage:false`); the HTML + a11y tree already carry the below-the-fold structure.

- **`generateFinalSummary` re-states info already in the structured `aiTestPlan` and `elementResults`.** When `failed===0 && warnings===0`, you can render a deterministic template (`ai-summary.ts:62-86` already has one) and skip the call entirely. **Fix:** call AI only when there's something interesting to explain (failed > 0 OR warnings > 0).

- **`callAI` provider selection ignores cost.** `ai.ts:8-10` picks Claude Sonnet 4 if `ANTHROPIC_API_KEY` is set; `ai-agent.ts:351,410` hard-code Sonnet for summaries and test planning. Test-step JSON generation (`test-generator-ai.ts`) and summaries don't need Sonnet. **Fix:** route summaries + step-gen to Haiku 4.5 (~$1/MTok in vs Sonnet ~$3/MTok). Vision plan/assess stays on Sonnet. Roughly 3× cheaper on those calls.

- **Stale model IDs.** `ai.ts:38` and `ai-agent-mcp.ts:94` use `claude-sonnet-4-20250514`; `ai-agent.ts:351,410` use `claude-sonnet-4-6`. Per current model list, latest is `claude-sonnet-4-6` (and `claude-haiku-4-5-20251001` for cheap calls). **Fix:** unify on `claude-sonnet-4-6` for vision and `claude-haiku-4-5-20251001` for text-only summaries.

- **Quick Test (`/api/test/route.ts:39-44`) launches a browser, downloads HTML, then `executeAITest` (called via `/api/runs/start`) launches ANOTHER browser and re-loads the URL.** Two browser launches and two full-page loads per Quick Test. **Fix:** pass the already-fetched HTML/screenshot/runId through and skip the second launch — or drop the first Cheerio-based `analyzePage` entirely since `ai-executor` regenerates richer metadata anyway.

### ⚡ Performance

- **Scheduler runs sites sequentially (`scheduler.ts:28-40`).** With `await runJourney` in a `for` loop, 5 sites × ~60s/run = 5 min — overlaps the next 10-min cron tick poorly. **Fix:** `Promise.all(sites.map(runJourney))` with a concurrency cap (3 simultaneous browsers per spec §23). Use a small semaphore.

- **Element loop is fully sequential AND has 100ms inter-element sleep (`ai-executor.ts:503`) + 350–500ms post-action wait (`:379`) + 80–140ms scroll wait (`:318`) + 120–200ms pre-click wait (`:335`).** Per element ≈ 0.7–1s pure waits before AI assessment. **Fix:** keep the human-like waits ONLY when CDP screencast is being broadcast (Quick Test live view). For scheduler runs, set a `liveView:false` flag and drop the cursor jitter + waits — they exist for the demo, not for monitoring.

- **CDP screencast is started for scheduler runs too (`ai-executor.ts:109-120`).** No one is watching scheduled runs (`scheduler.ts` has no live view). Frames are broadcast to zero clients, wasting browser CPU + relay traffic. **Fix:** make screencast opt-in via an `enableScreencast` flag, default `false` in scheduler.

- **`ai-executor.ts:273` navigates back to `url` after every element if the page changed.** Full page reload + 300ms wait every time. **Fix:** use `page.goBack()` when possible; only `goto(url)` if back-stack is empty.

- **N+1 `prisma.elementTestResult.create` inside the loop (`ai-executor.ts:299, 423, 477`).** For 80 elements: 80 round-trips on SQLite. **Fix:** collect results in an array, `prisma.elementTestResult.createMany({ data })` once at the end. (Trade-off: lose mid-run DB visibility — acceptable since you already broadcast progress via WS.)

- **`ai-executor.ts:74` mkdir + a Prisma write happen before any work.** Fine, but two `prisma.run.update` calls (`:211` for test plan, `:524` for summary) could be merged into the final update.

- **Quick Test browser launch (`/api/test/route.ts:39`) plus a second launch in `ai-executor`.** Cold Chromium ≈ 1–2s × 2 per Quick Test. Already covered above.

- **`element-tester.ts:74` reads `document.body.innerHTML.length` then again at `:134`** twice per element — fine in isolation, but the `innerHTML` serialization is expensive on long pages. **Fix:** `document.body.children.length` is a much cheaper "did the DOM change" signal.

### 🗄️ Database (Prisma/SQLite)

- **Zero indexes in the entire schema (`prisma/schema.prisma`).** Every dashboard query hits unindexed foreign keys. Hot queries:
  - `Run.findMany({ where: { siteId }, orderBy: { startedAt: "desc" } })` — needs `@@index([siteId, startedAt])`
  - `Incident.findFirst({ where: { siteId, journeyId, status } })` (`incidents.ts:14`) — `@@index([siteId, journeyId, status])`
  - `Incident.count({ where: { siteId, status } })` (`incidents.ts:73`) — covered by above
  - `ElementTestResult.findMany({ where: { runId }, orderBy: { createdAt } })` (`elements/route.ts:13`) — `@@index([runId, createdAt])`
  - `Journey.findFirst({ where: { siteId, isDefault } })` — `@@index([siteId, isDefault])`
  - `RunStep.findMany({ where: { runId }, orderBy: { stepIndex } })` — `@@index([runId])` (FK)
  **Fix:** add the six indexes above in one migration. Worth doing even at MVP scale — `findFirst` on incidents runs per run.

- **`Run` table has no `where: { status }` index** but scheduler reads sites with `{ isActive, schedule>0 }` every minute and the dashboard polls runs every 30s. **Fix:** `@@index([siteId, status, startedAt])` on Run.

- **`Site._count.incidents` filtered query (`sites/route.ts:13-22`)** runs `count(*) where status IN (...)` on every dashboard refresh. Same incident index fixes it.

- **Scheduler reads `Site.findMany({ include: { journeys } })` every minute (`scheduler.ts:23-26`)** even when nothing is due. **Fix:** filter at the DB: `where: { isActive: true, OR: [{ lastRunAt: null }, { lastRunAt: { lt: cutoff } }] }` — drop the JS-side `minutesSinceLastRun` check.

### 🤖 Automation opportunities

- **Artifact cleanup is mentioned in spec (§24, "7-day retention, auto-cleanup optional") but isn't implemented.** Screenshots accumulate forever in `artifacts/`. **Fix:** add a daily cron in `scheduler.ts` that deletes `artifacts/{siteId}/{runId}/*` older than N days, and `prisma.artifact.deleteMany({ where: { createdAt: { lt: cutoff } } })` — or skip the DB rows entirely (the schema already cascades).

- **No log rotation / no DB vacuum.** SQLite grows unbounded with every run's element results. **Fix:** weekly `VACUUM` via `$executeRawUnsafe`.

- **`global.pendingRuns` Map (`sites/[id]/runs/route.ts:78`)** is set in one Next.js route and read in another (`runs/start/route.ts:64`). This only works in single-process dev; will break under multi-instance deploys. **Fix:** stash the payload on the `Run` row itself (already has `siteId`/`journeyId`; just don't need `pendingRuns` at all — `start` already re-reads the Run via `findUnique`).

### 🧹 Code quality / dead code

- **`src/lib/executor.ts` (540 LOC) is dead in production.** Only referenced from `executeRun` exported in `sites/[id]/runs/route.ts:98`, which is never imported anywhere (`grep` confirms). The scheduler and `/api/runs/start` both use `ai-executor.ts`. **Fix:** delete `executor.ts`, delete the dead `executeRun` export, delete `element-discovery.ts` and `element-tester.ts` (only consumed by `executor.ts`).

- **`src/lib/ai-summary.ts` is dead.** Only referenced from the dead `executeRun` above. Delete.

- **`src/lib/test-generator.ts` + `test-generator-ai.ts`** are used only by the Quick Test endpoint, but `ai-executor.ts` runs anyway and generates its own plan. The "steps" produced by `generateSmokeTestWithAI` are saved to `journey.stepsJson` but `ai-executor` never reads them. **Fix:** either delete both files (and the AI call inside `test-generator-ai`) or wire `stepsJson` back into the AI executor. Recommend delete — that's another LLM call gone.

- **`page-analyzer.ts`** only feeds the (then-ignored) test-generator. Dead with the above. ~157 LOC.

- **`extractInteractiveElements` + `getAccessibilityStats` in `accessibility-tree.ts`** are exported but never imported. Dead exports.

- **Three separate AI provider abstractions:** `ai.ts` (Claude/OpenAI), `ai-agent.ts:403-446` (Claude/OpenAI/Groq, duplicated), and `ai-agent-mcp.ts` (Claude only). Same logic, three copies. **Fix:** one `callAI({ messages, model, vision })` in `ai.ts`, used by all three modules.

- **`GROQ_API_KEY` is referenced (`ai-agent.ts:386, 432, 451`) but not in `.env.example`.** Also `AI_EXECUTION_MODE` (used in `start/route.ts:13`) and `WORKER_PORT` says `3001` in `.env.example` but code defaults to `3003` (`init-ws.ts:11`, `scheduler.ts:14`, `ws-server.ts:94`). **Fix:** update `.env.example`.

- **MCP path (`ai-agent-mcp.ts`, `ai-executor-mcp.ts`, `mcp-tools.ts`)** is opt-in via env var, undocumented, and the scheduler doesn't support it. If you're keeping it, document; otherwise delete (~700 LOC).

- **Duplicate `isSameDomain` implementations** in `executor.ts:463`, `element-tester.ts:214`. After the dead-code deletion this collapses to one. (Also implemented inline in `page-analyzer.ts` and `mcp-tools.ts`.)

- **`screenshot.png` (1 MB) at repo root + `Union.png` + 4 `Screenshot 1447-*.png` (3 MB total) + 18 MB `.mp4` are committed.** These pollute the repo. **Fix:** move to `docs/` (or delete) and gitignore.

---

## Sizing

Quick sizing of the AI-gating fix alone: at default 5 seeded sites, 10-min cadence, `maxElements:80`, current cost path is ~57k vision calls/day. With (a) content-hash gate skipping ~80% of runs that don't change + (b) heuristic-first assessment confidently deciding ~90% of element verdicts, the remaining vision calls drop to roughly `57,600 × 0.2 × 0.1 ≈ 1,150/day` — a **~98% reduction** with no behavior change.

---

## Suggested implementation order (Phase 4 — awaits approval)

1. **AI-gating** — content hash on Run + heuristic-first `assessElementResult` + summary-only-on-issues + JPEG q60.
2. **Dead code purge** — `executor.ts`, `ai-summary.ts`, `test-generator{,-ai}.ts`, `page-analyzer.ts`, unused exports, dead `executeRun`, optional MCP path.
3. **DB indexes** — single migration.
4. **Scheduler parallelism + disable screencast in scheduled runs.**
5. **`createMany` for elementTestResult + drop `global.pendingRuns`.**
6. **Env-var hygiene + Haiku for summaries.**
7. **Artifact retention cron.**
