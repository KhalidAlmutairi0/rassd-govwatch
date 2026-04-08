"use client";

import { ReactNode } from "react";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

interface ClientLayoutProps {
  children: ReactNode;
}

export function ClientLayout({ children }: ClientLayoutProps) {
  return (
    <ErrorBoundary>
      <div className="flex min-h-screen bg-[hsl(var(--background))]">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <TopBar />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
}
