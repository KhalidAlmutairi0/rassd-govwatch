// src/lib/notifications.ts
// Non-blocking async notification system
import { prisma } from "./prisma";

export type NotificationType = "incident" | "recovery" | "report" | "system" | "info";

interface CreateNotificationOptions {
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  metadata?: Record<string, string>;
}

// ─── In-platform notifications ────────────────────────────────────────────────

export async function createNotification(opts: CreateNotificationOptions): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: opts.userId,
        title: opts.title,
        body: opts.body,
        type: opts.type,
        metadata: opts.metadata ? JSON.stringify(opts.metadata) : null,
      },
    });
  } catch (error) {
    console.error("[NOTIF] Failed to create notification:", error);
  }
}

// ─── Email (stubbed — log to console; wire up SMTP/SendGrid in production) ───

export async function sendEmailNotification(
  to: string,
  subject: string,
  body: string
): Promise<void> {
  // Production: integrate nodemailer / SendGrid / SES here
  console.log(`[EMAIL] To: ${to}`);
  console.log(`[EMAIL] Subject: ${subject}`);
  console.log(`[EMAIL] Body: ${body.slice(0, 200)}...`);
}

// ─── Slack webhook ────────────────────────────────────────────────────────────

export async function sendSlackNotification(
  webhookUrl: string,
  message: string
): Promise<void> {
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
  } catch (error) {
    console.error("[SLACK] Failed to send notification:", error);
  }
}

// ─── Broadcast to all users with a given role ─────────────────────────────────

export async function notifyAllByRole(
  role: "governor" | "developer",
  title: string,
  body: string,
  type: NotificationType,
  metadata?: Record<string, string>
): Promise<void> {
  try {
    const users = await prisma.user.findMany({ where: { role } });
    await Promise.allSettled(
      users.map((user) =>
        createNotification({ userId: user.id, title, body, type, metadata })
      )
    );
  } catch (error) {
    console.error("[NOTIF] Failed to broadcast to role:", error);
  }
}

// ─── Incident alert (sent to all developers + governor, plain language for gov) ─

export async function sendIncidentAlert(opts: {
  siteName: string;
  siteNameAr?: string;
  ministryName?: string;
  severity: string;
  description: string;
  incidentId: string;
  siteId: string;
}): Promise<void> {
  const { siteName, ministryName, severity, description, incidentId, siteId } = opts;

  // Developer notification (technical)
  const devTitle = `[${severity.toUpperCase()}] Incident: ${siteName}`;
  const devBody = description || `Test failures detected on ${siteName}.`;

  // Governor notification (plain language — NO technical content)
  const govTitle = `Service Alert: ${ministryName || siteName}`;
  const govBody = toPlainLanguageAlert(siteName, ministryName, severity);

  await Promise.allSettled([
    notifyAllByRole("developer", devTitle, devBody, "incident", { incidentId, siteId }),
    notifyAllByRole("governor", govTitle, govBody, "incident", { siteId }),
  ]);

  // Email alerts (developers only for technical, governors get plain language)
  const developers = await prisma.user.findMany({ where: { role: "developer", notifyEmail: true } });
  const governors = await prisma.user.findMany({ where: { role: "governor", notifyEmail: true } });

  await Promise.allSettled([
    ...developers.map((u) =>
      sendEmailNotification(
        u.email,
        devTitle,
        `Site: ${siteName}\nSeverity: ${severity}\n\n${devBody}`
      )
    ),
    ...governors.map((u) =>
      sendEmailNotification(u.email, govTitle, govBody)
    ),
  ]);

  // Slack (developers)
  const slackUsers = await prisma.user.findMany({
    where: { role: "developer", notifySlack: true, slackWebhook: { not: null } },
  });
  await Promise.allSettled(
    slackUsers.map((u) =>
      sendSlackNotification(u.slackWebhook!, `🚨 *${devTitle}*\n${devBody}`)
    )
  );
}

// ─── Recovery notification ────────────────────────────────────────────────────

export async function sendRecoveryAlert(opts: {
  siteName: string;
  ministryName?: string;
  durationMs: number;
  incidentId: string;
  siteId: string;
}): Promise<void> {
  const { siteName, ministryName, durationMs, incidentId, siteId } = opts;
  const duration = formatDuration(durationMs);

  const devTitle = `✅ Resolved: ${siteName}`;
  const devBody = `Incident on ${siteName} has been resolved. Total duration: ${duration}.`;

  const govTitle = `Service Restored: ${ministryName || siteName}`;
  const govBody = `${ministryName || siteName} has returned to normal operation. Citizens can access all services. Total outage duration: ${duration}.`;

  await Promise.allSettled([
    notifyAllByRole("developer", devTitle, devBody, "recovery", { incidentId, siteId }),
    notifyAllByRole("governor", govTitle, govBody, "recovery", { siteId }),
  ]);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toPlainLanguageAlert(siteName: string, ministryName?: string, severity?: string): string {
  const name = ministryName || siteName;
  if (severity === "critical") {
    return `${name} is currently unavailable. Citizens cannot access key digital services. The technical team has been notified and is working to restore service.`;
  }
  if (severity === "high") {
    return `Some services on ${name} are experiencing difficulty. Citizens may encounter delays or errors. The technical team is investigating.`;
  }
  return `${name} is experiencing minor issues. The technical team has been notified and is monitoring the situation.`;
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  return `${hours}h ${remainingMins}m`;
}
