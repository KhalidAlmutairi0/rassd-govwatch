"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home,
  Globe,
  Plus,
  TrendingUp,
  BarChart2,
  Settings,
} from "lucide-react";

const sections = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Home", icon: Home },
    ],
  },
  {
    label: "Sites",
    items: [
      { href: "/dashboard", label: "All Sites", icon: Globe },
      { href: "/sites/new", label: "Add Site", icon: Plus },
    ],
  },
  {
    label: "Analytics",
    items: [
      { href: "/trends", label: "Trends", icon: TrendingUp },
      { href: "/compare", label: "Compare", icon: BarChart2 },
    ],
  },
];

function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/live");
  if (href === "/dashboard") return pathname === "/dashboard" || pathname.startsWith("/report") || pathname.startsWith("/sites");
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col w-[200px] min-h-screen bg-[hsl(var(--sidebar))] border-r border-[hsl(var(--sidebar-border))] shrink-0">
      {/* Logo */}
      <div className="flex items-center px-6 py-5 border-b border-[hsl(var(--sidebar-border))]">
        <img src="/union.png" alt="Rasd" className="w-14 h-14 object-contain" />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-4 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.href, pathname);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors",
                        active
                          ? "bg-emerald-900/50 text-emerald-400 font-medium"
                          : "text-[hsl(var(--muted-foreground))] hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <item.icon
                        className={cn("w-4 h-4 shrink-0", active ? "text-emerald-400" : "")}
                      />
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
      <div className="px-2 py-3 border-t border-[hsl(var(--sidebar-border))]">
        <Link
          href="/settings"
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-[hsl(var(--muted-foreground))] hover:bg-white/5 hover:text-white transition-colors"
        >
          <Settings className="w-4 h-4 shrink-0" />
          Settings
        </Link>
      </div>
    </aside>
  );
}
