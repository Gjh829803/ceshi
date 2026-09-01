import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";

import {
  parseNativeBlockAuthoringManifestV1,
} from "@whitebox-world/native-babylon-block-profile";
import {
  assertNativeBlockGenerationReceiptMatchesRequestV1,
  assertNativeBlockGenerationRequestMatchesAttemptV1,
  hashNativeBlockGenerationReceiptV1,
  hashNativeBlockGenerationRequestV1,
  hashSceneAuthoringAttemptResultV1,
  hashSceneAuthoringAttemptV1,
  hashSceneAuthoringRouteDecisionV1,
  parseNativeBlockGenerationReceiptV1,
  parseNativeBlockGenerationRequestV1,
  parseSceneAuthoringAttemptResultV1,
  parseSceneAuthoringAttemptV1,
  parseSceneAuthoringRouteDecisionV1,
} from "@whitebox-world/scene-authoring-contracts";
import {
  hashBabylonNativeBlockMaterializerMetadataV1,
  hashFormalColliderOverlayObservationV1,
  hashFormalOpeningObservationV1,
  hashFormalScriptedTraversalObservationV1,
  hashFormalSpawnSupportObservationV1,
  hashFormalWorldCaptureReceiptV1,
  hashNativeSceneCheckResultV1,
  parseFormalColliderOverlayObservationV1,
  parseFormalOpeningObservationV1,
  parseFormalScriptedTraversalObservationV1,
  parseFormalSpawnSupportObservationV1,
  parseFormalWorldCaptureReceiptV1,
  parseNativeSceneCheckResultV1,
  parseWorldRuntimeSnapshotV4,
  type BabylonNativeBlockMaterializerMetadataV1,
  type BabylonNativeSceneContributionV1,
  type FixedInputV1,
  type FormalMeasuredObservationIdentityV1,
  type FormalTraversalCheckpointSpatialCriterionV1,
  type RuntimeSessionSubjectSupportV1,
  type WorldRuntimeSnapshotV4,
} from "@whitebox-world/runtime-contracts";
import {
  sha256Bytes,
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  WORLD_RECONSTRUCTION_DIMENSION_IDS_V1,
  evaluateWorldReconstructionV1,
  hashWorldReconstructionCaseV1,
  hashWorldReconstructionEvaluationProfileV1,
  hashWorldReconstructionEvaluationResultV1,
  hashWorldReconstructionEvidenceSetV1,
  parseWorldReconstructionCaseV1,
  parseWorldReconstructionEvaluationProfileV1,
  parseWorldReconstructionEvaluationResultV1,
  parseWorldReconstructionEvidenceSetV1,
  parseWorldReconstructionRunReceiptV1,
} from "@whitebox-world/validation";
import { verifyWorldPackageDirectoryV1 } from "@whitebox-world/world-package";

import { readWorldPackageDirectoryV1 } from "../lib/file-world-package.js";
import { explainNativeSceneCheckResultV1 } from "../native-scene/explain.js";
import { buildWorldReconstructionEvidenceSetV1 } from
  "../reconstruction/evaluate-evidence-set.js";

export interface NativeBlockReconstructionPlayabilitySessionPortV1 {
  awaitReady(): Promise<WorldRuntimeSnapshotV4>;
  resetWithInitialControlBinding(): Promise<WorldRuntimeSnapshotV4>;
  runFixedInput(input: FixedInputV1): Promise<WorldRuntimeSnapshotV4>;
  readCommittedSubjectSupport(
    subjectEntityId: string,
    expectedSimulationTick: number,
  ): Promise<RuntimeSessionSubjectSupportV1 | undefined>;
  dispose(): Promise<Readonly<{ outcome: "completed" | "failed" }>>;
}

export interface NativeBlockReconstructionPlayabilityLaunchPortV1 {
  readonly launch: (input: Readonly<{
    packageDirectoryPath: string;
    worldPackageRef: string;
    worldPackageRootHash: Sha256HashV1;
    worldBuildIdentityHash: Sha256HashV1;
  }>) => Promise<NativeBlockReconstructionPlayabilitySessionPortV1>;
}

export interface VerifyNativeBlockReconstructionE2EInputV1 {
  readonly candidate:
    | Readonly<{
      readonly kind: "run";
      readonly runDirectoryPath: string;
    }>
    | Readonly<{
      readonly kind: "final";
      readonly runDirectoryPath: string;
      readonly finalDirectoryPath: string;
    }>;
  readonly playability: NativeBlockReconstructionPlayabilityLaunchPortV1;
}

export interface NativeBlockReconstructionE2EVerificationV1 {
  readonly outcome: "verified";
  readonly candidateKind: "run" | "final";
  readonly attemptIndex: 0 | 1;
  readonly worldPackageRef: string;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly worldBuildIdentityHash: Sha256HashV1;
  readonly captureReceiptHash: Sha256HashV1;
  readonly evaluationResultHash: Sha256HashV1;
  readonly playability: Readonly<{
    groundedSpawn: true;
    moved: true;
    jumped: true;
    reset: true;
    scriptedTraversalChecks: readonly Readonly<{
      id: string;
      outcome: "passed" | "blocked";
      checkpointIds: readonly string[];
    }>[];
  }>;
}

function fail(code: string): never {
  throw new Error(code);
}

function exact(actual: unknown, expected: unknown): void {
  if (actual !== expected) fail("NBR70_IDENTITY_MISMATCH");
}

async function canonicalDirectory(
  directoryPath: string,
  invalidCode: string,
): Promise<string> {
  if (!path.isAbsolute(directoryPath)) fail(invalidCode);
  try {
    const info = await lstat(directoryPath);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      fail(invalidCode);
    }
    const resolved = await realpath(directoryPath);
    if (resolved !== directoryPath) fail(invalidCode);
    return resolved;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      fail(invalidCode);
    }
    throw error;
  }
}

async function requiredFile(
  root: string,
  relativePath: string,
  missingCode: string,
): Promise<Uint8Array> {
  const absolutePath = path.join(root, relativePath);
  if (!absolutePath.startsWith(`${root}${path.sep}`)) fail("NBR70_ARTIFACT_INVALID");
  try {
    const info = await lstat(absolutePath);
    if (!info.isFile() || info.isSymbolicLink()) fail(missingCode);
    if (await realpath(absolutePath) !== absolutePath) fail("NBR70_ARTIFACT_INVALID");
    return new Uint8Array(await readFile(absolutePath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") fail(missingCode);
    throw error;
  }
}

async function regularFileHashes(
  root: string,
  relativeDirectory = "",
): Promise<ReadonlyMap<string, Sha256HashV1>> {
  const directory = path.join(root, relativeDirectory);
  const entries = await readdir(directory, { withFileTypes: true });
  const hashes = new Map<string, Sha256HashV1>();
  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    const absolutePath = path.join(root, relativePath);
    if (entry.isSymbolicLink()) fail("NBR70_ARTIFACT_INVALID");
    if (entry.isDirectory()) {
      for (const [childPath, childHash] of await regularFileHashes(
        root,
        relativePath,
      )) hashes.set(childPath, childHash);
    } else if (entry.isFile()) {
      hashes.set(
        relativePath,
        sha256Bytes(new Uint8Array(await readFile(absolutePath))) as Sha256HashV1,
      );
    } else {
      fail("NBR70_ARTIFACT_INVALID");
    }
  }
  return hashes;
}

async function assertDirectoriesByteEqual(
  actualRoot: string,
  expectedRoot: string,
): Promise<void> {
  const actual = await regularFileHashes(actualRoot);
  const expected = await regularFileHashes(expectedRoot);
  const actualPaths = [...actual.keys()].sort();
  const expectedPaths = [...expected.keys()].sort();
  if (
    actualPaths.length !== expectedPaths.length ||
    actualPaths.some((value, index) => value !== expectedPaths[index])
  ) fail("NBR70_FINAL_ARTIFACT_MISMATCH");
  for (const relativePath of actualPaths) {
    if (actual.get(relativePath) !== expected.get(relativePath)) {
      fail("NBR70_FINAL_ARTIFACT_MISMATCH");
    }
  }
}

function json(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return fail("NBR70_ARTIFACT_INVALID");
  }
}

