"use client";

import { useLanguage } from "@/components/rasd/LanguageProvider";
import { BackLink } from "@/components/rasd/ui";
import { ScanForm } from "@/components/rasd/ScanForm";

export default function NewScanPage() {
  const { text } = useLanguage();
  return <div className="form-page"><BackLink href="/">{text("نظرة عامة", "Overview")}</BackLink><div className="page-heading"><h1>{text("فحص جديد", "New scan")}</h1><p>{text("افحص تجربة الاستخدام والوظائف المتاحة على منصتك.", "Check the observed interactions and functionality of your website.")}</p></div><ScanForm /></div>;
}
