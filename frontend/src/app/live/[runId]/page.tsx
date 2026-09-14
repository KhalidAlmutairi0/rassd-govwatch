"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Clock, Monitor, Activity } from "lucide-react";
import { AnimatedCursor } from "@/components/live/AnimatedCursor";
import { useLanguage } from "@/components/rasd/LanguageProvider";
import { BackLink, Status } from "@/components/rasd/ui";
import { useLiveRun } from "@/lib/use-live-run";
import { isStandalone } from "@/lib/api-client";

export default function LiveViewPage() {
  const { runId } = useParams<{ runId: string }>();
  const { text, number } = useLanguage();
  const { canvasRef, frameRef, hasFrame, steps, runStatus, elapsed, currentUrl, cursorState, phaseIndex, isComplete, progressPercent } = useLiveRun(runId);
  const phases = [text("فتح المنصة", "Opening website"), text("تحليل الصفحة", "Page analysis"), text("الفحوصات", "Checks"), text("الملخص", "Summary")];
  return <>
    <BackLink href="/dashboard">{text("المنصات", "Platforms")}</BackLink>
    <div className="scan-header"><div><h1>{isStandalone ? text("معاينة شاشة الفحص", "Scan screen preview") : isComplete ? text("انتهى الفحص", "Scan finished") : runStatus === "queued" ? text("في انتظار بدء الفحص", "Waiting to scan") : text("جارٍ الفحص…", "Scanning…")}</h1><p><bdi dir="ltr">{currentUrl}</bdi></p></div><div className="scan-status"><strong>{number(progressPercent)}%</strong><Status status={runStatus} /></div></div>
    <div className="scan-progress" role="progressbar" aria-label={text("تقدم الفحص", "Scan progress")} aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${progressPercent}%` }} /></div>
    <div className="scan-phases">{phases.map((phase, index) => <span key={phase} className={phaseIndex === index ? "active" : ""}>{phase}</span>)}</div>
    <div className="scan-panels">
      <section className="surface"><h2 className="panel-heading"><Activity size={17} />{text("نشاط الفحص", "Agent Activity")}</h2><div className="scan-activity">{steps.length ? steps.map((step) => <div className="scan-step" key={step.index}><p dir="auto">{step.description || step.action}</p><Status status={step.status} />{step.error && <p className="step-error" dir="auto">{step.error}</p>}</div>) : <div className="empty-state"><p>{text("جارٍ تجهيز الفحص…", "Preparing the scan…")}</p></div>}</div></section>
      <section className="surface"><h2 className="panel-heading"><Monitor size={17} />{text("آخر لقطة شاشة", "Latest Screenshot")}</h2><div className="browser-preview" ref={frameRef}>
        {!hasFrame && <div className="browser-placeholder"><Monitor size={42} strokeWidth={1} /><span>{text("معاينة مباشرة للفحص", "Live screenshot preview")}</span></div>}
        <canvas ref={canvasRef} width={1280} height={720} style={{ display: hasFrame ? "block" : "none" }} />
        {hasFrame && cursorState.text && runStatus === "running" && <AnimatedCursor targetX={cursorState.x} targetY={cursorState.y} isClicking={cursorState.clicking} elementText={cursorState.text} elementType={cursorState.type} />}
      </div></section>
    </div>
    <div className="scan-footer"><span className="elapsed"><Clock size={15} />{text("الوقت المنقضي", "Elapsed time")}: <bdi dir="ltr">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</bdi></span>{isComplete && <Link className="button" href={`/report/${runId}`}>{text("عرض النتائج", "View results")}</Link>}</div>
  </>;
}
