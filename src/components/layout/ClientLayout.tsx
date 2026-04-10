"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { GovTopBar } from "./GovTopBar";
import { GovSidebar } from "./GovSidebar";

// Paths that use full-screen layout (no sidebar)
const BARE_PATHS = ["/login", "/forgot-password", "/reset-password"];

interface ClientLayoutProps {
  children: ReactNode;
}

export function ClientLayout({ children }: ClientLayoutProps) {
  const pathname = usePathname();
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUserRole(d.user?.role ?? null))
      .catch(() => setUserRole(null));
  }, [pathname]);

  const isBare = BARE_PATHS.some((p) => pathname.startsWith(p));
  const isGov = pathname.startsWith("/gov");
  const isDev = !isGov && !isBare;

  if (isBare) {
    return (
      <ErrorBoundary>
        <div className="min-h-screen bg-[#1A1732] flex items-center justify-center">
          {children}
        </div>
      </ErrorBoundary>
    );
  }

  if (isGov) {
    return (
      <ErrorBoundary>
        <div className="flex min-h-screen bg-[hsl(var(--background))]">
          <GovSidebar />
          <div className="flex flex-col flex-1 min-w-0">
            <GovTopBar />
            <main className="flex-1 overflow-auto">{children}</main>
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  // Developer / default dark layout
  return (
    <ErrorBoundary>
      <div className="flex min-h-screen bg-[hsl(var(--background))]">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <TopBar />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </ErrorBoundary>
  );
}
