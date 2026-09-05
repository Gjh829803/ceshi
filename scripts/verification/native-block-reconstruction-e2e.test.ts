import {
  chmod,
  cp,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  hashNativeBlockGenerationReceiptV1,
  hashNativeBlockGenerationRequestV1,
  hashSceneAuthoringAttemptResultV1,
  hashSceneAuthoringAttemptV1,
  parseNativeBlockGenerationReceiptV1,
  parseNativeBlockGenerationRequestV1,
} from "@whitebox-world/scene-authoring-contracts";
import {
  formalWorldCaptureIntentCanonicalBytesV1,
  hashFormalColliderOverlayObservationV1,
  hashFormalOpeningObservationV1,
  hashFormalSemanticViewObservationSetV1,
  hashFormalScriptedTraversalObservationV1,
  hashFormalSemanticCaptureMapV1,
  hashFormalSpawnSupportObservationV1,
  hashFormalWorldCaptureRequestV1,
  hashFormalWorldCaptureReceiptV1,
  parseFormalColliderOverlayObservationV1,
  parseFormalOpeningObservationV1,
  parseFormalScriptedTraversalObservationV1,
  parseFormalSpawnSupportObservationV1,
  parseFormalWorldCaptureReceiptV1,
  parseNativeSceneCheckResultV1,
  parseWorldRuntimeSnapshotV4,
  createBabylonNativeStaticColliderContributionV1,
  type FixedInputV1,
  type RuntimeSessionSubjectSupportV1,
  type WorldRuntimeSnapshotV4,
} from "@whitebox-world/runtime-contracts";
import {
  sha256Bytes,
  sha256CanonicalJson,
  stringifyCanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  evaluateWorldReconstructionV1,
  hashWorldReconstructionCaseV1,
  hashWorldReconstructionEvaluationProfileV1,
  hashWorldReconstructionEvaluationResultV1,
  hashWorldReconstructionEvidenceSetV1,
  hashWorldReconstructionStrictDiagnosticReceiptV1,
  getWorldReconstructionFinalEvaluatedAttemptV1,
  parseWorldReconstructionEvaluationResultV1,
  parseWorldReconstructionRunReceiptV1,
  hashWorldReconstructionRunReceiptV1,
  parseWorldReconstructionStrictDiagnosticReceiptV1,
} from "@whitebox-world/validation";
import { writeWorldPackageDirectoryV1 } from "../lib/file-world-package.js";
import { buildWorldReconstructionEvidenceSetV1 } from "../reconstruction/evaluate-evidence-set.js";
import { createEvidenceSetFixtureInputV1, createSemanticViewObservationSetFixtureV1 } from "../reconstruction/evaluate-fixture.test-support.js";
import {
  createNativeBlockFinalArtifactPublisherTestAdapterV1,
  publishNativeBlockReconstructionFinalV1,
} from "../reconstruction/final-artifact-publisher.js";
import { explainNativeSceneCheckResultV1 } from "../native-scene/explain.js";
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

import {
  entryThirdPersonValidationResultCanonicalBytesV1,
  hashEntryThirdPersonValidationResultV1,
  validateFormalOpeningEntryThirdPersonV1,
} from "../visual/entry-third-person.js";

import {
  NATIVE_BLOCK_RECONSTRUCTION_E2E_TEST_HARNESS_V1,
  NativeBlockReconstructionVerificationClosedErrorV1,
  verifyNativeBlockReconstructionE2EV1,
  verifyNativeBlockReconstructionProductionIntegrityV1,
  type NativeBlockReconstructionPlayabilityLaunchPortV1,
  type NativeBlockReconstructionPlayabilitySessionPortV1,
} from "./verify-native-block-reconstruction-e2e.js";
import { parseNativeBlockReconstructionVerifierArgumentsV1 } from
  "./run-native-block-reconstruction-e2e.js";

const PNG = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
));
const H = (character: string) => `sha256:${character.repeat(64)}` as Sha256HashV1;

async function entryPng(left = 43, right = 56): Promise<Uint8Array> {
  const width = 100;
  const height = 100;
  const pixels = new Uint8Array(width * height * 3).fill(255);
  for (let y = 25; y <= 90; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const offset = (y * width + x) * 3;
      pixels[offset] = 0xE8;
      pixels[offset + 1] = 0x5D;
      pixels[offset + 2] = 0x5D;
    }
  }
  return new Uint8Array(await sharp(pixels, {
    raw: { width, height, channels: 3 },
  }).png().toBuffer());
}
const MIXED_BLOCK_CHECKPOINT_CRITERIA = [{
  kind: "reach-position" as const,
  checkpointId: "gate-approach",
  expectation: "reach" as const,
  sourceVisualGroupId: "ground-group",
  standPositionMetersXYZ: [0, 0, -4.65] as const,
  capsuleRadiusMeters: 0.35,
  toleranceMeters: 0.05,
}, {
  kind: "block-plane" as const,
  checkpointId: "gate-limit",
  expectation: "block" as const,
  sourceVisualGroupId: "ground-group",
  sourceBoundsMeters: {
    minimumMetersXYZ: [-5, -1, -5] as const,
    maximumMetersXYZ: [5, 1, 5] as const,
  },
  colliderId: "palette-ground-blocker",
  axis: "z" as const,
  sourceFace: "minimum" as const,
  planeMeters: -5,
  expectedCenterSide: "negative" as const,
  capsuleRadiusMeters: 0.35,
  toleranceMeters: 0.05,
}] as const;

describe("Native Block reconstruction E2E verifier CLI", () => {
  it("resolves the required Run and optional Final directories", () => {
    expect(parseNativeBlockReconstructionVerifierArgumentsV1([
      "--",
      "--run",
      "artifacts/scenes/example/runs/run-1",
      "--final",
      "artifacts/scenes/example/final",
    ])).toEqual({
      runDirectoryPath: path.resolve(
        "artifacts/scenes/example/runs/run-1",
      ),
      finalDirectoryPath: path.resolve(
        "artifacts/scenes/example/final",
      ),
    });
  });

  it("rejects an incomplete or ambiguous invocation", () => {
    expect(() => parseNativeBlockReconstructionVerifierArgumentsV1([]))
      .toThrow("--run <run-directory> is required");
    expect(() => parseNativeBlockReconstructionVerifierArgumentsV1([
      "--run",
      "first",
      "--run",
      "second",
    ])).toThrow("--run may appear only once");
    expect(() => parseNativeBlockReconstructionVerifierArgumentsV1([
      "--run",
      "first",
      "--unknown",
      "second",
    ])).toThrow("Unknown option '--unknown'");
  });
});

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${stringifyCanonicalJson(value)}\n`);
}

async function applyGitCheckoutModes(root: string): Promise<void> {
  await chmod(root, 0o755);
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await applyGitCheckoutModes(entryPath);
    } else if (entry.isFile()) {
      await chmod(entryPath, 0o644);
    }
  }
}

function generationRequestFixture(input: ReturnType<
  typeof createEvidenceSetFixtureInputV1
>, options: Readonly<{
  id?: string;
  taskInstructionHash?: Sha256HashV1;
}> = {}) {
  const verified = input.verifiedWorldPackage;
  const attempt = verified.sceneAuthoringAttempt;
  if (attempt.sourceInput.kind !== "babylon-native") throw new Error("fixture source");
  const nativeSceneApi = verified.registryLock.find(({ resourceKind }) =>
    resourceKind === "native-scene-api")!;
  const nativeSceneProfile = verified.registryLock.find(({ resourceKind }) =>
    resourceKind === "native-scene-profile")!;
  return parseNativeBlockGenerationRequestV1({
    kind: "native-block-generation-request",
    schemaVersion: 1,
    id: options.id ?? "package-fixture.initial",
    routeDecisionRef: attempt.sceneAuthoringRouteDecisionRef,
    routeDecisionHash: attempt.sceneAuthoringRouteDecisionHash,
    sceneBriefRef: attempt.sceneBriefRef,
    sceneBriefHash: attempt.sceneBriefHash,
    referenceInputs: [],
    codexExecutionProfileRef: "worldkit://codex-execution-profile/formal@1",
    codexExecutionProfileHash: H("5"),
    taskInstructionRef: "worldkit://task-instruction/native-block-reconstruction@1",
    taskInstructionHash: options.taskInstructionHash ?? H("6"),
    builderSkillRef: "worldkit://skill/worldkit-native-block-builder@1",
    builderSkillHash: H("7"),
    workspaceContextManifestRef: "worldkit://workspace-context/native-block-builder@1",
    workspaceContextManifestHash: H("8"),
    contextInputs: [{
      inputRef: "context/native-scene-api.json",
      contentHash: nativeSceneApi.contentHash,
    }],
    nativeSceneApiRef: nativeSceneApi.resourceRef,
    nativeSceneApiHash: nativeSceneApi.contentHash,
    nativeSceneProfileRef: nativeSceneProfile.resourceRef,
    nativeSceneProfileHash: nativeSceneProfile.contentHash,
    blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
    blockProfileHash: H("9"),
    bootstrapInputRef: attempt.sourceInput.bootstrapInputRef,
    bootstrapInputHash: attempt.sourceInput.bootstrapInputHash,
    seed: attempt.seed,
    budgets: {
      maximumBlockCount: 2_000,
      maximumStaticColliderCount: 500,
      maximumStaticColliderVertexCount: 200_000,
      maximumStaticColliderTriangleCount: 100_000,
      maximumOutputBytes: 4_000_000,
      timeoutSeconds: 900,
    },
    declaredOutputPaths: [
      "scene.ts",
      "native-block-authoring.json",
      "native-resources.json",
    ],
  });
}

function snapshot(
  runtimeSessionId: string,
  worldSessionId: string,
  tick: number,
  positionMetersXYZ: readonly [number, number, number],
  movementMedium: "ground" | "air",
): WorldRuntimeSnapshotV4 {
  return parseWorldRuntimeSnapshotV4({
    kind: "worldkit-runtime-snapshot",
    schemaVersion: 4,
    runtimeSessionId,
    worldSessionId,
    world: {
      publicationEpoch: 0,
      simulationTick: tick,
      worldStateRef: `worldkit://world-state/${worldSessionId}`,
      worldStateHash: H("a"),
      subjectStatesByEntityId: {
        player: {
          entityState: {
            id: "player",
            kind: "spatial-entity-state",
            entityDefinitionRef: "worldkit://subject-definition/humanoid.third-person@1",
            entityDefinitionHash: H("b"),
            semanticClassId: "subject.humanoid.player",
            lifecycleMode: "active",
            positionMetersXYZ,
            rotationQuaternionXYZW: [0, 0, 0, 1],
            scaleRatioXYZ: [1, 1, 1],
            linearVelocityMetersPerSecondXYZ: [0, 0, 0],
          },
          capabilityStatesById: {
            locomotion: {
              id: "locomotion",
              kind: "locomotion-capability-state-v2",
              ownerEntityId: "player",
              locomotionCapabilityRef: "worldkit://locomotion-capability/ground.standard@1",
              locomotionCapabilityHash: H("c"),
              locomotion: {
                schemaVersion: 2,
                status: "active",
                mobilityMode: movementMedium === "ground" ? "grounded" : "airborne",
                gait: movementMedium === "ground" ? "idle" : "none",
                verticalPhase: movementMedium === "ground" ? "none" : "rising",
                supportMode: movementMedium === "ground" ? "supported" : "unsupported",
                movementMedium,
                facingYawRadians: 0,
                linearVelocity: { x: 0, y: 0, z: 0 },
                horizontalSpeedMetersPerSecond: 0,
                committedTick: tick,
                phaseEnteredTick: 0,
                transitionSequence: 0,
              },
            },
          },
        },
      },
      gameplayInspection: {
        kind: "worldkit-gameplay-inspection-snapshot",
        schemaVersion: 1,
        projection: "inspection",
        id: `inspection:${worldSessionId}:${tick}`,
        runtimeSessionId,
        worldSessionId,
        gameplayModeRef: "worldkit://gameplay-mode/outdoor.default@1",
        phase: "ready",
        simulationTick: tick,
        participantStatesById: { primary: { id: "primary", mode: "active" } },
        controllerStatesById: { primary: { id: "primary", participantId: "primary" } },
        relationshipStatesById: {},
        activeActionStatesById: {},
        activatedGameplayFeatureRefs: [],
        lastEventSequence: 0,
      },
    },
    view: { viewStateRevision: 0, camera: { mode: "unbound" } },
    runtime: { phase: "ready", isPaused: false, fixedTimeStepSeconds: 1 / 60 },
    resources: { phase: "ready", meshCount: 1, physicsBodyCount: 1, terrainSampleCount: 0 },
  });
}

