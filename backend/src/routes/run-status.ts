import { prisma } from "../lib/prisma";
import { apiError } from "../lib/api";

export async function GET(_request: Request, { params: pendingParams }: { params: Promise<{ runId: string }> }) {
  const params = await pendingParams;
  try {
    const run = await prisma.run.findUnique({ where: { id: params.runId }, select: {
      id: true, status: true, startedAt: true, finishedAt: true, durationMs: true, totalSteps: true,
      site: { select: { baseUrl: true } },
      steps: { orderBy: { stepIndex: "asc" }, take: 100, select: { stepIndex: true, action: true, description: true, status: true, durationMs: true, error: true, url: true } },
    } });
    if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
    return Response.json({ run }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
