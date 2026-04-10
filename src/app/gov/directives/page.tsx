"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { CheckCircle2, Circle, Clock, AlertCircle } from "lucide-react";

interface Directive {
  id: string;
  title: string;
  body: string;
  status: string;
  dueDate: string | null;
  isOverdue: boolean;
  createdAt: string;
  site: { id: string; name: string; nameAr: string | null };
  issuedBy: { id: string; name: string };
}

type StatusGroup = "needs_follow_up" | "in_progress" | "completed";

const STATUS_CONFIG: Record<
  StatusGroup,
  {
    label: string;
    icon: React.ReactNode;
    bg: string;
    border: string;
    badgeBg: string;
    badgeText: string;
    badgeLabel: string;
  }
> = {
  needs_follow_up: {
    label: "تحتاج متابعة",
    icon: <AlertCircle className="w-4 h-4 text-red-500" />,
    bg: "bg-white",
    border: "border-[hsl(var(--border))]",
    badgeBg: "bg-red-600",
    badgeText: "text-white",
    badgeLabel: "متابعة",
  },
  in_progress: {
    label: "قيد التنفيذ",
    icon: <Clock className="w-4 h-4 text-blue-500" />,
    bg: "bg-white",
    border: "border-[hsl(var(--border))]",
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-700",
    badgeLabel: "قيد التنفيذ",
  },
  completed: {
    label: "تم الإنجاز",
    icon: <CheckCircle2 className="w-4 h-4 text-[#1B4332]" />,
    bg: "bg-white",
    border: "border-[hsl(var(--border))]",
    badgeBg: "bg-transparent",
    badgeText: "text-[#1B4332]",
    badgeLabel: "✓",
  },
};

function classifyDirective(d: Directive): StatusGroup {
  if (d.status === "resolved") return "completed";
  if (d.isOverdue) return "needs_follow_up";
  return "in_progress";
}

function relativeDate(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ar });
  } catch {
    return "";
  }
}

function DirectiveItem({
  directive,
  group,
  onStatusChange,
}: {
  directive: Directive;
  group: StatusGroup;
  onStatusChange: (id: string, status: string) => void;
}) {
  const cfg = STATUS_CONFIG[group];
  const isCompleted = group === "completed";

  return (
    <div
      className={`${cfg.bg} rounded-xl border ${cfg.border} px-4 py-3.5 flex items-start justify-between gap-3`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p
            className={`text-sm font-semibold ${
              isCompleted ? "text-[hsl(var(--muted-foreground))] line-through" : "text-white"
            } truncate`}
          >
            {directive.title}
          </p>
        </div>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          {directive.site.nameAr || directive.site.name}
        </p>
        {directive.dueDate && !isCompleted && (
          <p
            className={`text-xs mt-0.5 ${
              directive.isOverdue ? "text-red-500 font-semibold" : "text-[hsl(var(--muted-foreground))]"
            }`}
          >
            {directive.isOverdue ? "متأخر " : ""}
            {relativeDate(directive.dueDate)}
          </p>
        )}
        {isCompleted && directive.body && (
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5 truncate">{directive.body}</p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Date */}
        <span className="text-xs text-[hsl(var(--muted-foreground))] hidden sm:block">
          {relativeDate(directive.createdAt)}
        </span>

        {/* Status badge / action */}
        {isCompleted ? (
          <span className="text-[#1B4332]">
            <CheckCircle2 className="w-5 h-5" />
          </span>
        ) : (
          <button
            onClick={() =>
              onStatusChange(
                directive.id,
                group === "needs_follow_up" ? "open" : "resolved"
              )
            }
            className={`text-xs font-semibold px-3 py-1 rounded-full ${cfg.badgeBg} ${cfg.badgeText} hover:opacity-80 transition-opacity`}
          >
            {cfg.badgeLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export default function GovDirectivesPage() {
  const [directives, setDirectives] = useState<Directive[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDirectives = async () => {
    try {
      const res = await fetch("/api/gov/directives");
      const data = await res.json();
      setDirectives(data.directives ?? []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchDirectives();
  }, []);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await fetch(`/api/gov/directives/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchDirectives();
    } catch {}
  };

  const needs = directives.filter(
    (d) => classifyDirective(d) === "needs_follow_up"
  );
  const inProgress = directives.filter(
    (d) => classifyDirective(d) === "in_progress"
  );
  const completed = directives.filter(
    (d) => classifyDirective(d) === "completed"
  );

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 animate-pulse space-y-4" dir="rtl">
        <div className="h-7 bg-white/5 rounded w-40" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 bg-white/5 rounded-xl" />
        ))}
      </div>
    );
  }

  const Section = ({
    group,
    items,
  }: {
    group: StatusGroup;
    items: Directive[];
  }) => {
    const cfg = STATUS_CONFIG[group];
    if (items.length === 0) return null;
    return (
      <section>
        <div className="flex items-center gap-2 mb-3">
          {cfg.icon}
          <h2 className="text-sm font-bold text-white">{cfg.label}</h2>
          <span className="text-xs bg-white/5 text-[hsl(var(--muted-foreground))] px-2 py-0.5 rounded-full font-medium">
            {items.length}
          </span>
        </div>
        <div className="space-y-2">
          {items.map((d) => (
            <DirectiveItem
              key={d.id}
              directive={d}
              group={group}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8" dir="rtl">
      <h1 className="text-2xl font-bold text-white">توجيهاتي</h1>

      {directives.length === 0 ? (
        <div className="text-center py-20 text-[hsl(var(--muted-foreground))]">
          <Circle className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">لا توجد توجيهات حتى الآن</p>
        </div>
      ) : (
        <>
          <Section group="needs_follow_up" items={needs} />
          <Section group="in_progress" items={inProgress} />
          <Section group="completed" items={completed} />
        </>
      )}
    </div>
  );
}
