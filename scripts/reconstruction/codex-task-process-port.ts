import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

import {
  CODEX_TASK_OUTCOME_PREFIX,
  parseCodexTaskOutcomeEnvelopeV1,
  type CodexTaskOutcomeEnvelopeV1,
} from "../lib/codex-task-outcome.mjs";
import type { CodexTaskProcessPortV1 } from "./generation-runner.js";

interface ProcessResultV1 {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

type DiagnosticSink = (line: string) => void | Promise<void>;
const diagnosticIntervalMs = 15_000;
const defaultDiagnosticSink: DiagnosticSink = (line) => { console.error(line); };

function runProcess(
  executablePath: string,
  argumentsValue: readonly string[],
  cwd: string,
  requestId: string,
  operation: "run" | "reconcile",
  diagnosticSink: DiagnosticSink = defaultDiagnosticSink,
): Promise<ProcessResultV1> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [executablePath, ...argumentsValue], {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const startedAtMs = performance.now();
    let lastOutputAtMs: number | undefined;
    let isFinished = false;
    let isSinkPending = false;
    // Keep each diagnostic below 2 KiB, including JSON escaping. Oversized Host
    // identities remain bound by digest; no child text is copied into telemetry.
    const identity = {
      ...(requestId.length <= 128 ? { requestId } : {}),
      requestIdSha256: createHash("sha256").update(requestId).digest("hex"),
    };
    const emit = (lifecycle: "started" | "heartbeat" | "closed" | "error", exitCode?: number) => {
      if (isSinkPending) return;
      const nowMs = performance.now();
      try {
        const pending = diagnosticSink(`WORLDKIT_CODEX_PROCESS ${JSON.stringify({
          ...identity,
          operation,
          lifecycle,
          elapsedMs: Math.max(0, Math.floor(nowMs - startedAtMs)),
          stdoutBytes,
          stderrBytes,
          outputActivityAgeMs: lastOutputAtMs === undefined ? null : Math.max(0, Math.floor(nowMs - lastOutputAtMs)),
          ...(exitCode === undefined ? {} : { exitCode }),
        })}`);
        if (pending !== undefined) {
          isSinkPending = true;
          void Promise.resolve(pending).then(
            () => { isSinkPending = false; },
            () => { isSinkPending = false; },
          );
        }
      } catch {
        // Diagnostics are best effort and never change submission or its outcome.
      }
    };
    const timer = setInterval(() => { emit("heartbeat"); }, diagnosticIntervalMs);
    timer.unref();
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      stdoutBytes += Buffer.byteLength(chunk);
      lastOutputAtMs = performance.now();
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      stderrBytes += Buffer.byteLength(chunk);
      lastOutputAtMs = performance.now();
    });
    child.once("error", (error) => {
      if (isFinished) return;
      isFinished = true;
      clearInterval(timer);
      emit("error");
      reject(error);
    });
    child.once("close", (exitCode) => {
      if (isFinished) return;
      isFinished = true;
      clearInterval(timer);
      emit("closed", exitCode ?? 1);
      resolvePromise({ exitCode: exitCode ?? 1, stdout, stderr });
    });
    // This proves Host invocation/activity only, never a model stage or success.
    emit("started");
  });
}

function outcomeFromStdout(
  stdout: string,
  expectedRequestId: string,
): CodexTaskOutcomeEnvelopeV1 | undefined {
  const rows = stdout.split(/\r?\n/).filter((line) =>
    line.startsWith(CODEX_TASK_OUTCOME_PREFIX)
  );
  if (rows.length !== 1) return undefined;
  try {
    const envelope = parseCodexTaskOutcomeEnvelopeV1(JSON.parse(
      rows[0]!.slice(CODEX_TASK_OUTCOME_PREFIX.length),
    ));
    return envelope.requestId === expectedRequestId ? envelope : undefined;
  } catch {
    return undefined;
  }
}

export function createCodexTaskProcessPortV1(options: Readonly<{
  diagnosticSink?: DiagnosticSink;
}> = {}): CodexTaskProcessPortV1 {
  return Object.freeze({
    run: async (input: Parameters<CodexTaskProcessPortV1["run"]>[0]) => {
      const {
        executablePath,
        arguments: argumentsValue,
        cwd,
        requestId,
      } = input;
      const result = await runProcess(executablePath, argumentsValue, cwd, requestId, "run", options.diagnosticSink);
      const taskOutcome = outcomeFromStdout(result.stdout, requestId);
      return Object.freeze({
        ...result,
        ...(taskOutcome === undefined ? {} : { taskOutcome }),
      });
    },
  });
}

export async function reconcileCodexTaskCreationV1(input: Readonly<{
  executablePath: string;
  backend: "cloud" | "local";
  requestId: string;
  cwd: string;
}>): Promise<
  Readonly<{ outcome: "missing" }> | Readonly<{ outcome: "unknown" }>
> {
  if (input.backend === "local") return Object.freeze({ outcome: "missing" });
  const result = await runProcess(input.executablePath, [
    "--backend", "cloud",
    "--reconcile-only",
    "--task-id", input.requestId,
    "--request-id", input.requestId,
  ], input.cwd, input.requestId, "reconcile");
  const envelope = outcomeFromStdout(result.stdout, input.requestId);
  if (envelope?.outcome === "request-missing") {
    return Object.freeze({ outcome: "missing" });
  }
  return Object.freeze({ outcome: "unknown" });
}
