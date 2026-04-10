// src/app/api/gov/reports/schedule/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { z } from "zod";

const Schema = z.object({
  toEmail: z.string().email(),
  dayOfWeek: z.number().min(0).max(6),
  hourOfDay: z.number().min(0).max(23),
});

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "governor") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    // Upsert: one scheduled report per governor
    const existing = await prisma.scheduledReport.findFirst({ where: { userId: user.id } });
    if (existing) {
      await prisma.scheduledReport.update({
        where: { id: existing.id },
        data: { toEmail: parsed.data.toEmail, dayOfWeek: parsed.data.dayOfWeek, hourOfDay: parsed.data.hourOfDay, isActive: true },
      });
    } else {
      await prisma.scheduledReport.create({
        data: { userId: user.id, ...parsed.data },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[GOV] Schedule report error:", error);
    return NextResponse.json({ error: "Failed to schedule report" }, { status: 500 });
  }
}