function playabilityPort(options: {
  traversalFails?: boolean;
  stopsAtBlocker?: boolean;
  crossesBlocker?: boolean;
  cleanupFails?: boolean;
  cleanupThrows?: boolean;
  wrongDirection?: boolean;
  jumpNeverAir?: boolean;
} = {}) {
  const runtimeSessionId = "runtime.nbr70.fixture";
  let resetCount = 0;
  let current = snapshot(runtimeSessionId, "world.ready", 0, [0, 0, 0], "ground");
  const dispose = vi.fn(async () => {
    if (options.cleanupThrows) throw new Error("fixture dispose failed");
    return {
      outcome: options.cleanupFails ? "failed" as const : "completed" as const,
    };
  });
  const resetWithInitialControlBinding = vi.fn(async () => {
    resetCount += 1;
    current = snapshot(runtimeSessionId, `world.${resetCount}`, 0, [0, 0, 0], "ground");
    return current;
  });
  const readCommittedSubjectSupport = vi.fn(
    async (
      subjectEntityId: string,
      expectedSimulationTick: number,
    ): Promise<RuntimeSessionSubjectSupportV1> => ({
      kind: "worldkit-runtime-session-subject-support",
      schemaVersion: 1,
      runtimeSessionId,
      worldSessionId: current.worldSessionId,
      subjectEntityId,
      simulationTick: expectedSimulationTick,
      mode: "supported",
      sampledControllerCenterMetersXYZ: [0, 0.9, 0],
      sampledFootPointMetersXYZ: [0, 0, 0],
      pointMetersXYZ: [0, 0, 0],
      normalXYZ: [0, 1, 0],
      distanceMeters: 0,
      colliderId: "ground",
      colliderSubshapeId: "ground#shape",
      logicalSubshapeId: "ground#logical",
      traversalSurfaceId: "ground#surface",
      surfaceEntityId: "ground",
      traversalSurfaceProfileRef:
        "worldkit://traversal-surface-profile/walkable-ground@1",
    }),
  );
  const session: NativeBlockReconstructionPlayabilitySessionPortV1 = {
    awaitReady: vi.fn(async () => current),
    resetWithInitialControlBinding,
    runFixedInput: vi.fn(async (input: FixedInputV1) => {
      const [x, y, z] = current.world.subjectStatesByEntityId.player!
        .entityState.positionMetersXYZ;
      const actions = new Set(input.actions);
      const direction = options.wrongDirection ? -1 : 1;
      const next: [number, number, number] = options.traversalFails &&
          resetCount >= 8 && actions.has("move-forward")
        ? [100, 100, 100]
        : options.stopsAtBlocker && resetCount === 8 && actions.has("move-forward")
          ? [0, 0, -4.65]
        : options.crossesBlocker && resetCount >= 8 && actions.has("move-forward")
          ? [0, 0, -100]
        : [
          x + direction * ((actions.has("move-right") ? 1 : 0) -
            (actions.has("move-left") ? 1 : 0)),
          y + (actions.has("jump") ? 1 : 0),
          z + direction * ((actions.has("move-backward") ? 1 : 0) -
            (actions.has("move-forward") ? 1 : 0)),
        ];
      current = snapshot(
        runtimeSessionId,
        current.worldSessionId,
        current.world.simulationTick + input.ticks,
        next,
        actions.has("jump") && !options.jumpNeverAir ? "air" : "ground",
      );
      return current;
    }),
    readCommittedSubjectSupport,
    dispose,
  };
  const launch = vi.fn(async () => session);
  return {
    port: { launch } satisfies NativeBlockReconstructionPlayabilityLaunchPortV1,
    launch,
    dispose,
    resetWithInitialControlBinding,
    readCommittedSubjectSupport,
  };
}

