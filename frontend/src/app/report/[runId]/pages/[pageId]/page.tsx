"use client";

import { useParams } from "next/navigation";
import { useLanguage } from "@/components/rasd/LanguageProvider";
import { BackLink, EmptyState, ErrorState, LoadingState } from "@/components/rasd/ui";
import { Evidence, IssueList } from "@/components/rasd/ReportPanels";
import { useResource } from "@/lib/use-resource";
import { derivePages } from "@/lib/report-data";
import type { RunReport } from "@/lib/report-model";

export default function PageDetailPage() {
  const { runId, pageId } = useParams<{ runId: string; pageId: string }>();
  const { text, number } = useLanguage();
  const { data, error, loading, reload } = useResource<{ run: RunReport }>(`/api/sites/temp/runs/${runId}`);
  if (error) return <ErrorState retry={reload} />;
  if (loading || !data) return <LoadingState />;
  const page = derivePages(data.run.steps).find((item) => item.id === pageId);
  if (!page) return <EmptyState>{text("الصفحة غير موجودة", "Page not found")}</EmptyState>;
  const title = page.path === "/" ? text("الصفحة الرئيسية", "Homepage") : page.name;
  return <>
    <BackLink href={`/report/${runId}/pages`}>{text("الصفحات المكتشفة", "Discovered pages")}</BackLink>
    <div className="report-title"><h1 dir="auto">{title}</h1><p><a href={page.url} target="_blank" rel="noopener noreferrer"><bdi dir="ltr">{page.url}</bdi></a></p></div>
    <Evidence path={page.screenshotPath} title={title} />
    <section><div className="section-heading"><h2>{text("مقاييس الصفحة", "Page Metrics")}</h2></div><div className="metric-grid">{[
      [text("زمن التحميل", "Load time"), page.loadTime === null ? "—" : `${page.loadTime.toFixed(1)}s`],
      [text("الطلبات", "Requests"), page.requests === null ? "—" : number(page.requests)],
      [text("حجم الصفحة", "Page weight"), page.pageWeight],
      [text("أخطاء المتصفح", "Console errors"), page.consoleErrors === null ? "—" : number(page.consoleErrors)],
    ].map(([label, value]) => <div className="surface metric-tile" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></section>
    <section className="section"><div className="section-heading"><h2>{text("مؤشرات أداء الويب", "Web Vitals")}</h2></div><div className="metric-grid metric-grid-three">{[
      [text("ظهور المحتوى الأول", "First Contentful Paint"), page.fcp], [text("ظهور أكبر عنصر", "Largest Contentful Paint"), page.lcp], [text("تغير التخطيط التراكمي", "Cumulative Layout Shift"), page.cls],
    ].map(([label, value]) => <div className="surface metric-tile" key={String(label)}><span>{label}</span><strong>{value === null ? "—" : String(value)}</strong></div>)}</div><p className="metric-note">{text("تعرض الشرطة القياسات التي لم يجمعها هذا الفحص.", "A dash indicates a measurement this scan did not collect.")}</p></section>
    <section className="section"><div className="section-heading"><h2>{text("المشكلات في هذه الصفحة", "Issues on This Page")}</h2></div><IssueList issues={page.issues} runId={runId} /></section>
  </>;
}
