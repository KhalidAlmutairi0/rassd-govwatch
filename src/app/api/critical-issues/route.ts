import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";

export async function GET() {
  try {
    const sites = await prisma.site.findMany({
      where: { isActive: true },
      select: { id: true, name: true, nameAr: true, baseUrl: true },
    });

    const latestRunIds: { runId: string; siteId: string }[] = [];
    for (const site of sites) {
      const latestRun = await prisma.run.findFirst({
        where: { siteId: site.id, status: { in: ["passed", "failed"] } },
        orderBy: { startedAt: "desc" },
        select: { id: true },
      });
      if (latestRun) latestRunIds.push({ runId: latestRun.id, siteId: site.id });
    }

    if (latestRunIds.length === 0) {
      return NextResponse.json({ issues: [], total: 0 });
    }

    const runIdList = latestRunIds.map((r) => r.runId);
    const runToSite = new Map(latestRunIds.map((r) => [r.runId, r.siteId]));
    const siteMap = new Map(sites.map((s) => [s.id, s]));

    const elements = await prisma.elementTestResult.findMany({
      where: {
        runId: { in: runIdList },
        status: "failed",
      },
      select: {
        id: true,
        runId: true,
        elementType: true,
        elementText: true,
        elementSelector: true,
        parentSection: true,
        action: true,
        status: true,
        responseTimeMs: true,
        urlBefore: true,
        urlAfter: true,
        screenshotAfter: true,
        error: true,
        domChanges: true,
      },
    });

    const issues: Array<{
      id: string;
      severity: string;
      category: string;
      title: string;
      page: string;
      description: string;
      elementType: string;
      section: string | null;
      responseTimeMs: number | null;
      urlBefore: string | null;
      urlAfter: string | null;
      screenshotAfter: string | null;
      siteName: string;
      siteNameAr: string | null;
      siteUrl: string;
    }> = [];

    for (const el of elements) {
      const err = (el.error || el.domChanges || "").toLowerCase();

      if (
        !err ||
        err.includes("element not found") ||
        err.includes("selector not found") ||
        err.includes("not interactable") ||
        err.includes("element interaction completed") ||
        err.includes("element responded") ||
        err.includes("navigation successful") ||
        err.includes("completed in") ||
        err.includes("page transition") ||
        err.includes("frame was detached") ||
        err.includes("target closed") ||
        err.includes("context was destroyed") ||
        err.includes("navigation timeout") ||
        err.includes("page.goto") ||
        err.includes("page.click") ||
        err.includes("page.waitfor") ||
        err.includes("waiting until") ||
        err.includes("call log")
      ) continue;

      const isRealProblem =
        err.includes("500") || err.includes("502") || err.includes("503") ||
        err.includes("404") || err.includes("403") ||
        err.includes("blank page") || err.includes("error page") ||
        err.includes("crash") || err.includes("refused") ||
        err.includes("blocked") || err.includes("ssl") ||
        err.includes("certificate") || err.includes("security") ||
        err.includes("mixed content");

      if (!isRealProblem) continue;

      let severity = "Medium";
      if (err.includes("500") || err.includes("crash") || err.includes("blank page")) {
        severity = "Critical";
      } else if (err.includes("404") || err.includes("blocked") || err.includes("refused")) {
        severity = "High";
      } else if (err.includes("slow") || err.includes("warning")) {
        severity = "Low";
      }

      let category = "QA";
      if (err.includes("timeout") || err.includes("slow") || err.includes("network") || err.includes("502") || err.includes("503")) category = "Performance";
      else if (err.includes("aria") || err.includes("label") || err.includes("focus") || err.includes("accessibility")) category = "Accessibility";
      else if (err.includes("404") || err.includes("refused") || err.includes("blocked")) category = "UX";

      const siteId = runToSite.get(el.runId);
      const site = siteId ? siteMap.get(siteId) : null;

      let page = "/";
      if (el.urlAfter) {
        try { page = new URL(el.urlAfter).pathname; } catch {}
      }

      issues.push({
        id: el.id,
        severity,
        category,
        title: el.elementText || el.error?.slice(0, 60) || "Element issue",
        page,
        description: el.error || el.domChanges || "",
        elementType: el.elementType,
        section: el.parentSection,
        responseTimeMs: el.responseTimeMs,
        urlBefore: el.urlBefore,
        urlAfter: el.urlAfter,
        screenshotAfter: el.screenshotAfter,
        siteName: site?.name ?? "Unknown",
        siteNameAr: site?.nameAr ?? null,
        siteUrl: site?.baseUrl ?? "",
      });
    }

    // Sort: Critical first, then High, Medium, Low
    const severityOrder: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    issues.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));

    return NextResponse.json({ issues, total: issues.length });
  } catch (error) {
    console.error("[CRITICAL-ISSUES] Error:", error);
    return NextResponse.json({ issues: [], total: 0 }, { status: 500 });
  }
}
