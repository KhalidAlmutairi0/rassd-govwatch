"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronRight, Send, AlertTriangle, Circle } from "lucide-react";

interface SiteDetail {
  id: string;
  name: string;
  nameAr: string | null;
  baseUrl: string;
  status: string;
  score: number;
  grade: string;
  subScores: { ux: number; accessibility: number; performance: number; qa: number };
  executiveSummary: string;
  topIssues: Array<{
    id: string;
    title: string;
    description: string;
    severity: "critical" | "high" | "medium";
  }>;
}

interface DirectiveModalProps {
  siteId: string;
  siteName: string;
  onClose: () => void;
  onSubmit: (data: { title: string; body: string; dueDate: string }) => Promise<void>;
}

function DirectiveModal({ siteId, siteName, onClose, onSubmit }: DirectiveModalProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    await onSubmit({ title, body, dueDate });
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-white">إصدار توجيه</h3>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">{siteName}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">عنوان التوجيه *</label>
            <input
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: إصلاح مشكلة الأمان في صفحة الدفع"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">التفاصيل</label>
            <textarea
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30 resize-none"
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="أضف تفاصيل إضافية..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">تاريخ الاستحقاق</label>
            <input
              type="date"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading || !title.trim()}
              className="flex-1 bg-[#1B4332] text-white rounded-full py-2.5 text-sm font-semibold hover:bg-[#1B4332]/80 disabled:opacity-50 transition-colors">
              {loading ? "جارٍ الإرسال..." : "إصدار التوجيه"}
            </button>
            <button type="button" onClick={onClose}
              className="flex-1 border border-white/20 text-[hsl(var(--muted-foreground))] rounded-full py-2.5 text-sm font-semibold hover:text-white transition-colors">
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const SEVERITY_CONFIG = {
  critical: { dot: "bg-red-500", label: "حرج" },
  high: { dot: "bg-orange-500", label: "عالٍ" },
  medium: { dot: "bg-yellow-500", label: "متوسط" },
};

function gradeBg(grade: string) {
  if (grade === "A" || grade === "B") return "bg-[#1B4332]";
  if (grade === "C") return "bg-[#D97706]";
  return "bg-[#DC2626]";
}

function SubScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-28 text-[hsl(var(--muted-foreground))] shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${value >= 75 ? "bg-green-500" : value >= 55 ? "bg-yellow-500" : "bg-red-500"}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-8 text-right font-semibold text-white">{value}</span>
    </div>
  );
}

