#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const child = spawn(process.execPath, [path.join(root, "node_modules/tsx/dist/cli.mjs"), path.join(root, "scripts/creator/mcp.ts"), ...process.argv.slice(2)], { stdio: "inherit", shell: false });
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child.kill(signal));
child.once("error", error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
child.once("close", code => { process.exitCode = code ?? 1; });
