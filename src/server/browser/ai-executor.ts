// src/lib/ai-executor.ts
// AI Execution Engine — Runs AI's test plan with Playwright

import { Browser, Page, chromium, CDPSession } from "playwright";
import { analyzePageAndCreatePlan, assessElementResult, generateFinalSummary, tryConfidentAssessment, templateSummary, AgentTestPlan, AgentTestAction, AgentStepResult } from "@/server/ai/ai-agent";
import { prisma } from "@/server/db/prisma";
import { promises as fs } from "fs";
import path from "path";
import { createHash } from "crypto";
import { getAccessibilityTree, formatAccessibilityTree } from "@/server/browser/accessibility-tree";


function parseSummaryText(raw: string): {
  executive: string | null;
  executiveAr: string | null;
  recommendations: string[];
  text: string;
} {
  const text = raw.trim();

  // Split on Arabic/English section headers
  const arabicHeaders = [
    /arabic\s+summary/i,
    /الملخص\s+العربي/,
    /الملخص\s+التنفيذي/,
    /العربية[:\s]/,
    /باللغة\s+العربية/,
  ];
  const englishHeaders = [
    /english\s+summary/i,
    /executive\s+summary/i,
  ];

  let englishPart = "";
  let arabicPart = "";

  // Find the split point between English and Arabic sections
  let splitIndex = -1;
  for (const re of arabicHeaders) {
    const m = text.search(re);
    if (m > 0) {
      splitIndex = m;
      break;
    }
  }

  if (splitIndex > 0) {
    englishPart = text.slice(0, splitIndex);
    arabicPart = text.slice(splitIndex);
  } else {
    // Fallback: detect first Arabic character block as the split point
    const arabicCharRun = text.search(/[؀-ۿ]{10,}/);
    if (arabicCharRun > 0) {
      // Walk back to the start of the line
      const lineStart = text.lastIndexOf("\n", arabicCharRun);
      splitIndex = lineStart > 0 ? lineStart : arabicCharRun;
      englishPart = text.slice(0, splitIndex);
      arabicPart = text.slice(splitIndex);
    } else {
      englishPart = text;
    }
  }

  // Strip header lines from each section
  function stripHeaders(s: string): string {
    return s
      .replace(/^(english\s+summary|executive\s+summary|arabic\s+summary|الملخص\s+العربي|الملخص\s+التنفيذي|العربية)\s*[:.]?\s*/gim, "")
      .replace(/^\s*[-=]+\s*/gm, "")
      .trim();
  }

  const executive = stripHeaders(englishPart) || null;
  const executiveAr = stripHeaders(arabicPart) || null;

  // Extract numbered recommendations from the English section
  const recommendations: string[] = [];
  const recPattern = /^\d+[\.\)]\s*(.+)/gm;
  let match;
  while ((match = recPattern.exec(englishPart)) !== null) {
    const line = match[1].trim();
    if (line.length > 10) recommendations.push(line);
  }

  return { executive, executiveAr, recommendations, text };
}

interface ExecutorOptions {
  url: string;
  runId: string;
  siteId: string;
  artifactsDir: string;
  maxElements?: number;
  timeoutPerElement?: number;
  /**
   * When false (scheduler), skips CDP screencast, cursor broadcasts and
   * human-like jitter waits — nobody is watching so they're pure overhead.
   * Defaults to true (live Quick Test / manual run).
   */
  liveView?: boolean;
  onProgress?: (event: ProgressEvent) => void;
  onBroadcast?: (msg: object) => void;  // Send WS messages to live viewers
}

export interface ProgressEvent {
  type: "load" | "analysis" | "testing" | "summary" | "complete";
  phase: string;
  status: "running" | "completed" | "failed" | "warning";
  description: string;
  currentStep?: number;
  totalSteps?: number;
  elementType?: string;
  parentSection?: string;
  responseTimeMs?: number;
  data?: any;
}

export interface ExecutorResult {
  testPlan: AgentTestPlan;
  results: AgentStepResult[];
  skippedUnsafe: AgentTestAction[];
  summary: string;
  totalDuration: number;
  overallStatus: "passed" | "failed" | "warning";
}

// Tiny jitter helper — makes cursor land slightly off-center like a human
function jitter(n: number, range = 4): number {
  return n + Math.round((Math.random() - 0.5) * range);
}

