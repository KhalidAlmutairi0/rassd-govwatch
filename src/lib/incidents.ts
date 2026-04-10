// src/lib/incidents.ts
import { prisma } from "./prisma";
import { StepResult } from "./executor";
import { sendIncidentAlert, sendRecoveryAlert } from "./notifications";
import { startEscalationTimer, resolveEscalationTimer } from "./escalation";

export async function processRunResult(
  runId: string,
  siteId: string,
  journeyId: string,
  overallStatus: "passed" | "failed" | "error",
  steps: StepResult[]
) {
  const site = await prisma.site.findUnique({ where: { id: siteId } });

  if (overallStatus === "failed" || overallStatus === "error") {
    const existing = await prisma.incident.findFirst({
      where: {
        siteId,
        journeyId,
        status: { in: ["open", "investigating"] },
      },
    });

    const errorMessages = steps
      .filter((s) => s.error)
      .map((s) => s.error!)
      .join("; ");

    const severity = calculateSeverity(existing ? existing.occurrences + 1 : 1, steps);

    let incidentId: string;

    if (existing) {
      await prisma.incident.update({
        where: { id: existing.id },
        data: {
          occurrences: existing.occurrences + 1,
          lastSeenAt: new Date(),
          severity,
          description: errorMessages,
        },
      });
      incidentId = existing.id;
    } else {
      const journey = await prisma.journey.findUnique({ where: { id: journeyId } });
      const incident = await prisma.incident.create({
        data: {
          siteId,
          journeyId,
          title: `${journey?.name || "Test"} failing on ${new Date().toLocaleDateString()}`,
          description: errorMessages,
          severity,
          status: "open",
        },
      });
      incidentId = incident.id;

      // Start escalation timer for new incidents (async — non-blocking)
      startEscalationTimer(incidentId).catch(console.error);

      // Send incident alert (async — non-blocking)
      sendIncidentAlert({
        siteName: site?.name || "Unknown Site",
        siteNameAr: site?.nameAr ?? undefined,
        ministryName: site?.ministryName ?? undefined,
        severity,
        description: errorMessages,
        incidentId,
        siteId,
      }).catch(console.error);
    }

    await prisma.site.update({
      where: { id: siteId },
      data: { status: overallStatus === "error" ? "down" : "degraded" },
    });

  } else if (overallStatus === "passed") {
    // Find open incidents to resolve
    const openIncidents = await prisma.incident.findMany({
      where: {
        siteId,
        journeyId,
        status: { in: ["open", "investigating"] },
      },
    });

    if (openIncidents.length > 0) {
      const now = new Date();
      await prisma.incident.updateMany({
        where: {
          siteId,
          journeyId,
          status: { in: ["open", "investigating"] },
        },
        data: { status: "resolved", resolvedAt: now },
      });

      // Resolve escalation timers and send recovery notifications
      for (const incident of openIncidents) {
        const durationMs = now.getTime() - incident.firstSeenAt.getTime();

        resolveEscalationTimer(incident.id).catch(console.error);
        sendRecoveryAlert({
          siteName: site?.name || "Unknown Site",
          ministryName: site?.ministryName ?? undefined,
          durationMs,
          incidentId: incident.id,
          siteId,
        }).catch(console.error);
      }
    }

    const remainingOpenIncidents = await prisma.incident.count({
      where: { siteId, status: { in: ["open", "investigating"] } },
    });

    await prisma.site.update({
      where: { id: siteId },
      data: { status: remainingOpenIncidents > 0 ? "degraded" : "healthy" },
    });
  }
}

function calculateSeverity(
  occurrences: number,
  steps: StepResult[]
): "low" | "medium" | "high" | "critical" {
  const failedCount = steps.filter((s) => s.status === "failed").length;
  const totalCount = steps.length;
  const failRate = failedCount / totalCount;

  if (steps[0]?.status === "failed") return "critical"; // Homepage down = critical
  if (occurrences >= 3 || failRate === 1) return "critical";
  if (occurrences >= 2 || failRate > 0.75) return "high";
  if (failRate > 0.5) return "medium";
  return "low";
}
