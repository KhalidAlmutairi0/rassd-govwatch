"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { useLanguage } from "@/components/rasd/LanguageProvider";

function ErrorScreen() {
  const { text } = useLanguage();
  return <div className="app-main"><section className="surface empty-state" role="alert">
    <h1>{text("تعذر عرض الصفحة", "Unable to display this page")}</h1>
    <p>{text("حدث خطأ غير متوقع. حاول إعادة تحميل الصفحة.", "An unexpected error occurred. Try reloading the page.")}</p>
    <button className="button" onClick={() => window.location.reload()}>{text("إعادة التحميل", "Reload page")}</button>
  </section></div>;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("Screen error", error, info); }
  render() { return this.state.failed ? <ErrorScreen /> : this.props.children; }
}
