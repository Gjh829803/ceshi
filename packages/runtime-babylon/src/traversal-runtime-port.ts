import {
  canonicalExecutionResourceLockEntriesV1,
  type ExecutionPlanV5,
  type ExecutionResourceKindV1,
} from "@whitebox-world/runtime-contracts";
type ExecutionPlanSubjectV5 = ExecutionPlanV5["subjects"][number];
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  canonicalTraversalRuntimeTickEvidenceV1,
  resolveTraversalLockV1,
  TraversalRuntimeErrorV1,
  type CharacterSupportEvidenceV1,
  type CharacterSupportSurfaceResolutionV1,
  type ResolvedTraversalLockReceiptV1,
  type ResolvedTraversalLockV1,
  type TraversalRuntimePortV1,
  type TraversalRuntimeTickEvidenceV1,
} from "@whitebox-world/traversal";
import {
  emitTriangleHeightfieldSurfaceV1,
  emitTransformedStaticColliderTriangleMeshV1,
  queryCanonicalTraversalSurfaceHitsV1,
  type CanonicalTraversalSurfaceTriangleSourceV1,
} from "@whitebox-world/terrain-surface";
import { isEmpty, isEqual, isNil } from "lodash-es";

import type { BabylonWorldRuntime } from "./babylon-world-runtime";
import { FIXED_TIME_STEP_SECONDS } from "./physics";
import type {
  MotionKernelLiveLockStateV1,
  RetainedCharacterSupportSampleV1,
} from "./motion-kernel-runtime";
import { BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1 } from "./traversal-implementation-identity";
import {
  BABYLON_TRAVERSAL_RUNTIME_INTERNAL,
  type BabylonTraversalRuntimeInternalV1,
} from "./traversal-runtime-internal";

const DIRECTION_LENGTH_TOLERANCE = 1e-9;

function fail(code: TraversalRuntimeErrorV1["code"]): never {
  throw new TraversalRuntimeErrorV1(code);
}

