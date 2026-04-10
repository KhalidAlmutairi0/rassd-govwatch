// src/app/api/gov/directives/route.ts
// GET — list directives | POST — issue a new directive
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "governor") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = request.nextUrl;
    const siteId = searchParams.get("siteId");
    const status = searchParams.get("status"); // open | resolved | overdue | all

    const where: Record<string, unknown> = {};
    if (siteId) where.siteId = siteId;
    if (status && status !== "all") where.status = status;

    const directives = await (prisma as any).directive.findMany({
      where,
      include: {
        site: { select: { id: true, name: true, nameAr: true, baseUrl: true } },
        issuedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Mark overdue ones
    const now = new Date();
    const enriched = directives.map((d: any) => ({
      ...d,
      isOverdue: d.status === "open" && d.dueDate && new Date(d.dueDate) < now,
    }));

    return NextResponse.json({ directives: enriched });
  } catch (error) {
    console.error("[DIRECTIVES] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch directives" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "governor") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { siteId, title, body: directiveBody, dueDate } = body;

    if (!siteId || !title) {
      return NextResponse.json({ error: "siteId and title are required" }, { status: 400 });
    }

    // Verify site exists
    const site = await prisma.site.findUnique({ where: { id: siteId } });
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    const directive = await (prisma as any).directive.create({
      data: {
        siteId,
        issuedById: user.id,
        title,
        body: directiveBody || "",
        status: "open",
        dueDate: dueDate ? new Date(dueDate) : null,
      },
    });

    // Create in-platform notification for all developers
    const developers = await prisma.user.findMany({ where: { role: "developer" } });
    if (developers.length > 0) {
      await prisma.notification.createMany({
        data: developers.map((dev) => ({
          userId: dev.id,
          title: `New Directive: ${site.name}`,
          body: title,
          type: "incident",
          metadata: JSON.stringify({ siteId, directiveId: directive.id }),
        })),
      });
    }

    return NextResponse.json({ directive }, { status: 201 });
  } catch (error) {
    console.error("[DIRECTIVES] POST error:", error);
    return NextResponse.json({ error: "Failed to issue directive" }, { status: 500 });
  }
}
