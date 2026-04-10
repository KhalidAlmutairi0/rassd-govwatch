"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Sun } from "lucide-react";

interface BriefData {
  date: string;
  greeting: string;
  userName: string;
  portfolioScore: number;
  portfolioGrade: string;
  weeklyChange: number | null;
  improved: number;
  declined: number;
  stable: number;
  whatsNew: Array<{ id: string; title: string; siteNameAr: string; type: string; createdAt: string }>;
  needsAttention: Array<{ id: string; siteNameAr: string; description: string; severity: string }>;
  whatToDo: Array<{ id: string; title: string; dueDate: string | null; isOverdue: boolean; site: { nameAr: string | null; name: string } }>;
}

const SLIDE_TITLES = [
  "مساء الخير",
  "صحة المحفظة",
  "ما الجديد؟",
  "يحتاج اهتمامك",
  "يومك",
];

function SlideIntro({ data }: { data: BriefData }) {
  const hijriDate = data.date;
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-6 py-12">
      <div className="w-16 h-16 rounded-full bg-[#1B4332]/10 flex items-center justify-center">
        <Sun className="w-8 h-8 text-[#1B4332]" />
      </div>
      <div className="space-y-2">
        <h2 className="text-3xl font-black text-white">{data.greeting}</h2>
        <p className="text-xl font-semibold text-white">{data.userName}</p>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2">{hijriDate}</p>
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-sm text-amber-800 max-w-xs">
        لديك {(data.needsAttention ?? []).length} تحديثات تحتاج اهتمامك اليوم
      </div>
    </div>
  );
}

function SlidePortfolio({ data }: { data: BriefData }) {
  const color =
    data.portfolioGrade === "A" || data.portfolioGrade === "B"
      ? "text-[#1B4332]"
      : data.portfolioGrade === "C"
      ? "text-amber-600"
      : "text-red-600";
  const bg =
    data.portfolioGrade === "A" || data.portfolioGrade === "B"
      ? "bg-[#1B4332]"
      : data.portfolioGrade === "C"
      ? "bg-amber-500"
      : "bg-red-500";

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 py-8">
      <h2 className="text-lg font-bold text-white">صحة المحفظة الرقمية</h2>
      {/* Big score */}
      <div className="flex items-center gap-4">
        <span className={`text-7xl font-black ${color}`}>{data.portfolioScore}</span>
        <span className={`text-2xl font-bold px-3 py-1 rounded-lg text-white ${bg}`}>
          {data.portfolioGrade}
        </span>
      </div>
      {/* Weekly change */}
      {data.weeklyChange !== null && (
        <div
          className={`flex items-center gap-2 text-sm font-semibold ${
            data.weeklyChange > 0 ? "text-[#1B4332]" : "text-red-600"
          }`}
        >
          {data.weeklyChange > 0 ? (
            <TrendingUp className="w-4 h-4" />
          ) : (
            <TrendingDown className="w-4 h-4" />
          )}
          {data.weeklyChange > 0 ? "+" : ""}
          {data.weeklyChange} نقطة مقارنة بالأسبوع الماضي
        </div>
      )}
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-6 w-full max-w-xs">
        <StatBox value={data.improved} label="تحسّن" color="text-[#1B4332]" />
        <StatBox value={data.stable} label="مستقر" color="text-[hsl(var(--muted-foreground))]" />
        <StatBox value={data.declined} label="تراجع" color="text-red-600" />
      </div>
    </div>
  );
}

function StatBox({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div className="text-center">
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{label}</p>
    </div>
  );
}

