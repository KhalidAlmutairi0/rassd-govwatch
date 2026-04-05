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
  maxElements?: number;        // Default 80
  timeoutPerElement?: number;  // Default 5000ms
  onProgress?: (event: ProgressEvent) => void;  // Callback for progress updates
}

export interface ProgressEvent {
  type: "load" | "analysis" | "testing" | "summary" | "complete";
  phase: string;
  status: "running" | "completed" | "failed" | "warning";
  description: string;
  currentStep?: number;
  totalSteps?: number;
  elementType?: string;
  elementSection?: string;
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

export async function executeAITest(options: ExecutorOptions): Promise<ExecutorResult> {
  const {
    url, runId, siteId, artifactsDir,
    maxElements = 80,
    timeoutPerElement = 5000,
    onProgress
  } = options;

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

    // Navigate to URL
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000); // Let page fully render

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

    // Extract simplified HTML structure (only interactive elements)
    const htmlStructure = await page.evaluate(() => {
      const interactiveSelectors = [
        "a[href]", "button", "[role='button']", "input", "select", "textarea",
        "[role='tab']", "[role='menuitem']", "[role='link']",
        "[onclick]", "[data-toggle]", "[data-bs-toggle]",
        ".btn", "[class*='button']", "[class*='dropdown']",
        "[class*='accordion']", "[class*='carousel']",
        "nav a", "nav button", "header a", "header button"
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

          elements.push(`<${tag} ${attrs}>${text}</${tag}>`);
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
      const stepNum = i + 1;

      // Emit: starting this element
      emit({
        type: "testing",
        phase: "testing",
        status: "running",
        description: `Testing: ${testAction.element}`,
        currentStep: stepNum,
        totalSteps: safeElements.length,
        elementType: testAction.type,
        elementSection: testAction.section,
      });

      try {
        // Navigate back to original URL if we're on a different page
        if (page.url() !== url) {
          await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
          await page.waitForTimeout(1000);
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
              elementName: testAction.element,
              elementType: testAction.type,
              elementSelector: testAction.selector,
              elementSection: testAction.section,
              action: testAction.action,
              priority: testAction.priority,
              reason: testAction.reason,
              expectedBehavior: testAction.expectedBehavior,
              status: "warning",
              responseTimeMs: 0,
              actualBehavior: result.actualBehavior,
              aiAssessment: result.aiAssessment,
            },
          });

          continue;
        }

        // Scroll into view
        await element.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);

        // Get bounding box for cursor position
        const box = await element.boundingBox();
        const cursorX = box ? Math.round(box.x + box.width / 2) : 0;
        const cursorY = box ? Math.round(box.y + box.height / 2) : 0;

        // Emit cursor move event (for live view)
        emit({
          type: "testing",
          phase: "cursor_move",
          status: "running",
          description: `Moving cursor to ${testAction.element}`,
          data: {
            x: cursorX,
            y: cursorY,
            elementText: testAction.element,
            elementType: testAction.type,
          },
        });

        await page.waitForTimeout(600); // Wait for cursor animation

        // Screenshot BEFORE
        const beforeScreenshot = await page.screenshot();
        const beforePath = path.join(artifactsDir, `element-${stepNum}-before.png`);
        await fs.writeFile(beforePath, beforeScreenshot);

        // Record state before action
        const urlBefore = page.url();
        const consoleErrorsCount = consoleLogBuffer.filter(l => l.level === "error").length;

        // Emit cursor click
        emit({
          type: "testing",
          phase: "cursor_click",
          status: "running",
          description: `Clicking ${testAction.element}`,
          data: { x: cursorX, y: cursorY },
        });

        // Perform the action
        const startTime = Date.now();

        switch (testAction.action) {
          case "click":
            await element.click({ timeout: timeoutPerElement });
            break;
          case "hover":
            await element.hover({ timeout: timeoutPerElement });
            break;
          case "type":
            await element.fill("test", { timeout: timeoutPerElement });
            break;
          case "select":
            await element.click({ timeout: timeoutPerElement });
            break;
        }

        const responseTimeMs = Date.now() - startTime;

        // Wait for any response/animation
        await page.waitForTimeout(1500);

        // Screenshot AFTER
        const afterScreenshot = await page.screenshot();
        const afterPath = path.join(artifactsDir, `element-${stepNum}-after.png`);
        await fs.writeFile(afterPath, afterScreenshot);

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
            elementName: testAction.element,
            elementType: testAction.type,
            elementSelector: testAction.selector,
            elementSection: testAction.section,
            action: testAction.action,
            priority: testAction.priority,
            reason: testAction.reason,
            expectedBehavior: testAction.expectedBehavior,
            status: assessment.status,
            responseTimeMs,
            urlBefore,
            urlAfter,
            urlChanged: urlBefore !== urlAfter,
            screenshotBefore: beforePath,
            screenshotAfter: afterPath,
            consoleErrors: JSON.stringify(newConsoleErrors),
            networkErrors: JSON.stringify([]),
            actualBehavior: assessment.assessment,
            aiAssessment: assessment.assessment,
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
            elementName: testAction.element,
            elementType: testAction.type,
            elementSelector: testAction.selector,
            elementSection: testAction.section,
            action: testAction.action,
            status: "failed",
            responseTimeMs: timeoutPerElement,
            error: error.message,
            consoleErrors: JSON.stringify([error.message]),
            actualBehavior: failureResult.actualBehavior,
            aiAssessment: failureResult.aiAssessment,
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
      await page.waitForTimeout(500);
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
