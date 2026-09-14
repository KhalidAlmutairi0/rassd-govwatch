"use client";

import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/components/rasd/LanguageProvider";
import { EmptyState, ErrorState, LoadingState, Status } from "@/components/rasd/ui";
import { RunButton } from "@/components/rasd/RunButton";
import { useResource } from "@/lib/use-resource";
import type { IncidentSummary } from "@/lib/portfolio";

export default function AlertsPage() {
  const { text, name, date } = useLanguage();
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors[cursors.length - 1];
  const { data, loading, error, reload } = useResource<{ incidents: IncidentSummary[]; nextCursor: string | null }>(`/api/incidents?status=active${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, cursor ? 0 : 10_000);
  return <>
    <div className="page-heading page-heading-centered"><h1>{text("يحتاج اهتمامك", "Needs your attention")}</h1><p>{text("تنبيهات مستندة إلى الفحوصات المسجلة.", "Alerts based on recorded scan results.")}</p></div>
    {error ? <ErrorState retry={reload} /> : loading || !data ? <LoadingState /> : <>
      {!data.incidents.length ? <EmptyState>{text("لا توجد تنبيهات نشطة.", "There are no active alerts.")}</EmptyState> : <div className="alert-stack">{data.incidents.map((incident) => <article className="surface alert-card" key={incident.id}><div className="section-heading"><h2 dir="auto">{name(incident.site)}</h2><Status status={incident.status} /></div><p dir="auto">{incident.description || incident.title}</p><footer><Link className="button" href={`/dashboard/${incident.siteId}`}>{text("عرض التفاصيل", "View details")}</Link><time>{date(incident.lastSeenAt)}</time></footer><div className="alert-secondary"><RunButton siteId={incident.siteId} journeyId={incident.journeyId || undefined} outline /></div></article>)}</div>}
      <div className="pagination">{!!cursors.length && <button className="button button-quiet" onClick={() => setCursors((values) => values.slice(0, -1))}>{text("السابق", "Previous")}</button>}<button className="button button-quiet" onClick={() => { setCursors([]); reload(); }}>{text("تحديث القائمة", "Refresh list")}</button>{data.nextCursor && <button className="button button-outline" onClick={() => setCursors((values) => [...values, data.nextCursor!])}>{text("التالي", "Next")}</button>}</div>
      {!!cursors.length && <p className="metric-note">{text("تظهر التنبيهات الجديدة أو المحدثة عند تحديث القائمة.", "New or updated alerts appear when you refresh the list.")}</p>}
    </>}
  </>;
}
