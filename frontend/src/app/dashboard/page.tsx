"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useLanguage } from "@/components/rasd/LanguageProvider";
import { EmptyState, ErrorState, LoadingState, PlatformCard } from "@/components/rasd/ui";
import { useResource } from "@/lib/use-resource";
import type { Platform } from "@/lib/portfolio";

export default function PlatformsPage() {
  const { text } = useLanguage();
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors[cursors.length - 1];
  const { data, loading, error, reload } = useResource<{ sites: Platform[]; nextCursor: string | null }>(`/api/sites?limit=24${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, 10_000);
  return <>
    <div className="section-heading page-heading"><h1 className="page-title">{text("المنصات", "Platforms")}</h1><Link href="/sites/new" className="button button-outline"><Plus size={16} />{text("إضافة منصة", "Add platform")}</Link></div>
    {error ? <ErrorState retry={reload} /> : loading || !data ? <LoadingState /> : <>
      {data.sites.length ? <div className="platform-grid">{data.sites.map((site) => <PlatformCard key={site.id} site={site} />)}</div> : <EmptyState>{text("لا توجد منصات لعرضها.", "No platforms to display.")}</EmptyState>}
      <div className="pagination">{cursors.length > 0 && <button className="button button-quiet" onClick={() => setCursors((values) => values.slice(0, -1))}>{text("السابق", "Previous")}</button>}{data.nextCursor && <button className="button button-outline" onClick={() => setCursors((values) => [...values, data.nextCursor!])}>{text("التالي", "Next")}</button>}</div>
    </>}
  </>;
}
