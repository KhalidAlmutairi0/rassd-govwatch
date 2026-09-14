"use client";

import { useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLanguage } from "@/components/rasd/LanguageProvider";
import { BackLink, ErrorState, LoadingState } from "@/components/rasd/ui";
import { useResource } from "@/lib/use-resource";
import { apiFetch, isStandalone } from "@/lib/api-client";

interface Settings { id: string; name: string; nameAr?: string | null; baseUrl: string; schedule: number; isActive: boolean }

function SettingsForm({ site }: { site: Settings }) {
  const { text } = useLanguage();
  const router = useRouter();
  const [name, setName] = useState(site.name);
  const [nameAr, setNameAr] = useState(site.nameAr || "");
  const [schedule, setSchedule] = useState(site.schedule);
  const [active, setActive] = useState(site.isActive);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || isStandalone) return;
    setPending(true); setError(false);
    try {
      const response = await apiFetch(`/api/sites/${site.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), nameAr: nameAr.trim(), schedule, isActive: active }) });
      if (!response.ok) throw new Error("Save failed");
      router.push(`/dashboard/${site.id}`);
    } catch { setError(true); setPending(false); }
  };
  const intervals = Array.from(new Set([0, 10, 30, 60, 1440, site.schedule])).sort((a, b) => a - b);
  return <form onSubmit={save}><div className="surface form-card">
    <label className="field"><span className="field-label">{text("الاسم الأساسي للمنصة", "Platform name")}</span><input value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} disabled={pending} /></label>
    <label className="field"><span className="field-label">{text("اسم المنصة (العربية)", "Platform name (Arabic)")}</span><input value={nameAr} onChange={(event) => setNameAr(event.target.value)} maxLength={100} disabled={pending} dir="rtl" /></label>
    <label className="field"><span className="field-label">{text("رابط المنصة", "Website URL")}</span><input value={site.baseUrl} readOnly dir="ltr" /></label>
    <label className="switch-row"><span>{text("تفعيل المراقبة", "Enable monitoring")}</span><input className="switch" type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} disabled={pending} /></label>
    <div className="field"><label className="field-label" htmlFor="settings-scan-interval">{text("تكرار الفحص", "Scan interval")}</label><select id="settings-scan-interval" value={schedule} onChange={(event) => setSchedule(Number(event.target.value))} disabled={pending}>{intervals.map((value) => <option key={value} value={value}>{value === 0 ? text("يدوي فقط", "Manual only") : value === 1440 ? text("يوميًا", "Daily") : text(`كل ${value} دقيقة`, `Every ${value} minutes`)}</option>)}</select></div>
    {error && <p className="form-error" role="alert">{text("تعذر حفظ التغييرات.", "Unable to save changes.")}</p>}
  </div><div className="form-actions"><button className="button" disabled={pending || isStandalone} type="submit">{pending ? text("جارٍ الحفظ…", "Saving…") : text("حفظ التغييرات", "Save changes")}</button></div></form>;
}

export default function PlatformSettingsPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const { text } = useLanguage();
  const { data, error, loading, reload } = useResource<{ site: Settings }>(`/api/sites/${siteId}`);
  return <div className="form-page"><BackLink href={`/dashboard/${siteId}`}>{text("العودة إلى المنصة", "Back to platform")}</BackLink><div className="page-heading"><h1>{text("إعدادات المنصة", "Platform settings")}</h1></div>{error ? <ErrorState retry={reload} /> : loading || !data ? <LoadingState /> : <SettingsForm key={siteId} site={data.site} />}</div>;
}
