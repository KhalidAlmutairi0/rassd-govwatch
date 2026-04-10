"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Test failed");
      router.push(`/live/${data.runId}`);
    } catch (err: any) {
      const msg: string = err.message ?? "";
      if (msg.includes("ERR_CONNECTION_RESET") || msg.includes("ERR_CONNECTION_REFUSED") || msg.includes("ERR_NAME_NOT_RESOLVED") || msg.includes("net::")) {
        setError("Could not reach this site. It may be blocking automated access or is currently down.");
      } else if (msg.includes("timeout") || msg.includes("Timeout")) {
        setError("The site took too long to respond. Please try again.");
      } else {
        setError("Scan failed. Please check the URL and try again.");
      }
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-full py-16 px-6">
      <div className="w-full max-w-xl">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-900/40 border border-emerald-800/50">
            <Globe className="w-7 h-7 text-emerald-400" />
          </div>
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-bold text-white text-center mb-2">
          Scan a Website
        </h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] text-center mb-8">
          Enter a URL to begin AI-powered UX, QA, and accessibility analysis
        </p>

        {/* Form */}
        <form onSubmit={handleTest} className="space-y-3">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.gov.sa"
            className="w-full px-4 py-3 text-sm bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg text-white placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition"
            disabled={loading}
          />

          {error && (
            <div className="text-sm text-red-400 bg-red-950/50 border border-red-900/50 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !url}
            className="w-full py-3 text-sm font-medium rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          >
            {loading ? "Starting scan..." : "Start Scan"}
          </button>
        </form>

        {/* Quick links */}
        <div className="mt-6 text-center">
          <p className="text-xs text-[hsl(var(--muted-foreground))] mb-2">Try a preset:</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {["absher.sa", "moh.gov.sa", "qiwa.sa"].map((site) => (
              <button
                key={site}
                onClick={() => setUrl(`https://www.${site}`)}
                className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors underline underline-offset-2"
              >
                {site}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
