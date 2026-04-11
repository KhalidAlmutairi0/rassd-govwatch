"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const INPUT = "w-full px-3 py-2.5 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-white/30 transition";

export default function GovAddSitePage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (runNow: boolean) => {
    if (!url) { setError("URL is required"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || new URL(url).hostname.replace("www.", ""),
          baseUrl: url,
          schedule: 10, // always enable automatic monitoring; developer can change from their view
          skipRun: !runNow,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add site");
      if (runNow && data.run?.id) {
        router.push(`/live/${data.run.id}`);
      } else {
        router.push("/gov/sites");
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-[520px]">
        <Link href="/gov/sites"
          className="inline-flex items-center gap-1.5 text-sm text-[hsl(var(--muted-foreground))] hover:text-white mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Sites
        </Link>

        <h1 className="text-2xl font-bold text-white mb-1">Add New Site</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-6">
          Add a government website to monitor and scan for quality issues.
        </p>

        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-6 space-y-5">

          <div>
            <label className="block text-sm font-medium text-white mb-1.5">Site Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ministry of Health" className={INPUT} />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-1.5">
              Website URL <span className="text-red-400">*</span>
            </label>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.gov.sa" className={INPUT} />
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-950/40 border border-red-900/40 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1 justify-end">
            <button onClick={() => submit(false)} disabled={loading}
              className="px-5 py-2.5 text-sm font-medium rounded-lg border border-[hsl(var(--border))] text-white hover:bg-white/5 disabled:opacity-40 transition-colors">
              Add Site
            </button>
            <button onClick={() => submit(true)} disabled={loading || !url}
              className="px-5 py-2.5 text-sm font-medium rounded-lg bg-[#1B4332] text-white hover:bg-[#1B4332]/80 disabled:opacity-40 transition-colors">
              {loading ? "Starting..." : "Add & Run First Scan"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
