import { z } from "zod";
import { prisma } from "../lib/prisma";
import { enqueueRun } from "../lib/run-queue";
import { apiError } from "../lib/api";

export async function GET(_request: Request, { params: pendingParams }: { params: Promise<{ id: string }> }) {
  const params = await pendingParams;
  try {
    const runs = await prisma.run.findMany({ where: { siteId: params.id }, orderBy: { startedAt: "desc" }, take: 50,
      select: { id: true, siteId: true, journeyId: true, status: true, durationMs: true, totalSteps: true, passedSteps: true, failedSteps: true, startedAt: true, finishedAt: true, triggeredBy: true, journey: { select: { id: true, name: true, type: true } } },
    });
    return Response.json({ runs });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request, { params: pendingParams }: { params: Promise<{ id: string }> }) {
  const params = await pendingParams;
  try {
    const { journeyId } = z.object({ journeyId: z.string().cuid().optional() }).parse(await request.json());
    const journey = await prisma.journey.findFirst({ where: { siteId: params.id, ...(journeyId ? { id: journeyId } : { isDefault: true }) }, select: { id: true } });
    if (!journey) return Response.json({ error: "No journey found" }, { status: 404 });
    const run = await enqueueRun(params.id, journey.id, "manual");
    return Response.json({ run }, { status: 202 });
  } catch (error) { return apiError(error); }
}
