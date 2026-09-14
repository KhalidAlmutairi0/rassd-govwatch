"use client";

import Link from "next/link";
import { Globe2, Monitor, Sparkles } from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { Status } from "./ui";
import { parseReportSummary, type ReportIssue } from "@/lib/report-data";
import type { RunSummary } from "@/lib/portfolio";
import { artifactUrl } from "@/lib/api-client";

export function Evidence({ path, title }: { path?: string | null; title: string }) {
  const { text } = useLanguage();
  const url = path ? artifactUrl(path) : null;
  return <div className="surface preview-card">{url ? <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={title} loading="lazy" decoding="async" /></a> : <div className="empty-state"><Monitor size={36} strokeWidth={1} /><p>{text("لا تتوفر لقطة شاشة لهذه النتيجة.", "No screenshot is available for this result.")}</p></div>}</div>;
}

export function SummaryCard({ value }: { value?: string | null }) {
  const { language, text } = useLanguage();
  const summary = parseReportSummary(value || null);
  const primary = language === "ar" ? summary?.executiveAr || summary?.executive : summary?.executive || summary?.executiveAr;
  const secondary = language === "ar" ? summary?.executive : summary?.executiveAr;
  return <section className="surface summary-card">
    <h2 className="summary-heading"><Sparkles size={18} />{text("ملخص تنفيذي", "Executive summary")}</h2>
    <p dir="auto">{primary || text("لم يتوفر ملخص لهذا الفحص. راجع النتائج المسجلة أدناه.", "No summary is available for this scan. Review the recorded results below.")}</p>
    {secondary && secondary !== primary && <details className="summary-translation"><summary>{language === "ar" ? "English summary" : "الملخص التنفيذي"}</summary><p dir="auto">{secondary}</p></details>}
  </section>;
}

export function IssueList({ issues, runId }: { issues: ReportIssue[]; runId: string }) {
  const { text } = useLanguage();
  return <div className="surface row-list">{issues.length ? issues.map((issue) => <Link key={issue.id} href={`/report/${runId}/issues/${issue.id}`} className="data-row">
    <div className="data-row-main"><h3 dir="auto">{issue.title}</h3><p dir="auto">{issue.description}</p></div><span className="issue-dot" aria-hidden="true" />
  </Link>) : <div className="empty-state"><Globe2 size={28} /><p>{text("لا توجد حالات فشل مسجلة.", "No failed checks were recorded.")}</p></div>}</div>;
}

export function RecentRuns({ runs }: { runs: RunSummary[] }) {
  const { text, date, number } = useLanguage();
  return <div className="surface row-list">{runs.length ? runs.map((run) => <Link key={run.id} href={`${["queued", "running"].includes(run.status) ? "/live" : "/report"}/${run.id}`} className="data-row">
    <div className="data-row-main"><h3>{text("نتيجة الفحص", "Scan result")}</h3><p>{date(run.startedAt)}</p></div>
    <div className="data-row-meta"><span>{number(run.passedSteps)} / {number(run.totalSteps)}</span><Status status={run.status} /></div>
  </Link>) : <div className="empty-state"><p>{text("لم تُنفّذ فحوصات لهذه المنصة بعد.", "No scans have run for this platform yet.")}</p></div>}</div>;
}
