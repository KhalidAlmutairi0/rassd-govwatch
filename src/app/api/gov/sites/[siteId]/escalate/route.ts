// src/app/api/gov/sites/[siteId]/escalate/route.ts
// POST — governor escalates a site to the CTO / senior team
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { startEscalationTimer } from "@/lib/escalation";

export async function POST(
  request: NextRequest,
  { params }: { params: { siteId: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "governor") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const site = await prisma.site.findUnique({ where: { id: params.siteId } });
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    // Find the most critical open incident for this site
    const incident = await prisma.incident.findFirst({
      where: { siteId: params.siteId, status: { in: ["open", "investigating"] } },
      orderBy: { severity: "asc" }, // critical < high < medium < low
    });

    if (!incident) {
      // No incident — create one to attach the escalation
      const newIncident = await prisma.incident.create({
        data: {
          siteId: params.siteId,
          title: `Manual escalation: ${site.name}`,
          description: `Escalated manually by ${user.name || user.email} from the executive dashboard.`,
          status: "investigating",
          severity: "critical",
        },
      });
      await startEscalationTimer(newIncident.id);

      // Notify all developers
      const developers = await prisma.user.findMany({ where: { role: "developer" } });
      await prisma.notification.createMany({
        data: developers.map((dev) => ({
          userId: dev.id,
          title: `🆘 ESCALATED: ${site.name}`,
          body: `Governor has escalated ${site.name} for immediate attention.`,
          type: "incident",
          metadata: JSON.stringify({ siteId: site.id, incidentId: newIncident.id }),
        })),
      });

      return NextResponse.json({ escalated: true, incidentId: newIncident.id });
    }

    // Escalate existing incident
    await prisma.incident.update({
      where: { id: incident.id },
      data: { status: "investigating", severity: "critical" },
    });
    await startEscalationTimer(incident.id);

    // Notify developers
    const developers = await prisma.user.findMany({ where: { role: "developer" } });
    await prisma.notification.createMany({
      data: developers.map((dev) => ({
        userId: dev.id,
        title: `🆘 ESCALATED: ${site.name}`,
        body: `Governor has escalated "${incident.title}" for immediate attention.`,
        type: "incident",
        metadata: JSON.stringify({ siteId: site.id, incidentId: incident.id }),
      })),
    });

    return NextResponse.json({ escalated: true, incidentId: incident.id });
  } catch (error) {
    console.error("[ESCALATE] Error:", error);
    return NextResponse.json({ error: "Failed to escalate" }, { status: 500 });
  }
}
