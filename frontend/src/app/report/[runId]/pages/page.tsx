"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Monitor } from "lucide-react";
import { useLanguage } from "@/components/rasd/LanguageProvider";
import { BackLink, EmptyState, ErrorState, LoadingState } from "@/components/rasd/ui";
import { useResource } from "@/lib/use-resource";
import { derivePages } from "@/lib/report-data";
import type { RunReport } from "@/lib/report-model";
import { artifactUrl } from "@/lib/api-client";

export default function DiscoveredPagesPage() {
  const { runId } = useParams<{ runId: string }>();
  const { text, number } = useLanguage();
  const [search, setSearch] = useState("");
  const { data, error, loading, reload } = useResource<{ run: RunReport }>(`/api/sites/temp/runs/${runId}`);
  const pages = derivePages(data?.run.steps || []).filter((page) => `${page.name} ${page.url}`.toLowerCase().includes(search.toLowerCase()));
  return <>
    <BackLink href={`/report/${runId}`}>{text("العودة إلى التقرير", "Back to report")}</BackLink>
    <div className="page-heading"><h1>{text("الصفحات المكتشفة", "Discovered Pages")}</h1><p>{text("الصفحات التي تمت زيارتها خلال الفحص.", "Pages visited during this scan.")}</p></div>
    <label className="field search-field"><span className="sr-only">{text("البحث في الصفحات", "Search pages")}</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={text("ابحث عن صفحة…", "Search pages…")} /></label>
    {error ? <ErrorState retry={reload} /> : loading ? <LoadingState /> : !pages.length ? <EmptyState>{text("لا توجد صفحات مطابقة.", "No matching pages.")}</EmptyState> : <div className="page-grid">{pages.map((page) => <Link key={page.id} className="surface page-card" href={`/report/${runId}/pages/${page.id}`}>
      {page.screenshotPath ? <img src={artifactUrl(page.screenshotPath)} alt={page.name} loading="lazy" decoding="async" /> : <div className="page-placeholder"><Monitor size={36} strokeWidth={1} /></div>}
      <div className="page-card-content"><h2 dir="auto">{page.path === "/" ? text("الصفحة الرئيسية", "Homepage") : page.name}</h2><p><bdi dir="ltr">{page.path}</bdi></p><footer><span>{number(page.errorCount)} {text("حالات فشل مسجلة", "recorded failures")}</span><span className="text-link">{text("عرض التفاصيل", "View details")}</span></footer></div>
    </Link>)}</div>}
  </>;
}
