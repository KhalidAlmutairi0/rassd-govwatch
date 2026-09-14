"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useLanguage } from "@/components/rasd/LanguageProvider";
import { ErrorState, LoadingState, Score, Status } from "@/components/rasd/ui";
import { useResource } from "@/lib/use-resource";
import type { OverviewData } from "@/lib/portfolio";

export default function DailyBriefPage() {
  const { language, text, name, number, date } = useLanguage();
  const router = useRouter();
  const [slide, setSlide] = useState(0);
  const [now, setNow] = useState<string | null>(null);
  const { data, error, loading, reload } = useResource<OverviewData>("/api/overview");
  useEffect(() => { setNow(new Date().toISOString()); }, []);
  useEffect(() => {
    const navigate = (event: KeyboardEvent) => {
      if (event.key === "Escape") { router.push("/"); return; }
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const forward = language === "ar" ? event.key === "ArrowLeft" : event.key === "ArrowRight";
      setSlide((value) => Math.max(0, Math.min(4, value + (forward ? 1 : -1))));
    };
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [language, router]);
  const NextIcon = language === "ar" ? ArrowLeft : ArrowRight;
  const PreviousIcon = language === "ar" ? ArrowRight : ArrowLeft;
  return <div className={`brief-shell ${slide === 0 ? "brief-shell--intro" : ""}`}>
    <div className="brief-top"><Link href="/">{text("تخطي", "Skip")}</Link></div>
    <div className="brief-content" aria-live="polite">
      {error ? <ErrorState retry={reload} /> : loading || !data ? <LoadingState /> : <>
        {slide === 0 && <div className="brief-intro"><h1>{text("إحاطة اليوم", "Your daily brief")}</h1><p>{text("فريق التشغيل", "Operations team")}</p><small>{date(now)}</small><p>{text(`لديك ${number(data.openIncidents)} تنبيهًا نشطًا يحتاج المتابعة.`, `You have ${data.openIncidents} active alerts to review.`)}</p></div>}
        {slide === 1 && <div className="brief-score"><Score value={data.health.score} large label={text("صحة المحفظة", "Portfolio health")} /><div className="brief-counts"><div><strong className="text-good">{number(data.health.healthy)}</strong><span>{text("سليمة", "Healthy")}</span></div><div><strong className="text-warning">{number(data.health.known - data.health.healthy)}</strong><span>{text("تحتاج متابعة", "Need attention")}</span></div><div><strong className="text-muted">{number(data.health.total - data.health.known)}</strong><span>{text("لم تُقيّم", "Not assessed")}</span></div></div><p className="metric-note">{text("النسبة من المنصات ذات الحالة المعروفة فقط.", "Based only on platforms with a known status.")}</p></div>}
        {slide === 2 && <><div className="page-heading page-heading-centered"><h1>{text("ما الجديد", "Latest activity")}</h1><p>{text("آخر نتائج الفحوصات المسجلة", "Latest recorded scan results")}</p></div>{data.recentRuns.length ? data.recentRuns.map((run) => <div className="brief-item" key={run.id}><p dir="auto">{name(run.site)}</p><footer><Status status={run.status} /><time>{date(run.startedAt)}</time><Link href={`/report/${run.id}`} className="text-link">{text("عرض", "View")}</Link></footer></div>) : <p className="metric-note">{text("لا توجد فحوصات مكتملة بعد.", "No scans have completed yet.")}</p>}</>}
        {slide === 3 && <><div className="page-heading page-heading-centered"><h1>{text("يحتاج اهتمامك", "Needs your attention")}</h1><p>{text("التنبيهات النشطة", "Active alerts")}</p></div>{data.incidents.length ? data.incidents.map((incident) => <div className="surface alert-card brief-alert" key={incident.id}><div className="section-heading"><h2 dir="auto">{name(incident.site)}</h2><Status status={incident.status} /></div><p dir="auto">{incident.description || incident.title}</p><footer><Link href={`/dashboard/${incident.siteId}`} className="button">{text("عرض التفاصيل", "View details")}</Link></footer></div>) : <p className="metric-note">{text("لا توجد تنبيهات نشطة حاليًا.", "There are no active alerts.")}</p>}</>}
        {slide === 4 && <div className="brief-intro"><h1>{text("يومك", "Your day")}</h1><small>{date(now)}</small><div className="brief-next-actions"><Link className="brief-item" href="/incidents">{text("مراجعة التنبيهات النشطة", "Review active alerts")}<Status status={data.openIncidents ? "open" : "resolved"} /></Link><Link className="brief-item" href="/scan/new">{text("بدء فحص جديد", "Start a new scan")}<NextIcon size={18} /></Link><Link className="brief-item" href="/dashboard">{text("متابعة المنصات", "Review platforms")}<NextIcon size={18} /></Link></div><Link className="button" href="/">{text("بدء العمل", "Start working")}</Link></div>}
      </>}
    </div>
    <div className="brief-bottom"><div>{slide > 0 && <button className="button button-quiet" onClick={() => setSlide((value) => value - 1)}><PreviousIcon size={15} />{text("السابق", "Previous")}</button>}</div><div className="brief-dots">{[0, 1, 2, 3, 4].map((value) => <button key={value} aria-label={text(`الصفحة ${value + 1}`, `Slide ${value + 1}`)} aria-current={slide === value ? "step" : undefined} onClick={() => setSlide(value)} />)}</div><div>{slide < 4 && <button className="button button-quiet" onClick={() => setSlide((value) => value + 1)}>{text("التالي", "Next")}<NextIcon size={15} /></button>}</div></div>
  </div>;
}