function exactPlanAndReceiptLock(
  plan: ExecutionPlanV5,
  receipt: ResolvedTraversalLockReceiptV1,
): {
  readonly lock: ResolvedTraversalLockV1;
  readonly subject: ExecutionPlanSubjectV5;
} {
  let canonicalReceipt: ResolvedTraversalLockReceiptV1;
  try {
    canonicalReceipt = resolveTraversalLockV1(receipt.lock);
  } catch {
    fail("TRAVERSAL_RUNTIME_LOCK_MISMATCH");
  }
  if (
    canonicalReceipt.resolvedTraversalLockHash !==
      receipt.resolvedTraversalLockHash ||
    !isEqual(canonicalReceipt.lock, receipt.lock)
  ) {
    fail("TRAVERSAL_RUNTIME_LOCK_MISMATCH");
  }
  const lock = canonicalReceipt.lock;
  if (!isEqual(
    {
      runtimeBackendRef: lock.runtimeBackendRef,
      runtimeBackendResolvedVersion: lock.runtimeBackendResolvedVersion,
      runtimeBackendHash: lock.runtimeBackendHash,
      runtimeAdapterRef: lock.runtimeAdapterRef,
      runtimeAdapterResolvedVersion: lock.runtimeAdapterResolvedVersion,
      runtimeAdapterHash: lock.runtimeAdapterHash,
    },
    BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
  )) {
    fail("TRAVERSAL_RUNTIME_LOCK_MISMATCH");
  }
  const subject = plan.subjects.find(
    (candidate) => candidate.entityId === lock.subjectEntityId,
  );
  if (isNil(subject) || isNil(subject.capabilityAssembly)) {
    fail("TRAVERSAL_RUNTIME_LOCK_MISMATCH");
  }
  const assembly = subject.capabilityAssembly;
  const colliderProfile = plan.colliderProfiles.find(
    (candidate) => candidate.colliderProfileRef === lock.colliderProfileRef,
  );
  const motionKernel = assembly.motionKernels.find(
    (candidate) => candidate.resourceRef === lock.motionKernelRef,
  );
  const resourceLockEntryMatches = (
    resourceRef: string,
    resourceKind: ExecutionResourceKindV1,
    contentHash: string,
  ): boolean => plan.resourceLockEntries.filter(
    (entry) =>
      entry.resourceRef === resourceRef &&
      entry.resourceKind === resourceKind &&
      entry.contentHash === contentHash,
  ).length === 1;
  let canonicalResourceLock: ReturnType<
    typeof canonicalExecutionResourceLockEntriesV1
  >;
  try {
    canonicalResourceLock = canonicalExecutionResourceLockEntriesV1(
      plan.resourceLockEntries,
    );
  } catch {
    fail("TRAVERSAL_RUNTIME_LOCK_MISMATCH");
  }
  const resourceLocksMatch =
    isEqual(plan.resourceLockEntries, canonicalResourceLock) &&
    sha256CanonicalJson(canonicalResourceLock) === plan.resourceLockHash &&
    lock.resourceLockHash === plan.resourceLockHash &&
    resourceLockEntryMatches(
      lock.colliderProfileRef,
      "collider-profile",
      lock.colliderProfileHash,
    ) &&
    resourceLockEntryMatches(
      lock.physicsBodyProfileRef,
      "physics-body-profile",
      lock.physicsBodyProfileHash,
    ) &&
    resourceLockEntryMatches(
      lock.locomotionProfileRef,
      "locomotion-profile",
      lock.locomotionProfileHash,
    ) &&
    resourceLockEntryMatches(
      lock.locomotionCapabilityRef,
      "capability",
      lock.locomotionCapabilityHash,
    ) &&
    resourceLockEntryMatches(
      lock.controlFeelProfileRef,
      "control-feel-profile",
      lock.controlFeelProfileHash,
    ) &&
    resourceLockEntryMatches(
      lock.controlProfileRef,
      "control-profile",
      lock.controlProfileHash,
    ) &&
    resourceLockEntryMatches(
      lock.motionProfileRef,
      "motion-profile",
      lock.motionProfileHash,
    ) &&
    resourceLockEntryMatches(
      lock.motionKernelRef,
      "motion-kernel",
      lock.motionKernelHash,
    ) &&
    resourceLockEntryMatches(
      lock.mediumProfileRef,
      "medium-profile",
      lock.mediumProfileHash,
    );
  const compiledMatches =
    resourceLocksMatch &&
    subject.subjectDefinitionRef === lock.subjectDefinitionRef &&
    subject.subjectDefinitionHash === lock.subjectDefinitionHash &&
    subject.collider.radiusMeters === lock.capsuleRadiusMeters &&
    subject.collider.heightMeters === lock.capsuleHeightMeters &&
    isEqual(
      subject.collider.centerOffsetFromSubjectOriginMetersXYZ,
      lock.colliderCenterOffsetMetersXYZ,
    ) &&
    subject.collider.maxSlopeDegrees === lock.maxSlopeDegrees &&
    subject.collider.maxStepHeightMeters === lock.maxStepHeightMeters &&
    subject.physicsBodyProfileRef === lock.physicsBodyProfileRef &&
    subject.locomotionProfileRef === lock.locomotionProfileRef &&
    subject.controlFeel.resourceRef === lock.controlFeelProfileRef &&
    subject.controlFeel.contentHash === lock.controlFeelProfileHash &&
    assembly.physicsBodyProfileRef === lock.physicsBodyProfileRef &&
    assembly.locomotionProfileRef === lock.locomotionProfileRef &&
    assembly.controlProfile.resourceRef === lock.controlProfileRef &&
    assembly.controlProfile.contentHash === lock.controlProfileHash &&
    assembly.controlProfile.commandKind === "planar-vector" &&
    assembly.defaultMotionProfile.resourceRef === lock.motionProfileRef &&
    assembly.defaultMotionProfile.contentHash === lock.motionProfileHash &&
    assembly.defaultMotionProfile.motionKernelRef === lock.motionKernelRef &&
    assembly.mediumProfile.resourceRef === lock.mediumProfileRef &&
    subject.locomotion.allowWalk &&
    !isNil(motionKernel) &&
    motionKernel.commandKind === "planar-vector" &&
    motionKernel.implementationId === "free-ground" &&
    motionKernel.supportedMediums.includes("ground") &&
    lock.locomotionCapabilityRef ===
      "worldkit://capability/locomotion.ground@1" &&
    !isNil(colliderProfile) &&
    colliderProfile.supportedBodyTopologies.some(
      (bodyTopology) => bodyTopology === subject.bodyTopology,
    ) &&
    isEqual(colliderProfile.collider, {
      kind: subject.collider.kind,
      radiusMeters: subject.collider.radiusMeters,
      heightMeters: subject.collider.heightMeters,
      centerOffsetFromSubjectOriginMetersXYZ:
        subject.collider.centerOffsetFromSubjectOriginMetersXYZ,
    });
  if (!compiledMatches) {
    fail("TRAVERSAL_RUNTIME_LOCK_MISMATCH");
  }
  return { lock, subject };
}

