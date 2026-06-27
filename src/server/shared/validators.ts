// src/lib/validators.ts
// Zod schemas for validation and type safety

import { z } from "zod";

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