function requirePng(bytes: Uint8Array, expectedHash: Sha256HashV1): void {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length < signature.length ||
    signature.some((value, index) => bytes[index] !== value)
  ) fail("NBR70_CAPTURE_ARTIFACT_HASH_MISMATCH");
  if (sha256Bytes(bytes) !== expectedHash) {
    fail("NBR70_CAPTURE_ARTIFACT_HASH_MISMATCH");
  }
}

function controlledState(
  snapshot: WorldRuntimeSnapshotV4,
  subjectEntityId: string,
) {
  return snapshot.world.subjectStatesByEntityId[subjectEntityId] ?? fail(
    "NBR70_PLAYABILITY_SNAPSHOT_INVALID",
  );
}

function position(
  snapshot: WorldRuntimeSnapshotV4,
  subjectEntityId: string,
): readonly [number, number, number] {
  return controlledState(snapshot, subjectEntityId).entityState.positionMetersXYZ;
}

function movementMedium(
  snapshot: WorldRuntimeSnapshotV4,
  subjectEntityId: string,
): "ground" | "air" {
  const state = Object.values(
    controlledState(snapshot, subjectEntityId).capabilityStatesById,
  ).find(({ kind }) => kind === "locomotion-capability-state-v2");
  if (
    state?.kind !== "locomotion-capability-state-v2" ||
    state.locomotion.status !== "active" ||
    (state.locomotion.movementMedium !== "ground" &&
      state.locomotion.movementMedium !== "air")
  ) fail("NBR70_PLAYABILITY_SNAPSHOT_INVALID");
  return state.locomotion.movementMedium;
}

function assertReadySnapshot(
  value: unknown,
  runtimeSessionId?: string,
  worldSessionId?: string,
): WorldRuntimeSnapshotV4 {
  let snapshot: WorldRuntimeSnapshotV4;
  try {
    snapshot = parseWorldRuntimeSnapshotV4(value);
  } catch {
    fail("NBR70_PLAYABILITY_SNAPSHOT_INVALID");
  }
  if (
    snapshot.runtime.phase !== "ready" ||
    snapshot.resources.phase !== "ready" ||
    (runtimeSessionId !== undefined && snapshot.runtimeSessionId !== runtimeSessionId) ||
    (worldSessionId !== undefined && snapshot.worldSessionId !== worldSessionId)
  ) fail("NBR70_PLAYABILITY_SNAPSHOT_INVALID");
  return snapshot;
}

function assertObservationMatchesCapture(
  observation: FormalMeasuredObservationIdentityV1,
  captureReceipt: ReturnType<typeof parseFormalWorldCaptureReceiptV1>,
): void {
  exact(observation.worldPackageRef, captureReceipt.worldPackageRef);
  exact(observation.worldPackageRootHash, captureReceipt.worldPackageRootHash);
  exact(observation.worldBuildIdentityRef, captureReceipt.worldBuildIdentityRef);
  exact(observation.worldBuildIdentityHash, captureReceipt.worldBuildIdentityHash);
  exact(observation.formalRequestRef, captureReceipt.formalRequestRef);
  exact(observation.formalRequestHash, captureReceipt.formalRequestHash);
  exact(observation.semanticCaptureMapHash, captureReceipt.semanticCaptureMapHash);
  exact(observation.runtimeSessionId, captureReceipt.runtimeSessionId);
  exact(observation.resetReadySnapshotHash, captureReceipt.readySnapshotHash);
  const owner = captureReceipt.sdkOwnerIdentities.find(
    ({ ownerId }) => ownerId === observation.domainOwnerIdentity.ownerId,
  );
  if (owner === undefined) fail("NBR70_IDENTITY_MISMATCH");
  exact(observation.domainOwnerIdentity.implementationRef, owner.implementationRef);
  exact(observation.domainOwnerIdentity.implementationHash, owner.implementationHash);
}

