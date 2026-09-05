#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { readRuntimeLock, executionEnvironment, prepareSessionDirectories, valueAfter } from "./creator-eval-runtime.mjs";

const args = process.argv.slice(2);
const lock = await readRuntimeLock(valueAfter(args, "--runtime-lock"));
const workspace = path.resolve(valueAfter(args, "--workspace"));
const env = executionEnvironment(lock, workspace);
env.TSX_DISABLE_CACHE = "1";
env.TSX_TSCONFIG_PATH = path.join(lock.toolkitRoot, "tsconfig.json");
await prepareSessionDirectories(env);
// A separate child is essential: Codex's MCP configuration may augment its
// inherited environment. The actual WorldKit server receives only this map.
// The tsx CLI cache produced logical pnpm module paths with an FSx TMPDIR.
// Native --import plus disabled transform caching was verified against the
// failing case workspace; the explicit workspace remains the tool authority.
await mkdir(path.join(workspace, "outputs"), {recursive: true});
const diagnostics = createWriteStream(path.join(workspace, "outputs/creator-mcp-stderr.log"), {flags: "a"});
const child = spawn(lock.nodeBinary, ["--no-preserve-symlinks", "--no-preserve-symlinks-main", "--import", path.join(lock.toolkitRoot, "node_modules/tsx/dist/loader.mjs"), path.join(lock.toolkitRoot, "scripts/creator/mcp.ts"), "--workspace", workspace], {cwd: lock.toolkitRoot, env, stdio: ["inherit", "inherit", "pipe"]});
child.stderr.pipe(diagnostics);
child.stderr.pipe(process.stderr, {end: false});
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
child.on("error", error => { diagnostics.end(`CREATOR_MCP_START_FAILED: ${error.message}\n`); process.stderr.write(`CREATOR_MCP_START_FAILED: ${error.message}\n`); process.exitCode = 1; });
child.on("exit", (code, signal) => { process.exitCode = code ?? (signal ? 128 : 1); });
