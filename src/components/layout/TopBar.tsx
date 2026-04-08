"use client";

import { usePathname } from "next/navigation";
import { PanelLeft } from "lucide-react";

function getPageTitle(pathname: string): string {
  if (pathname === "/") return "Home";
  if (pathname === "/dashboard") return "All Sites";
  if (pathname === "/sites/new") return "Sites / Add New";
  if (pathname.startsWith("/live/")) return "Scan";
  if (pathname.match(/\/report\/[^/]+\/pages\/[^/]+/)) return "Page_home";
  if (pathname.match(/\/report\/[^/]+\/pages/)) return "Pages";
  if (pathname.match(/\/report\/[^/]+\/issues\/[^/]+/)) {
    const parts = pathname.split("/");
    return parts[parts.length - 1] || "Issue";
  }
  if (pathname.startsWith("/report/")) return "Scan / Results";
  if (pathname === "/trends") return "Trends";
  if (pathname === "/compare") return "Compare";
  if (pathname === "/settings") return "Settings";
  return "Rasd";
}

export function TopBar() {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <header className="flex items-center justify-between h-12 px-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--sidebar))] shrink-0">
      <div className="flex items-center gap-3">
        <button className="text-[hsl(var(--muted-foreground))] hover:text-white transition-colors">
          <PanelLeft className="w-4 h-4" />
        </button>
        <span className="text-sm text-[hsl(var(--muted-foreground))]">{title}</span>
      </div>

      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-700 text-white text-xs font-semibold select-none">
          J
        </div>
      </div>
    </header>
  );
}
