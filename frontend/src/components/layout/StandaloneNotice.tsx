"use client";

import Link from "next/link";
import { useLanguage } from "@/components/rasd/LanguageProvider";
import { isStandalone } from "@/lib/api-client";

export function StandaloneNotice() {
  const { text } = useLanguage();
  if (!isStandalone) return null;
  return <div className="standalone-notice"><span>{text("معاينة الواجهات — الخادم الخلفي غير متصل ولا تُنفّذ فحوصات.", "Screen preview — backend disconnected; no scans are executed.")}</span><Link href="/preview">{text("تصفح الشاشات", "Browse screens")}</Link></div>;
}