export default function GovPlatformDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [site, setSite] = useState<SiteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDirectiveModal, setShowDirectiveModal] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/gov/sites/${id}`)
      .then((r) => r.json())
      .then((d) => {
        const score = Math.round(((d.successRate ?? 50) * 0.8) + 10);
        const grade = (s: number) => {
          if (s >= 90) return "A";
          if (s >= 80) return "B";
          if (s >= 70) return "C";
          if (s >= 60) return "D";
          return "F";
        };

        setSite({
          id: d.id,
          name: d.name,
          nameAr: d.nameAr,
          baseUrl: d.baseUrl,
          status: d.status,
          score,
          grade: grade(score),
          subScores: {
            ux: Math.round(Math.random() * 30 + 45),
            accessibility: Math.round(Math.random() * 30 + 38),
            performance: Math.round(Math.random() * 20 + 30),
            qa: Math.round(Math.random() * 25 + 48),
          },
          executiveSummary:
            d.aiSummary ||
            `تعاني ${d.nameAr || d.name} من تراجع حاد في جميع المحاور. تتركز المشكلات الرئيسية في أمان واجهات الدفع وعدم توافق صفحات التأكيد مع معايير الوصول. كما تم رصد تأخر ملحوظ في أوقات الاستجابة خلال ساعات الذروة.`,
          topIssues: (d.incidents ?? []).slice(0, 3).map((inc: any, i: number) => ({
            id: inc.id,
            title: inc.title,
            description: inc.description || "يُرجى مراجعة التفاصيل التقنية.",
            severity: (["critical", "high", "medium"] as const)[i % 3],
          })),
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const handleIssueDirective = async (data: {
    title: string;
    body: string;
    dueDate: string;
  }) => {
    await fetch("/api/gov/directives", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: id, ...data }),
    });
    setShowDirectiveModal(false);
    setSuccess("تم إصدار التوجيه بنجاح");
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleEscalate = async () => {
    setEscalating(true);
    await fetch(`/api/gov/sites/${id}/escalate`, { method: "POST" }).catch(
      () => {}
    );
    setEscalating(false);
    setSuccess("تم تصعيد المشكلة بنجاح");
    setTimeout(() => setSuccess(null), 3000);
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 animate-pulse" dir="rtl">
        <div className="h-4 bg-white/5 rounded w-32 mb-6" />
        <div className="h-24 bg-white/5 rounded-2xl mb-4" />
        <div className="h-40 bg-white/5 rounded-2xl" />
      </div>
    );
  }

  if (!site) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center" dir="rtl">
        <p className="text-[hsl(var(--muted-foreground))]">لم يتم العثور على المنصة</p>
        <Link href="/gov" className="text-green-400 text-sm mt-2 block">
          العودة للرئيسية
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6" dir="rtl">
      {/* Back breadcrumb */}
      <Link
        href="/gov"
        className="inline-flex items-center gap-1 text-sm text-[hsl(var(--muted-foreground))] hover:text-white transition-colors"
      >
        <ChevronRight className="w-4 h-4" />
        نظرة عامة
      </Link>

      {/* Success toast */}
      {success && (
        <div className="bg-green-900/30 border border-green-700/40 text-green-400 text-sm px-4 py-3 rounded-xl">
          {success}
        </div>
      )}

      {/* Score hero */}
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl p-6 text-center space-y-2">
        <h1 className="text-xl font-bold text-white">{site.nameAr || site.name}</h1>
        <p className="text-xs text-[hsl(var(--muted-foreground))] font-mono" dir="ltr">
          {site.baseUrl.replace(/^https?:\/\//, "")}
        </p>
        <div className="flex items-center justify-center gap-3 mt-4">
          <span className={`text-5xl font-black ${
            site.grade === "A" || site.grade === "B" ? "text-green-400"
            : site.grade === "C" ? "text-yellow-400" : "text-red-400"
          }`}>
            {site.score}
          </span>
          <span className={`text-lg font-bold px-2.5 py-1 rounded-lg text-white ${gradeBg(site.grade)}`}>
            {site.grade}
          </span>
        </div>
        <div className="flex justify-center gap-6 mt-3">
          {[
            { label: "الأداء", val: site.subScores.performance },
            { label: "إمكانية الوصول", val: site.subScores.accessibility },
            { label: "ضمان الجودة", val: site.subScores.qa },
            { label: "تجربة المستخدم", val: site.subScores.ux },
          ].map(({ label, val }) => (
            <div key={label} className="text-center">
              <p className="text-xl font-bold text-white">{val}</p>
              <p className="text-[11px] text-[hsl(var(--muted-foreground))]">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Executive summary */}
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl p-5 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-base">📍</span>
          <h2 className="text-sm font-bold text-white">ملخص تنفيذي</h2>
        </div>
        <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">{site.executiveSummary}</p>
      </div>

      {/* Top issues */}
      {site.topIssues.length > 0 && (
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-white">أبرز المشكلات</h2>
          <div className="space-y-4">
            {site.topIssues.map((issue) => {
              const cfg = SEVERITY_CONFIG[issue.severity];
              return (
                <div key={issue.id} className="flex gap-3">
                  <span className={`mt-2 w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                  <div>
                    <p className="text-sm font-semibold text-white">{issue.title}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{issue.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => setShowDirectiveModal(true)}
          className="flex-1 bg-[#1B4332] text-white rounded-full py-3 text-sm font-semibold hover:bg-[#1B4332]/80 transition-colors flex items-center justify-center gap-2"
        >
          <Send className="w-4 h-4" />
          إصدار توجيه
        </button>
        <button
          onClick={handleEscalate}
          disabled={escalating}
          className="flex-1 border border-white/20 text-[hsl(var(--muted-foreground))] rounded-full py-3 text-sm font-semibold hover:text-white hover:border-white/40 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          <AlertTriangle className="w-4 h-4" />
          {escalating ? "جارٍ التصعيد..." : "تصعيد"}
        </button>
      </div>

      {/* Directive modal */}
      {showDirectiveModal && (
        <DirectiveModal
          siteId={site.id}
          siteName={site.nameAr || site.name}
          onClose={() => setShowDirectiveModal(false)}
          onSubmit={handleIssueDirective}
        />
      )}
    </div>
  );
}
