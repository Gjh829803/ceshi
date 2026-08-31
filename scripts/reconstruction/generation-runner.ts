import { lstat, mkdir, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";

import { sha256Bytes, type Sha256HashV1 } from "@whitebox-world/protocol";
import { parseNativeBlockGenerationReceiptV1, type NativeBlockGenerationReceiptV1, type NativeBlockGenerationRequestV1 } from "@whitebox-world/scene-authoring-contracts";
import type { CodexTaskOutcomeEnvelopeV1 } from "../lib/codex-task-outcome.mjs";

const OUTPUTS = ["native-block-authoring.json", "native-resources.json", "scene.ts"] as const;
type OutputPath = (typeof OUTPUTS)[number];

export interface CodexTaskProcessPortV1 {
  run(input: Readonly<{ executablePath: string; arguments: readonly string[]; cwd: string; requestId: string }>): Promise<Readonly<{ exitCode: number; stdout: string; stderr: string; taskOutcome?: CodexTaskOutcomeEnvelopeV1 }>>;
}

export interface NativeBlockGenerationRunPortsV1 {
  readonly process: CodexTaskProcessPortV1;
  readonly selfCheck: (workspacePath: string) => Promise<Readonly<{ ok: boolean; diagnosticCodes: readonly string[] }>>;
  readonly reconcile: (requestId: string, requestHash: Sha256HashV1) => Promise<Readonly<{ outcome: "missing" }> | Readonly<{ outcome: "completed" | "unknown"; requestId: string; requestHash: Sha256HashV1 }>>;
  readonly cleanup: () => Promise<Readonly<{ outcome: "completed" | "failed" }>>;
}

export interface NativeBlockGenerationRunV1 { readonly receipt: NativeBlockGenerationReceiptV1; readonly sourceDirectoryPath?: string; }

interface PreparedInput {
  readonly generationRequest: NativeBlockGenerationRequestV1;
  readonly generationRequestHash: string;
  readonly routerRequestId: string;
  readonly routerTaskPayloadHash: string;
  readonly backend: "cloud" | "local";
  readonly routerExecutablePath: string;
  readonly routerArguments: readonly string[];
  readonly runDirectoryPath?: string;
  readonly taskWorkspacePath: string;
  readonly stagingDirectoryPath: string;
  readonly sourceDirectoryPath: string;
}

function hasTrustedRouterMarker(stdout: string, backend: "cloud" | "local", requestId: string): boolean {
  const marker = backend === "cloud" ? "WORLDKIT_LWDP_JOB" : "WORLDKIT_LOCAL_CODEX_JOB";
  const lines = stdout.split(/\r?\n/).filter((line) => line.startsWith(`${marker} `));
  if (lines.length !== 1) return false;
  const expression = backend === "cloud"
    ? /^WORLDKIT_LWDP_JOB native-block-generation ([a-z0-9][a-z0-9-]{2,79}) ([a-zA-Z0-9-]+) dispatch=[a-z0-9-]+ profile=formal model=gpt-5\.6-sol reasoning=xhigh$/
    : /^WORLDKIT_LOCAL_CODEX_JOB native-block-generation ([a-z0-9][a-z0-9-]{2,79}) pid=[1-9][0-9]* profile=formal model=gpt-5\.6-sol reasoning=xhigh$/;
  const match = expression.exec(lines[0]!);
  return match !== null && match[1] === requestId;
}

function receipt(input: PreparedInput, outcome: NativeBlockGenerationReceiptV1["outcome"], diagnosticCodes: readonly NativeBlockGenerationReceiptV1["diagnosticCodes"][number][], outputs: NativeBlockGenerationReceiptV1["outputs"], cleanupOutcome: "completed" | "failed"): NativeBlockGenerationReceiptV1 {
  return {
    kind: "native-block-generation-receipt", schemaVersion: 1, id: `${input.generationRequest.id}.receipt`,
    generationRequestRef: "generation-request.json", generationRequestHash: input.generationRequestHash as Sha256HashV1,
    routerTaskPayloadHash: input.routerTaskPayloadHash as Sha256HashV1,
    taskInstructionHash: input.generationRequest.taskInstructionHash,
    builderSkillHash: input.generationRequest.builderSkillHash,
    workspaceContextManifestHash: input.generationRequest.workspaceContextManifestHash,
    routerRequestId: input.routerRequestId, backend: input.backend, executionProfile: "formal", resolvedModel: "gpt-5.6-sol", resolvedReasoningEffort: "xhigh",
    outcome, outputs, diagnosticCodes: [...diagnosticCodes].sort() as NativeBlockGenerationReceiptV1["diagnosticCodes"], cleanupOutcome,
  };
}

async function inspectOutputs(input: PreparedInput): Promise<NativeBlockGenerationReceiptV1["outputs"]> {
  const entries = await readdir(input.stagingDirectoryPath);
  if (entries.length !== OUTPUTS.length || entries.some((entry) => !OUTPUTS.includes(entry as OutputPath))) throw new TypeError("output-unexpected");
  const outputRows = await Promise.all(OUTPUTS.map(async (output) => {
    const outputPath = path.join(input.stagingDirectoryPath, output);
    const info = await lstat(outputPath);
    if (info.isSymbolicLink() || !info.isFile()) throw new TypeError("output-unexpected");
    if (info.size === 0) throw new TypeError("output-missing");
    const bytes = await (await import("node:fs/promises")).readFile(outputPath);
    return { path: output, contentHash: sha256Bytes(bytes) as Sha256HashV1, sizeBytes: info.size, mediaType: output === "scene.ts" ? "text/typescript" as const : "application/json" as const };
  }));
  const totalBytes = outputRows.reduce((total, output) => total + output.sizeBytes, 0);
  if (input.generationRequest.budgets !== undefined && totalBytes > input.generationRequest.budgets.maximumOutputBytes) throw new TypeError("output-hash-mismatch");
  return outputRows;
}

export async function runNativeBlockGenerationV1(input: PreparedInput, ports: NativeBlockGenerationRunPortsV1): Promise<NativeBlockGenerationRunV1> {
  let outcome: NativeBlockGenerationReceiptV1["outcome"] = "tool-error";
  let diagnostics: NativeBlockGenerationReceiptV1["diagnosticCodes"] = ["task-tool-error"];
  let outputs: NativeBlockGenerationReceiptV1["outputs"] = [];
  let cleanupOutcome: "completed" | "failed" = "completed";
  let cleanupCalled = false;
  let reconciliationAttempted = false;
  const reconcileUnknownCreation = async (): Promise<void> => {
    if (reconciliationAttempted) {
      outcome = "unknown";
      diagnostics = ["creation-outcome-unknown"];
      return;
    }
    reconciliationAttempted = true;
    let reconciliation: Awaited<ReturnType<
      NativeBlockGenerationRunPortsV1["reconcile"]
    >>;
    try {
      reconciliation = await ports.reconcile(
        input.routerRequestId,
        input.generationRequestHash as Sha256HashV1,
      );
    } catch {
      outcome = "unknown";
      diagnostics = ["creation-outcome-unknown"];
      return;
    }
    if (reconciliation.outcome !== "missing" &&
        (reconciliation.requestId !== input.routerRequestId ||
          reconciliation.requestHash !== input.generationRequestHash)) {
      outcome = "rejected";
      diagnostics = ["duplicate-request-mismatch"];
      return;
    }
    outcome = "unknown";
    diagnostics = ["creation-outcome-unknown"];
  };
  try {
    const result = await ports.process.run({ executablePath: input.routerExecutablePath, arguments: input.routerArguments, cwd: input.runDirectoryPath ?? path.dirname(path.dirname(path.dirname(input.stagingDirectoryPath))), requestId: input.routerRequestId });
    if (result.taskOutcome?.requestId !== undefined &&
        result.taskOutcome.requestId !== input.routerRequestId) {
      outcome = "rejected"; diagnostics = ["duplicate-request-mismatch"];
    } else if (result.taskOutcome?.outcome === "creation-outcome-unknown") {
      await reconcileUnknownCreation();
    } else if (result.taskOutcome?.outcome === "task-timeout") {
      outcome = "rejected"; diagnostics = ["task-timeout"];
    } else if (result.exitCode !== 0 ||
        result.taskOutcome?.outcome !== "completed") {
      outcome = "rejected"; diagnostics = ["task-rejected"];
    } else if (!hasTrustedRouterMarker(result.stdout, input.backend, input.routerRequestId)) {
      outcome = "rejected"; diagnostics = ["task-rejected"];
    } else {
      try {
        outputs = await inspectOutputs(input);
        const selfCheck = await ports.selfCheck(input.stagingDirectoryPath);
        if (!selfCheck.ok) {
          outcome = "rejected"; diagnostics = ["self-check-failed"];
        } else {
          const cleanup = await ports.cleanup(); cleanupCalled = true;
          if (cleanup.outcome !== "completed") {
            cleanupOutcome = "failed"; outcome = "tool-error"; diagnostics = ["cleanup-failed"];
          } else {
            await lstat(input.sourceDirectoryPath).then(() => { throw new TypeError("stale-output"); }).catch((error: unknown) => { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; });
            await mkdir(path.dirname(input.sourceDirectoryPath), { recursive: true, mode: 0o700 });
            await rename(input.stagingDirectoryPath, input.sourceDirectoryPath);
            outcome = "completed"; diagnostics = [];
          }
        }
      } catch (error) {
        outcome = "rejected";
        const message = String(error);
        diagnostics = [message.includes("stale-output") ? "stale-output" : message.includes("unexpected") ? "output-unexpected" : message.includes("hash-mismatch") ? "output-hash-mismatch" : message.includes("empty") || message.includes("missing") ? "output-missing" : "task-tool-error"];
        outputs = [];
      }
    }
  } catch {
    await reconcileUnknownCreation();
  }
  if (!cleanupCalled) {
    try { const cleanup = await ports.cleanup(); cleanupOutcome = cleanup.outcome; } catch { cleanupOutcome = "failed"; }
    if (cleanupOutcome !== "completed") { outcome = "tool-error"; diagnostics = ["cleanup-failed"]; }
  }
  if (outcome !== "completed") {
    await rm(input.stagingDirectoryPath, { recursive: true, force: true });
  }
  return Object.freeze({ receipt: parseNativeBlockGenerationReceiptV1(receipt(input, outcome, diagnostics, outcome === "completed" ? outputs : [], cleanupOutcome)), ...(outcome === "completed" ? { sourceDirectoryPath: input.sourceDirectoryPath } : {}) });
}
