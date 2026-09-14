// src/lib/validators.ts
// Zod schemas for validation and type safety

import { z } from "zod";

export const HttpUrlSchema = z.string().max(2048).url().refine((value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}, "Use an HTTP(S) URL without credentials");

// ============================================
// DOMAIN SAFETY VALIDATOR
// ============================================

export function isSameDomain(baseUrl: string, targetUrl: string): boolean {
  try {
    const base = new URL(baseUrl);
    const target = new URL(targetUrl);
    if (!HttpUrlSchema.safeParse(baseUrl).success || !HttpUrlSchema.safeParse(targetUrl).success) return false;
    const hostname = base.hostname.replace(/^www\./, "").replace(/\.$/, "");
    const targetHostname = target.hostname.replace(/\.$/, "");
    return targetHostname === hostname || targetHostname.endsWith(`.${hostname}`);
  } catch {
    return false;
  }
}

// ============================================
// DANGEROUS ACTION DETECTOR
// ============================================

const DANGEROUS_KEYWORDS = [
  "delete",
  "remove",
  "submit",
  "pay",
  "purchase",
  "confirm",
  "approve",
  "logout",
  "signout",
  "disconnect",
  "unlink",
  "cancel",
  "destroy",
  "login", "signin", "sign-in", "register", "oauth", "nafath", "download", "password",
  "حذف", "إزالة", "إرسال", "دفع", "شراء", "دخول", "خروج", "نفاذ", "تحميل",
];

export function isDangerousAction(selector: string, value?: string): boolean {
  const combined = `${selector} ${value || ""}`.toLowerCase();
  return DANGEROUS_KEYWORDS.some(keyword => combined.includes(keyword));
}

// ============================================
// URL INPUT VALIDATION
// ============================================

export const UrlInputSchema = z.object({
  url: HttpUrlSchema,
});

// ============================================
// SITE CREATION SCHEMA
// ============================================

export const CreateSiteSchema = z.object({
  name: z.string().min(1).max(100),
  nameAr: z.string().max(100).optional(),
  baseUrl: HttpUrlSchema,
  description: z.string().max(500).optional(),
  schedule: z.number().int().min(0).max(1440).default(10), // 0 to 24 hours in minutes
});
