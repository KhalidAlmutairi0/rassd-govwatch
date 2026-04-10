"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Clock, Send, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface AttentionItem {
  id: string;
  siteId: string;
  siteName: string;
  siteNameAr: string | null;
  severity: "critical" | "warning" | "info";
  description: string;
  action: "issue_directive" | "follow_up" | "escalate";
  actionLabel: string;
  incidentId?: string;
  directiveId?: string;
  createdAt?: string;
}

const SEVERITY_CONFIG = {
  critical: {
    badge: "bg-red-500 text-white",
    label: "حرج",
    border: "border-red-200",
  },
  warning: {
    badge: "bg-orange-100 text-orange-700",
    label: "تحذير",
    border: "border-orange-200",
  },
  info: {
    badge: "bg-blue-100 text-blue-700",
    label: "معلومة",
    border: "border-blue-200",
  },
};

function relativeDate(dateStr?: string) {
  if (!dateStr) return "";
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ar });
  } catch {
    return "";
  }
}

interface DirectiveModalProps {
  item: AttentionItem;
  onClose: () => void;
  onSubmit: (title: string, body: string) => Promise<void>;
}

function DirectiveModal({ item, onClose, onSubmit }: DirectiveModalProps) {
  const [title, setTitle] = useState(item.description);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await onSubmit(title, body);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-white">إصدار توجيه</h3>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">{item.siteNameAr || item.siteName}</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-white mb-1">عنوان التوجيه</label>
            <input
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-1">التفاصيل</label>
            <textarea
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30 resize-none"
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-[#1B4332] text-white rounded-full py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {loading ? "جارٍ الإرسال..." : "إصدار"}
            </button>
            <button type="button" onClick={onClose} className="flex-1 border border-white/20 rounded-full py-2.5 text-sm text-[hsl(var(--muted-foreground))]">
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function GovAlertsPage() {
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState<AttentionItem | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/gov/needs-attention")
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleDirective = async (title: string, body: string) => {
    if (!activeModal) return;
    await fetch("/api/gov/directives", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: activeModal.siteId, title, body }),
    });
    setActiveModal(null);
    showSuccess("تم إصدار التوجيه بنجاح");
  };

  const handleFollowUp = async (item: AttentionItem) => {
    if (item.directiveId) {
      await fetch(`/api/gov/directives/${item.directiveId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "open" }),
      });
    }
    showSuccess("تم تحديث حالة المتابعة");
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 animate-pulse space-y-4" dir="rtl">
        <div className="h-7 bg-white/5 rounded w-48" />
        <div className="h-4 bg-white/5 rounded w-32" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-36 bg-white/5 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">يحتاج اهتمامك</h1>
        {items.length > 0 && (
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
            {items.length} إجراءات مطلوبة
          </p>
        )}
      </div>

      {/* Success toast */}
      {successMsg && (
        <div className="bg-[#1B4332] text-white text-sm px-4 py-3 rounded-xl">
          {successMsg}
        </div>
      )}

      {/* Alert cards */}
      {items.length === 0 ? (
        <div className="text-center py-20 text-[hsl(var(--muted-foreground))]">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">لا توجد تنبيهات تحتاج اهتمامك الآن</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const cfg = SEVERITY_CONFIG[item.severity];
            return (
              <div
                key={item.id}
                className={`bg-[hsl(var(--card))] rounded-2xl border ${cfg.border} p-5 space-y-4`}
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-bold text-white">
                        {item.siteNameAr || item.siteName}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cfg.badge}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[hsl(var(--muted-foreground))] flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {item.createdAt ? relativeDate(item.createdAt) : "منذ قليل"}
                  </span>

                  <div className="flex gap-2">
                    {item.action === "issue_directive" && (
                      <button
                        onClick={() => setActiveModal(item)}
                        className="flex items-center gap-1.5 bg-[#1B4332] text-white text-xs font-semibold px-4 py-2 rounded-full hover:bg-[#1B4332]/90 transition-colors"
                      >
                        <Send className="w-3.5 h-3.5" />
                        إصدار توجيه
                      </button>
                    )}
                    {item.action === "follow_up" && (
                      <button
                        onClick={() => handleFollowUp(item)}
                        className="flex items-center gap-1.5 bg-orange-500 text-white text-xs font-semibold px-4 py-2 rounded-full hover:bg-orange-600 transition-colors"
                      >
                        متابعة
                      </button>
                    )}
                    {item.action === "escalate" && (
                      <Link
                        href={`/gov/platform/${item.siteId}`}
                        className="flex items-center gap-1.5 border border-white/20 text-white text-xs font-semibold px-4 py-2 rounded-full hover:bg-white/5 transition-colors"
                      >
                        عرض التفاصيل
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Directive modal */}
      {activeModal && (
        <DirectiveModal
          item={activeModal}
          onClose={() => setActiveModal(null)}
          onSubmit={handleDirective}
        />
      )}
    </div>
  );
}
