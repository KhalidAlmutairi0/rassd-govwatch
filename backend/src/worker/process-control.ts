import type { ChildProcess } from "node:child_process";

export function killProcessGroup(pid?: number) {
  if (!pid || pid <= 1) return;
  try { process.kill(process.platform === "win32" ? pid : -pid, "SIGKILL"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
}

export async function terminateRunProcesses(child: ChildProcess, browserPid?: number) {
  killProcessGroup(browserPid);
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  killProcessGroup(child.pid);
  await exited;
}
