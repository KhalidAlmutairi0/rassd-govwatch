// src/lib/ai-executor.ts
// AI Execution Engine — Runs AI's test plan with Playwright

import { Browser, Page, chromium, CDPSession } from "playwright";
import { analyzePageAndCreatePlan, assessElementResult, generateFinalSummary, AgentTestPlan, AgentTestAction, AgentStepResult } from "./ai-agent";
import { prisma } from "./prisma";
import { promises as fs } from "fs";
import path from "path";
import { getAccessibilityTree, formatAccessibilityTree } from "./accessibility-tree";

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

    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      locale: "ar-SA",
      timezoneId: "Asia/Riyadh",
      userAgent: "GovWatch/1.0 (Monitoring Bot)",
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

    // Navigate to URL — domcontentloaded is much faster than networkidle
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(500);

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

          if (elements.length < 60) { // cap at 60 to save tokens
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
    // PHASE 3: Execute Test Plan Element by Element
    // ─────────────────────────────────────────
    emit({
      type: "testing",
      phase: "testing",
      status: "running",
      description: `🔍 Testing ${safeElements.length} elements...`
    });

    for (let i = 0; i < safeElements.length; i++) {
      const testAction = safeElements[i];
      const stepNum = i; // 0-based index for frontend

      // Emit: starting this element
      emit({
        type: "testing",
        phase: "testing",
        status: "running",
        description: `Testing: ${testAction.element}`,
        currentStep: stepNum,
        totalSteps: safeElements.length,
        elementType: testAction.type,
        parentSection: testAction.section,
      });

      try {
        // Navigate back to original URL if we're on a different page
        if (page.url() !== url) {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
          await page.waitForTimeout(300);
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

          continue;
        }

        // Scroll element into view so it's visible during the live stream
        await element.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);

        // Get bounding box for cursor position
        const box = await element.boundingBox();
        const cursorX = box ? jitter(Math.round(box.x + box.width / 2)) : 0;
        const cursorY = box ? jitter(Math.round(box.y + box.height / 2)) : 0;

        // Human-like smooth mouse move to the element (with intermediate steps)
        await page.mouse.move(cursorX, cursorY, { steps: 12 });

        // Broadcast cursor position for animated cursor overlay
        send({
          type: "cursor_move",
          data: { x: cursorX, y: cursorY, elementText: testAction.element, elementType: testAction.type },
        });

        // Brief pause before acting — humans look before they click
        await page.waitForTimeout(120 + Math.round(Math.random() * 80));

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
          .map(l => l.message);
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

        // Emit result for this element
        emit({
          type: "testing",
          phase: "testing",
          status: assessment.status === "passed" ? "completed" : assessment.status as any,
          description: `${testAction.element}: ${assessment.assessment}`,
          currentStep: stepNum,
          totalSteps: safeElements.length,
          elementType: testAction.type,
          responseTimeMs,
        });

      } catch (error: any) {
        const failureResult: AgentStepResult = {
          testAction,
          status: "failed",
          actualBehavior: `Error: ${error.message}`,
          aiAssessment: `Element interaction failed: ${error.message}`,
          responseTimeMs: timeoutPerElement,
          screenshotBefore: "",
          screenshotAfter: "",
          urlChanged: false,
          urlBefore: url,
          urlAfter: url,
          consoleErrors: [error.message],
          networkErrors: [],
        };

        results.push(failureResult);

        // Store in database
        await prisma.elementTestResult.create({
          data: {
            runId,
            elementText: testAction.element,
            elementType: testAction.type,
            elementSelector: testAction.selector,
            parentSection: testAction.section,
            action: testAction.action,
            status: "failed",
            responseTimeMs: timeoutPerElement,
            error: `${error.message}. ${failureResult.actualBehavior || ''} ${failureResult.aiAssessment || ''}`.trim(),
            consoleErrors: JSON.stringify([error.message]),
          },
        });

        emit({
          type: "testing",
          phase: "testing",
          status: "failed",
          description: `${testAction.element}: ${error.message}`,
          currentStep: stepNum,
          totalSteps: safeElements.length,
        });
      }

      // Rate limiting — wait between elements
      await page.waitForTimeout(100);
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

    // Store summary in database
    await prisma.run.update({
      where: { id: runId },
      data: {
        aiSummary: summary,
        summaryJson: JSON.stringify({ text: summary }),
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
