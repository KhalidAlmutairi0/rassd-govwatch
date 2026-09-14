"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownLeft, ArrowUpLeft, Globe2, RefreshCw, AlertCircle, ArrowRight, ArrowLeft } from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { reportScores } from "@/lib/report-data";
import { trendValues, type Platform } from "@/lib/portfolio";

export function Status({ status }: { status: string }) {
  const { text } = useLanguage();
  const labels: Record<string, [string, string]> = {
    healthy: ["سليمة", "Healthy"], degraded: ["تحتاج متابعة", "Needs attention"], down: ["متوقفة", "Down"], unknown: ["لم تُقيّم", "Not assessed"],
    passed: ["مكتمل", "Passed"], failed: ["فشل الفحص", "Failed"], warning: ["غير مؤكد", "Unverified"], error: ["تعذر الإكمال", "Error"], timeout: ["انتهت المهلة", "Timed out"], running: ["قيد الفحص", "Running"], queued: ["في الانتظار", "Queued"],
    open: ["تحتاج متابعة", "Open"], investigating: ["قيد المتابعة", "Investigating"], resolved: ["تم الحل", "Resolved"], skipped: ["تم التخطي", "Skipped"], pending: ["في الانتظار", "Pending"], connecting: ["جارٍ الاتصال", "Connecting"],
    standalone: ["معاينة بدون خادم", "Standalone preview"],
  };
  const tone = ["passed", "healthy", "resolved"].includes(status) ? "good" : ["failed", "down", "error"].includes(status) ? "danger" : ["running", "queued", "investigating"].includes(status) ? "info" : ["warning", "degraded", "timeout", "open"].includes(status) ? "warning" : "muted";
  const label: [string, string] = labels[status] || [status, status];
  return <span className={`status status--${tone}`}>{text(...label)}</span>;
}

export function Score({ value, large = false, label }: { value: number | null; large?: boolean; label?: string }) {
  const { number, text } = useLanguage();
  const tone = value === null ? "muted" : value >= 80 ? "good" : value >= 60 ? "warning" : "danger";
  const grade = value === null ? "—" : value >= 90 ? "A" : value >= 80 ? "B" : value >= 70 ? "C" : value >= 60 ? "D" : "F";
  return <div className={`score score--${tone} ${large ? "score--large" : ""}`} title={value === null ? text("لا تتوفر نتيجة مؤكدة", "No verified score is available") : undefined}>
    <div className="score-line"><strong>{value === null ? "—" : large ? number(value) : value}</strong><span className="grade" dir="ltr">{grade}</span></div>
    {label && <span className="score-caption">{label}</span>}
  </div>;
}

export function Sparkline({ values }: { values: Array<number | null> }) {
  const segments: string[] = [];
  let segment: string[] = [];
  values.forEach((value, index) => {
    if (value === null) { if (segment.length > 1) segments.push(segment.join(" ")); segment = []; }
    else segment.push(`${index * 120 / Math.max(values.length - 1, 1)},${27 - value * 0.24}`);
  });
  if (segment.length > 1) segments.push(segment.join(" "));
  return <svg className="sparkline" viewBox="0 0 120 30" aria-hidden="true">{segments.map((points, index) => <polyline key={index} points={points} fill="none" stroke="currentColor" strokeWidth="1.5" />)}</svg>;
}

export function PlatformCard({ site }: { site: Platform }) {
  const { text, name, date } = useLanguage();
  const score = site.latestRun ? reportScores(site.latestRun).overall : null;
  const previous = site.recentRuns?.[1] ? reportScores(site.recentRuns[1]).overall : null;
  const delta = score !== null && previous !== null ? score - previous : null;
  return <Link href={`/dashboard/${site.id}`} className="platform-card surface" aria-label={`${name(site)} ${text("عرض التفاصيل", "View details")}`}>
    <div className="platform-card-content">
      <h3 dir="auto">{name(site)}</h3>
      <div className="platform-score-row"><Score value={score} />{delta !== null && delta !== 0 && <span className={`delta ${delta > 0 ? "text-good" : "text-danger"}`}>{delta > 0 ? <ArrowUpLeft size={13} /> : <ArrowDownLeft size={13} />}{Math.abs(delta)}</span>}</div>
      <div className="platform-foot"><Sparkline values={trendValues(site.recentRuns || [])} /><Status status={site.latestRun?.status || site.status} /></div>
      <span className="sr-only">{date(site.lastRunAt)}</span>
    </div>
    <div className="platform-mark" aria-hidden="true"><Globe2 size={54} strokeWidth={1.15} /></div>
  </Link>;
}

export function LoadingState() {
  const { text } = useLanguage();
  return <div className="loading-state" role="status"><RefreshCw size={22} className="animate-spin" /><span>{text("جارٍ تحميل البيانات…", "Loading…")}</span></div>;
}

export function ErrorState({ retry }: { retry: () => void }) {
  const { text } = useLanguage();
  return <div className="empty-state surface" role="alert"><AlertCircle size={28} /><p>{text("تعذر تحميل البيانات", "Unable to load data")}</p><button className="button button-outline" onClick={retry}>{text("إعادة المحاولة", "Try again")}</button></div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty-state surface"><Globe2 size={32} strokeWidth={1.2} /><p>{children}</p></div>;
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  const { language } = useLanguage();
  return <Link href={href} className="back-link">{language === "ar" ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}{children}</Link>;
}
