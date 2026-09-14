"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useLanguage } from "@/components/rasd/LanguageProvider";
import { EmptyState, ErrorState, LoadingState, PlatformCard, Score, Status } from "@/components/rasd/ui";
import { useResource } from "@/lib/use-resource";
import type { OverviewData } from "@/lib/portfolio";

export default function OverviewPage() {
  const { text, name, number, date } = useLanguage();
  const { data, error, loading, reload } = useResource<OverviewData>("/api/overview", 10_000);
  if (error) return <ErrorState retry={reload} />;
  if (loading || !data) return <LoadingState />;
  return <>
    <section className="health-score"><Score value={data.health.score} large label={text("صحة المحفظة الرقمية", "Digital portfolio health")} /><small>{text(`${number(data.health.healthy)} منصة سليمة من ${number(data.health.known)} منصة ذات حالة معروفة`, `${data.health.healthy} healthy platforms out of ${data.health.known} with known status`)}</small></section>
    <section>
      <div className="section-heading"><h2>{text("المنصات", "Platforms")}</h2>{data.health.total > data.sites.length && <Link href="/dashboard">{text("عرض الكل", "View all")}</Link>}</div>
      {data.sites.length ? <div className="platform-grid">{data.sites.map((site) => <PlatformCard key={site.id} site={site} />)}</div> : <EmptyState>{text("أضف منصتك الأولى لبدء الفحص.", "Add your first platform to start scanning.")}</EmptyState>}
      <Link href="/sites/new" className="button button-outline button-wide platform-add"><Plus size={18} />{text("إضافة منصة جديدة", "Add new platform")}</Link>
    </section>
    <section className="section">
      <div className="section-heading"><h2>{text("التنبيهات النشطة", "Active alerts")}</h2><span className="text-muted">{number(data.openIncidents)}</span></div>
      <div className="surface row-list">{data.incidents.length ? data.incidents.map((incident) => <Link key={incident.id} href={`/dashboard/${incident.siteId}`} className="data-row"><div className="data-row-main"><h3 dir="auto">{name(incident.site)}</h3><p dir="auto">{incident.title}</p></div><div className="data-row-meta"><Status status={incident.status} /><time>{date(incident.lastSeenAt)}</time></div></Link>) : <div className="empty-state"><p>{text("لا توجد تنبيهات نشطة حاليًا.", "There are no active alerts.")}</p></div>}<Link className="row-list-footer" href="/incidents">{text("عرض الكل", "View all")}</Link></div>
    </section>
  </>;
}
