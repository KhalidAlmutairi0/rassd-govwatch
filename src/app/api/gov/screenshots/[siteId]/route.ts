// Returns the latest available screenshots for a site by scanning the artifacts directory
import { NextResponse } from "next/server";
import { readdir, access } from "fs/promises";
import path from "path";

export async function GET(
  _req: Request,
  { params }: { params: { siteId: string } }
) {
  const { siteId } = params;
  const siteDir = path.join(process.cwd(), "artifacts", siteId);

  try {
    await access(siteDir);
  } catch {
    return NextResponse.json({ runId: null, frames: [] });
  }

  // Get all run folders, sorted newest first (cuid is time-ordered)
  let runFolders: string[] = [];
  try {
    runFolders = (await readdir(siteDir)).sort().reverse();
  } catch {
    return NextResponse.json({ runId: null, frames: [] });
  }

  // Find the newest run folder that has element-*-after.png or full-page.png
  for (const runId of runFolders) {
    const runDir = path.join(siteDir, runId);
    let files: string[] = [];
    try {
      files = await readdir(runDir);
    } catch {
      continue;
    }

    // Collect element-N-after.png frames (sorted by N)
    let afterFrames = files
      .filter((f) => /^element-\d+-after\.png$/.test(f))
      .sort((a, b) => {
        const na = parseInt(a.match(/\d+/)![0]);
        const nb = parseInt(b.match(/\d+/)![0]);
        return na - nb;
      })
      .map((f) => `/api/artifacts/${siteId}/${runId}/${f}`);

    // Fallback: step-N.png naming
    if (afterFrames.length === 0) {
      afterFrames = files
        .filter((f) => /^step-\d+\.png$/.test(f))
        .sort((a, b) => {
          const na = parseInt(a.match(/\d+/)![0]);
          const nb = parseInt(b.match(/\d+/)![0]);
          return na - nb;
        })
        .map((f) => `/api/artifacts/${siteId}/${runId}/${f}`);
    }

    // Also include full-page.png if present
    const hasFullPage = files.includes("full-page.png");
    if (hasFullPage) {
      afterFrames.push(`/api/artifacts/${siteId}/${runId}/full-page.png`);
    }

    if (afterFrames.length > 0) {
      return NextResponse.json({
        runId,
        frames: afterFrames.slice(0, 10), // max 10 frames
      });
    }
  }

  return NextResponse.json({ runId: null, frames: [] });
}
