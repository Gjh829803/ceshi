import {
  lstat,
  mkdtemp,
  mkdir,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  formalWorldCaptureIntentCanonicalBytesV1,
  hashFormalWorldCaptureReceiptV1,
  parseFormalWorldCaptureReceiptV1,
  parseNativeSceneCheckResultV1,
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
  parseWorldReconstructionEvaluationResultV1,
  parseWorldReconstructionRunReceiptV1,
} from "@whitebox-world/validation";
import {
  hashNativeBlockGenerationReceiptV1,
  hashNativeBlockGenerationRequestV1,
  hashSceneAuthoringAttemptResultV1,
  hashSceneAuthoringAttemptV1,
  parseNativeBlockGenerationReceiptV1,
  parseNativeBlockGenerationRequestV1,
} from "@whitebox-world/scene-authoring-contracts";
import { writeWorldPackageDirectoryV1 } from "../lib/file-world-package.js";
import { explainNativeSceneCheckResultV1 } from "../native-scene/explain.js";
import { describe, expect, it } from "vitest";

import { buildWorldReconstructionEvidenceSetV1 } from
  "./evaluate-evidence-set.js";
import { createEvidenceSetFixtureInputV1 } from
  "./evaluate-fixture.test-support.js";
import {
  createNativeBlockFinalArtifactPublisherTestAdapterV1,
  NativeBlockFinalArtifactPublicationClosedErrorV1,
  publishNativeBlockReconstructionFinalV1,
} from "./final-artifact-publisher.js";
import type {
  NativeBlockReconstructionPlayabilityLaunchPortV1,
  NativeBlockReconstructionPlayabilitySessionPortV1,
} from "../verification/verify-native-block-reconstruction-e2e.js";

const PNG = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
));
const H = (character: string) =>
  `sha256:${character.repeat(64)}` as Sha256HashV1;
