"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Globe, Clock, AlertCircle, Search } from "lucide-react";

interface PageItem {
  id: string;
  url: string;
  path: string;
  name: string;
  durationMs?: number;
  errorCount: number;
  screenshotPath?: string;
}

function derivePages(steps: any[]): PageItem[] {
  const seen = new Set<string>();
  const result: PageItem[] = [];
  steps.forEach((s, i) => {
    if (s.action === "navigate" && s.url && !seen.has(s.url)) {
      seen.add(s.url);
      let path = "/";
      try { path = new URL(s.url).pathname || "/"; } catch {}
      const name =
        s.description?.replace(/^(Open|Navigate to|Go to)\s+/i, "").replace(/["'"]/g, "").trim() ||
        (path === "/" ? "Homepage" : path.replace(/^\//, "").replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()));
      const nextScreenshot = steps.find((ns, ni) => ni > i && ns.screenshotPath);
      const failsOnPage = steps.filter((ns, ni) => ni > i && ns.status === "failed" && ni < (steps.findIndex((x, xi) => xi > i && x.action === "navigate") || Infinity)).length;
      result.push({
        id: `page-${i}`,
        url: s.url,
        path,
        name,
        durationMs: s.durationMs,
        errorCount: failsOnPage,
        screenshotPath: nextScreenshot?.screenshotPath,
      });
    }
  });
  return result;
}

export default function DiscoveredPagesPage() {
  const params = useParams();
  const runId = params.runId as string;
  const [pages, setPages] = useState<PageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch(`/api/sites/temp/runs/${runId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.run?.steps) setPages(derivePages(d.run.steps));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [runId]);

  const filtered = pages.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.path.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-white">Discovered Pages</h1>
          <span className="px-2 py-0.5 text-xs bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-full text-[hsl(var(--muted-foreground))]">
            {loading ? "..." : `${pages.length} pages`}
          </span>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
          <input
            type="text"
            placeholder="Search pages..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-sm bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg text-white placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-emerald-600 w-48"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden animate-pulse">
              <div className="h-40 bg-white/5" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-white/10 rounded w-1/2" />
                <div className="h-3 bg-white/5 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-[hsl(var(--muted-foreground))]">
          <Globe className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">{search ? "No pages match your search" : "No pages discovered yet"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((page) => (
            <Link
              key={page.id}
              href={`/report/${runId}/pages/${encodeURIComponent(page.id)}`}
              className="block rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden hover:border-white/20 transition-colors group"
            >
              {/* Thumbnail */}
              <div className="h-40 bg-[hsl(var(--background))] flex items-center justify-center relative overflow-hidden">
                {page.screenshotPath ? (
                  <img
                    src={`/api/artifacts/${page.screenshotPath.replace("artifacts/", "")}`}
                    alt={page.name}
                    className="w-full h-full object-cover object-top"
                  />
                ) : (
                  <Globe className="w-10 h-10 text-[hsl(var(--border))]" />
                )}
              </div>

              {/* Info */}
              <div className="p-3 border-t border-[hsl(var(--border))]">
                <p className="text-sm font-medium text-white group-hover:text-emerald-400 transition-colors">
                  {page.name}
                </p>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{page.path}</p>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
                    <Clock className="w-3 h-3" />
                    <span>{page.durationMs ? `${(page.durationMs / 1000).toFixed(1)}s` : "—"}</span>
                  </div>
                  {page.errorCount > 0 && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/30">
                      <AlertCircle className="w-3 h-3 text-red-400" />
                      <span className="text-[10px] text-red-400 font-medium">
                        {page.errorCount} error{page.errorCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