export async function executeAITest(options: ExecutorOptions): Promise<ExecutorResult> {
  const {
    url, runId, siteId, artifactsDir,
    maxElements = 80,
    timeoutPerElement = 5000,
    liveView = true,
    onProgress,
    onBroadcast,
  } = options;

  const send = (msg: object) => { if (onBroadcast) onBroadcast(msg); };

  const emit = (event: ProgressEvent) => {
    if (onProgress) onProgress(event);
  };

  let browser: Browser | null = null;
  let page: Page | null = null;
  let cdpSession: CDPSession | null = null;

  const results: AgentStepResult[] = [];
  const consoleLogBuffer: Array<{ level: string; message: string; timestamp: number }> = [];
  const unstableElements: Array<{
    element: string;
    type: string;
    selector: string;
    section: string;
    page: string;
    reason: string;
  }> = [];

  try {
    // Ensure artifacts directory exists
    await fs.mkdir(artifactsDir, { recursive: true });

    // ─────────────────────────────────────────
    // PHASE 1: Load the page
    // ─────────────────────────────────────────
    emit({
      type: "load",
      phase: "load",
      status: "running",
      description: "Opening website..."
    });

    console.log(`[BROWSER] Playwright Chromium: ${chromium.executablePath()}`);
    console.log(`[BROWSER] Launching browser...`);

    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--no-zygote",
      ],
    });
    console.log(`[BROWSER] Browser launched OK`);

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      locale: "ar-SA",
      timezoneId: "Asia/Riyadh",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    });

    page = await context.newPage();
    console.log(`[BROWSER] Page created, starting screencast...`);

    // Collect console logs
    page.on("console", (msg) => {
      consoleLogBuffer.push({
        level: msg.type(),
        message: msg.text(),
        timestamp: Date.now(),
      });
    });

    // ── Start CDP Screencast only when a live viewer is attached ──
    if (liveView) {
      cdpSession = await page.context().newCDPSession(page);
      await cdpSession.send("Page.startScreencast", {
        format: "jpeg",
        quality: 40,
        maxWidth: 1280,
        maxHeight: 720,
        everyNthFrame: 2,
      });
      cdpSession.on("Page.screencastFrame", async ({ data, sessionId }: any) => {
        send({ type: "browser-frame", image: `data:image/jpeg;base64,${data}` });
        await cdpSession!.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
      });
    }

    // Navigate to URL — use "commit" (first byte received) so we don't hang on slow SPAs
    console.log(`[BROWSER] Navigating to ${url}...`);
    try {
      await page.goto(url, { waitUntil: "commit", timeout: 20000 });
      console.log(`[BROWSER] First response received (commit)`);
    } catch (navErr: any) {
      console.warn(`[BROWSER] goto commit failed: ${navErr.message}, retrying once...`);
      await page.goto(url, { waitUntil: "commit", timeout: 20000 });
      console.log(`[BROWSER] Retry succeeded`);
    }
    // Wait for DOM to be ready
    await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {
      console.log(`[BROWSER] domcontentloaded timed out (continuing with partial load)`);
    });
    console.log(`[BROWSER] DOM ready`);
    // Wait for `load` (all subresources) — gov sites often have analytics that
    // never let `networkidle` resolve, so we use `load` + a short fixed settle.
    await page.waitForLoadState("load", { timeout: 8000 }).catch(() => {
      console.log(`[BROWSER] load event timed out (non-fatal)`);
    });
    await page.waitForTimeout(1000);
    console.log(`[BROWSER] Page ready, proceeding with analysis`);

    // Dismiss cookie banners, splash screens, survey popups, and modal overlays
    // Try multiple rounds — some sites stack popups
    for (let _dismissRound = 0; _dismissRound < 3; _dismissRound++) {
      let dismissed = false;
      try {
        const dismissSelectors = [
          // Survey / feedback popups (e.g. Hadaf "قيّم تجربتك الرقمية")
          ':is(button, a, div[role="button"]):has-text("إغلاق")',
          ':is(button, a, div[role="button"]):has-text("لا شكراً")',
          ':is(button, a, div[role="button"]):has-text("لاحقاً")',
          ':is(button, a, div[role="button"]):has-text("Close")',
          ':is(button, a, div[role="button"]):has-text("No thanks")',
          ':is(button, a, div[role="button"]):has-text("Not now")',
          ':is(button, a, div[role="button"]):has-text("Maybe later")',
          // Cookie consent
          ':is(button, a):has-text("Accept")',
          ':is(button, a):has-text("Accept All")',
          ':is(button, a):has-text("OK")',
          ':is(button, a):has-text("قبول")', ':is(button, a):has-text("موافق")',
          ':is(button, a):has-text("Got it")', ':is(button, a):has-text("I agree")',
          ':is(button, a):has-text("Agree")',
          '[class*="cookie"] button', '[id*="cookie"] button',
          '[class*="consent"] button', '[id*="consent"] button',
          // Splash / entry popups
          ':is(button, a):has-text("Skip")', ':is(button, a):has-text("تخطي")',
          ':is(button, a):has-text("Continue")', ':is(button, a):has-text("متابعة")',
          ':is(button, a):has-text("Enter Site")', ':is(button, a):has-text("Enter")',
          ':is(button, a):has-text("دخول")',
          // Generic modal/popup close
          '[class*="modal"] button[class*="close"]',
          '[class*="popup"] button[class*="close"]',
          '[class*="overlay"] button[class*="close"]',
          '[class*="splash"] button', '[class*="splash"] a',
          'button[aria-label="Close"]', 'button[aria-label="close"]',
          'button[aria-label="إغلاق"]',
          '[class*="modal"] [aria-label="Close"]',
          '[class*="popup"] [aria-label="Close"]',
          '[role="dialog"] button',
          '[class*="dialog"] button:has-text("OK")',
        ];
        for (const sel of dismissSelectors) {
          try {
            const btn = await page.$(sel);
            if (btn && await btn.isVisible()) {
              await btn.click({ timeout: 2000 });
              await page.waitForTimeout(500);
              dismissed = true;
              break;
            }
          } catch {}
        }
      } catch {}
      if (!dismissed) break;
    }

    emit({
      type: "load",
      phase: "load",
      status: "completed",
      description: "Website loaded successfully"
    });

    // Viewport screenshot (not full-page) — HTML + a11y tree already carry
    // below-the-fold structure, and the vision call is much cheaper this way.
    const fullScreenshot = await page.screenshot({ fullPage: false, type: "jpeg", quality: 70 });
    const screenshotPath = path.join(artifactsDir, "full-page.jpg");
    await fs.writeFile(screenshotPath, fullScreenshot);

    // Extract simplified HTML structure (only interactive elements, capped for token efficiency)
    const htmlStructure = await page.evaluate(() => {
      const interactiveSelectors = [
        "nav a[href]", "header a[href]", "header button",
        "a[href]", "button", "[role='button']", "input", "select",
        "[role='tab']", "[role='menuitem']",
      ];

      const elements: string[] = [];
      const seen = new Set<Element>();

      for (const selector of interactiveSelectors) {
        document.querySelectorAll(selector).forEach((el) => {
          if (seen.has(el)) return;
          seen.add(el);

          const tag = el.tagName.toLowerCase();
          const text = (el.textContent || "").trim().slice(0, 80);
          const href = el.getAttribute("href") || "";
          const role = el.getAttribute("role") || "";
          const type = el.getAttribute("type") || "";
          const className = (el.className || "").toString().slice(0, 100);
          const id = el.getAttribute("id") || "";
          const ariaLabel = el.getAttribute("aria-label") || "";
          const rect = el.getBoundingClientRect();

          // Skip invisible elements
          if (rect.width === 0 || rect.height === 0) return;
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") return;

          const attrs = [
            id ? `id="${id}"` : "",
            className ? `class="${className}"` : "",
            href ? `href="${href}"` : "",
            role ? `role="${role}"` : "",
            type ? `type="${type}"` : "",
            ariaLabel ? `aria-label="${ariaLabel}"` : "",
            `data-rect="${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)},${Math.round(rect.height)}"`,
          ].filter(Boolean).join(" ");

          if (elements.length < 100) { // cap at 100 for thorough testing
            elements.push(`<${tag} ${attrs}>${text}</${tag}>`);
          }
        });
      }

      return elements.join("\n");
    });

    const metadata = await page.evaluate(() => ({
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.getAttribute("content") || undefined,
      lang: document.documentElement.lang || undefined,
    }));

    // Extract accessibility tree (semantic page structure)
    const accessibilityTree = await getAccessibilityTree(page);
    const formattedAccessibilityTree = formatAccessibilityTree(accessibilityTree);

    // Content-hash gate: skip AI analysis if a recent successful run for this site
    // had byte-identical HTML + a11y tree (most gov homepages are static between runs).
    const contentHash = createHash("sha256")
      .update(htmlStructure)
      .update(formattedAccessibilityTree)
      .digest("hex");

    const reuseCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const priorRun = await prisma.run.findFirst({
      where: {
        siteId,
        contentHash,
        status: "passed",
        startedAt: { gte: reuseCutoff },
        id: { not: runId },
      },
      orderBy: { startedAt: "desc" },
      select: { aiPageUnderstanding: true, aiSummary: true },
    });

    // ─────────────────────────────────────────
    // PHASE 2: AI Analyzes & Creates Test Plan
    // ─────────────────────────────────────────
    emit({
      type: "analysis",
      phase: "analysis",
      status: "running",
      description: priorRun
        ? "♻️ Page unchanged since last healthy run — reusing prior analysis..."
        : "🧠 AI is analyzing the page and creating a test plan..."
    });

    // Extract real DOM elements as a selector fallback map
    const realElements = await extractRealPageElements(page, maxElements + 20);
    console.log(`[DOM] Extracted ${realElements.length} real elements for selector fallback`);

    let testPlan: AgentTestPlan;
    if (priorRun?.aiPageUnderstanding) {
      console.log(`[CACHE] Content hash matched prior healthy run — skipping page-analysis AI call`);
      testPlan = {
        pageUnderstanding: JSON.parse(priorRun.aiPageUnderstanding),
        elements: realElements,
      };
    } else {
      // AI analyzes page for understanding + real DOM elements for testing
      console.log(`[AI] Sending page data to AI for page understanding...`);
      try {
        const aiPlan = await analyzePageAndCreatePlan(fullScreenshot, htmlStructure, url, metadata, formattedAccessibilityTree);
        console.log(`[AI] Page understanding: ${aiPlan.pageUnderstanding.siteName} (${aiPlan.elements.length} AI elements)`);
        testPlan = {
          pageUnderstanding: aiPlan.pageUnderstanding,
          elements: realElements,
        };
      } catch (err) {
        console.log(`[AI] AI analysis failed, using DOM-extracted elements: ${err}`);
        testPlan = {
          pageUnderstanding: {
            siteName: metadata.title,
            siteNameAr: "",
            pageType: "homepage",
            language: metadata.lang || "unknown",
            description: `Automated test for ${metadata.title}`,
            descriptionAr: `اختبار آلي لـ ${metadata.title}`,
          },
          elements: realElements,
        };
      }
    }

    // Store AI understanding + content hash in database
    await prisma.run.update({
      where: { id: runId },
      data: {
        aiPageUnderstanding: JSON.stringify(testPlan.pageUnderstanding),
        aiTestPlan: JSON.stringify(testPlan.elements.slice(0, 30)),
        contentHash,
      },
    });

    emit({
      type: "analysis",
      phase: "analysis",
      status: "completed",
      description: `AI analyzed page, found ${testPlan.elements.length} real elements to test`,
      data: {
        pageUnderstanding: testPlan.pageUnderstanding,
        totalElements: testPlan.elements.length,
        breakdown: groupBy(testPlan.elements, "type"),
      },
    });

    // Filter safe elements only + apply max limit
    const safeElements = realElements.filter((e) => e.isSafe).slice(0, maxElements);
    const skippedUnsafe = realElements.filter((e) => !e.isSafe);

    // Set totalSteps early so live view progress bar has the correct denominator
    await prisma.run.update({
      where: { id: runId },
      data: { totalSteps: safeElements.length },
    });

    if (skippedUnsafe.length > 0) {
      emit({
        type: "testing",
        phase: "safety",
        status: "warning",
        description: `⚠️ Skipping ${skippedUnsafe.length} unsafe elements (login, payment, delete, etc.)`,
        data: { skippedElements: skippedUnsafe.map((e) => e.element) },
      });
    }

    // ─────────────────────────────────────────
    // PHASE 3: Execute Test Plan Element by Element (DFS)
    // ─────────────────────────────────────────
    const visitedPages = new Set<string>();
    visitedPages.add(new URL(url).pathname);
    const subPageQueue: string[] = [];
    let globalStepNum = 0;
    const testedElementNames = new Set<string>();

    // Sort elements: buttons/tabs/dropdowns first (non-navigating), then nav-links last
    // This minimizes page navigation during testing
    const sortOrder: Record<string, number> = {
      'button': 0, 'tab': 0, 'dropdown': 0, 'menu-item': 0,
      'search': 1, 'form-input': 1,
      'nav-link': 2, 'link': 2, 'cta': 2,
    };
    const sortedElements = [...safeElements].sort((a, b) => {
      return (sortOrder[a.type] ?? 1) - (sortOrder[b.type] ?? 1);
    });

    emit({
      type: "testing",
      phase: "testing",
      status: "running",
      description: `🔍 Testing ${sortedElements.length} elements...`
    });

    let needsHomepageReload = false;

    for (let i = 0; i < sortedElements.length; i++) {
      const testAction = sortedElements[i];

      // Skip external links
      const elLower = testAction.element.toLowerCase();
      const selLower = (testAction.selector || "").toLowerCase();
      if (
        elLower.includes("app store") || elLower.includes("google play") ||
        elLower.includes("huawei") || elLower.includes("appgallery") ||
        elLower.includes("twitter") || elLower.includes("facebook") ||
        elLower.includes("instagram") || elLower.includes("linkedin") ||
        elLower.includes("youtube") || elLower.includes("snapchat") ||
        elLower.includes("tiktok") || elLower.includes("whatsapp") ||
        selLower.includes("mailto:") || selLower.includes("tel:") ||
        selLower.includes("play.google") || selLower.includes("apps.apple") ||
        selLower.includes("twitter.com") || selLower.includes("x.com")
      ) continue;

      testedElementNames.add(testAction.element.toLowerCase().trim());
      const stepNum = globalStepNum++;

      emit({
        type: "testing",
        phase: "testing",
        status: "running",
        description: `Testing: ${testAction.element}`,
        currentStep: stepNum,
        totalSteps: sortedElements.length + subPageQueue.length,
        elementType: testAction.type,
        parentSection: testAction.section,
      });

      try {
        // Only navigate back to homepage if previous test navigated away
        if (needsHomepageReload) {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
          await page.waitForLoadState("load", { timeout: 4000 }).catch(() => {});
          await page.waitForTimeout(1500);
          // Dismiss popups
          try {
            for (const sel of [
              'button:has-text("Accept")', 'button:has-text("OK")',
              'button:has-text("قبول")', 'button:has-text("موافق")',
              'button:has-text("Close")', 'button:has-text("إغلاق")',
              '[class*="cookie"] button', '[id*="cookie"] button',
              'button[aria-label="Close"]', '[role="dialog"] button',
            ]) {
              const btn = await page.$(sel);
              if (btn && await btn.isVisible()) { await btn.click({ timeout: 2000 }); await page.waitForTimeout(500); break; }
            }
          } catch {}
          needsHomepageReload = false;
        }

        // Try to find element on current page first
        let element = await findElement(page, testAction);

        // If not found and we're not on homepage, go back and retry
        if (!element && page.url() !== url) {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
          await page.waitForLoadState("load", { timeout: 4000 }).catch(() => {});
          await page.waitForTimeout(1500);
          element = await findElement(page, testAction);
          needsHomepageReload = false;
        }

        if (!element) {
          // Don't pollute results with locator misses — log to unstable_elements.json
          // and mark as skipped so it doesn't inflate the warning count.
          unstableElements.push({
            element: testAction.element,
            type: testAction.type,
            selector: testAction.selector,
            section: testAction.section,
            page: page.url(),
            reason: "Locator did not match a visible element",
          });

          let notFoundPath = "";
          if (liveView) {
            // Scroll a bit so the live viewer sees some movement even on a miss
            await page.evaluate((step) => window.scrollBy(0, 200 + step * 100), stepNum).catch(() => {});
            try {
              notFoundPath = path.join(artifactsDir, `element-${stepNum}-after.jpg`);
              const shot = await page.screenshot({ timeout: 3000, type: "jpeg", quality: 60 });
              await fs.writeFile(notFoundPath, shot);
            } catch { notFoundPath = ""; }
          }

          const result: AgentStepResult = {
            testAction,
            status: "skipped",
            actualBehavior: "Element not found on page",
            aiAssessment: "Could not locate this element. It may be hidden, dynamically loaded, or the selector may be incorrect.",
            responseTimeMs: 0,
            screenshotBefore: "",
            screenshotAfter: notFoundPath,
            urlChanged: false,
            urlBefore: url,
            urlAfter: url,
            consoleErrors: [],
            networkErrors: [],
          };
          results.push(result);

          // Store in database
          await prisma.elementTestResult.create({
            data: {
              runId,
              elementText: testAction.element,
              elementType: testAction.type,
              elementSelector: testAction.selector,
              parentSection: testAction.section,
              action: testAction.action,
              status: "skipped",
              responseTimeMs: 0,
              error: `Selector not found or element not interactable. ${result.actualBehavior || ''} ${result.aiAssessment || ''}`.trim(),
              screenshotAfter: notFoundPath || undefined,
            },
          });

          emit({
            type: "testing",
            phase: "testing",
            status: "warning",
            description: `${testAction.element}: skipped (locator missed)`,
            currentStep: stepNum,
            totalSteps: safeElements.length + subPageQueue.length,
            elementType: testAction.type,
            responseTimeMs: 0,
          });

          continue;
        }

        // Scroll element into view so screenshot shows it
        await element.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});

        let cursorX = 0;
        let cursorY = 0;
        if (liveView) {
          const box = await element.boundingBox();
          cursorX = box ? jitter(Math.round(box.x + box.width / 2)) : 0;
          cursorY = box ? jitter(Math.round(box.y + box.height / 2)) : 0;
          send({
            type: "cursor_move",
            data: { x: cursorX, y: cursorY, elementText: testAction.element, elementType: testAction.type },
          });
          await page.waitForTimeout(150);
        }

        // Screenshot BEFORE — wrapped in try/catch in case page is mid-load
        let beforeScreenshot: Buffer = Buffer.alloc(0);
        const beforePath = path.join(artifactsDir, `element-${stepNum}-before.jpg`);
        try {
          beforeScreenshot = await page.screenshot({ timeout: 5000, type: "jpeg", quality: 60 });
          await fs.writeFile(beforePath, beforeScreenshot);
        } catch { /* page may be loading — skip */ }

        // Record state before action
        const urlBefore = page.url();
        const consoleErrorsCount = consoleLogBuffer.filter(l => l.level === "error").length;

        // Broadcast click event (live view only)
        if (liveView) send({ type: "cursor_click", data: { x: cursorX, y: cursorY } });

        // Perform the action — human-like
        const startTime = Date.now();

        switch (testAction.action) {
          case "click":
            try {
              await element.click({ timeout: timeoutPerElement, force: false });
            } catch {
              // Fallback: raw mouse click at element center
              await page.mouse.click(cursorX, cursorY);
            }
            break;
          case "hover":
            await element.hover({ timeout: timeoutPerElement });
            break;
          case "type": {
            await element.click({ timeout: timeoutPerElement });
            const searchTerm = testAction.element.toLowerCase().includes("search") ? "خدمات" : "test";
            // Human-like per-keystroke delay only when a viewer is watching
            await page.keyboard.type(searchTerm, liveView ? { delay: 80 + Math.round(Math.random() * 40) } : undefined);
            break;
          }
          case "select":
            await page.mouse.down();
            await page.mouse.up();
            break;
        }

        const responseTimeMs = Date.now() - startTime;

        // Wait for any navigation/load triggered by the action
        await Promise.race([
          page.waitForLoadState("domcontentloaded", { timeout: 5000 }),
          page.waitForTimeout(1000),
        ]).catch(() => {});

        // Human-like pause after action (live view only — for the visual cadence)
        if (liveView) await page.waitForTimeout(300 + Math.round(Math.random() * 150));



        // Screenshot AFTER — wrapped in try/catch in case page navigated away
        let afterScreenshot: Buffer = beforeScreenshot;
        const afterPath = path.join(artifactsDir, `element-${stepNum}-after.jpg`);
        try {
          afterScreenshot = await page.screenshot({ timeout: 5000, type: "jpeg", quality: 60 });
          await fs.writeFile(afterPath, afterScreenshot);
        } catch {
          // If screenshot fails (e.g. page is navigating), reuse before screenshot
          if (beforeScreenshot.length > 0) {
            await fs.writeFile(afterPath, beforeScreenshot).catch(() => {});
          }
        }

        // Check what changed
        const urlAfter = page.url();
        const newConsoleErrors = consoleLogBuffer
          .filter(l => l.level === "error")
          .slice(consoleErrorsCount)
          .map(l => l.message)
          .filter(msg => {
            const lower = msg.toLowerCase();
            return !(
              lower.includes("cors") ||
              lower.includes("mixed content") ||
              lower.includes("favicon") ||
              lower.includes("deprecated") ||
              lower.includes("third-party") ||
              lower.includes("cookie") ||
              lower.includes("analytics") ||
              lower.includes("gtm") ||
              lower.includes("google") ||
              lower.includes("facebook") ||
              lower.includes("tracking") ||
              lower.includes("csp") ||
              lower.includes("content security policy") ||
              lower.includes("net::err") ||
              lower.includes("failed to load resource") ||
              lower.includes("manifest")
            );
          });
        const pageTitle = await page.title();

        // Heuristic-first: skip vision when result is unambiguous (the common case).
        const assessmentContext = {
          urlChanged: urlBefore !== urlAfter,
          urlBefore,
          urlAfter,
          consoleErrors: newConsoleErrors,
          networkErrors: [],
          responseTimeMs,
          pageTitle,
        };
        const assessment =
          tryConfidentAssessment(testAction, assessmentContext) ??
          (await assessElementResult(testAction, beforeScreenshot, afterScreenshot, assessmentContext));

        const result: AgentStepResult = {
          testAction,
          status: assessment.status as any,
          actualBehavior: assessment.assessment,
          aiAssessment: assessment.assessment,
          responseTimeMs,
          screenshotBefore: beforePath,
          screenshotAfter: afterPath,
          urlChanged: urlBefore !== urlAfter,
          urlBefore,
          urlAfter,
          consoleErrors: newConsoleErrors,
          networkErrors: [],
        };

        results.push(result);

        // Store in database
        await prisma.elementTestResult.create({
          data: {
            runId,
            elementText: testAction.element,
            elementType: testAction.type,
            elementSelector: testAction.selector,
            parentSection: testAction.section,
            action: testAction.action,
            status: assessment.status,
            responseTimeMs,
            urlBefore,
            urlAfter,
            urlChanged: urlBefore !== urlAfter,
            screenshotBefore: beforePath,
            screenshotAfter: afterPath,
            consoleErrors: JSON.stringify(newConsoleErrors),
            networkErrors: JSON.stringify([]),
            domChanges: assessment.assessment,
            cursorX,
            cursorY,
          },
        });

        // DFS: if the click navigated to a new same-domain page, queue it
        if (urlBefore !== urlAfter) {
          needsHomepageReload = true;
          try {
            const baseHost = new URL(url).hostname;
            const afterUrl = new URL(urlAfter);
            if (
              (afterUrl.hostname === baseHost || afterUrl.hostname.endsWith("." + baseHost)) &&
              !visitedPages.has(afterUrl.pathname) &&
              subPageQueue.length < 5
            ) {
              visitedPages.add(afterUrl.pathname);
              subPageQueue.push(urlAfter);
            }
          } catch {}
        }

        // Emit result for this element
        emit({
          type: "testing",
          phase: "testing",
          status: assessment.status === "passed" ? "completed" : assessment.status as any,
          description: `${testAction.element}: ${assessment.assessment}`,
          currentStep: stepNum,
          totalSteps: safeElements.length + subPageQueue.length,
          elementType: testAction.type,
          responseTimeMs,
        });

      } catch (error: any) {
        // Determine if this is a real failure or a benign error (e.g. timeout during navigation)
        const errorMsg = error.message || "";
        const isTimeout = errorMsg.includes("Timeout") || errorMsg.includes("timeout");
        const isNavigation = errorMsg.includes("navigation") || errorMsg.includes("frame was detached");
        const isBenign = (isTimeout && isNavigation) || errorMsg.includes("frame was detached");

        const status = isBenign ? "warning" : "failed";
        const assessment = isBenign
          ? `Element triggered a page transition (${errorMsg.slice(0, 80)})`
          : `Element interaction failed: ${errorMsg}`;

        // Capture screenshot even on failure so live view has something to show
        let failAfterPath = "";
        let failCursorX = 0;
        let failCursorY = 0;
        try {
          failAfterPath = path.join(artifactsDir, `element-${stepNum}-after.jpg`);
          const failShot = await page.screenshot({ timeout: 3000, type: "jpeg", quality: 60 });
          await fs.writeFile(failAfterPath, failShot);
          // element is out of scope in catch — use page center as fallback cursor
          failCursorX = 640;
          failCursorY = 360;
        } catch { failAfterPath = ""; }

        const failureResult: AgentStepResult = {
          testAction,
          status,
          actualBehavior: assessment,
          aiAssessment: assessment,
          responseTimeMs: timeoutPerElement,
          screenshotBefore: "",
          screenshotAfter: failAfterPath,
          urlChanged: false,
          urlBefore: url,
          urlAfter: url,
          consoleErrors: isBenign ? [] : [errorMsg],
          networkErrors: [],
        };

        results.push(failureResult);

        await prisma.elementTestResult.create({
          data: {
            runId,
            elementText: testAction.element,
            elementType: testAction.type,
            elementSelector: testAction.selector,
            parentSection: testAction.section,
            action: testAction.action,
            status,
            responseTimeMs: timeoutPerElement,
            error: assessment,
            consoleErrors: JSON.stringify(isBenign ? [] : [errorMsg]),
            screenshotAfter: failAfterPath || undefined,
            cursorX: failCursorX || undefined,
            cursorY: failCursorY || undefined,
          },
        });

        emit({
          type: "testing",
          phase: "testing",
          status: status === "warning" ? "warning" : "failed",
          description: `${testAction.element}: ${assessment}`,
          currentStep: stepNum,
          totalSteps: safeElements.length,
        });
      }

      // Rate limiting — wait between elements
      await page.waitForTimeout(100);
    }

    // ─────────────────────────────────────────
    // DFS: Explore sub-pages discovered during testing
    // ─────────────────────────────────────────
    for (const subPageUrl of subPageQueue) {
      if (results.length >= maxElements) break;

      try {
        emit({
          type: "testing",
          phase: "testing",
          status: "running",
          description: `🔍 Exploring sub-page: ${new URL(subPageUrl).pathname}`,
          currentStep: globalStepNum,
          totalSteps: safeElements.length + subPageQueue.length,
        });

        await page.goto(subPageUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
        await page.waitForLoadState("load", { timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(1500);

        // Dismiss cookie/popup/splash banners on sub-page
        try {
          for (const sel of [
            'button:has-text("Accept")', 'button:has-text("OK")', 'button:has-text("ok")',
            'button:has-text("قبول")', 'button:has-text("موافق")',
            'button:has-text("Close")', 'button:has-text("إغلاق")',
            'button:has-text("Skip")', 'button:has-text("Continue")', 'button:has-text("Enter")',
            'button:has-text("دخول")', 'button:has-text("متابعة")',
            '[class*="cookie"] button', '[id*="cookie"] button',
            'button[aria-label="Close"]', '[class*="modal"] button[class*="close"]',
            '[class*="popup"] button[class*="close"]', '[role="dialog"] button',
          ]) {
            try {
              const btn = await page.$(sel);
              if (btn && await btn.isVisible()) { await btn.click({ timeout: 2000 }); await page.waitForTimeout(500); break; }
            } catch {}
          }
        } catch {}

        // Extract real DOM elements directly from sub-page
        const subRealElements = await extractRealPageElements(page, 30);
        console.log(`[DOM] Sub-page ${new URL(subPageUrl).pathname}: ${subRealElements.length} real elements`);

        const subElements = subRealElements.filter((e) => {
          if (!e.isSafe) return false;
          // Skip already-tested elements (footer/nav duplicates)
          const name = e.element.toLowerCase().trim();
          if (testedElementNames.has(name)) return false;
          // Skip external links
          const el = e.element.toLowerCase();
          const sel = (e.selector || "").toLowerCase();
          if (
            el.includes("app store") || el.includes("google play") ||
            el.includes("huawei") || el.includes("appgallery") ||
            el.includes("twitter") || el.includes("facebook") ||
            el.includes("instagram") || el.includes("linkedin") ||
            el.includes("youtube") || el.includes("snapchat") ||
            el.includes("tiktok") || el.includes("whatsapp") ||
            sel.includes("mailto:") || sel.includes("tel:") ||
            sel.includes("play.google") || sel.includes("apps.apple") ||
            sel.includes("twitter.com") || sel.includes("x.com")
          ) return false;
          return true;
        }).slice(0, Math.min(10, maxElements - results.length));

        emit({
          type: "testing",
          phase: "testing",
          status: "running",
          description: `Found ${subElements.length} elements on ${new URL(subPageUrl).pathname}`,
        });

        // Test each element on the sub-page
        for (const testAction of subElements) {
          if (results.length >= maxElements) break;
          testedElementNames.add(testAction.element.toLowerCase().trim());
          const stepNum = globalStepNum++;

          emit({
            type: "testing",
            phase: "testing",
            status: "running",
            description: `Testing: ${testAction.element} (${new URL(subPageUrl).pathname})`,
            currentStep: stepNum,
            totalSteps: safeElements.length + subPageQueue.length * 5,
            elementType: testAction.type,
            parentSection: testAction.section,
          });

          try {
            // Navigate back to sub-page if we drifted
            if (page.url() !== subPageUrl) {
              await page.goto(subPageUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
              await page.waitForLoadState("load", { timeout: 4000 }).catch(() => {});
              await page.waitForTimeout(500);
            }

            const element = await findElement(page, testAction);
            if (!element) {
              unstableElements.push({
                element: testAction.element,
                type: testAction.type,
                selector: testAction.selector,
                section: testAction.section,
                page: subPageUrl,
                reason: "Locator did not match on sub-page",
              });

              let nfPath = "";
              if (liveView) {
                try {
                  nfPath = path.join(artifactsDir, `element-${stepNum}-after.jpg`);
                  await fs.writeFile(nfPath, await page.screenshot({ timeout: 3000, type: "jpeg", quality: 60 }));
                } catch { nfPath = ""; }
              }
              results.push({
                testAction, status: "skipped", actualBehavior: "Element not found on sub-page",
                aiAssessment: "Could not locate element on sub-page.",
                responseTimeMs: 0, screenshotBefore: "", screenshotAfter: nfPath,
                urlChanged: false, urlBefore: subPageUrl, urlAfter: subPageUrl,
                consoleErrors: [], networkErrors: [],
              });
              await prisma.elementTestResult.create({
                data: {
                  runId, elementText: testAction.element, elementType: testAction.type,
                  elementSelector: testAction.selector, parentSection: testAction.section,
                  action: testAction.action, status: "skipped", responseTimeMs: 0,
                  error: "Selector not found on sub-page",
                  screenshotAfter: nfPath || undefined,
                },
              });
              emit({
                type: "testing", phase: "testing", status: "warning",
                description: `${testAction.element}: skipped (locator missed)`,
                currentStep: stepNum, totalSteps: safeElements.length + subPageQueue.length * 5,
                elementType: testAction.type, responseTimeMs: 0,
              });
              continue;
            }

            await element.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});

            let cx = 0;
            let cy = 0;
            if (liveView) {
              const box = await element.boundingBox();
              cx = box ? jitter(Math.round(box.x + box.width / 2)) : 0;
              cy = box ? jitter(Math.round(box.y + box.height / 2)) : 0;
              send({ type: "cursor_move", data: { x: cx, y: cy, elementText: testAction.element, elementType: testAction.type } });
              await page.waitForTimeout(150);
            }

            let beforeBuf: Buffer = Buffer.alloc(0);
            const bPath = path.join(artifactsDir, `element-${stepNum}-before.jpg`);
            try { beforeBuf = await page.screenshot({ timeout: 5000, type: "jpeg", quality: 60 }); await fs.writeFile(bPath, beforeBuf); } catch {}

            const urlB = page.url();
            const errCount = consoleLogBuffer.filter(l => l.level === "error").length;
            if (liveView) send({ type: "cursor_click", data: { x: cx, y: cy } });

            const t0 = Date.now();
            try { await element.click({ timeout: timeoutPerElement }); } catch { await page.mouse.click(cx, cy); }
            const rTime = Date.now() - t0;

            await Promise.race([
              page.waitForLoadState("domcontentloaded", { timeout: 5000 }),
              page.waitForTimeout(1000),
            ]).catch(() => {});
            if (liveView) await page.waitForTimeout(300);

            let afterBuf = beforeBuf;
            const aPath = path.join(artifactsDir, `element-${stepNum}-after.jpg`);
            try { afterBuf = await page.screenshot({ timeout: 5000, type: "jpeg", quality: 60 }); await fs.writeFile(aPath, afterBuf); } catch {}

            const urlA = page.url();
            const newErrors = consoleLogBuffer.filter(l => l.level === "error").slice(errCount).map(l => l.message);
            const pTitle = await page.title();

            const assessCtx = {
              urlChanged: urlB !== urlA, urlBefore: urlB, urlAfter: urlA,
              consoleErrors: newErrors, networkErrors: [], responseTimeMs: rTime, pageTitle: pTitle,
            };
            const assess =
              tryConfidentAssessment(testAction, assessCtx) ??
              (await assessElementResult(testAction, beforeBuf, afterBuf, assessCtx));

            results.push({
              testAction, status: assess.status as any, actualBehavior: assess.assessment,
              aiAssessment: assess.assessment, responseTimeMs: rTime,
              screenshotBefore: bPath, screenshotAfter: aPath,
              urlChanged: urlB !== urlA, urlBefore: urlB, urlAfter: urlA,
              consoleErrors: newErrors, networkErrors: [],
            });

            await prisma.elementTestResult.create({
              data: {
                runId, elementText: testAction.element, elementType: testAction.type,
                elementSelector: testAction.selector, parentSection: testAction.section,
                action: testAction.action, status: assess.status, responseTimeMs: rTime,
                urlBefore: urlB, urlAfter: urlA, urlChanged: urlB !== urlA,
                screenshotBefore: bPath, screenshotAfter: aPath,
                consoleErrors: JSON.stringify(newErrors), networkErrors: JSON.stringify([]),
                domChanges: assess.assessment, cursorX: cx, cursorY: cy,
              },
            });

            emit({
              type: "testing", phase: "testing",
              status: assess.status === "passed" ? "completed" : assess.status as any,
              description: `${testAction.element}: ${assess.assessment}`,
              currentStep: stepNum, totalSteps: safeElements.length + subPageQueue.length * 5,
              elementType: testAction.type, responseTimeMs: rTime,
            });

          } catch (error: any) {
            const errMsg = error.message || "";
            let subFailPath = "";
            try {
              subFailPath = path.join(artifactsDir, `element-${stepNum}-after.jpg`);
              await fs.writeFile(subFailPath, await page.screenshot({ timeout: 3000, type: "jpeg", quality: 60 }));
            } catch { subFailPath = ""; }
            results.push({
              testAction, status: "warning", actualBehavior: errMsg,
              aiAssessment: errMsg, responseTimeMs: 0,
              screenshotBefore: "", screenshotAfter: subFailPath,
              urlChanged: false, urlBefore: subPageUrl, urlAfter: subPageUrl,
              consoleErrors: [], networkErrors: [],
            });
            await prisma.elementTestResult.create({
              data: {
                runId, elementText: testAction.element, elementType: testAction.type,
                elementSelector: testAction.selector, parentSection: testAction.section || "",
                action: testAction.action, status: "warning", responseTimeMs: 0,
                error: errMsg.slice(0, 500),
                screenshotAfter: subFailPath || undefined,
              },
            });
            emit({
              type: "testing", phase: "testing", status: "warning",
              description: `${testAction.element}: ${errMsg.slice(0, 80)}`,
              currentStep: stepNum, totalSteps: safeElements.length + subPageQueue.length * 5,
              elementType: testAction.type, responseTimeMs: 0,
            });
          }

          await page.waitForTimeout(100);
        }
      } catch (error: any) {
        console.warn(`[DFS] Failed to explore sub-page ${subPageUrl}:`, error.message);
      }
    }

    // ─────────────────────────────────────────
    // PHASE 4: AI Generates Final Summary
    // ─────────────────────────────────────────
    emit({
      type: "summary",
      phase: "summary",
      status: "running",
      description: "🤖 AI is generating the final report..."
    });

    const totalDuration = results.reduce((sum, r) => sum + r.responseTimeMs, 0);
    const failedCount = results.filter(r => r.status === "failed").length;
    const warningCount = results.filter(r => r.status === "warning").length;

    // Skip the AI summary call when there's nothing interesting to explain.
    // If the page hash matched a recent healthy run AND this run is also clean,
    // we can even reuse the cached prior summary verbatim.
    let summary: string;
    if (failedCount === 0 && warningCount === 0) {
      summary = priorRun?.aiSummary
        ?? templateSummary(testPlan.pageUnderstanding, results, totalDuration);
    } else {
      summary = await generateFinalSummary(
        testPlan.pageUnderstanding,
        results,
        totalDuration
      );
    }

    // Parse the plain-text AI response into structured fields
    const structuredSummary = parseSummaryText(summary);

    // Store summary in database
    await prisma.run.update({
      where: { id: runId },
      data: {
        aiSummary: summary,
        summaryJson: JSON.stringify(structuredSummary),
      },
    });

    emit({
      type: "summary",
      phase: "summary",
      status: "completed",
      description: "Test complete!",
      data: { summary },
    });

    // Determine overall status
    const overallStatus = failedCount > 0 ? "failed" : warningCount > 0 ? "warning" : "passed";

    emit({
      type: "complete",
      phase: "complete",
      status: "completed",
      description: `Test complete: ${results.length} elements tested, ${failedCount} failed, ${warningCount} warnings`,
      data: {
        overallStatus,
        totalDuration,
        passed: results.filter(r => r.status === "passed").length,
        failed: failedCount,
        warnings: warningCount,
      },
    });

    // Dump the flaky locator log so we can triage stable selectors over time.
    if (unstableElements.length > 0) {
      const unstablePath = path.join(artifactsDir, "unstable_elements.json");
      await fs.writeFile(unstablePath, JSON.stringify(unstableElements, null, 2)).catch(() => {});
    }

    return {
      testPlan,
      results,
      skippedUnsafe,
      summary,
      totalDuration,
      overallStatus,
    };

  } finally {
    if (cdpSession) await cdpSession.send("Page.stopScreencast").catch(() => {});
    if (browser) await browser.close();
  }
}

