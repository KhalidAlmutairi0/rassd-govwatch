// src/app/api/gov/whats-new/[id]/route.ts
// PATCH — acknowledge a What's New event (marks related notification read,
//          or marks directive/incident as acknowledged via notification)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "governor") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // The event id encodes its source: "incident-resolved-<id>", "directive-resolved-<id>",
    // "score-milestone-<id>", "score-drop-<siteId>-<scoreId>"
    // For now just mark any matching notification as read.
    await prisma.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[WHATS-NEW ACKNOWLEDGE] Error:", error);
    return NextResponse.json({ error: "Failed to acknowledge" }, { status: 500 });
  }
}
