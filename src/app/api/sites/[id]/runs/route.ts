// src/app/api/sites/[id]/runs/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";

// GET /api/sites/[id]/runs - List runs for a site
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const runs = await prisma.run.findMany({
      where: { siteId: id },
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { journeyId } = body;

    // Get site
    const site = await prisma.site.findUnique({
      where: { id },
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
        where: { siteId: id, isDefault: true },
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
          siteId: id,
          name: `${site.name} Smoke Test`,
          type: "smoke",
          stepsJson: JSON.stringify(defaultSteps),
          isDefault: true,
        },
      });
    }

    // Create run record (keep as "queued" - execution starts when client connects
    // and calls /api/runs/[runId]/start, which re-reads the run + site + journey).
    const run = await prisma.run.create({
      data: {
        siteId: id,
        journeyId: journey.id,
        status: "queued",
        triggeredBy: "manual",
      },
    });

    return NextResponse.json({ run }, { status: 201 });
  } catch (error: any) {
    console.error("Error triggering run:", error);
    return NextResponse.json(
      { error: error.message || "Failed to trigger run" },
      { status: 500 }
    );
  }
}