async function completeRunFixture(
  options: Parameters<typeof createEvidenceSetFixtureInputV1>[0] & Readonly<{
    forgePassedEvaluation?: boolean;
    caseRefOverride?: string;
    strictDiagnosticFails?: boolean;
    evaluationPasses?: boolean;
    entryPasses?: boolean;
  }> = {},
) {
  const {
    forgePassedEvaluation = false,
    caseRefOverride,
    strictDiagnosticFails = false,
    evaluationPasses = true,
    entryPasses = true,
    ...evidenceOptions
  } = options;
  const caseDirectoryPath = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "nbr70-complete-")),
  );
  const runDirectoryPath = path.join(caseDirectoryPath, "runs/formal-fixture");
  await mkdir(runDirectoryPath, { recursive: true });
  const fixture = createEvidenceSetFixtureInputV1({
    ...evidenceOptions,
    allDimensionsPass: evaluationPasses,
  });
  const caseRef = caseRefOverride ?? fixture.caseRef;
  const verified = fixture.verifiedWorldPackage;
  const attemptDirectoryPath = path.join(runDirectoryPath, "attempts/0");
  const attemptArtifactRoot =
    `artifact://world-reconstruction-case/${fixture.reconstructionCase.id}/runs/formal-fixture/attempts/0`;
  const captureReceiptRef =
    `${attemptArtifactRoot}/capture/formal-world-capture-receipt.json`;
  const captureDirectoryPath = path.join(attemptDirectoryPath, "capture");
  await mkdir(captureDirectoryPath, { recursive: true });
  await chmod(attemptDirectoryPath, 0o700);
  await writeJson(path.join(caseDirectoryPath, "case.json"), fixture.reconstructionCase);
  await writeJson(path.join(caseDirectoryPath, "evaluation-profile.json"), fixture.evaluationProfile);
  await mkdir(path.join(caseDirectoryPath, "inputs"), { recursive: true });
  await writeFile(path.join(caseDirectoryPath, "inputs/formal-world-capture-intent.json"),
    formalWorldCaptureIntentCanonicalBytesV1(fixture.formalCaptureIntent));
  await writeJson(path.join(runDirectoryPath, "inputs/case.json"), fixture.reconstructionCase);
  await writeJson(path.join(runDirectoryPath, "inputs/evaluation-profile.json"), fixture.evaluationProfile);
  await writeFile(
    path.join(runDirectoryPath, "inputs/formal-world-capture-intent.json"),
    formalWorldCaptureIntentCanonicalBytesV1(fixture.formalCaptureIntent),
  );

  const request = generationRequestFixture(fixture);
  if (verified.sceneAuthoringAttempt.sourceInput.kind !== "babylon-native" ||
      verified.sceneAuthoringAttempt.sourceInput.generationRequestHash !==
        hashNativeBlockGenerationRequestV1(request)) {
    throw new Error("generation fixture identity drift");
  }
  const sourceByPath = new Map([
    ["native-block-authoring.json", new TextEncoder().encode(
      `${stringifyCanonicalJson(fixture.authoringManifest)}\n`,
    )],
    ["native-resources.json", new TextEncoder().encode("[]")],
    ["scene.ts", new TextEncoder().encode("export default {};\n")],
  ] as const);
  const sourceCheckResult = Object.freeze({
    ...verified.nativeSceneCheckResult,
    id: "package-fixture.native-scene-check",
  });
  const generationReceipt = parseNativeBlockGenerationReceiptV1({
    kind: "native-block-generation-receipt",
    schemaVersion: 1,
    id: "package-fixture.initial.receipt",
    generationRequestRef: verified.sceneAuthoringAttempt.sourceInput.generationRequestRef,
    generationRequestHash: hashNativeBlockGenerationRequestV1(request),
    routerTaskPayloadHash: H("d"),
    taskInstructionHash: request.taskInstructionHash,
    builderSkillHash: request.builderSkillHash,
    workspaceContextManifestHash: request.workspaceContextManifestHash,
    routerRequestId: "package-fixture-initial",
    backend: "cloud",
    executionProfile: "formal",
    resolvedModel: "gpt-5.6-sol",
    resolvedReasoningEffort: "xhigh",
    outcome: "completed",
    outputs: [...sourceByPath].map(([relativePath, bytes]) => ({
      path: relativePath,
      contentHash: sha256Bytes(bytes),
      sizeBytes: bytes.byteLength,
      mediaType: relativePath === "scene.ts" ? "text/typescript" : "application/json",
    })),
    diagnosticCodes: [],
    cleanupOutcome: "completed",
  });
  await writeJson(path.join(attemptDirectoryPath, "generation-request.json"), request);
  await writeJson(path.join(attemptDirectoryPath, "generation-receipt.json"), generationReceipt);
  await writeJson(path.join(attemptDirectoryPath, "scene-authoring-route-decision.json"), verified.sceneAuthoringRouteDecision);
  await writeJson(path.join(attemptDirectoryPath, "attempt.json"), verified.sceneAuthoringAttempt);
  await writeJson(path.join(attemptDirectoryPath, "attempt-result.json"), verified.sceneAuthoringAttemptResult);
  await mkdir(path.join(attemptDirectoryPath, "source"), { recursive: true });
  for (const [relativePath, bytes] of sourceByPath) {
    await writeFile(path.join(attemptDirectoryPath, "source", relativePath), bytes);
  }
  await writeJson(path.join(attemptDirectoryPath, "native-check-result.json"), sourceCheckResult);
  await writeFile(
    path.join(attemptDirectoryPath, "native-explain.txt"),
    explainNativeSceneCheckResultV1(sourceCheckResult),
  );
  await writeWorldPackageDirectoryV1({
    outputDirectoryPath: path.join(attemptDirectoryPath, "world-package"),
    directory: verified.directory,
  });
  const groundAnalysisReport = Object.freeze({
    kind: "babylon-native-block-ground-analysis-report",
    schemaVersion: 1,
    identity: Object.freeze({
      logicalGroundModelHash: H("1"),
      walkableTopologyHash: H("2"),
      traversalCapabilityEnvelopeHash: H("3"),
      caseHash: hashWorldReconstructionCaseV1(fixture.reconstructionCase),
      worldPackageRootHash: verified.receipt.worldPackageRootHash,
      measurementChunkPolicyHash: H("4"),
    }),
    analysisOutcome: "passed",
    admissionOutcome: "passed",
    failureFacts: Object.freeze([]),
    metrics: Object.freeze({}),
    standableNodes: Object.freeze([]),
  });
  await writeJson(
    path.join(attemptDirectoryPath, "ground-analysis-report.json"),
    groundAnalysisReport,
  );
  const groundAnalysisReportHash = sha256CanonicalJson(groundAnalysisReport);

  const openingPng = await entryPng(
    entryPasses ? 43 : 14,
    entryPasses ? 56 : 27,
  );
  const openingPngHash = sha256Bytes(openingPng) as Sha256HashV1;
  const pngHash = sha256Bytes(PNG) as Sha256HashV1;
  const semanticCaptureMap = {
    ...fixture.captureReceipt.formalRequest.semanticCaptureMap,
    caseRef,
  };
  const formalRequest = {
    ...fixture.captureReceipt.formalRequest,
    caseRef,
    semanticCaptureMap,
    semanticCaptureMapHash: hashFormalSemanticCaptureMapV1(semanticCaptureMap),
  };
  const formalRequestHash = hashFormalWorldCaptureRequestV1(formalRequest);
  const rawOpeningObservation = parseFormalOpeningObservationV1({
    ...fixture.openingObservation,
    formalRequest,
    formalRequestHash,
    semanticCaptureMapHash: formalRequest.semanticCaptureMapHash,
  });
  const resetReadySnapshot = {
    ...rawOpeningObservation.resetReadySnapshot,
    view: {
      ...rawOpeningObservation.resetReadySnapshot.view,
      camera: {
        mode: "tracking" as const,
        id: "camera-main",
        targetEntityId: "player",
        positionMetersXYZ: [0, 3, 5] as const,
        activeCameraProfileRef:
          "worldkit://camera-profile/humanoid.third-person@1",
        activeCameraRigRef:
          "worldkit://camera-rig-profile/humanoid.third-person@1",
        activeCameraModifierRefs: [],
        safeFallbackActive: false,
        viewYawOffsetRadians: 0,
        viewPitchOffsetRadians: 0,
        viewDistanceOffsetMeters: 0,
        fixedStepDeltaSeconds: 1 / 60,
      },
    },
  };
  const openingObservationBase = parseFormalOpeningObservationV1({
    ...rawOpeningObservation,
    resetReadySnapshot,
    resetReadySnapshotHash: sha256CanonicalJson(resetReadySnapshot),
  });
  const spawnSupportObservation = parseFormalSpawnSupportObservationV1({
    ...fixture.spawnSupportObservation,
    formalRequest,
    formalRequestHash,
    semanticCaptureMapHash: formalRequest.semanticCaptureMapHash,
  });
  const colliderOverlayObservation = parseFormalColliderOverlayObservationV1({
    ...fixture.colliderOverlayObservation,
    formalRequest,
    formalRequestHash,
    semanticCaptureMapHash: formalRequest.semanticCaptureMapHash,
  });
  const scriptedTraversalObservation = parseFormalScriptedTraversalObservationV1({
    ...fixture.scriptedTraversalObservation,
    formalRequest,
    formalRequestHash,
    semanticCaptureMapHash: formalRequest.semanticCaptureMapHash,
  });
  const views = fixture.captureReceipt.views.map((view) => ({
    ...view, pngContentHash: view.viewId === "opening" ? openingPngHash : pngHash,
  }));
  const originalSemanticViewObservationSet = createSemanticViewObservationSetFixtureV1(openingObservationBase, views);
  const originalCaptureReceipt = parseFormalWorldCaptureReceiptV1({
    ...fixture.captureReceipt,
    caseRef,
    formalRequest,
    formalRequestHash,
    semanticCaptureMapHash: formalRequest.semanticCaptureMapHash,
    openingObservationContentHash:
      hashFormalOpeningObservationV1(openingObservationBase),
    readySnapshotHash: openingObservationBase.resetReadySnapshotHash,
    semanticViewObservationSetContentHash: hashFormalSemanticViewObservationSetV1(originalSemanticViewObservationSet),
    spawnSupportObservationContentHash:
      hashFormalSpawnSupportObservationV1(spawnSupportObservation),
    colliderOverlayObservationContentHash:
      hashFormalColliderOverlayObservationV1(colliderOverlayObservation),
    scriptedTraversalContentHash:
      hashFormalScriptedTraversalObservationV1(scriptedTraversalObservation),
    views,
    colliderOverlayPngContentHash: pngHash,
  });
  const originalEvidence = buildWorldReconstructionEvidenceSetV1({
    ...fixture,
    caseRef,
    captureReceiptRef,
    captureReceipt: originalCaptureReceipt,
    openingObservation: openingObservationBase,
    semanticViewObservationSet: originalSemanticViewObservationSet,
    spawnSupportObservation,
    colliderOverlayObservation,
    scriptedTraversalObservation,
  });
  const originalEvaluation = evaluateWorldReconstructionV1({
    case: fixture.reconstructionCase,
    profile: fixture.evaluationProfile,
    evidence: originalEvidence,
  });
  const openingObservation = forgePassedEvaluation
    ? {
      ...openingObservationBase,
      visualGroups: openingObservationBase.visualGroups.map(
        (group, index, groups) => ({
          ...group,
          depthOrder: groups.length - 1 - index,
        }),
      ),
    }
    : openingObservationBase;
  const semanticViewObservationSet = createSemanticViewObservationSetFixtureV1(openingObservation, views);
  const captureReceipt = forgePassedEvaluation
    ? parseFormalWorldCaptureReceiptV1({
      ...originalCaptureReceipt,
      openingObservationContentHash:
        hashFormalOpeningObservationV1(openingObservation),
      semanticViewObservationSetContentHash: hashFormalSemanticViewObservationSetV1(semanticViewObservationSet),
    })
    : originalCaptureReceipt;
  await writeFile(path.join(captureDirectoryPath, "opening.png"), openingPng);
  for (const name of ["world-top-down", "world-side", "collider-overlay"] as const) {
    await writeFile(path.join(captureDirectoryPath, `${name}.png`), PNG);
  }
  await writeJson(path.join(captureDirectoryPath, "opening-observation.json"), openingObservation);
  await writeJson(path.join(captureDirectoryPath, "semantic-view-observation-set.json"), semanticViewObservationSet);
  await writeJson(path.join(captureDirectoryPath, "spawn-support-observation.json"), spawnSupportObservation);
  await writeJson(path.join(captureDirectoryPath, "collider-overlay-observation.json"), colliderOverlayObservation);
  await writeJson(path.join(captureDirectoryPath, "scripted-traversal.json"), scriptedTraversalObservation);
  await writeJson(path.join(captureDirectoryPath, "formal-world-capture-receipt.json"), captureReceipt);

  const evidence = buildWorldReconstructionEvidenceSetV1({
    ...fixture,
    caseRef,
    captureReceiptRef,
    captureReceipt,
    openingObservation,
    semanticViewObservationSet,
    spawnSupportObservation,
    colliderOverlayObservation,
    scriptedTraversalObservation,
  });
  const evaluated = evaluateWorldReconstructionV1({
    case: fixture.reconstructionCase,
    profile: fixture.evaluationProfile,
    evidence,
  });
  const evaluation = forgePassedEvaluation
    ? parseWorldReconstructionEvaluationResultV1({
      ...originalEvaluation,
      evidenceSetHash: hashWorldReconstructionEvidenceSetV1(evidence),
      captureReceiptHash: hashFormalWorldCaptureReceiptV1(captureReceipt),
      dimensions: originalEvaluation.dimensions.map((dimension) => ({
        ...dimension,
        identity: {
          ...dimension.identity,
          captureReceiptHash: hashFormalWorldCaptureReceiptV1(captureReceipt),
        },
      })),
    })
    : parseWorldReconstructionEvaluationResultV1(evaluated);
  if (
    !forgePassedEvaluation &&
    evaluationPasses &&
    !evidenceOptions.withoutScriptedTraversal &&
    evaluation.outcome !== "passed"
  ) {
    throw new Error("fixture evidence must earn a passed evaluation");
  }
  if (!evaluationPasses && evaluation.outcome === "passed") {
    throw new Error("fixture evidence must retain a non-passing evaluation");
  }
  if (evidenceOptions.withoutScriptedTraversal && evaluation.outcome !== "incomplete") {
    throw new Error("fixture without scripts must retain incomplete traversal evidence");
  }
  await writeJson(path.join(attemptDirectoryPath, "evidence-set.json"), evidence);
  await writeJson(path.join(attemptDirectoryPath, "evaluation.json"), evaluation);
  const captureReceiptHash = hashFormalWorldCaptureReceiptV1(captureReceipt);
  const evaluationHash = hashWorldReconstructionEvaluationResultV1(evaluation);
  const runReceipt = parseWorldReconstructionRunReceiptV1({
    kind: "world-reconstruction-run-receipt",
    schemaVersion: 1,
    id: "package-fixture.run",
    caseRef,
    caseHash: hashWorldReconstructionCaseV1(fixture.reconstructionCase),
    evaluationProfileRef: fixture.evaluationProfileRef,
    evaluationProfileHash: hashWorldReconstructionEvaluationProfileV1(fixture.evaluationProfile),
    outcome: evaluation.outcome,
    diagnosticCodes: evaluation.outcome === "passed"
      ? []
      : [...new Set(evaluation.diagnostics.map(({ code }) => code))].sort(),
    attempts: [{
      kind: "evaluated",
      attemptIndex: 0,
      generationRequestRef: `${attemptArtifactRoot}/generation-request.json`,
      generationRequestHash: hashNativeBlockGenerationRequestV1(request),
      generationReceiptRef: `${attemptArtifactRoot}/generation-receipt.json`,
      generationReceiptHash: hashNativeBlockGenerationReceiptV1(generationReceipt),
      sceneAuthoringAttemptRef: `${attemptArtifactRoot}/attempt.json`,
      sceneAuthoringAttemptHash: hashSceneAuthoringAttemptV1(verified.sceneAuthoringAttempt),
      sceneAuthoringAttemptResultRef: `${attemptArtifactRoot}/attempt-result.json`,
      sceneAuthoringAttemptResultHash: hashSceneAuthoringAttemptResultV1(verified.sceneAuthoringAttemptResult),
      worldPackageRef: verified.receipt.worldPackageRef,
      worldPackageRootHash: verified.receipt.worldPackageRootHash,
      worldPackageBuildReceiptRef: captureReceipt.worldPackageBuildReceiptRef,
      worldPackageBuildReceiptHash: sha256CanonicalJson(verified.receipt),
      worldBuildIdentityRef: captureReceipt.worldBuildIdentityRef,
      worldBuildIdentityHash: verified.receipt.worldBuildIdentityHash,
      groundAnalysisReportRef:
        `${attemptArtifactRoot}/ground-analysis-report.json`,
      groundAnalysisReportHash,
      captureReceiptRef,
      captureReceiptHash,
      evaluationResultRef: `${attemptArtifactRoot}/evaluation.json`,
      evaluationResultHash: evaluationHash,
      outcome: evaluation.outcome,
    }],
    finalAttemptIndex: 0,
    finalEvaluationResultRef: `${attemptArtifactRoot}/evaluation.json`,
    finalEvaluationResultHash: evaluationHash,
    cleanupOutcome: "completed",
  });
  await writeJson(path.join(runDirectoryPath, "run-receipt.json"), runReceipt);
  const strictDiagnostic = parseWorldReconstructionStrictDiagnosticReceiptV1({
    kind: "world-reconstruction-strict-diagnostic-receipt",
    schemaVersion: 1,
    id: "package-fixture.strict-diagnostic",
    caseRef,
    caseHash: runReceipt.caseHash,
    runReceiptRef:
      `${caseRef.slice(0, -"/case.json".length)}/runs/formal-fixture/run-receipt.json`,
    runReceiptHash: sha256CanonicalJson(runReceipt),
    attemptIndex: 0,
    worldPackageRef: verified.receipt.worldPackageRef,
    worldPackageRootHash: verified.receipt.worldPackageRootHash,
    worldBuildIdentityHash: verified.receipt.worldBuildIdentityHash,
    captureReceiptHash,
    evaluationResultHash: evaluationHash,
    outcome: strictDiagnosticFails ? "failed" : evidenceOptions.withoutScriptedTraversal ? "incomplete" : "passed",
    diagnosticCodes: strictDiagnosticFails
      ? ["NBR70_BLOCKER_IDENTITY_MISMATCH"]
      : evidenceOptions.withoutScriptedTraversal ? ["NBR70_EVALUATION_NOT_PASSED"] : [],
    cleanupOutcome: strictDiagnosticFails ? "not-started" : "completed",
  });
  await writeJson(
    path.join(runDirectoryPath, "strict-diagnostic.json"),
    strictDiagnostic,
  );
  return { caseDirectoryPath, runDirectoryPath };
}

