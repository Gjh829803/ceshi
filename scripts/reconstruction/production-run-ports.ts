import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  unlink,
} from "node:fs/promises";
import path from "node:path";

import {
  sha256CanonicalJson,
  stringifyCanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  hashNativeBlockGenerationReceiptV1,
  hashSceneAuthoringAttemptResultV1,
} from "@whitebox-world/scene-authoring-contracts";
import {
  BABYLON_NATIVE_BLOCK_PROFILE_REF_V1,
  parseFormalColliderOverlayObservationV1,
  parseFormalOpeningObservationV1,
  parseFormalScriptedTraversalObservationV1,
  parseFormalSpawnSupportObservationV1,
  parseFormalWorldCaptureReceiptV1,
} from "@whitebox-world/runtime-contracts";
import { parseNativeBlockAuthoringManifestV1 } from
  "@whitebox-world/native-babylon-block-profile";
import {
  hashWorldReconstructionEvaluationResultV1,
  type WorldReconstructionCaseV1,
  type WorldReconstructionEvaluationProfileV1,
} from "@whitebox-world/validation";
import { isEqual } from "lodash-es";

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
  type FormalWorldCaptureRequestCaptureProfileV1,
  type FormalWorldCaptureRequestTargetBindingV1,
} from "./formal-capture-request.js";
import { captureHostedWorldPackageV1 } from "./formal-capture.js";
import { evaluateNativeBlockAttemptV1 } from "./evaluate.js";
import type {
  FormalSemanticTopologyRelationBindingV1,
  FormalTraversalCheckpointSpatialCriterionV1,
} from "@whitebox-world/runtime-contracts";
import type {
  WorldReconstructionCleanupOutcomesV1,
  WorldReconstructionCleanupOwnerOutcomeV1,
} from "./run-journal.js";
import {
  isCanonicalWorldReconstructionCaseArtifactRefV1,
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
  readonly repositoryRoot: string;
  readonly casePath: string;
  readonly caseRef: string;
  readonly evaluationProfilePath: string;
  readonly reconstructionCase: WorldReconstructionCaseV1;
  readonly evaluationProfile: WorldReconstructionEvaluationProfileV1;
  readonly generationInput: FrozenGenerationInputV1;
  readonly captureRequest: Readonly<{
    captureProfile: FormalWorldCaptureRequestCaptureProfileV1;
    semanticCaptureTargetBindings:
      readonly FormalWorldCaptureRequestTargetBindingV1[];
    topologyRelations: readonly FormalSemanticTopologyRelationBindingV1[];
    checkpointSpatialCriteria:
      readonly FormalTraversalCheckpointSpatialCriterionV1[];
  }>;
}

export interface ProductionWorldReconstructionRunPortOwnersV1 {
  readonly prepareGeneration: typeof prepareNativeBlockGenerationTaskV1;
  readonly runGeneration: typeof runNativeBlockGenerationV1;
  readonly createProcessPort: typeof createCodexTaskProcessPortV1;
  readonly reconcileGeneration: typeof reconcileCodexTaskCreationV1;
  readonly runSelfCheck: (
    checkerPath: string,
    workspacePath: string,
  ) => Promise<Readonly<{ ok: boolean; diagnosticCodes: readonly string[] }>>;
  readonly packageAttempt: typeof packageNativeBlockAttemptV1;
  readonly materializeCaptureRequest:
    typeof materializeFormalWorldCaptureRequestV1;
  readonly capturePackage: typeof captureHostedWorldPackageV1;
  readonly evaluateAttempt: typeof evaluateNativeBlockAttemptV1;
  readonly resolveFrozenOwnerIdentities:
    typeof resolveWorldReconstructionFrozenOwnerIdentitiesV1;
}

