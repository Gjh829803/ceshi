import {
  chmod,
  cp,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
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
  hashFormalOpeningObservationV1,
  hashFormalWorldCaptureReceiptV1,
  parseFormalWorldCaptureReceiptV1,
  parseWorldRuntimeSnapshotV4,
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
  parseWorldReconstructionEvaluationResultV1,
  parseWorldReconstructionRunReceiptV1,
} from "@whitebox-world/validation";
import { writeWorldPackageDirectoryV1 } from "../lib/file-world-package.js";
import { buildWorldReconstructionEvidenceSetV1 } from "../reconstruction/evaluate-evidence-set.js";
import { createEvidenceSetFixtureInputV1 } from "../reconstruction/evaluate-fixture.test-support.js";
import {
  createNativeBlockFinalArtifactPublisherTestAdapterV1,
  publishNativeBlockReconstructionFinalV1,
} from "../reconstruction/final-artifact-publisher.js";
import { explainNativeSceneCheckResultV1 } from "../native-scene/explain.js";
import { describe, expect, it, vi } from "vitest";

import {
  NATIVE_BLOCK_RECONSTRUCTION_E2E_TEST_HARNESS_V1,
  NativeBlockReconstructionVerificationClosedErrorV1,
  verifyNativeBlockReconstructionE2EV1,
  type NativeBlockReconstructionPlayabilityLaunchPortV1,
  type NativeBlockReconstructionPlayabilitySessionPortV1,
} from "./verify-native-block-reconstruction-e2e.js";

