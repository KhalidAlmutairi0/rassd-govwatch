// src/app/api/sites/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/sites/[id] - Get single site with details
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const site = await prisma.site.findUnique({
      where: { id },
      include: {
        journeys: {
          orderBy: { createdAt: "desc" },
        },
        runs: {
          orderBy: { startedAt: "desc" },
          take: 10,
          include: {
            journey: true,
          },
        },
        incidents: {
          where: {
            status: { in: ["open", "investigating"] },
          },
          orderBy: { lastSeenAt: "desc" },
        },
      },
    });

    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    return NextResponse.json({ site });
  } catch (error) {
    console.error("Error fetching site:", error);
    return NextResponse.json(
      { error: "Failed to fetch site" },
      { status: 500 }
    );
  }
}

// PATCH /api/sites/[id] - Update site
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const site = await prisma.site.update({
      where: { id },
      data: {
        ...body,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ site });
  } catch (error: any) {
    console.error("Error updating site:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update site" },
      { status: 400 }
    );
  }
}

// DELETE /api/sites/[id] - Delete site
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.site.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting site:", error);
    return NextResponse.json(
      { error: "Failed to delete site" },
      { status: 500 }
    );
  }
}
