import { prisma } from "../lib/prisma";
import { CreateSiteSchema } from "../lib/validators";
import { platformInclude } from "../lib/portfolio-query";

// GET /api/sites - List all sites
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const limit = Math.floor(Math.min(50, Math.max(1, Number(params.get("limit")) || 24)));
    const cursor = params.get("cursor");
    const sites = await prisma.site.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: platformInclude,
    });

    const page = sites.slice(0, limit);
    return Response.json({ sites: page.map(({ runs, ...site }) => ({ ...site, latestRun: runs[0] || null, recentRuns: runs })), nextCursor: sites.length > limit ? page[page.length - 1]?.id : null });
  } catch (error) {
    console.error("Error fetching sites:", error);
    return Response.json(
      { error: "Failed to fetch sites" },
      { status: 500 }
    );
  }
}

// POST /api/sites - Create new site
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = CreateSiteSchema.parse(body);

    const site = await prisma.site.create({
      data: {
        name: data.name,
        nameAr: data.nameAr,
        baseUrl: data.baseUrl,
        description: data.description,
        schedule: data.schedule,
        isPreset: false,
        isActive: true,
        status: "unknown",
        journeys: { create: { name: `${data.name} Smoke Test`, stepsJson: "[]", isDefault: true } },
      },
    });

    return Response.json({ site }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating site:", error);
    return Response.json(
      { error: error.message || "Failed to create site" },
      { status: 400 }
    );
  }
}