const PNG = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
));
const H = (character: string) => `sha256:${character.repeat(64)}` as Sha256HashV1;
const MIXED_BLOCK_CHECKPOINT_CRITERIA = [{
  kind: "reach-bounds" as const,
  checkpointId: "gate-approach",
  expectation: "reach" as const,
  sourceVisualGroupId: "ground-group",
  sourceBoundsMeters: {
    minimumMetersXYZ: [-2, -1, -2] as const,
    maximumMetersXYZ: [2, 1, 2] as const,
  },
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

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${stringifyCanonicalJson(value)}\n`);
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
  }> = {},
) {
  const { forgePassedEvaluation = false, ...evidenceOptions } = options;
  const caseDirectoryPath = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "nbr70-complete-")),
  );
  const runDirectoryPath = path.join(caseDirectoryPath, "runs/formal-fixture");
  await mkdir(runDirectoryPath, { recursive: true });
  const fixture = createEvidenceSetFixtureInputV1({
    ...evidenceOptions,
    allDimensionsPass: true,
  });
  const verified = fixture.verifiedWorldPackage;
  const attemptDirectoryPath = path.join(runDirectoryPath, "attempts/0");
  const captureDirectoryPath = path.join(attemptDirectoryPath, "capture");
  await mkdir(captureDirectoryPath, { recursive: true });
  await chmod(attemptDirectoryPath, 0o700);
  await writeJson(path.join(caseDirectoryPath, "case.json"), fixture.reconstructionCase);
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
  await writeJson(path.join(attemptDirectoryPath, "native-check-result.json"), verified.nativeSceneCheckResult);
  await writeFile(
    path.join(attemptDirectoryPath, "native-explain.txt"),
    explainNativeSceneCheckResultV1(verified.nativeSceneCheckResult),
  );
  await writeWorldPackageDirectoryV1({
    outputDirectoryPath: path.join(attemptDirectoryPath, "world-package"),
    directory: verified.directory,
  });

  const pngHash = sha256Bytes(PNG) as Sha256HashV1;
  const originalCaptureReceipt = parseFormalWorldCaptureReceiptV1({
    ...fixture.captureReceipt,
    views: fixture.captureReceipt.views.map((view) => ({
      ...view,
      pngContentHash: pngHash,
    })),
    colliderOverlayPngContentHash: pngHash,
  });
  const originalEvidence = buildWorldReconstructionEvidenceSetV1({
    ...fixture,
    captureReceipt: originalCaptureReceipt,
  });
  const originalEvaluation = evaluateWorldReconstructionV1({
    case: fixture.reconstructionCase,
    profile: fixture.evaluationProfile,
    evidence: originalEvidence,
  });
  const openingObservation = forgePassedEvaluation
    ? {
      ...fixture.openingObservation,
      visualGroups: fixture.openingObservation.visualGroups.map(
        (group, index, groups) => ({
          ...group,
          depthOrder: groups.length - 1 - index,
        }),
      ),
    }
    : fixture.openingObservation;
  const captureReceipt = forgePassedEvaluation
    ? parseFormalWorldCaptureReceiptV1({
      ...originalCaptureReceipt,
      openingObservationContentHash:
        hashFormalOpeningObservationV1(openingObservation),
    })
    : originalCaptureReceipt;
  for (const name of ["opening", "world-top-down", "world-side", "collider-overlay"] as const) {
    await writeFile(path.join(captureDirectoryPath, `${name}.png`), PNG);
  }
  await writeJson(path.join(captureDirectoryPath, "opening-observation.json"), openingObservation);
  await writeJson(path.join(captureDirectoryPath, "spawn-support-observation.json"), fixture.spawnSupportObservation);
  await writeJson(path.join(captureDirectoryPath, "collider-overlay-observation.json"), fixture.colliderOverlayObservation);
  await writeJson(path.join(captureDirectoryPath, "scripted-traversal.json"), fixture.scriptedTraversalObservation);
  await writeJson(path.join(captureDirectoryPath, "formal-world-capture-receipt.json"), captureReceipt);

  const evidence = buildWorldReconstructionEvidenceSetV1({
    ...fixture,
    captureReceipt,
    openingObservation,
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
  if (!forgePassedEvaluation && evaluation.outcome !== "passed") {
    throw new Error("fixture evidence must earn a passed evaluation");
  }
  await writeJson(path.join(attemptDirectoryPath, "evidence-set.json"), evidence);
  await writeJson(path.join(attemptDirectoryPath, "evaluation.json"), evaluation);
  const captureReceiptHash = hashFormalWorldCaptureReceiptV1(captureReceipt);
  const evaluationHash = hashWorldReconstructionEvaluationResultV1(evaluation);
  const runReceipt = parseWorldReconstructionRunReceiptV1({
    kind: "world-reconstruction-run-receipt",
    schemaVersion: 1,
    id: "package-fixture.run",
    caseRef: fixture.caseRef,
    caseHash: hashWorldReconstructionCaseV1(fixture.reconstructionCase),
    evaluationProfileRef: fixture.evaluationProfileRef,
    evaluationProfileHash: hashWorldReconstructionEvaluationProfileV1(fixture.evaluationProfile),
    outcome: "passed",
    attempts: [{
      attemptIndex: 0,
      generationRequestRef: generationReceipt.generationRequestRef,
      generationRequestHash: hashNativeBlockGenerationRequestV1(request),
      generationReceiptRef: "artifact://case/package-fixture/attempts/0/generation-receipt.json",
      generationReceiptHash: hashNativeBlockGenerationReceiptV1(generationReceipt),
      sceneAuthoringAttemptRef: captureReceipt.sceneAuthoringAttemptRef,
      sceneAuthoringAttemptHash: hashSceneAuthoringAttemptV1(verified.sceneAuthoringAttempt),
      sceneAuthoringAttemptResultRef: captureReceipt.sceneAuthoringAttemptResultRef,
      sceneAuthoringAttemptResultHash: hashSceneAuthoringAttemptResultV1(verified.sceneAuthoringAttemptResult),
      worldPackageRef: verified.receipt.worldPackageRef,
      worldPackageRootHash: verified.receipt.worldPackageRootHash,
      worldPackageBuildReceiptRef: captureReceipt.worldPackageBuildReceiptRef,
      worldPackageBuildReceiptHash: sha256CanonicalJson(verified.receipt),
      worldBuildIdentityRef: captureReceipt.worldBuildIdentityRef,
      worldBuildIdentityHash: verified.receipt.worldBuildIdentityHash,
      captureReceiptRef: fixture.captureReceiptRef,
      captureReceiptHash,
      evaluationResultRef: "artifact://case/package-fixture/attempts/0/evaluation.json",
      evaluationResultHash: evaluationHash,
      outcome: "passed",
    }],
    finalAttemptIndex: 0,
    finalEvaluationResultRef: "artifact://case/package-fixture/attempts/0/evaluation.json",
    finalEvaluationResultHash: evaluationHash,
    cleanupOutcome: "completed",
  });
  await writeJson(path.join(runDirectoryPath, "run-receipt.json"), runReceipt);
  return { caseDirectoryPath, runDirectoryPath };
}

async function finalLaunchFixture(input: Readonly<{
  caseDirectoryPath: string;
  runDirectoryPath: string;
}>) {
  const runReceipt = parseWorldReconstructionRunReceiptV1(JSON.parse(
    await readFile(path.join(input.runDirectoryPath, "run-receipt.json"), "utf8"),
  ));
  const finalAttempt = runReceipt.attempts[runReceipt.finalAttemptIndex]!;
  return {
    kind: "native-block-reconstruction-launch" as const,
    schemaVersion: 1 as const,
    caseId: "package-fixture.case",
    runReceiptRef:
      "artifact://world-reconstruction-case/package-fixture.case/runs/formal-fixture/run-receipt.json",
    runReceiptHash: sha256CanonicalJson(runReceipt) as Sha256HashV1,
    worldPackageRelativePath: "final/world-package" as const,
    worldPackageRef: finalAttempt.worldPackageRef,
    worldPackageRootHash: finalAttempt.worldPackageRootHash,
    captureReceiptRelativePath:
      "final/capture/formal-world-capture-receipt.json" as const,
    captureReceiptHash: finalAttempt.captureReceiptHash,
    evaluationRelativePath: "final/evaluation.json" as const,
    evaluationHash: finalAttempt.evaluationResultHash,
    launchCommand:
      "pnpm worldkit native run final/world-package --port 5174 --json" as const,
  };
}

describe("Native Block reconstruction final artifact publisher integration", () => {
  it("runs the formal Final verifier before publishing the exact staged candidate", async () => {
    const fixture = await completeRunFixture();
    const playability = playabilityPort();
    try {
      await expect(publishNativeBlockReconstructionFinalV1({
        ...fixture,
        launch: await finalLaunchFixture(fixture),
        playability: playability.port,
      })).resolves.toMatchObject({ outcome: "published" });
      expect(playability.launch).toHaveBeenCalledWith(expect.objectContaining({
        packageDirectoryPath: path.join(
          fixture.caseDirectoryPath,
          ".final-staging/world-package",
        ),
      }));
      await expect(readFile(path.join(
        fixture.caseDirectoryPath,
        "final/launch.json",
      ))).resolves.toBeInstanceOf(Buffer);
      await expect(readFile(path.join(
        fixture.caseDirectoryPath,
        ".final-publish.lock",
      ))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(fixture.caseDirectoryPath, { recursive: true, force: true });
    }
  }, 15_000);

  it("rejects an empty final created immediately before the final existence check", async () => {
    const fixture = await completeRunFixture();
    const playability = playabilityPort();
    const publish = createNativeBlockFinalArtifactPublisherTestAdapterV1({
      async beforeFinalExistenceCheck(finalDirectoryPath) {
        await mkdir(finalDirectoryPath);
      },
    });
    try {
      await expect(publish({
        ...fixture,
        launch: await finalLaunchFixture(fixture),
        playability: playability.port,
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

  it("rejects a verifier-side empty directory and Run source mutation", async () => {
    for (const mutation of ["staging-directory", "run-source"] as const) {
      const fixture = await completeRunFixture();
      const playability = playabilityPort();
      const mutatingPlayability: NativeBlockReconstructionPlayabilityLaunchPortV1 = {
        async launch(input) {
          if (mutation === "staging-directory") {
            await mkdir(path.join(
              path.dirname(input.packageDirectoryPath),
              "foreign-empty-directory",
            ));
          } else {
            await writeFile(
              path.join(fixture.runDirectoryPath, "run-receipt.json"),
              "{}\n",
            );
          }
          return (playability.port as NativeBlockReconstructionPlayabilityLaunchPortV1)
            .launch(input);
        },
      };
      try {
        await expect(publishNativeBlockReconstructionFinalV1({
          ...fixture,
          launch: await finalLaunchFixture(fixture),
          playability: mutatingPlayability,
        })).rejects.toThrow("NBR_FINAL_ARTIFACT_PUBLICATION_INVALID");
      } finally {
        await rm(fixture.caseDirectoryPath, { recursive: true, force: true });
      }
    }
  }, 15_000);

  it("serializes official publishers with one Case-scoped lock", async () => {
    const fixture = await completeRunFixture();
    const playability = playabilityPort();
    let announceLaunch!: () => void;
    let releaseLaunch!: () => void;
    const launchStarted = new Promise<void>((resolve) => {
      announceLaunch = resolve;
    });
    const launchReleased = new Promise<void>((resolve) => {
      releaseLaunch = resolve;
    });
    const blockingPlayability: NativeBlockReconstructionPlayabilityLaunchPortV1 = {
      async launch(input) {
        announceLaunch();
        await launchReleased;
        return (playability.port as NativeBlockReconstructionPlayabilityLaunchPortV1)
          .launch(input);
      },
    };
    const launch = await finalLaunchFixture(fixture);
    const firstPublication = publishNativeBlockReconstructionFinalV1({
      ...fixture,
      launch,
      playability: blockingPlayability,
    });
    try {
      await launchStarted;
      await expect(readFile(path.join(
        fixture.caseDirectoryPath,
        ".final-publish.lock",
      ))).resolves.toBeInstanceOf(Buffer);
      await expect(publishNativeBlockReconstructionFinalV1({
        ...fixture,
        launch,
        playability: playability.port,
      })).rejects.toThrow("NBR_FINAL_ARTIFACT_PUBLICATION_INVALID");
      releaseLaunch();
      await expect(firstPublication).resolves.toMatchObject({ outcome: "published" });
    } finally {
      releaseLaunch();
      await firstPublication.catch(() => undefined);
      await rm(fixture.caseDirectoryPath, { recursive: true, force: true });
    }
  }, 15_000);

  it("cleans owned staging and lock when the formal Final verifier rejects", async () => {
    const fixture = await completeRunFixture();
    const rejectingPlayability = playabilityPort({ jumpNeverAir: true });
    try {
      await expect(publishNativeBlockReconstructionFinalV1({
        ...fixture,
        launch: await finalLaunchFixture(fixture),
        playability: rejectingPlayability.port,
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
  const runReceipt = parseWorldReconstructionRunReceiptV1(JSON.parse(
    await readFile(path.join(input.runDirectoryPath, "run-receipt.json"), "utf8"),
  ));
  const finalAttempt = runReceipt.attempts[runReceipt.finalAttemptIndex]!;
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
  const generationRequestRef =
    "artifact://case/package-fixture/attempts/1/generation-request.json";
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
  await writeJson(path.join(attemptRoot, "native-check-result.json"),
    verified.nativeSceneCheckResult);
  await writeFile(path.join(attemptRoot, "native-explain.txt"),
    explainNativeSceneCheckResultV1(verified.nativeSceneCheckResult));
  await writeWorldPackageDirectoryV1({
    outputDirectoryPath: path.join(attemptRoot, "world-package"),
    directory: verified.directory,
  });
  const pngHash = sha256Bytes(PNG) as Sha256HashV1;
  const captureReceipt = parseFormalWorldCaptureReceiptV1({
    ...fixture.captureReceipt,
    views: fixture.captureReceipt.views.map((view) => ({
      ...view,
      pngContentHash: pngHash,
    })),
    colliderOverlayPngContentHash: pngHash,
  });
  for (const name of ["opening", "world-top-down", "world-side", "collider-overlay"] as const) {
    await writeFile(path.join(captureRoot, `${name}.png`), PNG);
  }
  await writeJson(path.join(captureRoot, "opening-observation.json"),
    fixture.openingObservation);
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
    captureReceipt,
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
    attemptIndex: 1,
    generationRequestRef,
    generationRequestHash: hashNativeBlockGenerationRequestV1(request),
    generationReceiptRef:
      "artifact://case/package-fixture/attempts/1/generation-receipt.json",
    generationReceiptHash: hashNativeBlockGenerationReceiptV1(generationReceipt),
    sceneAuthoringAttemptRef: captureReceipt.sceneAuthoringAttemptRef,
    sceneAuthoringAttemptHash: hashSceneAuthoringAttemptV1(verified.sceneAuthoringAttempt),
    sceneAuthoringAttemptResultRef: captureReceipt.sceneAuthoringAttemptResultRef,
    sceneAuthoringAttemptResultHash:
      hashSceneAuthoringAttemptResultV1(verified.sceneAuthoringAttemptResult),
    worldPackageRef: verified.receipt.worldPackageRef,
    worldPackageRootHash: verified.receipt.worldPackageRootHash,
    worldPackageBuildReceiptRef: captureReceipt.worldPackageBuildReceiptRef,
    worldPackageBuildReceiptHash: sha256CanonicalJson(verified.receipt),
    worldBuildIdentityRef: captureReceipt.worldBuildIdentityRef,
    worldBuildIdentityHash: verified.receipt.worldBuildIdentityHash,
    captureReceiptRef: fixture.captureReceiptRef,
    captureReceiptHash: hashFormalWorldCaptureReceiptV1(captureReceipt),
    evaluationResultRef:
      "artifact://case/package-fixture/attempts/1/evaluation.json",
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
  it("requires one exact blocker set across Case, formal criteria, Contribution, and materializer", () => {
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
    if (verified.kind !== "babylon-native-scene" ||
        verified.nativeBlockMaterializerMetadata === undefined) {
      throw new Error("fixture must include trusted Block metadata");
    }
    const valid = {
      caseBlockerColliderIds: ["palette-ground-blocker"],
      formalChecks: fixture.captureReceipt.formalRequest.scriptedTraversal.checks,
      contribution: verified.nativeSceneContribution,
      materializerMetadata: verified.nativeBlockMaterializerMetadata,
    };
    expect(() => NATIVE_BLOCK_RECONSTRUCTION_E2E_TEST_HARNESS_V1
      .verifyBlockerEvidenceClosure(valid)).not.toThrow();
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
      expect(playability.port.launch).toHaveBeenCalledWith(expect.objectContaining({
        packageDirectoryPath: path.join(
          fixture.runDirectoryPath,
          "attempts/0/world-package",
        ),
      }));
    } finally {
      await rm(fixture.runDirectoryPath, { recursive: true, force: true });
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
        packageDirectoryPath: path.join(finalDirectoryPath, "world-package"),
      }));
    } finally {
      await rm(fixture.caseDirectoryPath, { recursive: true, force: true });
    }
  });

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
    const passingPlayability = playabilityPort();
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
  });

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
  });

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
  });
});
