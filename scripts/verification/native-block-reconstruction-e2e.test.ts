import { chmod, mkdtemp, mkdir, readFile, realpath, rm, unlink, writeFile } from "node:fs/promises";
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
  hashFormalWorldCaptureReceiptV1,
  parseFormalWorldCaptureReceiptV1,
  parseWorldRuntimeSnapshotV4,
  type FixedInputV1,
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
  parseWorldReconstructionEvaluationResultV1,
  parseWorldReconstructionRunReceiptV1,
} from "@whitebox-world/validation";
import { writeWorldPackageDirectoryV1 } from "../lib/file-world-package.js";
import { buildWorldReconstructionEvidenceSetV1 } from "../reconstruction/evaluate-evidence-set.js";
import { createEvidenceSetFixtureInputV1 } from "../reconstruction/evaluate-fixture.test-support.js";
import { explainNativeSceneCheckResultV1 } from "../native-scene/explain.js";
import { describe, expect, it, vi } from "vitest";

import {
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
  colliderId: "ground",
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
>) {
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
    id: "package-fixture.initial",
    routeDecisionRef: attempt.sceneAuthoringRouteDecisionRef,
    routeDecisionHash: attempt.sceneAuthoringRouteDecisionHash,
    sceneBriefRef: attempt.sceneBriefRef,
    sceneBriefHash: attempt.sceneBriefHash,
    referenceInputs: [],
    codexExecutionProfileRef: "worldkit://codex-execution-profile/formal@1",
    codexExecutionProfileHash: H("5"),
    taskInstructionRef: "worldkit://task-instruction/native-block-reconstruction@1",
    taskInstructionHash: H("6"),
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
} = {}) {
  const runtimeSessionId = "runtime.nbr70.fixture";
  let resetCount = 0;
  let current = snapshot(runtimeSessionId, "world.ready", 0, [0, 0, 0], "ground");
  const dispose = vi.fn(async () => ({
    outcome: options.cleanupFails ? "failed" as const : "completed" as const,
  }));
  const session: NativeBlockReconstructionPlayabilitySessionPortV1 = {
    awaitReady: vi.fn(async () => current),
    resetWithInitialControlBinding: vi.fn(async () => {
      resetCount += 1;
      current = snapshot(runtimeSessionId, `world.${resetCount}`, 0, [0, 0, 0], "ground");
      return current;
    }),
    runFixedInput: vi.fn(async (input: FixedInputV1) => {
      const [x, y, z] = current.world.subjectStatesByEntityId.player!
        .entityState.positionMetersXYZ;
      const actions = new Set(input.actions);
      const next: [number, number, number] = options.traversalFails &&
          resetCount >= 8 && actions.has("move-forward")
        ? [100, 100, 100]
        : options.crossesBlocker && resetCount >= 8 && actions.has("move-forward")
          ? [0, 0, -100]
        : [
          x + (actions.has("move-right") ? 1 : 0) - (actions.has("move-left") ? 1 : 0),
          y + (actions.has("jump") ? 1 : 0),
          z + (actions.has("move-backward") ? 1 : 0) - (actions.has("move-forward") ? 1 : 0),
        ];
      current = snapshot(
        runtimeSessionId,
        current.worldSessionId,
        current.world.simulationTick + input.ticks,
        next,
        actions.has("jump") ? "air" : "ground",
      );
      return current;
    }),
    readCommittedSupport: vi.fn(async () => ({
      tick: current.world.simulationTick,
      mode: "supported" as const,
      colliderId: "ground",
    })),
    dispose,
  };
  const launch = vi.fn(async () => session);
  return {
    port: { launch } satisfies NativeBlockReconstructionPlayabilityLaunchPortV1,
    launch,
    dispose,
  };
}

