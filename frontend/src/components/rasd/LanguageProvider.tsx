"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Language = "ar" | "en";
const LanguageContext = createContext<{ language: Language; setLanguage: (value: Language) => void }>({ language: "ar", setLanguage: () => {} });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, updateLanguage] = useState<Language>("ar");
  useEffect(() => {
    try { if (localStorage.getItem("rasd-language") === "en") updateLanguage("en"); } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);
  const setLanguage = (value: Language) => {
    updateLanguage(value);
    try { localStorage.setItem("rasd-language", value); } catch {}
  };
  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  const locale = context.language === "ar" ? "ar-SA" : "en-GB";
  return {
    ...context,
    text: (ar: string, en: string) => context.language === "ar" ? ar : en,
    number: (value: number) => new Intl.NumberFormat(locale).format(value),
    date: (value?: string | null) => value ? new Intl.DateTimeFormat(locale, { calendar: "gregory", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—",
    name: (value: { name: string; nameAr?: string | null }) => context.language === "ar" ? value.nameAr || value.name : value.name,
  };
}
