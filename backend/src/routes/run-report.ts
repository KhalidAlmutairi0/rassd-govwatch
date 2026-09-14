import { prisma } from "../lib/prisma";

// GET /api/sites/[id]/runs/[runId] - Get run details
export async function GET(
  request: Request,
  { params: pendingParams }: { params: Promise<{ id: string; runId: string }> }
) {
  const params = await pendingParams;
  try {
    const run = await prisma.run.findFirst({
      where: { id: params.runId, ...(params.id === "temp" ? {} : { siteId: params.id }) },
      include: {
        site: true,
        journey: true,
        elementResults: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 100 },
        steps: {
          orderBy: { stepIndex: "asc" },
        },
        artifacts: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!run) {
      return Response.json({ error: "Run not found" }, { status: 404 });
    }

    const { elementResults, ...details } = run;
    return Response.json({ run: { ...details, steps: run.steps.map((step, index) => {
      const element = run.steps.length === elementResults.length ? elementResults[index] : undefined;
      return { ...step, url: step.url || element?.urlAfter || (step.action === "navigate" ? run.site.baseUrl : null), metadata: step.metadata || (element ? JSON.stringify({ urlBefore: element.urlBefore, urlAfter: element.urlAfter, urlChanged: element.urlChanged }) : null) };
    }) } });
  } catch (error) {
    console.error("Error fetching run:", error);
    return Response.json(
      { error: "Failed to fetch run" },
      { status: 500 }
    );
  }
}
