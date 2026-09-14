import { createReadStream } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

export function artifactKey(value) {
  const key = value.replace(/^artifacts\//, "");
  if (path.isAbsolute(key) || key.split("/").some((part) => !/^[a-zA-Z0-9_.-]+$/.test(part) || part === "." || part === "..")) throw new Error(`Artifact path needs manual migration: ${value}`);
  return key;
}

export async function evidenceDigest(root, key) {
  const file = path.join(root, artifactKey(key));
  if (!(await realpath(file)).startsWith(await realpath(root) + path.sep)) throw new Error(`Artifact escapes snapshot: ${key}`);
  const stat = await lstat(file);
  if (!stat.isFile() || stat.size === 0) throw new Error(`Artifact is empty or not a regular file: ${key}`);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file, { highWaterMark: 64 * 1024 })) hash.update(chunk);
  return { key, size: stat.size, sha256: hash.digest("hex") };
}
