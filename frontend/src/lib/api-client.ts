import { standaloneResponse } from "./standalone";

const base = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/+$/, "");
export const isStandalone = base.length === 0;

function backendUrl(resource: string) {
  const origin = base === "same-origin" ? window.location.origin : base;
  const url = new URL(origin);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Invalid NEXT_PUBLIC_API_URL");
  if (!resource.startsWith("/api/")) throw new Error("Invalid API resource");
  return origin + resource;
}

export async function apiFetch(resource: string, options: RequestInit = {}): Promise<Response> {
  if (options.signal?.aborted) throw new DOMException("Request aborted", "AbortError");
  if (isStandalone) {
    if ((options.method || "GET").toUpperCase() !== "GET") return Response.json({ error: "Connect the backend to perform this action" }, { status: 503 });
    return standaloneResponse(resource);
  }
  return fetch(backendUrl(resource), { ...options, mode: "cors", credentials: "omit" });
}

export function artifactUrl(value: string): string | undefined {
  if (isStandalone) return undefined;
  const key = value.replace(/^artifacts\//, "");
  return backendUrl(`/api/artifacts/${key.split("/").map(encodeURIComponent).join("/")}`);
}

export function liveSocketUrl(runId: string): string | null {
  const value = (process.env.NEXT_PUBLIC_WS_URL || "").trim().replace(/\/+$/, "");
  if (isStandalone || !value) return null;
  const endpoint = value === "same-origin" ? window.location.origin.replace(/^http/, "ws") : value;
  const url = new URL(endpoint);
  if (!["ws:", "wss:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Invalid NEXT_PUBLIC_WS_URL");
  return `${endpoint}/live/${encodeURIComponent(runId)}`;
}
