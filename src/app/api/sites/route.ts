// src/app/api/sites/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CreateSiteSchema } from "@/lib/validators";
import "@/lib/init-ws"; // Initialize WebSocket server

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

// POST /api/sites - Create new site
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = CreateSiteSchema.parse(body);

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

    return NextResponse.json({ site }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating site:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create site" },
      { status: 400 }
    );
  }
}
