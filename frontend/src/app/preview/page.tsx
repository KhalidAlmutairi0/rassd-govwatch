"use client";

import Link from "next/link";
import { useLanguage } from "@/components/rasd/LanguageProvider";
import { isStandalone } from "@/lib/api-client";

export default function ScreenPreviewPage() {
  const { text } = useLanguage();
  if (!isStandalone) return <Link className="button" href="/">{text("نظرة عامة", "Overview")}</Link>;
  const screens = [
    ["/", "نظرة عامة", "Overview"], ["/dashboard", "المنصات", "Platforms"],
    ["/scan/new", "فحص جديد", "New scan"], ["/sites/new", "إضافة منصة", "Add platform"],
    ["/dashboard/preview", "تفاصيل المنصة", "Platform details"], ["/sites/preview/settings", "إعدادات المنصة", "Platform settings"],
    ["/live/preview", "الفحص المباشر", "Live scan"], ["/report/preview", "تقرير الفحص", "Scan report"],
    ["/report/preview/pages", "الصفحات", "Pages"], ["/report/preview/pages/page-0", "تفاصيل الصفحة", "Page details"],
    ["/report/preview/issues/issue-0", "تفاصيل المشكلة", "Issue details"], ["/incidents", "التنبيهات", "Alerts"], ["/brief", "إحاطة اليوم", "Daily brief"],
  ];
  return <><div className="page-heading"><h1>{text("معاينة الشاشات", "Screen preview")}</h1><p>{text("واجهات مستقلة دون بيانات أو نتائج فعلية. اربط الخادم لتفعيل العمليات.", "Standalone interfaces without real data or results. Connect the backend to enable operations.")}</p></div><div className="page-grid">{screens.map(([href, ar, en]) => <Link key={href} href={href} className="surface page-card"><div className="page-card-content"><h2>{text(ar, en)}</h2><p dir="ltr">{href}</p></div></Link>)}</div></>;
}
