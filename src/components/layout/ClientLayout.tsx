"use client";

import { ReactNode } from "react";
import { ErrorBoundary } from "@/components/ui/error-boundary";

interface ClientLayoutProps {
  children: ReactNode;
}

export function ClientLayout({ children }: ClientLayoutProps) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}
