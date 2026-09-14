import "../config/env.cjs";
import { fork, type ChildProcess } from "node:child_process";
import path from "node:path";

const children = new Set<ChildProcess>();
const development = __filename.endsWith(".ts");
let stopping = false;
let exitCode = 0;
let deadline: NodeJS.Timeout | undefined;

function finish() {
  if (stopping && children.size === 0) { if (deadline) clearTimeout(deadline); process.exit(exitCode); }
}

function stop(code: number) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  for (const child of children) if (child.pid) child.kill("SIGTERM");
  deadline = setTimeout(() => { for (const child of children) if (child.pid) child.kill("SIGKILL"); process.exit(exitCode || 1); }, 25_000);
  finish();
}

function launch(module: string) {
  const child = fork(path.join(__dirname, `${module}.${development ? "ts" : "js"}`), [], { execArgv: development ? ["--import", require.resolve("tsx")] : [], stdio: ["ignore", "inherit", "inherit", "ipc"], env: process.env });
  children.add(child);
  child.once("error", (error) => { console.error("Backend process failed", error); if (!child.pid) children.delete(child); stop(1); finish(); });
  child.once("exit", (code) => { children.delete(child); if (!stopping) stop(code || 1); finish(); });
}

process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));
try { launch("server"); launch("worker/scheduler"); }
catch (error) { console.error("Backend startup failed", error); stop(1); }