function distance(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function coordinate(
  positionMetersXYZ: readonly [number, number, number],
  axis: "x" | "y" | "z",
): number {
  return positionMetersXYZ[axis === "x" ? 0 : axis === "y" ? 1 : 2];
}

function measureCheckpoint(
  criterion: FormalTraversalCheckpointSpatialCriterionV1,
  positionMetersXYZ: readonly [number, number, number],
  isFinalTick: boolean,
): "reached" | "passed" | "blocked" | undefined {
  if (criterion.kind === "reach-bounds") {
    const margin = criterion.capsuleRadiusMeters + criterion.toleranceMeters;
    return positionMetersXYZ.every((value, axis) =>
      value >= criterion.sourceBoundsMeters.minimumMetersXYZ[axis]! - margin &&
      value <= criterion.sourceBoundsMeters.maximumMetersXYZ[axis]! + margin)
      ? "reached"
      : undefined;
  }
  const value = coordinate(positionMetersXYZ, criterion.axis);
  const clearance = Math.max(
    0,
    criterion.capsuleRadiusMeters - criterion.toleranceMeters,
  );
  const crossed = criterion.expectedCenterSide === "positive"
    ? value >= criterion.planeMeters + clearance
    : value <= criterion.planeMeters - clearance;
  if (criterion.kind === "pass-plane") return crossed ? "passed" : undefined;
  if (crossed) return "passed";
  return isFinalTick && !crossed ? "blocked" : undefined;
}

function uniqueSortedExactSet(values: readonly string[]): readonly string[] {
  const sorted = [...values].sort();
  if (new Set(sorted).size !== sorted.length) {
    fail("NBR70_BLOCKER_IDENTITY_MISMATCH");
  }
  return sorted;
}

function exactStringSet(
  actual: readonly string[],
  expected: readonly string[],
): void {
  if (
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) fail("NBR70_BLOCKER_IDENTITY_MISMATCH");
}

function verifyBlockerEvidenceClosure(input: Readonly<{
  caseBlockerColliderIds: readonly string[];
  formalChecks: ReturnType<typeof parseFormalWorldCaptureReceiptV1>["formalRequest"]["scriptedTraversal"]["checks"];
  contribution: BabylonNativeSceneContributionV1;
  materializerMetadata: BabylonNativeBlockMaterializerMetadataV1;
}>): readonly string[] {
  const caseBlockers = uniqueSortedExactSet(input.caseBlockerColliderIds);
  const blockCriteria = input.formalChecks.flatMap((check) =>
    check.checkpointCriteria.filter((criterion) => criterion.kind === "block-plane"));
  const formalBlockers = uniqueSortedExactSet(
    blockCriteria.map(({ colliderId }) => colliderId),
  );
  const contributionBlockers = uniqueSortedExactSet(
    input.contribution.staticColliders
      .filter(({ traversalBinding }) => traversalBinding.kind === "not-traversable")
      .map(({ id }) => id),
  );
  exactStringSet(formalBlockers, caseBlockers);
  exactStringSet(contributionBlockers, caseBlockers);

  const joinsByColliderId = new Map<string, readonly Readonly<{
    colliderId: string;
    blockId: string;
  }>[]>();
  for (const colliderId of caseBlockers) {
    joinsByColliderId.set(
      colliderId,
      input.materializerMetadata.colliderJoins.filter(
        (join) => join.colliderId === colliderId,
      ),
    );
  }
  for (const criterion of blockCriteria) {
    const joins = joinsByColliderId.get(criterion.colliderId);
    if (joins?.length !== 1) fail("NBR70_BLOCKER_IDENTITY_MISMATCH");
    const block = input.materializerMetadata.blocks.find(
      ({ blockId }) => blockId === joins[0]!.blockId,
    );
    if (block?.visualGroupId !== criterion.sourceVisualGroupId) {
      fail("NBR70_BLOCKER_IDENTITY_MISMATCH");
    }
  }
  return caseBlockers;
}

export const NATIVE_BLOCK_RECONSTRUCTION_E2E_TEST_HARNESS_V1 = Object.freeze({
  verifyBlockerEvidenceClosure,
});

type ReconstructionRunReceipt = ReturnType<
  typeof parseWorldReconstructionRunReceiptV1
>;
type ReconstructionCase = ReturnType<typeof parseWorldReconstructionCaseV1>;
type ReconstructionEvaluationProfile = ReturnType<
  typeof parseWorldReconstructionEvaluationProfileV1
>;
type VerifiedNativePackage = Extract<
  ReturnType<typeof verifyWorldPackageDirectoryV1>,
  { readonly kind: "babylon-native-scene" }
>;
interface VerifiedRunAttemptArtifacts {
  readonly runAttempt: ReconstructionRunReceipt["attempts"][number];
  readonly packageDirectoryPath: string;
  readonly verified: VerifiedNativePackage;
  readonly captureReceipt: ReturnType<typeof parseFormalWorldCaptureReceiptV1>;
  readonly evaluation: ReturnType<
    typeof parseWorldReconstructionEvaluationResultV1
  >;
  readonly captureReceiptHash: Sha256HashV1;
  readonly evaluationResultHash: Sha256HashV1;
  readonly blockerColliderIds: readonly string[];
}

async function verifyAllRunAttempts(input: Readonly<{
  runRoot: string;
  runReceipt: ReconstructionRunReceipt;
  reconstructionCase: ReconstructionCase;
  evaluationProfile: ReconstructionEvaluationProfile;
}>): Promise<readonly VerifiedRunAttemptArtifacts[]> {
  let frozenRequest: ReturnType<typeof parseNativeBlockGenerationRequestV1> |
    undefined;
  const verifiedAttempts: VerifiedRunAttemptArtifacts[] = [];
  for (const runAttempt of input.runReceipt.attempts) {
    const attemptRoot = path.join(
      input.runRoot,
      `attempts/${runAttempt.attemptIndex}`,
    );
    const generationRequest = parseNativeBlockGenerationRequestV1(json(
      await requiredFile(
        attemptRoot,
        "generation-request.json",
        "NBR70_REQUIRED_ARTIFACT_MISSING",
      ),
    ));
    const generationReceipt = parseNativeBlockGenerationReceiptV1(json(
      await requiredFile(
        attemptRoot,
        "generation-receipt.json",
        "NBR70_REQUIRED_ARTIFACT_MISSING",
      ),
    ));
    exact(
      runAttempt.generationRequestHash,
      hashNativeBlockGenerationRequestV1(generationRequest),
    );
    exact(
      runAttempt.generationReceiptHash,
      hashNativeBlockGenerationReceiptV1(generationReceipt),
    );
    exact(runAttempt.generationRequestRef, generationReceipt.generationRequestRef);
    if (
      generationReceipt.outcome !== "completed" ||
      generationReceipt.cleanupOutcome !== "completed"
    ) fail("NBR70_CLEANUP_INCOMPLETE");
    assertNativeBlockGenerationReceiptMatchesRequestV1(
      generationRequest,
      generationReceipt,
    );
    if (frozenRequest === undefined) {
      frozenRequest = generationRequest;
    } else {
      for (const [actual, expected] of [
        [generationRequest.routeDecisionHash, frozenRequest.routeDecisionHash],
        [generationRequest.sceneBriefHash, frozenRequest.sceneBriefHash],
        [generationRequest.bootstrapInputHash, frozenRequest.bootstrapInputHash],
        [generationRequest.nativeSceneApiHash, frozenRequest.nativeSceneApiHash],
        [generationRequest.nativeSceneProfileHash, frozenRequest.nativeSceneProfileHash],
        [generationRequest.blockProfileHash, frozenRequest.blockProfileHash],
        [sha256CanonicalJson(generationRequest.referenceInputs),
          sha256CanonicalJson(frozenRequest.referenceInputs)],
      ] as const) exact(actual, expected);
    }
    for (const output of generationReceipt.outputs) {
      const bytes = await requiredFile(
        attemptRoot,
        `source/${output.path}`,
        "NBR70_REQUIRED_ARTIFACT_MISSING",
      );
      if (
        bytes.byteLength !== output.sizeBytes ||
        sha256Bytes(bytes) !== output.contentHash
      ) fail("NBR70_IDENTITY_MISMATCH");
    }

    const routeDecision = parseSceneAuthoringRouteDecisionV1(json(
      await requiredFile(
        attemptRoot,
        "scene-authoring-route-decision.json",
        "NBR70_REQUIRED_ARTIFACT_MISSING",
      ),
    ));
    const attempt = parseSceneAuthoringAttemptV1(json(await requiredFile(
      attemptRoot,
      "attempt.json",
      "NBR70_REQUIRED_ARTIFACT_MISSING",
    )));
    const attemptResult = parseSceneAuthoringAttemptResultV1(json(
      await requiredFile(
        attemptRoot,
        "attempt-result.json",
        "NBR70_REQUIRED_ARTIFACT_MISSING",
      ),
    ));
    if (
      attempt.sourceInput.kind !== "babylon-native" ||
      attemptResult.outcome !== "completed"
    ) fail("NBR70_IDENTITY_MISMATCH");
    exact(
      generationRequest.routeDecisionHash,
      hashSceneAuthoringRouteDecisionV1(routeDecision),
    );
    exact(
      attempt.sceneAuthoringRouteDecisionHash,
      hashSceneAuthoringRouteDecisionV1(routeDecision),
    );
    exact(runAttempt.sceneAuthoringAttemptHash, hashSceneAuthoringAttemptV1(attempt));
    exact(
      runAttempt.sceneAuthoringAttemptResultHash,
      hashSceneAuthoringAttemptResultV1(attemptResult),
    );
    assertNativeBlockGenerationRequestMatchesAttemptV1(
      attempt.sourceInput.generationRequestRef,
      generationRequest,
      attempt,
    );

    const checkResult = parseNativeSceneCheckResultV1(json(await requiredFile(
      attemptRoot,
      "native-check-result.json",
      "NBR70_REQUIRED_ARTIFACT_MISSING",
    )));
    if (checkResult.outcome !== "passed") fail("NBR70_IDENTITY_MISMATCH");
    const explain = new TextDecoder().decode(await requiredFile(
      attemptRoot,
      "native-explain.txt",
      "NBR70_REQUIRED_ARTIFACT_MISSING",
    ));
    if (explain !== explainNativeSceneCheckResultV1(checkResult)) {
      fail("NBR70_IDENTITY_MISMATCH");
    }
    const packageDirectoryPath = path.join(attemptRoot, "world-package");
    const verified = verifyWorldPackageDirectoryV1(
      await readWorldPackageDirectoryV1({
        packageDirectoryPath,
        maximumTotalBytes: 512_000_000,
        maximumFileCount: 10_000,
      }),
    );
    if (
      verified.kind !== "babylon-native-scene" ||
      verified.nativeBlockMaterializerMetadata === undefined
    ) fail("NBR70_IDENTITY_MISMATCH");
    exact(runAttempt.worldPackageRef, verified.receipt.worldPackageRef);
    exact(runAttempt.worldPackageRootHash, verified.receipt.worldPackageRootHash);
    exact(runAttempt.worldPackageBuildReceiptHash, sha256CanonicalJson(verified.receipt));
    exact(runAttempt.worldBuildIdentityHash, verified.receipt.worldBuildIdentityHash);
    exact(
      hashSceneAuthoringAttemptV1(verified.sceneAuthoringAttempt),
      hashSceneAuthoringAttemptV1(attempt),
    );
    exact(
      hashSceneAuthoringAttemptResultV1(verified.sceneAuthoringAttemptResult),
      hashSceneAuthoringAttemptResultV1(attemptResult),
    );
    exact(
      hashNativeSceneCheckResultV1(verified.nativeSceneCheckResult),
      hashNativeSceneCheckResultV1(checkResult),
    );

    const captureRoot = path.join(attemptRoot, "capture");
    const captureReceipt = parseFormalWorldCaptureReceiptV1(json(
      await requiredFile(
        captureRoot,
        "formal-world-capture-receipt.json",
        "NBR70_CAPTURE_ARTIFACT_MISSING",
      ),
    ));
    exact(runAttempt.captureReceiptHash, hashFormalWorldCaptureReceiptV1(captureReceipt));
    exact(captureReceipt.caseRef, input.runReceipt.caseRef);
    exact(captureReceipt.caseHash, input.runReceipt.caseHash);
    exact(captureReceipt.evaluationProfileRef, input.runReceipt.evaluationProfileRef);
    exact(captureReceipt.evaluationProfileHash, input.runReceipt.evaluationProfileHash);
    exact(captureReceipt.sceneAuthoringAttemptRef, runAttempt.sceneAuthoringAttemptRef);
    exact(captureReceipt.sceneAuthoringAttemptHash, runAttempt.sceneAuthoringAttemptHash);
    exact(
      captureReceipt.sceneAuthoringAttemptResultRef,
      runAttempt.sceneAuthoringAttemptResultRef,
    );
    exact(
      captureReceipt.sceneAuthoringAttemptResultHash,
      runAttempt.sceneAuthoringAttemptResultHash,
    );
    exact(captureReceipt.worldPackageRef, runAttempt.worldPackageRef);
    exact(captureReceipt.worldPackageRootHash, runAttempt.worldPackageRootHash);
    exact(
      captureReceipt.worldPackageBuildReceiptRef,
      runAttempt.worldPackageBuildReceiptRef,
    );
    exact(
      captureReceipt.worldPackageBuildReceiptHash,
      runAttempt.worldPackageBuildReceiptHash,
    );
    exact(captureReceipt.worldBuildIdentityRef, runAttempt.worldBuildIdentityRef);
    exact(captureReceipt.worldBuildIdentityHash, runAttempt.worldBuildIdentityHash);
    if (
      captureReceipt.cleanupOutcome !== "completed" ||
      captureReceipt.cameraRollbackOutcome !== "completed" ||
      captureReceipt.resetOutcome !== "completed"
    ) fail("NBR70_CLEANUP_INCOMPLETE");
    for (const view of captureReceipt.views) {
      requirePng(
        await requiredFile(
          captureRoot,
          `${view.viewId}.png`,
          "NBR70_CAPTURE_ARTIFACT_MISSING",
        ),
        view.pngContentHash,
      );
    }
    requirePng(
      await requiredFile(
        captureRoot,
        "collider-overlay.png",
        "NBR70_CAPTURE_ARTIFACT_MISSING",
      ),
      captureReceipt.colliderOverlayPngContentHash,
    );
    const opening = parseFormalOpeningObservationV1(json(await requiredFile(
      captureRoot,
      "opening-observation.json",
      "NBR70_CAPTURE_ARTIFACT_MISSING",
    )));
    const spawn = parseFormalSpawnSupportObservationV1(json(await requiredFile(
      captureRoot,
      "spawn-support-observation.json",
      "NBR70_CAPTURE_ARTIFACT_MISSING",
    )));
    const overlay = parseFormalColliderOverlayObservationV1(json(await requiredFile(
      captureRoot,
      "collider-overlay-observation.json",
      "NBR70_CAPTURE_ARTIFACT_MISSING",
    )));
    const scripted = parseFormalScriptedTraversalObservationV1(json(
      await requiredFile(
        captureRoot,
        "scripted-traversal.json",
        "NBR70_CAPTURE_ARTIFACT_MISSING",
      ),
    ));
    for (const observation of [opening, spawn, overlay, scripted]) {
      assertObservationMatchesCapture(observation, captureReceipt);
    }
    const blockerColliderIds = verifyBlockerEvidenceClosure({
      caseBlockerColliderIds: input.reconstructionCase.expected.colliders
        .filter(({ role }) => role === "blocker")
        .map(({ colliderId }) => colliderId),
      formalChecks: captureReceipt.formalRequest.scriptedTraversal.checks,
      contribution: verified.nativeSceneContribution,
      materializerMetadata: verified.nativeBlockMaterializerMetadata,
    });

    const authoringManifest = parseNativeBlockAuthoringManifestV1(json(
      await requiredFile(
        attemptRoot,
        "source/native-block-authoring.json",
        "NBR70_REQUIRED_ARTIFACT_MISSING",
      ),
    ));
    const storedEvidence = parseWorldReconstructionEvidenceSetV1(json(
      await requiredFile(
        attemptRoot,
        "evidence-set.json",
        "NBR70_REQUIRED_ARTIFACT_MISSING",
      ),
    ));
    const recomputedEvidence = buildWorldReconstructionEvidenceSetV1({
      id: storedEvidence.id,
      caseRef: input.runReceipt.caseRef,
      reconstructionCase: input.reconstructionCase,
      evaluationProfileRef: input.runReceipt.evaluationProfileRef,
      evaluationProfile: input.evaluationProfile,
      authoringManifest,
      verifiedWorldPackage: verified,
      captureReceiptRef: runAttempt.captureReceiptRef,
      captureReceipt,
      openingObservation: opening,
      spawnSupportObservation: spawn,
      colliderOverlayObservation: overlay,
      scriptedTraversalObservation: scripted,
    });
    if (
      hashWorldReconstructionEvidenceSetV1(storedEvidence) !==
      hashWorldReconstructionEvidenceSetV1(recomputedEvidence)
    ) fail("NBR70_EVALUATION_EVIDENCE_MISMATCH");
    const storedEvaluation = parseWorldReconstructionEvaluationResultV1(json(
      await requiredFile(
        attemptRoot,
        "evaluation.json",
        "NBR70_REQUIRED_ARTIFACT_MISSING",
      ),
    ));
    const recomputedEvaluation = evaluateWorldReconstructionV1({
      case: input.reconstructionCase,
      profile: input.evaluationProfile,
      evidence: recomputedEvidence,
    });
    if (
      hashWorldReconstructionEvaluationResultV1(storedEvaluation) !==
      hashWorldReconstructionEvaluationResultV1(recomputedEvaluation)
    ) fail("NBR70_EVALUATION_EVIDENCE_MISMATCH");
    exact(
      runAttempt.evaluationResultHash,
      hashWorldReconstructionEvaluationResultV1(recomputedEvaluation),
    );
    exact(runAttempt.outcome, recomputedEvaluation.outcome);
    verifiedAttempts.push(Object.freeze({
      runAttempt,
      packageDirectoryPath,
      verified,
      captureReceipt,
      evaluation: storedEvaluation,
      captureReceiptHash: hashFormalWorldCaptureReceiptV1(captureReceipt),
      evaluationResultHash:
        hashWorldReconstructionEvaluationResultV1(storedEvaluation),
      blockerColliderIds,
    }));
  }
  return Object.freeze(verifiedAttempts);
}

async function verifyFinalPromotion(input: Readonly<{
  runRoot: string;
  finalDirectoryPath: string;
  runReceipt: ReconstructionRunReceipt;
  reconstructionCase: ReconstructionCase;
}>): Promise<string> {
  const runParent = path.dirname(input.runRoot);
  if (path.basename(runParent) !== "runs") fail("NBR70_FINAL_DIRECTORY_INVALID");
  const caseRoot = path.dirname(runParent);
  const finalRoot = await canonicalDirectory(
    input.finalDirectoryPath,
    "NBR70_FINAL_DIRECTORY_INVALID",
  );
  const acceptedRoots = new Set([
    path.join(caseRoot, "final"),
    path.join(caseRoot, ".final-staging"),
  ]);
  if (!acceptedRoots.has(finalRoot)) fail("NBR70_FINAL_DIRECTORY_INVALID");

  const launchValue = json(await requiredFile(
    finalRoot,
    "launch.json",
    "NBR70_FINAL_LAUNCH_MISSING",
  ));
  if (typeof launchValue !== "object" || launchValue === null ||
      Array.isArray(launchValue)) fail("NBR70_FINAL_LAUNCH_INVALID");
  const launch = launchValue as Record<string, unknown>;
  const fields = [
    "kind", "schemaVersion", "caseId", "runReceiptRef", "runReceiptHash",
    "worldPackageRelativePath", "worldPackageRef", "worldPackageRootHash",
    "captureReceiptRelativePath", "captureReceiptHash",
    "evaluationRelativePath", "evaluationHash", "launchCommand",
  ].sort();
  const actualFields = Object.keys(launch).sort();
  if (
    fields.length !== actualFields.length ||
    fields.some((field, index) => field !== actualFields[index])
  ) fail("NBR70_FINAL_LAUNCH_INVALID");
  exact(launch.kind, "native-block-reconstruction-launch");
  exact(launch.schemaVersion, 1);
  exact(launch.caseId, input.reconstructionCase.id);
  exact(launch.runReceiptHash, sha256CanonicalJson(input.runReceipt));
  if (typeof launch.runReceiptRef !== "string" || launch.runReceiptRef.length === 0) {
    fail("NBR70_FINAL_LAUNCH_INVALID");
  }
  const caseRefSuffix = "/case.json";
  if (!input.runReceipt.caseRef.endsWith(caseRefSuffix)) {
    fail("NBR70_FINAL_LAUNCH_INVALID");
  }
  exact(
    launch.runReceiptRef,
    `${input.runReceipt.caseRef.slice(0, -caseRefSuffix.length)}/runs/${
      path.basename(input.runRoot)
    }/run-receipt.json`,
  );
  exact(launch.worldPackageRelativePath, "final/world-package");
  exact(
    launch.captureReceiptRelativePath,
    "final/capture/formal-world-capture-receipt.json",
  );
  exact(launch.evaluationRelativePath, "final/evaluation.json");
  exact(
    launch.launchCommand,
    "pnpm worldkit native run final/world-package --port 5174 --json",
  );

  const finalAttempt = input.runReceipt.attempts[input.runReceipt.finalAttemptIndex]!;
  exact(launch.worldPackageRef, finalAttempt.worldPackageRef);
  exact(launch.worldPackageRootHash, finalAttempt.worldPackageRootHash);
  exact(launch.captureReceiptHash, finalAttempt.captureReceiptHash);
  exact(launch.evaluationHash, finalAttempt.evaluationResultHash);
  const attemptRoot = path.join(
    input.runRoot,
    `attempts/${finalAttempt.attemptIndex}`,
  );
  const packageDirectoryPath = path.join(finalRoot, "world-package");
  const finalVerified = verifyWorldPackageDirectoryV1(
    await readWorldPackageDirectoryV1({
      packageDirectoryPath,
      maximumTotalBytes: 512_000_000,
      maximumFileCount: 10_000,
    }),
  );
  exact(finalVerified.receipt.worldPackageRef, finalAttempt.worldPackageRef);
  exact(finalVerified.receipt.worldPackageRootHash, finalAttempt.worldPackageRootHash);
  await assertDirectoriesByteEqual(
    packageDirectoryPath,
    path.join(attemptRoot, "world-package"),
  );
  await assertDirectoriesByteEqual(
    path.join(finalRoot, "capture"),
    path.join(attemptRoot, "capture"),
  );
  const finalEvaluationBytes = await requiredFile(
    finalRoot,
    "evaluation.json",
    "NBR70_FINAL_ARTIFACT_MISSING",
  );
  const attemptEvaluationBytes = await requiredFile(
    attemptRoot,
    "evaluation.json",
    "NBR70_REQUIRED_ARTIFACT_MISSING",
  );
  if (sha256Bytes(finalEvaluationBytes) !== sha256Bytes(attemptEvaluationBytes)) {
    fail("NBR70_FINAL_ARTIFACT_MISMATCH");
  }
  exact(
    hashWorldReconstructionEvaluationResultV1(json(finalEvaluationBytes)),
    finalAttempt.evaluationResultHash,
  );
  return packageDirectoryPath;
}

async function verifyPlayability(input: Readonly<{
  session: NativeBlockReconstructionPlayabilitySessionPortV1;
  subjectEntityId: string;
  spawnColliderId: string;
  expectedSpawnPosition: readonly [number, number, number];
  maximumPositionDriftMeters: number;
  checks: ReturnType<typeof parseFormalWorldCaptureReceiptV1>["formalRequest"]["scriptedTraversal"]["checks"];
  caseChecks: ReturnType<typeof parseWorldReconstructionCaseV1>["expected"]["criticalTraversalChecks"];
  blockerColliderIds: readonly string[];
}>): Promise<NativeBlockReconstructionE2EVerificationV1["playability"]> {
  const ready = assertReadySnapshot(await input.session.awaitReady());
  const runtimeSessionId = ready.runtimeSessionId;
  let previousWorldSessionId = ready.worldSessionId;
  const resetGrounded = async () => {
    const reset = assertReadySnapshot(
      await input.session.resetWithInitialControlBinding(),
      runtimeSessionId,
    );
    if (reset.worldSessionId === previousWorldSessionId) {
      fail("NBR70_PLAYABILITY_RESET_FAILED");
    }
    previousWorldSessionId = reset.worldSessionId;
    const settled = assertReadySnapshot(
      await input.session.runFixedInput({ actions: [], axes: {}, ticks: 1 }),
      runtimeSessionId,
      reset.worldSessionId,
    );
    if (settled.world.simulationTick !== reset.world.simulationTick + 1) {
      fail("NBR70_PLAYABILITY_RESET_FAILED");
    }
    const support = await input.session.readCommittedSubjectSupport(
      input.subjectEntityId,
      settled.world.simulationTick,
    );
    if (
      support?.runtimeSessionId !== runtimeSessionId ||
      support.worldSessionId !== settled.worldSessionId ||
      support.subjectEntityId !== input.subjectEntityId ||
      support.simulationTick !== settled.world.simulationTick ||
      support.mode !== "supported" ||
      support.colliderId !== input.spawnColliderId ||
      movementMedium(settled, input.subjectEntityId) !== "ground" ||
      distance(position(settled, input.subjectEntityId), input.expectedSpawnPosition) >
        input.maximumPositionDriftMeters
    ) fail("NBR70_PLAYABILITY_GROUNDED_SPAWN_FAILED");
    return settled;
  };

  await resetGrounded();
  for (const [action, axis, direction] of [
    ["move-forward", 2, -1],
    ["move-left", 0, -1],
    ["move-backward", 2, 1],
    ["move-right", 0, 1],
  ] as const) {
    const reset = await resetGrounded();
    const moved = assertReadySnapshot(
      await input.session.runFixedInput({ actions: [action], ticks: 1 }),
      runtimeSessionId,
      reset.worldSessionId,
    );
    const before = position(reset, input.subjectEntityId);
    const after = position(moved, input.subjectEntityId);
    if ((after[axis] - before[axis]) * direction <= 1e-6) {
      fail("NBR70_PLAYABILITY_MOVE_FAILED");
    }
  }

  const beforeJump = await resetGrounded();
  const jumped = assertReadySnapshot(
    await input.session.runFixedInput({ actions: ["jump"], ticks: 1 }),
    runtimeSessionId,
    beforeJump.worldSessionId,
  );
  let highestJumpY = position(jumped, input.subjectEntityId)[1];
  let observedAir = movementMedium(jumped, input.subjectEntityId) === "air";
  let landed = movementMedium(jumped, input.subjectEntityId) === "ground";
  let landingSnapshot = jumped;
  for (let tick = 0; tick < 180 && !landed; tick += 1) {
    landingSnapshot = assertReadySnapshot(
      await input.session.runFixedInput({ actions: [], axes: {}, ticks: 1 }),
      runtimeSessionId,
      beforeJump.worldSessionId,
    );
    highestJumpY = Math.max(
      highestJumpY,
      position(landingSnapshot, input.subjectEntityId)[1],
    );
    observedAir ||= movementMedium(landingSnapshot, input.subjectEntityId) === "air";
    landed = movementMedium(landingSnapshot, input.subjectEntityId) === "ground";
  }
  if (
    !observedAir ||
    highestJumpY <= position(beforeJump, input.subjectEntityId)[1] + 0.05 ||
    !landed
  ) fail("NBR70_PLAYABILITY_JUMP_FAILED");
  await resetGrounded();

  const caseCheckById = new Map(input.caseChecks.map((check) => [check.id, check]));
  const results = [] as Array<{
    id: string;
    outcome: "passed" | "blocked";
    checkpointIds: readonly string[];
  }>;
  for (const check of input.checks) {
    const caseCheck = caseCheckById.get(check.id);
    if (
      caseCheck === undefined ||
      caseCheck.expectation !== check.checkExpectation ||
      sha256CanonicalJson(caseCheck.fixedInputSequence) !== check.fixedInputSequenceHash
    ) fail("NBR70_IDENTITY_MISMATCH");
    const reset = await resetGrounded();
    const measured = new Map<string, "reached" | "passed" | "blocked">();
    const totalTicks = check.fixedInputSequence.reduce(
      (total, fixedInput) => total + fixedInput.ticks,
      0,
    );
    let committed = 0;
    for (const fixedInput of check.fixedInputSequence) {
      for (let tick = 0; tick < fixedInput.ticks; tick += 1) {
        committed += 1;
        const snapshot = assertReadySnapshot(
          await input.session.runFixedInput({
            actions: fixedInput.actions,
            ...(fixedInput.axes === undefined ? {} : { axes: fixedInput.axes }),
            ticks: 1,
          }),
          runtimeSessionId,
          reset.worldSessionId,
        );
        if (snapshot.world.simulationTick !== reset.world.simulationTick + committed) {
          fail("NBR70_PLAYABILITY_TRAVERSAL_FAILED");
        }
        for (const criterion of check.checkpointCriteria) {
          if (measured.has(criterion.checkpointId)) continue;
          const outcome = measureCheckpoint(
            criterion,
            position(snapshot, input.subjectEntityId),
            committed === totalTicks,
          );
          if (outcome !== undefined) measured.set(criterion.checkpointId, outcome);
        }
      }
    }
    for (const criterion of check.checkpointCriteria) {
      const expectedOutcome = criterion.expectation === "reach"
        ? "reached"
        : criterion.expectation === "pass"
          ? "passed"
          : "blocked";
      if (measured.get(criterion.checkpointId) !== expectedOutcome) {
        fail("NBR70_PLAYABILITY_TRAVERSAL_FAILED");
      }
    }
    const checkpointIds = [...measured.keys()].sort();
    const expectedCheckpointIds = [...caseCheck.checkpointIds].sort();
    if (
      checkpointIds.length !== expectedCheckpointIds.length ||
      checkpointIds.some((id, index) => id !== expectedCheckpointIds[index])
    ) fail("NBR70_PLAYABILITY_TRAVERSAL_FAILED");
    const outcome = check.checkExpectation === "block" ? "blocked" : "passed";
    results.push(Object.freeze({ id: check.id, outcome, checkpointIds }));
  }
  if (results.length !== input.caseChecks.length) {
    fail("NBR70_PLAYABILITY_TRAVERSAL_FAILED");
  }
  const blockerCriteria = input.checks.flatMap((check) =>
    check.checkpointCriteria.filter((criterion) => criterion.kind === "block-plane")
      .map((criterion) => criterion.colliderId));
  if (input.blockerColliderIds.some((colliderId) =>
    !blockerCriteria.includes(colliderId))) {
    fail("NBR70_PLAYABILITY_TRAVERSAL_FAILED");
  }
  await resetGrounded();
  return Object.freeze({
    groundedSpawn: true,
    moved: true,
    jumped: true,
    reset: true,
    scriptedTraversalChecks: Object.freeze(results),
  });
}

export async function verifyNativeBlockReconstructionE2EV1(
  input: VerifyNativeBlockReconstructionE2EInputV1,
): Promise<NativeBlockReconstructionE2EVerificationV1> {
  const runRoot = await canonicalDirectory(
    input.candidate.runDirectoryPath,
    "NBR70_RUN_DIRECTORY_INVALID",
  );
  const runReceiptBytes = await requiredFile(
    runRoot,
    "run-receipt.json",
    "NBR70_RUN_RECEIPT_MISSING",
  );
  const runReceipt = parseWorldReconstructionRunReceiptV1(json(runReceiptBytes));
  if (runReceipt.cleanupOutcome !== "completed" || runReceipt.outcome !== "passed") {
    fail("NBR70_CLEANUP_INCOMPLETE");
  }
  const reconstructionCase = parseWorldReconstructionCaseV1(json(await requiredFile(
    runRoot,
    "inputs/case.json",
    "NBR70_REQUIRED_ARTIFACT_MISSING",
  )));
  const evaluationProfile = parseWorldReconstructionEvaluationProfileV1(json(
    await requiredFile(
      runRoot,
      "inputs/evaluation-profile.json",
      "NBR70_REQUIRED_ARTIFACT_MISSING",
    ),
  ));
  exact(runReceipt.caseHash, hashWorldReconstructionCaseV1(reconstructionCase));
  exact(runReceipt.evaluationProfileRef, reconstructionCase.evaluationProfileRef);
  exact(runReceipt.evaluationProfileHash,
    hashWorldReconstructionEvaluationProfileV1(evaluationProfile));
  exact(reconstructionCase.evaluationProfileHash,
    hashWorldReconstructionEvaluationProfileV1(evaluationProfile));
  await verifyAllRunAttempts({
    runRoot,
    runReceipt,
    reconstructionCase,
    evaluationProfile,
  });

  const runAttempt = runReceipt.attempts[runReceipt.finalAttemptIndex]!;
  const attemptRoot = path.join(runRoot, `attempts/${runAttempt.attemptIndex}`);
  const generationRequest = parseNativeBlockGenerationRequestV1(json(
    await requiredFile(attemptRoot, "generation-request.json", "NBR70_REQUIRED_ARTIFACT_MISSING"),
  ));
  const generationReceipt = parseNativeBlockGenerationReceiptV1(json(
    await requiredFile(attemptRoot, "generation-receipt.json", "NBR70_REQUIRED_ARTIFACT_MISSING"),
  ));
  exact(runAttempt.generationRequestHash,
    hashNativeBlockGenerationRequestV1(generationRequest));
  exact(runAttempt.generationReceiptHash,
    hashNativeBlockGenerationReceiptV1(generationReceipt));
  exact(runAttempt.generationRequestRef, generationReceipt.generationRequestRef);
  if (
    generationReceipt.outcome !== "completed" ||
    generationReceipt.cleanupOutcome !== "completed"
  ) fail("NBR70_CLEANUP_INCOMPLETE");
  assertNativeBlockGenerationReceiptMatchesRequestV1(
    generationRequest,
    generationReceipt,
  );
  for (const output of generationReceipt.outputs) {
    const bytes = await requiredFile(
      attemptRoot,
      `source/${output.path}`,
      "NBR70_REQUIRED_ARTIFACT_MISSING",
    );
    if (bytes.byteLength !== output.sizeBytes || sha256Bytes(bytes) !== output.contentHash) {
      fail("NBR70_IDENTITY_MISMATCH");
    }
  }

  const routeDecision = parseSceneAuthoringRouteDecisionV1(json(await requiredFile(
    attemptRoot,
    "scene-authoring-route-decision.json",
    "NBR70_REQUIRED_ARTIFACT_MISSING",
  )));
  const attempt = parseSceneAuthoringAttemptV1(json(await requiredFile(
    attemptRoot,
    "attempt.json",
    "NBR70_REQUIRED_ARTIFACT_MISSING",
  )));
  const attemptResult = parseSceneAuthoringAttemptResultV1(json(await requiredFile(
    attemptRoot,
    "attempt-result.json",
    "NBR70_REQUIRED_ARTIFACT_MISSING",
  )));
  if (attemptResult.outcome !== "completed") fail("NBR70_IDENTITY_MISMATCH");
  exact(generationRequest.routeDecisionHash,
    hashSceneAuthoringRouteDecisionV1(routeDecision));
  exact(attempt.sceneAuthoringRouteDecisionHash,
    hashSceneAuthoringRouteDecisionV1(routeDecision));
  exact(runAttempt.sceneAuthoringAttemptHash, hashSceneAuthoringAttemptV1(attempt));
  exact(runAttempt.sceneAuthoringAttemptResultHash,
    hashSceneAuthoringAttemptResultV1(attemptResult));
  exact(attemptResult.sceneAuthoringAttemptHash, hashSceneAuthoringAttemptV1(attempt));
  if (attempt.sourceInput.kind !== "babylon-native") fail("NBR70_IDENTITY_MISMATCH");
  assertNativeBlockGenerationRequestMatchesAttemptV1(
    attempt.sourceInput.generationRequestRef,
    generationRequest,
    attempt,
  );

  const checkResult = parseNativeSceneCheckResultV1(json(await requiredFile(
    attemptRoot,
    "native-check-result.json",
    "NBR70_REQUIRED_ARTIFACT_MISSING",
  )));
  if (checkResult.outcome !== "passed") fail("NBR70_IDENTITY_MISMATCH");
  const explain = new TextDecoder().decode(await requiredFile(
    attemptRoot,
    "native-explain.txt",
    "NBR70_REQUIRED_ARTIFACT_MISSING",
  ));
  if (explain !== explainNativeSceneCheckResultV1(checkResult)) {
    fail("NBR70_IDENTITY_MISMATCH");
  }

  const packageDirectoryPath = path.join(attemptRoot, "world-package");
  const packageDirectory = await readWorldPackageDirectoryV1({
    packageDirectoryPath,
    maximumTotalBytes: 512_000_000,
    maximumFileCount: 10_000,
  });
  const verified = verifyWorldPackageDirectoryV1(packageDirectory);
  if (
    verified.kind !== "babylon-native-scene" ||
    verified.nativeBlockMaterializerMetadata === undefined
  ) fail("NBR70_IDENTITY_MISMATCH");
  exact(runAttempt.worldPackageRef, verified.receipt.worldPackageRef);
  exact(runAttempt.worldPackageRootHash, verified.receipt.worldPackageRootHash);
  exact(runAttempt.worldPackageBuildReceiptHash,
    sha256CanonicalJson(verified.receipt));
  exact(runAttempt.worldBuildIdentityHash, verified.receipt.worldBuildIdentityHash);
  exact(hashSceneAuthoringRouteDecisionV1(verified.sceneAuthoringRouteDecision),
    hashSceneAuthoringRouteDecisionV1(routeDecision));
  exact(hashSceneAuthoringAttemptV1(verified.sceneAuthoringAttempt),
    hashSceneAuthoringAttemptV1(attempt));
  exact(hashSceneAuthoringAttemptResultV1(verified.sceneAuthoringAttemptResult),
    hashSceneAuthoringAttemptResultV1(attemptResult));
  exact(hashNativeSceneCheckResultV1(verified.nativeSceneCheckResult),
    hashNativeSceneCheckResultV1(checkResult));

  const captureRoot = path.join(attemptRoot, "capture");
  const captureReceipt = parseFormalWorldCaptureReceiptV1(json(await requiredFile(
    captureRoot,
    "formal-world-capture-receipt.json",
    "NBR70_CAPTURE_ARTIFACT_MISSING",
  )));
  const captureReceiptHash = hashFormalWorldCaptureReceiptV1(captureReceipt);
  exact(runAttempt.captureReceiptHash, captureReceiptHash);
  exact(captureReceipt.caseRef, runReceipt.caseRef);
  exact(captureReceipt.caseHash, runReceipt.caseHash);
  exact(captureReceipt.evaluationProfileRef, runReceipt.evaluationProfileRef);
  exact(captureReceipt.evaluationProfileHash, runReceipt.evaluationProfileHash);
  exact(captureReceipt.sceneAuthoringAttemptHash, runAttempt.sceneAuthoringAttemptHash);
  exact(captureReceipt.sceneAuthoringRouteDecisionHash,
    hashSceneAuthoringRouteDecisionV1(routeDecision));
  exact(captureReceipt.sceneAuthoringAttemptRef, runAttempt.sceneAuthoringAttemptRef);
  exact(captureReceipt.sceneAuthoringAttemptResultHash,
    runAttempt.sceneAuthoringAttemptResultHash);
  exact(captureReceipt.sceneAuthoringAttemptResultRef,
    runAttempt.sceneAuthoringAttemptResultRef);
  exact(captureReceipt.worldPackageRef, runAttempt.worldPackageRef);
  exact(captureReceipt.worldPackageRootHash, runAttempt.worldPackageRootHash);
  exact(captureReceipt.worldPackageBuildReceiptHash,
    runAttempt.worldPackageBuildReceiptHash);
  exact(captureReceipt.worldPackageBuildReceiptRef,
    runAttempt.worldPackageBuildReceiptRef);
  exact(captureReceipt.worldBuildIdentityRef, runAttempt.worldBuildIdentityRef);
  exact(captureReceipt.worldBuildIdentityHash, runAttempt.worldBuildIdentityHash);
  exact(captureReceipt.nativeBlockMaterializerMetadataHash,
    hashBabylonNativeBlockMaterializerMetadataV1(
      verified.nativeBlockMaterializerMetadata,
    ));
  if (
    captureReceipt.cleanupOutcome !== "completed" ||
    captureReceipt.cameraRollbackOutcome !== "completed" ||
    captureReceipt.resetOutcome !== "completed"
  ) fail("NBR70_CLEANUP_INCOMPLETE");
  for (const view of captureReceipt.views) {
    const bytes = await requiredFile(
      captureRoot,
      `${view.viewId}.png`,
      "NBR70_CAPTURE_ARTIFACT_MISSING",
    );
    requirePng(bytes, view.pngContentHash);
  }
  requirePng(
    await requiredFile(
      captureRoot,
      "collider-overlay.png",
      "NBR70_CAPTURE_ARTIFACT_MISSING",
    ),
    captureReceipt.colliderOverlayPngContentHash,
  );
  const opening = parseFormalOpeningObservationV1(json(await requiredFile(
    captureRoot,
    "opening-observation.json",
    "NBR70_CAPTURE_ARTIFACT_MISSING",
  )));
  const spawn = parseFormalSpawnSupportObservationV1(json(await requiredFile(
    captureRoot,
    "spawn-support-observation.json",
    "NBR70_CAPTURE_ARTIFACT_MISSING",
  )));
  const overlay = parseFormalColliderOverlayObservationV1(json(await requiredFile(
    captureRoot,
    "collider-overlay-observation.json",
    "NBR70_CAPTURE_ARTIFACT_MISSING",
  )));
  const scripted = parseFormalScriptedTraversalObservationV1(json(await requiredFile(
    captureRoot,
    "scripted-traversal.json",
    "NBR70_CAPTURE_ARTIFACT_MISSING",
  )));
  exact(hashFormalOpeningObservationV1(opening),
    captureReceipt.openingObservationContentHash);
  exact(hashFormalSpawnSupportObservationV1(spawn),
    captureReceipt.spawnSupportObservationContentHash);
  exact(hashFormalColliderOverlayObservationV1(overlay),
    captureReceipt.colliderOverlayObservationContentHash);
  exact(hashFormalScriptedTraversalObservationV1(scripted),
    captureReceipt.scriptedTraversalContentHash);
  for (const observation of [opening, spawn, overlay, scripted]) {
    assertObservationMatchesCapture(observation, captureReceipt);
  }

  const evaluation = parseWorldReconstructionEvaluationResultV1(json(
    await requiredFile(
      attemptRoot,
      "evaluation.json",
      "NBR70_REQUIRED_ARTIFACT_MISSING",
    ),
  ));
  const evaluationResultHash = hashWorldReconstructionEvaluationResultV1(evaluation);
  exact(runAttempt.evaluationResultHash, evaluationResultHash);
  exact(runReceipt.finalEvaluationResultHash, evaluationResultHash);
  exact(runReceipt.finalEvaluationResultRef, runAttempt.evaluationResultRef);
  exact(evaluation.caseRef, runReceipt.caseRef);
  exact(evaluation.caseHash, runReceipt.caseHash);
  exact(evaluation.evaluationProfileRef, runReceipt.evaluationProfileRef);
  exact(evaluation.evaluationProfileHash, runReceipt.evaluationProfileHash);
  exact(evaluation.attemptHash, runAttempt.sceneAuthoringAttemptHash);
  exact(evaluation.attemptRef, runAttempt.sceneAuthoringAttemptRef);
  exact(evaluation.worldPackageRef, runAttempt.worldPackageRef);
  exact(evaluation.worldPackageRootHash, runAttempt.worldPackageRootHash);
  exact(evaluation.worldBuildIdentityHash, runAttempt.worldBuildIdentityHash);
  exact(evaluation.worldBuildIdentityRef, runAttempt.worldBuildIdentityRef);
  exact(evaluation.captureReceiptHash, runAttempt.captureReceiptHash);
  exact(evaluation.captureReceiptRef, runAttempt.captureReceiptRef);
  if (
    evaluation.outcome !== "passed" ||
    evaluation.dimensions.length !== WORLD_RECONSTRUCTION_DIMENSION_IDS_V1.length ||
    evaluation.dimensions.some((dimension, index) =>
      dimension.dimensionId !== WORLD_RECONSTRUCTION_DIMENSION_IDS_V1[index] ||
      dimension.status !== "passed")
  ) fail("NBR70_EVALUATION_NOT_PASSED");

  const launchPackageDirectoryPath = input.candidate.kind === "final"
    ? await verifyFinalPromotion({
      runRoot,
      finalDirectoryPath: input.candidate.finalDirectoryPath,
      runReceipt,
      reconstructionCase,
    })
    : packageDirectoryPath;

  let session: NativeBlockReconstructionPlayabilitySessionPortV1 | undefined;
  let playability: NativeBlockReconstructionE2EVerificationV1["playability"] | undefined;
  let failure: unknown;
  try {
    session = await input.playability.launch({
      packageDirectoryPath: launchPackageDirectoryPath,
      worldPackageRef: verified.receipt.worldPackageRef,
      worldPackageRootHash: verified.receipt.worldPackageRootHash,
      worldBuildIdentityHash: verified.receipt.worldBuildIdentityHash,
    });
    const expectedPosition = reconstructionCase.expected.spawnSupport
      .expectedPositionXYZMeters;
    playability = await verifyPlayability({
      session,
      subjectEntityId: verified.worldRuntimeBootstrap.initialControlledEntityId,
      spawnColliderId: reconstructionCase.expected.spawnSupport.supportColliderId,
      expectedSpawnPosition: [
        expectedPosition.xMeters,
        expectedPosition.yMeters,
        expectedPosition.zMeters,
      ],
      maximumPositionDriftMeters:
        evaluationProfile.thresholds.spawnSupport.maximumPositionDriftMillimeters /
        1_000,
      checks: captureReceipt.formalRequest.scriptedTraversal.checks,
      caseChecks: reconstructionCase.expected.criticalTraversalChecks,
      blockerColliderIds: reconstructionCase.expected.colliders
        .filter(({ role }) => role === "blocker")
        .map(({ colliderId }) => colliderId),
    });
  } catch (error) {
    failure = error;
  } finally {
    if (session !== undefined) {
      try {
        const cleanup = await session.dispose();
        if (cleanup.outcome !== "completed") {
          failure = new Error("NBR70_PLAYABILITY_CLEANUP_FAILED");
        }
      } catch {
        failure = new Error("NBR70_PLAYABILITY_CLEANUP_FAILED");
      }
    }
  }
  if (failure !== undefined) throw failure;
  if (playability === undefined) fail("NBR70_PLAYABILITY_TRAVERSAL_FAILED");

  return Object.freeze({
    outcome: "verified",
    candidateKind: input.candidate.kind,
    attemptIndex: runAttempt.attemptIndex,
    worldPackageRef: runAttempt.worldPackageRef,
    worldPackageRootHash: runAttempt.worldPackageRootHash,
    worldBuildIdentityHash: runAttempt.worldBuildIdentityHash,
    captureReceiptHash,
    evaluationResultHash,
    playability,
  });
}
