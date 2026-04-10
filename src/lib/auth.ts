// src/lib/auth.ts
import { createHash, randomBytes, pbkdf2Sync } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

const SESSION_COOKIE = "rassd_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const LOCKOUT_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export type UserRole = "governor" | "developer";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
}

// ─── Password hashing (PBKDF2 — no external deps) ────────────────────────────

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 10_000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = pbkdf2Sync(password, salt, 10_000, 64, "sha512").toString("hex");
  // Constant-time comparison to prevent timing attacks
  return timingSafeEqual(derived, hash);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ─── Session management ───────────────────────────────────────────────────────

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.session.create({
    data: { userId, token, expiresAt },
  });

  return token;
}

export async function getSessionUser(token: string): Promise<AuthUser | null> {
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { token } });
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role as UserRole,
  };
}

export async function deleteSession(token: string): Promise<void> {
  await prisma.session.delete({ where: { token } }).catch(() => {});
}

// ─── Login logic with lockout ─────────────────────────────────────────────────

export interface LoginResult {
  success: boolean;
  user?: AuthUser;
  token?: string;
  error?: string;
  lockedUntil?: Date;
  attemptsRemaining?: number;
}

export async function attemptLogin(email: string, password: string): Promise<LoginResult> {
  // Always do work to prevent email enumeration timing attacks
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  if (!user) {
    // Perform dummy hash to maintain constant time
    verifyPassword(password, "dummy:dummy");
    return { success: false, error: "Invalid email or password." };
  }

  // Check lockout
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const remaining = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return {
      success: false,
      error: `Account locked due to too many failed attempts.`,
      lockedUntil: user.lockedUntil,
      attemptsRemaining: 0,
    };
  }

  const valid = verifyPassword(password, user.passwordHash);

  if (!valid) {
    const newAttempts = user.failedAttempts + 1;
    const shouldLock = newAttempts >= LOCKOUT_ATTEMPTS;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedAttempts: newAttempts,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null,
      },
    });

    if (shouldLock) {
      const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
      return {
        success: false,
        error: `Account locked for 15 minutes after ${LOCKOUT_ATTEMPTS} failed attempts.`,
        lockedUntil,
        attemptsRemaining: 0,
      };
    }

    return {
      success: false,
      error: "Invalid email or password.",
      attemptsRemaining: LOCKOUT_ATTEMPTS - newAttempts,
    };
  }

  // Reset failed attempts on success
  await prisma.user.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedUntil: null },
  });

  const token = await createSession(user.id);

  return {
    success: true,
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role as UserRole },
  };
}

// ─── Password reset ───────────────────────────────────────────────────────────

export async function createPasswordReset(email: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return null; // Don't reveal whether email exists

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.passwordReset.create({ data: { userId: user.id, token, expiresAt } });
  return token;
}

export async function consumePasswordReset(token: string, newPassword: string): Promise<boolean> {
  const reset = await prisma.passwordReset.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!reset || reset.used || reset.expiresAt < new Date()) return false;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: reset.userId },
      data: { passwordHash: hashPassword(newPassword), failedAttempts: 0, lockedUntil: null },
    }),
    prisma.passwordReset.update({ where: { token }, data: { used: true } }),
  ]);

  return true;
}

// ─── Get current user from request (server-side) ────────────────────────────

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    return getSessionUser(token);
  } catch {
    return null;
  }
}

export { SESSION_COOKIE };
