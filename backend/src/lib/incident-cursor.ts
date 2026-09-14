import { z } from "zod";

const CursorSchema = z.object({ id: z.string().min(1).max(100), at: z.string().datetime() });

export function encodeIncidentCursor(value: { id: string; lastSeenAt: Date }) {
  return Buffer.from(JSON.stringify({ id: value.id, at: value.lastSeenAt.toISOString() })).toString("base64url");
}

export function decodeIncidentCursor(value: string) {
  z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/).parse(value);
  const parsed = CursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  return { id: parsed.id, at: new Date(parsed.at) };
}
