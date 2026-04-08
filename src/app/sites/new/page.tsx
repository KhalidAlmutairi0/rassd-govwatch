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
    username: "",
    password: "",
    scheduledScans: false,
    notifyOnComplete: true,
    notifyOnDrop: false,
    slackWebhook: "",
  });
  const [showAuth, setShowAuth] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const update = (field: string, value: any) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleAddSite = async () => {
    if (!form.url) { setError("URL is required"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name || form.url, baseUrl: form.url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add site");
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleAddAndRun = async () => {
    if (!form.url) { setError("URL is required"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: form.url, name: form.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start scan");
      router.push(`/live/${data.runId}`);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-full flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-[560px]">
        {/* Back */}
        <Link
          href="/dashboard"
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
          <div>
            <label className="block text-sm font-medium text-white mb-1.5">
              Site Name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="My Awesome App"
              className="w-full px-3 py-2.5 text-sm bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg text-white placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-emerald-600 transition"
            />
          </div>

          {/* URL */}
          <div>
            <label className="block text-sm font-medium text-white mb-1.5">
              URL
            </label>
            <input
              type="url"
              value={form.url}
              onChange={(e) => update("url", e.target.value)}
              placeholder="https://example.com"
              className="w-full px-3 py-2.5 text-sm bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg text-white placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-emerald-600 transition"
            />
          </div>

          {/* Auth credentials (collapsible) */}
          <div className="border border-[hsl(var(--border))] rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAuth(!showAuth)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-white hover:bg-white/5 transition-colors"
            >
              Authentication Credentials (Optional)
              {showAuth ? <ChevronUp className="w-4 h-4 text-[hsl(var(--muted-foreground))]" /> : <ChevronDown className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />}
            </button>
            {showAuth && (
              <div className="px-4 pb-4 space-y-3 border-t border-[hsl(var(--border))]">
                <div className="pt-3">
                  <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1.5">
                    Username
                  </label>
                  <input
                    type="text"
                    value={form.username}
                    onChange={(e) => update("username", e.target.value)}
                    placeholder="demo@scanux.app"
                    className="w-full px-3 py-2 text-sm bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg text-white placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-emerald-600 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => update("password", e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 text-sm bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg text-white placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-emerald-600 transition"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Scheduled Scans */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-white">Enable Scheduled Scans</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                Automatically scan this site on a recurring basis.
              </p>
            </div>
            <button
              type="button"
              onClick={() => update("scheduledScans", !form.scheduledScans)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                form.scheduledScans ? "bg-emerald-600" : "bg-[hsl(var(--border))]"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  form.scheduledScans ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {/* Notifications */}
          <div>
            <p className="text-sm font-medium text-white mb-2">Notifications</p>
            <div className="space-y-2">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.notifyOnComplete}
                  onChange={(e) => update("notifyOnComplete", e.target.checked)}
                  className="w-4 h-4 rounded border-[hsl(var(--border))] accent-emerald-600"
                />
                <span className="text-sm text-[hsl(var(--muted-foreground))]">
                  Email when scan completes
                </span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.notifyOnDrop}
                  onChange={(e) => update("notifyOnDrop", e.target.checked)}
                  className="w-4 h-4 rounded border-[hsl(var(--border))] accent-emerald-600"
                />
                <span className="text-sm text-[hsl(var(--muted-foreground))]">
                  Email when score drops below threshold
                </span>
              </label>
            </div>
          </div>

          {/* Slack webhook */}
          <div>
            <label className="block text-sm font-medium text-white mb-1.5">
              Slack Webhook URL
            </label>
            <input
              type="url"
              value={form.slackWebhook}
              onChange={(e) => update("slackWebhook", e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
              className="w-full px-3 py-2.5 text-sm bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg text-white placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-emerald-600 transition"
            />
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              Optional. Receive scan notifications in Slack.
            </p>
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-950/40 border border-red-900/40 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={handleAddSite}
              disabled={loading}
              className="flex-1 py-2.5 text-sm font-medium rounded-lg border border-[hsl(var(--border))] text-white hover:bg-white/5 disabled:opacity-40 transition-colors"
            >
              Add Site
            </button>
            <button
              type="button"
              onClick={handleAddAndRun}
              disabled={loading}
              className="flex-1 py-2.5 text-sm font-medium rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white transition-colors"
            >
              {loading ? "Starting..." : "Add Site & Run First Scan"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
