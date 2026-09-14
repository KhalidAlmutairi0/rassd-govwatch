"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { apiFetch, isStandalone } from "@/lib/api-client";

export function RunButton({ siteId, journeyId, outline = false }: { siteId: string; journeyId?: string; outline?: boolean }) {
  const router = useRouter();
  const { text } = useLanguage();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const start = async () => {
    if (pending || isStandalone) return;
    setPending(true);
    setError(false);
    try {
      const response = await apiFetch(`/api/sites/${siteId}/runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ journeyId }) });
      const data = await response.json();
      if (!response.ok || !data.run?.id) throw new Error("Unable to start scan");
      router.push(`/live/${data.run.id}`);
    } catch { setError(true); setPending(false); }
  };
  return <div className="run-action"><button className={`button ${outline ? "button-outline" : ""}`} disabled={pending || isStandalone} onClick={start}><RefreshCw size={15} className={pending ? "animate-spin" : ""} />{pending ? text("جارٍ البدء…", "Starting…") : text("فحص المنصة", "Scan platform")}</button>{error && <p className="action-error" role="alert">{text("تعذر بدء الفحص. حاول مرة أخرى.", "Unable to start the scan. Try again.")}</p>}</div>;
}
