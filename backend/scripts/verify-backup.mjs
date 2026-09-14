import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { artifactKey, evidenceDigest } from "./backup-utils.mjs";

if (!process.argv[2]) throw new Error("Provide a snapshot directory");
const directory = path.resolve(process.argv[2]);
const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
assert.equal(manifest.version, 2);
const db = new DatabaseSync(path.join(directory, "rasd.db"), { readOnly: true });
try {
  assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  for (const table of ["Site", "Journey", "Run", "RunStep", "Artifact", "ElementTestResult", "Incident"]) assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, manifest.counts[table]);
  const root = path.join(directory, "artifacts");
  const expected = new Map(manifest.evidence.map((item) => [item.key, item]));
  const checked = new Set();
  for (const row of db.prepare("SELECT path, sizeBytes FROM Artifact").iterate()) {
    const key = artifactKey(row.path);
    assert.ok(expected.has(key), `Missing evidence checksum: ${key}`);
    if (!checked.has(key)) assert.deepEqual(await evidenceDigest(root, key), expected.get(key));
    if (row.sizeBytes !== null) assert.equal(row.sizeBytes, expected.get(key).size);
    checked.add(key);
  }
  console.log("Snapshot integrity, row counts, and evidence checksums verified");
} finally { db.close(); }
