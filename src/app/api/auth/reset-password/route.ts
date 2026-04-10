// src/app/api/auth/reset-password/route.ts
import { NextResponse } from "next/server";
import { consumePasswordReset } from "@/lib/auth";
import { z } from "zod";

const Schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    const success = await consumePasswordReset(parsed.data.token, parsed.data.password);

    if (!success) {
      return NextResponse.json(
        { error: "This reset link is invalid or has expired. Please request a new one." },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, message: "Password updated successfully." });
  } catch (error) {
    console.error("[AUTH] Reset password error:", error);
    return NextResponse.json({ error: "An error occurred. Please try again." }, { status: 500 });
  }
}
