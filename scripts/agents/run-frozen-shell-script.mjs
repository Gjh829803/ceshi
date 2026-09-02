import { spawn, spawnSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function isWithinRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." &&
    !path.isAbsolute(relative);
}

export async function runFrozenShellScript(arguments_, {
  spawnImplementation = spawn,
  spawnSyncImplementation = spawnSync,
} = {}) {
  const [scriptArgument, ...scriptArguments] = arguments_;
  if (!scriptArgument) throw new Error("Usage: run-frozen-shell-script.mjs <project script> [arguments...]");

  const requestedPath = path.resolve(projectRoot, scriptArgument);
  const requestedMetadata = await lstat(requestedPath);
  if (!requestedMetadata.isFile() || requestedMetadata.isSymbolicLink()) {
    throw new Error(`Frozen workflow script must be a regular non-symlink file: ${scriptArgument}`);
  }
  const [resolvedProjectRoot, resolvedScriptPath] = await Promise.all([
    realpath(projectRoot),
    realpath(requestedPath),
  ]);
  if (!isWithinRoot(resolvedProjectRoot, resolvedScriptPath)) {
    throw new Error(`Frozen workflow script must be a project-owned file: ${scriptArgument}`);
  }
  const snapshotRoot = path.join(resolvedProjectRoot, ".codex-tmp", "workflow-script-snapshots");
  await mkdir(snapshotRoot, { recursive: true });
  const snapshotDirectory = await mkdtemp(path.join(snapshotRoot, "shell-"));
  const snapshotPath = path.join(snapshotDirectory, path.basename(resolvedScriptPath));
  try {
    const source = await readFile(resolvedScriptPath);
    await writeFile(snapshotPath, source, { mode: 0o700, flag: "wx" });
    const syntax = spawnSyncImplementation("/bin/bash", ["-n", snapshotPath], {
      cwd: resolvedProjectRoot,
      encoding: "utf8",
      env: process.env,
    });
    if (syntax.status !== 0) {
      throw new Error(
        `Frozen workflow script failed syntax validation: ${String(syntax.stderr || syntax.stdout).trim()}`,
      );
    }

    const child = spawnImplementation("/bin/bash", [snapshotPath, ...scriptArguments], {
      cwd: resolvedProjectRoot,
      env: {
        ...process.env,
        WORLDKIT_FROZEN_SHELL_ACTIVE: "1",
        WORLDKIT_FROZEN_SHELL_PROJECT_ROOT: resolvedProjectRoot,
      },
      stdio: "inherit",
    });
    const forwardedSignals = ["SIGINT", "SIGTERM", "SIGHUP"];
    const handlers = new Map(forwardedSignals.map((signal) => [signal, () => {
      if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    }]));
    for (const [signal, handler] of handlers) process.on(signal, handler);
    try {
      const outcome = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code, signal) => resolve({ code, signal }));
      });
      if (outcome.signal !== null) {
        process.exitCode = 1;
      } else {
        process.exitCode = outcome.code ?? 1;
      }
      return outcome;
    } finally {
      for (const [signal, handler] of handlers) process.off(signal, handler);
    }
  } finally {
    await rm(snapshotDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runFrozenShellScript(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
