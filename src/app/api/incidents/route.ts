// src/app/api/incidents/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/incidents - List all incidents
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get("siteId");
    const status = searchParams.get("status");

    const where: any = {};
    if (siteId) where.siteId = siteId;
    if (status) where.status = status;

    const incidents = await prisma.incident.findMany({
      where,
      orderBy: { lastSeenAt: "desc" },
      include: {
        site: true,
        journey: true,
      },
    });

    return NextResponse.json({ incidents });
  } catch (error) {
    console.error("Error fetching incidents:", error);
    return NextResponse.json(
      { error: "Failed to fetch incidents" },
      { status: 500 }
    );
  }
}

// PATCH /api/incidents/[id] - Update incident status
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, status } = body;

    const incident = await prisma.incident.update({
      where: { id },
      data: {
        status,
        ...(status === "resolved" ? { resolvedAt: new Date() } : {}),
      },
    });

    return NextResponse.json({ incident });
  } catch (error: any) {
    console.error("Error updating incident:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update incident" },
      { status: 500 }
    );
  }
}