function liveLockMatches(
  live: MotionKernelLiveLockStateV1,
  lock: ResolvedTraversalLockV1,
): boolean {
  return live.capsuleRadiusMeters === lock.capsuleRadiusMeters &&
    live.capsuleHeightMeters === lock.capsuleHeightMeters &&
    live.footOffsetMeters === lock.capsuleHeightMeters / 2 &&
    live.keepDistanceMeters === 0.05 &&
    live.keepContactToleranceMeters === 0.1 &&
    live.maxSlopeCosine === Math.cos(lock.maxSlopeDegrees * Math.PI / 180) &&
    live.maxStepHeightMeters === lock.maxStepHeightMeters &&
    isEqual(
      live.colliderCenterOffsetMetersXYZ,
      lock.colliderCenterOffsetMetersXYZ,
    ) &&
    live.activeControlFeelProfileRef === lock.controlFeelProfileRef &&
    live.activeControlFeelProfileHash === lock.controlFeelProfileHash &&
    live.requestedControlFeelProfileRef === lock.controlFeelProfileRef &&
    live.activeMotionProfileRef === lock.motionProfileRef &&
    live.activeMotionProfileHash === lock.motionProfileHash &&
    live.requestedMotionProfileRef === lock.motionProfileRef &&
    live.activeMotionKernelRef === lock.motionKernelRef &&
    live.physicsBodyProfileRef === lock.physicsBodyProfileRef &&
    live.locomotionProfileRef === lock.locomotionProfileRef &&
    live.controlProfileRef === lock.controlProfileRef &&
    live.controlProfileHash === lock.controlProfileHash &&
    live.mediumProfileRef === lock.mediumProfileRef;
}

function collectCanonicalTraversalSurfaceSources(
  plan: ExecutionPlanV5,
):
  | {
    status: "ok";
    sources: CanonicalTraversalSurfaceTriangleSourceV1[];
  }
  | {
    status: "missing-bound-collider";
  } {
  const colliderBySubshapeId = new Map(
    plan.staticColliders.map((collider) => [
      collider.colliderSubshapeId,
      collider,
    ]),
  );
  const sources: CanonicalTraversalSurfaceTriangleSourceV1[] = [];
  for (const surface of plan.traversal.surfaces) {
    if (surface.kind === "heightfield") {
      if (surface.surfaceEntityId !== plan.terrain.entityId) {
        continue;
      }
      const mesh = emitTriangleHeightfieldSurfaceV1({
        centerMetersXZ: plan.terrain.centerMetersXZ,
        sizeMetersXZ: plan.terrain.sizeMetersXZ,
        resolutionVerticesXZ: plan.terrain.resolutionCellsXZ,
        heightSamplesMeters: plan.terrain.heightSamplesMeters,
      });
      const worldPositionsMetersXYZ: number[] = [];
      for (
        let index = 0;
        index < mesh.localPositionsMetersXYZ.length;
        index += 1
      ) {
        worldPositionsMetersXYZ.push(
          mesh.localPositionsMetersXYZ[index]! +
            mesh.originMetersXYZ[index % 3]!,
        );
      }
      sources.push({
        traversalSurfaceId: surface.traversalSurfaceId,
        worldPositionsMetersXYZ,
        triangleIndices: mesh.triangleIndices,
      });
      continue;
    }
    if (surface.kind === "static-collider") {
      const collider = colliderBySubshapeId.get(surface.colliderSubshapeId);
      if (isNil(collider)) {
        return { status: "missing-bound-collider" };
      }
      const mesh = emitTransformedStaticColliderTriangleMeshV1(
        collider.shape,
        collider.transform,
      );
      sources.push({
        traversalSurfaceId: surface.traversalSurfaceId,
        worldPositionsMetersXYZ: mesh.worldPositionsMetersXYZ,
        triangleIndices: mesh.triangleIndices,
      });
    }
  }
  return { status: "ok", sources };
}

