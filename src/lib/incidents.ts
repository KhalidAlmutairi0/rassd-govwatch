// src/lib/incidents.ts
import { prisma } from "./prisma";
import { StepResult } from "./executor";

export async function processRunResult(
  runId: string,
  siteId: string,
  journeyId: string,
  overallStatus: "passed" | "failed" | "error",
  steps: StepResult[]
) {
  if (overallStatus === "failed" || overallStatus === "error") {
    // Check for existing open incident
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

    if (existing) {
      // Increment existing incident
      await prisma.incident.update({
        where: { id: existing.id },
        data: {
          occurrences: existing.occurrences + 1,
          lastSeenAt: new Date(),
          severity: calculateSeverity(existing.occurrences + 1, steps),
          description: errorMessages,
        },
      });
    } else {
      // Create new incident
      const journey = await prisma.journey.findUnique({ where: { id: journeyId } });
      await prisma.incident.create({
        data: {
          siteId,
          journeyId,
          title: `${journey?.name || "Test"} failing on ${new Date().toLocaleDateString()}`,
          description: errorMessages,
          severity: calculateSeverity(1, steps),
          status: "open",
        },
      });
    }

    // Update site status
    await prisma.site.update({
      where: { id: siteId },
      data: { status: overallStatus === "error" ? "down" : "degraded" },
    });
  } else if (overallStatus === "passed") {
    // Resolve any open incidents for this journey
    await prisma.incident.updateMany({
      where: {
        siteId,
        journeyId,
        status: { in: ["open", "investigating"] },
      },
      data: {
        status: "resolved",
        resolvedAt: new Date(),
      },
    });

    // Update site status (check if all journeys are healthy)
    const openIncidents = await prisma.incident.count({
      where: { siteId, status: { in: ["open", "investigating"] } },
    });
    await prisma.site.update({
      where: { id: siteId },
      data: { status: openIncidents > 0 ? "degraded" : "healthy" },
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

  // Critical: 3+ consecutive failures OR all steps failed
  if (occurrences >= 3 || failRate === 1) return "critical";

  // High: 2 consecutive failures OR >75% failed
  if (occurrences >= 2 || failRate > 0.75) return "high";

  // Medium: >50% failed
  if (failRate > 0.5) return "medium";

  // Low: less than half failed
  return "low";
}
