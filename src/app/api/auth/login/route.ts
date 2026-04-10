// src/app/api/auth/login/route.ts
import { NextResponse } from "next/server";
import { attemptLogin, SESSION_COOKIE } from "@/lib/auth";
import { z } from "zod";

const LoginSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = LoginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const result = await attemptLogin(parsed.data.email, parsed.data.password);

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error,
          lockedUntil: result.lockedUntil?.toISOString(),
          attemptsRemaining: result.attemptsRemaining,
        },
        { status: 401 }
      );
    }

    // Set session cookie
    const response = NextResponse.json({
      success: true,
      user: result.user,
      redirectTo: result.user!.role === "governor" ? "/gov" : "/dashboard",
    });

    response.cookies.set(SESSION_COOKIE, result.token!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    // Non-httpOnly role cookie — readable by middleware (Edge Runtime safe)
    response.cookies.set("rassd_role", result.user!.role, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    return response;
  } catch (error: any) {
    console.error("[AUTH] Login error:", error);
    return NextResponse.json({ error: "An error occurred. Please try again." }, { status: 500 });
  }
}
