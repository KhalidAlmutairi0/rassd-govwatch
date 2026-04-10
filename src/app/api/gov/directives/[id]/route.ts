// src/app/api/gov/directives/[id]/route.ts
// PATCH — resolve or update a directive
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

    const body = await request.json();
    const { status, title, directiveBody, dueDate } = body;

    const existing = await (prisma as any).directive.findUnique({
      where: { id: params.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Directive not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (title) updateData.title = title;
    if (directiveBody !== undefined) updateData.body = directiveBody;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
    if (status === "resolved") updateData.resolvedAt = new Date();

    const updated = await (prisma as any).directive.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json({ directive: updated });
  } catch (error) {
    console.error("[DIRECTIVES PATCH] Error:", error);
    return NextResponse.json({ error: "Failed to update directive" }, { status: 500 });
  }
}
