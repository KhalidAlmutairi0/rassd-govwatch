// src/app/api/auth/forgot-password/route.ts
import { NextResponse } from "next/server";
import { createPasswordReset } from "@/lib/auth";
import { z } from "zod";

const Schema = z.object({ email: z.string().email() });

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }

    const token = await createPasswordReset(parsed.data.email);

    // In production: send email with reset link
    // For now: log token to console for development
    if (token) {
      const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/reset-password?token=${token}`;
      console.log(`[AUTH] Password reset link for ${parsed.data.email}: ${resetUrl}`);
    }

    // Always return success to prevent email enumeration
    return NextResponse.json({
      success: true,
      message: "If that email is registered, a reset link has been sent.",
    });
  } catch (error) {
    console.error("[AUTH] Forgot password error:", error);
    return NextResponse.json({ error: "An error occurred. Please try again." }, { status: 500 });
  }
}
