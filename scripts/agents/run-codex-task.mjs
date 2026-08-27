#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const forwarded = [];
let backend = process.env.WORLDKIT_CODEX_BACKEND || "cloud";

for (let index = 0; index < process.argv.slice(2).length; index += 1) {
  const argv = process.argv.slice(2);
  const value = argv[index];
  if (value === "--backend") {
    if (argv[index + 1] === undefined) throw new Error("Missing value after --backend.");
    backend = argv[index + 1];
    index += 1;
    continue;
  }
  forwarded.push(value);
}

if (!new Set(["cloud", "local"]).has(backend)) {
  throw new Error("Codex backend must be either 'cloud' or 'local'.");
}

const runner = backend === "cloud"
  ? path.join(scriptRoot, "run-lwdp-codex-task.mjs")
  : path.join(scriptRoot, "run-local-codex-task.mjs");

process.stdout.write(`WORLDKIT_CODEX_BACKEND ${backend}\n`);
const child = spawn(process.execPath, [runner, ...forwarded], {
  cwd: process.cwd(),
  env: process.env,
  shell: false,
  stdio: "inherit",
});

let forwardedSignal = null;
const forwardSignal = (signal) => {
  forwardedSignal = signal;
  if (!child.killed) child.kill(signal);
};
process.once("SIGINT", () => forwardSignal("SIGINT"));
process.once("SIGTERM", () => forwardSignal("SIGTERM"));

const result = await new Promise((resolvePromise) => {
  child.once("error", (error) => resolvePromise({ code: 1, error }));
  child.once("close", (code, signal) => resolvePromise({ code: code ?? 1, signal }));
});

if (result.error) throw result.error;
if (forwardedSignal !== null || result.signal) {
  process.exitCode = 1;
} else {
  process.exitCode = result.code;
}