async function finalLaunchFixture(input: Readonly<{
  caseDirectoryPath: string;
  runDirectoryPath: string;
}>) {
  const runReceipt = parseWorldReconstructionRunReceiptV1(JSON.parse(
    await readFile(path.join(input.runDirectoryPath, "run-receipt.json"), "utf8"),
  ));
  const finalAttempt = getWorldReconstructionFinalEvaluatedAttemptV1(runReceipt);
  const strictDiagnostic = parseWorldReconstructionStrictDiagnosticReceiptV1(
    JSON.parse(await readFile(
      path.join(input.runDirectoryPath, "strict-diagnostic.json"),
      "utf8",
    )),
  );
  const openingPngBytes = new Uint8Array(await readFile(path.join(
    input.runDirectoryPath,
    `attempts/${finalAttempt.attemptIndex}/capture/opening.png`,
  )));
  const openingObservation = parseFormalOpeningObservationV1(JSON.parse(
    await readFile(path.join(
      input.runDirectoryPath,
      `attempts/${finalAttempt.attemptIndex}/capture/opening-observation.json`,
    ), "utf8"),
  ));
  const entryValidation = await validateFormalOpeningEntryThirdPersonV1({
    openingPngBytes,
    openingObservation,
  });
  return {
    kind: "native-block-reconstruction-launch" as const,
    schemaVersion: 1 as const,
    caseId: "package-fixture.case",
    runReceiptRef: `${runReceipt.caseRef.slice(0, -"/case.json".length)}/runs/${
      path.basename(input.runDirectoryPath)
    }/run-receipt.json`,
    runReceiptHash: sha256CanonicalJson(runReceipt) as Sha256HashV1,
    worldPackageRelativePath: "final/world-package" as const,
    worldPackageRef: finalAttempt.worldPackageRef,
    worldPackageRootHash: finalAttempt.worldPackageRootHash,
    captureReceiptRelativePath:
      "final/capture/formal-world-capture-receipt.json" as const,
    captureReceiptHash: finalAttempt.captureReceiptHash,
    evaluationRelativePath: "final/evaluation.json" as const,
    evaluationHash: finalAttempt.evaluationResultHash,
    strictDiagnosticRelativePath: "final/strict-diagnostic.json" as const,
    strictDiagnosticHash:
      hashWorldReconstructionStrictDiagnosticReceiptV1(strictDiagnostic),
    entryValidationRelativePath:
      "final/entry-third-person-validation.json" as const,
    entryValidationHash:
      hashEntryThirdPersonValidationResultV1(entryValidation),
    launchCommand:
      "pnpm worldkit native run final/world-package --port 5174 --json" as const,
  };
}

