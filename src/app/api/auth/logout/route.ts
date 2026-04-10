// src/app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteSession, SESSION_COOKIE } from "@/lib/auth";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (token) await deleteSession(token);

    const response = NextResponse.json({ success: true });
    response.cookies.delete(SESSION_COOKIE);
    response.cookies.delete("rassd_role");
    return response;
  } catch {
    return NextResponse.json({ success: true });
  }
}
