import type { ChildProcess, SpawnOptions } from "node:child_process";

interface OwnedProcessExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly error: Error | null;
}

export function spawnOwnedProcess(command: string, args?: readonly string[], options?: {
  readonly cwd?: SpawnOptions["cwd"];
  readonly env?: NodeJS.ProcessEnv;
  readonly stdio?: SpawnOptions["stdio"];
  readonly graceMs?: number;
  readonly pollIntervalMs?: number;
}): {
  readonly child: ChildProcess;
  readonly pid: number | undefined;
  readonly exited: Promise<OwnedProcessExit>;
  readonly exitResult: OwnedProcessExit | null;
  terminate(): Promise<{ readonly exit: OwnedProcessExit; readonly escalated: boolean }>;
};
