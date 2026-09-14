import { prisma } from "../lib/prisma";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { incidentSelect } from "../lib/portfolio-query";
import { decodeIncidentCursor, encodeIncidentCursor } from "../lib/incident-cursor";
import { apiError } from "../lib/api";

// GET /api/incidents - List all incidents
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get("siteId");
    const status = searchParams.get("status");

    const where: Prisma.IncidentWhereInput = {};
    if (siteId) where.siteId = siteId;
    if (status === "active") where.status = { in: ["open", "investigating"] };
    else if (status) where.status = status;
    const cursorValue = searchParams.get("cursor");
    const cursor = cursorValue ? decodeIncidentCursor(cursorValue) : null;
    if (cursor) where.OR = [{ lastSeenAt: { lt: cursor.at } }, { lastSeenAt: cursor.at, id: { lt: cursor.id } }];

    const incidents = await prisma.incident.findMany({
      where,
      orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }], take: 25,
      select: incidentSelect,
    });

    return Response.json({ incidents: incidents.slice(0, 24), nextCursor: incidents.length > 24 ? encodeIncidentCursor(incidents[23]) : null });
  } catch (error) {
    return apiError(error);
  }
}

// PATCH /api/incidents/[id] - Update incident status
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, status } = z.object({ id: z.string().cuid(), status: z.enum(["open", "investigating", "resolved"]) }).parse(body);

    const incident = await prisma.incident.update({
      where: { id },
      data: {
        status,
        resolvedAt: status === "resolved" ? new Date() : null,
      },
    });

    return Response.json({ incident });
  } catch (error: any) {
    console.error("Error updating incident:", error);
    return Response.json(
      { error: error.message || "Failed to update incident" },
      { status: 500 }
    );
  }
}