interface AttemptCheckpointV1 {
  prepared?: PreparedNativeBlockGenerationTaskV1;
  generated?: WorldReconstructionGeneratePortResultV1;
  packaged?: Extract<WorldReconstructionPackagePortResultV1, {
    readonly outcome: "completed";
  }>;
  packagedOwnerResult?: PackagedNativeBlockAttemptV1;
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
    capturePackage: captureHostedWorldPackageV1,
    evaluateAttempt: evaluateNativeBlockAttemptV1,
    resolveFrozenOwnerIdentities:
      resolveWorldReconstructionFrozenOwnerIdentitiesV1,
  });
}

function diagnosticCodes(error: unknown, fallback: string): readonly string[] {
  if (error instanceof NativeBlockPackageErrorV1) {
    return error.diagnostics;
  }
  const message = error instanceof Error ? error.message : String(error);
  const codes = message.match(/[A-Z][A-Z0-9_]{4,}/g);
  return Object.freeze(codes === null || codes.length === 0
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

function canonicalCaseArtifactRoot(caseRef: string): string {
  if (!isCanonicalWorldReconstructionCaseArtifactRefV1(caseRef)) {
    throw new TypeError("WORLD_RECONSTRUCTION_CASE_REF_INVALID");
  }
  return caseRef.slice(0, -"/case.json".length);
}

function caseArtifactRefForPath(
  caseArtifactRoot: string,
  runDirectoryPath: string,
  artifactPath: string,
): string {
  const relativePath = path.relative(path.dirname(runDirectoryPath), artifactPath)
    .split(path.sep)
    .join("/");
  return `${caseArtifactRoot}/${relativePath}`;
}

async function publishCanonicalJsonFresh(
  outputPath: string,
  value: unknown,
): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  const temporaryPath = path.join(
    path.dirname(outputPath),
    `.${path.basename(outputPath)}.${randomUUID()}.tmp`,
  );
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(`${stringifyCanonicalJson(value)}\n`);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, outputPath);
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

async function readJsonNoFollow(filePath: string): Promise<unknown> {
  const info = await lstat(filePath);
  if (!info.isFile() || info.isSymbolicLink() || await realpath(filePath) !== filePath) {
    throw new TypeError(`WORLD_RECONSTRUCTION_INPUT_INVALID: ${filePath}`);
  }
  return JSON.parse((await readFile(filePath)).toString("utf8"));
}

function runBuilderSelfCheckV1(
  checkerPath: string,
  workspacePath: string,
): Promise<Readonly<{ ok: boolean; diagnosticCodes: readonly string[] }>> {
  return new Promise((resolvePromise) => {
    const child = spawn(
      process.execPath,
      [checkerPath, "--workspace", workspacePath],
      { shell: false, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
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
        }));
      } catch {
        resolvePromise({ ok: false, diagnosticCodes: ["self-check-failed"] });
      }
    });
  });
}

