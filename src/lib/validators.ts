// src/lib/validators.ts
// Zod schemas for validation and type safety

import { z } from "zod";

// ============================================
// TEST STEP SCHEMA — Safety-critical validation
// ============================================

export const TestStepSchema = z.object({
  action: z.enum([
    "navigate",
    "click",
    "type",
    "assert_title",
    "assert_element",
    "screenshot",
    "detect_search",
    "detect_forms",
    "discover_links",
    "discover_and_test_elements",
    "wait",
  ]),
  description: z.string().min(1).max(200),
  selector: z.string().optional(),
  value: z.string().optional(),
  url: z.string().url().optional(),
  assertions: z.array(z.string()).optional(),
  timeout: z.number().min(1000).max(30000).optional(), // 1s to 30s
});

export type TestStep = z.infer<typeof TestStepSchema>;

export const TestStepsArraySchema = z.array(TestStepSchema).min(1).max(50);

// ============================================
// DOMAIN SAFETY VALIDATOR
// ============================================

export function isSameDomain(baseUrl: string, targetUrl: string): boolean {
  try {
    const base = new URL(baseUrl);
    const target = new URL(targetUrl);

    // Exact match
    if (target.hostname === base.hostname) return true;

    // Subdomain match (e.g., www.example.com matches subdomain.example.com)
    if (target.hostname.endsWith('.' + base.hostname)) return true;

    // Parent domain match (e.g., www.example.com matches example.com)
    const baseParts = base.hostname.split('.');
    const targetParts = target.hostname.split('.');

    if (baseParts.length >= 2 && targetParts.length >= 2) {
      const baseDomain = baseParts.slice(-2).join('.');
      const targetDomain = targetParts.slice(-2).join('.');
      return baseDomain === targetDomain;
    }

    return false;
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
];

export function isDangerousAction(selector: string, value?: string): boolean {
  const combined = `${selector} ${value || ""}`.toLowerCase();
  return DANGEROUS_KEYWORDS.some(keyword => combined.includes(keyword));
}

// ============================================
// URL INPUT VALIDATION
// ============================================

export const UrlInputSchema = z.object({
  url: z.string().url("Must be a valid URL").refine(
    (url) => url.startsWith("http://") || url.startsWith("https://"),
    "URL must start with http:// or https://"
  ),
});

// ============================================
// SITE CREATION SCHEMA
// ============================================

export const CreateSiteSchema = z.object({
  name: z.string().min(1).max(100),
  nameAr: z.string().max(100).optional(),
  baseUrl: z.string().url(),
  description: z.string().max(500).optional(),
  schedule: z.number().int().min(0).max(1440).default(10), // 0 to 24 hours in minutes
});

// ============================================
// RUN TRIGGER SCHEMA
// ============================================

export const TriggerRunSchema = z.object({
  siteId: z.string().cuid(),
  journeyId: z.string().cuid().optional(),
  triggeredBy: z.enum(["manual", "api", "scheduler"]).default("manual"),
});
