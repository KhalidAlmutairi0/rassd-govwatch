"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FileDown, Share2 } from "lucide-react";
import { useLanguage } from "@/components/rasd/LanguageProvider";
import { BackLink, ErrorState, LoadingState, Score, Status } from "@/components/rasd/ui";
import { IssueList, SummaryCard } from "@/components/rasd/ReportPanels";
import { RunButton } from "@/components/rasd/RunButton";
import { useResource } from "@/lib/use-resource";
import { deriveIssues, derivePages, reportScores } from "@/lib/report-data";
import type { RunReport } from "@/lib/report-model";
import { artifactUrl } from "@/lib/api-client";

export default function ReportPage() {
  const { runId } = useParams<{ runId: string }>();
  const { text, name, date, number } = useLanguage();
  const { data, error, loading, reload } = useResource<{ run: RunReport }>(`/api/sites/temp/runs/${runId}`);
  if (error) return <ErrorState retry={reload} />;
  if (loading || !data) return <LoadingState />;
  const run = data.run;
  const scores = reportScores(run);
  const issues = deriveIssues(run.steps);
  const pages = derivePages(run.steps);
  return <>
    <BackLink href={`/dashboard/${run.siteId}`}>{text("العودة إلى المنصة", "Back to platform")}</BackLink>
    <div className="report-title"><h1 dir="auto">{name(run.site)}</h1><p><bdi dir="ltr">{run.site.baseUrl}</bdi></p><div className="report-date"><span>{text("تاريخ الفحص", "Scanned on")} {date(run.startedAt)}</span><Status status={run.status} /></div></div>
    <div className="report-score">
      <Score value={scores.overall} large label={text("التقييم العام", "Overall Score")} />
      <div className="report-metrics">{[
        [text("الوظائف", "Functionality"), scores.functionality],
        [text("تغطية الفحص", "Check coverage"), scores.coverage],
        [text("سهولة الاستخدام", "Ease of use"), scores.ease],
        [text("الأداء", "Performance"), null],
      ].map(([label, value]) => <div className="report-metric" key={String(label)}><span>{label}</span><strong className={value === null ? "text-muted" : Number(value) >= 80 ? "text-good" : Number(value) >= 60 ? "text-warning" : "text-danger"}>{value === null ? "—" : String(value)}</strong></div>)}</div>
      <p className="metric-note">{text(`نجح ${number(run.passedSteps)} من ${number(run.totalSteps)} فحصًا مخططًا. تعرض الشرطة القياسات غير المتاحة.`, `${run.passedSteps} of ${run.totalSteps} planned checks passed. Unmeasured metrics are shown as a dash.`)}</p>
    </div>
    <SummaryCard value={run.summaryJson} />
    <section><div className="section-heading"><h2>{text("أبرز المشكلات", "Recorded issues")}</h2><span className="text-muted">{number(issues.length)}</span></div><IssueList issues={issues} runId={runId} /></section>
    <section className="section"><div className="section-heading"><h2>{text("الصفحات المكتشفة", "Discovered pages")}</h2><Link href={`/report/${runId}/pages`}>{text("عرض جميع الصفحات", "View all pages")}</Link></div><div className="surface data-row"><div className="data-row-main"><h3>{number(pages.length)} {text("صفحات تمت زيارتها", "pages visited")}</h3><p>{text("تقتصر النتائج على الصفحات والفحوصات المسجلة.", "Findings apply only to the recorded pages and checks.")}</p></div></div></section>
    <section className="section"><div className="section-heading"><h2>{text("تفاصيل الفحوصات", "Test steps")}</h2></div><div className="surface row-list">{run.steps.map((step) => <div key={step.stepIndex} className="data-row"><div className="data-row-main"><h3 dir="auto">{step.description}</h3>{step.error && <p dir="auto">{step.error}</p>}</div><div className="data-row-meta"><Status status={step.status} />{step.screenshotPath && <a className="text-link" href={artifactUrl(step.screenshotPath)} target="_blank" rel="noopener noreferrer">{text("عرض اللقطة", "Screenshot")}</a>}</div></div>)}</div></section>
    <div className="report-actions"><RunButton siteId={run.siteId} journeyId={run.journeyId} /><button className="button button-quiet" onClick={() => window.print()}><FileDown size={16} />{text("تصدير PDF", "Export PDF")}</button><button className="button button-quiet" onClick={() => { void navigator.clipboard?.writeText(window.location.href).catch(() => {}); }}><Share2 size={16} />{text("مشاركة التقرير", "Share report")}</button></div>
  </>;
}
