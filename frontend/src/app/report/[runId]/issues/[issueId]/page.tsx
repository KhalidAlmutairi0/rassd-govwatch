"use client";

import { useParams } from "next/navigation";
import { useLanguage } from "@/components/rasd/LanguageProvider";
import { BackLink, EmptyState, ErrorState, LoadingState, Status } from "@/components/rasd/ui";
import { Evidence, IssueList } from "@/components/rasd/ReportPanels";
import { RunButton } from "@/components/rasd/RunButton";
import { useResource } from "@/lib/use-resource";
import { deriveIssues, type ReportIssue } from "@/lib/report-data";
import type { RunReport } from "@/lib/report-model";
import { isStandalone } from "@/lib/api-client";

export default function IssueDetailPage() {
  const { runId, issueId } = useParams<{ runId: string; issueId: string }>();
  const { text } = useLanguage();
  const { data, error, loading, reload } = useResource<{ run: RunReport }>(`/api/sites/temp/runs/${runId}`);
  if (error) return <ErrorState retry={reload} />;
  if (loading || !data) return <LoadingState />;
  const issues = deriveIssues(data.run.steps);
  const issue: ReportIssue | undefined = issues.find((item) => item.id === issueId) || (isStandalone ? {
    id: issueId, severity: "unknown", category: "Preview", title: text("معاينة تفاصيل المشكلة", "Issue detail preview"), page: "/",
    description: text("اربط الخادم لعرض أدلة ونتائج فعلية.", "Connect the backend to display real evidence and results."),
    impact: "No scan has been executed in standalone mode.",
  } : undefined);
  if (!issue) return <EmptyState>{text("المشكلة غير موجودة", "Issue not found")}</EmptyState>;
  return <>
    <BackLink href={`/report/${runId}`}>{text("العودة إلى التقرير", "Back to report")}</BackLink>
    <div className="report-title"><h1 dir="auto">{issue.title}</h1><p><bdi dir="ltr">{issue.page}</bdi></p><div className="report-date"><Status status={isStandalone ? "standalone" : "failed"} /><span>{isStandalone ? text("معاينة", "Preview") : text("فحص وظائف", "QA check")}</span></div></div>
    <Evidence path={issue.screenshotPath} title={issue.title} />
    <section className="surface summary-card"><h2 className="summary-heading">{text("الوصف", "Description")}</h2><p dir="auto">{issue.description}</p></section>
    <section className="surface summary-card"><h2 className="summary-heading">{text("الأثر", "Impact")}</h2><p>{text(isStandalone ? "لم يُنفّذ أي فحص في وضع المعاينة." : "فشل هذا الفحص في المتصفح. تحتاج النتيجة وأدلتها إلى المراجعة؛ لم يُقَس الأثر الأوسع على المستخدمين.", issue.impact)}</p></section>
    {issues.length > 1 && <section><div className="section-heading"><h2>{text("مشكلات ذات صلة", "Related issues")}</h2></div><IssueList issues={issues.filter((item) => item.id !== issueId).slice(0, 3)} runId={runId} /></section>}
    <div className="report-actions"><RunButton siteId={data.run.siteId} journeyId={data.run.journeyId} /></div><p className="metric-note">{text("تحقق من معالجة المشكلة بإجراء فحص جديد؛ تبقى النتائج السابقة محفوظة.", "Run another scan to verify a resolution. Historical findings remain unchanged.")}</p>
  </>;
}
