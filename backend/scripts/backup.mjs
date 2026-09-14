import environment from "../config/env.cjs";
import { DatabaseSync, backup } from "node:sqlite";
import { mkdir, realpath, cp, writeFile } from "node:fs/promises";
import path from "node:path";
import { artifactKey, evidenceDigest } from "./backup-utils.mjs";

const destination = process.argv[2];
const databaseFile = environment.databasePath;
if (!destination || !databaseFile || !path.isAbsolute(databaseFile) || !process.env.ARTIFACTS_DIR) throw new Error("Provide a new snapshot directory, an absolute DATABASE_URL, and ARTIFACTS_DIR");
const artifacts = await realpath(process.env.ARTIFACTS_DIR);
const directory = path.resolve(destination);
if (directory === artifacts || directory.startsWith(artifacts + path.sep)) throw new Error("Snapshots must be outside the artifact directory");
const db = new DatabaseSync(databaseFile, { readOnly: true });
try {
  const hasWorkerState = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'WorkerState'").get();
  if (db.prepare("SELECT COUNT(*) AS count FROM Run WHERE status = 'running'").get().count) throw new Error("Stop execution before backing up");
  const heartbeat = hasWorkerState ? db.prepare("SELECT heartbeatAt FROM WorkerState WHERE id = 'primary'").get() : null;
  if (heartbeat && Date.now() - new Date(heartbeat.heartbeatAt).getTime() < 30_000) throw new Error("Stop the worker before backing up");
  await mkdir(directory);
  await backup(db, path.join(directory, "rasd.db"));
  await cp(artifacts, path.join(directory, "artifacts"), { recursive: true, errorOnExist: true, force: false });
  const evidence = new Map();
  for (const row of db.prepare("SELECT path, sizeBytes FROM Artifact").iterate()) {
    const key = artifactKey(row.path);
    const digest = evidence.get(key) || await evidenceDigest(path.join(directory, "artifacts"), key);
    if (row.sizeBytes !== null && row.sizeBytes !== digest.size) throw new Error(`Recorded artifact size mismatch: ${key}`);
    evidence.set(key, digest);
  }
  const counts = Object.fromEntries(["Site", "Journey", "Run", "RunStep", "Artifact", "ElementTestResult", "Incident"].map((table) => [table, db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count]));
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify({ version: 2, createdAt: new Date().toISOString(), counts, evidence: Array.from(evidence.values()) }, null, 2), { flag: "wx" });
  console.log(directory);
} finally { db.close(); }
