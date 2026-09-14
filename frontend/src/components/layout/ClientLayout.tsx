"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun } from "lucide-react";
import { ErrorBoundary } from "./ErrorBoundary";
import { LanguageProvider, useLanguage } from "@/components/rasd/LanguageProvider";
import { TopBar } from "./TopBar";
import { StandaloneNotice } from "./StandaloneNotice";

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { text } = useLanguage();
  if (pathname === "/brief") return <><StandaloneNotice /><main id="main-content">{children}</main></>;
  return <>
    <a className="skip-link" href="#main-content">{text("انتقل إلى المحتوى", "Skip to content")}</a>
    <TopBar />
    <StandaloneNotice />
    <main id="main-content" className={`app-main ${pathname.startsWith("/live/") ? "app-main-wide" : ""}`}>{children}</main>
    {pathname === "/" && <Link className="daily-brief-button button" href="/brief"><Sun size={20} />{text("إحاطة اليوم", "Daily brief")}</Link>}
  </>;
}

export function ClientLayout({ children }: { children: ReactNode }) {
  return <LanguageProvider><ErrorBoundary><Shell>{children}</Shell></ErrorBoundary></LanguageProvider>;
}
