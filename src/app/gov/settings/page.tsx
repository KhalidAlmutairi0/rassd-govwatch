"use client";

import { useEffect, useState } from "react";

interface SettingsData {
  briefTime: string;
  briefTimezone: string;
  emailBrief: boolean;
  smsUrgent: boolean;
  delegateTo: string;
  language: "ar" | "en";
}

const TIMEZONES = [
  { value: "Asia/Riyadh", label: "توقيت الرياض (AST)" },
  { value: "Asia/Dubai", label: "توقيت دبي (GST)" },
  { value: "UTC", label: "UTC" },
];

const TIMES = [
  "06:00", "07:00", "08:00", "09:00", "10:00",
  "11:00", "12:00", "13:00", "14:00",
];

export default function GovSettingsPage() {
  const [settings, setSettings] = useState<SettingsData>({
    briefTime: "08:00",
    briefTimezone: "Asia/Riyadh",
    emailBrief: true,
    smsUrgent: true,
    delegateTo: "",
    language: "ar",
  });
  const [delegates, setDelegates] = useState<Array<{ id: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("gov_settings");
    if (stored) {
      try { setSettings(JSON.parse(stored)); } catch {}
    }
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) setDelegates([{ id: d.user.id, name: d.user.name }]);
      })
      .catch(() => {});
  }, []);

  const update = <K extends keyof SettingsData>(key: K, value: SettingsData[K]) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    localStorage.setItem("gov_settings", JSON.stringify(settings));
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const inputClass = "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30 appearance-none";

  return (
    <div className="max-w-xl mx-auto px-4 py-8" dir="rtl">
      <h1 className="text-xl font-bold text-white mb-6">الإعدادات</h1>

      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl divide-y divide-white/5">

        {/* Daily Brief */}
        <section className="p-6 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-white">الإحاطة اليومية</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">حدد الوقت المفضل لتلقي الإحاطة</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1">المنطقة الزمنية</label>
              <select className={inputClass} value={settings.briefTimezone} onChange={(e) => update("briefTimezone", e.target.value)}>
                {TIMEZONES.map((tz) => <option key={tz.value} value={tz.value} className="bg-[#1a1b2e]">{tz.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1">الوقت المفضل</label>
              <select className={inputClass} value={settings.briefTime} onChange={(e) => update("briefTime", e.target.value)}>
                {TIMES.map((t) => <option key={t} value={t} className="bg-[#1a1b2e]">{t}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* Notifications */}
        <section className="p-6 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-white">الإشعارات</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">اختر طريقة تلقي التنبيهات</p>
          </div>
          <div className="space-y-3">
            <ToggleRow label="إحاطة يومية بالبريد الإلكتروني" checked={settings.emailBrief} onChange={(v) => update("emailBrief", v)} />
            <ToggleRow label="تنبيهات SMS للحالات الحرجة" checked={settings.smsUrgent} onChange={(v) => update("smsUrgent", v)} />
          </div>
        </section>

        {/* Delegation */}
        <section className="p-6 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-white">التفويض</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">عين نائباً لتلقي الإحاطات والتنبيهات</p>
          </div>
          <div>
            <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1">النائب المفوض</label>
            <select className={inputClass} value={settings.delegateTo} onChange={(e) => update("delegateTo", e.target.value)}>
              <option value="" className="bg-[#1a1b2e]">-- لا يوجد تفويض --</option>
              {delegates.map((d) => <option key={d.id} value={d.id} className="bg-[#1a1b2e]">{d.name}</option>)}
            </select>
          </div>
        </section>

        {/* Language */}
        <section className="p-6 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-white">اللغة</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">لغة واجهة المستخدم</p>
          </div>
          <div className="flex rounded-full border border-white/10 overflow-hidden w-fit">
            {[
              { val: "ar" as const, label: "العربية" },
              { val: "en" as const, label: "English" },
            ].map(({ val, label }) => (
              <button key={val} onClick={() => update("language", val)}
                className={`px-6 py-2 text-sm font-semibold transition-colors ${
                  settings.language === val ? "bg-[#1B4332] text-white" : "text-[hsl(var(--muted-foreground))] hover:text-white hover:bg-white/5"
                }`}>
                {label}
              </button>
            ))}
          </div>
        </section>
      </div>

      <button onClick={handleSave} disabled={saving}
        className="mt-6 w-full bg-[#1B4332] text-white rounded-full py-3.5 text-sm font-bold hover:bg-[#1B4332]/80 disabled:opacity-60 transition-colors">
        {saving ? "جارٍ الحفظ..." : saved ? "✓ تم الحفظ" : "حفظ التغييرات"}
      </button>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between cursor-pointer gap-4">
      <span className="text-sm text-[hsl(var(--muted-foreground))]">{label}</span>
      <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 overflow-hidden ${checked ? "bg-[#1B4332]" : "bg-white/10"}`}>
        <span className={`absolute top-0.5 left-0 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}
