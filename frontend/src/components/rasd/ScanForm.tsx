"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { apiFetch, isStandalone } from "@/lib/api-client";

export function ScanForm({ saveSite = false }: { saveSite?: boolean }) {
  const { text } = useLanguage();
  const router = useRouter();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [scheduled, setScheduled] = useState(false);
  const [interval, setInterval] = useState(10);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [createdSiteId, setCreatedSiteId] = useState<string | null>(null);
  const locked = pending || createdSiteId !== null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || isStandalone) return;
    const shouldRun = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") !== "save";
    setPending(true);
    setError(false);
    try {
      let siteId = createdSiteId || undefined;
      if (saveSite && !siteId) {
        const body = JSON.stringify({ name: name.trim() || new URL(url).hostname, baseUrl: url.trim(), schedule: scheduled ? interval : 0 });
        const response = await apiFetch("/api/sites", { method: "POST", headers: { "Content-Type": "application/json" }, body });
        const data = await response.json();
        if (!response.ok || !data.site?.id) throw new Error("Unable to add platform");
        siteId = data.site.id;
        setCreatedSiteId(data.site.id);
      }
      if (!shouldRun && siteId) { router.push(`/dashboard/${siteId}`); return; }
      const response = await apiFetch(siteId ? `/api/sites/${siteId}/runs` : "/api/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(siteId ? {} : { url: url.trim() }) });
      const data = await response.json();
      const runId = data.run?.id || data.runId;
      if (!response.ok || !runId) throw new Error("Unable to start scan");
      router.push(`/live/${runId}`);
    } catch { setError(true); setPending(false); }
  };

  return <form onSubmit={submit}>
    <div className="surface form-card">
      {saveSite && <label className="field"><span className="field-label">{text("اسم المنصة", "Platform name")}</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} placeholder={text("اسم المنصة", "My Awesome App")} disabled={locked} /></label>}
      <label className="field"><span className="field-label">{text("رابط المنصة", "Website URL")}</span><input type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" maxLength={2048} dir="ltr" disabled={locked} autoCapitalize="none" autoCorrect="off" /><small>{text("أدخل رابط الصفحة التي تريد فحصها.", "Enter the page you want to scan.")}</small></label>
      {saveSite && <>
        <label className="switch-row"><span>{text("تفعيل الفحص المجدول", "Enable scheduled scans")}<small>{text("فحص المنصة دوريًا حسب الفترة المحددة.", "Scan the platform at the selected interval.")}</small></span><input className="switch" type="checkbox" checked={scheduled} onChange={(event) => setScheduled(event.target.checked)} disabled={locked} /></label>
        {scheduled && <div className="field"><label htmlFor="new-scan-interval" className="field-label">{text("تكرار الفحص", "Scan interval")}</label><select id="new-scan-interval" value={interval} onChange={(event) => setInterval(Number(event.target.value))} disabled={locked}>{[10, 30, 60, 1440].map((value) => <option key={value} value={value}>{value === 1440 ? text("يوميًا", "Daily") : text(`كل ${value} دقيقة`, `Every ${value} minutes`)}</option>)}</select></div>}
      </>}
      {error && <p role="alert" className="form-error">{createdSiteId ? text("تم حفظ المنصة، لكن تعذر بدء الفحص. أعد المحاولة أو افتح المنصة لتعديل إعداداتها.", "The platform was saved, but its scan could not start. Retry or open the platform to edit its settings.") : text("تعذر إتمام الطلب. تحقق من الرابط وحاول مرة أخرى.", "Unable to complete the request. Check the URL and try again.")}</p>}
      {error && createdSiteId && <button className="text-link" type="button" onClick={() => router.push(`/dashboard/${createdSiteId}`)}>{text("فتح المنصة المحفوظة", "Open saved platform")}</button>}
    </div>
    <div className="form-actions">
      <button className="button" type="submit" value="run" disabled={pending || isStandalone}><Search size={16} />{pending ? text("جارٍ البدء…", "Starting…") : saveSite ? text("إضافة المنصة وبدء الفحص", "Add Site & Run First Scan") : text("بدء الفحص", "Start Scan")}</button>
      {saveSite && <button className="button button-outline" type="submit" value="save" disabled={pending || isStandalone}>{text("إضافة المنصة فقط", "Add platform only")}</button>}
    </div>
  </form>;
}
