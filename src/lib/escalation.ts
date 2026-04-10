// src/lib/escalation.ts
// Persistent escalation timer logic — DB-backed so it survives server restarts
import { prisma } from "./prisma";
import { sendEmailNotification, sendSlackNotification } from "./notifications";

const LEVEL_2_THRESHOLD_MS = 15 * 60 * 1000;  // 15 minutes → manager
const LEVEL_3_THRESHOLD_MS = 45 * 60 * 1000;  // 45 minutes → CTO + SMS

// ─── Create escalation timer when an incident is opened ──────────────────────

export async function startEscalationTimer(incidentId: string): Promise<void> {
  try {
    // Don't double-create
    const existing = await prisma.escalationTimer.findUnique({ where: { incidentId } });
    if (existing) return;

    await prisma.escalationTimer.create({
      data: {
        incidentId,
        currentLevel: 1,
        level1SentAt: new Date(),
      },
    });

    console.log(`[ESCALATION] Timer started for incident ${incidentId}`);
  } catch (error) {
    console.error("[ESCALATION] Failed to start timer:", error);
  }
}

// ─── Resolve escalation when incident is closed ───────────────────────────────

export async function resolveEscalationTimer(incidentId: string): Promise<void> {
  try {
    await prisma.escalationTimer.updateMany({
      where: { incidentId, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
  } catch (error) {
    console.error("[ESCALATION] Failed to resolve timer:", error);
  }
}

// ─── Check and fire escalations (called every minute by scheduler) ────────────

export async function checkEscalations(): Promise<void> {
  try {
    const now = new Date();

    // Find all unresolved escalation timers
    const timers = await prisma.escalationTimer.findMany({
      where: { resolvedAt: null },
      include: {
        incident: {
          include: { site: true },
        },
      },
    });

    for (const timer of timers) {
      const elapsedMs = now.getTime() - timer.createdAt.getTime();
      const incident = timer.incident;
      const site = incident.site;

      // Level 2 escalation: 15 minutes
      if (!timer.level2SentAt && elapsedMs >= LEVEL_2_THRESHOLD_MS) {
        await fireLevel2Escalation(timer.id, incident, site, elapsedMs);
      }

      // Level 3 escalation: 45 minutes
      if (!timer.level3SentAt && elapsedMs >= LEVEL_3_THRESHOLD_MS) {
        await fireLevel3Escalation(timer.id, incident, site, elapsedMs);
      }
    }
  } catch (error) {
    console.error("[ESCALATION] Check failed:", error);
  }
}

async function fireLevel2Escalation(
  timerId: string,
  incident: any,
  site: any,
  elapsedMs: number
): Promise<void> {
  console.log(`[ESCALATION] Level 2 triggered for incident ${incident.id}`);

  await prisma.escalationTimer.update({
    where: { id: timerId },
    data: { level2SentAt: new Date(), currentLevel: 2 },
  });

  const elapsed = Math.floor(elapsedMs / 60000);
  const subject = `[ESCALATED] Unresolved incident: ${site.name} — ${elapsed} minutes`;
  const body = buildEscalationEmail(site, incident, elapsed, "Engineering Manager");

  // Notify engineering managers (developers at level 2)
  const managers = await prisma.user.findMany({ where: { role: "developer" } });
  await Promise.allSettled(
    managers.map((m) => sendEmailNotification(m.email, subject, body))
  );

  // In-platform notification
  await prisma.notification.createMany({
    data: managers.map((m) => ({
      userId: m.id,
      title: `🔴 Escalated: ${site.name}`,
      body: `Incident unresolved for ${elapsed} minutes. Escalated to Engineering Manager.`,
      type: "incident",
    })),
  });
}

async function fireLevel3Escalation(
  timerId: string,
  incident: any,
  site: any,
  elapsedMs: number
): Promise<void> {
  console.log(`[ESCALATION] Level 3 (CRITICAL) triggered for incident ${incident.id}`);

  await prisma.escalationTimer.update({
    where: { id: timerId },
    data: { level3SentAt: new Date(), currentLevel: 3 },
  });

  const elapsed = Math.floor(elapsedMs / 60000);
  const subject = `[CRITICAL ESCALATION] ${site.name} — ${elapsed} minutes unresolved`;
  const body = buildEscalationEmail(site, incident, elapsed, "CTO");

  // Notify all users
  const allUsers = await prisma.user.findMany();
  await Promise.allSettled(
    allUsers.map((u) => sendEmailNotification(u.email, subject, body))
  );

  // Slack notification
  const slackUsers = await prisma.user.findMany({
    where: { slackWebhook: { not: null } },
  });
  await Promise.allSettled(
    slackUsers.map((u) =>
      sendSlackNotification(
        u.slackWebhook!,
        `🆘 *CRITICAL ESCALATION*\n*${site.name}* has been down for *${elapsed} minutes*.\nIncident ID: \`${incident.id}\`\nSeverity: ${incident.severity.toUpperCase()}`
      )
    )
  );

  console.log(`[ESCALATION] ⚡ SMS escalation for incident ${incident.id} — integrate SMS provider here`);
}

function buildEscalationEmail(
  site: any,
  incident: any,
  elapsedMinutes: number,
  escalationTarget: string
): string {
  return `ESCALATION NOTICE — ${escalationTarget}

Site: ${site.name} (${site.baseUrl})
Incident: ${incident.title}
Severity: ${incident.severity.toUpperCase()}
Duration: ${elapsedMinutes} minutes and counting

This incident was first detected ${elapsedMinutes} minutes ago and has not yet been resolved.

Description:
${incident.description || "No additional details available."}

This is an automated escalation from Rassd (رصد). Please investigate immediately.

Incident ID: ${incident.id}
`;
}