describe("Native Block reconstruction final artifact publisher integration", () => {
  it("verifies and publishes explicit recovered Package paths without replacing historical failed evidence", async () => {
    const fixture = await completeRunFixture();
    try {
      const root = path.join(fixture.runDirectoryPath, "attempts/0");
      const recovered = path.join(root, "host-recoveries/1");
      await mkdir(recovered, { recursive: true });
      for (const file of ["world-package", "attempt-result.json", "native-check-result.json", "native-explain.txt", "ground-analysis-report.json"]) {
        await rename(path.join(root, file), path.join(recovered, file));
      }
      await writeFile(path.join(root, "native-check-result.json"), "historical-rejected-check");
      const receiptPath = path.join(fixture.runDirectoryPath, "run-receipt.json");
      const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
      const attempt = receipt.attempts[0];
      for (const field of ["sceneAuthoringAttemptResultRef", "groundAnalysisReportRef"]) {
        attempt[field] = attempt[field].replace("/attempts/0/", "/attempts/0/host-recoveries/1/");
      }
      await writeJson(receiptPath, receipt);
      const diagnosticPath = path.join(fixture.runDirectoryPath, "strict-diagnostic.json");
      const diagnostic = JSON.parse(await readFile(diagnosticPath, "utf8"));
      diagnostic.runReceiptHash = hashWorldReconstructionRunReceiptV1(parseWorldReconstructionRunReceiptV1(receipt));
      await writeJson(diagnosticPath, diagnostic);
      await expect(verifyNativeBlockReconstructionProductionIntegrityV1({
        candidate: { kind: "run", runDirectoryPath: fixture.runDirectoryPath },
      })).resolves.toMatchObject({ outcome: "verified" });
      await expect(publishNativeBlockReconstructionFinalV1({ ...fixture, launch: await finalLaunchFixture(fixture) }))
        .resolves.toMatchObject({ outcome: "published" });
      expect(await readFile(path.join(root, "native-check-result.json"), "utf8")).toBe("historical-rejected-check");
    } finally { await rm(fixture.caseDirectoryPath, { recursive: true, force: true }); }
  }, 15_000);
  it("rejects a Run Receipt bound to a foreign Case namespace before publication", async () => {
    const fixture = await completeRunFixture({
      caseRefOverride:
        "artifact://world-reconstruction-case/foreign.case/case.json",
    });
    try {
      await expect(publishNativeBlockReconstructionFinalV1({
        ...fixture,
        launch: await finalLaunchFixture(fixture),
      })).rejects.toThrow(
        "NBR_FINAL_ARTIFACT_PUBLICATION_INVALID: Run Receipt Case ref is foreign",
      );
    } finally {
      await rm(fixture.caseDirectoryPath, { recursive: true, force: true });
    }
  });

  it("publishes a no-script production Capture but rejects it as strict traversal acceptance", async () => {
    const fixture = await completeRunFixture({ withoutScriptedTraversal: true });
    try {
      await expect(verifyNativeBlockReconstructionProductionIntegrityV1({
        candidate: { kind: "run", runDirectoryPath: fixture.runDirectoryPath },
      })).resolves.toMatchObject({ outcome: "verified", playability: { mode: "skipped" },
        strictDiagnosticCodes: expect.arrayContaining(["NBR70_EVALUATION_NOT_PASSED"]),
      });
      await expect(verifyNativeBlockReconstructionE2EV1({
        candidate: { kind: "run", runDirectoryPath: fixture.runDirectoryPath },
        playability: Object.freeze({ mode: "skipped" }),
      })).rejects.toThrow("NBR70_SCRIPTED_TRAVERSAL_REQUIRED");
      await expect(publishNativeBlockReconstructionFinalV1({
        ...fixture, launch: await finalLaunchFixture(fixture),
      })).resolves.toMatchObject({ outcome: "published" });
      expect(parseWorldReconstructionStrictDiagnosticReceiptV1(JSON.parse(await readFile(
        path.join(fixture.caseDirectoryPath, "final/strict-diagnostic.json"), "utf8",
      )))).toMatchObject({ outcome: "incomplete", diagnosticCodes: ["NBR70_EVALUATION_NOT_PASSED"] });
    } finally {
      await rm(fixture.caseDirectoryPath, { recursive: true, force: true });
    }
  }, 15_000);

  it("publishes the exact statically verified candidate and bound diagnostic", async () => {
    const fixture = await completeRunFixture();
    try {
      await expect(publishNativeBlockReconstructionFinalV1({
        ...fixture,
        launch: await finalLaunchFixture(fixture),
      })).resolves.toMatchObject({
        outcome: "published",
        strictDiagnosticHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      });
      await expect(readFile(path.join(
        fixture.caseDirectoryPath,
        "final/launch.json",
      ))).resolves.toBeInstanceOf(Buffer);
      await expect(readFile(path.join(
        fixture.caseDirectoryPath,
        "final/strict-diagnostic.json",
      ))).resolves.toBeInstanceOf(Buffer);
      await expect(readFile(path.join(
        fixture.caseDirectoryPath,
        ".final-publish.lock",
      ))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(fixture.caseDirectoryPath, { recursive: true, force: true });
    }
  }, 15_000);

  it("publishes when the separately recorded strict diagnostic failed", async () => {
    const fixture = await completeRunFixture({ strictDiagnosticFails: true });
    try {
      await expect(publishNativeBlockReconstructionFinalV1({
        ...fixture,
        launch: await finalLaunchFixture(fixture),
      })).resolves.toMatchObject({ outcome: "published" });
      const publishedDiagnostic = parseWorldReconstructionStrictDiagnosticReceiptV1(
        JSON.parse(await readFile(
          path.join(fixture.caseDirectoryPath, "final/strict-diagnostic.json"),
          "utf8",
        )),
      );
      expect(publishedDiagnostic).toMatchObject({
        outcome: "failed",
        diagnosticCodes: ["NBR70_BLOCKER_IDENTITY_MISMATCH"],
      });
    } finally {
      await rm(fixture.caseDirectoryPath, { recursive: true, force: true });
    }
  });

  it("rejects an empty final created immediately before the final existence check", async () => {
    const fixture = await completeRunFixture();
    const publish = createNativeBlockFinalArtifactPublisherTestAdapterV1({
      async beforeFinalExistenceCheck(finalDirectoryPath) {
        await mkdir(finalDirectoryPath);
      },
    });
    try {
      await expect(publish({
        ...fixture,
        launch: await finalLaunchFixture(fixture),
      })).rejects.toThrow("NBR_FINAL_ARTIFACT_PUBLICATION_INVALID");
      await expect(readFile(path.join(
        fixture.caseDirectoryPath,
        ".final-staging/launch.json",
      ))).rejects.toMatchObject({ code: "ENOENT" });
      await expect(readFile(path.join(
        fixture.caseDirectoryPath,
        ".final-publish.lock",
      ))).rejects.toMatchObject({ code: "ENOENT" });
      await expect(readdir(path.join(
        fixture.caseDirectoryPath,
        "final",
      ))).resolves.toEqual([]);
    } finally {
      await rm(fixture.caseDirectoryPath, { recursive: true, force: true });
    }
  }, 15_000);

  it("rejects an unbound strict diagnostic before publication", async () => {
    const fixture = await completeRunFixture();
    const launch = await finalLaunchFixture(fixture);
    await writeFile(
      path.join(fixture.runDirectoryPath, "strict-diagnostic.json"),
      "{}\n",
    );
    try {
      await expect(publishNativeBlockReconstructionFinalV1({
        ...fixture,
        launch,
      })).rejects.toThrow("NBR_FINAL_ARTIFACT_PUBLICATION_INVALID");
    } finally {
      await rm(fixture.caseDirectoryPath, { recursive: true, force: true });
    }
  }, 15_000);

  it("serializes official publishers with one Case-scoped lock", async () => {
    const fixture = await completeRunFixture();
    let announceSync!: () => void;
    let releaseSync!: () => void;
    const syncStarted = new Promise<void>((resolve) => {
      announceSync = resolve;
    });
    const syncReleased = new Promise<void>((resolve) => {
      releaseSync = resolve;
    });
    let hasBlocked = false;
    const blockingPublish = createNativeBlockFinalArtifactPublisherTestAdapterV1({
      async beforeSync(_absolutePath, phase) {
        if (phase === "staging" && !hasBlocked) {
          hasBlocked = true;
          announceSync();
          await syncReleased;
        }
      },
    });
    const launch = await finalLaunchFixture(fixture);
    const firstPublication = blockingPublish({
      ...fixture,
      launch,
    });
    try {
      await syncStarted;
      await expect(readFile(path.join(
        fixture.caseDirectoryPath,
        ".final-publish.lock",
      ))).resolves.toBeInstanceOf(Buffer);
      await expect(publishNativeBlockReconstructionFinalV1({
        ...fixture,
        launch,
      })).rejects.toThrow("NBR_FINAL_ARTIFACT_PUBLICATION_INVALID");
      releaseSync();
      await expect(firstPublication).resolves.toMatchObject({ outcome: "published" });
    } finally {
      releaseSync();
      await firstPublication.catch(() => undefined);
      await rm(fixture.caseDirectoryPath, { recursive: true, force: true });
    }
  }, 15_000);

  it("cleans owned staging and lock when the immutable Run mutates", async () => {
    const fixture = await completeRunFixture();
    let hasMutated = false;
    const publish = createNativeBlockFinalArtifactPublisherTestAdapterV1({
      async beforeSync(_absolutePath, phase) {
        if (phase === "staging" && !hasMutated) {
          hasMutated = true;
          await writeFile(
            path.join(fixture.runDirectoryPath, "run-receipt.json"),
            "{}\n",
          );
        }
      },
    });
    try {
      await expect(publish({
        ...fixture,
        launch: await finalLaunchFixture(fixture),
      })).rejects.toThrow("NBR_FINAL_ARTIFACT_PUBLICATION_INVALID");
      for (const relativePath of [
        ".final-staging",
        ".final-publish.lock",
        "final",
      ]) {
        await expect(readFile(path.join(fixture.caseDirectoryPath, relativePath)))
          .rejects.toMatchObject({ code: "ENOENT" });
      }
    } finally {
      await rm(fixture.caseDirectoryPath, { recursive: true, force: true });
    }
  }, 15_000);
});

async function createFinalCandidate(input: Readonly<{
  caseDirectoryPath: string;
  runDirectoryPath: string;
}>): Promise<string> {
  const finalDirectoryPath = path.join(input.caseDirectoryPath, ".final-staging");
  const attemptRoot = path.join(input.runDirectoryPath, "attempts/0");
  await mkdir(finalDirectoryPath, { recursive: true });
  await cp(
    path.join(attemptRoot, "world-package"),
    path.join(finalDirectoryPath, "world-package"),
    { recursive: true },
  );
  await cp(
    path.join(attemptRoot, "capture"),
    path.join(finalDirectoryPath, "capture"),
    { recursive: true },
  );
  await cp(
    path.join(attemptRoot, "evaluation.json"),
    path.join(finalDirectoryPath, "evaluation.json"),
  );
  await cp(
    path.join(input.runDirectoryPath, "strict-diagnostic.json"),
    path.join(finalDirectoryPath, "strict-diagnostic.json"),
  );
  const runReceipt = parseWorldReconstructionRunReceiptV1(JSON.parse(
    await readFile(path.join(input.runDirectoryPath, "run-receipt.json"), "utf8"),
  ));
  const finalAttempt = getWorldReconstructionFinalEvaluatedAttemptV1(runReceipt);
  const strictDiagnostic = parseWorldReconstructionStrictDiagnosticReceiptV1(
    JSON.parse(await readFile(
      path.join(input.runDirectoryPath, "strict-diagnostic.json"),
      "utf8",
    )),
  );
  const openingObservation = parseFormalOpeningObservationV1(JSON.parse(
    await readFile(
      path.join(attemptRoot, "capture/opening-observation.json"),
      "utf8",
    ),
  ));
  const entryValidation = await validateFormalOpeningEntryThirdPersonV1({
    openingPngBytes: new Uint8Array(await readFile(
      path.join(attemptRoot, "capture/opening.png"),
    )),
    openingObservation,
  });
  await writeFile(
    path.join(finalDirectoryPath, "entry-third-person-validation.json"),
    entryThirdPersonValidationResultCanonicalBytesV1(entryValidation),
  );
  await writeJson(path.join(finalDirectoryPath, "launch.json"), {
    kind: "native-block-reconstruction-launch",
    schemaVersion: 1,
    caseId: "package-fixture.case",
    runReceiptRef:
      "artifact://world-reconstruction-case/package-fixture.case/runs/formal-fixture/run-receipt.json",
    runReceiptHash: sha256CanonicalJson(runReceipt),
    worldPackageRelativePath: "final/world-package",
    worldPackageRef: finalAttempt.worldPackageRef,
    worldPackageRootHash: finalAttempt.worldPackageRootHash,
    captureReceiptRelativePath:
      "final/capture/formal-world-capture-receipt.json",
    captureReceiptHash: finalAttempt.captureReceiptHash,
    evaluationRelativePath: "final/evaluation.json",
    evaluationHash: finalAttempt.evaluationResultHash,
    strictDiagnosticRelativePath: "final/strict-diagnostic.json",
    strictDiagnosticHash:
      hashWorldReconstructionStrictDiagnosticReceiptV1(strictDiagnostic),
    entryValidationRelativePath:
      "final/entry-third-person-validation.json",
    entryValidationHash:
      hashEntryThirdPersonValidationResultV1(entryValidation),
    launchCommand:
      "pnpm worldkit native run final/world-package --port 5174 --json",
  });
  return finalDirectoryPath;
}

async function addRepairAttempt(input: Readonly<{
  runDirectoryPath: string;
}>): Promise<void> {
  const seedFixture = createEvidenceSetFixtureInputV1({ allDimensionsPass: true });
  const seedRequest = generationRequestFixture(seedFixture);
  const attemptArtifactRoot =
    `artifact://world-reconstruction-case/${seedFixture.reconstructionCase.id}/runs/formal-fixture/attempts/1`;
  const generationRequestRef =
    `${attemptArtifactRoot}/generation-request.json`;
  const captureReceiptRef =
    `${attemptArtifactRoot}/capture/formal-world-capture-receipt.json`;
  const requestShape = parseNativeBlockGenerationRequestV1({
    ...seedRequest,
    id: "package-fixture.repair",
    taskInstructionHash: H("e"),
  });
  const fixture = createEvidenceSetFixtureInputV1({
    allDimensionsPass: true,
    attemptIdentity: {
      attemptIndex: 1,
      generationRequestRef,
      generationRequestHash: hashNativeBlockGenerationRequestV1(requestShape),
    },
  });
  const verified = fixture.verifiedWorldPackage;
  const request = generationRequestFixture(fixture, {
    id: "package-fixture.repair",
    taskInstructionHash: H("e"),
  });
  if (hashNativeBlockGenerationRequestV1(request) !==
      hashNativeBlockGenerationRequestV1(requestShape)) {
    throw new Error("repair generation fixture identity drift");
  }
  const attemptRoot = path.join(input.runDirectoryPath, "attempts/1");
  const captureRoot = path.join(attemptRoot, "capture");
  await mkdir(captureRoot, { recursive: true });
  const sourceByPath = new Map([
    ["native-block-authoring.json", new TextEncoder().encode(
      `${stringifyCanonicalJson(fixture.authoringManifest)}\n`,
    )],
    ["native-resources.json", new TextEncoder().encode("[]")],
    ["scene.ts", new TextEncoder().encode("export default { repair: true };\n")],
  ] as const);
  const generationReceipt = parseNativeBlockGenerationReceiptV1({
    kind: "native-block-generation-receipt",
    schemaVersion: 1,
    id: "package-fixture.repair.receipt",
    generationRequestRef,
    generationRequestHash: hashNativeBlockGenerationRequestV1(request),
    routerTaskPayloadHash: H("f"),
    taskInstructionHash: request.taskInstructionHash,
    builderSkillHash: request.builderSkillHash,
    workspaceContextManifestHash: request.workspaceContextManifestHash,
    routerRequestId: "package-fixture-repair",
    backend: "cloud",
    executionProfile: "formal",
    resolvedModel: "gpt-5.6-sol",
    resolvedReasoningEffort: "xhigh",
    outcome: "completed",
    outputs: [...sourceByPath].map(([relativePath, bytes]) => ({
      path: relativePath,
      contentHash: sha256Bytes(bytes),
      sizeBytes: bytes.byteLength,
      mediaType: relativePath === "scene.ts" ? "text/typescript" : "application/json",
    })),
    diagnosticCodes: [],
    cleanupOutcome: "completed",
  });
  await writeJson(path.join(attemptRoot, "generation-request.json"), request);
  await writeJson(path.join(attemptRoot, "generation-receipt.json"), generationReceipt);
  await writeJson(path.join(attemptRoot, "scene-authoring-route-decision.json"),
    verified.sceneAuthoringRouteDecision);
  await writeJson(path.join(attemptRoot, "attempt.json"), verified.sceneAuthoringAttempt);
  await writeJson(path.join(attemptRoot, "attempt-result.json"),
    verified.sceneAuthoringAttemptResult);
  await mkdir(path.join(attemptRoot, "source"), { recursive: true });
  for (const [relativePath, bytes] of sourceByPath) {
    await writeFile(path.join(attemptRoot, "source", relativePath), bytes);
  }
  const sourceCheckResult = Object.freeze({
    ...verified.nativeSceneCheckResult,
    id: "package-fixture.native-scene-check",
  });
  await writeJson(path.join(attemptRoot, "native-check-result.json"),
    sourceCheckResult);
  await writeFile(path.join(attemptRoot, "native-explain.txt"),
    explainNativeSceneCheckResultV1(sourceCheckResult));
  await writeWorldPackageDirectoryV1({
    outputDirectoryPath: path.join(attemptRoot, "world-package"),
    directory: verified.directory,
  });
  const groundAnalysisReport = Object.freeze({
    kind: "babylon-native-block-ground-analysis-report",
    schemaVersion: 1,
    identity: Object.freeze({
      logicalGroundModelHash: H("6"),
      walkableTopologyHash: H("7"),
      traversalCapabilityEnvelopeHash: H("8"),
      caseHash: hashWorldReconstructionCaseV1(fixture.reconstructionCase),
      worldPackageRootHash: verified.receipt.worldPackageRootHash,
      measurementChunkPolicyHash: H("9"),
    }),
    analysisOutcome: "passed",
    admissionOutcome: "passed",
    failureFacts: Object.freeze([]),
    metrics: Object.freeze({}),
    standableNodes: Object.freeze([]),
  });
  await writeJson(
    path.join(attemptRoot, "ground-analysis-report.json"),
    groundAnalysisReport,
  );
  const pngHash = sha256Bytes(PNG) as Sha256HashV1;
  const recoveryViews = fixture.captureReceipt.views.map((view) => ({ ...view, pngContentHash: pngHash }));
  const semanticViewObservationSet = createSemanticViewObservationSetFixtureV1(fixture.openingObservation, recoveryViews);
  const captureReceipt = parseFormalWorldCaptureReceiptV1({
    ...fixture.captureReceipt,
    views: recoveryViews,
    semanticViewObservationSetContentHash: hashFormalSemanticViewObservationSetV1(semanticViewObservationSet),
    colliderOverlayPngContentHash: pngHash,
  });
  for (const name of ["opening", "world-top-down", "world-side", "collider-overlay"] as const) {
    await writeFile(path.join(captureRoot, `${name}.png`), PNG);
  }
  await writeJson(path.join(captureRoot, "opening-observation.json"),
    fixture.openingObservation);
  await writeJson(path.join(captureRoot, "semantic-view-observation-set.json"), semanticViewObservationSet);
  await writeJson(path.join(captureRoot, "spawn-support-observation.json"),
    fixture.spawnSupportObservation);
  await writeJson(path.join(captureRoot, "collider-overlay-observation.json"),
    fixture.colliderOverlayObservation);
  await writeJson(path.join(captureRoot, "scripted-traversal.json"),
    fixture.scriptedTraversalObservation);
  await writeJson(path.join(captureRoot, "formal-world-capture-receipt.json"),
    captureReceipt);
  const evidence = buildWorldReconstructionEvidenceSetV1({
    ...fixture,
    captureReceiptRef,
    captureReceipt,
    semanticViewObservationSet,
  });
  const evaluation = evaluateWorldReconstructionV1({
    case: fixture.reconstructionCase,
    profile: fixture.evaluationProfile,
    evidence,
  });
  if (evaluation.outcome !== "passed") throw new Error("repair fixture must pass");
  await writeJson(path.join(attemptRoot, "evidence-set.json"), evidence);
  await writeJson(path.join(attemptRoot, "evaluation.json"), evaluation);
  const receiptPath = path.join(input.runDirectoryPath, "run-receipt.json");
  const first = parseWorldReconstructionRunReceiptV1(JSON.parse(
    await readFile(receiptPath, "utf8"),
  ));
  const repairAttempt = {
    kind: "evaluated" as const,
    attemptIndex: 1,
    generationRequestRef,
    generationRequestHash: hashNativeBlockGenerationRequestV1(request),
    generationReceiptRef: `${attemptArtifactRoot}/generation-receipt.json`,
    generationReceiptHash: hashNativeBlockGenerationReceiptV1(generationReceipt),
    sceneAuthoringAttemptRef: `${attemptArtifactRoot}/attempt.json`,
    sceneAuthoringAttemptHash: hashSceneAuthoringAttemptV1(verified.sceneAuthoringAttempt),
    sceneAuthoringAttemptResultRef: `${attemptArtifactRoot}/attempt-result.json`,
    sceneAuthoringAttemptResultHash:
      hashSceneAuthoringAttemptResultV1(verified.sceneAuthoringAttemptResult),
    worldPackageRef: verified.receipt.worldPackageRef,
    worldPackageRootHash: verified.receipt.worldPackageRootHash,
    worldPackageBuildReceiptRef: captureReceipt.worldPackageBuildReceiptRef,
    worldPackageBuildReceiptHash: sha256CanonicalJson(verified.receipt),
    worldBuildIdentityRef: captureReceipt.worldBuildIdentityRef,
    worldBuildIdentityHash: verified.receipt.worldBuildIdentityHash,
    groundAnalysisReportRef:
      `${attemptArtifactRoot}/ground-analysis-report.json`,
    groundAnalysisReportHash: sha256CanonicalJson(groundAnalysisReport),
    captureReceiptRef,
    captureReceiptHash: hashFormalWorldCaptureReceiptV1(captureReceipt),
    evaluationResultRef: `${attemptArtifactRoot}/evaluation.json`,
    evaluationResultHash: hashWorldReconstructionEvaluationResultV1(evaluation),
    outcome: "passed" as const,
  };
  await writeJson(receiptPath, parseWorldReconstructionRunReceiptV1({
    ...first,
    attempts: [first.attempts[0], repairAttempt],
    finalAttemptIndex: 1,
    finalEvaluationResultRef: repairAttempt.evaluationResultRef,
    finalEvaluationResultHash: repairAttempt.evaluationResultHash,
  }));
}

async function expectVerificationClosed(
  verification: Promise<unknown>,
  diagnosticCodes: readonly string[],
  cleanupOutcome: "completed" | "failed" | "not-started",
): Promise<NativeBlockReconstructionVerificationClosedErrorV1> {
  try {
    await verification;
  } catch (error) {
    expect(error).toBeInstanceOf(
      NativeBlockReconstructionVerificationClosedErrorV1,
    );
    expect(error).toMatchObject({ diagnosticCodes, cleanupOutcome });
    return error as NativeBlockReconstructionVerificationClosedErrorV1;
  }
  throw new Error("expected Native Block verification to close");
}

describe("Native Block reconstruction E2E verifier", () => {
  it("rejects a missing run-owned Formal Capture Intent before playability", async () => {
    const fixture = await completeRunFixture();
    const playability = playabilityPort();
    await unlink(path.join(
      fixture.runDirectoryPath,
      "inputs/formal-world-capture-intent.json",
    ));
    try {
      await expect(verifyNativeBlockReconstructionE2EV1({
        candidate: {
          kind: "run",
          runDirectoryPath: fixture.runDirectoryPath,
        },
        playability: playability.port,
      })).rejects.toThrow("NBR70_REQUIRED_ARTIFACT_MISSING");
      expect(playability.launch).not.toHaveBeenCalled();
    } finally {
      await rm(fixture.caseDirectoryPath, { recursive: true, force: true });
    }
  });
  it("requires exact Case-to-Contribution blockers and exact formal blocker joins", () => {
    const fixture = createEvidenceSetFixtureInputV1({
      allDimensionsPass: true,
      includePaletteTraversalDisagreement: true,
      traversalCheckExpectation: "block",
      traversalCheckpointCriteria: MIXED_BLOCK_CHECKPOINT_CRITERIA,
      traversalCheckpoints: [
        { checkpointId: "gate-approach", outcome: "reached", observedAtTick: 1 },
        { checkpointId: "gate-limit", outcome: "blocked", observedAtTick: 1 },
      ],
    });
    const verified = fixture.verifiedWorldPackage;
    const materializerMetadata = verified.kind === "babylon-native-scene"
      ? verified.nativeBlockMaterializerMetadata
      : undefined;
    if (verified.kind !== "babylon-native-scene" ||
        materializerMetadata === undefined) {
      throw new Error("fixture must include trusted Block metadata");
    }
    const valid = {
      caseBlockerColliderIds: ["palette-ground-blocker"],
      formalChecks: fixture.captureReceipt.formalRequest.scriptedTraversal.checks,
      contribution: verified.nativeSceneContribution,
      materializerMetadata,
    };
    expect(() => NATIVE_BLOCK_RECONSTRUCTION_E2E_TEST_HARNESS_V1
      .verifyBlockerEvidenceClosure(valid)).not.toThrow();
    expect(() => NATIVE_BLOCK_RECONSTRUCTION_E2E_TEST_HARNESS_V1
      .verifyBlockerEvidenceClosure({
        ...valid,
        contribution: {
          ...valid.contribution,
          staticColliders: [
            ...valid.contribution.staticColliders,
            createBabylonNativeStaticColliderContributionV1({
              id: "ground-safety-boundary:fixture",
              runtimeRole: "ground-safety-boundary",
              worldPositionsMetersXYZ: [
                -1, 0, -1,
                1, 0, -1,
                0, 1, -1,
              ],
              triangleIndices: [0, 1, 2],
              frictionRatio: 0.8,
              restitutionRatio: 0,
              traversalBinding: { kind: "not-traversable" },
            }),
          ],
        },
      })).not.toThrow();
    for (const invalid of [
      { ...valid, caseBlockerColliderIds: [] },
      { ...valid, caseBlockerColliderIds: ["palette-ground-blocker", "foreign"] },
      {
        ...valid,
        formalChecks: valid.formalChecks.map((check) => ({
          ...check,
          checkpointCriteria: [
            ...check.checkpointCriteria,
            ...check.checkpointCriteria.filter(({ kind }) => kind === "block-plane"),
          ],
        })),
      },
      {
        ...valid,
        contribution: {
          ...valid.contribution,
          staticColliders: valid.contribution.staticColliders.filter(
            ({ id }) => id !== "palette-ground-blocker",
          ),
        },
      },
      {
        ...valid,
        materializerMetadata: {
          ...valid.materializerMetadata,
          colliderJoins: valid.materializerMetadata.colliderJoins.filter(
            ({ colliderId }) => colliderId !== "palette-ground-blocker",
          ),
        },
      },
      {
        ...valid,
        formalChecks: valid.formalChecks.map((check) => ({
          ...check,
          checkpointCriteria: check.checkpointCriteria.map((criterion) =>
            criterion.kind === "block-plane"
              ? { ...criterion, sourceVisualGroupId: "upper-group" }
              : criterion),
        })),
      },
    ]) {
      expect(() => NATIVE_BLOCK_RECONSTRUCTION_E2E_TEST_HARNESS_V1
        .verifyBlockerEvidenceClosure(invalid)).toThrowError(
          "NBR70_BLOCKER_IDENTITY_MISMATCH",
        );
    }

    const mismatch = { ...valid, caseBlockerColliderIds: [] };
    expect(NATIVE_BLOCK_RECONSTRUCTION_E2E_TEST_HARNESS_V1
      .verifyBlockerEvidenceClosureForContext({
        ...mismatch,
        mode: "production-integrity",
        diagnosticAuthority: "historical",
      })).toEqual({ blockerColliderIds: [], strictDiagnosticCodes: [] });
    expect(NATIVE_BLOCK_RECONSTRUCTION_E2E_TEST_HARNESS_V1
      .verifyBlockerEvidenceClosureForContext({
        ...mismatch,
        mode: "production-integrity",
        diagnosticAuthority: "terminal",
      })).toEqual({
        blockerColliderIds: [],
        strictDiagnosticCodes: ["NBR70_BLOCKER_IDENTITY_MISMATCH"],
      });
    expect(() => NATIVE_BLOCK_RECONSTRUCTION_E2E_TEST_HARNESS_V1
      .verifyBlockerEvidenceClosureForContext({
        ...mismatch,
        mode: "strict-acceptance",
        diagnosticAuthority: "historical",
      })).toThrowError("NBR70_BLOCKER_IDENTITY_MISMATCH");
  });

  it("rejects contributed Case blockers without a dedicated scripted block check", () => {
    const fixture = createEvidenceSetFixtureInputV1({
      allDimensionsPass: true,
      includePaletteTraversalDisagreement: true,
      traversalCheckExpectation: "block",
      traversalCheckpointCriteria: MIXED_BLOCK_CHECKPOINT_CRITERIA,
      traversalCheckpoints: [
        { checkpointId: "gate-approach", outcome: "reached", observedAtTick: 1 },
        { checkpointId: "gate-limit", outcome: "blocked", observedAtTick: 1 },
      ],
    });
    const verified = fixture.verifiedWorldPackage;
    const materializerMetadata = verified.kind === "babylon-native-scene"
      ? verified.nativeBlockMaterializerMetadata
      : undefined;
    if (verified.kind !== "babylon-native-scene" ||
        materializerMetadata === undefined) {
      throw new Error("fixture must include trusted Block metadata");
    }
    const unmeasuredBlocker = createBabylonNativeStaticColliderContributionV1({
      id: "unmeasured-case-blocker",
      runtimeRole: "scene-static-collider",
      worldPositionsMetersXYZ: [
        -1, 0, -1,
        1, 0, -1,
        0, 1, -1,
      ],
      triangleIndices: [0, 1, 2],
      frictionRatio: 0.8,
      restitutionRatio: 0,
      traversalBinding: { kind: "not-traversable" },
    });

    expect(() => NATIVE_BLOCK_RECONSTRUCTION_E2E_TEST_HARNESS_V1
      .verifyBlockerEvidenceClosure({
        caseBlockerColliderIds: [
          "palette-ground-blocker",
          "unmeasured-case-blocker",
        ],
        formalChecks: fixture.captureReceipt.formalRequest.scriptedTraversal.checks,
        contribution: {
          ...verified.nativeSceneContribution,
          staticColliders: [
            ...verified.nativeSceneContribution.staticColliders,
            unmeasuredBlocker,
          ],
        },
        materializerMetadata,
      })).toThrowError("NBR70_BLOCKER_IDENTITY_MISMATCH");
  });

  it("requires a passing ground traversal to finish inside its frozen band endpoint", () => {
    const band = {
      acceptanceTargetRef: "worldkit://acceptance-target/upper@1",
      id: "upper-arm-band",
      centerlineStandPositionsXYZMeters: [
        { xMeters: 0, yMeters: 0, zMeters: 0 },
        { xMeters: -3, yMeters: 0, zMeters: -12 },
      ],
      halfWidthMeters: 1,
    } as const;
    const input = {
      checkExpectation: "pass" as const,
      acceptanceTargetRef: band.acceptanceTargetRef,
      traversalBands: [band],
      finalPositionMetersXYZ: [-2.5, 0, -12] as const,
      finalMovementMedium: "ground" as const,
    };

    expect(() => NATIVE_BLOCK_RECONSTRUCTION_E2E_TEST_HARNESS_V1
      .verifyGroundPassEndpointClosure(input)).not.toThrow();
    expect(() => NATIVE_BLOCK_RECONSTRUCTION_E2E_TEST_HARNESS_V1
      .verifyGroundPassEndpointClosure({
        ...input,
        finalPositionMetersXYZ: [0, 0, -5],
      })).toThrowError("NBR70_PLAYABILITY_ROUTE_ENDPOINT_NOT_REACHED");
  });

  it("rejects an empty candidate before launching playability", async () => {
    const runDirectoryPath = await realpath(
      await mkdtemp(path.join(os.tmpdir(), "nbr70-empty-")),
    );
    const playability = playabilityPort();
    try {
      const error = await expectVerificationClosed(
        verifyNativeBlockReconstructionE2EV1({
          candidate: { kind: "run", runDirectoryPath },
          playability: playability.port,
        }),
        ["NBR70_RUN_RECEIPT_MISSING"],
        "not-started",
      );
      expect(error.message).toBe("NBR70_RUN_RECEIPT_MISSING");
      expect(playability.launch).not.toHaveBeenCalled();
    } finally {
      await rm(runDirectoryPath, { recursive: true, force: true });
    }
  });

  it("rejects a consistently rewritten foreign Case namespace", async () => {
    const fixture = await completeRunFixture({
      caseRefOverride:
        "artifact://world-reconstruction-case/foreign.case/case.json",
    });
    const playability = playabilityPort();
    try {
      await expect(verifyNativeBlockReconstructionE2EV1({
        candidate: { kind: "run", runDirectoryPath: fixture.runDirectoryPath },
        playability: playability.port,
      })).rejects.toThrowError("NBR70_CASE_REF_INVALID");
      expect(playability.launch).not.toHaveBeenCalled();
    } finally {
      await rm(fixture.caseDirectoryPath, { recursive: true, force: true });
    }
  });

  it("verifies a complete identity-bound artifact tree and bounded playability session", async () => {
    const fixture = await completeRunFixture();
    const playability = playabilityPort();
    try {
      await expect(verifyNativeBlockReconstructionE2EV1({
        candidate: { kind: "run", runDirectoryPath: fixture.runDirectoryPath },
        playability: playability.port,
      })).resolves.toMatchObject({
        outcome: "verified",
        attemptIndex: 0,
        playability: {
          groundedSpawn: true,
          moved: true,
          jumped: true,
          reset: true,
          scriptedTraversalChecks: [{ id: "reach-ground", outcome: "passed" }],
        },
      });
      expect(playability.launch).toHaveBeenCalledOnce();
      expect(playability.dispose).toHaveBeenCalledOnce();
      expect(playability.resetWithInitialControlBinding).toHaveBeenCalledTimes(9);
      expect(playability.readCommittedSubjectSupport).toHaveBeenCalledWith(
        "player",
        1,
      );
      expect(playability.launch).toHaveBeenCalledWith(expect.objectContaining({
        packageDirectoryPath: expect.stringContaining(
          `${path.sep}worldkit-native-build-`,
        ),
      }));
    } finally {
      await rm(fixture.runDirectoryPath, { recursive: true, force: true });
    }
  });

  it("requires role-bound semantic equivalence between source and Runtime replay checks", async () => {
    const fixture = await completeRunFixture();
    const checkPath = path.join(
      fixture.runDirectoryPath,
      "attempts/0/native-check-result.json",
    );
    const check = parseNativeSceneCheckResultV1(JSON.parse(
      await readFile(checkPath, "utf8"),
    ));
    const forged = parseNativeSceneCheckResultV1({
      ...check,
      checkedInput: {
        ...check.checkedInput,
        sceneModuleRef: "worldkit://native-scene/foreign-source@1",
      },
    });
    await writeJson(checkPath, forged);
    await writeFile(
      path.join(fixture.runDirectoryPath, "attempts/0/native-explain.txt"),
      explainNativeSceneCheckResultV1(forged),
    );
    const playability = playabilityPort();
    try {
      await expectVerificationClosed(
        verifyNativeBlockReconstructionE2EV1({
          candidate: {
            kind: "run",
            runDirectoryPath: fixture.runDirectoryPath,
          },
          playability: playability.port,
        }),
        ["NBR70_IDENTITY_MISMATCH"],
        "not-started",
      );
      expect(playability.launch).not.toHaveBeenCalled();
    } finally {
      await rm(fixture.caseDirectoryPath, { recursive: true, force: true });
    }
  });

  it("verifies every immutable Attempt before launching the terminal repair", async () => {
    const fixture = await completeRunFixture();
    await addRepairAttempt(fixture);
    const passingPlayability = playabilityPort();
    try {
      await expect(verifyNativeBlockReconstructionE2EV1({
        candidate: { kind: "run", runDirectoryPath: fixture.runDirectoryPath },
        playability: passingPlayability.port,
      })).resolves.toMatchObject({ attemptIndex: 1, outcome: "verified" });
      expect(passingPlayability.launch).toHaveBeenCalledOnce();
    } finally {
      await rm(fixture.caseDirectoryPath, { recursive: true, force: true });
    }

    const tampered = await completeRunFixture();
    await addRepairAttempt(tampered);
    const rejectingPlayability = playabilityPort();
    await writeFile(
      path.join(tampered.runDirectoryPath, "attempts/0/capture/opening.png"),
      Uint8Array.of(1, 2, 3),
    );
    try {
      await expect(verifyNativeBlockReconstructionE2EV1({
        candidate: { kind: "run", runDirectoryPath: tampered.runDirectoryPath },
        playability: rejectingPlayability.port,
      })).rejects.toThrowError("NBR70_CAPTURE_ARTIFACT_HASH_MISMATCH");
      expect(rejectingPlayability.launch).not.toHaveBeenCalled();
    } finally {
      await rm(tampered.caseDirectoryPath, { recursive: true, force: true });
    }
  }, 15_000);

  it("can verify immutable production identity without replaying playability", async () => {
    const fixture = await completeRunFixture();
    try {
      await expect(verifyNativeBlockReconstructionE2EV1({
        candidate: { kind: "run", runDirectoryPath: fixture.runDirectoryPath },
        playability: Object.freeze({ mode: "skipped" }),
      })).resolves.toMatchObject({
        outcome: "verified",
        candidateKind: "run",
        playability: { mode: "skipped" },
      });
    } finally {
      await rm(fixture.caseDirectoryPath, { recursive: true, force: true });
    }
  });

  it("reports non-passing Evaluation as strict production diagnostics", async () => {
    const fixture = await completeRunFixture({ evaluationPasses: false });
    try {
      await expect(verifyNativeBlockReconstructionProductionIntegrityV1({
        candidate: { kind: "run", runDirectoryPath: fixture.runDirectoryPath },
      })).resolves.toMatchObject({
        outcome: "verified",
        candidateKind: "run",
        playability: { mode: "skipped" },
        strictDiagnosticCodes: ["NBR70_EVALUATION_NOT_PASSED"],
        entryValidation: {
          kind: "worldkit-entry-third-person-validation",
          status: "passed",
          imageMeasurements: {
            subjectCenterXRatio: 0.5,
          },
          runtimeMeasurements: {
            cameraTargetEntityId: "player",
          },
        },
        entryValidationHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      });
      await expect(verifyNativeBlockReconstructionE2EV1({
        candidate: { kind: "run", runDirectoryPath: fixture.runDirectoryPath },
        playability: Object.freeze({ mode: "skipped" }),
      })).rejects.toThrowError("NBR70_CLEANUP_INCOMPLETE");
    } finally {
      await rm(fixture.caseDirectoryPath, { recursive: true, force: true });
    }
  });

  it("keeps the terminal #E85D5D pixel mask blocking in production integrity", async () => {
    const fixture = await completeRunFixture({ entryPasses: false });
    try {
      const failure = await verifyNativeBlockReconstructionProductionIntegrityV1({
        candidate: { kind: "run", runDirectoryPath: fixture.runDirectoryPath },
      }).then(() => undefined, (error: unknown) => error);
      expect(failure).toBeInstanceOf(
        NativeBlockReconstructionVerificationClosedErrorV1,
      );
      expect(failure).toMatchObject({
        diagnosticCodes: ["ENTRY_SUBJECT_NOT_CENTERED"],
      });
    } finally {
      await rm(fixture.caseDirectoryPath, { recursive: true, force: true });
    }
  });

  it("keeps missing Native Check evidence blocking in production integrity", async () => {
    const fixture = await completeRunFixture();
    await unlink(path.join(
      fixture.runDirectoryPath,
      "attempts/0/native-check-result.json",
    ));
    try {
      const failure = await verifyNativeBlockReconstructionProductionIntegrityV1({
        candidate: { kind: "run", runDirectoryPath: fixture.runDirectoryPath },
      }).then(() => undefined, (error: unknown) => error);
      expect(failure).toBeInstanceOf(
        NativeBlockReconstructionVerificationClosedErrorV1,
      );
      expect(failure).toMatchObject({
        diagnosticCodes: ["NBR70_REQUIRED_ARTIFACT_MISSING"],
      });
    } finally {
      await rm(fixture.caseDirectoryPath, { recursive: true, force: true });
    }
  });

  it("keeps successful Ground Analysis receipt deletion and forgery blocking", async () => {
    for (const mutation of ["deleted", "forged"] as const) {
      const fixture = await completeRunFixture();
      const reportPath = path.join(
        fixture.runDirectoryPath,
        "attempts/0/ground-analysis-report.json",
      );
      if (mutation === "deleted") {
        await unlink(reportPath);
      } else {
        const report = JSON.parse(await readFile(reportPath, "utf8"));
        await writeJson(reportPath, {
          ...report,
          admissionOutcome: "failed",
        });
      }
      try {
        const failure = await verifyNativeBlockReconstructionProductionIntegrityV1({
          candidate: { kind: "run", runDirectoryPath: fixture.runDirectoryPath },
        }).then(() => undefined, (error: unknown) => error);
        expect(failure).toBeInstanceOf(
          NativeBlockReconstructionVerificationClosedErrorV1,
        );
        expect(failure).toMatchObject({
          diagnosticCodes: [mutation === "deleted"
            ? "NBR70_GROUND_ANALYSIS_ARTIFACT_MISSING"
            : "NBR70_GROUND_ANALYSIS_EVIDENCE_INVALID"],
        });
      } finally {
        await rm(fixture.caseDirectoryPath, { recursive: true, force: true });
      }
    }
  });

  it("recomputes the evaluator result from measured Capture evidence", async () => {
    const fixture = await completeRunFixture({ forgePassedEvaluation: true });
    const playability = playabilityPort();
    try {
      await expect(verifyNativeBlockReconstructionE2EV1({
        candidate: { kind: "run", runDirectoryPath: fixture.runDirectoryPath },
        playability: playability.port,
      })).rejects.toThrowError("NBR70_EVALUATION_EVIDENCE_MISMATCH");
      expect(playability.launch).not.toHaveBeenCalled();
    } finally {
      await rm(fixture.caseDirectoryPath, { recursive: true, force: true });
    }
  });

  it("verifies promoted Final bytes and launches the promoted Package", async () => {
    const fixture = await completeRunFixture();
    const finalDirectoryPath = await createFinalCandidate(fixture);
    await applyGitCheckoutModes(path.join(
      fixture.runDirectoryPath,
      "attempts/0/world-package",
    ));
    await applyGitCheckoutModes(path.join(finalDirectoryPath, "world-package"));
    const playability = playabilityPort();
    try {
      await expect(verifyNativeBlockReconstructionE2EV1({
        candidate: {
          kind: "final",
          runDirectoryPath: fixture.runDirectoryPath,
          finalDirectoryPath,
        },
        playability: playability.port,
      })).resolves.toMatchObject({ candidateKind: "final", outcome: "verified" });
      expect(playability.launch).toHaveBeenCalledWith(expect.objectContaining({
        packageDirectoryPath: expect.stringContaining(
          `${path.sep}worldkit-native-build-`,
        ),
      }));
    } finally {
      await rm(fixture.caseDirectoryPath, { recursive: true, force: true });
    }
  }, 15_000);

  it("rejects promoted Final byte drift before launch", async () => {
    const fixture = await completeRunFixture();
    const finalDirectoryPath = await createFinalCandidate(fixture);
    const playability = playabilityPort();
    await writeFile(
      path.join(finalDirectoryPath, "capture/opening.png"),
      Uint8Array.of(1, 2, 3),
    );
    try {
      await expect(verifyNativeBlockReconstructionE2EV1({
        candidate: {
          kind: "final",
          runDirectoryPath: fixture.runDirectoryPath,
          finalDirectoryPath,
        },
        playability: playability.port,
      })).rejects.toThrowError("NBR70_FINAL_ARTIFACT_MISMATCH");
      expect(playability.launch).not.toHaveBeenCalled();
    } finally {
      await rm(fixture.caseDirectoryPath, { recursive: true, force: true });
    }
  });

  it("keeps an explicitly invoked Final verifier strict after diagnostic-only publication", async () => {
    const fixture = await completeRunFixture({ strictDiagnosticFails: true });
    const finalDirectoryPath = await createFinalCandidate(fixture);
    const playability = playabilityPort();
    try {
      await expect(verifyNativeBlockReconstructionE2EV1({
        candidate: {
          kind: "final",
          runDirectoryPath: fixture.runDirectoryPath,
          finalDirectoryPath,
        },
        playability: playability.port,
      })).rejects.toThrowError("NBR70_FINAL_STRICT_DIAGNOSTIC_NOT_PASSED");
      expect(playability.launch).not.toHaveBeenCalled();
    } finally {
      await rm(fixture.caseDirectoryPath, { recursive: true, force: true });
    }
  });

  it("proves a mixed approach-plus-blocker check and rejects crossing its frozen plane", async () => {
    const fixtureOptions = {
      includePaletteTraversalDisagreement: true,
      traversalCheckExpectation: "block" as const,
      traversalCheckpointCriteria: MIXED_BLOCK_CHECKPOINT_CRITERIA,
      traversalCheckpoints: [
        { checkpointId: "gate-approach", outcome: "reached" as const, observedAtTick: 1 },
        { checkpointId: "gate-limit", outcome: "blocked" as const, observedAtTick: 1 },
      ],
    };
    const passingFixture = await completeRunFixture(fixtureOptions);
    const passingPlayability = playabilityPort({ stopsAtBlocker: true });
    try {
      await expect(verifyNativeBlockReconstructionE2EV1({
        candidate: {
          kind: "run",
          runDirectoryPath: passingFixture.runDirectoryPath,
        },
        playability: passingPlayability.port,
      })).resolves.toMatchObject({
        playability: {
          scriptedTraversalChecks: [{
            id: "reach-ground",
            outcome: "blocked",
            checkpointIds: ["gate-approach", "gate-limit"],
          }, {
            id: "support-ground",
            outcome: "passed",
            checkpointIds: ["support-ground"],
          }],
        },
      });
      expect(passingPlayability.dispose).toHaveBeenCalledOnce();
    } finally {
      await rm(passingFixture.runDirectoryPath, { recursive: true, force: true });
    }

    const crossingFixture = await completeRunFixture(fixtureOptions);
    const crossingPlayability = playabilityPort({ crossesBlocker: true });
    try {
      await expect(verifyNativeBlockReconstructionE2EV1({
        candidate: {
          kind: "run",
          runDirectoryPath: crossingFixture.runDirectoryPath,
        },
        playability: crossingPlayability.port,
      })).rejects.toThrowError("NBR70_PLAYABILITY_TRAVERSAL_FAILED");
      expect(crossingPlayability.dispose).toHaveBeenCalledOnce();
    } finally {
      await rm(crossingFixture.runDirectoryPath, { recursive: true, force: true });
    }

    const neverApproachedFixture = await completeRunFixture(fixtureOptions);
    const neverApproachedPlayability = playabilityPort();
    try {
      await expect(verifyNativeBlockReconstructionE2EV1({
        candidate: {
          kind: "run",
          runDirectoryPath: neverApproachedFixture.runDirectoryPath,
        },
        playability: neverApproachedPlayability.port,
      })).rejects.toThrowError("NBR70_PLAYABILITY_TRAVERSAL_FAILED");
      expect(neverApproachedPlayability.dispose).toHaveBeenCalledOnce();
    } finally {
      await rm(neverApproachedFixture.runDirectoryPath, {
        recursive: true,
        force: true,
      });
    }
  }, 15_000);

  it("rejects missing and content-hash-drifted capture artifacts before launch", async () => {
    for (const mutation of ["missing", "hash-drift"] as const) {
      const fixture = await completeRunFixture();
      const playability = playabilityPort();
      const openingPath = path.join(fixture.runDirectoryPath, "attempts/0/capture/opening.png");
      if (mutation === "missing") await unlink(openingPath);
      else await writeFile(openingPath, Uint8Array.of(1, 2, 3));
      try {
        await expect(verifyNativeBlockReconstructionE2EV1({
          candidate: { kind: "run", runDirectoryPath: fixture.runDirectoryPath },
          playability: playability.port,
        })).rejects.toThrowError(
          mutation === "missing"
            ? "NBR70_CAPTURE_ARTIFACT_MISSING"
            : "NBR70_CAPTURE_ARTIFACT_HASH_MISMATCH",
        );
        expect(playability.launch).not.toHaveBeenCalled();
      } finally {
        await rm(fixture.runDirectoryPath, { recursive: true, force: true });
      }
    }
  });

  it("rejects stale run identity and incomplete cleanup before launch", async () => {
    for (const mutation of ["identity", "cleanup"] as const) {
      const fixture = await completeRunFixture();
      const playability = playabilityPort();
      const receiptPath = path.join(fixture.runDirectoryPath, "run-receipt.json");
      const receipt = JSON.parse(await readFile(receiptPath, "utf8")) as any;
      if (mutation === "identity") receipt.attempts[0].captureReceiptHash = H("f");
      else {
        receipt.cleanupOutcome = "failed";
        receipt.outcome = "incomplete";
        receipt.diagnosticCodes = ["WORLD_RECONSTRUCTION_CLEANUP_FAILED"];
      }
      await writeJson(receiptPath, receipt);
      try {
        await expect(verifyNativeBlockReconstructionE2EV1({
          candidate: { kind: "run", runDirectoryPath: fixture.runDirectoryPath },
          playability: playability.port,
        })).rejects.toThrowError(
          mutation === "identity"
            ? "NBR70_IDENTITY_MISMATCH"
            : "NBR70_CLEANUP_INCOMPLETE",
        );
        expect(playability.launch).not.toHaveBeenCalled();
      } finally {
        await rm(fixture.runDirectoryPath, { recursive: true, force: true });
      }
    }
  });

  it("fails closed on unmeasured scripted traversal and playability disposal failure", async () => {
    for (const mutation of ["traversal", "dispose"] as const) {
      const fixture = await completeRunFixture();
      const playability = playabilityPort({
        traversalFails: mutation === "traversal",
        cleanupFails: mutation === "dispose",
      });
      try {
        const diagnosticCode = mutation === "traversal"
          ? "NBR70_PLAYABILITY_TRAVERSAL_FAILED"
          : "NBR70_PLAYABILITY_CLEANUP_FAILED";
        const error = await expectVerificationClosed(
          verifyNativeBlockReconstructionE2EV1({
            candidate: {
              kind: "run",
              runDirectoryPath: fixture.runDirectoryPath,
            },
            playability: playability.port,
          }),
          [diagnosticCode],
          mutation === "traversal" ? "completed" : "failed",
        );
        expect(error.message).toBe(diagnosticCode);
        expect(playability.dispose).toHaveBeenCalledOnce();
      } finally {
        await rm(fixture.runDirectoryPath, { recursive: true, force: true });
      }
    }
  }, 15_000);

  it("reports failed cleanup when playability launch throws without a session", async () => {
    const fixture = await completeRunFixture();
    const launch = vi.fn(async () => {
      throw new NativeBlockReconstructionVerificationClosedErrorV1(
        ["NBR70_PLAYABILITY_LAUNCH_FAILED"],
        "completed",
      );
    });
    try {
      const error = await expectVerificationClosed(
        verifyNativeBlockReconstructionE2EV1({
          candidate: {
            kind: "run",
            runDirectoryPath: fixture.runDirectoryPath,
          },
          playability: { launch },
        }),
        ["NBR70_PLAYABILITY_LAUNCH_FAILED"],
        "failed",
      );
      expect(error.message).toBe("NBR70_PLAYABILITY_LAUNCH_FAILED");
    } finally {
      await rm(fixture.caseDirectoryPath, { recursive: true, force: true });
    }
  });

  it("reports failed cleanup when playability disposal throws", async () => {
    const fixture = await completeRunFixture();
    const playability = playabilityPort({ cleanupThrows: true });
    try {
      const error = await expectVerificationClosed(
        verifyNativeBlockReconstructionE2EV1({
          candidate: {
            kind: "run",
            runDirectoryPath: fixture.runDirectoryPath,
          },
          playability: playability.port,
        }),
        ["NBR70_PLAYABILITY_CLEANUP_FAILED"],
        "failed",
      );
      expect(error.message).toBe("NBR70_PLAYABILITY_CLEANUP_FAILED");
      expect(playability.dispose).toHaveBeenCalledOnce();
    } finally {
      await rm(fixture.caseDirectoryPath, { recursive: true, force: true });
    }
  });

  it("rejects reversed movement and a jump without an airborne phase", async () => {
    for (const mutation of ["direction", "jump"] as const) {
      const fixture = await completeRunFixture();
      const playability = playabilityPort({
        wrongDirection: mutation === "direction",
        jumpNeverAir: mutation === "jump",
      });
      try {
        await expect(verifyNativeBlockReconstructionE2EV1({
          candidate: { kind: "run", runDirectoryPath: fixture.runDirectoryPath },
          playability: playability.port,
        })).rejects.toThrowError(
          mutation === "direction"
            ? "NBR70_PLAYABILITY_MOVE_FAILED"
            : "NBR70_PLAYABILITY_JUMP_FAILED",
        );
        expect(playability.dispose).toHaveBeenCalledOnce();
      } finally {
        await rm(fixture.caseDirectoryPath, { recursive: true, force: true });
      }
    }
  }, 15_000);
});
