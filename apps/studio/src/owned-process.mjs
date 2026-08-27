import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const DEFAULT_GRACE_MS = 2_000;
const DEFAULT_POLL_INTERVAL_MS = 10;

function validatedDuration(value, name, { allowZero = false } = {}) {
  const minimum = allowZero ? 0 : 1;
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer of at least ${minimum}ms.`);
  }
  return value;
}

function ignoredMissingProcess(error) {
  if (error?.code === "ESRCH") return false;
  throw error;
}

function signalOwnedTree(child, pid, signal) {
  if (!pid) return false;
  if (process.platform === "win32") return child.kill(signal);
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    return ignoredMissingProcess(error);
  }
}

function isOwnedTreeAlive(child, pid) {
  if (!pid) return false;
  if (process.platform === "win32") return child.exitCode === null && child.signalCode === null;
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "EPERM") return false;
    return ignoredMissingProcess(error);
  }
}

async function waitForOwnedTreeExit(child, pid, timeoutMs, pollIntervalMs) {
  const deadline = Date.now() + timeoutMs;
  while (isOwnedTreeAlive(child, pid)) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) return false;
    await delay(Math.min(pollIntervalMs, remainingMs));
  }
  return true;
}

export function spawnOwnedProcess(command, args = [], options = {}) {
  const graceMs = validatedDuration(options.graceMs ?? DEFAULT_GRACE_MS, "graceMs", {
    allowZero: true,
  });
  const pollIntervalMs = validatedDuration(
    options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    "pollIntervalMs",
  );
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: options.stdio ?? "inherit",
    detached: process.platform !== "win32",
    windowsHide: true,
  });
  const pid = child.pid;
  let exitResult = null;
  let settleExit;
  const exited = new Promise((resolve) => {
    settleExit = (result) => {
      if (exitResult !== null) return;
      exitResult = result;
      resolve(result);
    };
  });
  child.once("error", (error) => settleExit({ code: null, signal: null, error }));
  child.once("exit", (code, signal) => settleExit({ code, signal, error: null }));

  let termination = null;
  function terminate() {
    if (termination !== null) return termination;
    termination = (async () => {
      signalOwnedTree(child, pid, "SIGTERM");
      let escalated = false;
      if (!await waitForOwnedTreeExit(child, pid, graceMs, pollIntervalMs)) {
        escalated = signalOwnedTree(child, pid, "SIGKILL");
        if (!await waitForOwnedTreeExit(child, pid, 1_000, pollIntervalMs)) {
          throw new Error(`Owned process group ${pid ?? "unknown"} survived SIGKILL.`);
        }
      }
      const exit = await exited;
      return { exit, escalated };
    })();
    return termination;
  }

  return {
    child,
    pid,
    exited,
    get exitResult() {
      return exitResult;
    },
    terminate,
  };
}
