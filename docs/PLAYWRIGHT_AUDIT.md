# GovWatch / Rasd-POC — Playwright & Element-Discovery Audit

Focused review of the browser-automation layer: how elements are discovered, how clicks happen, how waits are sequenced. Every claim cites file and line and was verified by reading the code.

---

## Phase 1 — Current state

### Files involved

| File | Role |
|---|---|
| `src/lib/ai-executor.ts` | Production runner — launches browser, takes screenshot, calls AI for plan, executes per-element loop |
| `src/lib/ai-agent.ts` | AI prompts; AI returns elements with AI-invented CSS selectors |
| `src/lib/accessibility-tree.ts` | Playwright a11y snapshot helpers — incl. **`extractInteractiveElements` (currently unused)** |
| `src/lib/mcp-tools.ts` | MCP tool implementations (opt-in path) — already uses `getByRole` |
| `src/lib/element-discovery.ts` | Older heuristic discoverer (**dead** — only the AI path runs) |
| `src/lib/element-tester.ts` | Element click+screenshot helper (**dead** — only the AI path runs) |
| `src/lib/executor.ts` | Deterministic executor (**dead**) |

### How each call site identifies an element

| Site | How it picks the element | Signal |
|---|---|---|
| `ai-executor.ts:208` (plan) | AI vision sees a screenshot + 3 KB HTML dump + a11y tree → emits CSS selector strings | Vision-guessed selector |
| `ai-executor.ts:279` `findElement` priority order | 1) `page.locator(AI_selector).first()` → 2) `getByText(stripped_label)` → 3) `getByRole(mapped_role, {name})` | AI selector FIRST, semantic LAST |
| `ai-executor.ts:321-326` cursor calc | `element.boundingBox()` → mouse coords | Pixel coordinates |
| `ai-executor.ts:354-356` actual click | `page.mouse.down()` / `mouse.up()` at coords (NOT `element.click()`) | Mouse-at-coords, no auto-wait |
| `ai-executor.ts:362-368` type action | `element.click()` then `page.keyboard.type(...)` | Element-based, OK |
| `element-tester.ts:94-109` (dead) | `page.locator(element.selector).click({ timeout: 5000 })` | Element-based, OK |
| `mcp-tools.ts:206-226` | `getByRole(role, {name: regex})` → `getByText` → `locator(selector)` | Semantic FIRST, correct pattern |
| `ai-agent.ts:528` fallback | Generates `${tag}:contains("${text}")` | **Invalid** — `:contains()` is jQuery, not Playwright CSS |

### Fragility points — every one verified

- **`ai-executor.ts:354-356`** — `page.mouse.down()`/`up()` at pixel coords. Bypasses Playwright's actionability auto-wait. If the page reflows (image loads above the fold, a banner appears) between `boundingBox()` at `:321` and `mouse.up()` at `:356`, the click lands on the wrong target.
- **`ai-executor.ts:279-280`** — `findElement` tries the **AI-generated selector first**. AI selectors are stringified guesses; if they're slightly wrong, two semantic fallbacks fire but their `isVisible({ timeout: 2000 })` racks up 2–4s of dead time per element. Reverse the priority.
- **`ai-agent.ts:528`** — fallback path emits `${tag}:contains("${text}")`. Playwright's CSS engine does not support `:contains()`; only `:has-text()`. Every fallback selector currently fails the `locator()` call.
- **`element-discovery.ts:238`** (dead but cited) — `:nth-child(N)` last-resort selector. Breaks the moment a sibling is added.
- **`element-discovery.ts:209-242`** (dead) — `buildUniqueSelector` reads `el.className` and joins on `.`. Tailwind / CSS-Modules class names regenerate per build (`.css-xyz123` etc), so the selector is non-stable across deploys.
- **`element-tester.ts:118`** — fixed `waitForTimeout(1500)`. Same problem repeats in `ai-executor.ts:124, 275, 318, 335, 355, 360, 364, 371, 379, 503` and `mcp-tools.ts:182, 254, 258, 288, 310`. None of these are state-based.
- **`mcp-tools.ts:181`** — `waitUntil: "networkidle"` PLUS `waitForTimeout(2000)`. Belt-and-suspenders, both wrong: `networkidle` is flaky (any analytics beacon defers it indefinitely), and the 2s is dead weight on top.
- **`ai-executor.ts:74` mkdir + `:211` first run.update + `:524` second run.update** — three writes that interleave with browser work; not Playwright fragility but adds wall time.
- **`ai-executor.ts:139-186`** — re-discovers interactive elements via `page.evaluate(document.querySelectorAll(...))` to feed the AI prompt, while `accessibility-tree.ts:78 extractInteractiveElements` already exposes the same list semantically. We're using Playwright's a11y tree for "context for AI to read" but NOT for "list of things to click."
- **`ai-executor.ts:273-275`** — every URL-changing element triggers a full `page.goto(url)` reload. Discards browser cache and incurs full DOM rebuild; `page.goBack()` is one BFCache pop.
- **`ai-executor.ts:288` (within AI fallback path)** — `selector: href ? a[href="${href}"] : ${tag}:contains("${text.slice(0,20)}")`. The href version is fine; the `contains` version is the broken-by-design path above.

---

## Phase 2-4 — Proposed improvements (sorted by impact)