const UNREACHABLE_PLAYABILITY = {
  async launch(): Promise<never> {
    throw new Error("playability must not launch for rejected publication input");
  },
};

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${stringifyCanonicalJson(value)}\n`);
}

async function missing(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  }
}

function runtimeSnapshot(
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
            entityDefinitionRef:
              "worldkit://subject-definition/humanoid.third-person@1",
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
              locomotionCapabilityRef:
                "worldkit://locomotion-capability/ground.standard@1",
              locomotionCapabilityHash: H("c"),
              locomotion: {
                schemaVersion: 2,
                status: "active",
                mobilityMode: movementMedium === "ground"
                  ? "grounded"
                  : "airborne",
                gait: movementMedium === "ground" ? "idle" : "none",
                verticalPhase: movementMedium === "ground" ? "none" : "rising",
                supportMode: movementMedium === "ground"
                  ? "supported"
                  : "unsupported",
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
        controllerStatesById: {
          primary: { id: "primary", participantId: "primary" },
        },
        relationshipStatesById: {},
        activeActionStatesById: {},
        activatedGameplayFeatureRefs: [],
        lastEventSequence: 0,
      },
    },
    view: { viewStateRevision: 0, camera: { mode: "unbound" } },
    runtime: {
      phase: "ready",
      isPaused: false,
      fixedTimeStepSeconds: 1 / 60,
    },
    resources: {
      phase: "ready",
      meshCount: 1,
      physicsBodyCount: 1,
      terrainSampleCount: 0,
    },
  });
}

function passingPlayabilityPort(): NativeBlockReconstructionPlayabilityLaunchPortV1 {
  const runtimeSessionId = "runtime.publisher.fixture";
  let resetCount = 0;
  let current = runtimeSnapshot(
    runtimeSessionId,
    "world.ready",
    0,
    [0, 0, 0],
    "ground",
  );
  const session: NativeBlockReconstructionPlayabilitySessionPortV1 = {
    async awaitReady() {
      return current;
    },
    async resetWithInitialControlBinding() {
      resetCount += 1;
      current = runtimeSnapshot(
        runtimeSessionId,
        `world.${resetCount}`,
        0,
        [0, 0, 0],
        "ground",
      );
      return current;
    },
    async runFixedInput(input: FixedInputV1) {
      const [x, y, z] = current.world.subjectStatesByEntityId.player!
        .entityState.positionMetersXYZ;
      const actions = new Set(input.actions);
      current = runtimeSnapshot(
        runtimeSessionId,
        current.worldSessionId,
        current.world.simulationTick + input.ticks,
        [
          x + Number(actions.has("move-right")) -
            Number(actions.has("move-left")),
          y + Number(actions.has("jump")),
          z + Number(actions.has("move-backward")) -
            Number(actions.has("move-forward")),
        ],
        actions.has("jump") ? "air" : "ground",
      );
      return current;
    },
    async readCommittedSubjectSupport(
      subjectEntityId: string,
      expectedSimulationTick: number,
    ): Promise<RuntimeSessionSubjectSupportV1> {
      return {
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
      };
    },
    async dispose() {
      return { outcome: "completed" };
    },
  };
  return { async launch() { return session; } };
}

function generationRequestFixture(input: ReturnType<
  typeof createEvidenceSetFixtureInputV1
>) {
  const verified = input.verifiedWorldPackage;
  const attempt = verified.sceneAuthoringAttempt;
  if (attempt.sourceInput.kind !== "babylon-native") {
    throw new Error("fixture source must be Babylon Native");
  }
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
    taskInstructionRef:
      "worldkit://task-instruction/native-block-reconstruction@1",
    taskInstructionHash: H("6"),
    builderSkillRef: "worldkit://skill/worldkit-native-block-builder@1",
    builderSkillHash: H("7"),
    workspaceContextManifestRef:
      "worldkit://workspace-context/native-block-builder@1",
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

async function createRunFixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "nbr-final-")));
  const caseDirectoryPath = path.join(root, "artifacts/scenes/package-fixture");
  const runDirectoryPath = path.join(caseDirectoryPath, "runs/formal");
  const attemptRoot = path.join(runDirectoryPath, "attempts/0");
  const captureRoot = path.join(attemptRoot, "capture");
  await mkdir(captureRoot, { recursive: true });
  const fixture = createEvidenceSetFixtureInputV1({ allDimensionsPass: true });
  const verified = fixture.verifiedWorldPackage;
  await writeJson(path.join(caseDirectoryPath, "case.json"), fixture.reconstructionCase);
  await writeJson(
    path.join(runDirectoryPath, "inputs/case.json"),
    fixture.reconstructionCase,
  );
  await writeJson(
    path.join(runDirectoryPath, "inputs/evaluation-profile.json"),
    fixture.evaluationProfile,
  );
  await mkdir(path.join(runDirectoryPath, "inputs"), { recursive: true });
  await writeFile(
    path.join(runDirectoryPath, "inputs/formal-world-capture-intent.json"),
    formalWorldCaptureIntentCanonicalBytesV1(fixture.formalCaptureIntent),
  );

  const generationRequest = generationRequestFixture(fixture);
  if (
    verified.sceneAuthoringAttempt.sourceInput.kind !== "babylon-native" ||
    verified.sceneAuthoringAttempt.sourceInput.generationRequestHash !==
      hashNativeBlockGenerationRequestV1(generationRequest)
  ) throw new Error("generation fixture identity drift");
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
    generationRequestRef:
      verified.sceneAuthoringAttempt.sourceInput.generationRequestRef,
    generationRequestHash:
      hashNativeBlockGenerationRequestV1(generationRequest),
    routerTaskPayloadHash: H("d"),
    taskInstructionHash: generationRequest.taskInstructionHash,
    builderSkillHash: generationRequest.builderSkillHash,
    workspaceContextManifestHash:
      generationRequest.workspaceContextManifestHash,
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
      mediaType: relativePath === "scene.ts"
        ? "text/typescript"
        : "application/json",
    })),
    diagnosticCodes: [],
    cleanupOutcome: "completed",
  });
  const sourceNativeCheckResult = parseNativeSceneCheckResultV1({
    ...verified.nativeSceneCheckResult,
    id: `${verified.nativeSceneCheckResult.id}.source-check`,
  });
  await writeJson(
    path.join(attemptRoot, "generation-request.json"),
    generationRequest,
  );
  await writeJson(
    path.join(attemptRoot, "generation-receipt.json"),
    generationReceipt,
  );
  await writeJson(
    path.join(attemptRoot, "scene-authoring-route-decision.json"),
    verified.sceneAuthoringRouteDecision,
  );
  await writeJson(
    path.join(attemptRoot, "attempt.json"),
    verified.sceneAuthoringAttempt,
  );
  await writeJson(
    path.join(attemptRoot, "attempt-result.json"),
    verified.sceneAuthoringAttemptResult,
  );
  await mkdir(path.join(attemptRoot, "source"), { recursive: true });
  for (const [relativePath, bytes] of sourceByPath) {
    await writeFile(path.join(attemptRoot, "source", relativePath), bytes);
  }
  await writeJson(
    path.join(attemptRoot, "native-check-result.json"),
    sourceNativeCheckResult,
  );
  await writeFile(
    path.join(attemptRoot, "native-explain.txt"),
    explainNativeSceneCheckResultV1(sourceNativeCheckResult),
  );
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
  for (const name of [
    "opening",
    "world-top-down",
    "world-side",
    "collider-overlay",
  ] as const) {
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
  const evaluated = evaluateWorldReconstructionV1({
    case: fixture.reconstructionCase,
    profile: fixture.evaluationProfile,
    evidence,
  });
  const evaluation = parseWorldReconstructionEvaluationResultV1(evaluated);
  if (evaluation.outcome !== "passed") {
    throw new Error("fixture evidence must earn a passed evaluation");
  }
  await writeJson(path.join(attemptRoot, "evidence-set.json"), evidence);
  await writeJson(path.join(attemptRoot, "evaluation.json"), evaluation);
  const captureReceiptHash = hashFormalWorldCaptureReceiptV1(captureReceipt);
  const evaluationHash = hashWorldReconstructionEvaluationResultV1(evaluation);
  const runArtifactRoot =
    `${fixture.caseRef.slice(0, -"/case.json".length)}/runs/formal`;
  const runReceipt = parseWorldReconstructionRunReceiptV1({
    kind: "world-reconstruction-run-receipt",
    schemaVersion: 1,
    id: "package-fixture.run",
    caseRef: fixture.caseRef,
    caseHash: hashWorldReconstructionCaseV1(fixture.reconstructionCase),
    evaluationProfileRef: fixture.evaluationProfileRef,
    evaluationProfileHash:
      hashWorldReconstructionEvaluationProfileV1(fixture.evaluationProfile),
    outcome: "passed",
    diagnosticCodes: [],
    attempts: [{
      kind: "evaluated",
      attemptIndex: 0,
      generationRequestRef:
        `${runArtifactRoot}/attempts/0/generation-request.json`,
      generationRequestHash:
        hashNativeBlockGenerationRequestV1(generationRequest),
      generationReceiptRef: "artifact://case/package-fixture/attempts/0/generation-receipt.json",
      generationReceiptHash:
        hashNativeBlockGenerationReceiptV1(generationReceipt),
      sceneAuthoringAttemptRef: captureReceipt.sceneAuthoringAttemptRef,
      sceneAuthoringAttemptHash:
        hashSceneAuthoringAttemptV1(verified.sceneAuthoringAttempt),
      sceneAuthoringAttemptResultRef:
        captureReceipt.sceneAuthoringAttemptResultRef,
      sceneAuthoringAttemptResultHash:
        hashSceneAuthoringAttemptResultV1(verified.sceneAuthoringAttemptResult),
      worldPackageRef: verified.receipt.worldPackageRef,
      worldPackageRootHash: verified.receipt.worldPackageRootHash,
      worldPackageBuildReceiptRef: captureReceipt.worldPackageBuildReceiptRef,
      worldPackageBuildReceiptHash: sha256CanonicalJson(verified.receipt),
      worldBuildIdentityRef: captureReceipt.worldBuildIdentityRef,
      worldBuildIdentityHash: verified.receipt.worldBuildIdentityHash,
      captureReceiptRef: fixture.captureReceiptRef,
      captureReceiptHash,
      evaluationResultRef:
        "artifact://case/package-fixture/attempts/0/evaluation.json",
      evaluationResultHash: evaluationHash,
      outcome: "passed",
    }],
    finalAttemptIndex: 0,
    finalEvaluationResultRef:
      "artifact://case/package-fixture/attempts/0/evaluation.json",
    finalEvaluationResultHash: evaluationHash,
    cleanupOutcome: "completed",
  });
  await writeJson(path.join(runDirectoryPath, "run-receipt.json"), runReceipt);
  const launch = {
    kind: "native-block-reconstruction-launch" as const,
    schemaVersion: 1 as const,
    caseId: fixture.reconstructionCase.id,
    runReceiptRef:
      "artifact://world-reconstruction-case/package-fixture.case/runs/formal/run-receipt.json",
    runReceiptHash: sha256CanonicalJson(runReceipt) as Sha256HashV1,
    worldPackageRelativePath: "final/world-package" as const,
    worldPackageRef: verified.receipt.worldPackageRef,
    worldPackageRootHash: verified.receipt.worldPackageRootHash,
    captureReceiptRelativePath:
      "final/capture/formal-world-capture-receipt.json" as const,
    captureReceiptHash,
    evaluationRelativePath: "final/evaluation.json" as const,
    evaluationHash,
    launchCommand:
      "pnpm worldkit native run final/world-package --port 5174 --json" as const,
  };
  return {
    root,
    caseDirectoryPath,
    runDirectoryPath,
    attemptRoot,
    launch,
  };
}

describe("Native reconstruction final artifact publisher", () => {
  it.each([
    [
      "parent sync",
      "parent-sync",
      "completed",
      "NBR_TEST_PARENT_SYNC_FAILED",
      3,
    ],
    ["lock unlink", "lock-unlink", "failed", undefined, 3],
    [
      "final sync",
      "final-sync",
      "completed",
      "NBR_TEST_FINAL_SYNC_FAILED",
      4,
    ],
  ] as const)(
    "removes renamed final when the post-rename %s barrier fails",
    async (
      _label,
      barrier,
      cleanupOutcome,
      expectedDiagnosticCode,
      expectedPublicationSyncCount,
    ) => {
      const fixture = await createRunFixture();
      const finalDirectoryPath = path.join(fixture.caseDirectoryPath, "final");
      const lockFilePath = path.join(
        fixture.caseDirectoryPath,
        ".final-publish.lock",
      );
      let publicationSyncCount = 0;
      let barrierObservedAfterRename = false;
      const publish = createNativeBlockFinalArtifactPublisherTestAdapterV1({
        beforeSync: async (_absolutePath, phase) => {
          if (phase === "staging") return;
          publicationSyncCount += 1;
          const barrierSyncCount = barrier === "final-sync" ? 3 : 2;
          if (publicationSyncCount !== barrierSyncCount) return;
          if (await missing(finalDirectoryPath)) {
            throw new Error("NBR_TEST_BARRIER_RAN_BEFORE_RENAME");
          }
          barrierObservedAfterRename = true;
          if (barrier === "parent-sync") {
            throw new Error("NBR_TEST_PARENT_SYNC_FAILED");
          }
          if (barrier === "lock-unlink") {
            await unlink(lockFilePath);
            await mkdir(lockFilePath);
            return;
          }
          throw new Error("NBR_TEST_FINAL_SYNC_FAILED");
        },
      });
      try {
        const failure = await publish({
          caseDirectoryPath: fixture.caseDirectoryPath,
          runDirectoryPath: fixture.runDirectoryPath,
          launch: fixture.launch,
          playability: passingPlayabilityPort(),
        }).then(() => undefined, (error: unknown) => error);

        expect(barrierObservedAfterRename).toBe(true);
        expect(failure).toBeInstanceOf(
          NativeBlockFinalArtifactPublicationClosedErrorV1,
        );
        expect(failure).toMatchObject({ cleanupOutcome });
        expect((failure as NativeBlockFinalArtifactPublicationClosedErrorV1)
          .diagnosticCodes).toContain(
          "NBR_FINAL_ARTIFACT_PUBLICATION_INVALID",
        );
        if (expectedDiagnosticCode !== undefined) {
          expect((failure as NativeBlockFinalArtifactPublicationClosedErrorV1)
            .diagnosticCodes).toContain(expectedDiagnosticCode);
        }
        expect(await missing(finalDirectoryPath)).toBe(true);
        expect(await missing(path.join(
          fixture.caseDirectoryPath,
          ".final-staging",
        ))).toBe(true);
        expect(await missing(lockFilePath)).toBe(barrier !== "lock-unlink");
        expect(publicationSyncCount).toBe(expectedPublicationSyncCount);
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    },
    20_000,
  );

  it("reports not-started cleanup when input admission fails before owner allocation", async () => {
    const fixture = await createRunFixture();
    try {
      const failure = await publishNativeBlockReconstructionFinalV1({
        caseDirectoryPath: `${fixture.caseDirectoryPath}${path.sep}..`,
        runDirectoryPath: fixture.runDirectoryPath,
        launch: fixture.launch,
        playability: UNREACHABLE_PLAYABILITY,
      }).then(() => undefined, (error: unknown) => error);

      expect(failure).toBeInstanceOf(
        NativeBlockFinalArtifactPublicationClosedErrorV1,
      );
      expect(failure).toMatchObject({
        diagnosticCodes: ["NBR_FINAL_ARTIFACT_PUBLICATION_INVALID"],
        cleanupOutcome: "not-started",
      });
      expect((failure as Error).message).toMatch(
        /^NBR_FINAL_ARTIFACT_PUBLICATION_INVALID/,
      );
      expect(await missing(path.join(
        fixture.caseDirectoryPath,
        ".final-publish.lock",
      ))).toBe(true);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("reports completed cleanup after allocated publication resources are removed", async () => {
    const fixture = await createRunFixture();
    try {
      const failure = await publishNativeBlockReconstructionFinalV1({
        caseDirectoryPath: fixture.caseDirectoryPath,
        runDirectoryPath: fixture.runDirectoryPath,
        launch: { ...fixture.launch, captureReceiptHash: H("f") },
        playability: UNREACHABLE_PLAYABILITY,
      }).then(() => undefined, (error: unknown) => error);

      expect(failure).toBeInstanceOf(
        NativeBlockFinalArtifactPublicationClosedErrorV1,
      );
      expect(failure).toMatchObject({
        diagnosticCodes: ["NBR_FINAL_ARTIFACT_PUBLICATION_INVALID"],
        cleanupOutcome: "completed",
      });
      expect(await missing(path.join(
        fixture.caseDirectoryPath,
        ".final-publish.lock",
      ))).toBe(true);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("reports failed cleanup with source and cleanup diagnostic codes", async () => {
    const fixture = await createRunFixture();
    let publicationSyncCount = 0;
    const publish = createNativeBlockFinalArtifactPublisherTestAdapterV1({
      beforeSync: (_absolutePath, phase) => {
        if (phase === "staging") {
          throw new Error("NBR_TEST_STAGING_SYNC_FAILED");
        }
        publicationSyncCount += 1;
        if (publicationSyncCount > 1) {
          throw new Error("NBR_TEST_CLEANUP_SYNC_FAILED");
        }
      },
    });
    try {
      const failure = await publish({
        caseDirectoryPath: fixture.caseDirectoryPath,
        runDirectoryPath: fixture.runDirectoryPath,
        launch: fixture.launch,
        playability: UNREACHABLE_PLAYABILITY,
      }).then(() => undefined, (error: unknown) => error);

      expect(failure).toBeInstanceOf(
        NativeBlockFinalArtifactPublicationClosedErrorV1,
      );
      expect(failure).toMatchObject({ cleanupOutcome: "failed" });
      expect((failure as NativeBlockFinalArtifactPublicationClosedErrorV1)
        .diagnosticCodes).toEqual([
        "NBR_FINAL_ARTIFACT_PUBLICATION_INVALID",
        "NBR_TEST_STAGING_SYNC_FAILED",
        "NBR_TEST_CLEANUP_SYNC_FAILED",
      ]);
      expect(await missing(path.join(
        fixture.caseDirectoryPath,
        ".final-publish.lock",
      ))).toBe(true);
      expect(await missing(path.join(
        fixture.caseDirectoryPath,
        ".final-staging",
      ))).toBe(true);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects stale launch identity and partial Capture before staging", async () => {
    for (const mutation of ["stale", "partial"] as const) {
      const fixture = await createRunFixture();
      if (mutation === "partial") {
        await unlink(path.join(fixture.attemptRoot, "capture/opening.png"));
      }
      try {
        await expect(publishNativeBlockReconstructionFinalV1({
          caseDirectoryPath: fixture.caseDirectoryPath,
          runDirectoryPath: fixture.runDirectoryPath,
          launch: mutation === "stale"
            ? { ...fixture.launch, captureReceiptHash: H("f") }
            : fixture.launch,
          playability: UNREACHABLE_PLAYABILITY,
        })).rejects.toThrow("NBR_FINAL_ARTIFACT_PUBLICATION_INVALID");
        expect(await missing(path.join(fixture.caseDirectoryPath, ".final-staging")))
          .toBe(true);
        expect(await missing(path.join(fixture.caseDirectoryPath, "final"))).toBe(true);
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    }
  });

  it("rejects symlinks, run-local final aliases, existing final, and residual lock", async () => {
    for (const mutation of ["symlink", "run-final", "existing", "lock"] as const) {
      const fixture = await createRunFixture();
      let runDirectoryPath = fixture.runDirectoryPath;
      if (mutation === "symlink") {
        const opening = path.join(fixture.attemptRoot, "capture/opening.png");
        await unlink(opening);
        await symlink(path.join(fixture.attemptRoot, "capture/world-side.png"), opening);
      } else if (mutation === "run-final") {
        runDirectoryPath = path.join(fixture.runDirectoryPath, "final");
        await mkdir(runDirectoryPath);
      } else if (mutation === "existing") {
        await mkdir(path.join(fixture.caseDirectoryPath, "final"));
      } else if (mutation === "lock") {
        await writeFile(path.join(fixture.caseDirectoryPath, ".final-publish.lock"), "");
      }
      try {
        await expect(publishNativeBlockReconstructionFinalV1({
          caseDirectoryPath: fixture.caseDirectoryPath,
          runDirectoryPath,
          launch: fixture.launch,
          playability: UNREACHABLE_PLAYABILITY,
        })).rejects.toThrow("NBR_FINAL_ARTIFACT_PUBLICATION_INVALID");
        if (mutation === "lock") {
          expect(await missing(path.join(
            fixture.caseDirectoryPath,
            ".final-publish.lock",
          ))).toBe(false);
        }
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    }
  }, 15_000);

});
