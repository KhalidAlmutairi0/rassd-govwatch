import { chromium, type Browser, type BrowserServer, type CDPSession, type Locator } from "playwright";
import { promises as fs } from "node:fs";
import path from "node:path";
import { analyzePageAndCreatePlan, assessElementResult, generateFinalSummary, type AgentTestPlan, type AgentTestAction, type AgentStepResult } from "./ai-agent";
import { BrowserPolicyError, installBrowserGuards, validateInteraction } from "./browser-safety";
import { prisma } from "./prisma";
import { createEgressProxy, type ProxyFailure } from "./egress-proxy";

interface ExecutorOptions {
  url: string; runId: string; siteId: string; artifactsDir: string;
  maxElements?: number; timeoutPerElement?: number; timeoutMs?: number;
  onProgress?: (event: ProgressEvent) => void;
  onBroadcast?: (message: object) => void;
  onBrowserProcess?: (pid: number) => void;
}

export interface ProgressEvent {
  type: "load" | "analysis" | "testing" | "summary" | "complete";
  phase: string; status: "running" | "completed" | "failed" | "warning"; description: string;
  currentStep?: number; totalSteps?: number; elementType?: string; parentSection?: string; responseTimeMs?: number; data?: unknown;
}

export interface ExecutorResult {
  testPlan: AgentTestPlan; results: AgentStepResult[]; skippedUnsafe: AgentTestAction[];
  summary: string; totalDuration: number; overallStatus: "passed" | "failed" | "warning";
}

export class RunDeadlineError extends Error {}

async function semanticState(element: Locator) {
  const attributes = await Promise.all(["aria-expanded", "aria-selected", "aria-pressed", "open"].map((name) => element.getAttribute(name)));
  const input = await element.inputValue({ timeout: 100 }).catch(() => null);
  const details = await element.locator("xpath=parent::details").getAttribute("open", { timeout: 100 }).catch(() => null);
  return JSON.stringify({ attributes, input, details });
}