function classifySurface(
  plan: ExecutionPlanV5,
  sample: RetainedCharacterSupportSampleV1,
  live: MotionKernelLiveLockStateV1,
): CharacterSupportSurfaceResolutionV1 {
  if (sample.supportState === "unsupported") {
    return { mode: "unsupported" };
  }
  if (sample.isSupportSurfaceDynamic) {
    return { mode: "unmatched" };
  }
  const collected = collectCanonicalTraversalSurfaceSources(plan);
  if (collected.status === "missing-bound-collider") {
    return { mode: "unmatched" };
  }
  const { sources } = collected;
  if (isEmpty(sources)) {
    return { mode: "unmatched" };
  }
  const foot = sample.sampledFootPositionMetersXYZ;
  const query = queryCanonicalTraversalSurfaceHitsV1({
    sources,
    pointMetersXZ: [foot[0], foot[2]],
    referenceHeightMeters: foot[1],
    maximumReferenceHeightDifferenceMeters:
      live.keepDistanceMeters + live.keepContactToleranceMeters,
    normalAdmission: {
      mode: "retained-support",
      minimumUpwardNormalYRatio: live.maxSlopeCosine,
      referenceNormalXYZ: sample.supportNormalWorldXYZ,
      minimumReferenceNormalDotRatio: live.maxSlopeCosine,
    },
  });
  if (query.mode === "missing") {
    return { mode: "unmatched" };
  }
  if (query.mode === "ambiguous") {
    return { mode: "ambiguous" };
  }
  const surface = plan.traversal.surfaces.find(
    (candidate) =>
      candidate.traversalSurfaceId === query.hit.traversalSurfaceId,
  );
  if (isNil(surface)) {
    return { mode: "unmatched" };
  }
  return {
    mode: "resolved",
    traversalSurfaceId: surface.traversalSurfaceId,
    surfaceEntityId: surface.surfaceEntityId,
    colliderSubshapeId: surface.colliderSubshapeId,
    resourceRef: surface.resourceRef,
    resolvedVersion: surface.resolvedVersion,
    resourceHash: surface.resourceHash,
  };
}

class BabylonTraversalRuntimePortV1 implements TraversalRuntimePortV1 {
  public readonly kind = "traversal-runtime-port" as const;
  public readonly schemaVersion = 1 as const;
  #initializedEpoch: number | undefined;
  #runtimeUnavailable = false;
  readonly #host: BabylonTraversalRuntimeInternalV1;
  readonly #plan: ExecutionPlanV5;
  readonly #receipt: ResolvedTraversalLockReceiptV1;
  readonly #lock: ResolvedTraversalLockV1;
  readonly #authoringSpecHash: `sha256:${string}`;
  readonly #layoutSolveReportHash: `sha256:${string}`;
  readonly #resourceLockHash: `sha256:${string}`;
  readonly #executionPlanHash: `sha256:${string}`;
  readonly #resolvedTraversalLockHash: `sha256:${string}`;

  public constructor(
    host: BabylonTraversalRuntimeInternalV1,
    plan: ExecutionPlanV5,
    receipt: ResolvedTraversalLockReceiptV1,
    lock: ResolvedTraversalLockV1,
    executionPlanHash: `sha256:${string}`,
  ) {
    this.#host = host;
    this.#plan = plan;
    this.#receipt = receipt;
    this.#lock = lock;
    this.#authoringSpecHash = plan.authoringSpecHash;
    this.#layoutSolveReportHash =
      plan.layout.layoutSolveReportHash as `sha256:${string}`;
    this.#resourceLockHash = plan.resourceLockHash as `sha256:${string}`;
    this.#executionPlanHash = executionPlanHash;
    this.#resolvedTraversalLockHash = receipt.resolvedTraversalLockHash;
    Object.freeze(this);
  }

