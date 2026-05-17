// src/lib/ai-executor.ts
// AI Execution Engine — Runs AI's test plan with Playwright

import { Browser, Page, chromium, CDPSession } from "playwright";
import { analyzePageAndCreatePlan, assessElementResult, generateFinalSummary, AgentTestPlan, AgentTestAction, AgentStepResult } from "./ai-agent";
import { prisma } from "./prisma";
import { promises as fs } from "fs";
import path from "path";
import { getAccessibilityTree, formatAccessibilityTree } from "./accessibility-tree";


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

    const defaultPath = chromium.executablePath();
    console.log(`[BROWSER] Playwright default Chromium: ${defaultPath}`);

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

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      locale: "ar-SA",
      timezoneId: "Asia/Riyadh",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    });

    page = await context.newPage();

    // Collect console logs
    page.on("console", (msg) => {
      consoleLogBuffer.push({
        level: msg.type(),
        message: msg.text(),
        timestamp: Date.now(),
      });
    });

    // ── Start CDP Screencast — streams live JPEG frames to the browser client ──
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

    // Navigate to URL — use networkidle for SPAs that render via JS
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    // Wait for SPA frameworks (Angular, React) to finish rendering
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);

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

    // Take full-page screenshot
    const fullScreenshot = await page.screenshot({ fullPage: true });
    const screenshotPath = path.join(artifactsDir, "full-page.png");
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

    // ─────────────────────────────────────────
    // PHASE 2: AI Analyzes & Creates Test Plan
    // ─────────────────────────────────────────
    emit({
      type: "analysis",
      phase: "analysis",
      status: "running",
      description: "🧠 AI is analyzing the page and creating a test plan..."
    });

    const testPlan = await analyzePageAndCreatePlan(fullScreenshot, htmlStructure, url, metadata, formattedAccessibilityTree);

    // Store AI understanding in database
    await prisma.run.update({
      where: { id: runId },
      data: {
        aiPageUnderstanding: JSON.stringify(testPlan.pageUnderstanding),
        aiTestPlan: JSON.stringify(testPlan.elements),
      },
    });

    emit({
      type: "analysis",
      phase: "analysis",
      status: "completed",
      description: `AI identified ${testPlan.elements.length} elements to test`,
      data: {
        pageUnderstanding: testPlan.pageUnderstanding,
        totalElements: testPlan.elements.length,
        breakdown: groupBy(testPlan.elements, "type"),
      },
    });

    // Filter safe elements only + apply max limit
    const safeElements = testPlan.elements.filter((e) => e.isSafe).slice(0, maxElements);
    const skippedUnsafe = testPlan.elements.filter((e) => !e.isSafe);

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
    // DFS: after testing homepage elements, explore sub-pages
    // discovered during navigation and test their elements too
    const visitedPages = new Set<string>();
    visitedPages.add(new URL(url).pathname);
    const subPageQueue: string[] = []; // pages to explore after homepage
    let globalStepNum = 0;
    const testedElementNames = new Set<string>(); // dedup across pages

    emit({
      type: "testing",
      phase: "testing",
      status: "running",
      description: `🔍 Testing ${safeElements.length} elements...`
    });

    for (let i = 0; i < safeElements.length; i++) {
      const testAction = safeElements[i];

      // Skip external links that can't work in headless browser
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

      // Emit: starting this element
      emit({
        type: "testing",
        phase: "testing",
        status: "running",
        description: `Testing: ${testAction.element}`,
        currentStep: stepNum,
        totalSteps: safeElements.length + subPageQueue.length,
        elementType: testAction.type,
        parentSection: testAction.section,
      });

      try {
        // Navigate back to original URL if we're on a different page
        if (page.url() !== url) {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
          await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
          await page.waitForTimeout(500);
        }

        // Find the element
        const element = await findElement(page, testAction);

        if (!element) {
          const result: AgentStepResult = {
            testAction,
            status: "warning",
            actualBehavior: "Element not found on page",
            aiAssessment: "Could not locate this element. It may be hidden, dynamically loaded, or the selector may be incorrect.",
            responseTimeMs: 0,
            screenshotBefore: "",
            screenshotAfter: "",
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
              status: "warning",
              responseTimeMs: 0,
              error: `Selector not found or element not interactable. ${result.actualBehavior || ''} ${result.aiAssessment || ''}`.trim(),
            },
          });

          emit({
            type: "testing",
            phase: "testing",
            status: "warning",
            description: `${testAction.element}: Element not found`,
            currentStep: stepNum,
            totalSteps: safeElements.length + subPageQueue.length,
            elementType: testAction.type,
            responseTimeMs: 0,
          });

          continue;
        }

        // Get bounding box for cursor overlay (no scrolling — avoids "zoom" effect in live view)
        const box = await element.boundingBox();
        const cursorX = box ? jitter(Math.round(box.x + box.width / 2)) : 0;
        const cursorY = box ? jitter(Math.round(box.y + box.height / 2)) : 0;

        send({
          type: "cursor_move",
          data: { x: cursorX, y: cursorY, elementText: testAction.element, elementType: testAction.type },
        });

        await page.waitForTimeout(150);

        // Screenshot BEFORE — wrapped in try/catch in case page is mid-load
        let beforeScreenshot: Buffer = Buffer.alloc(0);
        const beforePath = path.join(artifactsDir, `element-${stepNum}-before.png`);
        try {
          beforeScreenshot = await page.screenshot({ timeout: 5000 });
          await fs.writeFile(beforePath, beforeScreenshot);
        } catch { /* page may be loading — skip */ }

        // Record state before action
        const urlBefore = page.url();
        const consoleErrorsCount = consoleLogBuffer.filter(l => l.level === "error").length;

        // Broadcast click event
        send({ type: "cursor_click", data: { x: cursorX, y: cursorY } });

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
            await page.waitForTimeout(200);
            break;
          case "type": {
            await element.click({ timeout: timeoutPerElement });
            await page.waitForTimeout(150);
            const searchTerm = testAction.element.toLowerCase().includes("search") ? "خدمات" : "test";
            await page.keyboard.type(searchTerm, { delay: 80 + Math.round(Math.random() * 40) });
            break;
          }
          case "select":
            await page.mouse.down();
            await page.waitForTimeout(60);
            await page.mouse.up();
            break;
        }

        const responseTimeMs = Date.now() - startTime;

        // Wait for any navigation/load triggered by the action
        await Promise.race([
          page.waitForLoadState("domcontentloaded", { timeout: 5000 }),
          page.waitForTimeout(1000),
        ]).catch(() => {});

        // Human-like pause after action
        await page.waitForTimeout(300 + Math.round(Math.random() * 150));

        // Screenshot AFTER — wrapped in try/catch in case page navigated away
        let afterScreenshot: Buffer = beforeScreenshot;
        const afterPath = path.join(artifactsDir, `element-${stepNum}-after.png`);
        try {
          afterScreenshot = await page.screenshot({ timeout: 5000 });
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

        // AI assesses the result (compare before/after screenshots)
        const assessment = await assessElementResult(testAction, beforeScreenshot, afterScreenshot, {
          urlChanged: urlBefore !== urlAfter,
          urlBefore,
          urlAfter,
          consoleErrors: newConsoleErrors,
          networkErrors: [],
          responseTimeMs,
          pageTitle,
        });

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
          try {
            const baseHost = new URL(url).hostname;
            const afterUrl = new URL(urlAfter);
            if (
              (afterUrl.hostname === baseHost || afterUrl.hostname.endsWith("." + baseHost)) &&
              !visitedPages.has(afterUrl.pathname) &&
              subPageQueue.length < 5 // limit depth to 5 sub-pages
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

        const failureResult: AgentStepResult = {
          testAction,
          status,
          actualBehavior: assessment,
          aiAssessment: assessment,
          responseTimeMs: timeoutPerElement,
          screenshotBefore: "",
          screenshotAfter: "",
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
        await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
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

        // Take screenshot of sub-page
        const subScreenshot = await page.screenshot({ fullPage: true });

        // Extract interactive elements on this sub-page
        const subHtmlStructure = await page.evaluate(() => {
          const selectors = [
            "nav a[href]", "header a[href]", "header button",
            "a[href]", "button", "[role='button']", "input", "select",
            "[role='tab']", "[role='menuitem']",
          ];
          const elements: string[] = [];
          const seen = new Set<Element>();
          for (const sel of selectors) {
            document.querySelectorAll(sel).forEach((el) => {
              if (seen.has(el)) return;
              seen.add(el);
              const tag = el.tagName.toLowerCase();
              const text = (el.textContent || "").trim().slice(0, 80);
              const href = el.getAttribute("href") || "";
              const role = el.getAttribute("role") || "";
              const className = (el.className || "").toString().slice(0, 100);
              const id = el.getAttribute("id") || "";
              const ariaLabel = el.getAttribute("aria-label") || "";
              const rect = el.getBoundingClientRect();
              if (rect.width === 0 || rect.height === 0) return;
              const style = window.getComputedStyle(el);
              if (style.display === "none" || style.visibility === "hidden") return;
              const attrs = [
                id ? `id="${id}"` : "", className ? `class="${className}"` : "",
                href ? `href="${href}"` : "", role ? `role="${role}"` : "",
                ariaLabel ? `aria-label="${ariaLabel}"` : "",
              ].filter(Boolean).join(" ");
              if (elements.length < 50) elements.push(`<${tag} ${attrs}>${text}</${tag}>`);
            });
          }
          return elements.join("\n");
        });

        const subMetadata = await page.evaluate(() => ({
          title: document.title,
          description: document.querySelector('meta[name="description"]')?.getAttribute("content") || undefined,
          lang: document.documentElement.lang || undefined,
        }));

        // Get accessibility tree for sub-page
        const subAccessTree = await getAccessibilityTree(page);
        const subFormattedTree = formatAccessibilityTree(subAccessTree);

        // AI analyzes the sub-page
        const subPlan = await analyzePageAndCreatePlan(subScreenshot, subHtmlStructure, subPageUrl, subMetadata, subFormattedTree);
        const subElements = subPlan.elements.filter((e) => {
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
              await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
              await page.waitForTimeout(500);
            }

            const element = await findElement(page, testAction);
            if (!element) {
              results.push({
                testAction, status: "warning", actualBehavior: "Element not found on sub-page",
                aiAssessment: "Could not locate element on sub-page.",
                responseTimeMs: 0, screenshotBefore: "", screenshotAfter: "",
                urlChanged: false, urlBefore: subPageUrl, urlAfter: subPageUrl,
                consoleErrors: [], networkErrors: [],
              });
              await prisma.elementTestResult.create({
                data: {
                  runId, elementText: testAction.element, elementType: testAction.type,
                  elementSelector: testAction.selector, parentSection: testAction.section,
                  action: testAction.action, status: "warning", responseTimeMs: 0,
                  error: "Selector not found on sub-page",
                },
              });
              emit({
                type: "testing", phase: "testing", status: "warning",
                description: `${testAction.element}: Not found on sub-page`,
                currentStep: stepNum, totalSteps: safeElements.length + subPageQueue.length * 5,
                elementType: testAction.type, responseTimeMs: 0,
              });
              continue;
            }

            const box = await element.boundingBox();
            const cx = box ? jitter(Math.round(box.x + box.width / 2)) : 0;
            const cy = box ? jitter(Math.round(box.y + box.height / 2)) : 0;
            send({ type: "cursor_move", data: { x: cx, y: cy, elementText: testAction.element, elementType: testAction.type } });
            await page.waitForTimeout(150);

            let beforeBuf: Buffer = Buffer.alloc(0);
            const bPath = path.join(artifactsDir, `element-${stepNum}-before.png`);
            try { beforeBuf = await page.screenshot({ timeout: 5000 }); await fs.writeFile(bPath, beforeBuf); } catch {}

            const urlB = page.url();
            const errCount = consoleLogBuffer.filter(l => l.level === "error").length;
            send({ type: "cursor_click", data: { x: cx, y: cy } });

            const t0 = Date.now();
            try { await element.click({ timeout: timeoutPerElement }); } catch { await page.mouse.click(cx, cy); }
            const rTime = Date.now() - t0;

            await Promise.race([
              page.waitForLoadState("domcontentloaded", { timeout: 5000 }),
              page.waitForTimeout(1000),
            ]).catch(() => {});
            await page.waitForTimeout(300);

            let afterBuf = beforeBuf;
            const aPath = path.join(artifactsDir, `element-${stepNum}-after.png`);
            try { afterBuf = await page.screenshot({ timeout: 5000 }); await fs.writeFile(aPath, afterBuf); } catch {}

            const urlA = page.url();
            const newErrors = consoleLogBuffer.filter(l => l.level === "error").slice(errCount).map(l => l.message);
            const pTitle = await page.title();

            const assess = await assessElementResult(testAction, beforeBuf, afterBuf, {
              urlChanged: urlB !== urlA, urlBefore: urlB, urlAfter: urlA,
              consoleErrors: newErrors, networkErrors: [], responseTimeMs: rTime, pageTitle: pTitle,
            });

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
            results.push({
              testAction, status: "warning", actualBehavior: errMsg,
              aiAssessment: errMsg, responseTimeMs: 0,
              screenshotBefore: "", screenshotAfter: "",
              urlChanged: false, urlBefore: subPageUrl, urlAfter: subPageUrl,
              consoleErrors: [], networkErrors: [],
            });
            await prisma.elementTestResult.create({
              data: {
                runId, elementText: testAction.element, elementType: testAction.type,
                elementSelector: testAction.selector, parentSection: testAction.section || "",
                action: testAction.action, status: "warning", responseTimeMs: 0,
                error: errMsg.slice(0, 500),
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
    const summary = await generateFinalSummary(
      testPlan.pageUnderstanding,
      results,
      totalDuration
    );

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
    const failed = results.filter(r => r.status === "failed").length;
    const warnings = results.filter(r => r.status === "warning").length;
    const overallStatus = failed > 0 ? "failed" : warnings > 0 ? "warning" : "passed";

    emit({
      type: "complete",
      phase: "complete",
      status: "completed",
      description: `Test complete: ${results.length} elements tested, ${failed} failed, ${warnings} warnings`,
      data: {
        overallStatus,
        totalDuration,
        passed: results.filter(r => r.status === "passed").length,
        failed,
        warnings,
      },
    });

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
// Helper: Find element using AI's selector
// ─────────────────────────────────────────
async function findElement(page: Page, testAction: AgentTestAction) {
  // Try the AI's suggested selector first
  try {
    const el = await page.locator(testAction.selector).first();
    if (await el.isVisible({ timeout: 2000 })) return el;
  } catch {}

  // Fallback: try finding by text content
  try {
    const textToFind = testAction.element
      .replace(/^(Navigation link|Button|Tab|Link|Dropdown|Menu item)\s*['"]?/i, "")
      .replace(/['"]?\s*$/, "");
    if (textToFind && textToFind.length > 2) {
      const el = page.getByText(textToFind, { exact: false }).first();
      if (await el.isVisible({ timeout: 2000 })) return el;
    }
  } catch {}

  // Fallback: try role + name
  try {
    const roleMap: Record<string, string> = {
      "button": "button",
      "nav-link": "link",
      "link": "link",
      "tab": "tab",
      "menu-item": "menuitem",
    };
    const role = roleMap[testAction.type];
    if (role) {
      const el = page.getByRole(role as any, {
        name: new RegExp(testAction.element.slice(0, 30), "i")
      }).first();
      if (await el.isVisible({ timeout: 2000 })) return el;
    }
  } catch {}

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
