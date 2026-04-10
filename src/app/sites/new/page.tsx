"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";

export default function AddNewSite() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    url: "",
    scheduledScans: false,
    username: "",
    password: "",
    notifyOnComplete: true,
    notifyOnDrop: false,
    slackWebhook: "",
  });
  const [showAuth, setShowAuth] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleAddAndRun = async () => {
    if (!form.url) { setError("URL is required"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name || new URL(form.url).hostname.replace("www.", ""),
          baseUrl: form.url,
          schedule: form.scheduledScans ? 10 : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add site");
      if (data.run?.id) {
        router.push(`/live/${data.run.id}`);
      } else {
        router.push("/sites");
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleAddOnly = async () => {
    if (!form.url) { setError("URL is required"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name || new URL(form.url).hostname.replace("www.", ""),
          baseUrl: form.url,
          schedule: form.scheduledScans ? 10 : 0,
          skipRun: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add site");
      router.push("/sites");
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-[560px]">
        {/* Back */}
        <Link
          href="/sites"
          className="inline-flex items-center gap-1.5 text-sm text-[hsl(var(--muted-foreground))] hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Sites
        </Link>

        {/* Title */}
        <h1 className="text-2xl font-bold text-white mb-1">Add New Site</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-6">
          Enter your site details to begin scanning for UX issues.
        </p>

        {/* Card */}
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-6 space-y-5">

          {/* Site Name */}
          <Field label="Site Name">
            <input
              type="text"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="My Awesome App"
              className={INPUT_CLS}
            />
          </Field>

          {/* URL */}
          <Field label="URL" required>
            <input
              type="url"
              value={form.url}
              onChange={(e) => update("url", e.target.value)}
              placeholder="https://example.com"
              className={INPUT_CLS}
            />
          </Field>

          {/* Auth credentials (collapsible) */}
          <div className="border border-[hsl(var(--border))] rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAuth(!showAuth)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-white hover:bg-white/5 transition-colors"
            >
              Authentication Credentials (Optional)
              {showAuth ? (
                <ChevronUp className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              )}
            </button>
            {showAuth && (
              <div className="px-4 pb-4 space-y-3 border-t border-[hsl(var(--border))] pt-3">
                <Field label="Username">
                  <input
                    type="text"
                    value={form.username}
                    onChange={(e) => update("username", e.target.value)}
                    placeholder="demo@scanux.app"
                    className={INPUT_CLS}
                  />
                </Field>
                <Field label="Password">
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => update("password", e.target.value)}
                    placeholder="password123"
                    className={INPUT_CLS}
                  />
                </Field>
              </div>
            )}
          </div>

          {/* Enable Scheduled Scans */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-white">Enable Scheduled Scans</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                {form.scheduledScans
                  ? "✅ Will auto-scan every 10 minutes"
                  : "Automatically scan this site every 10 minutes."}
              </p>
            </div>
            <Toggle
              checked={form.scheduledScans}
              onChange={(v) => update("scheduledScans", v)}
            />
          </div>

          {/* Notifications */}
          <div>
            <p className="text-sm font-medium text-white mb-3">Notifications</p>
            <div className="space-y-2.5">
              <CheckboxRow
                label="Email when scan completes"
                checked={form.notifyOnComplete}
                onChange={(v) => update("notifyOnComplete", v)}
              />
              <CheckboxRow
                label="Email when score drops below threshold"
                checked={form.notifyOnDrop}
                onChange={(v) => update("notifyOnDrop", v)}
              />
            </div>
          </div>

          {/* Slack Webhook */}
          <Field label="Slack Webhook URL">
            <input
              type="url"
              value={form.slackWebhook}
              onChange={(e) => update("slackWebhook", e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
              className={INPUT_CLS}
            />
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              Optional. Receive scan notifications in Slack.
            </p>
          </Field>

          {error && (
            <div className="text-sm text-red-400 bg-red-950/40 border border-red-900/40 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1 justify-end">
            <button
              type="button"
              onClick={handleAddOnly}
              disabled={loading}
              className="px-5 py-2.5 text-sm font-medium rounded-lg border border-[hsl(var(--border))] text-white hover:bg-white/5 disabled:opacity-40 transition-colors"
            >
              Add Site
            </button>
            <button
              type="button"
              onClick={handleAddAndRun}
              disabled={loading || !form.url}
              className="px-5 py-2.5 text-sm font-medium rounded-lg bg-[hsl(var(--foreground))] text-[hsl(var(--background))] hover:opacity-90 disabled:opacity-40 transition-colors"
            >
              {loading ? "Starting..." : "Add Site & Run First Scan"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const INPUT_CLS =
  "w-full px-3 py-2.5 text-sm bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg text-white placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-white/30 transition";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-white mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
        checked ? "bg-emerald-600" : "bg-white/20"
      }`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <span
        onClick={() => onChange(!checked)}
        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
          checked
            ? "bg-emerald-600 border-emerald-600"
            : "border-[hsl(var(--border))] bg-transparent group-hover:border-white/30"
        }`}
      >
        {checked && (
          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="text-sm text-[hsl(var(--muted-foreground))] group-hover:text-white transition-colors">
        {label}
      </span>
    </label>
  );
}
