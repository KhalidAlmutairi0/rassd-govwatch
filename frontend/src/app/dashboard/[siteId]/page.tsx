"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useLanguage } from "@/components/rasd/LanguageProvider";
import { BackLink, ErrorState, LoadingState, Score, Status } from "@/components/rasd/ui";
import { RecentRuns, SummaryCard } from "@/components/rasd/ReportPanels";
import { RunButton } from "@/components/rasd/RunButton";
import { useResource } from "@/lib/use-resource";
import type { RunSummary } from "@/lib/portfolio";
import { reportScores } from "@/lib/report-data";

interface SiteDetail {
  id: string; name: string; nameAr?: string | null; baseUrl: string; status: string; schedule: number; isActive: boolean;
  runs: Array<RunSummary & { summaryJson: string | null }>;
  incidents: Array<{ id: string; title: string; description?: string | null; status: string }>;
}

export default function PlatformDetailPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const { text, name } = useLanguage();
  const { data, loading, error, reload } = useResource<{ site: SiteDetail }>(`/api/sites/${siteId}`, 10_000);
  if (error) return <ErrorState retry={reload} />;
  if (loading || !data) return <LoadingState />;
  const site = data.site;
  const latest = site.runs[0];
  return <>
    <BackLink href="/dashboard">{text("المنصات", "Platforms")}</BackLink>
    <div className="report-title"><h1 dir="auto">{name(site)}</h1><p><bdi dir="ltr">{site.baseUrl}</bdi></p></div>
    <div className="report-score"><Score value={latest ? reportScores(latest).overall : null} large label={text("آخر نتيجة فحص", "Latest scan score")} /><Status status={latest?.status || site.status} /></div>
    <SummaryCard value={latest?.summaryJson} />
    <section><div className="section-heading"><h2>{text("أبرز المشكلات", "Issues requiring attention")}</h2></div><div className="surface row-list">{site.incidents.length ? site.incidents.map((incident) => <div className="data-row" key={incident.id}><div className="data-row-main"><h3 dir="auto">{incident.title}</h3><p dir="auto">{incident.description}</p></div><Status status={incident.status} /></div>) : <div className="empty-state"><p>{text("لا توجد تنبيهات نشطة لهذه المنصة.", "No active alerts for this platform.")}</p></div>}</div></section>
    <section className="section"><div className="section-heading"><h2>{text("آخر الفحوصات", "Recent scans")}</h2></div><RecentRuns runs={site.runs} /></section>
    <div className="report-actions"><RunButton siteId={site.id} /><Link className="button button-outline" href={`/sites/${site.id}/settings`}>{text("إعدادات المنصة", "Platform settings")}</Link></div>
  </>;
}