  public get traversingEntityId(): string {
    return this.#lock.subjectEntityId;
  }

  public get resolvedTraversalLockHash(): `sha256:${string}` {
    return this.#resolvedTraversalLockHash;
  }

  public get authoringSpecHash(): `sha256:${string}` {
    return this.#authoringSpecHash;
  }

  public get layoutSolveReportHash(): `sha256:${string}` {
    return this.#layoutSolveReportHash;
  }

  public get resourceLockHash(): `sha256:${string}` {
    return this.#resourceLockHash;
  }

  public get executionPlanHash(): `sha256:${string}` {
    return this.#executionPlanHash;
  }

  public get runtimeImplementationIdentity() {
    return BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1;
  }

  public readLatestTickEvidence(): TraversalRuntimeTickEvidenceV1 {
    const controller = this.assertOperationReady(true);
    return this.createEvidenceClosed(controller);
  }

  public resetToStartAnchor(request: Readonly<{
    startAnchorEntityId: string;
  }>): TraversalRuntimeTickEvidenceV1 {
    this.assertOperationReady(false);
    if (
      isNil(request) ||
      typeof request !== "object" ||
      !isEqual(Object.keys(request), ["startAnchorEntityId"]) ||
      typeof request.startAnchorEntityId !== "string" ||
      !this.#plan.traversal.anchorEntityIds.includes(request.startAnchorEntityId)
    ) {
      fail("TRAVERSAL_RUNTIME_START_ANCHOR_INVALID");
    }
    const placement = this.#plan.layout.placementsByEntityId[
      request.startAnchorEntityId
    ];
    if (
      isNil(placement) ||
      placement.entityId !== request.startAnchorEntityId ||
      !placement.transform.positionMetersXYZ.every(Number.isFinite) ||
      !placement.transform.rotationEulerRadiansXYZ.every(Number.isFinite)
    ) {
      fail("TRAVERSAL_RUNTIME_START_ANCHOR_INVALID");
    }
    try {
      this.#host.resetToTraversalAnchor({
        traversingEntityId: this.traversingEntityId,
        subjectOriginPositionMetersXYZ: placement.transform.positionMetersXYZ,
        facingYawRadians: placement.transform.rotationEulerRadiansXYZ[1],
      });
    } catch {
      fail("TRAVERSAL_RUNTIME_UNAVAILABLE");
    }
    this.#initializedEpoch = this.#host.readConfigurationEpoch();
    const controller = this.assertOperationReady(true);
    return this.createEvidenceClosed(controller);
  }

  public async runFixedTick(request: Readonly<{
    walkDirectionWorldXZ: readonly [number, number];
  }>): Promise<TraversalRuntimeTickEvidenceV1> {
    this.assertOperationReady(true);
    if (
      isNil(request) ||
      typeof request !== "object" ||
      !isEqual(Object.keys(request), ["walkDirectionWorldXZ"])
    ) {
      fail("TRAVERSAL_RUNTIME_WALK_DIRECTION_INVALID");
    }
    const direction = request?.walkDirectionWorldXZ;
    if (
      !Array.isArray(direction) ||
      direction.length !== 2 ||
      !direction.every(Number.isFinite)
    ) {
      fail("TRAVERSAL_RUNTIME_WALK_DIRECTION_INVALID");
    }
    const length = Math.hypot(direction[0]!, direction[1]!);
    if (
      length !== 0 &&
      Math.abs(length - 1) > DIRECTION_LENGTH_TOLERANCE
    ) {
      fail("TRAVERSAL_RUNTIME_WALK_DIRECTION_INVALID");
    }
    try {
      this.#host.runTraversalFixedTick({
        traversingEntityId: this.traversingEntityId,
        walkDirectionWorldXZ: [direction[0]!, direction[1]!],
      });
      const postTickController = this.#host.readCharacterMovement(
        this.traversingEntityId,
      );
      if (
        isNil(postTickController) ||
        postTickController.motionSnapshot().fallbackActive
      ) {
        this.#runtimeUnavailable = true;
        fail("TRAVERSAL_RUNTIME_UNAVAILABLE");
      }
    } catch (error) {
      if (error instanceof TraversalRuntimeErrorV1) throw error;
      this.#runtimeUnavailable = true;
      fail("TRAVERSAL_RUNTIME_UNAVAILABLE");
    }
    const controller = this.assertOperationReady(true);
    return this.createEvidenceClosed(controller);
  }

  private assertOperationReady(requireInitialization: boolean) {
    if (this.#runtimeUnavailable || this.#host.isDisposed()) {
      fail("TRAVERSAL_RUNTIME_UNAVAILABLE");
    }
    if (this.#host.readControlledEntityId() !== this.traversingEntityId) {
      fail("TRAVERSAL_RUNTIME_NOT_CONTROLLED");
    }
    const plan = this.#host.readExecutionPlan();
    if (plan !== this.#plan) {
      fail("TRAVERSAL_RUNTIME_LOCK_MISMATCH");
    }
    let currentExecutionPlanHash: string;
    try {
      currentExecutionPlanHash = sha256CanonicalJson(plan);
    } catch {
      fail("TRAVERSAL_RUNTIME_WORLD_IDENTITY_MISMATCH");
    }
    if (
      currentExecutionPlanHash !== this.#executionPlanHash ||
      plan.authoringSpecHash !== this.#authoringSpecHash ||
      plan.layout.layoutSolveReportHash !== this.#layoutSolveReportHash ||
      plan.resourceLockHash !== this.#resourceLockHash
    ) {
      fail("TRAVERSAL_RUNTIME_WORLD_IDENTITY_MISMATCH");
    }
    const currentPaperLock = exactPlanAndReceiptLock(this.#plan, this.#receipt);
    if (!isEqual(currentPaperLock.lock, this.#lock)) {
      fail("TRAVERSAL_RUNTIME_LOCK_MISMATCH");
    }
    const controller = this.#host.readCharacterMovement(this.traversingEntityId);
    if (isNil(controller)) {
      fail("TRAVERSAL_RUNTIME_LIVE_LOCK_MISMATCH");
    }
    if (controller.motionSnapshot().fallbackActive) {
      this.#runtimeUnavailable = true;
      fail("TRAVERSAL_RUNTIME_UNAVAILABLE");
    }
    if (!liveLockMatches(controller.liveLockState(), this.#lock)) {
      fail("TRAVERSAL_RUNTIME_LIVE_LOCK_MISMATCH");
    }
    if (
      requireInitialization &&
      (isNil(this.#initializedEpoch) ||
        this.#initializedEpoch !== this.#host.readConfigurationEpoch())
    ) {
      fail("TRAVERSAL_RUNTIME_EVIDENCE_UNAVAILABLE");
    }
    return controller;
  }

  private createEvidenceClosed(
    controller: NonNullable<ReturnType<
      BabylonTraversalRuntimeInternalV1["readCharacterMovement"]
    >>,
  ): TraversalRuntimeTickEvidenceV1 {
    try {
      return this.createEvidence(controller);
    } catch (error) {
      if (error instanceof TraversalRuntimeErrorV1) throw error;
      this.#runtimeUnavailable = true;
      fail("TRAVERSAL_RUNTIME_UNAVAILABLE");
    }
  }

  private createEvidence(
    controller: NonNullable<ReturnType<
      BabylonTraversalRuntimeInternalV1["readCharacterMovement"]
    >>,
  ): TraversalRuntimeTickEvidenceV1 {
    const sample = controller.retainedCharacterSupportSample();
    if (isNil(sample)) fail("TRAVERSAL_RUNTIME_EVIDENCE_UNAVAILABLE");
    const live = controller.liveLockState();
    const support: CharacterSupportEvidenceV1 = {
      kind: "character-support-evidence",
      schemaVersion: 1,
      supportState: sample.supportState,
      supportNormalWorldXYZ: sample.supportNormalWorldXYZ,
      sampledFootPositionMetersXYZ: sample.sampledFootPositionMetersXYZ,
      isSupportSurfaceDynamic: sample.isSupportSurfaceDynamic,
      surfaceResolution: classifySurface(
        this.#plan,
        sample,
        live,
      ),
    };
    const origin = controller.subjectOrigin;
    const velocity = controller.velocity;
    return canonicalTraversalRuntimeTickEvidenceV1({
      kind: "traversal-runtime-tick-evidence",
      schemaVersion: 1,
      tick: this.#host.readTick(),
      traversingEntityId: this.traversingEntityId,
      authoringSpecHash: this.#authoringSpecHash,
      layoutSolveReportHash: this.#layoutSolveReportHash,
      resourceLockHash: this.#resourceLockHash,
      executionPlanHash: this.#executionPlanHash,
      resolvedTraversalLockHash: this.#resolvedTraversalLockHash,
      runtimeImplementationIdentity:
        BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
      fixedTimeStepSeconds: FIXED_TIME_STEP_SECONDS,
      subjectPositionMetersXYZ: [origin.x, origin.y, origin.z],
      velocityMetersPerSecondXYZ: [velocity.x, velocity.y, velocity.z],
      movementMedium: controller.movementMedium,
      locomotionMode: controller.motionSnapshot().locomotionMode,
      characterSupport: support,
    });
  }
}

export function createBabylonTraversalRuntimePortV1(input: Readonly<{
  runtime: BabylonWorldRuntime;
  traversalLockReceipt: ResolvedTraversalLockReceiptV1;
}>): TraversalRuntimePortV1 {
  if (isNil(input) || typeof input !== "object" || isNil(input.runtime)) {
    fail("TRAVERSAL_RUNTIME_UNAVAILABLE");
  }
  if (isNil(input.traversalLockReceipt)) {
    fail("TRAVERSAL_RUNTIME_LOCK_MISMATCH");
  }
  const access = input.runtime[BABYLON_TRAVERSAL_RUNTIME_INTERNAL];
  if (typeof access !== "function") fail("TRAVERSAL_RUNTIME_UNAVAILABLE");
  const host = access.call(input.runtime);
  if (host.isDisposed()) fail("TRAVERSAL_RUNTIME_UNAVAILABLE");
  if (isNil(host.readControlledEntityId())) {
    fail("TRAVERSAL_RUNTIME_NOT_CONTROLLED");
  }
  const plan = host.readExecutionPlan();
  const creationExecutionPlanHash = host.readCreationExecutionPlanHash();
  let currentExecutionPlanHash: `sha256:${string}`;
  try {
    currentExecutionPlanHash = sha256CanonicalJson(plan) as `sha256:${string}`;
  } catch {
    fail("TRAVERSAL_RUNTIME_WORLD_IDENTITY_MISMATCH");
  }
  if (
    isNil(creationExecutionPlanHash) ||
    currentExecutionPlanHash !== creationExecutionPlanHash
  ) {
    fail("TRAVERSAL_RUNTIME_WORLD_IDENTITY_MISMATCH");
  }
  const { lock } = exactPlanAndReceiptLock(plan, input.traversalLockReceipt);
  if (host.readControlledEntityId() !== lock.subjectEntityId) {
    fail("TRAVERSAL_RUNTIME_NOT_CONTROLLED");
  }
  const controller = host.readCharacterMovement(lock.subjectEntityId);
  if (isNil(controller)) {
    fail("TRAVERSAL_RUNTIME_LIVE_LOCK_MISMATCH");
  }
  if (controller.motionSnapshot().fallbackActive) {
    fail("TRAVERSAL_RUNTIME_UNAVAILABLE");
  }
  if (!liveLockMatches(controller.liveLockState(), lock)) {
    fail("TRAVERSAL_RUNTIME_LIVE_LOCK_MISMATCH");
  }
  return new BabylonTraversalRuntimePortV1(
    host,
    plan,
    input.traversalLockReceipt,
    lock,
    currentExecutionPlanHash,
  );
}
