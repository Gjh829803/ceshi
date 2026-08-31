import { lstat, mkdir, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";

import { sha256Bytes, type Sha256HashV1 } from "@whitebox-world/protocol";
import type { NativeBlockGenerationReceiptV1 } from "@whitebox-world/scene-authoring-contracts";

const OUTPUTS = ["native-block-authoring.json", "native-resources.json", "scene.ts"] as const;
type OutputPath = (typeof OUTPUTS)[number];

export interface CodexTaskProcessPortV1 {
  run(input: Readonly<{ executablePath: string; arguments: readonly string[]; cwd: string }>): Promise<Readonly<{ exitCode: number; stdout: string; stderr: string }>>;
}

export interface NativeBlockGenerationRunPortsV1 {
  readonly process: CodexTaskProcessPortV1;
  readonly selfCheck: (workspacePath: string) => Promise<Readonly<{ ok: boolean; diagnosticCodes: readonly string[] }>>;
  readonly reconcile: (requestId: string, requestHash: Sha256HashV1) => Promise<Readonly<{ outcome: "missing" }> | Readonly<{ outcome: "completed" | "unknown"; requestId: string; requestHash: Sha256HashV1 }>>;
  readonly cleanup: () => Promise<Readonly<{ outcome: "completed" | "failed" }>>;
}

export interface NativeBlockGenerationRunV1 { readonly receipt: NativeBlockGenerationReceiptV1; readonly sourceDirectoryPath?: string; }

interface PreparedInput {
  readonly generationRequest: Readonly<{ id: string; declaredOutputPaths: readonly string[]; taskInstructionHash?: Sha256HashV1; builderSkillHash?: Sha256HashV1; workspaceContextManifestHash?: Sha256HashV1; budgets?: Readonly<{ maximumOutputBytes: number }> }>;
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

function receipt(input: PreparedInput, outcome: NativeBlockGenerationReceiptV1["outcome"], diagnosticCodes: readonly NativeBlockGenerationReceiptV1["diagnosticCodes"][number][], outputs: NativeBlockGenerationReceiptV1["outputs"], cleanupOutcome: "completed" | "failed"): NativeBlockGenerationReceiptV1 {
  return {
    kind: "native-block-generation-receipt", schemaVersion: 1, id: `${input.generationRequest.id}.receipt`,
    generationRequestRef: "generation-request.json", generationRequestHash: input.generationRequestHash as Sha256HashV1,
    routerTaskPayloadHash: input.routerTaskPayloadHash as Sha256HashV1,
    taskInstructionHash: input.generationRequest.taskInstructionHash ?? (`sha256:${"0".repeat(64)}` as Sha256HashV1),
    builderSkillHash: input.generationRequest.builderSkillHash ?? (`sha256:${"0".repeat(64)}` as Sha256HashV1),
    workspaceContextManifestHash: input.generationRequest.workspaceContextManifestHash ?? (`sha256:${"0".repeat(64)}` as Sha256HashV1),
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
    if (info.isSymbolicLink() || !info.isFile() || info.size === 0) throw new TypeError(info.size === 0 ? "output-empty" : "output-missing");
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
  try {
    const result = await ports.process.run({ executablePath: input.routerExecutablePath, arguments: input.routerArguments, cwd: input.runDirectoryPath ?? path.dirname(path.dirname(path.dirname(input.stagingDirectoryPath))) });
    if (result.exitCode !== 0) {
      outcome = "rejected";
      diagnostics = ["task-rejected"];
    } else {
      try {
        outputs = await inspectOutputs(input);
        const selfCheck = await ports.selfCheck(input.stagingDirectoryPath);
        if (!selfCheck.ok) {
          outcome = "rejected"; diagnostics = ["self-check-failed"];
        } else {
          const cleanup = await ports.cleanup();
          if (cleanup.outcome !== "completed") {
            outcome = "tool-error"; diagnostics = ["cleanup-failed"];
          } else {
            await mkdir(path.dirname(input.sourceDirectoryPath), { recursive: true, mode: 0o700 });
            await rename(input.stagingDirectoryPath, input.sourceDirectoryPath);
            outcome = "completed"; diagnostics = [];
          }
        }
      } catch (error) {
        outcome = "rejected";
        diagnostics = [String(error).includes("unexpected") ? "output-unexpected" : String(error).includes("empty") ? "output-missing" : "output-missing"];
        outputs = [];
      }
    }
  } catch {
    const reconciliation = await ports.reconcile(input.routerRequestId, input.generationRequestHash as Sha256HashV1);
    if (reconciliation.outcome !== "missing" && (reconciliation.requestId !== input.routerRequestId || reconciliation.requestHash !== input.generationRequestHash)) {
      diagnostics = ["duplicate-request-mismatch"];
    } else {
      outcome = "unknown"; diagnostics = ["creation-outcome-unknown"];
    }
  }
  if (outcome !== "completed") {
    await rm(input.stagingDirectoryPath, { recursive: true, force: true });
  }
  const cleanup = diagnostics.includes("cleanup-failed") ? "failed" : "completed";
  return Object.freeze({ receipt: receipt(input, outcome, diagnostics, outcome === "completed" ? outputs : [], cleanup), ...(outcome === "completed" ? { sourceDirectoryPath: input.sourceDirectoryPath } : {}) });
}