### A. Discovery — stop using vision to find clickable elements

- **`ai-executor.ts:139-186` + `ai-agent.ts:55-182`** — vision currently picks the elements. **Fix:** call `extractInteractiveElements(accessibilityTree)` (already exists at `accessibility-tree.ts:78`) to enumerate `{role, name, path}` for every actionable node. That list IS the test plan. Vision keeps its role only for the visual verdict (`assessElementResult`), not for identifying targets. Output shape unchanged — we still hand the executor the same `AgentTestPlan` interface, we just build it deterministically instead of asking the LLM to guess.
  Tradeoff: lose AI's prioritization wisdom. Mitigate with a small deterministic sort (nav/header > main > footer; high priority for items with role `searchbox`/`combobox`/`button`).

- **`ai-executor.ts:279 findElement` priority order** — invert it: `getByRole(role, {name})` → `getByLabel(name)` → `getByTestId(...)` → `getByText(name, { exact: true })` → AI selector last. Stable locators try first.
  Tradeoff: if discovery already produced `{role, name}`, the AI selector branch will rarely fire; that's the goal.

- **`ai-agent.ts:528` fallback selector** — replace `:contains(...)` with `:has-text(...)` (Playwright's engine extension) OR drop selector strings entirely and emit `{role, name}` instead, consumed by the new locator builder above. **Fix immediately even if you don't accept the bigger refactor** — the current code path silently fails.

- **Duplicate handling** — when `getByRole(role, {name}).count() > 1`, scope within `parentSection`: `page.locator('nav').getByRole('link', {name}).first()`. The parent section is already known from `accessibility-tree.ts:91-101` traversal. No nth-child anywhere.

- **Un-locatable elements** — print the `{role, name, section}` to a `unstable_elements.json` artifact and SKIP the element with `status: "skipped"`. Never fall back to coordinates.

### B. Waits — state-based, drop timeouts

- **All `waitForTimeout` calls** (counts: `ai-executor.ts` ×8, `element-tester.ts` ×3, `mcp-tools.ts` ×4, `ai-executor-mcp.ts` ×1) — replace each with a specific state:
  - After click that may navigate: `await Promise.race([page.waitForLoadState('domcontentloaded'), page.waitForTimeout(1500)])` then `expect(page).toHaveURL(...)` or `locator.waitFor({state:'visible'})`.
  - After scroll: drop — Playwright's `click()` auto-scrolls and auto-waits already.
  - Before click (`ai-executor.ts:318, 335`): drop. `locator.click()` waits for actionability.
  - "Page settling" (`mcp-tools.ts:182, 258`): replace `networkidle + sleep(2000)` with `domcontentloaded` only. Government sites often have third-party beacons that keep network busy forever.

- **`ai-executor.ts:354-356`** — replace `mouse.down/up` at coords with `element.click({ trial: false })`. The cursor visualization stays (it's broadcast over WS), but the actual click goes through Playwright's actionability path.
  Output unchanged. Tradeoff: cursor visual on the live view will no longer perfectly match every physical click. Mitigate by emitting `cursor_click` AFTER `click()` resolves rather than during.

- **Live-view-only waits** — wrap the human-like jitter (`ai-executor.ts:318, 335, 355, 360, 364, 371, 379`) in `if (opts.liveView) { ... }`. Scheduler runs pass `liveView: false`; Quick Test passes `true`. Saves ~0.7–1s per element on monitoring runs with zero behavior change for the demo path.

### C. Speed

- **Discovery cached, not re-queried** — today every element does fresh `page.locator(...)` and `findElement` fallbacks. **Fix:** after discovery, hold `Locator` objects in memory in the same order they'll be tested. Per-element work becomes one `locator.click()` and one `page.url()` read.

- **`page.goBack()` instead of `page.goto(url)`** at `ai-executor.ts:273-275`. Falls back to `goto(url)` only when `page.goBack({timeout: 3000})` rejects. Saves a full page load each time.

- **Batch DOM stat reads** at `element-tester.ts:74, 134` — replace `document.body.innerHTML.length` (serializes the whole DOM) with `document.body.children.length` AND fold into a single `page.evaluate` returning `{url, dom, title}` once before and once after, instead of three separate trips.

- **`networkidle` → `domcontentloaded`** at `mcp-tools.ts:181`, `ai-executor-mcp.ts:93`. The current setting wastes seconds on gov sites with tracking pixels. The spec already prefers `domcontentloaded` everywhere else (`ai-executor.ts:123`).

- **Re-use one browser per scheduler tick** — `ai-executor.ts:85` launches a fresh Chromium per run. Across 5 sites that's 5 cold starts per cycle. Hold one `Browser` in module scope inside the scheduler and call `browser.newContext()` per run. Tradeoff: context bleed if a site mis-handles cookies — mitigated by `newContext()` per run, which is isolated.

---

## Phase 5 — Suggested implementation order (awaiting approval)

1. **A** (semantic discovery + invert `findElement` priority + fix `:contains()`) — biggest accuracy win.
2. **B** (state-based waits + element-based clicks + `liveView` flag) — biggest stability win.
3. **C** (cached locators, `goBack`, single browser reuse, `domcontentloaded`) — biggest speed win.

Nothing will be changed before explicit approval. Reply with "all", "A only", "A and B", or pick individual bullets.