async function completeRunFixture(
  options: Parameters<typeof createEvidenceSetFixtureInputV1>[0] = {},
) {
  const runDirectoryPath = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "nbr70-complete-")),
  );
  const fixture = createEvidenceSetFixtureInputV1(options);
  const verified = fixture.verifiedWorldPackage;
  const attemptDirectoryPath = path.join(runDirectoryPath, "attempts/0");
  const captureDirectoryPath = path.join(attemptDirectoryPath, "capture");
  await mkdir(captureDirectoryPath, { recursive: true });
  await chmod(attemptDirectoryPath, 0o700);
  await writeJson(path.join(runDirectoryPath, "inputs/case.json"), fixture.reconstructionCase);
  await writeJson(path.join(runDirectoryPath, "inputs/evaluation-profile.json"), fixture.evaluationProfile);

  const request = generationRequestFixture(fixture);
  if (verified.sceneAuthoringAttempt.sourceInput.kind !== "babylon-native" ||
      verified.sceneAuthoringAttempt.sourceInput.generationRequestHash !==
        hashNativeBlockGenerationRequestV1(request)) {
    throw new Error("generation fixture identity drift");
  }
  const sourceByPath = new Map([
    ["native-block-authoring.json", new TextEncoder().encode("{}")],
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
  const captureReceipt = parseFormalWorldCaptureReceiptV1({
    ...fixture.captureReceipt,
    views: fixture.captureReceipt.views.map((view) => ({
      ...view,
      pngContentHash: pngHash,
    })),
    colliderOverlayPngContentHash: pngHash,
  });
  for (const name of ["opening", "world-top-down", "world-side", "collider-overlay"] as const) {
    await writeFile(path.join(captureDirectoryPath, `${name}.png`), PNG);
  }
  await writeJson(path.join(captureDirectoryPath, "opening-observation.json"), fixture.openingObservation);
  await writeJson(path.join(captureDirectoryPath, "spawn-support-observation.json"), fixture.spawnSupportObservation);
  await writeJson(path.join(captureDirectoryPath, "collider-overlay-observation.json"), fixture.colliderOverlayObservation);
  await writeJson(path.join(captureDirectoryPath, "scripted-traversal.json"), fixture.scriptedTraversalObservation);
  await writeJson(path.join(captureDirectoryPath, "formal-world-capture-receipt.json"), captureReceipt);

  const evidence = buildWorldReconstructionEvidenceSetV1({
    ...fixture,
    captureReceipt,
  });
  const evaluated = evaluateWorldReconstructionV1({
    case: fixture.reconstructionCase,
    profile: fixture.evaluationProfile,
    evidence,
  });
  const evaluation = parseWorldReconstructionEvaluationResultV1({
    ...evaluated,
    outcome: "passed",
    diagnostics: [],
    dimensions: evaluated.dimensions.map((dimension) => ({
      ...dimension,
      status: "passed",
      metrics: [{ kind: "boolean-presence", isPresent: true }],
      diagnosticIds: [],
    })),
  });
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
  return { runDirectoryPath };
}

describe("Native Block reconstruction E2E verifier", () => {
  it("rejects an empty candidate before launching playability", async () => {
    const runDirectoryPath = await realpath(
      await mkdtemp(path.join(os.tmpdir(), "nbr70-empty-")),
    );
    const playability = playabilityPort();
    try {
      await expect(verifyNativeBlockReconstructionE2EV1({
        runDirectoryPath,
        playability: playability.port,
      })).rejects.toThrowError("NBR70_RUN_RECEIPT_MISSING");
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
        runDirectoryPath: fixture.runDirectoryPath,
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
    } finally {
      await rm(fixture.runDirectoryPath, { recursive: true, force: true });
    }
  });

  it("proves a mixed approach-plus-blocker check and rejects crossing its frozen plane", async () => {
    const fixtureOptions = {
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
        runDirectoryPath: passingFixture.runDirectoryPath,
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
        runDirectoryPath: crossingFixture.runDirectoryPath,
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
          runDirectoryPath: fixture.runDirectoryPath,
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
          runDirectoryPath: fixture.runDirectoryPath,
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
        await expect(verifyNativeBlockReconstructionE2EV1({
          runDirectoryPath: fixture.runDirectoryPath,
          playability: playability.port,
        })).rejects.toThrowError(
          mutation === "traversal"
            ? "NBR70_PLAYABILITY_TRAVERSAL_FAILED"
            : "NBR70_PLAYABILITY_CLEANUP_FAILED",
        );
        expect(playability.dispose).toHaveBeenCalledOnce();
      } finally {
        await rm(fixture.runDirectoryPath, { recursive: true, force: true });
      }
    }
  });
});
