// src/app/api/artifacts/[[...path]]/route.ts
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// GET /api/artifacts/[...path] - Serve artifact files
export async function GET(
  request: Request,
  { params }: { params: { path?: string[] } }
) {
  try {
    if (!params.path || params.path.length === 0) {
      return NextResponse.json(
        { error: "Path required" },
        { status: 400 }
      );
    }

    // Build file path (relative to project root)
    const filePath = path.join(process.cwd(), "artifacts", ...params.path);

    // Security: Ensure path is within artifacts directory
    const artifactsDir = path.join(process.cwd(), "artifacts");
    if (!filePath.startsWith(artifactsDir)) {
      return NextResponse.json(
        { error: "Invalid path" },
        { status: 403 }
      );
    }

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }

    // Read file
    const fileBuffer = await fs.readFile(filePath);
    const fileName = path.basename(filePath);

    // Determine content type
    let contentType = "application/octet-stream";
    if (fileName.endsWith(".png")) {
      contentType = "image/png";
    } else if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) {
      contentType = "image/jpeg";
    } else if (fileName.endsWith(".webm")) {
      contentType = "video/webm";
    } else if (fileName.endsWith(".zip")) {
      contentType = "application/zip";
    } else if (fileName.endsWith(".json")) {
      contentType = "application/json";
    }

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Error serving artifact:", error);
    return NextResponse.json(
      { error: "Failed to serve file" },
      { status: 500 }
    );
  }
}
