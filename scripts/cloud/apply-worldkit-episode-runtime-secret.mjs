#!/usr/bin/env node
import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const runtimeRoot = path.join(repoRoot, ".codex-tmp", "runtime-config");
const files = [
  "infinite-canvas.key",
  "gemini.env",
  "google-service-account.json",
  "aws-credentials",
  "aws-config",
];

function run(command, arguments_, { input = null } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, arguments_, {
      cwd: repoRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    let stderr = "";
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolvePromise(Buffer.concat(stdout));
      else reject(new Error(`${command} exited ${code}: ${stderr.trim()}`));
    });
    child.stdin.end(input ?? undefined);
  });
}

for (const fileName of files) {
  const metadata = await stat(path.join(runtimeRoot, fileName)).catch(() => null);
  if (!metadata?.isFile() || metadata.size < 1) {
    throw new Error(`Project-local Episode runtime credential is missing: ${fileName}`);
  }
}

const namespaceIndex = process.argv.indexOf("--namespace");
const namespace = namespaceIndex >= 0 ? process.argv[namespaceIndex + 1] : "lwdp";
if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(namespace ?? "")) {
  throw new Error("Kubernetes namespace is invalid.");
}
const manifest = await run("kubectl", [
  "create", "secret", "generic", "worldkit-episode-runtime",
  "--namespace", namespace,
  ...files.map((fileName) => `--from-file=${fileName}=${path.join(runtimeRoot, fileName)}`),
  "--dry-run=client",
  "-o", "json",
]);
await run("kubectl", ["apply", "-f", "-"], { input: manifest });
process.stdout.write(
  `WORLDKIT_CLOUD_EPISODE_RUNTIME_SECRET_READY namespace=${namespace} files=${files.length}\n`,
);
