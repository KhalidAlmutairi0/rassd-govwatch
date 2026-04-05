// src/lib/ai-executor-mcp.ts
// MCP-Based Executor — Iterative AI-controlled browser testing

import { Browser, Page, chromium, CDPSession } from "playwright";
import { runMCPAgent, MCPAgentStep } from "./ai-agent-mcp";
import { executeMCPTool, ToolExecutionContext } from "./mcp-tools";
import { prisma } from "./prisma";
import { promises as fs } from "fs";
import path from "path";

interface MCPExecutorOptions {
  url: string;
  runId: string;
  siteId: string;
  artifactsDir: string;
  maxIterations?: number;
  onProgress?: (event: ProgressEvent) => void;
}

export interface ProgressEvent {
  type: "load" | "analysis" | "testing" | "summary" | "complete";
  phase: string;
  status: "running" | "completed" | "failed" | "warning";
  description: string;
  currentStep?: number;
  totalSteps?: number;
  data?: any;
}

export interface MCPExecutorResult {
  steps: MCPAgentStep[];
  summary: string;
  totalIterations: number;
  durationMs: number;
  status: "passed" | "failed" | "warning";
  visitedUrls: string[];
}

export async function executeAITestMCP(options: MCPExecutorOptions): Promise<MCPExecutorResult> {
  const {
    url,
    runId,
    siteId,
    artifactsDir,
    maxIterations = 50,
    onProgress,
  } = options;

  const emit = (event: ProgressEvent) => {
    if (onProgress) onProgress(event);
  };

  let browser: Browser | null = null;
  let page: Page | null = null;
  let cdpSession: CDPSession | null = null;

  const startTime = Date.now();

  try {
    // Ensure artifacts directory exists
    await fs.mkdir(artifactsDir, { recursive: true });

    // ─────────────────────────────────────────
    // PHASE 1: Launch Browser
    // ─────────────────────────────────────────
    emit({
      type: "load",
      phase: "load",
      status: "running",
      description: "Launching browser and loading page..."
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

    // Start CDP Screencast for live view
    cdpSession = await page.context().newCDPSession(page);
    await startScreencast(cdpSession, runId, emit);

    // Navigate to initial URL
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    emit({
      type: "load",
      phase: "load",
      status: "completed",
      description: "Browser ready, starting AI agent..."
    });

    // ─────────────────────────────────────────
    // PHASE 2: Run MCP Agent (Iterative Testing)
    // ─────────────────────────────────────────
    emit({
      type: "testing",
      phase: "testing",
      status: "running",
      description: "🤖 AI agent is exploring and testing the website..."
    });

    // Create tool execution context
    const toolContext: ToolExecutionContext = {
      page,
      baseUrl: url,
      visitedUrls: new Set([url]),
      actions: [],
    };

    // Track step number for UI
    let stepNumber = 0;

    // Run AI agent with tool callback
    const agentResult = await runMCPAgent(
      { url, maxIterations },
      async (toolName, input) => {
        stepNumber++;

        emit({
          type: "testing",
          phase: "testing",
          status: "running",
          description: `Step ${stepNumber}: ${toolName} - ${JSON.stringify(input).substring(0, 50)}...`,
          currentStep: stepNumber,
          totalSteps: maxIterations,
        });

        // Execute tool
        const result = await executeMCPTool(toolName, input, toolContext);

        // Save screenshot artifact
        if (result.screenshot) {
          const screenshotPath = path.join(artifactsDir, `step-${stepNumber}.png`);
          await fs.writeFile(screenshotPath, result.screenshot);

          await prisma.artifact.create({
            data: {
              runId,
              type: "screenshot",
              path: screenshotPath,
            },
          });
        }

        // Store action in context
        toolContext.actions.push({
          tool: toolName,
          input,
          result,
          timestamp: Date.now(),
        });

        // Save step to database
        await prisma.runStep.create({
          data: {
            runId,
            stepIndex: stepNumber - 1,
            action: toolName,
            description: `${toolName}: ${input.name || input.url || input.text || ""}`.substring(0, 200),
            status: result.success ? "passed" : "failed",
            durationMs: 0,
            error: result.error,
            metadata: JSON.stringify({ input, result: result.data }),
          },
        });

        emit({
          type: "testing",
          phase: "testing",
          status: result.success ? "completed" : "failed",
          description: `Step ${stepNumber}: ${result.success ? "✅ Success" : "❌ " + result.error}`,
          currentStep: stepNumber,
          totalSteps: maxIterations,
        });

        return result;
      }
    );

    emit({
      type: "testing",
      phase: "testing",
      status: "completed",
      description: `Completed ${agentResult.totalIterations} testing steps`
    });

    // ─────────────────────────────────────────
    // PHASE 3: Save Artifacts
    // ─────────────────────────────────────────
    emit({
      type: "summary",
      phase: "summary",
      status: "running",
      description: "Saving artifacts and generating report..."
    });

    // Save trace if enabled
    if (context.tracing) {
      const tracePath = path.join(artifactsDir, "trace.zip");
      await context.tracing.stop({ path: tracePath });
      await prisma.artifact.create({
        data: { runId, type: "trace", path: tracePath },
      });
    }

    // Save MCP session log
    const sessionLogPath = path.join(artifactsDir, "mcp-session.json");
    await fs.writeFile(sessionLogPath, JSON.stringify(agentResult.steps, null, 2));
    await prisma.artifact.create({
      data: { runId, type: "console", path: sessionLogPath },
    });

    // ─────────────────────────────────────────
    // PHASE 4: Update Database
    // ─────────────────────────────────────────
    const durationMs = Date.now() - startTime;

    const failedSteps = agentResult.steps.filter((s) => !s.toolResult.success).length;
    const passedSteps = agentResult.steps.length - failedSteps;
    const status = failedSteps === 0 ? "passed" : failedSteps < agentResult.steps.length * 0.3 ? "warning" : "failed";

    await prisma.run.update({
      where: { id: runId },
      data: {
        status,
        durationMs,
        totalSteps: agentResult.steps.length,
        passedSteps,
        failedSteps,
        aiSummary: agentResult.finalSummary,
        summaryJson: JSON.stringify({
          text: agentResult.finalSummary,
          iterations: agentResult.totalIterations,
          mode: "mcp"
        }),
        finishedAt: new Date(),
      },
    });

    emit({
      type: "complete",
      phase: "complete",
      status: "completed",
      description: `Testing complete! ${passedSteps} passed, ${failedSteps} failed`,
      data: {
        totalIterations: agentResult.totalIterations,
        status,
      },
    });

    return {
      steps: agentResult.steps,
      summary: agentResult.finalSummary,
      totalIterations: agentResult.totalIterations,
      durationMs,
      status: status as any,
      visitedUrls: Array.from(toolContext.visitedUrls),
    };

  } finally {
    if (cdpSession) {
      await cdpSession.send("Page.stopScreencast").catch(() => {});
    }
    if (browser) {
      await browser.close();
    }
  }
}

// ─────────────────────────────────────────
// CDP Screencast for Live View
// ─────────────────────────────────────────

async function startScreencast(
  cdp: CDPSession,
  runId: string,
  emit: (event: ProgressEvent) => void
) {
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 50,
    maxWidth: 1280,
    maxHeight: 720,
    everyNthFrame: 3,
  });

  cdp.on("Page.screencastFrame", async ({ data, sessionId }) => {
    // Broadcast frame via WebSocket (if ws-server is imported)
    try {
      const { broadcast } = await import("./ws-server");
      broadcast(runId, {
        type: "browser-frame",
        image: `data:image/jpeg;base64,${data}`,
      });
    } catch {}

    await cdp.send("Page.screencastFrameAck", { sessionId });
  });
}
