"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PanelLeft, Bell, LogOut } from "lucide-react";

function getPageTitle(pathname: string): string {
  if (pathname === "/") return "Scan";
  if (pathname === "/dashboard") return "All Sites";
  if (pathname === "/sites/new") return "Sites / Add New";
  if (pathname.startsWith("/live/")) return "Scanning...";
  if (pathname.match(/\/report\/[^/]+\/pages\/[^/]+/)) return "Page Detail";
  if (pathname.match(/\/report\/[^/]+\/pages/)) return "Pages Discovered";
  if (pathname.match(/\/report\/[^/]+\/issues\/[^/]+/)) return "Issue Detail";
  if (pathname.startsWith("/report/")) return "Scan Results";
  if (pathname === "/trends") return "Trends";
  if (pathname === "/compare") return "Compare";
  if (pathname === "/settings") return "Settings";
  return "Rassd";
}

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const title = getPageTitle(pathname);
  const [userInitials, setUserInitials] = useState("D");
  const [unread, setUnread] = useState(0);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user?.name) {
          setUserInitials(
            d.user.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
          );
        } else if (d.user?.email) {
          setUserInitials(d.user.email[0].toUpperCase());
        }
      })
      .catch(() => {});

    fetch("/api/notifications?unreadOnly=true")
      .then((r) => r.json())
      .then((d) => setUnread(d.count ?? 0))
      .catch(() => {});
  }, []);

  return (
    <header className="flex items-center justify-between h-12 px-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--sidebar))] shrink-0">
      <div className="flex items-center gap-3">
        <button className="text-[hsl(var(--muted-foreground))] hover:text-white transition-colors">
          <PanelLeft className="w-4 h-4" />
        </button>
        <span className="text-sm text-[hsl(var(--muted-foreground))]">{title}</span>
      </div>

      <div className="flex items-center gap-2">
        {/* Notifications */}
        <div className="relative">
          <button className="p-1.5 text-[hsl(var(--muted-foreground))] hover:text-white transition-colors rounded-md hover:bg-white/5">
            <Bell className="w-4 h-4" />
          </button>
          {unread > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full" />
          )}
        </div>

        {/* Avatar */}
        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-700 text-white text-xs font-semibold select-none">
          {userInitials}
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-[hsl(var(--muted-foreground))] hover:text-red-400 hover:bg-red-900/20 rounded-md transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </header>
  );
}
