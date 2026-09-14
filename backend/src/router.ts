import * as overview from "./routes/overview";
import * as health from "./routes/health";
import * as sites from "./routes/sites";
import * as site from "./routes/site";
import * as siteRuns from "./routes/site-runs";
import * as runReport from "./routes/run-report";
import * as runStatus from "./routes/run-status";
import * as incidents from "./routes/incidents";
import * as instantTest from "./routes/instant-test";
import * as artifacts from "./routes/artifacts";
import { apiError } from "./lib/api";

interface Route { path: RegExp; methods: Record<string, (request: Request, match: RegExpExecArray) => Promise<Response>> }
const decode = (value: string) => decodeURIComponent(value);
const routes: Route[] = [
  { path: /^\/api\/health\/?$/, methods: { GET: () => health.GET() } },
  { path: /^\/api\/overview\/?$/, methods: { GET: () => overview.GET() } },
  { path: /^\/api\/sites\/?$/, methods: { GET: (request) => sites.GET(request), POST: (request) => sites.POST(request) } },
  { path: /^\/api\/sites\/([^/]+)\/?$/, methods: {
    GET: (request, match) => site.GET(request, { params: Promise.resolve({ id: decode(match[1]) }) }),
    PATCH: (request, match) => site.PATCH(request, { params: Promise.resolve({ id: decode(match[1]) }) }),
    DELETE: (request, match) => site.DELETE(request, { params: Promise.resolve({ id: decode(match[1]) }) }),
  } },
  { path: /^\/api\/sites\/([^/]+)\/runs\/?$/, methods: {
    GET: (request, match) => siteRuns.GET(request, { params: Promise.resolve({ id: decode(match[1]) }) }),
    POST: (request, match) => siteRuns.POST(request, { params: Promise.resolve({ id: decode(match[1]) }) }),
  } },
  { path: /^\/api\/sites\/([^/]+)\/runs\/([^/]+)\/?$/, methods: { GET: (request, match) => runReport.GET(request, { params: Promise.resolve({ id: decode(match[1]), runId: decode(match[2]) }) }) } },
  { path: /^\/api\/runs\/([^/]+)\/?$/, methods: { GET: (request, match) => runStatus.GET(request, { params: Promise.resolve({ runId: decode(match[1]) }) }) } },
  { path: /^\/api\/incidents\/?$/, methods: { GET: (request) => incidents.GET(request), PATCH: (request) => incidents.PATCH(request) } },
  { path: /^\/api\/test\/?$/, methods: { POST: (request) => instantTest.POST(request) } },
  { path: /^\/api\/artifacts\/(.+)$/, methods: { GET: (request, match) => artifacts.GET(request, { params: Promise.resolve({ path: match[1].split("/").map(decode) }) }) } },
];

export async function routeRequest(request: Request): Promise<Response> {
  try {
    const pathname = new URL(request.url).pathname;
    for (const route of routes) {
      const match = route.path.exec(pathname);
      if (!match) continue;
      const method = request.method === "HEAD" ? "GET" : request.method;
      const handler = route.methods[method];
      if (!handler) return Response.json({ error: "Method not allowed" }, { status: 405, headers: { Allow: [...Object.keys(route.methods), ...(route.methods.GET ? ["HEAD"] : [])].join(", ") } });
      return await handler(request, match);
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  } catch (error) { return apiError(error); }
}
