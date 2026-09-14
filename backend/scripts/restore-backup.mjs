import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (!process.argv[2] || !process.argv[3]) throw new Error("Provide snapshot and new state directories");
const snapshot = path.resolve(process.argv[2]);
const destination = path.resolve(process.argv[3]);
execFileSync(process.execPath, [fileURLToPath(new URL("verify-backup.mjs", import.meta.url)), snapshot], { stdio: "inherit" });
await mkdir(destination);
await cp(path.join(snapshot, "rasd.db"), path.join(destination, "rasd.db"), { errorOnExist: true, force: false });
await cp(path.join(snapshot, "artifacts"), path.join(destination, "artifacts"), { recursive: true, errorOnExist: true, force: false });
console.log(`Restored into ${destination}; configure DATABASE_URL and ARTIFACTS_DIR before starting services`);