// ─────────────────────────────────────────
// Extract REAL elements from live DOM
// ─────────────────────────────────────────
async function extractRealPageElements(page: Page, maxElements: number): Promise<AgentTestAction[]> {
  const rawElements = await page.evaluate((max) => {
    const results: any[] = [];
    const seen = new Set<string>();
    const unsafePattern = /login|logout|sign.?in|sign.?out|register|تسجيل|دخول|خروج|delete|حذف|submit|إرسال|payment|دفع|download|تحميل|nafath|نفاذ|password|كلمة.?مرور|username|اسم.?المستخدم|رقم.?الهوية|مستخدم.?جديد/i;
    const externalPattern = /twitter|facebook|instagram|linkedin|youtube|snapchat|tiktok|whatsapp|play\.google|apps\.apple|mailto:|tel:|javascript:/i;

    const allInteractive = document.querySelectorAll(
      'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [onclick]'
    );

    for (let i = 0; i < allInteractive.length; i++) {
      const el = allInteractive[i];
      if (results.length >= max) break;
      const htmlEl = el as HTMLElement;
      const rect = htmlEl.getBoundingClientRect();

      // Skip invisible/tiny elements
      if (rect.width < 10 || rect.height < 10) continue;
      // Skip elements completely offscreen
      if (rect.bottom < 0 || rect.top > document.documentElement.scrollHeight + 100) continue;
      const style = window.getComputedStyle(htmlEl);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
      // Skip elements with no pointer events (likely decorative overlays)
      if (style.pointerEvents === 'none') continue;

      const tag = htmlEl.tagName.toLowerCase();
      const text = (htmlEl.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 80);
      const href = htmlEl.getAttribute('href') || '';
      const id = htmlEl.getAttribute('id') || '';
      const ariaLabel = htmlEl.getAttribute('aria-label') || '';
      const name = htmlEl.getAttribute('name') || '';
      const typeAttr = htmlEl.getAttribute('type') || '';
      const placeholder = (htmlEl as HTMLInputElement).placeholder || '';
      const role = htmlEl.getAttribute('role') || '';

      // Skip external links
      if (externalPattern.test(href) || externalPattern.test(text)) continue;
      // Skip anchor-only links
      if (tag === 'a' && (!href || href === '#' || href.startsWith('javascript:'))) continue;

      // Build display name
      const displayText = text.substring(0, 60) || ariaLabel || placeholder || name || '';

      // Skip elements with no meaningful text (icon-only buttons, image links)
      if (!displayText || displayText.length < 2) continue;

      // Skip elements inside hidden dropdowns/menus (parent has overflow:hidden or max-height:0)
      let parentHidden = false;
      let parent = htmlEl.parentElement;
      for (let depth = 0; depth < 5 && parent; depth++) {
        const ps = window.getComputedStyle(parent);
        if (ps.overflow === 'hidden' && parent.clientHeight < 5) { parentHidden = true; break; }
        if (ps.maxHeight === '0px' || ps.maxHeight === '0') { parentHidden = true; break; }
        parent = parent.parentElement;
      }
      if (parentHidden) continue;

      // Build unique key for dedup
      const key = tag + '|' + displayText.substring(0, 30) + '|' + href.substring(0, 50);
      if (seen.has(key)) continue;
      seen.add(key);

      // Build a selector that WORKS — using data attributes, id, href, or nth-of-type
      let selector = '';
      if (id) {
        selector = '#' + CSS.escape(id);
      } else if (tag === 'a' && href && href.length < 200) {
        selector = `a[href="${href.replace(/"/g, '\\"')}"]`;
      } else if (ariaLabel) {
        selector = `[aria-label="${ariaLabel.replace(/"/g, '\\"')}"]`;
      } else if (name && (tag === 'input' || tag === 'select' || tag === 'textarea')) {
        selector = `${tag}[name="${name.replace(/"/g, '\\"')}"]`;
      } else if (typeAttr && tag === 'input') {
        selector = `input[type="${typeAttr}"]`;
      } else {
        // Use nth-of-type as last resort
        const parent = htmlEl.parentElement;
        if (parent) {
          const siblings = Array.from(parent.querySelectorAll(':scope > ' + tag));
          const idx = siblings.indexOf(htmlEl);
          if (idx >= 0) {
            const parentId = parent.getAttribute('id');
            const parentClass = parent.className ? '.' + parent.className.split(/\s+/).filter(c => c.length > 0).slice(0, 2).join('.') : '';
            const parentSel = parentId ? '#' + CSS.escape(parentId) : (parent.tagName.toLowerCase() + parentClass);
            selector = `${parentSel} > ${tag}:nth-of-type(${idx + 1})`;
          }
        }
      }

      if (!selector) continue;

      // Safety check
      const isSafe = !unsafePattern.test(displayText + ' ' + href);

      // Determine section from position
      let section = 'content';
      if (rect.y < 120) section = 'header';
      else if (rect.y > document.body.scrollHeight - 300) section = 'footer';
      const closestNav = htmlEl.closest('nav, [role="navigation"], header');
      if (closestNav) section = 'nav';

      results.push({
        tag, text: displayText, selector, href, typeAttr, name, ariaLabel, placeholder,
        isSafe, section, role,
        x: Math.round(rect.x), y: Math.round(rect.y),
        w: Math.round(rect.width), h: Math.round(rect.height),
      });
    }

    return results;
  }, maxElements);

  // Convert to AgentTestAction format
  let id = 1;
  return rawElements.map((el: any) => {
    let type = 'button';
    let action: string = 'click';
    let priority: 'high' | 'medium' | 'low' = 'medium';

    if (el.tag === 'a') {
      type = 'nav-link'; action = 'click';
      priority = el.section === 'nav' || el.section === 'header' ? 'high' : 'medium';
    } else if (el.tag === 'button' || el.role === 'button') {
      type = 'button'; action = 'click'; priority = 'high';
    } else if (el.tag === 'input' || el.tag === 'textarea') {
      if (el.typeAttr === 'search' || el.name?.includes('search') || el.placeholder?.includes('بحث') || el.placeholder?.toLowerCase().includes('search')) {
        type = 'search'; action = 'type'; priority = 'high';
      } else {
        type = 'form-input'; action = 'type'; priority = 'medium';
      }
    } else if (el.tag === 'select') {
      type = 'dropdown'; action = 'select'; priority = 'medium';
    } else if (el.role === 'tab') {
      type = 'tab'; action = 'click'; priority = 'high';
    } else if (el.role === 'menuitem') {
      type = 'menu-item'; action = 'click'; priority = 'medium';
    }

    if (el.section === 'footer') priority = 'low';

    return {
      id: id++,
      element: el.text,
      selector: el.selector,
      type,
      action,
      reason: `Real DOM element: ${type}`,
      priority,
      expectedBehavior: action === 'click' ? 'Should respond to interaction' : 'Should accept input',
      isSafe: el.isSafe,
      section: el.section,
    } as AgentTestAction;
  });
}

