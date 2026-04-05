// src/app/api/runs/[runId]/start/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeAITest } from "@/lib/ai-executor";
import { executeAITestMCP } from "@/lib/ai-executor-mcp";
import { processRunResult } from "@/lib/incidents";
import { broadcast } from "@/lib/ws-server";
import path from "path";

// Get AI execution mode from environment
const AI_MODE = process.env.AI_EXECUTION_MODE || "plan"; // "plan" or "mcp"

// POST /api/runs/[runId]/start - Start execution when client is ready
export async function POST(
  request: Request,
  { params }: { params: { runId: string } }
) {
  try {
    const runId = params.runId;
    console.log(`[START] Looking for run ${runId} in pendingRuns (size: ${global.pendingRuns?.size || 0})`);

    // Get pending run data
    const pendingData = global.pendingRuns?.get(runId);
    if (!pendingData) {
      console.log(`[START] Run ${runId} not found in pendingRuns`);
      return NextResponse.json(
        { error: "Run not found or already started" },
        { status: 404 }
      );
    }
    console.log(`[START] Found run ${runId}, starting execution`);

    // Remove from pending map
    global.pendingRuns.delete(runId);

    // Start execution in background
    executeRun(
      runId,
      pendingData.siteId,
      pendingData.baseUrl,
      pendingData.journeyId,
      pendingData.stepsJson
    ).catch((error) => {
      console.error(`Run ${runId} failed:`, error);
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error starting run:", error);
    return NextResponse.json(
      { error: error.message || "Failed to start run" },
      { status: 500 }
    );
  }
}

// Background execution function with AI executor
async function executeRun(
  runId: string,
  siteId: string,
  baseUrl: string,
  journeyId: string,
  stepsJson: string // Not used anymore - AI generates its own test plan
) {
  try {
    console.log(`[AI EXECUTOR] Starting AI-powered test for run ${runId} (mode: ${AI_MODE})`);

    // Get site info for better context
    const site = await prisma.site.findUnique({ where: { id: siteId } });

    // Set up artifacts directory
    const artifactsDir = path.join(process.cwd(), "artifacts", siteId, runId);

    // Choose execution mode
    if (AI_MODE === "mcp") {
      // ═══════════════════════════════════════════
      // MCP MODE: Iterative AI-controlled testing
      // ═══════════════════════════════════════════
      const result = await executeAITestMCP({
        url: baseUrl,
        runId,
        siteId,
        artifactsDir,
        maxIterations: 50,
        onProgress: (event) => {
          console.log(`[AI MCP] Progress: ${event.phase} - ${event.description}`);

          // Broadcast progress to live viewers
          if (event.type === "load") {
            broadcast(runId, {
              type: "run-status",
              status: "running",
              phase: event.description,
            });
          } else if (event.type === "testing") {
            broadcast(runId, {
              type: "step-update",
              step: {
                index: event.currentStep || 0,
                total: event.totalSteps || 0,
                description: event.description,
                status: event.status === "running" ? "running" : event.status === "completed" ? "passed" : "failed",
              },
            });
          } else if (event.type === "complete") {
            broadcast(runId, {
              type: "run-complete",
              status: event.status === "completed" ? "passed" : "failed",
              summary: result.summary,
            });
          }
        },
      });

      console.log(`[AI MCP] Test completed: ${result.status}, ${result.totalIterations} iterations`);

      // Update site lastRunAt
      await prisma.site.update({
        where: { id: siteId },
        data: { lastRunAt: new Date() },
      });

      // Process incidents for MCP mode
      const failedSteps = result.steps.filter((s) => !s.toolResult?.success);
      if (failedSteps.length > 0) {
        const mappedFailures = failedSteps.map((s) => ({
          status: "failed" as const,
          error: s.toolResult?.error || "Unknown error",
        }));
        await processRunResult(runId, siteId, journeyId, "failed", mappedFailures as any);
      } else {
        await processRunResult(runId, siteId, journeyId, "passed", [] as any);
      }

      console.log(`[AI MCP] Run ${runId} completed successfully`);
      return;
    }

    // ═══════════════════════════════════════════
    // PLAN MODE: AI plans upfront, then executes
    // ═══════════════════════════════════════════
    const result = await executeAITest({
      url: baseUrl,
      runId,
      siteId,
      artifactsDir,
      maxElements: 80,
      timeoutPerElement: 5000,
      onProgress: (event) => {
        // Broadcast progress to live viewers
        console.log(`[AI PLAN] Progress: ${event.phase} - ${event.description}`);

        // Map executor events to WebSocket message format
        if (event.type === "load") {
          broadcast(runId, {
            type: "run-status",
            status: "running",
            phase: "Loading page...",
          });
        } else if (event.type === "analysis") {
          broadcast(runId, {
            type: "run-status",
            status: "running",
            phase: "AI analyzing page...",
          });
        } else if (event.type === "testing") {
          broadcast(runId, {
            type: "step-update",
            step: {
              index: event.currentStep || 0,
              total: event.totalSteps || 0,
              elementType: event.elementType,
              description: event.description,
              status: event.status === "running" ? "running" : event.status === "completed" ? "passed" : "failed",
              responseTimeMs: event.responseTimeMs,
            },
          });
        } else if (event.type === "summary") {
          broadcast(runId, {
            type: "run-status",
            status: "running",
            phase: "Generating AI summary...",
          });
        } else if (event.type === "complete") {
          broadcast(runId, {
            type: "run-complete",
            status: event.status === "completed" ? "passed" : "failed",
            summary: event.data?.summary,
          });
        }
      },
    });

    console.log(`[AI EXECUTOR] Test completed with status: ${result.status}`);

    // Update site lastRunAt
    await prisma.site.update({
      where: { id: siteId },
      data: { lastRunAt: new Date() },
    });

    // Process incidents based on element test results
    const failedElements = result.elementResults.filter(
      (e) => e.status === "failed" || e.status === "error"
    );

    if (failedElements.length > 0) {
      // Map element results to incident-compatible format
      const failedSteps = failedElements.map((e) => ({
        status: e.status,
        error: e.error,
      }));

      await processRunResult(
        runId,
        siteId,
        journeyId,
        "failed",
        failedSteps as any
      );
    } else if (result.status === "error") {
      await processRunResult(
        runId,
        siteId,
        journeyId,
        "error",
        [{ status: "failed", error: result.error || "Unknown error" }] as any
      );
    } else {
      // All passed - resolve any open incidents
      await processRunResult(
        runId,
        siteId,
        journeyId,
        "passed",
        [] as any
      );
    }

    console.log(`[AI EXECUTOR] Run ${runId} completed successfully`);
  } catch (error) {
    console.error(`[AI EXECUTOR] Error executing run ${runId}:`, error);
    await prisma.run.update({
      where: { id: runId },
      data: {
        status: "error",
        errorJson: JSON.stringify({ message: (error as Error).message }),
        finishedAt: new Date(),
      },
    });

    // Broadcast error to clients
    broadcast(runId, {
      type: "run-complete",
      status: "error",
      error: (error as Error).message,
    });
  }
}
