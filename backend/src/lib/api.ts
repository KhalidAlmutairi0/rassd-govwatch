import { ZodError } from "zod";
import { QueueError } from "./run-queue";

export function apiError(error: unknown) {
  if (error instanceof QueueError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError || error instanceof SyntaxError || error instanceof URIError) return Response.json({ error: "Invalid request" }, { status: 400 });
  console.error("API request failed", error);
  return Response.json({ error: "Request failed" }, { status: 500 });
}
