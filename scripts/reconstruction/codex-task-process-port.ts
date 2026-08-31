import { spawn } from "node:child_process";

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

function runProcess(
  executablePath: string,
  argumentsValue: readonly string[],
  cwd: string,
): Promise<ProcessResultV1> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [executablePath, ...argumentsValue], {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", reject);
    child.once("close", (exitCode) => resolvePromise({
      exitCode: exitCode ?? 1,
      stdout,
      stderr,
    }));
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

export function createCodexTaskProcessPortV1(): CodexTaskProcessPortV1 {
  return Object.freeze({
    run: async (input: Parameters<CodexTaskProcessPortV1["run"]>[0]) => {
      const {
        executablePath,
        arguments: argumentsValue,
        cwd,
        requestId,
      } = input;
      const result = await runProcess(executablePath, argumentsValue, cwd);
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
  ], input.cwd);
  const envelope = outcomeFromStdout(result.stdout, input.requestId);
  if (envelope?.outcome === "request-missing") {
    return Object.freeze({ outcome: "missing" });
  }
  return Object.freeze({ outcome: "unknown" });
}
