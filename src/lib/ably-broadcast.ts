// src/lib/ably-broadcast.ts
// Server-side Ably publisher using REST API (no persistent connection needed)
import Ably from "ably";

let ablyRest: Ably.Rest | null = null;

function getAblyRest(): Ably.Rest | null {
  if (!process.env.ABLY_API_KEY) return null;
  if (!ablyRest) {
    ablyRest = new Ably.Rest({ key: process.env.ABLY_API_KEY });
  }
  return ablyRest;
}

export async function ablyBroadcast(runId: string, message: object): Promise<void> {
  const rest = getAblyRest();
  if (!rest) return;

  const channel = rest.channels.get(`run-${runId}`);
  const { type, ...data } = message as any;
  await channel.publish(type || "message", data).catch((err) => {
    console.error("[Ably] publish error:", err.message);
  });
}

export function isAblyEnabled(): boolean {
  return !!process.env.ABLY_API_KEY;
}
