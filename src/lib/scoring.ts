// src/lib/scoring.ts
// Computes UX / QA / Accessibility / Performance sub-scores from run data.
// All scores are 0–100; overall = weighted average.

import { prisma } from "./prisma";

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function getScoreColor(score: number): string {
  if (score >= 80) return "#16a34a";
  if (score >= 60) return "#e67700";
  return "#af0818";
}

// Convert Gregorian date to Hijri (Islamic Umm Al-Qura)
export function toHijriDate(date: Date): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      calendar: "islamic-umalqura",
      day: "numeric",
      month: "long",
      year: "numeric",
    } as Intl.DateTimeFormatOptions).format(date);
  } catch {
    return "";
  }
}

export function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

// ─── Score computation ────────────────────────────────────────────────────────

export interface SubScores {
  qa: number;
  performance: number;
  accessibility: number;
  ux: number;
  overall: number;
  grade: string;
}

/**
 * Compute scores for a site from its last 10 completed runs.
 * All values are integers 0–100.
 */
export async function computeSiteScores(siteId: string): Promise<SubScores> {
  const runs = await prisma.run.findMany({
    where: { siteId, status: { in: ["passed", "failed", "error"] } },
    orderBy: { startedAt: "desc" },
    take: 10,
    select: {
      status: true,
      durationMs: true,
      totalSteps: true,
      passedSteps: true,
      failedSteps: true,
    },
  });

  if (runs.length === 0) {
    return { qa: 50, performance: 50, accessibility: 50, ux: 50, overall: 50, grade: "F" };
  }

  // ── QA score: weighted step pass rate (penalise errors heavily) ──────────
  const totalSteps = runs.reduce((s, r) => s + (r.totalSteps || 0), 0);
  const passedSteps = runs.reduce((s, r) => s + (r.passedSteps || 0), 0);
  const qaScore = totalSteps > 0 ? Math.round((passedSteps / totalSteps) * 100) : 50;

  // ── Performance score: based on avg run duration ──────────────────────────
  const durations = runs.filter((r) => r.durationMs && r.durationMs > 0).map((r) => r.durationMs!);
  let perfScore = 65;
  if (durations.length > 0) {
    const avg = durations.reduce((s, d) => s + d, 0) / durations.length;
    if (avg < 5_000) perfScore = 95;
    else if (avg < 10_000) perfScore = 85;
    else if (avg < 20_000) perfScore = 70;
    else if (avg < 40_000) perfScore = 55;
    else perfScore = 35;
  }

  // ── Accessibility score: pass-rate derived (no WCAG scanner yet) ──────────
  const passedRuns = runs.filter((r) => r.status === "passed").length;
  const accessScore = Math.round((passedRuns / runs.length) * 75 + 15); // 15–90 range

  // ── UX score: blend of QA and perf, slightly discounted ───────────────────
  const uxScore = Math.round(qaScore * 0.55 + perfScore * 0.45);

  // ── Overall: weighted average ─────────────────────────────────────────────
  const overall = Math.round(
    qaScore * 0.35 +
    perfScore * 0.25 +
    accessScore * 0.25 +
    uxScore * 0.15
  );

  const clamp = (v: number) => Math.min(100, Math.max(0, v));

  return {
    qa: clamp(qaScore),
    performance: clamp(perfScore),
    accessibility: clamp(accessScore),
    ux: clamp(uxScore),
    overall: clamp(overall),
    grade: getGrade(clamp(overall)),
  };
}

/**
 * Compute scores for a site and persist a SiteScore snapshot.
 * Called by the scheduler after every completed run.
 */
export async function storeSiteScore(siteId: string): Promise<void> {
  try {
    const scores = await computeSiteScores(siteId);
    await (prisma as any).siteScore.create({
      data: {
        siteId,
        overallScore: scores.overall,
        grade: scores.grade,
        uxScore: scores.ux,
        qaScore: scores.qa,
        accessScore: scores.accessibility,
        perfScore: scores.performance,
      },
    });
  } catch (err) {
    console.error("[SCORING] Failed to store site score:", err);
  }
}

/**
 * Get the most recent SiteScore for a given site.
 * Falls back to computing live if no stored score exists.
 */
export async function getLatestScore(siteId: string): Promise<SubScores & { computedAt: Date | null }> {
  const stored = await (prisma as any).siteScore.findFirst({
    where: { siteId },
    orderBy: { computedAt: "desc" },
  });

  if (stored) {
    return {
      overall: stored.overallScore,
      grade: stored.grade,
      qa: stored.qaScore,
      performance: stored.perfScore,
      accessibility: stored.accessScore,
      ux: stored.uxScore,
      computedAt: stored.computedAt,
    };
  }

  // No stored score → compute live
  const live = await computeSiteScores(siteId);
  return { ...live, computedAt: null };
}

/**
 * Get weekly score history for sparkline (last 8 data points, one per week).
 */
export async function getScoreHistory(siteId: string): Promise<number[]> {
  const scores = await (prisma as any).siteScore.findMany({
    where: { siteId },
    orderBy: { computedAt: "asc" },
    take: 56, // up to 8 weeks × 7 scores/week
    select: { overallScore: true, computedAt: true },
  });

  if (scores.length === 0) return [];

  // Bucket into 8 weekly averages
  const buckets: number[][] = Array.from({ length: 8 }, () => []);
  const now = Date.now();
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  for (const s of scores) {
    const weeksAgo = Math.floor((now - new Date(s.computedAt).getTime()) / WEEK_MS);
    const idx = Math.min(7, weeksAgo); // oldest goes in bucket 7
    buckets[7 - idx].push(s.overallScore);
  }

  // Average each bucket; carry forward last known value for empty buckets
  const result: number[] = [];
  let last = 0;
  for (const bucket of buckets) {
    if (bucket.length > 0) {
      last = Math.round(bucket.reduce((s, v) => s + v, 0) / bucket.length);
    }
    result.push(last);
  }
  return result;
}
