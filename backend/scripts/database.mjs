import environment from "../config/env.cjs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import path from "node:path";

const commands = { generate: ["generate"], migrate: ["migrate", "deploy"] };
const args = commands[process.argv[2]];
if (!args) throw new Error("Use generate or migrate");
const require = createRequire(import.meta.url);
execFileSync(process.execPath, [require.resolve("prisma/build/index.js"), ...args, "--schema", path.join(environment.root, "prisma/schema.prisma")], { cwd: environment.root, env: process.env, stdio: "inherit" });
