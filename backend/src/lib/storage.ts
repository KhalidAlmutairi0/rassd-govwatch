import path from "node:path";
import { statfs } from "node:fs/promises";

export function artifactRoot(env: Record<string, string | undefined> = process.env) {
  return path.resolve(env.ARTIFACTS_DIR || path.join(process.cwd(), "artifacts"));
}

export function hasDiskCapacity(stats: { bavail: number; bsize: number }, reserveMb: number) {
  return stats.bavail * stats.bsize >= reserveMb * 1024 * 1024;
}

export async function hasArtifactCapacity() {
  const value = Number(process.env.MIN_FREE_DISK_MB ?? 512);
  const reserve = Number.isFinite(value) ? Math.max(0, value) : 512;
  return hasDiskCapacity(await statfs(artifactRoot()), reserve);
}
