import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  lstat,
  link,
  mkdir,
  open,
  readFile,
  realpath,
  rm,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { parseNativeSourceTypecheckDiagnostics } from "../native-scene/source-typecheck.js";
import { verifyWorldPackageDirectoryV1 } from "@whitebox-world/world-package";
import { readWorldPackageDirectoryV1 } from "../lib/file-world-package.js";
import { readHostCheckpointV1, writeHostCheckpointV1 } from "./host-checkpoint.js";

import {
  sha256CanonicalJson,
  sha256Bytes,
  stringifyCanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  hashNativeBlockGenerationReceiptV1,
  hashNativeBlockGenerationRequestV1,
  hashSceneAuthoringAttemptV1,
  parseNativeBlockGenerationReceiptV1,
  parseNativeBlockGenerationRequestV1,
  parseSceneAuthoringAttemptV1,
  assertNativeBlockGenerationReceiptMatchesRequestV1,
  assertNativeBlockGenerationRequestMatchesAttemptV1,
  hashSceneAuthoringAttemptResultV1,
} from "@whitebox-world/scene-authoring-contracts";
import { parseWorldReconstructionCaseArtifactRefV1 } from
  "@whitebox-world/world-identity";
import {
  BABYLON_NATIVE_BLOCK_PROFILE_REF_V1,
  parseFormalColliderOverlayObservationV1,
  formalWorldCaptureIntentCanonicalBytesV1,
  hashFormalWorldCaptureIntentV1,
  parseFormalOpeningObservationV1,
  parseFormalSemanticViewObservationSetV1,
  parseFormalScriptedTraversalObservationV1,
  parseFormalSpawnSupportObservationV1,
  hashFormalWorldCaptureReceiptV1,
  parseFormalWorldCaptureReceiptV1,
  parseFormalWorldCaptureIntentV1,
  type FormalWorldCaptureIntentV1,
} from "@whitebox-world/runtime-contracts";
import { parseNativeBlockAuthoringManifestV1 } from
  "@whitebox-world/native-babylon-block-profile";
import {
  hashWorldReconstructionEvaluationResultV1,
  type WorldReconstructionAttemptIndexV1,
  type WorldReconstructionCaseV1,
  type WorldReconstructionEvaluationProfileV1,
} from "@whitebox-world/validation";
import { isEqual, isNil } from "lodash-es";

import {
  createCodexTaskProcessPortV1,
  reconcileCodexTaskCreationV1,
} from "./codex-task-process-port.js";
import {
  deriveNativeBlockGenerationBootstrapV1,
  prepareNativeBlockGenerationTaskV1,
  resolveWorldReconstructionFrozenOwnerIdentitiesV1,
  type PrepareNativeBlockGenerationTaskV1Input,
  type PreparedNativeBlockGenerationTaskV1,
  type WorldReconstructionFrozenOwnerIdentitiesV1,
} from "./generation-request.js";
import {
  runNativeBlockGenerationV1,
  type NativeBlockGenerationRunPortsV1,
} from "./generation-runner.js";
import {
  NativeBlockPackageErrorV1,
  packageNativeBlockAttemptV1,
  type PackagedNativeBlockAttemptV1,
} from "./native-package.js";
import {
  FORMAL_WORLD_CAPTURE_REQUEST_FILE_NAME_V1,
  materializeFormalWorldCaptureRequestV1,
} from "./formal-capture-request.js";
import {
  captureProductionHostedWorldPackageV1,
  FormalCaptureCommandClosedErrorV1,
  type FormalCaptureCommandCleanupOutcomesV1,
} from "./formal-capture.js";
import { evaluateNativeBlockAttemptV1 } from "./evaluate.js";
import { createOpeningCompositionRepairDiagnosticsV1 } from
  "./opening-composition-host-gate.js";
import type {
  WorldReconstructionCleanupOutcomesV1,
  WorldReconstructionCleanupOwnerOutcomeV1,
  WorldReconstructionExecutionPurposeV1,
} from "./run-journal.js";
import { parseWorldReconstructionExecutionPurposeV1 } from "./run-journal.js";
import {
  type WorldReconstructionGenerateOutcomeV1,
  type WorldReconstructionGeneratePortResultV1,
  type WorldReconstructionPackagePortResultV1,
  type WorldReconstructionRunPortsV1,
} from "./run.js";

const NATIVE_SCENE_API_REF = "worldkit://native-scene-api/babylon@1";
const WORLD_BUILD_IDENTITY_REF = "world-package://world-build-identity.json";
const WORLD_PACKAGE_BUILD_RECEIPT_REF =
  "world-package://world-package-build-receipt.json";

type FrozenGenerationInputV1 = Omit<
  PrepareNativeBlockGenerationTaskV1Input,
  | "case"
  | "profile"
  | "runId"
  | "attemptIndex"
  | "backend"
  | "repairInstruction"
>;

export interface ProductionWorldReconstructionRunPortsInputV1 {
  readonly hostRecoveryIndex?: number;
  readonly executionPurpose: WorldReconstructionExecutionPurposeV1;
  readonly repositoryRoot: string;
  readonly casePath: string;
  readonly caseRef: string;
  readonly evaluationProfilePath: string;
  readonly reconstructionCase: WorldReconstructionCaseV1;
  readonly evaluationProfile: WorldReconstructionEvaluationProfileV1;
  readonly generationInput: FrozenGenerationInputV1;
  readonly formalCaptureIntent: FormalWorldCaptureIntentV1;
}

interface BuilderSelfCheckResult {
  readonly ok: boolean;
  readonly diagnosticCodes: readonly string[];
  readonly typecheckDiagnostics?: readonly import("../native-scene/source-typecheck.js").NativeSourceTypecheckDiagnostic[];
}

export interface ProductionWorldReconstructionRunPortOwnersV1 {
  readonly prepareGeneration: typeof prepareNativeBlockGenerationTaskV1;
  readonly runGeneration: typeof runNativeBlockGenerationV1;
  readonly createProcessPort: typeof createCodexTaskProcessPortV1;
  readonly reconcileGeneration: typeof reconcileCodexTaskCreationV1;
  readonly runSelfCheck: (
    checkerPath: string,
    workspacePath: string,
    sceneBriefPath: string,
  ) => Promise<BuilderSelfCheckResult>;
  readonly packageAttempt: typeof packageNativeBlockAttemptV1;
  readonly materializeCaptureRequest:
    typeof materializeFormalWorldCaptureRequestV1;
  readonly capturePackage: typeof captureProductionHostedWorldPackageV1;
  readonly evaluateAttempt: typeof evaluateNativeBlockAttemptV1;
  readonly resolveFrozenOwnerIdentities:
    typeof resolveWorldReconstructionFrozenOwnerIdentitiesV1;
}

interface AttemptCheckpointV1 {
  prepared?: PreparedNativeBlockGenerationTaskV1;
  frozenOwnerIdentities?: WorldReconstructionFrozenOwnerIdentitiesV1;
  generated?: WorldReconstructionGeneratePortResultV1;
  packaged?: Extract<WorldReconstructionPackagePortResultV1, {
    readonly outcome: "completed";
  }>;
  verifiedWorldPackage?: PackagedNativeBlockAttemptV1["verifiedWorldPackage"];
  captureDirectoryPath?: string;
}