export async function executeAITest(options: ExecutorOptions): Promise<ExecutorResult> {
  const { url, runId, siteId, artifactsDir, maxElements = 20, timeoutPerElement = 4000 } = options;
  const startedAt = Date.now();
  const results: AgentStepResult[] = [];
  const consoleLogs: Array<{ level: string; message: string }> = [];
  const networkLogs: Array<{ url: string; status: number; durationMs: number }> = [];
  let consoleErrors: string[] = [];
  let networkErrors: string[] = [];
  let proxyFailures: ProxyFailure[] = [];
  let evidenceTruncated = false;
  let browser: Browser | undefined;
  let server: BrowserServer | undefined;
  let cdp: CDPSession | undefined;
  let proxy: Awaited<ReturnType<typeof createEgressProxy>> | undefined;
  let expired = false;
  let navigationStatus: number | undefined;
  let navigationProxyError = false;
  let navigationUrl = url;
  const refusedConnection = () => proxyFailures.some((failure) => failure.definite && new URL(failure.url).origin === new URL(navigationUrl).origin);
  const transportFailure = (error: unknown) => error instanceof Error && (/net::ERR_(CONNECTION_REFUSED|CERT_|SSL_)/.test(error.message) || (/net::ERR_/.test(error.message) && refusedConnection()));
  let testPlan: AgentTestPlan = { pageUnderstanding: { siteName: new URL(url).hostname, pageType: "homepage", language: "unknown", description: "Browser observations", descriptionAr: "ملاحظات المتصفح" }, elements: [] };
  const send = (message: object) => options.onBroadcast?.(message);
  const phase = (type: ProgressEvent["type"], description: string) => {
    options.onProgress?.({ type, phase: type, status: "running", description });
    send({ type: "run-status", status: "running", phase: description, phaseCode: type });
  };
  const checkDeadline = () => { if (expired) throw new RunDeadlineError("Browser execution deadline exceeded"); };
  const deadline = setTimeout(() => { expired = true; void server?.kill().catch(() => {}); }, Math.min(options.timeoutMs ?? 110_000, 110_000));
  const key = (name: string) => `${siteId}/${runId}/${name}`;
  const emptyResult = (action: AgentTestAction): AgentStepResult => ({
    testAction: action, status: "warning", actualBehavior: "Outcome not verified", aiAssessment: "", responseTimeMs: 0,
    screenshotBefore: "", screenshotAfter: "", urlBefore: url, urlAfter: url, urlChanged: false, consoleErrors: [], networkErrors: [],
  });
  const record = async (result: AgentStepResult) => {
    checkDeadline();
    const index = results.length;
    await prisma.$transaction([
      prisma.runStep.create({ data: {
        runId, stepIndex: index, action: result.testAction.action, description: result.testAction.element,
        selector: result.testAction.selector, status: result.status, durationMs: result.responseTimeMs,
        url: result.urlAfter || result.urlBefore,
        metadata: JSON.stringify({ urlBefore: result.urlBefore, urlAfter: result.urlAfter, urlChanged: result.urlChanged, consoleErrors: result.consoleErrors, networkErrors: result.networkErrors }),
        screenshotPath: result.screenshotAfter || null, error: result.status === "passed" ? null : result.actualBehavior,
      } }),
      prisma.elementTestResult.create({ data: {
        runId, elementType: result.testAction.type, elementText: result.testAction.element, elementSelector: result.testAction.selector,
        action: result.testAction.action, status: result.status, responseTimeMs: result.responseTimeMs,
        urlBefore: result.urlBefore, urlAfter: result.urlAfter, urlChanged: result.urlChanged,
        screenshotBefore: result.screenshotBefore || null, screenshotAfter: result.screenshotAfter || null,
        domChanges: result.actualBehavior, error: result.status === "passed" ? null : result.actualBehavior,
        consoleErrors: JSON.stringify(result.consoleErrors), networkErrors: JSON.stringify(result.networkErrors), parentSection: result.testAction.section,
      } }),
    ]);
    results.push(result);
    send({ type: "step-update", step: { index, action: result.testAction.action, description: result.testAction.element, status: result.status, durationMs: result.responseTimeMs, url: result.urlAfter || result.urlBefore, error: result.status === "passed" ? undefined : result.actualBehavior } });
  };

  try {
    await fs.mkdir(artifactsDir, { recursive: true });
    phase("load", "Opening website...");
    proxy = await createEgressProxy((failure) => { if (proxyFailures.length < 50) proxyFailures.push(failure); });
    server = await chromium.launchServer({ headless: true, timeout: 15_000, args: ["--force-webrtc-ip-handling-policy=disable_non_proxied_udp", "--disable-quic"] });
    const pid = server.process().pid;
    if (pid) options.onBrowserProcess?.(pid);
    checkDeadline();
    browser = await chromium.connect(server.wsEndpoint());
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: "ar-SA", timezoneId: "Asia/Riyadh", acceptDownloads: false, serviceWorkers: "block", proxy: proxy.settings });
    context.setDefaultTimeout(timeoutPerElement);
    context.setDefaultNavigationTimeout(20_000);
    const { page } = await installBrowserGuards(context, url, (reason) => { if (networkErrors.length < 50) networkErrors.push(reason); else evidenceTruncated = true; }, proxy.settings);
    const trace = process.env.RECORD_TRACE === "true";
    if (trace) await context.tracing.start({ screenshots: false, snapshots: true, sources: false });
    const logError = (message: string) => { if (consoleErrors.length < 50) consoleErrors.push(message.slice(0, 2000)); else evidenceTruncated = true; };
    page.on("console", (message) => {
      if (consoleLogs.length < 300) consoleLogs.push({ level: message.type(), message: message.text().slice(0, 2000) });
      else evidenceTruncated = true;
      if (message.type() === "error") logError(message.text());
    });
    page.on("pageerror", (error) => logError(error.message));
    page.on("response", (response) => {
      if (response.request().isNavigationRequest() && response.frame() === page.mainFrame()) {
        navigationStatus = response.status();
        navigationProxyError = !!response.headers()["x-rasd-proxy-error"];
      }
      if (networkLogs.length < 500) networkLogs.push({ url: response.url().slice(0, 2048), status: response.status(), durationMs: Math.max(0, response.request().timing().responseStart) });
      else evidenceTruncated = true;
      if (response.status() >= 400) {
        if (networkErrors.length < 50) networkErrors.push(`HTTP ${response.status()}: ${response.url().slice(0, 2048)}`);
        else evidenceTruncated = true;
      }
    });
    page.on("requestfailed", (request) => {
      if (networkErrors.length < 50) networkErrors.push(`${request.failure()?.errorText}: ${request.url().slice(0, 2048)}`);
      else evidenceTruncated = true;
    });
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigationUrl = request.url();
    });
    if (options.onBroadcast) {
      cdp = await context.newCDPSession(page);
      const session = cdp;
      let lastFrameAt = 0;
      session.on("Page.screencastFrame", ({ data, sessionId }) => {
        if (Date.now() - lastFrameAt >= 200 && data.length <= 350_000) {
          lastFrameAt = Date.now();
          send({ type: "browser-frame", image: `data:image/jpeg;base64,${data}` });
        }
        void session.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
      });
      await session.send("Page.startScreencast", { format: "jpeg", quality: 40, maxWidth: 1280, maxHeight: 720, everyNthFrame: 2 });
    }
    const screenshot = async (name: string) => {
      await page.screenshot({ path: path.join(artifactsDir, name), type: "jpeg", quality: 65, fullPage: false, timeout: 3000 });
      await prisma.artifact.create({ data: { runId, type: "screenshot", path: key(name), sizeBytes: (await fs.stat(path.join(artifactsDir, name))).size } });
      return key(name);
    };
    const restricted = async () => {
      const candidates = page.locator('[id*="captcha" i], [class*="captcha" i], iframe[src*="captcha" i], input[type="password"]');
      for (let i = 0, count = Math.min(await candidates.count(), 20); i < count; i++) if (await candidates.nth(i).isVisible()) return true;
      return /access denied|verify you are human|just a moment/i.test(await page.title());
    };
    const initial: AgentTestAction = { id: 0, element: "Open homepage", selector: "", type: "page", action: "navigate", isSafe: true, priority: "high", expectedBehavior: "Successful HTTP response and nonempty page title", reason: "Check page availability", section: "page" };
    const loadResult = emptyResult(initial);
    let homeUrl = url;
    let canTest = false;
    await prisma.run.update({ where: { id: runId }, data: { totalSteps: 1 } });
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded" });
      homeUrl = page.url();
      loadResult.urlAfter = homeUrl;
      loadResult.urlChanged = url !== homeUrl;
      const status = response?.status();
      if (response?.headers()["x-rasd-proxy-error"]) {
        loadResult.status = refusedConnection() ? "failed" : "warning";
        loadResult.actualBehavior = refusedConnection() ? "Target refused all connection attempts." : "Browser proxy could not verify target availability.";
      } else if (await restricted() || [401, 403, 429].includes(status || 0)) {
        loadResult.actualBehavior = "Access protection or authentication prevented testing; no bypass attempted.";
      } else if (status && status >= 400) {
        loadResult.status = "failed";
        loadResult.actualBehavior = `Homepage returned HTTP ${status}`;
      } else if (!status || !(await page.title()).trim()) {
        loadResult.actualBehavior = "Homepage availability could not be fully verified.";
      } else {
        loadResult.status = consoleErrors.length || networkErrors.length ? "warning" : "passed";
        loadResult.actualBehavior = `Homepage loaded with HTTP ${status} and a nonempty title.${loadResult.status === "warning" ? " Browser errors require review." : ""}`;
        canTest = true;
      }
    } catch (error) {
      checkDeadline();
      if (!browser.isConnected() || page.isClosed()) throw error;
      if (transportFailure(error)) loadResult.status = "failed";
      loadResult.actualBehavior = `Page availability could not be verified: ${error instanceof Error ? error.message.slice(0, 1000) : "Navigation error"}`;
    }
    loadResult.responseTimeMs = Date.now() - startedAt;
    loadResult.consoleErrors = [...consoleErrors];
    loadResult.networkErrors = [...networkErrors];
    loadResult.screenshotAfter = await screenshot("homepage.jpg").catch(() => "");
    await record(loadResult);
    if (canTest) {
      phase("analysis", "AI analyzing page...");
      const html = await page.content();
      if (html.length > 2_000_000) throw new Error("Page HTML exceeded the analysis size limit");
      testPlan = await analyzePageAndCreatePlan(Buffer.alloc(0), html, homeUrl, { title: await page.title(), lang: await page.locator("html").getAttribute("lang") || undefined });
      const candidates = testPlan.elements.slice(0, Math.min(20, Math.max(0, maxElements)));
      await prisma.run.update({ where: { id: runId }, data: { aiPageUnderstanding: JSON.stringify(testPlan.pageUnderstanding), aiTestPlan: JSON.stringify(candidates), totalSteps: candidates.length + 1 } });
      send({ type: "test-plan", totalSteps: candidates.length + 1 });
      for (const action of candidates) {
        checkDeadline();
        const index = results.length;
        const result = emptyResult(action);
        const stepStartedAt = Date.now();
        send({ type: "step-update", step: { index, action: action.action, description: action.element, status: "running" } });
        try {
          if (!action.isSafe) throw new BrowserPolicyError("Unsafe candidate skipped before interaction");
          if (page.url() !== homeUrl) await page.goto(homeUrl, { waitUntil: "domcontentloaded" });
          if (await restricted()) throw new BrowserPolicyError("Access protection prevented testing");
          const element = page.locator(action.selector);
          if (await element.count() !== 1 || !await element.isVisible()) throw new BrowserPolicyError("Candidate hidden or ambiguous; no interaction attempted");
          await validateInteraction(element, action.action, homeUrl);
          await element.scrollIntoViewIfNeeded();
          const box = await element.boundingBox();
          if (box) send({ type: "cursor_move", data: { x: box.x + box.width / 2, y: box.y + box.height / 2, elementText: action.element, elementType: action.type } });
          result.screenshotBefore = await screenshot(`step-${index}-before.jpg`).catch(() => "");
          result.urlBefore = page.url();
          const before = await semanticState(element);
          consoleErrors = [];
          networkErrors = [];
          proxyFailures = [];
          navigationStatus = undefined;
          navigationProxyError = false;
          const interactionStartedAt = Date.now();
          if (box) send({ type: "cursor_click", data: { x: box.x + box.width / 2, y: box.y + box.height / 2 } });
          if (action.action === "click") await element.click({ timeout: timeoutPerElement });
          else if (action.action === "hover") await element.hover({ timeout: timeoutPerElement });
          else if (action.action === "type") await element.fill(testPlan.pageUnderstanding.language.startsWith("ar") ? "خدمات" : "services", { timeout: timeoutPerElement });
          else throw new BrowserPolicyError("Unsupported read-only action");
          let observedChange = false;
          const observeUntil = Date.now() + Math.min(timeoutPerElement, 1500);
          do {
            if (page.url() !== result.urlBefore) break;
            observedChange = before !== await semanticState(element);
            if (observedChange) break;
            await page.waitForTimeout(100);
          } while (Date.now() < observeUntil);
          await page.waitForLoadState("domcontentloaded", { timeout: timeoutPerElement });
          result.urlAfter = page.url();
          result.urlChanged = result.urlBefore !== result.urlAfter;
          result.responseTimeMs = Date.now() - interactionStartedAt;
          result.consoleErrors = [...consoleErrors];
          result.networkErrors = [...networkErrors];
          const assessment = await assessElementResult(action, Buffer.alloc(0), Buffer.alloc(0), { ...result, observedChange, navigationStatus, proxyError: navigationProxyError, targetConnectionRefused: navigationProxyError && refusedConnection(), accessRestricted: await restricted(), pageTitle: await page.title() });
          result.status = assessment.status;
          result.actualBehavior = assessment.assessment;
          result.aiAssessment = assessment.assessment;
          result.screenshotAfter = await screenshot(`step-${index}-after.jpg`).catch(() => "");
        } catch (error) {
          checkDeadline();
          if (!browser.isConnected() || page.isClosed()) throw error;
          result.status = error instanceof BrowserPolicyError ? "skipped" : transportFailure(error) ? "failed" : "warning";
          result.actualBehavior = error instanceof Error ? error.message.slice(0, 2000) : "Interaction could not be verified";
          result.responseTimeMs = Date.now() - stepStartedAt;
        }
        await record(result);
        await page.waitForTimeout(100);
      }
    }
    phase("summary", "Generating AI summary...");
    if (cdp) await cdp.send("Page.stopScreencast").catch(() => {});
    for (const [name, data] of [["console.json", consoleLogs], ["network.json", networkLogs]] as const) {
      await fs.writeFile(path.join(artifactsDir, name), JSON.stringify(data));
      await prisma.artifact.create({ data: { runId, type: name.split(".")[0], path: key(name) } });
    }
    if (trace) {
      await context.tracing.stop({ path: path.join(artifactsDir, "trace.zip") });
      await prisma.artifact.create({ data: { runId, type: "trace", path: key("trace.zip") } });
    }
    await context.close();
    await browser.close();
    await server.close();
    options.onBrowserProcess?.(0);
    const summary = await generateFinalSummary(testPlan.pageUnderstanding, results, Date.now() - startedAt);
    checkDeadline();
    const overallStatus = results.some((r) => r.status === "failed") ? "failed" : evidenceTruncated || results.length <= 1 || results.some((r) => r.status !== "passed") ? "warning" : "passed";
    return { testPlan, results, skippedUnsafe: testPlan.elements.filter((a) => !a.isSafe), summary, totalDuration: Date.now() - startedAt, overallStatus };
  } finally {
    clearTimeout(deadline);
    if (cdp) await cdp.send("Page.stopScreencast").catch(() => {});
    await browser?.close().catch(() => {});
    await server?.close().catch(() => {});
    options.onBrowserProcess?.(0);
    await proxy?.close();
  }
}