export function createProductionWorldReconstructionRunPortsV1(
  input: ProductionWorldReconstructionRunPortsInputV1,
  owners: ProductionWorldReconstructionRunPortOwnersV1 = defaultOwners(),
): WorldReconstructionRunPortsV1 {
  const caseArtifactRoot = canonicalCaseArtifactRoot(input.caseRef);
  const checkpoints = new Map<0 | 1, AttemptCheckpointV1>();
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
  const checkpoint = (attemptIndex: 0 | 1): AttemptCheckpointV1 => {
    const existing = checkpoints.get(attemptIndex);
    if (existing !== undefined) return existing;
    const created: AttemptCheckpointV1 = {};
    checkpoints.set(attemptIndex, created);
    return created;
  };

  const ports: WorldReconstructionRunPortsV1 = {
    generate: async (stageInput) => {
      const state = checkpoint(stageInput.attemptIndex);
      if (state.prepared !== undefined || state.generated !== undefined) {
        throw new Error("WORLD_RECONSTRUCTION_DUPLICATE_REQUEST_MISMATCH");
      }
      setCleanup(["providerTask", "temporaryDirectories"], "failed");
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
      if (
        prepared.routerRequestId !== stageInput.requestId ||
        !isEqual(prepared.frozenOwnerIdentities, stageInput.frozenOwnerIdentities)
      ) {
        throw new Error("WORLD_RECONSTRUCTION_DUPLICATE_REQUEST_MISMATCH");
      }
      const generationRunPorts: NativeBlockGenerationRunPortsV1 = {
        process: owners.createProcessPort(),
        selfCheck: async (workspacePath) => owners.runSelfCheck(
          path.join(
            prepared.taskWorkspacePath,
            "inputs",
            "builder-skill",
            "scripts",
            "self-check.mjs",
          ),
          workspacePath,
        ),
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
      await publishCanonicalJsonFresh(receiptPath, generation.receipt);
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
          input.generationInput.runDirectoryPath,
          receiptPath,
        ),
        generationReceiptHash: hashNativeBlockGenerationReceiptV1(
          generation.receipt,
        ),
        sceneAuthoringAttemptRef: caseArtifactRefForPath(
          caseArtifactRoot,
          input.generationInput.runDirectoryPath,
          path.join(
            input.generationInput.runDirectoryPath,
            "attempts",
            String(stageInput.attemptIndex),
            "attempt.json",
          ),
        ),
        sceneAuthoringAttemptHash: prepared.attemptHash,
        diagnosticCodes: Object.freeze([...generation.receipt.diagnosticCodes]),
      });
      state.generated = result;
      return result;
    },

    package: async (stageInput) => {
      const state = checkpoint(stageInput.attemptIndex);
      if (
        state.prepared === undefined ||
        state.generated === undefined ||
        state.packaged !== undefined ||
        !isEqual(stageInput.generate, state.generated) ||
        !isEqual(stageInput.frozenOwnerIdentities, state.prepared.frozenOwnerIdentities)
      ) throw new Error("WORLD_RECONSTRUCTION_PACKAGE_STAGE_INVALID");
      cleanupState.candidate = "failed";
      const outputDirectoryPath = path.join(
        input.generationInput.runDirectoryPath,
        "attempts",
        String(stageInput.attemptIndex),
        "world-package",
      );
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
            input.generationInput.runDirectoryPath,
            path.join(
              input.generationInput.runDirectoryPath,
              "attempts",
              String(stageInput.attemptIndex),
              "attempt-result.json",
            ),
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
          diagnosticCodes: Object.freeze([...packaged.diagnostics]),
        });
        state.packagedOwnerResult = packaged;
        state.packaged = completed;
        return completed;
      } catch (error) {
        cleanupState.candidate = "failed";
        cleanupState.outputPromotion = "failed";
        const codes = diagnosticCodes(
          error,
          "WORLD_RECONSTRUCTION_PACKAGE_FAILED",
        );
        return Object.freeze({
          outcome: error instanceof NativeBlockPackageErrorV1 &&
              error.diagnostics.includes("native-check-rejected")
            ? "check-failed" as const
            : "package-failed" as const,
          diagnosticCodes: codes,
        });
      }
    },

    capture: async (stageInput) => {
      const state = checkpoint(stageInput.attemptIndex);
      if (
        state.packaged === undefined ||
        state.packagedOwnerResult === undefined ||
        !isEqual(state.packaged, stageInput.packaged) ||
        state.captureDirectoryPath !== undefined
      ) throw new Error("WORLD_RECONSTRUCTION_CAPTURE_STAGE_INVALID");
      setCleanup(["hostedBrowserSession", "viteServer"], "failed");
      const attemptDirectoryPath = path.join(
        input.generationInput.runDirectoryPath,
        "attempts",
        String(stageInput.attemptIndex),
      );
      const requestPath = path.join(
        path.dirname(state.packaged.worldPackagePath),
        FORMAL_WORLD_CAPTURE_REQUEST_FILE_NAME_V1,
      );
      const captureDirectoryPath = path.join(attemptDirectoryPath, "capture");
      let browserAllocated = false;
      try {
        const materialized = await owners.materializeCaptureRequest({
          casePath: input.casePath,
          evaluationProfilePath: input.evaluationProfilePath,
          sceneAuthoringAttemptPath: path.join(attemptDirectoryPath, "attempt.json"),
          packageDirectoryPath: state.packaged.worldPackagePath,
          outputPath: requestPath,
          ...input.captureRequest,
        });
        browserAllocated = true;
        const captured = await owners.capturePackage({
          packageDirectoryPath: state.packaged.worldPackagePath,
          outputPath: path.join(captureDirectoryPath, "opening.png"),
          triviewOutputPath: captureDirectoryPath,
        });
        if (
          captured.formalRequestHash !== materialized.formalRequestHash ||
          captured.worldPackageRootHash !== state.packaged.worldPackageRootHash
        ) {
          throw new Error("WORLD_RECONSTRUCTION_CAPTURE_IDENTITY_MISMATCH");
        }
        setCleanup(["hostedBrowserSession", "viteServer"], "completed");
        cleanupState.outputPromotion = "completed";
        state.captureDirectoryPath = captureDirectoryPath;
        const captureReceiptPath = path.join(
          captureDirectoryPath,
          "formal-world-capture-receipt.json",
        );
        return Object.freeze({
          outcome: "completed" as const,
          captureReceiptRef: caseArtifactRefForPath(
            caseArtifactRoot,
            input.generationInput.runDirectoryPath,
            captureReceiptPath,
          ),
          captureReceiptHash: captured.formalCaptureReceiptHash,
          captureReceiptPath,
          cameraRollbackOutcome: "completed" as const,
          diagnosticCodes: Object.freeze([]),
        });
      } catch (error) {
        setCleanup(
          ["hostedBrowserSession", "viteServer"],
          browserAllocated ? "failed" : "completed",
        );
        cleanupState.outputPromotion = browserAllocated ? "failed" : "completed";
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
        state.packagedOwnerResult === undefined ||
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
          readJsonNoFollow(path.join(captureDirectoryPath, "spawn-support-observation.json"))
            .then(parseFormalSpawnSupportObservationV1),
          readJsonNoFollow(path.join(captureDirectoryPath, "collider-overlay-observation.json"))
            .then(parseFormalColliderOverlayObservationV1),
          readJsonNoFollow(path.join(captureDirectoryPath, "scripted-traversal.json"))
            .then(parseFormalScriptedTraversalObservationV1),
        ]);
        if (captureReceipt.caseRef !== input.caseRef) {
          throw new Error("WORLD_RECONSTRUCTION_CAPTURE_IDENTITY_MISMATCH");
        }
        const published = await owners.evaluateAttempt({
          attemptDirectoryPath: path.join(
            input.generationInput.runDirectoryPath,
            "attempts",
            String(stageInput.attemptIndex),
          ),
          evidenceInput: {
            id: `${input.reconstructionCase.id}.attempt-${stageInput.attemptIndex}.evidence`,
            caseRef: input.caseRef,
            reconstructionCase: input.reconstructionCase,
            evaluationProfileRef: captureReceipt.evaluationProfileRef,
            evaluationProfile: input.evaluationProfile,
            authoringManifest,
            verifiedWorldPackage: state.packagedOwnerResult.verifiedWorldPackage,
            captureReceiptRef: stageInput.captured.captureReceiptRef,
            captureReceipt,
            openingObservation,
            spawnSupportObservation,
            colliderOverlayObservation,
            scriptedTraversalObservation,
          },
        });
        cleanupState.outputPromotion = "completed";
        return Object.freeze({
          outcome: published.evaluation.outcome,
          evaluation: published.evaluation,
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
      const [gameplayBootstrap, worldRuntimeBootstrap] = await Promise.all([
        readJsonNoFollow(input.generationInput.gameplayBootstrapPath),
        readJsonNoFollow(input.generationInput.worldRuntimeBootstrapPath),
      ]);
      const derived = deriveNativeBlockGenerationBootstrapV1({
        reconstructionCase: input.reconstructionCase,
        gameplayBootstrap,
        worldRuntimeBootstrap,
        worldBounds: input.generationInput.worldBounds,
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
        worldBounds: derived.worldBounds,
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
  return Object.freeze(ports);
}
