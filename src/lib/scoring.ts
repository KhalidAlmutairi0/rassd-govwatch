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
      id: true,
      status: true,
      durationMs: true,
      totalSteps: true,
      passedSteps: true,
      failedSteps: true,
      steps: {
        select: {
          action: true,
          status: true,
          durationMs: true,
          error: true,
        },
      },
    },
  });

  if (runs.length === 0) {
    return { qa: 50, performance: 50, accessibility: 50, ux: 50, overall: 50, grade: "F" };
  }

  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  const allSteps = runs.flatMap((r) => r.steps);

  // ── QA score: step-level weighted pass rate ───────────────────────────────
  // Navigation and assertion failures count double — they represent real user impact.
  let weightedPassed = 0;
  let weightedTotal = 0;
  for (const step of allSteps) {
    if (step.status === "skipped") continue; // skipped steps don't affect score
    const isCritical = ["navigate", "assert_element", "assert_title", "click", "type"].includes(step.action);
    const weight = isCritical ? 2 : 1;
    weightedTotal += weight;
    if (step.status === "passed") weightedPassed += weight;
  }

  // Extra penalty when homepage (first navigate step) failed — citizens can't access the site
  const homepageFailCount = runs.filter((r) => {
    const first = r.steps[0];
    return first && first.action === "navigate" && first.status === "failed";
  }).length;

  const rawQa = weightedTotal > 0 ? (weightedPassed / weightedTotal) * 100 : 50;
  const qaScore = Math.round(clamp(rawQa - homepageFailCount * 6));

  // ── Performance score: per-page load times from navigate steps ────────────
  // More accurate than total run duration (which includes Playwright overhead).
  const navDurations = allSteps
    .filter((s) => s.action === "navigate" && s.status === "passed" && s.durationMs && s.durationMs > 500)
    .map((s) => s.durationMs!)
    .sort((a, b) => a - b);

  let perfScore = 65;
  if (navDurations.length > 0) {
    const avg = navDurations.reduce((s, d) => s + d, 0) / navDurations.length;
    const p90 = navDurations[Math.floor(navDurations.length * 0.9)] ?? avg;
    if (avg < 2_000 && p90 < 4_000) perfScore = 95;
    else if (avg < 4_000 && p90 < 8_000) perfScore = 85;
    else if (avg < 8_000 && p90 < 15_000) perfScore = 70;
    else if (avg < 15_000 && p90 < 30_000) perfScore = 50;
    else perfScore = 30;
  } else {
    // Fall back to total run duration if no navigate step durations
    const runDurations = runs.filter((r) => r.durationMs && r.durationMs > 0).map((r) => r.durationMs!);
    if (runDurations.length > 0) {
      const avg = runDurations.reduce((s, d) => s + d, 0) / runDurations.length;
      if (avg < 10_000) perfScore = 85;
      else if (avg < 20_000) perfScore = 70;
      else if (avg < 40_000) perfScore = 52;
      else perfScore = 32;
    }
  }

  // ── Accessibility score: navigation reachability + assertion coverage ─────
  // Measures whether key pages are consistently reachable and content is verifiable.
  const navSteps = allSteps.filter((s) => s.action === "navigate");
  const navPassRate = navSteps.length > 0
    ? navSteps.filter((s) => s.status === "passed").length / navSteps.length
    : 1;

  const assertSteps = allSteps.filter((s) => ["assert_element", "assert_title"].includes(s.action));
  const assertPassRate = assertSteps.length > 0
    ? assertSteps.filter((s) => s.status === "passed").length / assertSteps.length
    : 0.5;

  // Timeouts mean pages are unresponsive — a serious accessibility barrier
  const timeoutCount = allSteps.filter((s) => s.error?.toLowerCase().includes("timeout")).length;
  const timeoutPenalty = Math.min(timeoutCount * 4, 25);

  const accessScore = Math.round(clamp(
    navPassRate * 50 + assertPassRate * 35 + 15 - timeoutPenalty
  ));

  // ── UX score: blend reflecting real user experience ───────────────────────
  const errorRunPct = runs.filter((r) => r.status === "error").length / runs.length;
  const uxScore = Math.round(clamp(
    qaScore * 0.50 + perfScore * 0.40 + accessScore * 0.10 - errorRunPct * 15
  ));

  // ── Overall: weighted across all four dimensions ──────────────────────────
  const overall = Math.round(clamp(
    qaScore * 0.40 +
    perfScore * 0.25 +
    accessScore * 0.20 +
    uxScore * 0.15
  ));

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
