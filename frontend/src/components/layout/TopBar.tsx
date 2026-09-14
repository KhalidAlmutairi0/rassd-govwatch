"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Languages } from "lucide-react";
import { useLanguage } from "@/components/rasd/LanguageProvider";

export function TopBar() {
  const pathname = usePathname();
  const { language, setLanguage, text } = useLanguage();
  const [menu, setMenu] = useState(false);
  const links = [
    { href: "/", label: text("نظرة عامة", "Overview"), active: pathname === "/" },
    { href: "/dashboard", label: text("المنصات", "Platforms"), active: /^\/(dashboard|report|sites)/.test(pathname) },
    { href: "/scan/new", label: text("فحص جديد", "New scan"), active: /^\/(scan|live)/.test(pathname) },
    { href: "/incidents", label: text("تنبيهات", "Alerts"), active: pathname === "/incidents" },
    { href: "/brief", label: text("إحاطة اليوم", "Daily brief"), active: pathname === "/brief" },
  ];
  return <header className="rasd-header">
    <Link href="/" className="brand" aria-label="Rasd"><span className="brand-mark" /></Link>
    <nav aria-label={text("التنقل الرئيسي", "Main navigation")} className="top-navigation">
      {links.map((link) => <Link key={link.href} href={link.href} aria-current={link.active ? "page" : undefined}>{link.label}</Link>)}
    </nav>
    <div className="profile-menu">
      <button className="profile-trigger" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label={text("اللغة والحساب", "Language and account")}>
        <span>{text("فريق التشغيل", "Operations team")}</span><span className="avatar">{text("ت", "O")}</span><ChevronDown size={12} />
      </button>
      {menu && <div className="language-menu surface"><Languages size={16} />
        <button aria-pressed={language === "ar"} onClick={() => { setLanguage("ar"); setMenu(false); }}>العربية</button>
        <button aria-pressed={language === "en"} onClick={() => { setLanguage("en"); setMenu(false); }}>English</button>
      </div>}
    </div>
  </header>;
}
