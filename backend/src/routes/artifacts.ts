import { open, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { artifactPath } from "../lib/artifact-retention";
import { parseByteRange } from "../lib/artifact-stream";
import { artifactRoot } from "../lib/storage";

export async function GET(request: Request, { params: pendingParams }: { params: Promise<{ path?: string[] }> }) {
  const params = await pendingParams;
  if (!params.path?.length) return Response.json({ error: "Path required" }, { status: 400 });
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const key = params.path.join("/");
    const file = artifactPath(key);
    const root = await realpath(artifactRoot());
    const resolved = await realpath(file);
    if (!resolved.startsWith(root + path.sep)) return Response.json({ error: "Invalid path" }, { status: 403 });
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile()) { await handle.close(); return Response.json({ error: "File not found" }, { status: 404 }); }
    const contentTypes: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webm": "video/webm", ".zip": "application/zip", ".json": "application/json" };
    const headers = new Headers({
      "Content-Type": contentTypes[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "private, max-age=3600", "Accept-Ranges": "bytes", "X-Content-Type-Options": "nosniff",
    });
    let range: { start: number; end: number } | undefined;
    if (request.headers.has("range")) {
      try { range = parseByteRange(request.headers.get("range")!, stat.size); }
      catch { await handle.close(); return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } }); }
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${stat.size}`);
    }
    headers.set("Content-Length", String(range ? range.end - range.start + 1 : stat.size));
    const stream = handle.createReadStream({ ...range, autoClose: true, highWaterMark: 64 * 1024 });
    const abort = () => stream.destroy();
    request.signal.addEventListener("abort", abort, { once: true });
    stream.once("close", () => request.signal.removeEventListener("abort", abort));
    if (request.signal.aborted) stream.destroy();
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status: range ? 206 : 200, headers });
  } catch (error) {
    await handle?.close().catch(() => {});
    const code = (error as NodeJS.ErrnoException).code;
    return Response.json({ error: "File not found" }, { status: code === "ENOENT" ? 404 : 403 });
  }
}
