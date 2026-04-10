// src/app/api/test/route.ts
import { NextResponse } from "next/server";
import { chromium } from "playwright";
import { prisma } from "@/lib/prisma";
import { analyzePage } from "@/lib/page-analyzer";
import { generateSmokeTest } from "@/lib/test-generator";
import { generateSmokeTestWithAI } from "@/lib/test-generator-ai";
import { UrlInputSchema } from "@/lib/validators";
import { getCurrentProvider } from "@/lib/ai";

// POST /api/test — Validate URL, analyze page, generate steps, create run.
// Returns runId immediately so the live page can connect to WS before execution starts.
export async function POST(request: Request) {
  let tempSiteId: string | null = null;

  try {
    const body = await request.json();
    const { url } = UrlInputSchema.parse(body);

    const urlObj = new URL(url);
    const siteName = urlObj.hostname.replace("www.", "");

    // Create temporary site record
    const site = await prisma.site.create({
      data: {
        name: siteName,
        baseUrl: url,
        description: "Temporary site for instant test",
        schedule: 0,
        isPreset: false,
        isActive: false,
        status: "unknown",
      },
    });
    tempSiteId = site.id;

    // Analyze page to generate steps
    console.log(`[TEST] Analyzing ${url}...`);
    const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(url, { timeout: 10000, waitUntil: "domcontentloaded" });
    const html = await page.content();
    await browser.close();

    const metadata = await analyzePage(html, url);

    // Generate steps
    let steps;
    if (getCurrentProvider() !== "template") {
      steps = await generateSmokeTestWithAI(url, metadata);
    } else {
      steps = generateSmokeTest(url, metadata);
    }
    console.log(`[TEST] Generated ${steps.length} steps`);

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

    // Create run in "queued" state — execution starts when the live page connects
    const run = await prisma.run.create({
      data: {
        siteId: site.id,
        journeyId: journey.id,
        status: "queued",
        triggeredBy: "api",
      },
    });

    console.log(`[TEST] Created run ${run.id} — returning to client`);

    return NextResponse.json({
      success: true,
      runId: run.id,
      siteId: site.id,
      steps,
      metadata,
    });
  } catch (error: any) {
    console.error("[TEST] Error:", error);

    if (tempSiteId) {
      await prisma.site.delete({ where: { id: tempSiteId } }).catch(() => {});
    }

    return NextResponse.json(
      { error: error.message || "Test setup failed" },
      { status: 500 }
    );
  }
}
