// src/lib/executor.ts
import { chromium, Browser, BrowserContext, Page, CDPSession } from "playwright";
import { promises as fs } from "fs";
import { broadcast } from "./ws-server";
import { prisma } from "./prisma";
import { TestStep } from "./validators";
import { discoverElements, DiscoveredElement } from "./element-discovery";
import { testElement, ElementTestResult } from "./element-tester";

interface ExecutorConfig {
  runId: string;
  siteId: string;
  baseUrl: string;
  steps: TestStep[];
  enableScreencast?: boolean;
  enableVideo?: boolean;
  enableTrace?: boolean;
}

interface StepResult {
  stepIndex: number;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  screenshotPath?: string;
  error?: string;
  metadata?: any;
}

export class PlaywrightExecutor {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private cdp: CDPSession | null = null;
  private consoleLogs: Array<{ level: string; message: string; timestamp: number }> = [];
  private networkLogs: Array<{
    url: string;
    method: string;
    status: number;
    timing: number;
    size: number;
  }> = [];

  async execute(config: ExecutorConfig): Promise<{
    steps: StepResult[];
    overallStatus: "passed" | "failed" | "error";
    durationMs: number;
  }> {
    const startTime = Date.now();
    const artifactDir = `artifacts/${config.siteId}/${config.runId}`;
    const results: StepResult[] = [];

    try {
      // Ensure artifact directory exists
      await fs.mkdir(artifactDir, { recursive: true });

      // Launch browser
      this.browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      });

      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
        locale: "ar-SA",
        timezoneId: "Asia/Riyadh",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        ...(config.enableVideo ? { recordVideo: { dir: artifactDir, size: { width: 1280, height: 720 } } } : {}),
      });

      // Start trace
      if (config.enableTrace !== false) {
        await this.context.tracing.start({
          screenshots: true,
          snapshots: true,
          sources: false,
        });
      }

      this.page = await this.context.newPage();

      // ── Collect console logs ──
      this.page.on("console", (msg) => {
        this.consoleLogs.push({
          level: msg.type(),
          message: msg.text(),
          timestamp: Date.now(),
        });
      });

      // ── Collect network logs ──
      this.page.on("response", async (response) => {
        const timing = response.request().timing();
        this.networkLogs.push({
          url: response.url(),
          method: response.request().method(),
          status: response.status(),
          timing: timing.responseEnd || 0,
          size: (await response.body().catch(() => Buffer.alloc(0))).length,
        });
      });

      // ── Start CDP Screencast if enabled ──
      if (config.enableScreencast !== false) {
        await this.startScreencast(config.runId);
      }

      // ── Update run status to "running" ──
      await prisma.run.update({
        where: { id: config.runId },
        data: { status: "running" },
      });
      broadcast(config.runId, { type: "run-status", status: "running" });

      // ── Execute each step ──
      for (let i = 0; i < config.steps.length; i++) {
        const step = config.steps[i];

        // Broadcast step start
        broadcast(config.runId, {
          type: "step-update",
          step: {
            index: i,
            action: step.action,
            description: step.description,
            status: "running",
          },
        });

        const result = await this.executeStep(step, i, config);
        results.push(result);

        // Save step to DB
        await prisma.runStep.create({
          data: {
            runId: config.runId,
            stepIndex: i,
            action: step.action,
            description: step.description,
            selector: step.selector,
            value: step.value,
            url: step.url,
            status: result.status,
            durationMs: result.durationMs,
            screenshotPath: result.screenshotPath,
            error: result.error,
            metadata: result.metadata ? JSON.stringify(result.metadata) : null,
          },
        });

        // Broadcast step result
        broadcast(config.runId, {
          type: "step-update",
          step: {
            index: i,
            action: step.action,
            description: step.description,
            status: result.status,
            durationMs: result.durationMs,
            error: result.error,
          },
        });
      }

      // ── Save artifacts ──
      // Trace
      if (config.enableTrace !== false) {
        const tracePath = `${artifactDir}/trace.zip`;
        await this.context.tracing.stop({ path: tracePath });
        const stats = await fs.stat(tracePath);
        await prisma.artifact.create({
          data: { runId: config.runId, type: "trace", path: tracePath, sizeBytes: stats.size },
        });
      }

      // Console logs
      const consolePath = `${artifactDir}/console.json`;
      await fs.writeFile(consolePath, JSON.stringify(this.consoleLogs, null, 2));
      const consoleStats = await fs.stat(consolePath);
      await prisma.artifact.create({
        data: { runId: config.runId, type: "console", path: consolePath, sizeBytes: consoleStats.size },
      });

      // Network logs
      const networkPath = `${artifactDir}/network.json`;
      await fs.writeFile(networkPath, JSON.stringify(this.networkLogs, null, 2));
      const networkStats = await fs.stat(networkPath);
      await prisma.artifact.create({
        data: { runId: config.runId, type: "network", path: networkPath, sizeBytes: networkStats.size },
      });

      // Calculate overall status
      const overallStatus = results.some((r) => r.status === "failed") ? "failed" : "passed";
      const durationMs = Date.now() - startTime;

      return { steps: results, overallStatus, durationMs };

    } catch (error: any) {
      return {
        steps: results,
        overallStatus: "error",
        durationMs: Date.now() - startTime,
      };
    } finally {
      // Cleanup
      if (this.cdp) await this.stopScreencast();
      if (this.context) await this.context.close().catch(() => {});
      if (this.browser) await this.browser.close().catch(() => {});
    }
  }

  private async executeStep(
    step: TestStep,
    index: number,
    config: ExecutorConfig
  ): Promise<StepResult> {
    const startTime = Date.now();
    const artifactDir = `artifacts/${config.siteId}/${config.runId}`;

    try {
      switch (step.action) {
        case "navigate": {
          // SAFETY: Verify same-domain
          if (step.url && !this.isSameDomain(config.baseUrl, step.url)) {
            throw new Error(`Navigation blocked: ${step.url} is outside target domain`);
          }
          await this.page!.goto(step.url || config.baseUrl, {
            timeout: 30000,
            waitUntil: "domcontentloaded",
          });
          break;
        }

        case "click": {
          if (!step.selector) throw new Error("Click step requires a selector");
          await this.page!.waitForSelector(step.selector, { timeout: 10000 });
          // SAFETY: Verify the link is same-domain before clicking
          const href = await this.page!.$eval(step.selector, (el) =>
            el instanceof HTMLAnchorElement ? el.href : null
          ).catch(() => null);
          if (href && !this.isSameDomain(config.baseUrl, href)) {
            throw new Error(`Click blocked: target ${href} is outside domain`);
          }
          await this.page!.click(step.selector, { timeout: 10000 });
          await this.page!.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
          break;
        }

        case "type": {
          if (!step.selector || !step.value) throw new Error("Type step requires selector and value");
          await this.page!.waitForSelector(step.selector, { timeout: 10000 });
          await this.page!.fill(step.selector, step.value);
          break;
        }

        case "assert_title": {
          const title = await this.page!.title();
          if (!title || title.trim().length === 0) {
            throw new Error("Page title is empty");
          }
          break;
        }

        case "assert_element": {
          if (!step.selector) throw new Error("Assert element requires a selector");
          await this.page!.waitForSelector(step.selector, {
            timeout: 10000,
            state: "visible",
          });
          break;
        }

        case "screenshot": {
          // Screenshot is taken below for all steps anyway
          break;
        }

        case "detect_search": {
          const selectors = [
            'input[type="search"]',
            'input[placeholder*="search" i]',
            'input[placeholder*="بحث"]',
            'input[name*="search" i]',
            'input[aria-label*="search" i]',
            'input[aria-label*="بحث"]',
          ];
          let found = false;
          for (const sel of selectors) {
            const el = await this.page!.$(sel);
            if (el) {
              found = true;
              break;
            }
          }
          if (!found) throw new Error("No search input detected");
          break;
        }

        case "detect_forms": {
          const formCount = await this.page!.$$eval("form", (forms) => forms.length);
          if (formCount === 0) throw new Error("No forms detected");
          // DO NOT SUBMIT — just verify presence
          break;
        }

        case "discover_links": {
          const links = await this.page!.$$eval("a[href]", (anchors) =>
            anchors.slice(0, 20).map((a) => ({
              text: a.textContent?.trim() || "",
              href: a.getAttribute("href") || "",
            }))
          );
          return {
            stepIndex: index,
            status: "passed",
            durationMs: Date.now() - startTime,
            metadata: { links },
          };
        }

        case "wait": {
          await this.page!.waitForTimeout(Math.min(step.timeout || 2000, 5000));
          break;
        }

        case "discover_and_test_elements": {
          // Discover all interactive elements
          const elements = await discoverElements(this.page!, config.baseUrl);

          console.log(`[Executor] Discovered ${elements.length} elements to test`);

          // Broadcast element discovery
          broadcast(config.runId, {
            type: "elements-discovered",
            count: elements.length,
          });

          // Test each element
          for (let i = 0; i < elements.length; i++) {
            const element = elements[i];

            // Emit cursor move event
            await this.emitCursorEvent(config.runId, element, 'move');

            // Test the element
            const testResult = await testElement(
              this.page!,
              element,
              artifactDir,
              i,
              config.baseUrl
            );

            // Emit cursor click event
            if (testResult.status === 'passed') {
              await this.emitCursorEvent(config.runId, element, 'click');
            }

            // Save element test result to database
            await prisma.elementTestResult.create({
              data: {
                runId: config.runId,
                elementType: element.type,
                elementText: element.text,
                elementTextAr: element.textAr,
                elementSelector: element.selector,
                parentSection: element.parentSection,
                action: element.action,
                status: testResult.status,
                responseTimeMs: testResult.responseTimeMs,
                urlBefore: testResult.urlBefore,
                urlAfter: testResult.urlAfter,
                urlChanged: testResult.urlChanged,
                screenshotBefore: testResult.screenshotBefore,
                screenshotAfter: testResult.screenshotAfter,
                consoleErrors: JSON.stringify(testResult.consoleErrors),
                networkErrors: JSON.stringify(testResult.networkErrors),
                domChanges: testResult.domChanges,
                error: testResult.error,
                cursorX: Math.round(element.boundingBox.x + element.boundingBox.width / 2),
                cursorY: Math.round(element.boundingBox.y + element.boundingBox.height / 2),
              },
            });

            // Broadcast element test progress
            broadcast(config.runId, {
              type: "element-tested",
              index: i,
              total: elements.length,
              element: {
                text: element.text,
                type: element.type,
                status: testResult.status,
                durationMs: testResult.responseTimeMs,
              },
            });

            // Wait a bit between element tests to avoid overwhelming the site
            await this.page!.waitForTimeout(800);
          }

          return {
            stepIndex: index,
            status: "passed",
            durationMs: Date.now() - startTime,
            metadata: { elementsCount: elements.length },
          };
        }

        default:
          throw new Error(`Unknown action: ${step.action}`);
      }

      // Take screenshot for every step
      const screenshotPath = `${artifactDir}/step-${index}.png`;
      await this.page!.screenshot({
        path: screenshotPath,
        fullPage: false,
      });

      const screenshotStats = await fs.stat(screenshotPath);
      await prisma.artifact.create({
        data: {
          runId: config.runId,
          type: "screenshot",
          path: screenshotPath,
          sizeBytes: screenshotStats.size,
        },
      });

      return {
        stepIndex: index,
        status: "passed",
        durationMs: Date.now() - startTime,
        screenshotPath,
      };

    } catch (error: any) {
      // Still try to take an error screenshot
      let screenshotPath: string | undefined;
      try {
        screenshotPath = `${artifactDir}/step-${index}-error.png`;
        await this.page!.screenshot({ path: screenshotPath, fullPage: false });
        await prisma.artifact.create({
          data: {
            runId: config.runId,
            type: "screenshot",
            path: screenshotPath,
          },
        });
      } catch {}

      return {
        stepIndex: index,
        status: "failed",
        durationMs: Date.now() - startTime,
        screenshotPath,
        error: error.message,
      };
    }
  }

  // ── SAFETY: Domain enforcement ──
  private isSameDomain(baseUrl: string, targetUrl: string): boolean {
    try {
      const base = new URL(baseUrl);
      const target = new URL(targetUrl);
      return (
        target.hostname === base.hostname ||
        target.hostname.endsWith("." + base.hostname)
      );
    } catch {
      return false;
    }
  }

  // ── CDP Screencast ──
  private async startScreencast(runId: string) {
    this.cdp = await this.page!.context().newCDPSession(this.page!);

    await this.cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: 50,
      maxWidth: 1280,
      maxHeight: 720,
      everyNthFrame: 3,
    });

    this.cdp.on("Page.screencastFrame", async ({ data, sessionId }) => {
      broadcast(runId, {
        type: "browser-frame",
        image: `data:image/jpeg;base64,${data}`,
      });
      await this.cdp!.send("Page.screencastFrameAck", { sessionId });
    });
  }

  private async stopScreencast() {
    if (this.cdp) {
      await this.cdp.send("Page.stopScreencast").catch(() => {});
    }
  }

  // ── Cursor Events for Live View ──
  private async emitCursorEvent(runId: string, element: DiscoveredElement, action: 'move' | 'click') {
    const cursorX = Math.round(element.boundingBox.x + element.boundingBox.width / 2);
    const cursorY = Math.round(element.boundingBox.y + element.boundingBox.height / 2);

    if (action === 'move') {
      broadcast(runId, {
        type: 'cursor_move',
        data: {
          x: cursorX,
          y: cursorY,
          elementText: element.text,
          elementType: element.type,
          action: 'move',
          timestamp: Date.now(),
        },
      });

      // Wait for cursor animation to complete
      await new Promise(resolve => setTimeout(resolve, 600));
    } else if (action === 'click') {
      broadcast(runId, {
        type: 'cursor_click',
        data: {
          x: cursorX,
          y: cursorY,
          elementText: element.text,
          timestamp: Date.now(),
        },
      });

      // Wait for click animation
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
}

export type { ExecutorConfig, StepResult };
