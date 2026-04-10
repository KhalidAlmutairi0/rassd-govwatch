// src/app/api/sites/[id]/runs/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/sites/[id]/runs - List runs for a site
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const runs = await prisma.run.findMany({
      where: { siteId: params.id },
      orderBy: { startedAt: "desc" },
      take: 50,
      include: {
        journey: true,
      },
    });

    return NextResponse.json({ runs });
  } catch (error) {
    console.error("Error fetching runs:", error);
    return NextResponse.json(
      { error: "Failed to fetch runs" },
      { status: 500 }
    );
  }
}

// POST /api/sites/[id]/runs - Trigger a new run
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { journeyId } = body;

    // Get site
    const site = await prisma.site.findUnique({
      where: { id: params.id },
    });

    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    // Get journey (or use default)
    let journey;
    if (journeyId) {
      journey = await prisma.journey.findUnique({
        where: { id: journeyId },
      });
    } else {
      journey = await prisma.journey.findFirst({
        where: { siteId: params.id, isDefault: true },
      });
    }

    if (!journey) {
      // Auto-create a basic smoke test journey for this site
      const defaultSteps = [
        { action: "navigate", description: "Open homepage", url: site.baseUrl, assertions: ["page_loaded", "title_exists"] },
        { action: "screenshot", description: "Capture homepage" },
        { action: "assert_element", description: "Verify page has main heading", selector: "h1, h2, [role='heading']" },
        { action: "screenshot", description: "Capture after heading check" },
      ];
      journey = await prisma.journey.create({
        data: {
          siteId: params.id,
          name: `${site.name} Smoke Test`,
          type: "smoke",
          stepsJson: JSON.stringify(defaultSteps),
          isDefault: true,
        },
      });
    }

    // Create run record (keep as "queued" - execution starts when client connects)
    const run = await prisma.run.create({
      data: {
        siteId: params.id,
        journeyId: journey.id,
        status: "queued",
        triggeredBy: "manual",
      },
    });

    // Store execution data for later (when client signals ready)
    global.pendingRuns = global.pendingRuns || new Map();
    global.pendingRuns.set(run.id, {
      siteId: site.id,
      baseUrl: site.baseUrl,
      journeyId: journey.id,
      stepsJson: journey.stepsJson,
    });
    console.log(`[PENDING] Stored run ${run.id} in pendingRuns (size: ${global.pendingRuns.size})`);

    return NextResponse.json({ run }, { status: 201 });
  } catch (error: any) {
    console.error("Error triggering run:", error);
    return NextResponse.json(
      { error: error.message || "Failed to trigger run" },
      { status: 500 }
    );
  }
}

