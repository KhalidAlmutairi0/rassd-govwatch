const origins = new Set((process.env.FRONTEND_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000").split(",").map((value) => value.trim().replace(/\/$/, "")).filter(Boolean).map((value) => {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== value) throw new Error("FRONTEND_ORIGINS must contain exact HTTP(S) origins");
  return url.origin;
}));

export function isAllowedOrigin(origin?: string) { return !origin || origins.has(origin); }

export function corsHeaders(origin?: string): Record<string, string> {
  if (!origin || !origins.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, HEAD, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Range, Cache-Control, Pragma",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}
