import { prisma } from "../lib/prisma";
import { z } from "zod";
import { CreateSiteSchema } from "../lib/validators";
import { deleteSite } from "../lib/artifact-retention";
import { apiError } from "../lib/api";
import { runSummarySelect } from "../lib/portfolio-query";

// GET /api/sites/[id] - Get single site with details
export async function GET(
  request: Request,
  { params: pendingParams }: { params: Promise<{ id: string }> }
) {
  const params = await pendingParams;
  try {
    const site = await prisma.site.findUnique({
      where: { id: params.id },
      include: {
        journeys: {
          orderBy: { createdAt: "desc" },
          select: { id: true, name: true, type: true, isDefault: true },
        },
        runs: {
          orderBy: { startedAt: "desc" },
          take: 10,
          select: { ...runSummarySelect, summaryJson: true, journey: { select: { id: true, name: true } } },
        },
        incidents: {
          where: {
            status: { in: ["open", "investigating"] },
          },
          orderBy: { lastSeenAt: "desc" },
          take: 20,
        },
      },
    });

    if (!site) {
      return Response.json({ error: "Site not found" }, { status: 404 });
    }

    return Response.json({ site });
  } catch (error) {
    console.error("Error fetching site:", error);
    return Response.json(
      { error: "Failed to fetch site" },
      { status: 500 }
    );
  }
}

// PATCH /api/sites/[id] - Update site
export async function PATCH(
  request: Request,
  { params: pendingParams }: { params: Promise<{ id: string }> }
) {
  const params = await pendingParams;
  try {
    const body = CreateSiteSchema.partial().extend({ isActive: z.boolean().optional() }).strict().parse(await request.json());

    const site = await prisma.site.update({
      where: { id: params.id },
      data: {
        ...body,
        updatedAt: new Date(),
      },
    });

    return Response.json({ site });
  } catch (error: any) {
    console.error("Error updating site:", error);
    return Response.json(
      { error: error.message || "Failed to update site" },
      { status: 400 }
    );
  }
}

// DELETE /api/sites/[id] - Delete site
export async function DELETE(
  request: Request,
  { params: pendingParams }: { params: Promise<{ id: string }> }
) {
  const params = await pendingParams;
  try {
    await deleteSite(params.id);

    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
