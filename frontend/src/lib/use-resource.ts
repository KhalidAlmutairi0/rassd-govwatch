"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, isStandalone } from "./api-client";

export function useResource<T>(url: string, pollMs = 0) {
  const [record, setRecord] = useState<{ url: string; data: T } | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    setBusy(true);
    setFailedUrl(null);
    const load = async () => {
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 8000);
      try {
        const response = await apiFetch(url, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Request failed");
        const data: T = await response.json();
        if (!disposed) { setRecord({ url, data }); setFailedUrl(null); }
      } catch { if (!disposed) setFailedUrl(url); }
      finally {
        clearTimeout(timeout);
        if (!disposed) {
          setBusy(false);
          if (pollMs && !isStandalone) timer = setTimeout(() => { if (document.visibilityState === "hidden") wait(); else void load(); }, pollMs);
        }
      }
    };
    const wait = () => { if (!disposed) timer = setTimeout(() => { if (document.visibilityState === "hidden") wait(); else void load(); }, pollMs); };
    void load();
    return () => { disposed = true; controller?.abort(); clearTimeout(timer); };
  }, [url, version, pollMs]);
  return { data: record?.url === url ? record.data : null, error: failedUrl === url, loading: busy || (record?.url !== url && failedUrl !== url), reload };
}
