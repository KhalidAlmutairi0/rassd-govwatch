"use client";

import { useLanguage } from "@/components/rasd/LanguageProvider";
import { BackLink } from "@/components/rasd/ui";
import { ScanForm } from "@/components/rasd/ScanForm";

export default function AddPlatformPage() {
  const { text } = useLanguage();
  return <div className="form-page"><BackLink href="/dashboard">{text("المنصات", "Platforms")}</BackLink><div className="page-heading"><h1>{text("إضافة منصة جديدة", "Add New Site")}</h1><p>{text("أدخل بيانات المنصة لبدء الفحص والمتابعة.", "Enter the platform details to start scanning and monitoring.")}</p></div><ScanForm saveSite /></div>;
}