type CleanupKeyV1 = keyof WorldReconstructionCleanupOutcomesV1;

function defaultOwners(): ProductionWorldReconstructionRunPortOwnersV1 {
  return Object.freeze({
    prepareGeneration: prepareNativeBlockGenerationTaskV1,
    runGeneration: runNativeBlockGenerationV1,
    createProcessPort: createCodexTaskProcessPortV1,
    reconcileGeneration: reconcileCodexTaskCreationV1,
    runSelfCheck: runBuilderSelfCheckV1,
    packageAttempt: packageNativeBlockAttemptV1,
    materializeCaptureRequest: materializeFormalWorldCaptureRequestV1,
    capturePackage: captureProductionHostedWorldPackageV1,
    evaluateAttempt: evaluateNativeBlockAttemptV1,
    resolveFrozenOwnerIdentities:
      resolveWorldReconstructionFrozenOwnerIdentitiesV1,
  });
}

function diagnosticCodes(error: unknown, fallback: string): readonly string[] {
  if (error instanceof NativeBlockPackageErrorV1) {
    return error.diagnostics;
  }
  const codes: string[] = [];
  const visited = new Set<Error>();
  const collect = (candidate: unknown): void => {
    if (!(candidate instanceof Error) || visited.has(candidate)) return;
    visited.add(candidate);
    if (
      "code" in candidate &&
      typeof candidate.code === "string"
    ) codes.push(candidate.code);
    codes.push(...(candidate.message.match(/[A-Z][A-Z0-9_]{4,}/g) ?? []));
    collect(candidate.cause);
  };
  collect(error);
  return Object.freeze(codes.length === 0
    ? [fallback]
    : [...new Set(codes)].sort());
}

function generationOutcome(
  receipt: Awaited<ReturnType<typeof runNativeBlockGenerationV1>>["receipt"],
): WorldReconstructionGenerateOutcomeV1 {
  if (receipt.outcome === "completed") return "completed";
  if (receipt.outcome === "unknown") return "unknown";
  if (
    receipt.outcome === "rejected" &&
    receipt.diagnosticCodes.includes("output-missing")
  ) return "no-output";
  if (receipt.outcome === "rejected") return "rejected";
  return "failed";
}

function canonicalCaseArtifactRoot(caseRef: string, caseId: string): string {
  let parsedCaseRef: string;
  try {
    parsedCaseRef = parseWorldReconstructionCaseArtifactRefV1(caseRef);
  } catch {
    throw new TypeError("WORLD_RECONSTRUCTION_CASE_REF_INVALID");
  }
  if (
    parsedCaseRef !==
      `artifact://world-reconstruction-case/${caseId}/case.json`
  ) throw new TypeError("WORLD_RECONSTRUCTION_CASE_REF_INVALID");
  return parsedCaseRef.slice(0, -"/case.json".length);
}

function caseArtifactRefForPath(
  caseArtifactRoot: string,
  caseRootPath: string,
  runDirectoryPath: string,
  artifactPath: string,
): string {
  const relativeToRun = path.relative(runDirectoryPath, artifactPath);
  if (
    relativeToRun.length === 0 ||
    relativeToRun.startsWith("..") ||
    path.isAbsolute(relativeToRun)
  ) throw new TypeError("WORLD_RECONSTRUCTION_ARTIFACT_PATH_INVALID");
  const relativePath = path.relative(caseRootPath, artifactPath)
    .split(path.sep)
    .join("/");
  if (
    relativePath.length === 0 ||
    relativePath.startsWith("../") ||
    path.posix.isAbsolute(relativePath)
  ) throw new TypeError("WORLD_RECONSTRUCTION_ARTIFACT_PATH_INVALID");
  return `${caseArtifactRoot}/${relativePath}`;
}

async function publishCanonicalJsonImmutable(
  outputPath: string,
  value: unknown,
): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  const outputBytes = new TextEncoder().encode(
    `${stringifyCanonicalJson(value)}\n`,
  );
  const temporaryPath = path.join(
    path.dirname(outputPath),
    `.${path.basename(outputPath)}.${randomUUID()}.tmp`,
  );
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(outputBytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    try {
      await link(temporaryPath, outputPath);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "EEXIST"
      ) throw error;
      const existingMetadata = await lstat(outputPath);
      if (
        !existingMetadata.isFile() ||
        existingMetadata.isSymbolicLink() ||
        await realpath(outputPath) !== outputPath
      ) throw new Error("WORLD_RECONSTRUCTION_IMMUTABLE_ARTIFACT_MISMATCH");
      const existingBytes = new Uint8Array(await readFile(outputPath));
      if (!isEqual(existingBytes, outputBytes)) {
        throw new Error("WORLD_RECONSTRUCTION_IMMUTABLE_ARTIFACT_MISMATCH");
      }
    }
    await unlink(temporaryPath);
    const parent = await open(path.dirname(outputPath), "r");
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function verifyCaseBoundFormalCaptureIntentV1(
  input: ProductionWorldReconstructionRunPortsInputV1,
): Promise<FormalWorldCaptureIntentV1> {
  const caseRootPath = path.dirname(input.casePath);
  const intentPath = path.resolve(
    caseRootPath,
    input.reconstructionCase.formalCaptureIntentRef,
  );
  if (
    intentPath !== path.join(
      caseRootPath,
      "inputs",
      "formal-world-capture-intent.json",
    )
  ) throw new TypeError("WORLD_RECONSTRUCTION_FORMAL_CAPTURE_INTENT_INVALID");
  const metadata = await lstat(intentPath);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    await realpath(intentPath) !== intentPath
  ) throw new TypeError("WORLD_RECONSTRUCTION_FORMAL_CAPTURE_INTENT_INVALID");
  const storedBytes = new Uint8Array(await readFile(intentPath));
  let parsed: FormalWorldCaptureIntentV1;
  try {
    parsed = parseFormalWorldCaptureIntentV1(JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(storedBytes),
    ));
  } catch {
    throw new TypeError("WORLD_RECONSTRUCTION_FORMAL_CAPTURE_INTENT_INVALID");
  }
  if (
    !isEqual(storedBytes, formalWorldCaptureIntentCanonicalBytesV1(parsed)) ||
    hashFormalWorldCaptureIntentV1(parsed) !==
      input.reconstructionCase.formalCaptureIntentHash ||
    parsed.id !== `${input.reconstructionCase.id}.formal-world-capture-intent` ||
    !isEqual(parsed, input.formalCaptureIntent)
  ) throw new TypeError("WORLD_RECONSTRUCTION_FORMAL_CAPTURE_INTENT_INVALID");
  const bindings = parsed.semanticCaptureTargetBindings;
  const openingReferenceTargetRefs = new Set(input.reconstructionCase.expected.semanticSilhouetteTargets
    .filter((target) => target.viewRequirements.some((requirement) => requirement.viewId === "opening" &&
      requirement.mode === "reference-projection-required")).map((target) => target.acceptanceTargetRef));
  const checkpointIds = parsed.checkpointSpatialCriteria
    .map(({ checkpointId }) => checkpointId)
    .slice()
    .sort();
  const expectedCheckpointIds = input.reconstructionCase.expected
    .criticalTraversalChecks
    .flatMap(({ checkpointIds: ids }) => ids)
    .slice()
    .sort();
  if (
    !isEqual(
      bindings.map(({ acceptanceTargetRef }) => acceptanceTargetRef),
      input.reconstructionCase.expected.semanticSilhouetteTargets
        .map(({ acceptanceTargetRef }) => acceptanceTargetRef),
    ) ||
    !isEqual(
      bindings.filter(({ acceptanceTargetRef }) => openingReferenceTargetRefs.has(acceptanceTargetRef))
        .map(({ compositionTargetRef }) => compositionTargetRef).sort(),
      [...input.reconstructionCase.expected.openingComposition.targetRefs].sort(),
    ) ||
    !isEqual(
      bindings.map(({ topologyNodeId }) => topologyNodeId).sort(),
      [...input.reconstructionCase.expected.topology.nodeIds].sort(),
    ) ||
    !isEqual(
      [...new Set(bindings.map(({ semanticLayerId }) => semanticLayerId))].sort(),
      [...input.reconstructionCase.expected.topology.layerIds].sort(),
    ) ||
    !isEqual(
      parsed.topologyRelations.map(({ fromNodeId, relation, toNodeId }) => ({
        fromNodeId,
        relation,
        toNodeId,
      })),
      input.reconstructionCase.expected.topology.relations,
    ) ||
    !isEqual(checkpointIds, expectedCheckpointIds)
  ) throw new TypeError("WORLD_RECONSTRUCTION_FORMAL_CAPTURE_INTENT_INVALID");
  return parsed;
}

