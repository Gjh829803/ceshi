import assert from "node:assert/strict";
import { once } from "node:events";
import process from "node:process";
import test from "node:test";

import { spawnOwnedProcess } from "./owned-process.mjs";

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

test("terminates an owned process exactly once and waits for its exit", async () => {
  const owned = spawnOwnedProcess(
    process.execPath,
    ["-e", "process.stdout.write('ready\\n'); setInterval(() => {}, 1_000)"],
    {
      graceMs: 500,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  await once(owned.child.stdout, "data");
  assert.equal(isProcessAlive(owned.pid), true);

  const firstTermination = owned.terminate();
  const secondTermination = owned.terminate();
  assert.equal(firstTermination, secondTermination);

  const result = await firstTermination;
  assert.equal(result.escalated, false);
  assert.equal(isProcessAlive(owned.pid), false);
});

test("escalates to SIGKILL for an owned process group that ignores SIGTERM", {
  skip: process.platform === "win32",
}, async () => {
  const grandchildProgram = "process.on('SIGTERM', () => {}); setInterval(() => {}, 1_000)";
  const childProgram = [
    "const { spawn } = require('node:child_process');",
    `const grandchild = spawn(process.execPath, [\"-e\", ${JSON.stringify(grandchildProgram)}], { stdio: \"ignore\" });`,
    "process.on('SIGTERM', () => {});",
    "process.stdout.write(JSON.stringify({ pid: process.pid, grandchildPid: grandchild.pid }) + '\\n');",
    "setInterval(() => {}, 1_000);",
  ].join("\n");
  const owned = spawnOwnedProcess(process.execPath, ["-e", childProgram], {
    graceMs: 50,
    pollIntervalMs: 5,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const [chunk] = await once(owned.child.stdout, "data");
  const processIds = JSON.parse(chunk.toString("utf8").trim());

  try {
    const result = await owned.terminate();
    assert.equal(result.escalated, true);
    assert.equal(result.exit.signal, "SIGKILL");
    assert.equal(isProcessAlive(processIds.pid), false);
    assert.equal(isProcessAlive(processIds.grandchildPid), false);
  } finally {
    try {
      process.kill(-owned.pid, "SIGKILL");
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
    await owned.exited;
  }
});
