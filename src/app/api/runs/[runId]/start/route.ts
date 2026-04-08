// src/app/api/runs/[runId]/start/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeAITest } from "@/lib/ai-executor";
import { executeAITestMCP } from "@/lib/ai-executor-mcp";
import { processRunResult } from "@/lib/incidents";
import { broadcast, createRelayConnection } from "@/lib/ws-server";
import { ensureWebSocketServer } from "@/lib/init-ws";
import { WebSocket } from "ws";
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
    console.log(`[START] Looking for run ${runId}`);

    // First check if run exists in database
    const run = await prisma.run.findUnique({
      where: { id: runId },
      include: { site: true, journey: true },
    });

    if (!run) {
      console.log(`[START] Run ${runId} not found in database`);
      return NextResponse.json(
        { error: "Run not found" },
        { status: 404 }
      );
    }

    // Check if run is already running or completed
    if (run.status !== "queued") {
      console.log(`[START] Run ${runId} already started (status: ${run.status})`);

      // If it's still running, that's OK - client can still watch
      if (run.status === "running") {
        return NextResponse.json({
          success: true,
          alreadyRunning: true,
          message: "Run is already in progress"
        });
      }

      // If it's completed, redirect client to report
      return NextResponse.json(
        {
          error: `Run already ${run.status}`,
          redirect: `/report/${runId}`
        },
        { status: 400 }
      );
    }

    console.log(`[START] Starting run ${runId} for site ${run.site.name}`);

    // Check if this is a pending run (from Quick Test flow)
    const pendingData = global.pendingRuns?.get(runId);
    if (pendingData) {
      // Remove from pending map
      global.pendingRuns.delete(runId);
    }

    // Start execution in background
    executeRun(
      runId,
      run.siteId,
      run.site.baseUrl,
      run.journeyId,
      run.journey?.stepsJson || "[]"
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
  stepsJson: string
) {
  // ── Build a "send" helper that reaches the live browser viewer ──
  // The WS server may live in the worker process (port 3003). We create a
  // relay WebSocket to it so messages cross the process boundary.
  // If the relay can't connect (worker not running), we fall back to direct
  // broadcast (same-process WS server started via ensureWebSocketServer).
  ensureWebSocketServer();
  const relay: WebSocket = createRelayConnection(runId);
  await new Promise<void>((resolve) => {
    relay.on("open", resolve);
    relay.on("error", () => resolve());
    setTimeout(resolve, 2000);
  });

  const send = (msg: object) => {
    const payload = JSON.stringify(msg);
    if (relay.readyState === WebSocket.OPEN) {
      relay.send(payload);
    } else {
      // Fallback: same-process direct broadcast
      broadcast(runId, msg);
    }
  };

  try {
    console.log(`[AI EXECUTOR] Starting AI-powered test for run ${runId} (mode: ${AI_MODE})`);

    const artifactsDir = path.join(process.cwd(), "artifacts", siteId, runId);

    if (AI_MODE === "mcp") {
      const result = await executeAITestMCP({
        url: baseUrl,
        runId,
        siteId,
        artifactsDir,
        maxIterations: 50,
        onProgress: (event) => {
          console.log(`[AI MCP] Progress: ${event.phase} - ${event.description}`);
          if (event.type === "load") {
            send({ type: "run-status", status: "running", phase: event.description });
          } else if (event.type === "testing") {
            send({
              type: "step-update",
              step: {
                index: event.currentStep || 0,
                total: event.totalSteps || 0,
                description: event.description,
                status: event.status === "running" ? "running" : event.status === "completed" ? "passed" : "failed",
              },
            });
          } else if (event.type === "complete") {
            send({ type: "run-complete", status: event.status === "completed" ? "passed" : "failed", summary: result.summary });
          }
        },
      });

      console.log(`[AI MCP] Test completed: ${result.status}, ${result.totalIterations} iterations`);
      await prisma.site.update({ where: { id: siteId }, data: { lastRunAt: new Date() } });

      const failedSteps = result.steps.filter((s) => !s.toolResult?.success);
      if (failedSteps.length > 0) {
        await processRunResult(runId, siteId, journeyId, "failed",
          failedSteps.map((s) => ({ status: "failed" as const, error: s.toolResult?.error || "Unknown error" })) as any);
      } else {
        await processRunResult(runId, siteId, journeyId, "passed", [] as any);
      }
      return;
    }

    // ── PLAN MODE ──
    const result = await executeAITest({
      url: baseUrl,
      runId,
      siteId,
      artifactsDir,
      maxElements: 20,
      timeoutPerElement: 4000,
      onBroadcast: send,  // ← browser frames + cursor events go through relay
      onProgress: (event) => {
        console.log(`[AI PLAN] Progress: ${event.phase} - ${event.description}`);
        if (event.type === "load") {
          send({ type: "run-status", status: "running", phase: "Loading page..." });
        } else if (event.type === "analysis") {
          send({ type: "run-status", status: "running", phase: "AI analyzing page..." });
        } else if (event.type === "testing") {
          send({
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
          send({ type: "run-status", status: "running", phase: "Generating AI summary..." });
        } else if (event.type === "complete") {
          send({ type: "run-complete", status: event.status === "completed" ? "passed" : "failed", summary: event.data?.summary });
        }
      },
    });

    console.log(`[AI EXECUTOR] Test completed with status: ${result.overallStatus}`);

    await prisma.site.update({ where: { id: siteId }, data: { lastRunAt: new Date() } });

    const failedElements = result.results.filter((e) => e.status === "failed");
    if (failedElements.length > 0) {
      await processRunResult(runId, siteId, journeyId, "failed",
        failedElements.map((e) => ({ status: "failed" as const, error: e.actualBehavior })) as any);
    } else if (result.overallStatus === "failed") {
      await processRunResult(runId, siteId, journeyId, "failed", [{ status: "failed", error: "Test failed" }] as any);
    } else {
      await processRunResult(runId, siteId, journeyId, "passed", [] as any);
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
    send({ type: "run-complete", status: "error", error: (error as Error).message });
  } finally {
    relay.close();
  }
}