async function readBytesNoFollow(filePath: string): Promise<Uint8Array> {
  const info = await lstat(filePath);
  if (!info.isFile() || info.isSymbolicLink() || await realpath(filePath) !== filePath) {
    throw new TypeError(`WORLD_RECONSTRUCTION_INPUT_INVALID: ${filePath}`);
  }
  return new Uint8Array(await readFile(filePath));
}

async function readJsonNoFollow(filePath: string): Promise<unknown> {
  return JSON.parse(Buffer.from(await readBytesNoFollow(filePath)).toString("utf8"));
}

export function runBuilderSelfCheckV1(
  checkerPath: string,
  workspacePath: string,
  sceneBriefPath: string,
): Promise<BuilderSelfCheckResult> {
  return new Promise((resolvePromise) => {
    const attemptDirectoryPath = path.dirname(workspacePath);
    const child = spawn(
      process.execPath,
      [
        checkerPath,
        "--workspace",
        workspacePath,
        "--case",
        path.join(attemptDirectoryPath, ".task/context/case.json"),
        "--scene-brief",
        sceneBriefPath,
        "--visual-identity-palette",
        path.join(
          attemptDirectoryPath,
          "inputs/visual-identity-palette.json",
        ),
      ],
      { shell: false, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    // Drain without logging untrusted stderr; otherwise a full pipe can block
    // even a checker that eventually writes a valid JSON report.
    child.stderr.resume();
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.once("error", () => {
      resolvePromise({ ok: false, diagnosticCodes: ["self-check-failed"] });
    });
    child.once("close", (exitCode) => {
      try {
        const report = JSON.parse(stdout || "{}");
        const codes = Array.isArray(report.diagnosticCodes)
          ? report.diagnosticCodes.filter((code: unknown): code is string =>
            typeof code === "string")
          : ["self-check-failed"];
        resolvePromise(Object.freeze({
          ok: exitCode === 0 && report.ok === true,
          diagnosticCodes: Object.freeze(codes),
          ...(codes.includes("WORLDKIT_NATIVE_SCENE_TYPECHECK_FAILED") ? {
            typecheckDiagnostics: parseNativeSourceTypecheckDiagnostics(report.typecheckDiagnostics),
          } : {}),
        }));
      } catch {
        resolvePromise({ ok: false, diagnosticCodes: ["self-check-failed"] });
      }
    });
  });
}

export async function createProductionWorldReconstructionRunPortsV1(
  input: ProductionWorldReconstructionRunPortsInputV1,
  owners: ProductionWorldReconstructionRunPortOwnersV1 = defaultOwners(),
): Promise<WorldReconstructionRunPortsV1> {
  const executionPurpose = parseWorldReconstructionExecutionPurposeV1(input.executionPurpose);
  const caseArtifactRoot = canonicalCaseArtifactRoot(
    input.caseRef,
    input.reconstructionCase.id,
  );
  const caseRootPath = path.dirname(input.casePath);
  const runRelativePath = path.relative(
    caseRootPath,
    input.generationInput.runDirectoryPath,
  );
  if (
    !runRelativePath.startsWith(`runs${path.sep}`) ||
    runRelativePath.split(path.sep).length !== 2 ||
    path.isAbsolute(runRelativePath)
  ) throw new TypeError("WORLD_RECONSTRUCTION_RUN_DIRECTORY_INVALID");
  const formalCaptureIntent = await verifyCaseBoundFormalCaptureIntentV1(input);
  const checkpoints = new Map<WorldReconstructionAttemptIndexV1, AttemptCheckpointV1>();
  if (input.hostRecoveryIndex !== undefined &&
    (!Number.isSafeInteger(input.hostRecoveryIndex) || input.hostRecoveryIndex < 1 || executionPurpose !== "production")) {
    throw new TypeError("WORLD_RECONSTRUCTION_HOST_RECOVERY_INVALID");
  }
  const attemptPath = (index: WorldReconstructionAttemptIndexV1) =>
    path.join(input.generationInput.runDirectoryPath, "attempts", String(index));
  const hostOutputPath = (index: WorldReconstructionAttemptIndexV1) => input.hostRecoveryIndex === undefined
    ? attemptPath(index) : path.join(attemptPath(index), "host-recoveries", String(input.hostRecoveryIndex));
  const ensureHostOutputPath = async (index: WorldReconstructionAttemptIndexV1) => {
    const root = hostOutputPath(index);
    await mkdir(root, { recursive: true, mode: 0o700 });
    if (await realpath(root) !== root || !(await lstat(root)).isDirectory()) {
      throw new Error("WORLD_RECONSTRUCTION_HOST_CHECKPOINT_INVALID");
    }
  };
  const cleanupState: Record<CleanupKeyV1, WorldReconstructionCleanupOwnerOutcomeV1> = {
    providerTask: "pending",
    candidate: "pending",
    hostedBrowserSession: "pending",
    viteServer: "pending",
    temporaryDirectories: "pending",
    outputPromotion: "pending",
  };
  const setCleanup = (
    keys: readonly CleanupKeyV1[],
    outcome: WorldReconstructionCleanupOwnerOutcomeV1,
  ) => keys.forEach((key) => {
    cleanupState[key] = outcome;
  });
  const applyCaptureCleanup = (
    outcomes: FormalCaptureCommandCleanupOutcomesV1,
  ): void => {
    cleanupState.hostedBrowserSession =
      outcomes.hostedBrowserSession === "failed" ? "failed" : "completed";
    cleanupState.viteServer = outcomes.viteServer === "failed"
      ? "failed"
      : "completed";
  };
  const checkpoint = (
    attemptIndex: WorldReconstructionAttemptIndexV1,
  ): AttemptCheckpointV1 => {
    const existing = checkpoints.get(attemptIndex);
    if (existing !== undefined) return existing;
    const created: AttemptCheckpointV1 = {};
    checkpoints.set(attemptIndex, created);
    return created;
  };

  const ports: WorldReconstructionRunPortsV1 = {
    generate: async (stageInput) => {
      const selfCheckDiagnosticCodes = new Set<string>();
      const state = checkpoint(stageInput.attemptIndex);
      if (state.prepared !== undefined || state.generated !== undefined) {
        throw new Error("WORLD_RECONSTRUCTION_DUPLICATE_REQUEST_MISMATCH");
      }
      const prepared = await owners.prepareGeneration({
        ...input.generationInput,
        case: input.reconstructionCase,
        profile: input.evaluationProfile,
        runId: stageInput.runId,
        attemptIndex: stageInput.attemptIndex,
        backend: stageInput.backend,
        ...(stageInput.repairInstruction === undefined
          ? {}
          : { repairInstruction: stageInput.repairInstruction }),
      });
      state.prepared = prepared;
      state.frozenOwnerIdentities = prepared.frozenOwnerIdentities;
      setCleanup(["providerTask", "temporaryDirectories"], "failed");
      if (
        prepared.routerRequestId !== stageInput.requestId ||
        !isEqual(prepared.frozenOwnerIdentities, stageInput.frozenOwnerIdentities)
      ) {
        throw new Error("WORLD_RECONSTRUCTION_DUPLICATE_REQUEST_MISMATCH");
      }
      const generationRunPorts: NativeBlockGenerationRunPortsV1 = {
        process: owners.createProcessPort(),
        selfCheck: async (workspacePath) => {
          const result = await owners.runSelfCheck(
            path.join(prepared.taskWorkspacePath, "inputs/builder-skill/scripts/self-check.mjs"),
            workspacePath,
            path.join(prepared.taskWorkspacePath, "inputs", prepared.generationRequest.sceneBriefRef),
          );
          if (!result.ok && result.typecheckDiagnostics?.length) {
            selfCheckDiagnosticCodes.add("WORLDKIT_NATIVE_SCENE_TYPECHECK_FAILED");
          }
          await publishCanonicalJsonImmutable(
            path.join(path.dirname(workspacePath), "builder-self-check.host.json"),
            {
              kind: "native-block-builder-host-self-check",
              schemaVersion: 1,
              generationRequestHash: prepared.generationRequestHash,
              builderSkillHash: prepared.generationRequest.builderSkillHash,
              routerRequestId: prepared.routerRequestId,
              ok: result.ok,
              diagnosticCodes: [...new Set(result.diagnosticCodes)].sort(),
              ...(result.typecheckDiagnostics === undefined ? {} : { typecheckDiagnostics: result.typecheckDiagnostics }),
            },
          );
          return result;
        },
        reconcile: async (requestId, requestHash) => {
          const reconciliation = await owners.reconcileGeneration({
            executablePath: prepared.routerExecutablePath,
            backend: prepared.backend,
            requestId,
            cwd: prepared.runDirectoryPath,
          });
          return reconciliation.outcome === "missing"
            ? reconciliation
            : Object.freeze({
              outcome: "unknown" as const,
              requestId,
              requestHash,
            });
        },
        cleanup: async () => {
          try {
            await rm(prepared.taskWorkspacePath, { recursive: true, force: true });
            return Object.freeze({ outcome: "completed" as const });
          } catch {
            return Object.freeze({ outcome: "failed" as const });
          }
        },
      };
      const generation = await owners.runGeneration(prepared, generationRunPorts);
      const receiptPath = path.join(
        input.generationInput.runDirectoryPath,
        "attempts",
        String(stageInput.attemptIndex),
        "generation-receipt.json",
      );
      await publishCanonicalJsonImmutable(receiptPath, generation.receipt);
      const outcome = generationOutcome(generation.receipt);
      setCleanup(
        ["providerTask", "temporaryDirectories"],
        generation.receipt.cleanupOutcome === "completed" ? "completed" : "failed",
      );
      cleanupState.outputPromotion = generation.receipt.cleanupOutcome ===
          "completed"
        ? "completed"
        : "failed";
      const result = Object.freeze({
        outcome,
        requestId: prepared.routerRequestId,
        requestHash: prepared.routerTaskPayloadHash,
        generationRequestRef: caseArtifactRefForPath(
          caseArtifactRoot,
          caseRootPath,
          input.generationInput.runDirectoryPath,
          path.join(
            input.generationInput.runDirectoryPath,
            "attempts",
            String(stageInput.attemptIndex),
            "generation-request.json",
          ),
        ),
        generationRequestHash: prepared.generationRequestHash,
        generationReceiptRef: caseArtifactRefForPath(
          caseArtifactRoot,
          caseRootPath,
          input.generationInput.runDirectoryPath,
          receiptPath,
        ),
        generationReceiptHash: hashNativeBlockGenerationReceiptV1(
          generation.receipt,
        ),
        sceneAuthoringAttemptRef: caseArtifactRefForPath(
          caseArtifactRoot,
          caseRootPath,
          input.generationInput.runDirectoryPath,
          path.join(
            input.generationInput.runDirectoryPath,
            "attempts",
            String(stageInput.attemptIndex),
            "attempt.json",
          ),
        ),
        sceneAuthoringAttemptHash: prepared.attemptHash,
        diagnosticCodes: Object.freeze([...new Set([...generation.receipt.diagnosticCodes,
          ...(outcome === "completed" ? [] : selfCheckDiagnosticCodes)])].sort()),
      });
      state.generated = result;
      return result;
    },

    package: async (stageInput) => {
      const state = checkpoint(stageInput.attemptIndex);
      if (
        state.frozenOwnerIdentities === undefined ||
        state.generated === undefined ||
        state.packaged !== undefined ||
        !isEqual(stageInput.generate, state.generated) ||
        !isEqual(stageInput.frozenOwnerIdentities, state.frozenOwnerIdentities)
      ) throw new Error("WORLD_RECONSTRUCTION_PACKAGE_STAGE_INVALID");
      cleanupState.candidate = "failed";
      const hostOutputRoot = hostOutputPath(stageInput.attemptIndex);
      const outputDirectoryPath = path.join(hostOutputRoot, "world-package");
      try {
        const packaged = await owners.packageAttempt({
          repositoryRoot: input.repositoryRoot,
          attemptDirectoryPath: path.join(
            input.generationInput.runDirectoryPath,
            "attempts",
            String(stageInput.attemptIndex),
          ),
          casePath: input.casePath,
          outputDirectoryPath,
        });
        cleanupState.candidate = "completed";
        cleanupState.outputPromotion = "completed";
        const completed = Object.freeze({
          outcome: "completed" as const,
          sceneAuthoringAttemptResultRef: caseArtifactRefForPath(
            caseArtifactRoot,
            caseRootPath,
            input.generationInput.runDirectoryPath,
            path.join(hostOutputRoot, "attempt-result.json"),
          ),
          sceneAuthoringAttemptResultHash:
            hashSceneAuthoringAttemptResultV1(
              packaged.sceneAuthoringAttemptResult,
            ),
          authoredSourceRef:
            packaged.sceneAuthoringAttemptResult.authoredSourceRef,
          authoredSourceHash:
            packaged.sceneAuthoringAttemptResult.authoredSourceHash,
          worldPackageRef: packaged.worldPackageRef,
          worldPackageRootHash: packaged.worldPackageRootHash,
          worldPackagePath: packaged.outputDirectoryPath,
          worldPackageBuildReceiptRef: WORLD_PACKAGE_BUILD_RECEIPT_REF,
          worldPackageBuildReceiptHash: packaged.buildReceiptHash,
          worldBuildIdentityRef: WORLD_BUILD_IDENTITY_REF,
          worldBuildIdentityHash: packaged.worldBuildIdentityHash,
          groundAnalysisReportRef: caseArtifactRefForPath(
            caseArtifactRoot,
            caseRootPath,
            input.generationInput.runDirectoryPath,
            packaged.groundAnalysisReportPath,
          ),
          groundAnalysisReportHash: packaged.groundAnalysisReportHash,
          diagnosticCodes: Object.freeze([...packaged.diagnostics]),
        });
        state.verifiedWorldPackage = packaged.verifiedWorldPackage;
        state.packaged = completed;
        return completed;
      } catch (error) {
        const packageError = error instanceof NativeBlockPackageErrorV1
          ? error
          : undefined;
        const groundAnalysisRejection = packageError?.groundAnalysisRejection;
        const nativeCheckRejection = packageError?.nativeCheckRejection;
        if (!isNil(packageError) && !isNil(nativeCheckRejection)) {
          cleanupState.candidate = "completed";
          cleanupState.outputPromotion = "completed";
          const attemptDirectoryPath = hostOutputRoot;
          return Object.freeze({
            outcome: "native-check-rejected" as const,
            sceneAuthoringAttemptResultRef: caseArtifactRefForPath(
              caseArtifactRoot,
              caseRootPath,
              input.generationInput.runDirectoryPath,
              path.join(attemptDirectoryPath, "attempt-result.json"),
            ),
            sceneAuthoringAttemptResultHash:
              hashSceneAuthoringAttemptResultV1(
                nativeCheckRejection.sceneAuthoringAttemptResult,
              ),
            authoredSourceRef:
              nativeCheckRejection.sceneAuthoringAttemptResult.authoredSourceRef,
            authoredSourceHash:
              nativeCheckRejection.sceneAuthoringAttemptResult.authoredSourceHash,
            nativeCheckResultRef: caseArtifactRefForPath(
              caseArtifactRoot,
              caseRootPath,
              input.generationInput.runDirectoryPath,
              nativeCheckRejection.nativeCheckResultPath,
            ),
            nativeCheckResultHash:
              nativeCheckRejection.nativeCheckResultHash,
            repairDiagnostics: nativeCheckRejection.repairDiagnostics,
            diagnosticCodes: Object.freeze([...packageError.diagnostics]),
          });
        }
        if (!isNil(packageError) && !isNil(groundAnalysisRejection)) {
          cleanupState.candidate = "completed";
          cleanupState.outputPromotion = "completed";
          const attemptDirectoryPath = hostOutputRoot;
          return Object.freeze({
            outcome: "ground-analysis-rejected" as const,
            sceneAuthoringAttemptResultRef: caseArtifactRefForPath(
              caseArtifactRoot,
              caseRootPath,
              input.generationInput.runDirectoryPath,
              path.join(attemptDirectoryPath, "attempt-result.json"),
            ),
            sceneAuthoringAttemptResultHash:
              hashSceneAuthoringAttemptResultV1(
                groundAnalysisRejection.sceneAuthoringAttemptResult,
              ),
            authoredSourceRef:
              groundAnalysisRejection.sceneAuthoringAttemptResult
                .authoredSourceRef,
            authoredSourceHash:
              groundAnalysisRejection.sceneAuthoringAttemptResult
                .authoredSourceHash,
            groundAnalysisReportRef: caseArtifactRefForPath(
              caseArtifactRoot,
              caseRootPath,
              input.generationInput.runDirectoryPath,
              groundAnalysisRejection.groundAnalysisReportPath,
            ),
            groundAnalysisReportHash:
              groundAnalysisRejection.groundAnalysisReportHash,
            repairDiagnostics:
              groundAnalysisRejection.repairDiagnostics,
            diagnosticCodes: Object.freeze([...packageError.diagnostics]),
          });
        }
        cleanupState.candidate = "failed";
        cleanupState.outputPromotion = "failed";
        const codes = diagnosticCodes(
          error,
          "WORLD_RECONSTRUCTION_PACKAGE_FAILED",
        );
        return Object.freeze({
          outcome: "package-failed" as const,
          diagnosticCodes: codes,
        });
      }
    },

    capture: async (stageInput) => {
      const state = checkpoint(stageInput.attemptIndex);
      if (
        state.packaged === undefined ||
        state.verifiedWorldPackage === undefined ||
        !isEqual(state.packaged, stageInput.packaged) ||
        state.captureDirectoryPath !== undefined
      ) throw new Error("WORLD_RECONSTRUCTION_CAPTURE_STAGE_INVALID");
      const attemptDirectoryPath = path.join(
        input.generationInput.runDirectoryPath,
        "attempts",
        String(stageInput.attemptIndex),
      );
      const requestPath = path.join(
        path.dirname(state.packaged.worldPackagePath),
        FORMAL_WORLD_CAPTURE_REQUEST_FILE_NAME_V1,
      );
      const captureDirectoryPath = path.join(hostOutputPath(stageInput.attemptIndex), "capture");
      const rejectedCaptureDirectoryPath = path.join(
        hostOutputPath(stageInput.attemptIndex),
        "rejected-capture",
      );
      let captureOwnerStarted = false;
      try {
        const materialized = await owners.materializeCaptureRequest({
          outputMode: input.hostRecoveryIndex === undefined ? "create" : "verify-or-create",
          casePath: input.casePath,
          evaluationProfilePath: input.evaluationProfilePath,
          sceneAuthoringAttemptPath: path.join(attemptDirectoryPath, "attempt.json"),
          packageDirectoryPath: state.packaged.worldPackagePath,
          outputPath: requestPath,
          formalCaptureIntent,
        });
        captureOwnerStarted = true;
        const captured = await owners.capturePackage({
          packageDirectoryPath: state.packaged.worldPackagePath,
          outputPath: path.join(captureDirectoryPath, "opening.png"),
          triviewOutputPath: captureDirectoryPath,
          rejectedOutputDirectoryPath: rejectedCaptureDirectoryPath,
          openingGate: {
            executionPurpose,
            reconstructionCase: input.reconstructionCase,
            evaluationProfile: input.evaluationProfile,
          },
        });
        applyCaptureCleanup(captured.cleanupOutcomes);
        cleanupState.outputPromotion = "completed";
        if (
          captured.formalRequestHash !== materialized.formalRequestHash ||
          captured.worldPackageRootHash !== state.packaged.worldPackageRootHash
        ) {
          throw new Error("WORLD_RECONSTRUCTION_CAPTURE_IDENTITY_MISMATCH");
        }
        state.captureDirectoryPath = captureDirectoryPath;
        const captureReceiptPath = path.join(
          captureDirectoryPath,
          "formal-world-capture-receipt.json",
        );
        return Object.freeze({
          outcome: "completed" as const,
          captureReceiptRef: caseArtifactRefForPath(
            caseArtifactRoot,
            caseRootPath,
            input.generationInput.runDirectoryPath,
            captureReceiptPath,
          ),
          captureReceiptHash: captured.formalCaptureReceiptHash,
          captureReceiptPath,
          cameraRollbackOutcome: "completed" as const,
          diagnosticCodes: Object.freeze([]),
        });
      } catch (error) {
        if (error instanceof FormalCaptureCommandClosedErrorV1) {
          applyCaptureCleanup(error.cleanupOutcomes);
          cleanupState.outputPromotion = error.stage === "publication"
            ? "failed"
            : "completed";
          if (!isNil(error.rejectedEvidence)) {
            const rejectedEvidence = error.rejectedEvidence;
            if (
              rejectedEvidence.outputDirectoryPath !==
                rejectedCaptureDirectoryPath ||
              rejectedEvidence.openingOutputPath !== path.join(
                rejectedCaptureDirectoryPath,
                "opening.png",
              ) ||
              rejectedEvidence.openingGateResultPath !== path.join(
                rejectedCaptureDirectoryPath,
                "opening-composition-gate-result.json",
              )
            ) {
              return Object.freeze({
                outcome: "failed" as const,
                cameraRollbackOutcome: "completed" as const,
                diagnosticCodes: Object.freeze([
                  "WORLD_RECONSTRUCTION_CAPTURE_IDENTITY_MISMATCH",
                ]),
              });
            }
            const rejectedOpeningRef = caseArtifactRefForPath(
              caseArtifactRoot,
              caseRootPath,
              input.generationInput.runDirectoryPath,
              rejectedEvidence.openingOutputPath,
            );
            const openingGateResultRef = caseArtifactRefForPath(
              caseArtifactRoot,
              caseRootPath,
              input.generationInput.runDirectoryPath,
              rejectedEvidence.openingGateResultPath,
            );
            const repairDiagnostics =
              createOpeningCompositionRepairDiagnosticsV1({
                gateResult: rejectedEvidence.openingGateResult,
                reconstructionCase: input.reconstructionCase,
                evidenceRef: openingGateResultRef,
                priorAttemptIndex: stageInput.attemptIndex,
                semanticCaptureTargetBindings:
                  formalCaptureIntent.semanticCaptureTargetBindings,
              });
            return Object.freeze({
              outcome: "rejected" as const,
              cameraRollbackOutcome: "completed" as const,
              diagnosticCodes: diagnosticCodes(
                error,
                "WORLD_RECONSTRUCTION_CAPTURE_FAILED",
              ),
              rejectedWorldPackagePath: state.packaged.worldPackagePath,
              rejectedWorldPackageRef: state.packaged.worldPackageRef,
              rejectedWorldPackageRootHash:
                state.packaged.worldPackageRootHash,
              rejectedCaptureDirectoryPath,
              rejectedOpeningPath: rejectedEvidence.openingOutputPath,
              rejectedOpeningRef,
              openingGateResultPath: rejectedEvidence.openingGateResultPath,
              openingGateResultRef,
              openingGateResultHash: rejectedEvidence.openingGateResultHash,
              repairDiagnostics,
            });
          }
        } else if (!captureOwnerStarted) {
          setCleanup(["hostedBrowserSession", "viteServer"], "completed");
          cleanupState.outputPromotion = "completed";
        } else {
          setCleanup(["hostedBrowserSession", "viteServer"], "failed");
          cleanupState.outputPromotion = "failed";
        }
        const codes = diagnosticCodes(
          error,
          "WORLD_RECONSTRUCTION_CAPTURE_FAILED",
        );
        const cameraRollbackFailed = codes.includes(
          "WORLD_RECONSTRUCTION_CAMERA_ROLLBACK_FAILED",
        );
        return Object.freeze({
          outcome: cameraRollbackFailed
            ? "camera-rollback-failed" as const
            : "failed" as const,
          cameraRollbackOutcome: cameraRollbackFailed
            ? "failed" as const
            : "completed" as const,
          diagnosticCodes: codes,
        });
      }
    },

    evaluate: async (stageInput) => {
      const state = checkpoint(stageInput.attemptIndex);
      if (
        state.packaged === undefined ||
        state.verifiedWorldPackage === undefined ||
        state.captureDirectoryPath === undefined ||
        stageInput.packaged.outcome !== "completed" ||
        stageInput.captured.outcome !== "completed" ||
        !isEqual(state.packaged, stageInput.packaged)
      ) throw new Error("WORLD_RECONSTRUCTION_EVALUATION_STAGE_INVALID");
      try {
        const captureDirectoryPath = state.captureDirectoryPath;
        const [
          authoringManifest,
          captureReceipt,
          openingObservation,
          semanticViewObservationSet,
          spawnSupportObservation,
          colliderOverlayObservation,
          scriptedTraversalObservation,
        ] = await Promise.all([
          readJsonNoFollow(path.join(
            input.generationInput.runDirectoryPath,
            "attempts",
            String(stageInput.attemptIndex),
            "source",
            "native-block-authoring.json",
          )).then(parseNativeBlockAuthoringManifestV1),
          readJsonNoFollow(stageInput.captured.captureReceiptPath)
            .then(parseFormalWorldCaptureReceiptV1),
          readJsonNoFollow(path.join(captureDirectoryPath, "opening-observation.json"))
            .then(parseFormalOpeningObservationV1),
          readJsonNoFollow(path.join(captureDirectoryPath, "semantic-view-observation-set.json"))
            .then(parseFormalSemanticViewObservationSetV1),
          readJsonNoFollow(path.join(captureDirectoryPath, "spawn-support-observation.json"))
            .then(parseFormalSpawnSupportObservationV1),
          readJsonNoFollow(path.join(captureDirectoryPath, "collider-overlay-observation.json"))
            .then(parseFormalColliderOverlayObservationV1),
          readJsonNoFollow(path.join(captureDirectoryPath, "scripted-traversal.json"))
            .then(parseFormalScriptedTraversalObservationV1),
        ]);
        if (
          captureReceipt.caseRef !== input.caseRef ||
          hashFormalWorldCaptureReceiptV1(captureReceipt) !==
            stageInput.captured.captureReceiptHash
        ) {
          throw new Error("WORLD_RECONSTRUCTION_CAPTURE_IDENTITY_MISMATCH");
        }
        const published = await owners.evaluateAttempt({
          attemptDirectoryPath: hostOutputPath(stageInput.attemptIndex),
          evidenceInput: {
            id: `${input.reconstructionCase.id}.attempt-${stageInput.attemptIndex}.evidence`,
            caseRef: input.caseRef,
            reconstructionCase: input.reconstructionCase,
            evaluationProfileRef: captureReceipt.evaluationProfileRef,
            evaluationProfile: input.evaluationProfile,
            authoringManifest,
            verifiedWorldPackage: state.verifiedWorldPackage,
            captureReceiptRef: stageInput.captured.captureReceiptRef,
            captureReceipt,
            openingObservation,
            semanticViewObservationSet,
            identityMaskPngs: await Promise.all(captureReceipt.views.map(async ({ viewId }) => ({
              viewId, bytes: await readBytesNoFollow(path.join(captureDirectoryPath, `${viewId}-identity-mask.png`)),
            }))),
            spawnSupportObservation,
            colliderOverlayObservation,
            scriptedTraversalObservation,
          },
        });
        cleanupState.outputPromotion = "completed";
        const evaluationResultRef = caseArtifactRefForPath(
          caseArtifactRoot,
          caseRootPath,
          input.generationInput.runDirectoryPath,
          published.evaluationPath,
        );
        return Object.freeze({
          outcome: published.evaluation.outcome,
          evaluation: published.evaluation,
          evaluationResultRef,
          evaluationPath: published.evaluationPath,
          evaluationHash: hashWorldReconstructionEvaluationResultV1(
            published.evaluation,
          ),
          diagnosticCodes: Object.freeze(
            published.evaluation.diagnostics.map(({ code }) => code),
          ),
        });
      } catch (error) {
        cleanupState.outputPromotion = "failed";
        throw error;
      }
    },

    rehashOwnerIdentities: async () => {
      const [gameplayBootstrap, worldRuntimeBootstrap, worldBoundsPolicy] =
        await Promise.all([
          readJsonNoFollow(input.generationInput.gameplayBootstrapPath),
          readJsonNoFollow(input.generationInput.worldRuntimeBootstrapPath),
          readJsonNoFollow(input.generationInput.worldBoundsPolicyPath),
        ]);
      const derived = deriveNativeBlockGenerationBootstrapV1({
        reconstructionCase: input.reconstructionCase,
        gameplayBootstrap,
        worldRuntimeBootstrap,
        worldBoundsPolicy,
        bootstrapId: input.generationInput.bootstrapId,
        sceneModuleRef: input.generationInput.sceneModuleRef,
        nativeSceneApiRef: NATIVE_SCENE_API_REF,
        nativeSceneProfileRef: BABYLON_NATIVE_BLOCK_PROFILE_REF_V1,
        seed: input.generationInput.seed,
      });
      return owners.resolveFrozenOwnerIdentities({
        reconstructionCase: input.reconstructionCase,
        evaluationProfile: input.evaluationProfile,
        gameplayBootstrap,
        worldRuntimeBootstrap,
        worldBoundsPolicy: derived.worldBoundsPolicy,
        bootstrap: derived.bootstrap,
      });
    },

    cleanup: async () => Object.freeze(Object.fromEntries(
      Object.entries(cleanupState).map(([key, outcome]) => [
        key,
        outcome === "pending" ? "completed" : outcome,
      ]),
    )) as unknown as WorldReconstructionCleanupOutcomesV1,
  };
  const saved = async <K extends "generate" | "package" | "capture" | "evaluate">(
    stage: K, stageInput: Parameters<WorldReconstructionRunPortsV1[K]>[0],
  ): Promise<Awaited<ReturnType<WorldReconstructionRunPortsV1[K]>> | undefined> => {
    if (input.hostRecoveryIndex === undefined) return undefined;
    return await readHostCheckpointV1({ attemptRoot: attemptPath(stageInput.attemptIndex), stage,
      inputIdentity: stageInput }) as Awaited<ReturnType<WorldReconstructionRunPortsV1[K]>> | undefined;
  };
  const commit = async (stage: "generate" | "package" | "capture" | "evaluate", stageInput: { attemptIndex: WorldReconstructionAttemptIndexV1 }, result: unknown, paths: readonly string[]) => {
    // Host-only continuation is a production workflow, not an external strict repair Attempt.
    if (executionPurpose !== "production") return;
    const root = attemptPath(stageInput.attemptIndex);
    await writeHostCheckpointV1({ attemptRoot: root, stage, inputIdentity: stageInput, result,
      artifactRoots: paths.map((file) => path.relative(root, file).split(path.sep).join("/")) });
  };
  const generatedArtifactPaths = (index: WorldReconstructionAttemptIndexV1) =>
    ["source", "inputs", "context", "advisory", "attempt.json", "generation-request.json", "generation-receipt.json",
      "scene-authoring-route-decision.json", "generation-dispatch.json"]
      .map((file) => path.join(attemptPath(index), file));
  // Reconstruct from the original owner receipts if the process died before the Host checkpoint commit.
  // This reads the same Run/Attempt, never synthesizes a Generation Receipt or prepares another task.
  const recoverGenerated = async (stageInput: Parameters<WorldReconstructionRunPortsV1["generate"]>[0]): Promise<WorldReconstructionGeneratePortResultV1 | undefined> => {
    const root = attemptPath(stageInput.attemptIndex);
    let receiptValue: unknown;
    try { receiptValue = await readJsonNoFollow(path.join(root, "generation-receipt.json")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
    const receipt = parseNativeBlockGenerationReceiptV1(receiptValue);
    if (receipt.outcome !== "completed" || receipt.cleanupOutcome !== "completed") return undefined;
    const request = parseNativeBlockGenerationRequestV1(await readJsonNoFollow(path.join(root, "generation-request.json")));
    const attempt = parseSceneAuthoringAttemptV1(await readJsonNoFollow(path.join(root, "attempt.json")));
    const dispatch = await readJsonNoFollow(path.join(root, "generation-dispatch.json")) as Record<string, unknown>;
    assertNativeBlockGenerationReceiptMatchesRequestV1(request, receipt);
    if (attempt.sourceInput.kind !== "babylon-native") throw new Error("WORLD_RECONSTRUCTION_HOST_CHECKPOINT_INVALID");
    assertNativeBlockGenerationRequestMatchesAttemptV1(attempt.sourceInput.generationRequestRef, request, attempt);
    if (dispatch.kind !== "native-block-generation-dispatch" || dispatch.schemaVersion !== 1 ||
      dispatch.backend !== stageInput.backend || receipt.backend !== stageInput.backend ||
      dispatch.routerRequestId !== stageInput.requestId || receipt.routerRequestId !== stageInput.requestId ||
      dispatch.routerTaskPayloadHash !== receipt.routerTaskPayloadHash ||
      dispatch.generationRequestHash !== hashNativeBlockGenerationRequestV1(request) ||
      dispatch.attemptHash !== hashSceneAuthoringAttemptV1(attempt) ||
      !isEqual(dispatch.frozenOwnerIdentities, stageInput.frozenOwnerIdentities)) {
      throw new Error("WORLD_RECONSTRUCTION_HOST_CHECKPOINT_INVALID");
    }
    for (const file of [
      ...request.contextInputs.map((item) => ({ relative: item.inputRef, hash: item.contentHash })),
      ...receipt.outputs.map((item) => ({ relative: `source/${item.path}`, hash: item.contentHash })),
    ]) {
      const target = path.resolve(root, file.relative);
      if (!target.startsWith(`${root}${path.sep}`) || await realpath(target) !== target ||
        !(await lstat(target)).isFile() || sha256Bytes(await readFile(target)) !== file.hash) {
        throw new Error("WORLD_RECONSTRUCTION_HOST_CHECKPOINT_INVALID");
      }
    }
    const ref = (file: string) => caseArtifactRefForPath(caseArtifactRoot, caseRootPath,
      input.generationInput.runDirectoryPath, path.join(root, file));
    const result: WorldReconstructionGeneratePortResultV1 = Object.freeze({
      outcome: "completed", requestId: receipt.routerRequestId, requestHash: receipt.routerTaskPayloadHash,
      generationRequestRef: ref("generation-request.json"), generationRequestHash: receipt.generationRequestHash,
      generationReceiptRef: ref("generation-receipt.json"), generationReceiptHash: hashNativeBlockGenerationReceiptV1(receipt),
      sceneAuthoringAttemptRef: ref("attempt.json"), sceneAuthoringAttemptHash: hashSceneAuthoringAttemptV1(attempt),
      diagnosticCodes: receipt.diagnosticCodes,
    });
    await commit("generate", stageInput, result, generatedArtifactPaths(stageInput.attemptIndex));
    return result;
  };
  const durablePorts = {
    ...ports,
    generate: async (stageInput) => {
      const cached = await saved("generate", stageInput) ??
        (input.hostRecoveryIndex === undefined ? undefined : await recoverGenerated(stageInput));
      if (cached !== undefined) {
        if (cached.outcome !== "completed") throw new Error("WORLD_RECONSTRUCTION_HOST_RECOVERY_GENERATION_INCOMPLETE");
        const state = checkpoint(stageInput.attemptIndex);
        state.generated = cached;
        state.frozenOwnerIdentities = stageInput.frozenOwnerIdentities;
        setCleanup(["providerTask", "temporaryDirectories", "outputPromotion"], "completed");
        return cached;
      }
      // Missing/unknown/rejected generation is not a license to POST another task.
      if (input.hostRecoveryIndex !== undefined) {
        let dispatch: Record<string, unknown> | undefined;
        try { dispatch = await readJsonNoFollow(path.join(attemptPath(stageInput.attemptIndex), "generation-dispatch.json")) as Record<string, unknown>; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        if (dispatch !== undefined) {
          if (dispatch.kind !== "native-block-generation-dispatch" || dispatch.schemaVersion !== 1 ||
            dispatch.routerRequestId !== stageInput.requestId || dispatch.backend !== stageInput.backend ||
            !isEqual(dispatch.frozenOwnerIdentities, stageInput.frozenOwnerIdentities)) {
            throw new Error("WORLD_RECONSTRUCTION_HOST_CHECKPOINT_INVALID");
          }
          await owners.reconcileGeneration({ executablePath: path.join(input.repositoryRoot, "scripts/agents/run-codex-task.mjs"),
            backend: stageInput.backend, requestId: stageInput.requestId, cwd: input.generationInput.runDirectoryPath });
        }
        throw new Error("WORLD_RECONSTRUCTION_HOST_RECOVERY_GENERATION_INCOMPLETE");
      }
      const result = await ports.generate(stageInput);
      if (result.outcome === "completed") {
        await commit("generate", stageInput, result, generatedArtifactPaths(stageInput.attemptIndex));
      }
      return result;
    },
    package: async (stageInput) => {
      const cached = await saved("package", stageInput);
      if (cached !== undefined) {
        if (cached.outcome !== "completed") throw new Error("WORLD_RECONSTRUCTION_HOST_CHECKPOINT_INVALID");
        const verified = verifyWorldPackageDirectoryV1(await readWorldPackageDirectoryV1({
          packageDirectoryPath: cached.worldPackagePath, maximumTotalBytes: 512_000_000, maximumFileCount: 4096,
        }));
        if (verified.kind !== "babylon-native-scene" || verified.receipt.worldPackageRootHash !== cached.worldPackageRootHash) {
          throw new Error("WORLD_RECONSTRUCTION_HOST_CHECKPOINT_INVALID");
        }
        const state = checkpoint(stageInput.attemptIndex);
        state.packaged = cached;
        // The verified capability is reconstructed by its owner, never deserialized from JSON.
        state.verifiedWorldPackage = verified;
        setCleanup(["candidate", "outputPromotion"], "completed");
        return cached;
      }
      await ensureHostOutputPath(stageInput.attemptIndex);
      const result = await ports.package(stageInput);
      if (result.outcome === "completed") await commit("package", stageInput, result,
        ["world-package", "attempt-result.json", "native-check-result.json", "native-explain.txt",
          "ground-analysis-report.json", "logical-ground-model.json", "ground-analysis-diagnostics.json"]
          .map((file) => path.join(hostOutputPath(stageInput.attemptIndex), file)));
      return result;
    },
    capture: async (stageInput) => {
      const cached = await saved("capture", stageInput);
      if (cached !== undefined) {
        if (cached.outcome !== "completed") throw new Error("WORLD_RECONSTRUCTION_HOST_CHECKPOINT_INVALID");
        checkpoint(stageInput.attemptIndex).captureDirectoryPath = path.dirname(cached.captureReceiptPath);
        setCleanup(["hostedBrowserSession", "viteServer", "outputPromotion"], "completed");
        return cached;
      }
      await ensureHostOutputPath(stageInput.attemptIndex);
      const result = await ports.capture(stageInput);
      if (result.outcome === "completed") await commit("capture", stageInput, result, [path.dirname(result.captureReceiptPath)]);
      return result;
    },
    evaluate: async (stageInput) => {
      const cached = await saved("evaluate", stageInput);
      if (cached !== undefined) return cached;
      await ensureHostOutputPath(stageInput.attemptIndex);
      const result = await ports.evaluate(stageInput);
      await commit("evaluate", stageInput, result, [result.evaluationPath, path.join(path.dirname(result.evaluationPath), "evidence-set.json")]);
      return result;
    },
  } satisfies WorldReconstructionRunPortsV1;
  return Object.freeze({ ...durablePorts,
    ...(input.hostRecoveryIndex === undefined ? {} : { restoreGenerated: durablePorts.generate }),
  });
}
