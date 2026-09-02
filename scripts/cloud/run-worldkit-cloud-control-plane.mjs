#!/usr/bin/env node
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { materializeCloudWorkerLwdpConfig } from "./run-worldkit-cloud-scene-worker.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

async function main() {
  await materializeCloudWorkerLwdpConfig({ repoRoot, environment: process.env });
  delete process.env.LWDP_GENERATION_API_TOKEN;
  const child = spawn("node", ["apps/studio/src/server.mjs"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      WORLDKIT_CLOUD_CONTROL_PLANE: "1",
      WORLDKIT_CODEX_BACKEND: "cloud",
      WORLDKIT_DISABLE_PLAYGROUND_SPAWN: "1",
    },
    stdio: "inherit",
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      if (!child.killed) child.kill(signal);
    });
  }
  const code = await new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("close", (status) => resolvePromise(status ?? 1));
  });
  process.exitCode = code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
