// src/app/api/test/route.ts
import { NextResponse } from "next/server";
import { chromium } from "playwright";
import { prisma } from "@/lib/prisma";
import { analyzePage } from "@/lib/page-analyzer";
import { generateSmokeTest } from "@/lib/test-generator";
import { generateSmokeTestWithAI } from "@/lib/test-generator-ai";
import { PlaywrightExecutor } from "@/lib/executor";
import { generateRunSummary } from "@/lib/ai-summary";
import { UrlInputSchema } from "@/lib/validators";
import { getCurrentProvider } from "@/lib/ai";

// POST /api/test - Instant test for any URL
export async function POST(request: Request) {
  let tempSiteId: string | null = null;

  try {
    const body = await request.json();
    const { url } = UrlInputSchema.parse(body);

    // Extract site name from URL
    const urlObj = new URL(url);
    const siteName = urlObj.hostname.replace("www.", "");

    // Create temporary site
    const site = await prisma.site.create({
      data: {
        name: siteName,
        baseUrl: url,
        description: `Temporary site for instant test`,
        schedule: 0, // Manual only
        isPreset: false,
        isActive: false,
        status: "unknown",
      },
    });
    tempSiteId = site.id;

    // Step 1: Fetch page and analyze
    console.log(`Analyzing ${url}...`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(url, { timeout: 30000, waitUntil: "domcontentloaded" });
    const html = await page.content();
    await browser.close();

    const metadata = await analyzePage(html, url);
    console.log(`Page analyzed:`, {
      title: metadata.title,
      language: metadata.language,
      hasLogin: metadata.hasLogin,
      hasCaptcha: metadata.hasCaptcha,
    });

    // Step 2: Generate test steps (with AI if available)
    let steps;
    const aiProvider = getCurrentProvider();
    if (aiProvider !== "template") {
      console.log(`Generating tests with AI (${aiProvider})...`);
      steps = await generateSmokeTestWithAI(url, metadata);
    } else {
      console.log("Generating tests with heuristic mode...");
      steps = generateSmokeTest(url, metadata);
    }

    console.log(`Generated ${steps.length} test steps`);

    // Create journey
    const journey = await prisma.journey.create({
      data: {
        siteId: site.id,
        name: `${siteName} Instant Test`,
        type: "smoke",
        stepsJson: JSON.stringify(steps),
        isDefault: true,
      },
    });

    // Create run record
    const run = await prisma.run.create({
      data: {
        siteId: site.id,
        journeyId: journey.id,
        status: "queued",
        triggeredBy: "api",
      },
    });

    // Step 3: Execute tests
    console.log(`Executing tests for run ${run.id}...`);
    const executor = new PlaywrightExecutor();

    const result = await executor.execute({
      runId: run.id,
      siteId: site.id,
      baseUrl: url,
      steps,
      enableScreencast: true,
      enableTrace: true,
      enableVideo: false,
    });

    console.log(`Execution complete: ${result.overallStatus}`);

    // Generate summary
    const summary = await generateRunSummary(
      url,
      siteName,
      result.overallStatus,
      result.steps,
      result.durationMs
    );

    // Update run
    await prisma.run.update({
      where: { id: run.id },
      data: {
        status: result.overallStatus,
        durationMs: result.durationMs,
        totalSteps: result.steps.length,
        passedSteps: result.steps.filter((s) => s.status === "passed").length,
        failedSteps: result.steps.filter((s) => s.status === "failed").length,
        summaryJson: JSON.stringify(summary),
        finishedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      siteId: site.id,
      runId: run.id,
      metadata,
      steps,
      result: {
        status: result.overallStatus,
        durationMs: result.durationMs,
        passedSteps: result.steps.filter((s) => s.status === "passed").length,
        failedSteps: result.steps.filter((s) => s.status === "failed").length,
      },
      summary,
    });
  } catch (error: any) {
    console.error("Instant test error:", error);

    // Clean up temporary site if created
    if (tempSiteId) {
      await prisma.site.delete({ where: { id: tempSiteId } }).catch(() => {});
    }

    return NextResponse.json(
      { error: error.message || "Test failed" },
      { status: 500 }
    );
  }
}
