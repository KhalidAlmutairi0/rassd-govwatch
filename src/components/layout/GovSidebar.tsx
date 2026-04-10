"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home, Globe, Plus, Settings, LogOut,
  TrendingUp, BarChart2, Activity,
} from "lucide-react";
import { useEffect, useState } from "react";

const NAV = [
  {
    label: "Overview",
    items: [
      { href: "/gov", label: "Home", icon: Home, exact: true },
    ],
  },
  {
    label: "Sites",
    items: [
      { href: "/gov/sites", label: "All Sites", icon: Globe, exact: true },
      { href: "/gov/sites/new", label: "Add Site", icon: Plus },
    ],
  },
  {
    label: "Analytics",
    items: [
      { href: "/gov/trends", label: "Trends", icon: TrendingUp },
      { href: "/gov/compare", label: "Compare", icon: BarChart2 },
    ],
  },
];

function isActive(href: string, pathname: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

function SystemHealthBar() {
  const [health, setHealth] = useState<"operational" | "degraded" | "critical">("operational");

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/gov/dashboard");
        const data = await res.json();
        const cards = data.ministryCards ?? [];
        const redCount = cards.filter((c: any) => c.rag === "red").length;
        const yellowCount = cards.filter((c: any) => c.rag === "yellow").length;
        if (redCount > 0) setHealth("critical");
        else if (yellowCount > 0) setHealth("degraded");
        else setHealth("operational");
      } catch {
        setHealth("degraded");
      }
    };
    check();
    const i = setInterval(check, 60_000);
    return () => clearInterval(i);
  }, []);

  const cfg = {
    operational: { dot: "bg-green-500", text: "text-green-400", label: "All Operational" },
    degraded:    { dot: "bg-yellow-500", text: "text-yellow-400", label: "Degraded" },
    critical:    { dot: "bg-red-500",    text: "text-red-400",    label: "Critical" },
  }[health];

  return (
    <div className="mx-3 mt-3 mb-1 px-3 py-2 bg-white/[0.03] rounded-lg border border-white/[0.06]">
      <div className="flex items-center gap-2">
        <Activity className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
        <span className="text-[10px] text-[hsl(var(--muted-foreground))] font-medium uppercase tracking-wider">
          System
        </span>
      </div>
      <div className="flex items-center gap-1.5 mt-1">
        <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
        <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
      </div>
    </div>
  );
}

export function GovSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <aside className="flex flex-col w-[200px] min-h-screen bg-[hsl(var(--sidebar))] border-r border-[hsl(var(--sidebar-border))] shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-[hsl(var(--sidebar-border))]">
        <img src="/union.png" alt="Rassd" className="w-8 h-8 object-contain" />
        <div>
          <p className="text-sm font-bold text-white leading-tight">Rassd</p>
          <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Supervisor</p>
        </div>
      </div>

      {/* System health */}
      <SystemHealthBar />

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-5 overflow-y-auto">
        {NAV.map((section) => (
          <div key={section.label}>
            <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.href, pathname, (item as any).exact);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors",
                        active
                          ? "bg-white/10 text-white font-medium"
                          : "text-[hsl(var(--muted-foreground))] hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <item.icon className={cn("w-4 h-4 shrink-0", active ? "text-white" : "")} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-2 py-3 border-t border-[hsl(var(--sidebar-border))] space-y-0.5">
        <Link
          href="/gov/settings"
          className={cn(
            "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors",
            pathname === "/gov/settings"
              ? "bg-white/10 text-white"
              : "text-[hsl(var(--muted-foreground))] hover:bg-white/5 hover:text-white"
          )}
        >
          <Settings className="w-4 h-4 shrink-0" />
          Settings
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-[hsl(var(--muted-foreground))] hover:bg-red-900/30 hover:text-red-400 transition-colors w-full text-left"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
