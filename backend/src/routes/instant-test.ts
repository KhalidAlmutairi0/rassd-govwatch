import { UrlInputSchema } from "../lib/validators";
import { enqueueInstantTest } from "../lib/run-queue";
import { apiError } from "../lib/api";

export async function POST(request: Request) {
  try {
    const { url } = UrlInputSchema.parse(await request.json());
    const run = await enqueueInstantTest(url);
    return Response.json({ success: true, siteId: run.siteId, runId: run.id }, { status: 202 });
  } catch (error) { return apiError(error); }
}