function SlideWhatsNew({ data }: { data: BriefData }) {
  return (
    <div className="h-full py-6 space-y-5">
      <h2 className="text-lg font-bold text-white text-center">ما الجديد؟</h2>
      {(data.whatsNew ?? []).length === 0 ? (
        <div className="flex items-center justify-center h-32 text-[hsl(var(--muted-foreground))] text-sm">
          لا توجد تحديثات جديدة
        </div>
      ) : (
        <ul className="space-y-3">
          {(data.whatsNew ?? []).slice(0, 5).map((item) => (
            <li
              key={item.id}
              className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] px-4 py-3 flex items-start gap-3"
            >
              <span className="text-base mt-0.5">
                {item.type === "recovery" ? "✅" : item.type === "incident" ? "⚠️" : "📋"}
              </span>
              <div>
                <p className="text-sm font-semibold text-white">{item.title}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{item.siteNameAr}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SlideNeedsAttention({ data }: { data: BriefData }) {
  return (
    <div className="h-full py-6 space-y-5">
      <h2 className="text-lg font-bold text-white text-center">يحتاج اهتمامك</h2>
      {(data.needsAttention ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-[#1B4332] gap-2">
          <CheckCircle2 className="w-8 h-8" />
          <p className="text-sm">كل شيء على ما يرام!</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {(data.needsAttention ?? []).slice(0, 4).map((item) => (
            <li
              key={item.id}
              className={`rounded-xl border px-4 py-3 ${
                item.severity === "critical"
                  ? "bg-red-50 border-red-200"
                  : "bg-amber-50 border-amber-200"
              }`}
            >
              <div className="flex items-start gap-3">
                <AlertTriangle
                  className={`w-4 h-4 mt-0.5 shrink-0 ${
                    item.severity === "critical" ? "text-red-500" : "text-amber-500"
                  }`}
                />
                <div>
                  <p className="text-sm font-semibold text-white">
                    {item.siteNameAr}
                  </p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5 line-clamp-2">
                    {item.description}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SlideWhatToDo({ data }: { data: BriefData }) {
  return (
    <div className="h-full py-6 space-y-5">
      <h2 className="text-lg font-bold text-white text-center">يومك</h2>
      {(data.whatToDo ?? []).length === 0 ? (
        <div className="flex items-center justify-center h-32 text-[hsl(var(--muted-foreground))] text-sm">
          لا توجد مهام معلقة
        </div>
      ) : (
        <ul className="space-y-3">
          {(data.whatToDo ?? []).slice(0, 5).map((item) => (
            <li
              key={item.id}
              className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] px-4 py-3 flex items-center justify-between gap-3"
            >
              <div>
                <p className="text-sm font-semibold text-white">{item.title}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  {item.site.nameAr || item.site.name}
                </p>
              </div>
              {item.isOverdue ? (
                <span className="text-xs bg-red-100 text-red-700 px-2.5 py-1 rounded-full font-semibold shrink-0">
                  متأخر
                </span>
              ) : item.dueDate ? (
                <span className="text-xs bg-white/5 text-[hsl(var(--muted-foreground))] px-2.5 py-1 rounded-full shrink-0">
                  قريباً
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <a
        href="/gov/directives"
        className="block text-center text-sm text-[#1B4332] font-semibold hover:underline"
      >
        عرض جميع التوجيهات ←
      </a>
    </div>
  );
}

export default function GovBriefPage() {
  const [slide, setSlide] = useState(0);
  const [data, setData] = useState<BriefData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/gov/daily-brief")
      .then((r) => r.json())
      .then((d) => {
        if (d && !d.error) {
          // Ensure all array fields default to empty arrays
          setData({
            ...d,
            whatsNew: d.whatsNew ?? [],
            needsAttention: d.needsAttention ?? [],
            whatToDo: d.whatToDo ?? [],
            portfolioScore: d.portfolioScore ?? 0,
            portfolioGrade: d.portfolioGrade ?? "F",
            weeklyChange: d.weeklyChange ?? null,
            improved: d.improved ?? 0,
            declined: d.declined ?? 0,
            stable: d.stable ?? 0,
            date: d.date ?? "",
            greeting: d.greeting ?? "مرحباً",
            userName: d.userName ?? "",
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 animate-pulse" dir="rtl">
        <div className="h-6 bg-white/5 rounded w-32 mx-auto mb-6" />
        <div className="h-64 bg-white/5 rounded-2xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center text-[hsl(var(--muted-foreground))]" dir="rtl">
        <p>تعذّر تحميل الإحاطة اليومية</p>
      </div>
    );
  }

  const slides = [
    <SlideIntro key="intro" data={data} />,
    <SlidePortfolio key="portfolio" data={data} />,
    <SlideWhatsNew key="new" data={data} />,
    <SlideNeedsAttention key="attention" data={data} />,
    <SlideWhatToDo key="todo" data={data} />,
  ];

  const total = slides.length;
  const prev = () => setSlide((s) => Math.max(0, s - 1));
  const next = () => setSlide((s) => Math.min(total - 1, s + 1));

  return (
    <div className="max-w-lg mx-auto px-4 py-8" dir="rtl">
      <div className="bg-[hsl(var(--card))] rounded-3xl border border-[hsl(var(--border))] shadow-sm overflow-hidden">
        {/* Slide content */}
        <div className="px-6 min-h-[400px] flex flex-col justify-between">
          <div className="flex-1">{slides[slide]}</div>

          {/* Navigation */}
          <div className="pb-6 space-y-4">
            {/* Dots */}
            <div className="flex items-center justify-center gap-2">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setSlide(i)}
                  className={`rounded-full transition-all ${
                    i === slide
                      ? "w-6 h-2.5 bg-[#1B4332]"
                      : "w-2.5 h-2.5 bg-gray-300 hover:bg-gray-400"
                  }`}
                />
              ))}
            </div>

            {/* Arrows */}
            <div className="flex items-center justify-between">
              <button
                onClick={next}
                disabled={slide === total - 1}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-[#1B4332] text-white text-sm font-semibold rounded-full disabled:opacity-30 hover:bg-[#1B4332]/90 transition-colors"
              >
                التالي
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={prev}
                disabled={slide === 0}
                className="p-2.5 border border-gray-300 rounded-full disabled:opacity-30 hover:bg-gray-50 transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Slide title */}
      <p className="text-center text-xs text-[hsl(var(--muted-foreground))] mt-3">
        {slide + 1} / {total} — {SLIDE_TITLES[slide]}
      </p>
    </div>
  );
}