// ─────────────────────────────────────────
// Helper: Find element — semantic locators first, selector strings last
// ─────────────────────────────────────────
const ROLE_MAP: Record<string, string> = {
  "button": "button",
  "nav-link": "link",
  "link": "link",
  "cta": "link",
  "tab": "tab",
  "menu-item": "menuitem",
  "form-input": "textbox",
  "search": "searchbox",
  "dropdown": "combobox",
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanElementName(raw: string): string {
  return raw
    .replace(/^(Navigation link|Button|Tab|Link|Dropdown|Menu item|Search|Form|Input)\s*['"]?/i, "")
    .replace(/['"]?\s*$/, "")
    .trim();
}

async function findElement(page: Page, testAction: AgentTestAction) {
  const role = ROLE_MAP[testAction.type];
  const name = cleanElementName(testAction.element);
  const nameRe = name && name.length > 1 ? new RegExp(escapeRegex(name.slice(0, 30)), "i") : null;

  // 1) Semantic: role + accessible name
  if (role && nameRe) {
    try {
      const el = page.getByRole(role as any, { name: nameRe }).first();
      if (await el.isVisible({ timeout: 1000 })) return el;
    } catch {}
  }

  // 2) Semantic: getByLabel (form fields)
  if (nameRe && (role === "textbox" || role === "searchbox" || role === "combobox")) {
    try {
      const el = page.getByLabel(nameRe).first();
      if (await el.isVisible({ timeout: 800 })) return el;
    } catch {}
  }

  // 3) Semantic: exact text
  if (name && name.length > 1) {
    try {
      const el = page.getByText(name, { exact: true }).first();
      if (await el.isVisible({ timeout: 800 })) return el;
    } catch {}
  }

  // 4) DOM-extracted selector (id/href/aria-label/name from extractRealPageElements)
  if (testAction.selector) {
    try {
      const el = page.locator(testAction.selector).first();
      if (await el.isVisible({ timeout: 1000 })) return el;
    } catch {}
  }

  // 5) Loose text match (substring)
  if (nameRe) {
    try {
      const el = page.getByText(nameRe).first();
      if (await el.isVisible({ timeout: 800 })) return el;
    } catch {}
  }

  // 6) href pattern fallback (extract from selector string)
  try {
    const hrefMatch = testAction.selector.match(/href[*~^$]?=['"]([^'"]+)['"]/);
    if (hrefMatch) {
      const hrefPart = hrefMatch[1].split("/").pop() || hrefMatch[1];
      const el = page.locator(`a[href*="${hrefPart}"]`).first();
      if (await el.isVisible({ timeout: 800 })) return el;
    }
  } catch {}

  // 7) aria-label substring match
  if (name && name.length > 1) {
    try {
      const el = page.locator(`[aria-label*="${name.slice(0, 30)}" i]`).first();
      if (await el.isVisible({ timeout: 800 })) return el;
    } catch {}
  }

  // 8) Last resort: scroll + retry selector (element may be below fold)
  if (testAction.selector) {
    try {
      await page.evaluate(() => window.scrollBy(0, 400));
      const el = page.locator(testAction.selector).first();
      if (await el.isVisible({ timeout: 800 })) return el;
    } catch {}
  }

  return null;
}

// ─────────────────────────────────────────
// Helper: Group elements by key
// ─────────────────────────────────────────
function groupBy(arr: any[], key: string): Record<string, number> {
  return arr.reduce((acc, item) => {
    acc[item[key]] = (acc[item[key]] || 0) + 1;
    return acc;
  }, {});
}
