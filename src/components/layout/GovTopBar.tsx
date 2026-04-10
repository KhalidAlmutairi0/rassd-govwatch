"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PanelLeft, LogOut } from "lucide-react";

function getPageLabel(pathname: string): string {
  if (pathname === "/gov") return "Home";
  if (pathname === "/gov/settings") return "Settings";
  if (pathname === "/gov/sites") return "All Sites";
  if (pathname === "/gov/trends") return "Trends";
  if (pathname === "/gov/compare") return "Compare";
  if (pathname.startsWith("/gov/platform/")) return "Site Detail";
  if (pathname.startsWith("/gov/alerts")) return "Alerts";
  if (pathname.startsWith("/gov/directives")) return "Directives";
  return "Rassd";
}

export function GovTopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const title = getPageLabel(pathname);
  const [userName, setUserName] = useState<string>("");
  const [userInitials, setUserInitials] = useState<string>("م");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user?.name) {
          setUserName(d.user.name);
          const parts = d.user.name.split(" ");
          const initials = parts.slice(0, 2).map((p: string) => p[0]).join("");
          setUserInitials(initials.toUpperCase() || "م");
        } else if (d.user?.email) {
          setUserInitials(d.user.email[0].toUpperCase());
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <header className="flex items-center justify-between h-12 px-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--sidebar))] shrink-0">
      <div className="flex items-center gap-3">
        <button className="text-[hsl(var(--muted-foreground))] hover:text-white transition-colors">
          <PanelLeft className="w-4 h-4" />
        </button>
        <span className="text-sm text-[hsl(var(--muted-foreground))]">{title}</span>
      </div>

      <div className="flex items-center gap-2">
        {userName && (
          <span className="text-xs text-[hsl(var(--muted-foreground))] hidden sm:block">
            م. {userName}
          </span>
        )}
        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-[#1B4332] text-white text-xs font-semibold select-none">
          {userInitials}
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-[hsl(var(--muted-foreground))] hover:text-red-400 hover:bg-red-900/20 rounded-md transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          خروج
        </button>
      </div>
    </header>
  );
}
