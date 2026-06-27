// src/app/api/sites/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { CreateSiteSchema } from "@/server/validators";
// Lazy-init WebSocket server (dynamic import prevents middleware bundle bleed)
import("@/server/ws/init-ws").then(m => m.ensureWebSocketServer?.()).catch(() => {});

// GET /api/sites - List all sites
export async function GET() {
  try {
    const sites = await prisma.site.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            runs: true,
            incidents: {
              where: {
                status: { in: ["open", "investigating"] },
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ sites });
  } catch (error) {
    console.error("Error fetching sites:", error);
    return NextResponse.json(
      { error: "Failed to fetch sites" },
      { status: 500 }
    );
  }
}

// POST /api/sites - Create new site + default journey + optional first run
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { skipRun, ...siteBody } = body;
    const data = CreateSiteSchema.parse(siteBody);

    // 1. Create site
    const site = await prisma.site.create({
      data: {
        name: data.name,
        nameAr: data.nameAr,
        baseUrl: data.baseUrl,
        description: data.description,
        schedule: data.schedule,
        isPreset: false,
        isActive: true,
        status: "unknown",
      },
    });

    // 2. Create a default journey so the scheduler can pick it up
    const defaultSteps = [
      {
        action: "navigate",
        description: "Open homepage",
        url: data.baseUrl,
        assertions: ["page_loaded", "title_exists"],
      },
      {
        action: "screenshot",
        description: "Capture homepage",
      },
    ];

    const journey = await prisma.journey.create({
      data: {
        siteId: site.id,
        name: `${data.name} Smoke Test`,
        type: "smoke",
        stepsJson: JSON.stringify(defaultSteps),
        isDefault: true,
      },
    });

    // 3. If skipRun is true, just return site info
    if (skipRun) {
      return NextResponse.json({ site }, { status: 201 });
    }

    // 4. Create a run record in "queued" state so the live page can start it
    // via /api/runs/[runId]/start (which re-reads site + journey by runId).
    const run = await prisma.run.create({
      data: {
        siteId: site.id,
        journeyId: journey.id,
        status: "queued",
        triggeredBy: "manual",
      },
    });

    return NextResponse.json({ site, run }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating site:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create site" },
      { status: 400 }
    );
  }
}
