// src/middleware.ts
import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "rassd_session";
const ROLE_COOKIE = "rassd_role";

const PUBLIC_PATHS = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
];

const GOVERNOR_ONLY = ["/gov"];
const DEVELOPER_ONLY = ["/dashboard", "/sites", "/trends", "/compare", "/settings"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and static assets
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/artifacts") ||
    pathname.startsWith("/favicon") ||
    pathname.match(/\.(png|jpg|jpeg|svg|ico|webm|zip|json)$/)
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const role = request.cookies.get(ROLE_COOKIE)?.value;

  // Not logged in → redirect to login
  if (!token || !role) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Role-based routing
  if (role === "governor") {
    if (DEVELOPER_ONLY.some((p) => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL("/gov", request.url));
    }
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/gov", request.url));
    }
  }

  if (role === "developer") {
    if (GOVERNOR_ONLY.some((p) => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    // "/" is the scan page — developers can access it directly
  }

  // Attach role to headers for downstream use
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-role", role);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public).*)"],
};
