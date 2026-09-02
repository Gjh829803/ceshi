import {
  Vector3,
  type Matrix,
} from "@babylonjs/core/Maths/math.vector.js";
import {
  CharacterSupportedState,
  PhysicsCharacterController,
  type CharacterSurfaceInfo,
} from "@babylonjs/core/Physics/v2/characterController.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin.js";
import type { PhysicsShape } from "@babylonjs/core/Physics/v2/physicsShape.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import { isNil } from "lodash-es";
import {
  assertMovementTickTokenIdentityV1,
  BODY_RESOLUTION_COHERENCE_TOLERANCE_METERS_V1,
  isMovementTickTokenV1,
  parseBodyResolutionV1,
  parseBodySampleV1,
  parseMovementProposalV1,
  type BodyBeginTickRequestV1,
  type BodyResolutionV1,
  type BodySampleV1,
  type CharacterBodyPortV1,
  type MovementProposalV1,
  type MovementTickTokenV1,
  type MovementVec3V1,
} from "@whitebox-world/character-movement";

import {
  r1bInStepUpCorridor,
  r1bIsFailureTick,
  r1bSupportDebug,
  type CharacterSupportProjectionSampleV1,
} from "./retained-support-surface-resolver";

export const BABYLON_CHARACTER_BODY_PROVIDER_VERSIONS_V1 = Object.freeze({
  babylonJs: "9.23.0",
  havok: "1.3.14",
} as const);

export interface BabylonCharacterBodyPortOptionsV1 {
  readonly schemaVersion: 1;
  readonly providerVersions: Readonly<{
    babylonJs: "9.23.0";
    havok: "1.3.14";
  }>;
  readonly scene: Scene;
  readonly fixedDeltaSeconds: number;
  readonly gravityMetersPerSecondSquaredXYZ: MovementVec3V1;
  readonly capsule: Readonly<{
    heightMeters: number;
    radiusMeters: number;
  }>;
  readonly controller: Readonly<{
    keepDistanceMeters: number;
    keepContactToleranceMeters: number;
    maxSlopeDegrees: number;
    maxStepHeightMeters: number;
    characterMassKilograms: number;
  }>;
  readonly resetState: Readonly<{
    positionMetersXYZ: MovementVec3V1;
    linearVelocityMetersPerSecondXYZ: MovementVec3V1;
  }>;
}

/**
 * Babylon-only staging control used by the Golden fixed-Tick commit barrier.
 * The provider-neutral CharacterBodyPortV1 intentionally remains unchanged.
 */
export interface BabylonCharacterBodyTransactionPortV1
  extends CharacterBodyPortV1 {
  commitTick(token: MovementTickTokenV1): void;
  abortTick(token: MovementTickTokenV1): void;
  readCommittedSupportEvidence():
    | BabylonCharacterBodyCommittedSupportEvidenceV1
    | undefined;
  resetToState(state: Readonly<{
    positionMetersXYZ: MovementVec3V1;
    linearVelocityMetersPerSecondXYZ: MovementVec3V1;
  }>): void;
}

export interface BabylonCharacterBodyNativeAllocationV1 {
  readonly scene: Scene;
  readonly capsule: BabylonCharacterBodyPortOptionsV1["capsule"];
  readonly initialPositionMetersXYZ: MovementVec3V1;
}

export interface BabylonCharacterBodySupportProjectionLockV1 {
  readonly capsuleRadiusMeters: number;
  readonly capsuleHeightMeters: number;
  readonly footOffsetMeters: number;
  readonly keepDistanceMeters: number;
  readonly keepContactToleranceMeters: number;
  readonly maxSlopeCosine: number;
  readonly maxStepHeightMeters: number;
}

export interface BabylonCharacterBodyNativeConfigurationV1 {
  readonly fixedDeltaSeconds: number;
  readonly gravityMetersPerSecondSquaredXYZ: MovementVec3V1;
  readonly gravityDirectionXYZ: MovementVec3V1;
  readonly maxSlopeCosine: number;
  readonly capsule: BabylonCharacterBodyPortOptionsV1["capsule"];
  readonly controller: BabylonCharacterBodyPortOptionsV1["controller"];
  readonly resetState: BabylonCharacterBodyPortOptionsV1["resetState"];
}

export type BabylonCharacterBodyNativeMotionTypeV1 =
  | "static"
  | "animated"
  | "dynamic";

export interface BabylonCharacterBodyNativeContactV1 {
  readonly pointMetersXYZ: MovementVec3V1;
  readonly normalXYZ: MovementVec3V1;
  readonly distanceMeters: number;
  readonly motionType: BabylonCharacterBodyNativeMotionTypeV1;
  readonly colliderId?: string;
  readonly colliderSubshapeId?: string;
  readonly logicalSubshapeId?: string;
  readonly traversalSurfaceId?: string;
  readonly surfaceEntityId?: string;
  readonly traversalSurfaceProfileRef?: string;
}

/** @internal Evidence from the single support sample published at commit. */
export interface BabylonCharacterBodyCommittedSupportEvidenceV1 {
  readonly schemaVersion: 1;
  readonly tick: number;
  readonly sampledControllerCenterMetersXYZ: MovementVec3V1;
  readonly sampledFootPointMetersXYZ: MovementVec3V1;
  readonly support: BodySampleV1["support"];
  readonly contacts: readonly BabylonCharacterBodyNativeContactV1[];
}

export interface BabylonCharacterBodyNativeSupportV1 {
  readonly mode: "supported" | "sliding" | "unsupported";
  readonly averageSurfaceNormalXYZ: MovementVec3V1;
  readonly isSurfaceDynamic: boolean;
  readonly averageSurfaceVelocityMetersPerSecondXYZ?: MovementVec3V1;
  readonly averageAngularSurfaceVelocityRadiansPerSecondXYZ?: MovementVec3V1;
}

export interface BabylonCharacterBodyNativeIntegrateRequestV1 {
  readonly fixedDeltaSeconds: number;
  readonly translationDeltaMetersXYZ: MovementVec3V1;
  readonly driverVelocityMetersPerSecondXYZ: MovementVec3V1;
  readonly supportBeforeIntegrate: BabylonCharacterBodyNativeSupportV1;
}

export interface BabylonCharacterBodyNativeIntegrateResultV1 {
  readonly didStepUp: boolean;
  readonly maximumSolverCorrectionMeters: number;
}

/** @internal Narrow seam used by the focused adapter tests. */
export interface BabylonCharacterBodyNativeDriverV1 {
  configure(configuration: BabylonCharacterBodyNativeConfigurationV1): void;
  captureState(): unknown;
  restoreState(snapshot: unknown): void;
  getPositionMetersXYZ(): MovementVec3V1;
  getLinearVelocityMetersPerSecondXYZ(): MovementVec3V1;
  setPositionMetersXYZ(value: MovementVec3V1): void;
  setLinearVelocityMetersPerSecondXYZ(value: MovementVec3V1): void;
  checkSupport(
    fixedDeltaSeconds: number,
    gravityDirectionXYZ: MovementVec3V1,
  ): BabylonCharacterBodyNativeSupportV1;
  integrateExactTranslation(
    request: BabylonCharacterBodyNativeIntegrateRequestV1,
  ): BabylonCharacterBodyNativeIntegrateResultV1;
  isIntegrateRollbackExternallySafe(): boolean;
  readCurrentContacts(): readonly BabylonCharacterBodyNativeContactV1[];
  getPhysicsBody?(): PhysicsBody;
  synchronizeAfterTeleport?(): void;
  dispose(): void;
}

type StepUpSimplexOutput = Parameters<
  PhysicsCharacterController["_tryStepUp"]
>[2];
type StepUpConstraints = Parameters<
  PhysicsCharacterController["_tryStepUp"]
>[3];

interface BabylonManifoldContactV1 {
  readonly position: Vector3;
  readonly normal: Vector3;
  readonly distance: number;
  readonly fraction: number;
  readonly bodyB: {
    readonly body: {
      readonly isDisposed?: boolean;
      readonly transformNode: TransformNode;
      getMotionType(index: number): number;
    };
    readonly index: number;
  };
  readonly allowedPenetration: number;
}

interface PhysicsCharacterControllerPrivateHostV1 {
  readonly _shape: PhysicsShape;
  readonly _ownShape: boolean;
  readonly _body: PhysicsBody;
  readonly _transformNode: TransformNode;
  readonly _scene: Scene;
  readonly _startCollector: unknown;
  readonly _castCollector: unknown;
  readonly _manifold: BabylonManifoldContactV1[];
  readonly _stepUpSavedManifold: BabylonManifoldContactV1[];
  readonly _lastDisplacement: Vector3;
  readonly _lastVelocity: Vector3;
  _lastInvDeltaTime: number;
  readonly _bodyPositionTracking: Map<number, BabylonBodyPositionTrackingV1>;
}

interface BabylonBodyPositionTrackingV1 {
  readonly prevWorldMatrix: Matrix;
  frameId: number;
}

interface GroundAwareControllerSnapshotV1 {
  readonly position: Vector3;
  readonly velocity: Vector3;
  readonly manifold: BabylonManifoldContactV1[];
  readonly stepUpSavedManifold: BabylonManifoldContactV1[];
  readonly lastDisplacement: Vector3;
  readonly lastVelocity: Vector3;
  readonly lastInvDeltaTime: number;
  readonly bodyPositionTracking: Map<number, BabylonBodyPositionTrackingV1>;
}

const STEP_UP_FORWARD_CLEARANCE_METERS = 0.02;
const STATIC_PHYSICS_MOTION_TYPE = 0;
const DYNAMIC_PHYSICS_MOTION_TYPE = 2;
const SNAP_DOWN_UPWARD_SPEED_LIMIT_METERS_PER_SECOND = 0.5;
const SNAP_DOWN_MINIMUM_DROP_METERS = 1e-4;
const SNAP_DOWN_SURFACE_NORMAL_ALIGNMENT_EPSILON = 1e-3;
// Keep the SDK-owned Body resolution coherence allowance local to this
// provider adapter; protocol and published-state coherence continue to use
// the stricter shared SDK tolerance.
const BABYLON_CHARACTER_CONTROLLER_COLLISION_TOLERANCE_METERS_V1 = 1e-4;

type BabylonCharacterBodyNativeSurfaceIdentityV1 = Readonly<Pick<
  BabylonCharacterBodyNativeContactV1,
  | "colliderId"
  | "colliderSubshapeId"
  | "logicalSubshapeId"
  | "traversalSurfaceId"
  | "surfaceEntityId"
  | "traversalSurfaceProfileRef"
>>;

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function nativeSurfaceIdentity(
  transformNode: TransformNode,
): BabylonCharacterBodyNativeSurfaceIdentityV1 | undefined {
  const metadata = record(transformNode.metadata);
  if (isNil(metadata)) return undefined;
  const colliderSubshapeId = metadata.colliderSubshapeId;
  const colliderId = metadata.worldkitEntityId;
  const logicalSubshapeId = metadata.worldkitLogicalSubshapeId;
  const traversalSurfaceId = metadata.worldkitTraversalSurfaceId;
  const declaredSurfaceEntityId = metadata.worldkitSurfaceEntityId;
  const traversalSurfaceProfileRef =
    metadata.worldkitTraversalSurfaceProfileRef;
  if (
    !nonEmptyString(colliderId) ||
    !nonEmptyString(colliderSubshapeId) ||
    !nonEmptyString(logicalSubshapeId) ||
    !nonEmptyString(traversalSurfaceId) ||
    !nonEmptyString(declaredSurfaceEntityId) ||
    !nonEmptyString(traversalSurfaceProfileRef)
  ) {
    return undefined;
  }
  return Object.freeze({
    colliderId,
    colliderSubshapeId,
    logicalSubshapeId,
    traversalSurfaceId,
    surfaceEntityId: declaredSurfaceEntityId,
    traversalSurfaceProfileRef,
  });
}

function cloneManifoldContact(
  contact: BabylonManifoldContactV1,
): BabylonManifoldContactV1 {
  return {
    ...contact,
    position: contact.position.clone(),
    normal: contact.normal.clone(),
    bodyB: { ...contact.bodyB },
  };
}

function cloneBodyPositionTracking(
  tracking: ReadonlyMap<number, BabylonBodyPositionTrackingV1>,
): Map<number, BabylonBodyPositionTrackingV1> {
  return new Map([...tracking].map(([bodyId, value]) => [bodyId, {
    prevWorldMatrix: value.prevWorldMatrix.clone(),
    frameId: value.frameId,
  }]));
}

/**
 * The sole Babylon protected/private extension surface for Character Body behavior.
 * MotionKernelRuntime imports this class only as temporary legacy reuse until Task 7.
 */
export class GroundAwarePhysicsCharacterController extends PhysicsCharacterController {
  private stepUpEnabledForCurrentIntegrate = false;
  private stepUpAppliedForCurrentIntegrate = false;
  private lastIntegrateAppliedStepUp = false;
  private exactTranslationLeavesSupportForCurrentIntegrate = false;
  private ownedResourcesDisposed = false;

  private privateHost(): PhysicsCharacterControllerPrivateHostV1 {
    return this as unknown as PhysicsCharacterControllerPrivateHostV1;
  }

  private synchronizeNativeBodyTransform(): void {
    const host = this.privateHost();
    const physicsPlugin = host._scene.getPhysicsEngine()?.getPhysicsPlugin() as
      HavokPlugin | undefined;
    if (physicsPlugin === undefined) {
      throw new Error(
        "WORLDKIT_CHARACTER_PHYSICS_ENGINE_UNAVAILABLE: Character Body teleport has no Havok owner.",
      );
    }
    physicsPlugin.setPhysicsBodyTransformation(host._body, host._transformNode);
  }

  synchronizeAfterTeleport(): void {
    this.synchronizeNativeBodyTransform();
    this._refreshManifoldAtPosition(this.getPosition());
  }

  refreshCurrentManifold(): void {
    this._refreshManifoldAtPosition(this.getPosition());
  }

  prepareExactTranslation(
    translationDeltaMeters: Vector3,
    driverVelocityMetersPerSecond: Vector3,
    fixedDeltaSeconds: number,
  ): void {
    const host = this.privateHost();
    this.setVelocity(driverVelocityMetersPerSecond);
    // Babylon's integrate() intentionally reuses _lastDisplacement whenever
    // velocity is unchanged. Seed that cache with this Tick's authoritative
    // proposal so a collision-shortened prior Tick cannot replace the request.
    host._lastDisplacement.copyFrom(translationDeltaMeters);
    host._lastVelocity.copyFrom(driverVelocityMetersPerSecond);
    host._lastInvDeltaTime = 1 / fixedDeltaSeconds;
    this.exactTranslationLeavesSupportForCurrentIntegrate =
      Vector3.Dot(translationDeltaMeters, this.up) >
        BODY_RESOLUTION_COHERENCE_TOLERANCE_METERS_V1 &&
      Vector3.Dot(driverVelocityMetersPerSecond, this.up) >
        BODY_RESOLUTION_COHERENCE_TOLERANCE_METERS_V1;
  }

  captureTransactionalState(): GroundAwareControllerSnapshotV1 {
    const host = this.privateHost();
    return {
      position: this.getPosition().clone(),
      velocity: this.getVelocity().clone(),
      manifold: host._manifold.map(cloneManifoldContact),
      stepUpSavedManifold: host._stepUpSavedManifold.map(cloneManifoldContact),
      lastDisplacement: host._lastDisplacement.clone(),
      lastVelocity: host._lastVelocity.clone(),
      lastInvDeltaTime: host._lastInvDeltaTime,
      bodyPositionTracking: cloneBodyPositionTracking(host._bodyPositionTracking),
    };
  }

  restoreTransactionalState(snapshot: GroundAwareControllerSnapshotV1): void {
    const host = this.privateHost();
    this.exactTranslationLeavesSupportForCurrentIntegrate = false;
    this.setPosition(snapshot.position);
    this.setVelocity(snapshot.velocity);
    host._manifold.splice(
      0,
      host._manifold.length,
      ...snapshot.manifold.map(cloneManifoldContact),
    );
    host._stepUpSavedManifold.splice(
      0,
      host._stepUpSavedManifold.length,
      ...snapshot.stepUpSavedManifold.map(cloneManifoldContact),
    );
    host._lastDisplacement.copyFrom(snapshot.lastDisplacement);
    host._lastVelocity.copyFrom(snapshot.lastVelocity);
    host._lastInvDeltaTime = snapshot.lastInvDeltaTime;
    host._bodyPositionTracking.clear();
    for (const [bodyId, tracking] of cloneBodyPositionTracking(
      snapshot.bodyPositionTracking,
    )) {
      host._bodyPositionTracking.set(bodyId, tracking);
    }
    this.synchronizeNativeBodyTransform();
  }

  override dispose(): void {
    if (this.ownedResourcesDisposed) return;
    this.ownedResourcesDisposed = true;
    const host = this.privateHost();
    const physicsPlugin = host._scene.getPhysicsEngine()?.getPhysicsPlugin() as unknown as
      { _hknp?: { HP_QueryCollector_Release(handle: unknown): unknown } } | undefined;
    const query = physicsPlugin?._hknp;
    let primary: unknown;
    const attempt = (dispose: () => void): void => {
      try {
        dispose();
      } catch (error) {
        primary ??= error;
      }
    };
    const originalBodyDispose = host._body.dispose;
    const originalNodeDispose = host._transformNode.dispose;
    const originalShapeDispose = host._shape.dispose;
    const originalCollectorRelease = query?.HP_QueryCollector_Release;
    host._body.dispose = () => attempt(() => originalBodyDispose.call(host._body));
    host._transformNode.dispose = (...args) =>
      attempt(() => originalNodeDispose.apply(host._transformNode, args));
    if (host._ownShape) {
      host._shape.dispose = () => attempt(() => originalShapeDispose.call(host._shape));
    }
    if (query !== undefined && originalCollectorRelease !== undefined) {
      query.HP_QueryCollector_Release = (handle) => {
        let result: unknown;
        attempt(() => {
          result = originalCollectorRelease.call(query, handle);
        });
        return result;
      };
    }
    try {
      super.dispose();
    } catch (error) {
      primary ??= error;
    } finally {
      attempt(() => {
        host._body.dispose = originalBodyDispose;
      });
      attempt(() => {
        host._transformNode.dispose = originalNodeDispose;
      });
      if (host._ownShape) {
        attempt(() => {
          host._shape.dispose = originalShapeDispose;
        });
      }
      if (query !== undefined && originalCollectorRelease !== undefined) {
        attempt(() => {
          query.HP_QueryCollector_Release = originalCollectorRelease;
        });
      }
    }
    if (primary !== undefined) throw primary;
  }

  didStepUpDuringLastIntegrate(): boolean {
    return this.lastIntegrateAppliedStepUp;
  }

  readCurrentContacts(): readonly BabylonCharacterBodyNativeContactV1[] {
    return Object.freeze(this.privateHost()._manifold.map((contact) => {
      const motionType = contact.bodyB.body.getMotionType(contact.bodyB.index);
      const surfaceIdentity = motionType === STATIC_PHYSICS_MOTION_TYPE
        ? nativeSurfaceIdentity(contact.bodyB.body.transformNode)
        : undefined;
      return Object.freeze({
        pointMetersXYZ: freezeVec3([
          contact.position.x,
          contact.position.y,
          contact.position.z,
        ]),
        normalXYZ: freezeVec3([
          contact.normal.x,
          contact.normal.y,
          contact.normal.z,
        ]),
        distanceMeters: contact.distance,
        motionType: motionType === DYNAMIC_PHYSICS_MOTION_TYPE
          ? "dynamic"
          : motionType === STATIC_PHYSICS_MOTION_TYPE
          ? "static"
          : "animated",
        ...surfaceIdentity,
      });
    }));
  }

  probeGroundPlacementAt(
    desiredControllerCenter: Vector3,
    gravityDirection: Vector3,
  ): Readonly<{ controllerCenter: Vector3; support: CharacterSurfaceInfo }> | undefined {
    const manifold = this.privateHost()._manifold;
    const maximumVerticalAdjustmentMeters = Math.max(
      this.maxStepHeight,
      this.keepDistance + this.keepContactTolerance,
    );
    const stepMeters = Math.max(this.keepContactTolerance / 2, 0.01);
    const verticalOffsetsMeters = [0];
    for (
      let distanceMeters = stepMeters;
      distanceMeters <= maximumVerticalAdjustmentMeters + 1e-9;
      distanceMeters += stepMeters
    ) {
      verticalOffsetsMeters.push(-distanceMeters, distanceMeters);
    }
    for (const verticalOffsetMeters of verticalOffsetsMeters) {
      const controllerCenter = desiredControllerCenter.add(
        this.up.scale(verticalOffsetMeters),
      );
      this.setPosition(controllerCenter);
      this._refreshManifoldAtPosition(controllerCenter);
      const staticContacts = manifold.filter(({ bodyB }) =>
        bodyB.body.getMotionType(bodyB.index) === STATIC_PHYSICS_MOTION_TYPE
      );
      manifold.splice(0, manifold.length, ...staticContacts);
      const support = this.checkSupport(1 / 60, gravityDirection);
      if (support.supportedState === CharacterSupportedState.UNSUPPORTED) continue;
      if (manifold.some((contact) =>
        contact.distance < -this.keepDistance &&
        Vector3.Dot(contact.normal, this.up) < this.maxSlopeCosine
      )) continue;
      return Object.freeze({ controllerCenter, support });
    }
    return undefined;
  }

  protected override _tryStepUp(
    remainingTime: number,
    inputVelocity: Vector3,
    simplexOutput: StepUpSimplexOutput,
    constraints: StepUpConstraints,
  ): number {
    if (!this.stepUpEnabledForCurrentIntegrate) return -1;
    const verticalSpeed = Vector3.Dot(inputVelocity, this.up);
    const horizontalVelocity = inputVelocity.subtract(this.up.scale(verticalSpeed));
    const horizontalSpeed = horizontalVelocity.length();
    if (!(horizontalSpeed > 1e-6)) return -1;
    const requestedHorizontalMeters = horizontalSpeed * remainingTime;
    const radiusMeters = this.shapeOptions.capsuleRadius ?? 0;
    const minimumProbeMeters =
      radiusMeters + this.keepDistance + STEP_UP_FORWARD_CLEARANCE_METERS;
    if (requestedHorizontalMeters >= minimumProbeMeters) {
      const consumed = super._tryStepUp(
        remainingTime,
        inputVelocity,
        simplexOutput,
        constraints,
      );
      if (consumed >= 0) this.stepUpAppliedForCurrentIntegrate = true;
      return consumed;
    }

    // Babylon needs a capsule-scale look-ahead to discover some legal steps.
    // Run that padded query transactionally, roll it back, then commit only a
    // landing reachable by this iteration's exact horizontal time budget.
    const snapshot = this.captureTransactionalState();
    const paddedTime = minimumProbeMeters / horizontalSpeed;
    const preflightConsumed = super._tryStepUp(
      paddedTime,
      inputVelocity,
      simplexOutput,
      constraints,
    );
    if (preflightConsumed < 0) {
      this.restoreTransactionalState(snapshot);
      return -1;
    }
    const preflightPosition = this.getPosition().clone();
    const preflightDisplacement = preflightPosition.subtract(snapshot.position);
    const stepHeight = Vector3.Dot(preflightDisplacement, this.up);
    this.restoreTransactionalState(snapshot);
    if (!(stepHeight > 1e-4) ||
      stepHeight > this.maxStepHeight + BODY_RESOLUTION_COHERENCE_TOLERANCE_METERS_V1) {
      return -1;
    }

    const preflightHorizontal = preflightDisplacement.subtract(
      this.up.scale(stepHeight),
    );
    const preflightHorizontalMeters = preflightHorizontal.length();
    if (!(preflightHorizontalMeters > 1e-6)) return -1;
    const progressRatio = Math.min(
      1,
      requestedHorizontalMeters / preflightHorizontalMeters,
    );
    const proportionalCandidate = snapshot.position.add(
      preflightDisplacement.scale(progressRatio),
    );
    const fullHeightCandidate = snapshot.position.add(
      preflightHorizontal.scale(progressRatio),
    ).add(this.up.scale(stepHeight));
    const minimumWalkableAlignment = Math.max(this.maxSlopeCosine, 0.1);
    const settleSafeLanding = (candidate: Vector3): Vector3 | undefined => {
      this._refreshManifoldAtPosition(candidate);
      let manifold = this.privateHost()._manifold;
      let walkableContacts = manifold.filter((contact) =>
        contact.bodyB.body.getMotionType(contact.bodyB.index) !==
          DYNAMIC_PHYSICS_MOTION_TYPE &&
        Vector3.Dot(contact.normal, this.up) >= minimumWalkableAlignment
      );
      let penetratesBlockingSurface = manifold.some((contact) =>
        Vector3.Dot(contact.normal, this.up) < minimumWalkableAlignment &&
        contact.distance < -this.keepDistance
      );
      if (penetratesBlockingSurface) return undefined;
      if (walkableContacts.some((contact) =>
        contact.distance <= this.keepContactTolerance
      )) return candidate;

      const nearbyWalkableContacts = walkableContacts.filter((contact) =>
        contact.distance <= this.keepContactTolerance + this.keepDistance
      );
      if (nearbyWalkableContacts.length === 0) return undefined;
      const targetDistance = Math.max(
        this.keepContactTolerance - Math.min(this.keepDistance, 0.001),
        0,
      );
      const landingDrop = Math.min(...nearbyWalkableContacts.map((contact) =>
        (contact.distance - targetDistance) /
        Vector3.Dot(contact.normal, this.up)
      ));
      if (!(landingDrop > 0)) return undefined;
      const settledCandidate = candidate.subtract(this.up.scale(landingDrop));
      const settledStepHeight = Vector3.Dot(
        settledCandidate.subtract(snapshot.position),
        this.up,
      );
      if (!(settledStepHeight > 1e-4) ||
        settledStepHeight >
          this.maxStepHeight + BODY_RESOLUTION_COHERENCE_TOLERANCE_METERS_V1) {
        return undefined;
      }

      this._refreshManifoldAtPosition(settledCandidate);
      manifold = this.privateHost()._manifold;
      walkableContacts = manifold.filter((contact) =>
        contact.bodyB.body.getMotionType(contact.bodyB.index) !==
          DYNAMIC_PHYSICS_MOTION_TYPE &&
        Vector3.Dot(contact.normal, this.up) >= minimumWalkableAlignment
      );
      penetratesBlockingSurface = manifold.some((contact) =>
        Vector3.Dot(contact.normal, this.up) < minimumWalkableAlignment &&
        contact.distance < -this.keepDistance
      );
      return !penetratesBlockingSurface && walkableContacts.some((contact) =>
          contact.distance <= this.keepContactTolerance
        )
        ? settledCandidate
        : undefined;
    };

    // Prefer the complete legal step height at this Tick's exact horizontal
    // progress. When the clipped position has not reached a real walkable
    // contact yet, retain the earlier proportional, support-preserving path.
    let candidate = settleSafeLanding(fullHeightCandidate);
    if (candidate === undefined) {
      this.restoreTransactionalState(snapshot);
      candidate = settleSafeLanding(proportionalCandidate);
      if (candidate === undefined) {
        this.restoreTransactionalState(snapshot);
        return -1;
      }
    }
    const displacement = candidate.subtract(snapshot.position);
    this.privateHost()._lastDisplacement.copyFrom(displacement);
    this.setPosition(candidate);
    this.stepUpAppliedForCurrentIntegrate = true;
    return remainingTime;
  }

  override integrate(
    deltaTime: number,
    surfaceInfo: CharacterSurfaceInfo,
    gravity: Vector3,
  ): void {
    const leavesSupport = this.exactTranslationLeavesSupportForCurrentIntegrate;
    const effectiveSurfaceInfo = leavesSupport
      ? {
          supportedState: CharacterSupportedState.UNSUPPORTED,
          averageSurfaceNormal: Vector3.Zero(),
          averageSurfaceVelocity: Vector3.Zero(),
          averageAngularSurfaceVelocity: Vector3.Zero(),
          isSurfaceDynamic: false,
        }
      : surfaceInfo;
    // Walk-speed look-ahead may only fire on SUPPORTED ground. SLIDING is
    // Havok contact against a wall or box face, not an authored step-up.
    this.stepUpEnabledForCurrentIntegrate =
      effectiveSurfaceInfo.supportedState === CharacterSupportedState.SUPPORTED;
    this.stepUpAppliedForCurrentIntegrate = false;
    try {
      super.integrate(deltaTime, effectiveSurfaceInfo, gravity);
      if (!leavesSupport) {
        this.snapDownToWalkableSupport(effectiveSurfaceInfo);
      }
    } finally {
      this.lastIntegrateAppliedStepUp = this.stepUpAppliedForCurrentIntegrate;
      this.stepUpEnabledForCurrentIntegrate = false;
      this.stepUpAppliedForCurrentIntegrate = false;
      this.exactTranslationLeavesSupportForCurrentIntegrate = false;
    }
  }

  private snapDownToWalkableSupport(
    supportBeforeIntegrate: CharacterSurfaceInfo,
  ): void {
    if (
      supportBeforeIntegrate.supportedState === CharacterSupportedState.UNSUPPORTED
    ) return;
    if (
      Vector3.Dot(this.getVelocity(), this.up) >
      SNAP_DOWN_UPWARD_SPEED_LIMIT_METERS_PER_SECOND
    ) return;
    const maxStepHeight = this.maxStepHeight;
    if (!(maxStepHeight > 0)) return;
    const keepDistance = this.keepDistance;
    const downDistance = maxStepHeight + keepDistance * 2;
    const position = this.getPosition();
    const velocity = this.getVelocity();
    const verticalSpeed = Vector3.Dot(velocity, this.up);
    const horizontalVelocity = velocity.subtract(this.up.scale(verticalSpeed));
    const horizontalSpeed = horizontalVelocity.length();
    const radiusMeters = this.shapeOptions.capsuleRadius ?? 0;
    const probeOrigin = horizontalSpeed > 1e-6
      ? position.add(horizontalVelocity.scale(
          (radiusMeters + keepDistance) / horizontalSpeed,
        ))
      : position;
    const downEnd = probeOrigin.subtract(this.up.scale(downDistance));
    this._castWithCollectors(
      probeOrigin,
      downEnd,
      this.privateHost()._castCollector,
    );
    const hit = this._getClosestCastHit();
    if (hit === null || hit.body === null) return;
    if (hit.body.body.getMotionType(hit.body.index) === DYNAMIC_PHYSICS_MOTION_TYPE) {
      return;
    }
    if (
      Vector3.Dot(hit.normal, this.up) < Math.max(this.maxSlopeCosine, 0.1)
    ) return;
    if (
      Vector3.Dot(hit.normal, supportBeforeIntegrate.averageSurfaceNormal) <
        1 - SNAP_DOWN_SURFACE_NORMAL_ALIGNMENT_EPSILON
    ) return;
    const probeDrop = hit.fraction * downDistance - keepDistance;
    const landingDrop = probeDrop + Vector3.Dot(
      probeOrigin.subtract(position),
      this.up,
    );
    if (
      landingDrop <= SNAP_DOWN_MINIMUM_DROP_METERS ||
      landingDrop > maxStepHeight
    ) return;
    const landingPosition = position.subtract(this.up.scale(landingDrop));
    this.setPosition(landingPosition);
    this._refreshManifoldAtPosition(landingPosition);
  }
}

/** @internal Temporary construction reuse for MotionKernelRuntime until Task 7 deletes it. */
export function createGroundAwareControllerInternal(
  position: Vector3,
  shapeOptions: ConstructorParameters<typeof PhysicsCharacterController>[1],
  scene: Scene,
) {
  return new GroundAwarePhysicsCharacterController(position, shapeOptions, scene);
}

function invalid(detail: string): never {
  throw new RangeError(`3C_INPUT_INVALID: ${detail}`);
}

function stale(detail: string): never {
  throw new Error(`3C_TICK_TOKEN_STALE: ${detail}`);
}

function record(input: unknown): Record<string, unknown> | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const prototype = Reflect.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
    if (
      typeof key !== "string" || descriptor === undefined ||
      !descriptor.enumerable || !("value" in descriptor)
    ) return undefined;
    output[key] = descriptor.value;
  }
  return output;
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.length === keys.length && ownKeys.every((key) =>
    typeof key === "string" && keys.includes(key)
  );
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0);
}

function safeTick(value: unknown): value is number {
  return finite(value) && Number.isSafeInteger(value) && value >= 0;
}

function freezeVec3(input: readonly number[]): MovementVec3V1 {
  if (input.length !== 3 || !input.every((value) =>
    typeof value === "number" && Number.isFinite(value)
  )) invalid("expected a finite XYZ vector.");
  return Object.freeze(input.map((value) => Object.is(value, -0) ? 0 : value)) as
    MovementVec3V1;
}

function parseVec3(input: unknown): MovementVec3V1 {
  if (!Array.isArray(input) || Reflect.getPrototypeOf(input) !== Array.prototype) {
    invalid("expected an ordinary XYZ array.");
  }
  const ownKeys = Reflect.ownKeys(input);
  if (input.length !== 3 || ownKeys.length !== 4 || ownKeys.some((key) =>
    typeof key === "symbol"
  )) invalid("expected an exact dense XYZ array.");
  const values: number[] = [];
  for (let index = 0; index < 3; index += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(input, String(index));
    if (
      descriptor === undefined || !descriptor.enumerable ||
      !("value" in descriptor) || !finite(descriptor.value)
    ) invalid("expected a finite dense XYZ array.");
    values.push(descriptor.value);
  }
  return freezeVec3(values);
}

function parseOptions(input: unknown): BabylonCharacterBodyPortOptionsV1 {
  const value = record(input) ?? invalid("BodyPort options must be a plain record.");
  if (!exact(value, [
    "schemaVersion",
    "providerVersions",
    "scene",
    "fixedDeltaSeconds",
    "gravityMetersPerSecondSquaredXYZ",
    "capsule",
    "controller",
    "resetState",
  ]) || value.schemaVersion !== 1 || !finite(value.fixedDeltaSeconds) ||
    value.fixedDeltaSeconds <= 0 || !(value.scene instanceof Scene)) {
    invalid("BodyPort options are malformed.");
  }
  const providerVersions = record(value.providerVersions) ??
    invalid("provider versions are malformed.");
  if (!exact(providerVersions, ["babylonJs", "havok"]) ||
    providerVersions.babylonJs !== BABYLON_CHARACTER_BODY_PROVIDER_VERSIONS_V1.babylonJs ||
    providerVersions.havok !== BABYLON_CHARACTER_BODY_PROVIDER_VERSIONS_V1.havok) {
    invalid("Babylon/Havok provider versions do not match the locked adapter surface.");
  }
  const capsule = record(value.capsule) ?? invalid("capsule options are malformed.");
  if (!exact(capsule, ["heightMeters", "radiusMeters"]) ||
    !finite(capsule.heightMeters) || capsule.heightMeters <= 0 ||
    !finite(capsule.radiusMeters) || capsule.radiusMeters <= 0 ||
    capsule.heightMeters < capsule.radiusMeters * 2) {
    invalid("capsule dimensions must describe a positive capsule.");
  }
  const controller = record(value.controller) ??
    invalid("controller options are malformed.");
  if (!exact(controller, [
    "keepDistanceMeters",
    "keepContactToleranceMeters",
    "maxSlopeDegrees",
    "maxStepHeightMeters",
    "characterMassKilograms",
  ]) || !finite(controller.keepDistanceMeters) || controller.keepDistanceMeters <= 0 ||
    !finite(controller.keepContactToleranceMeters) ||
    controller.keepContactToleranceMeters < controller.keepDistanceMeters ||
    !finite(controller.maxSlopeDegrees) || controller.maxSlopeDegrees <= 0 ||
    controller.maxSlopeDegrees >= 90 || !finite(controller.maxStepHeightMeters) ||
    controller.maxStepHeightMeters < 0 || !finite(controller.characterMassKilograms) ||
    controller.characterMassKilograms <= 0) {
    invalid("controller options are outside the admitted finite domain.");
  }
  const resetState = record(value.resetState) ??
    invalid("reset state is malformed.");
  if (!exact(resetState, [
    "positionMetersXYZ",
    "linearVelocityMetersPerSecondXYZ",
  ])) invalid("reset state is not exact.");
  const gravity = parseVec3(value.gravityMetersPerSecondSquaredXYZ);
  if (!(Math.hypot(...gravity) > 0)) invalid("gravity must be nonzero.");
  if (gravity[0] !== 0 || gravity[1] >= 0 || gravity[2] !== 0) {
    invalid("Character BodyPort V1 gravity must point down world Y.");
  }
  const frozenCapsule = Object.freeze({
    heightMeters: capsule.heightMeters,
    radiusMeters: capsule.radiusMeters,
  });
  const frozenController = Object.freeze({
    keepDistanceMeters: controller.keepDistanceMeters,
    keepContactToleranceMeters: controller.keepContactToleranceMeters,
    maxSlopeDegrees: controller.maxSlopeDegrees,
    maxStepHeightMeters: controller.maxStepHeightMeters,
    characterMassKilograms: controller.characterMassKilograms,
  });
  const frozenResetState = Object.freeze({
    positionMetersXYZ: parseVec3(resetState.positionMetersXYZ),
    linearVelocityMetersPerSecondXYZ:
      parseVec3(resetState.linearVelocityMetersPerSecondXYZ),
  });
  return Object.freeze({
    schemaVersion: 1,
    providerVersions: BABYLON_CHARACTER_BODY_PROVIDER_VERSIONS_V1,
    scene: value.scene as Scene,
    fixedDeltaSeconds: value.fixedDeltaSeconds,
    gravityMetersPerSecondSquaredXYZ: gravity,
    capsule: frozenCapsule,
    controller: frozenController,
    resetState: frozenResetState,
  });
}

function normalized(input: MovementVec3V1, detail: string): MovementVec3V1 {
  const length = Math.hypot(...input);
  if (!finite(length) || length <= 1e-12) invalid(detail);
  return freezeVec3(input.map((component) => component / length));
}

function checkedSubtract(left: number, right: number): number {
  const result = left - right;
  if (!finite(result)) invalid("native position delta overflowed.");
  return result;
}

function checkedDivide(value: number, divisor: number): number {
  const result = value / divisor;
  if (!finite(result)) invalid("translation-to-velocity conversion overflowed.");
  return result;
}

function dot(left: MovementVec3V1, right: MovementVec3V1): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function addScaled(
  origin: MovementVec3V1,
  direction: MovementVec3V1,
  scale: number,
): MovementVec3V1 {
  return freezeVec3([
    origin[0] + direction[0] * scale,
    origin[1] + direction[1] * scale,
    origin[2] + direction[2] * scale,
  ]);
}

function averageVec3(
  values: readonly MovementVec3V1[],
): MovementVec3V1 {
  if (values.length === 0) invalid("cannot average an empty vector set.");
  const output = [0, 0, 0];
  for (const value of values) {
    output[0]! += value[0];
    output[1]! += value[1];
    output[2]! += value[2];
  }
  return freezeVec3(output.map((component) => component / values.length));
}

function projectVelocityAgainstContacts(
  velocity: MovementVec3V1,
  contacts: readonly BabylonCharacterBodyNativeContactV1[],
  contactToleranceMeters: number,
): MovementVec3V1 {
  const output = [...velocity];
  const blockingContacts = contacts.filter((contact) =>
    contact.distanceMeters <= contactToleranceMeters
  );
  const constraintTolerance = 1e-10;
  const maximumPasses = 64;
  for (let pass = 0; pass < maximumPasses; pass += 1) {
    for (const contact of blockingContacts) {
      const inwardSpeed = output[0]! * contact.normalXYZ[0] +
        output[1]! * contact.normalXYZ[1] +
        output[2]! * contact.normalXYZ[2];
      if (inwardSpeed >= -constraintTolerance) continue;
      for (let axis = 0; axis < 3; axis += 1) {
        output[axis]! -= contact.normalXYZ[axis]! * inwardSpeed;
      }
    }
    if (blockingContacts.every((contact) =>
      output[0]! * contact.normalXYZ[0] +
        output[1]! * contact.normalXYZ[1] +
        output[2]! * contact.normalXYZ[2] >= -constraintTolerance
    )) return freezeVec3(output);
  }
  if (blockingContacts.some((contact) =>
    output[0]! * contact.normalXYZ[0] +
      output[1]! * contact.normalXYZ[1] +
      output[2]! * contact.normalXYZ[2] < -constraintTolerance
  )) {
    return freezeVec3([0, 0, 0]);
  }
  return freezeVec3(output);
}

function compareNumber(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareVec3(left: MovementVec3V1, right: MovementVec3V1): number {
  for (let axis = 0; axis < 3; axis += 1) {
    const order = compareNumber(left[axis]!, right[axis]!);
    if (order !== 0) return order;
  }
  return 0;
}

function compareContacts(
  left: BabylonCharacterBodyNativeContactV1,
  right: BabylonCharacterBodyNativeContactV1,
): number {
  return compareNumber(left.distanceMeters, right.distanceMeters) ||
    compareVec3(left.normalXYZ, right.normalXYZ) ||
    compareVec3(left.pointMetersXYZ, right.pointMetersXYZ) ||
    (left.motionType < right.motionType ? -1 : left.motionType > right.motionType ? 1 : 0) ||
    compareOptionalString(left.colliderId, right.colliderId) ||
    compareOptionalString(left.colliderSubshapeId, right.colliderSubshapeId) ||
    compareOptionalString(left.logicalSubshapeId, right.logicalSubshapeId) ||
    compareOptionalString(left.traversalSurfaceId, right.traversalSurfaceId) ||
    compareOptionalString(left.surfaceEntityId, right.surfaceEntityId) ||
    compareOptionalString(
      left.traversalSurfaceProfileRef,
      right.traversalSurfaceProfileRef,
    );
}

function compareOptionalString(
  left: string | undefined,
  right: string | undefined,
): number {
  if (left === right) return 0;
  if (isNil(left)) return -1;
  if (isNil(right)) return 1;
  return left < right ? -1 : 1;
}

function canonicalSupportNormal(
  mode: BabylonCharacterBodyNativeSupportV1["mode"],
  input: MovementVec3V1,
): MovementVec3V1 {
  if (mode === "unsupported") return freezeVec3([0, 0, 0]);
  return normalized(input, "support normal must be nonzero.");
}

function canonicalContact(
  value: Record<string, unknown>,
): BabylonCharacterBodyNativeContactV1 {
  const surfaceIdentity = isNil(value.colliderSubshapeId)
    ? undefined
    : Object.freeze({
      colliderId: value.colliderId as string,
      colliderSubshapeId: value.colliderSubshapeId as string,
      logicalSubshapeId: value.logicalSubshapeId as string,
      traversalSurfaceId: value.traversalSurfaceId as string,
      surfaceEntityId: value.surfaceEntityId as string,
      traversalSurfaceProfileRef: value.traversalSurfaceProfileRef as string,
    });
  return Object.freeze({
    pointMetersXYZ: parseVec3(value.pointMetersXYZ),
    normalXYZ: normalized(parseVec3(value.normalXYZ), "contact normal must be nonzero."),
    distanceMeters: value.distanceMeters as number,
    motionType: value.motionType as BabylonCharacterBodyNativeMotionTypeV1,
    ...(surfaceIdentity ?? {}),
  });
}

function proposalLeavesSupportUpward(
  proposal: MovementProposalV1,
  up: MovementVec3V1,
): boolean {
  return dot(proposal.translationDeltaMetersXYZ, up) >
    BODY_RESOLUTION_COHERENCE_TOLERANCE_METERS_V1;
}

function assertContactConeCoherent(
  velocity: MovementVec3V1,
  contacts: readonly BabylonCharacterBodyNativeContactV1[],
  contactToleranceMeters: number,
): void {
  if (contacts.some((contact) =>
    contact.distanceMeters <= contactToleranceMeters &&
    dot(velocity, contact.normalXYZ) < -1e-10
  )) {
    invalid("native velocity violates the active contact cone.");
  }
}

function horizontalProgressAlongProposal(
  applied: MovementVec3V1,
  proposed: MovementVec3V1,
  up: MovementVec3V1,
): Readonly<{ applied: number; proposedMagnitude: number }> {
  const proposedVertical = dot(proposed, up);
  const appliedVertical = dot(applied, up);
  const proposedHorizontal = freezeVec3(proposed.map((component, axis) =>
    component - up[axis]! * proposedVertical
  ));
  const appliedHorizontal = freezeVec3(applied.map((component, axis) =>
    component - up[axis]! * appliedVertical
  ));
  const proposedMagnitude = Math.hypot(...proposedHorizontal);
  if (proposedMagnitude <= 1e-12) {
    return Object.freeze({
      applied: Math.hypot(...appliedHorizontal),
      proposedMagnitude: 0,
    });
  }
  const direction = freezeVec3(
    proposedHorizontal.map((component) => component / proposedMagnitude),
  );
  return Object.freeze({
    applied: dot(appliedHorizontal, direction),
    proposedMagnitude,
  });
}

function removeBoundedDownhillProjection(
  applied: MovementVec3V1,
  proposed: MovementVec3V1,
  up: MovementVec3V1,
  surfaceNormal: MovementVec3V1,
): MovementVec3V1 {
  const proposedVertical = dot(proposed, up);
  if (!(proposedVertical < 0)) return applied;
  const normalUp = dot(surfaceNormal, up);
  if (!(normalUp > 0)) return applied;
  const normalHorizontal = freezeVec3(surfaceNormal.map((component, axis) =>
    component - up[axis]! * normalUp
  ));
  const maximumProjection = freezeVec3(normalHorizontal.map((component) =>
    component * -proposedVertical * normalUp
  ));
  const maximumProjectionSquared = dot(maximumProjection, maximumProjection);
  if (!(maximumProjectionSquared > 0)) return applied;
  const appliedVertical = dot(applied, up);
  const appliedHorizontal = freezeVec3(applied.map((component, axis) =>
    component - up[axis]! * appliedVertical
  ));
  const proposedHorizontal = freezeVec3(proposed.map((component, axis) =>
    component - up[axis]! * proposedVertical
  ));
  const unexplainedHorizontal = freezeVec3(appliedHorizontal.map(
    (component, axis) => component - proposedHorizontal[axis]!,
  ));
  const acceptedRatio = Math.min(1, Math.max(
    0,
    dot(unexplainedHorizontal, maximumProjection) / maximumProjectionSquared,
  ));
  return freezeVec3(applied.map((component, axis) =>
    component - maximumProjection[axis]! * acceptedRatio
  ));
}

function removeBoundedSupportTranslation(
  applied: MovementVec3V1,
  proposed: MovementVec3V1,
  supportDelta: MovementVec3V1,
): MovementVec3V1 {
  const maximumContributionSquared = dot(supportDelta, supportDelta);
  if (!(maximumContributionSquared > 0)) return applied;
  const unexplained = freezeVec3(applied.map(
    (component, axis) => component - proposed[axis]!,
  ));
  const acceptedRatio = Math.min(1, Math.max(
    0,
    dot(unexplained, supportDelta) / maximumContributionSquared,
  ));
  return freezeVec3(applied.map((component, axis) =>
    component - supportDelta[axis]! * acceptedRatio
  ));
}

function assertProposalWasNotAmplified(
  applied: MovementVec3V1,
  proposed: MovementVec3V1,
  gravityDirection: MovementVec3V1,
  support: BabylonCharacterBodyNativeSupportV1,
  fixedDeltaSeconds: number,
  maxStepHeightMeters: number,
  maxSlopeCosine: number,
  maximumActiveContactDistanceMeters: number,
  maximumSolverCorrectionMeters: number,
  contacts: readonly BabylonCharacterBodyNativeContactV1[],
): void {
  const surfaceVelocity = support.mode === "unsupported"
    ? freezeVec3([0, 0, 0])
    : support.averageSurfaceVelocityMetersPerSecondXYZ ?? freezeVec3([0, 0, 0]);
  const supportDelta = freezeVec3(
    surfaceVelocity.map((component) => component * fixedDeltaSeconds),
  );
  const supportAdjustedApplied = removeBoundedSupportTranslation(
    applied,
    proposed,
    supportDelta,
  );
  const up = freezeVec3(gravityDirection.map((component) => component === 0 ? 0 : -component));
  const projectionNormal = support.mode === "unsupported"
    ? (() => {
      const activeWalkableContacts = contacts.filter((contact) =>
        contact.distanceMeters <= maximumActiveContactDistanceMeters &&
        dot(contact.normalXYZ, up) >= maxSlopeCosine
      );
      return activeWalkableContacts.length === 0
        ? undefined
        : normalized(
          averageVec3(activeWalkableContacts.map((contact) => contact.normalXYZ)),
          "active landing contact normal is invalid.",
        );
    })()
    : support.averageSurfaceNormalXYZ;
  const horizontalGuardApplied = projectionNormal === undefined
    ? supportAdjustedApplied
    : removeBoundedDownhillProjection(
      supportAdjustedApplied,
      proposed,
      up,
      projectionNormal,
    );
  const proposedVertical = dot(proposed, up);
  const appliedVertical = dot(supportAdjustedApplied, up);
  if (!finite(maximumSolverCorrectionMeters) || maximumSolverCorrectionMeters < 0 ||
    maximumSolverCorrectionMeters >
      BABYLON_CHARACTER_CONTROLLER_COLLISION_TOLERANCE_METERS_V1) {
    invalid("native collision solver correction receipt is invalid.");
  }
  const progress = horizontalProgressAlongProposal(
    horizontalGuardApplied,
    proposed,
    up,
  );
  if (progress.applied > progress.proposedMagnitude +
    maximumSolverCorrectionMeters +
      BODY_RESOLUTION_COHERENCE_TOLERANCE_METERS_V1) {
    invalid("native collision resolution amplified horizontal proposal progress.");
  }
  const stepHeightAllowanceMeters = support.mode === "unsupported"
    ? 0
    : maxStepHeightMeters;
  const minimumVertical =
    Math.min(0, proposedVertical) - stepHeightAllowanceMeters -
    maximumSolverCorrectionMeters -
    BODY_RESOLUTION_COHERENCE_TOLERANCE_METERS_V1;
  const maximumVertical =
    Math.max(0, proposedVertical) + stepHeightAllowanceMeters +
    maximumSolverCorrectionMeters +
    BODY_RESOLUTION_COHERENCE_TOLERANCE_METERS_V1;
  if (appliedVertical < minimumVertical || appliedVertical > maximumVertical) {
    invalid("native collision resolution amplified vertical proposal beyond max step height.");
  }
  const proposedHorizontalMagnitude = progress.proposedMagnitude;
  const appliedVerticalVector = freezeVec3(
    up.map((component) => component * appliedVertical),
  );
  const appliedHorizontalMagnitude = Math.hypot(...horizontalGuardApplied.map(
    (component, axis) => component - appliedVerticalVector[axis]!,
  ));
  if (appliedHorizontalMagnitude > proposedHorizontalMagnitude +
    maximumSolverCorrectionMeters +
    BODY_RESOLUTION_COHERENCE_TOLERANCE_METERS_V1) {
    invalid("native collision resolution amplified horizontal proposal magnitude.");
  }
}

function parseNativeSupport(input: unknown): BabylonCharacterBodyNativeSupportV1 {
  const value = record(input) ?? invalid("native support output is malformed.");
  const allowedKeys = [
    "mode",
    "averageSurfaceNormalXYZ",
    "isSurfaceDynamic",
    "averageSurfaceVelocityMetersPerSecondXYZ",
    "averageAngularSurfaceVelocityRadiansPerSecondXYZ",
  ];
  if (Reflect.ownKeys(value).some((key) =>
    typeof key !== "string" || !allowedKeys.includes(key)
  ) || (value.mode !== "supported" && value.mode !== "sliding" &&
    value.mode !== "unsupported") || typeof value.isSurfaceDynamic !== "boolean") {
    invalid("native support output is outside the closed driver surface.");
  }
  const normal = canonicalSupportNormal(
    value.mode,
    parseVec3(value.averageSurfaceNormalXYZ),
  );
  return Object.freeze({
    mode: value.mode,
    averageSurfaceNormalXYZ: normal,
    isSurfaceDynamic: value.isSurfaceDynamic,
    averageSurfaceVelocityMetersPerSecondXYZ:
      value.averageSurfaceVelocityMetersPerSecondXYZ === undefined
        ? freezeVec3([0, 0, 0])
        : parseVec3(value.averageSurfaceVelocityMetersPerSecondXYZ),
    averageAngularSurfaceVelocityRadiansPerSecondXYZ:
      value.averageAngularSurfaceVelocityRadiansPerSecondXYZ === undefined
        ? freezeVec3([0, 0, 0])
        : parseVec3(value.averageAngularSurfaceVelocityRadiansPerSecondXYZ),
  });
}

function parseNativeContacts(
  input: unknown,
): readonly BabylonCharacterBodyNativeContactV1[] {
  if (!Array.isArray(input) || Reflect.getPrototypeOf(input) !== Array.prototype) {
    invalid("native contacts must be an ordinary array.");
  }
  const ownKeys = Reflect.ownKeys(input);
  if (ownKeys.length !== input.length + 1 || ownKeys.some((key) =>
    typeof key === "symbol"
  )) invalid("native contacts must be dense and exact.");
  const contacts: BabylonCharacterBodyNativeContactV1[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(input, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      invalid("native contacts must contain data values.");
    }
    const value = record(descriptor.value) ?? invalid("native contact is malformed.");
    const requiredKeys = [
      "pointMetersXYZ",
      "normalXYZ",
      "distanceMeters",
      "motionType",
    ];
    const surfaceIdentityKeys = [
      "colliderId",
      "colliderSubshapeId",
      "logicalSubshapeId",
      "traversalSurfaceId",
      "surfaceEntityId",
      "traversalSurfaceProfileRef",
    ];
    const keys = Reflect.ownKeys(value);
    const surfaceIdentityKeyCount = surfaceIdentityKeys.filter((key) =>
      Object.prototype.hasOwnProperty.call(value, key)
    ).length;
    if (
      keys.some((key) =>
        typeof key !== "string" ||
        (!requiredKeys.includes(key) && !surfaceIdentityKeys.includes(key))
      ) ||
      !requiredKeys.every((key) =>
        Object.prototype.hasOwnProperty.call(value, key)
      ) ||
      (surfaceIdentityKeyCount !== 0 &&
        surfaceIdentityKeyCount !== surfaceIdentityKeys.length) ||
      (surfaceIdentityKeyCount > 0 && value.motionType !== "static") ||
      surfaceIdentityKeys.some((key) =>
        Object.prototype.hasOwnProperty.call(value, key) &&
        !nonEmptyString(value[key])
      ) ||
      !finite(value.distanceMeters) ||
      (value.motionType !== "static" && value.motionType !== "animated" &&
        value.motionType !== "dynamic")
    ) invalid("native contact is outside the closed surface.");
    contacts.push(canonicalContact(value));
  }
  return Object.freeze(contacts.sort(compareContacts));
}

class BabylonPhysicsCharacterControllerDriverV1
  implements BabylonCharacterBodyNativeDriverV1 {
  private configuration: BabylonCharacterBodyNativeConfigurationV1 | undefined;

  constructor(
    private readonly controller: GroundAwarePhysicsCharacterController,
  ) {}

  configure(configuration: BabylonCharacterBodyNativeConfigurationV1): void {
    this.configuration = configuration;
    this.controller.up.copyFromFloats(
      configuration.gravityDirectionXYZ[0] === 0
        ? 0
        : -configuration.gravityDirectionXYZ[0],
      configuration.gravityDirectionXYZ[1] === 0
        ? 0
        : -configuration.gravityDirectionXYZ[1],
      configuration.gravityDirectionXYZ[2] === 0
        ? 0
        : -configuration.gravityDirectionXYZ[2],
    );
    this.controller.keepDistance = configuration.controller.keepDistanceMeters;
    this.controller.keepContactTolerance =
      configuration.controller.keepContactToleranceMeters;
    this.controller.maxSlopeCosine = configuration.maxSlopeCosine;
    this.controller.maxStepHeight = configuration.controller.maxStepHeightMeters;
    this.controller.characterMass = configuration.controller.characterMassKilograms;
    this.setPositionMetersXYZ(configuration.resetState.positionMetersXYZ);
    this.setLinearVelocityMetersPerSecondXYZ(
      configuration.resetState.linearVelocityMetersPerSecondXYZ,
    );
    this.controller.refreshCurrentManifold();
  }

  captureState(): GroundAwareControllerSnapshotV1 {
    return this.controller.captureTransactionalState();
  }

  restoreState(snapshot: unknown): void {
    this.controller.restoreTransactionalState(
      snapshot as GroundAwareControllerSnapshotV1,
    );
  }

  getPositionMetersXYZ(): MovementVec3V1 {
    const position = this.controller.getPosition();
    return freezeVec3([position.x, position.y, position.z]);
  }

  getLinearVelocityMetersPerSecondXYZ(): MovementVec3V1 {
    const velocity = this.controller.getVelocity();
    return freezeVec3([velocity.x, velocity.y, velocity.z]);
  }

  setPositionMetersXYZ(value: MovementVec3V1): void {
    this.controller.setPosition(new Vector3(...value));
  }

  setLinearVelocityMetersPerSecondXYZ(value: MovementVec3V1): void {
    this.controller.setVelocity(new Vector3(...value));
  }

  checkSupport(
    fixedDeltaSeconds: number,
    gravityDirectionXYZ: MovementVec3V1,
  ): BabylonCharacterBodyNativeSupportV1 {
    const support = this.controller.checkSupport(
      fixedDeltaSeconds,
      new Vector3(...gravityDirectionXYZ),
    );
    return Object.freeze({
      mode: support.supportedState === CharacterSupportedState.SUPPORTED
        ? "supported"
        : support.supportedState === CharacterSupportedState.SLIDING
        ? "sliding"
        : "unsupported",
      averageSurfaceNormalXYZ: freezeVec3([
        support.averageSurfaceNormal.x,
        support.averageSurfaceNormal.y,
        support.averageSurfaceNormal.z,
      ]),
      isSurfaceDynamic: support.isSurfaceDynamic,
      averageSurfaceVelocityMetersPerSecondXYZ: freezeVec3([
        support.averageSurfaceVelocity.x,
        support.averageSurfaceVelocity.y,
        support.averageSurfaceVelocity.z,
      ]),
      averageAngularSurfaceVelocityRadiansPerSecondXYZ: freezeVec3([
        support.averageAngularSurfaceVelocity.x,
        support.averageAngularSurfaceVelocity.y,
        support.averageAngularSurfaceVelocity.z,
      ]),
    });
  }

  integrateExactTranslation(
    request: BabylonCharacterBodyNativeIntegrateRequestV1,
  ): BabylonCharacterBodyNativeIntegrateResultV1 {
    this.controller.prepareExactTranslation(
      new Vector3(...request.translationDeltaMetersXYZ),
      new Vector3(...request.driverVelocityMetersPerSecondXYZ),
      request.fixedDeltaSeconds,
    );
    const support = request.supportBeforeIntegrate;
    this.controller.integrate(
      request.fixedDeltaSeconds,
      {
        supportedState: support.mode === "supported"
          ? CharacterSupportedState.SUPPORTED
          : support.mode === "sliding"
          ? CharacterSupportedState.SLIDING
          : CharacterSupportedState.UNSUPPORTED,
        averageSurfaceNormal: new Vector3(...support.averageSurfaceNormalXYZ),
        averageSurfaceVelocity: new Vector3(
          ...(support.averageSurfaceVelocityMetersPerSecondXYZ ?? [0, 0, 0]),
        ),
        averageAngularSurfaceVelocity: new Vector3(
          ...(support.averageAngularSurfaceVelocityRadiansPerSecondXYZ ?? [0, 0, 0]),
        ),
        isSurfaceDynamic: support.isSurfaceDynamic,
      },
      // CharacterMovementRuntime already folded gravity into the exact proposal
      // translation. Applying provider gravity here would double-integrate it.
      Vector3.ZeroReadOnly as Vector3,
    );
    return Object.freeze({
      didStepUp: this.controller.didStepUpDuringLastIntegrate(),
      maximumSolverCorrectionMeters:
        BABYLON_CHARACTER_CONTROLLER_COLLISION_TOLERANCE_METERS_V1,
    });
  }

  isIntegrateRollbackExternallySafe(): boolean {
    // integrate() can notify collision observers and apply impulses to external
    // dynamic bodies. Controller snapshots cannot reverse those world effects.
    return false;
  }

  readCurrentContacts(): readonly BabylonCharacterBodyNativeContactV1[] {
    return this.controller.readCurrentContacts();
  }

  getPhysicsBody(): PhysicsBody {
    return (this.controller as unknown as PhysicsCharacterControllerPrivateHostV1)._body;
  }

  synchronizeAfterTeleport(): void {
    this.controller.synchronizeAfterTeleport();
  }

  dispose(): void {
    this.controller.dispose();
  }
}

interface CharacterControllerConstructionPluginV1 {
  initShape: (...args: unknown[]) => unknown;
  disposeShape: (shape: PhysicsShape) => unknown;
  initBody: (...args: unknown[]) => unknown;
  setMassProperties: (...args: unknown[]) => unknown;
  setShape: (...args: unknown[]) => unknown;
  removeBody: (body: PhysicsBody) => unknown;
  disposeBody: (body: PhysicsBody) => unknown;
  readonly _hknp: {
    HP_QueryCollector_Create: (...args: unknown[]) => unknown;
    HP_QueryCollector_Release: (handle: unknown) => unknown;
  };
}

interface CharacterControllerConstructionEngineV1 {
  getBodies(): PhysicsBody[];
  removeBody(body: PhysicsBody): void;
  getPhysicsPlugin(): unknown;
}

type CharacterControllerConstructionPhaseV1 =
  | "shape"
  | "node"
  | "body"
  | "mass"
  | "attach-shape"
  | "collectors"
  | "complete";

interface CharacterControllerConstructionAttemptV1 {
  readonly shapes: Set<PhysicsShape>;
  readonly nodes: Set<TransformNode>;
  readonly bodies: Set<PhysicsBody>;
  readonly collectors: unknown[];
  phase: CharacterControllerConstructionPhaseV1;
  providerCallbackDepth: number;
}

interface CharacterControllerConstructionTrackerV1 {
  readonly scene: Scene;
  readonly engine: CharacterControllerConstructionEngineV1;
  readonly plugin: CharacterControllerConstructionPluginV1;
  readonly query: CharacterControllerConstructionPluginV1["_hknp"];
  readonly stack: CharacterControllerConstructionAttemptV1[];
  readonly originalInitShape: CharacterControllerConstructionPluginV1["initShape"];
  readonly originalInitBody: CharacterControllerConstructionPluginV1["initBody"];
  readonly originalSetMassProperties:
    CharacterControllerConstructionPluginV1["setMassProperties"];
  readonly originalSetShape: CharacterControllerConstructionPluginV1["setShape"];
  readonly originalCollectorCreate:
    CharacterControllerConstructionPluginV1["_hknp"]["HP_QueryCollector_Create"];
  readonly originalAddTransformNode: Scene["addTransformNode"];
}

const characterControllerConstructionTrackers = new WeakMap<
  CharacterControllerConstructionPluginV1,
  CharacterControllerConstructionTrackerV1
>();

function activeConstructionAttempt(
  tracker: CharacterControllerConstructionTrackerV1,
): CharacterControllerConstructionAttemptV1 | undefined {
  return tracker.stack[tracker.stack.length - 1];
}

function invokeTrackedProviderSurface<T>(
  attempt: CharacterControllerConstructionAttemptV1 | undefined,
  invoke: () => T,
): T {
  if (attempt === undefined) return invoke();
  attempt.providerCallbackDepth += 1;
  try {
    return invoke();
  } finally {
    attempt.providerCallbackDepth -= 1;
  }
}

function installCharacterControllerConstructionTracker(
  scene: Scene,
  engine: CharacterControllerConstructionEngineV1,
  plugin: CharacterControllerConstructionPluginV1,
): CharacterControllerConstructionTrackerV1 {
  const existing = characterControllerConstructionTrackers.get(plugin);
  if (existing !== undefined) {
    if (existing.scene !== scene || existing.engine !== engine) {
      invalid("one native Physics plugin cannot construct Character Bodies for two Scenes at once.");
    }
    return existing;
  }
  const query = plugin._hknp;
  const tracker: CharacterControllerConstructionTrackerV1 = {
    scene,
    engine,
    plugin,
    query,
    stack: [],
    originalInitShape: plugin.initShape,
    originalInitBody: plugin.initBody,
    originalSetMassProperties: plugin.setMassProperties,
    originalSetShape: plugin.setShape,
    originalCollectorCreate: query.HP_QueryCollector_Create,
    originalAddTransformNode: scene.addTransformNode,
  };
  const restoreAfterInstallFailure = (): void => {
    try {
      plugin.initShape = tracker.originalInitShape;
    } catch {
      // Best effort; preserve the installation error.
    }
    try {
      plugin.initBody = tracker.originalInitBody;
    } catch {
      // Best effort; preserve the installation error.
    }
    try {
      plugin.setMassProperties = tracker.originalSetMassProperties;
    } catch {
      // Best effort; preserve the installation error.
    }
    try {
      plugin.setShape = tracker.originalSetShape;
    } catch {
      // Best effort; preserve the installation error.
    }
    try {
      query.HP_QueryCollector_Create = tracker.originalCollectorCreate;
    } catch {
      // Best effort; preserve the installation error.
    }
    try {
      scene.addTransformNode = tracker.originalAddTransformNode;
    } catch {
      // Best effort; preserve the installation error.
    }
  };
  try {
    plugin.initShape = function (this: CharacterControllerConstructionPluginV1, ...args) {
      const attempt = activeConstructionAttempt(tracker);
      const attributable = attempt !== undefined &&
        attempt.providerCallbackDepth === 0 && attempt.phase === "shape";
      if (attributable && args[0] !== undefined) {
        attempt.shapes.add(args[0] as PhysicsShape);
      }
      const result = invokeTrackedProviderSurface(
        attempt,
        () => tracker.originalInitShape.apply(this, args),
      );
      if (attributable) attempt.phase = "node";
      return result;
    };
    scene.addTransformNode = function (this: Scene, node: TransformNode): void {
      const attempt = activeConstructionAttempt(tracker);
      const attributable = attempt !== undefined &&
        attempt.providerCallbackDepth === 0 && attempt.phase === "node" &&
        node.name === "CCTransformNode";
      if (attributable) attempt.nodes.add(node);
      invokeTrackedProviderSurface(
        attempt,
        () => tracker.originalAddTransformNode.call(this, node),
      );
      if (attributable) attempt.phase = "body";
    };
    plugin.initBody = function (this: CharacterControllerConstructionPluginV1, ...args) {
      const attempt = activeConstructionAttempt(tracker);
      const attributable = attempt !== undefined &&
        attempt.providerCallbackDepth === 0 && attempt.phase === "body";
      if (attributable && args[0] !== undefined) {
        attempt.bodies.add(args[0] as PhysicsBody);
      }
      const result = invokeTrackedProviderSurface(
        attempt,
        () => tracker.originalInitBody.apply(this, args),
      );
      if (attributable) attempt.phase = "mass";
      return result;
    };
    plugin.setMassProperties = function (
      this: CharacterControllerConstructionPluginV1,
      ...args
    ) {
      const attempt = activeConstructionAttempt(tracker);
      const attributable = attempt !== undefined &&
        attempt.providerCallbackDepth === 0 && attempt.phase === "mass" &&
        attempt.bodies.has(args[0] as PhysicsBody);
      const result = invokeTrackedProviderSurface(
        attempt,
        () => tracker.originalSetMassProperties.apply(this, args),
      );
      if (attributable) attempt.phase = "attach-shape";
      return result;
    };
    plugin.setShape = function (this: CharacterControllerConstructionPluginV1, ...args) {
      const attempt = activeConstructionAttempt(tracker);
      const attributable = attempt !== undefined &&
        attempt.providerCallbackDepth === 0 && attempt.phase === "attach-shape" &&
        attempt.bodies.has(args[0] as PhysicsBody) &&
        attempt.shapes.has(args[1] as PhysicsShape);
      const result = invokeTrackedProviderSurface(
        attempt,
        () => tracker.originalSetShape.apply(this, args),
      );
      if (attributable) attempt.phase = "collectors";
      return result;
    };
    query.HP_QueryCollector_Create = function (...args) {
      const attempt = activeConstructionAttempt(tracker);
      const attributable = attempt !== undefined &&
        attempt.providerCallbackDepth === 0 && attempt.phase === "collectors" &&
        attempt.collectors.length < 2;
      const result = invokeTrackedProviderSurface(
        attempt,
        () => tracker.originalCollectorCreate.apply(query, args),
      );
      if (attributable && Array.isArray(result) && result.length >= 2) {
        attempt.collectors.push(result[1]);
        if (attempt.collectors.length === 2) attempt.phase = "complete";
      }
      return result;
    };
    characterControllerConstructionTrackers.set(plugin, tracker);
    return tracker;
  } catch (error) {
    restoreAfterInstallFailure();
    throw error;
  }
}

function restoreCharacterControllerConstructionTracker(
  tracker: CharacterControllerConstructionTrackerV1,
): unknown {
  let primary: unknown;
  const restore = (action: () => void): void => {
    try {
      action();
    } catch (error) {
      primary ??= error;
    }
  };
  restore(() => {
    tracker.plugin.initShape = tracker.originalInitShape;
  });
  restore(() => {
    tracker.plugin.initBody = tracker.originalInitBody;
  });
  restore(() => {
    tracker.plugin.setMassProperties = tracker.originalSetMassProperties;
  });
  restore(() => {
    tracker.plugin.setShape = tracker.originalSetShape;
  });
  restore(() => {
    tracker.query.HP_QueryCollector_Create = tracker.originalCollectorCreate;
  });
  restore(() => {
    tracker.scene.addTransformNode = tracker.originalAddTransformNode;
  });
  characterControllerConstructionTrackers.delete(tracker.plugin);
  return primary;
}

function cleanFailedCharacterControllerAttempt(
  tracker: CharacterControllerConstructionTrackerV1,
  attempt: CharacterControllerConstructionAttemptV1,
): void {
  const cleanup = (action: () => void): void => {
    try {
      action();
    } catch {
      // Attempt cleanup is best effort and never replaces the primary error.
    }
  };
  for (const body of attempt.bodies) {
    if (tracker.engine.getBodies().includes(body)) {
      let bodyDisposed = false;
      try {
        body.dispose();
        bodyDisposed = true;
      } catch {
        // Fall through to granular cleanup for this exact body only.
      }
      if (bodyDisposed) continue;
      cleanup(() => tracker.engine.removeBody(body));
    }
    cleanup(() => tracker.plugin.removeBody(body));
    cleanup(() => tracker.plugin.disposeBody(body));
  }
  for (const node of attempt.nodes) cleanup(() => node.dispose());
  for (const handle of attempt.collectors) {
    cleanup(() => tracker.query.HP_QueryCollector_Release(handle));
  }
  for (const shape of attempt.shapes) cleanup(() => shape.dispose());
}

function constructGroundAwareControllerExceptionSafe(
  allocation: BabylonCharacterBodyNativeAllocationV1,
) {
  const scene = allocation.scene;
  const engine = scene.getPhysicsEngine() as unknown as
    CharacterControllerConstructionEngineV1;
  const plugin = engine.getPhysicsPlugin() as CharacterControllerConstructionPluginV1;
  const tracker = installCharacterControllerConstructionTracker(scene, engine, plugin);
  const attempt: CharacterControllerConstructionAttemptV1 = {
    shapes: new Set(),
    nodes: new Set(),
    bodies: new Set(),
    collectors: [],
    phase: "shape",
    providerCallbackDepth: 0,
  };
  tracker.stack.push(attempt);
  let controller: ReturnType<typeof createGroundAwareControllerInternal> | undefined;
  let primary: unknown;
  try {
    controller = createGroundAwareControllerInternal(
      new Vector3(...allocation.initialPositionMetersXYZ),
      {
        capsuleHeight: allocation.capsule.heightMeters,
        capsuleRadius: allocation.capsule.radiusMeters,
      },
      scene,
    );
  } catch (error) {
    primary = error;
  } finally {
    const popped = tracker.stack.pop();
    if (popped !== attempt) {
      primary ??= new Error(
        "3C_INPUT_INVALID: Character Body construction ownership stack was corrupted.",
      );
    }
    if (tracker.stack.length === 0) {
      const restoreError = restoreCharacterControllerConstructionTracker(tracker);
      primary ??= restoreError;
    }
  }
  if (primary === undefined && controller !== undefined &&
    attempt.phase === "complete" && attempt.shapes.size === 1 &&
    attempt.nodes.size === 1 && attempt.bodies.size === 1 &&
    attempt.collectors.length === 2) {
    return controller;
  }
  if (primary === undefined) {
    primary = new Error(
      "3C_INPUT_INVALID: locked Character Body construction surface was incomplete.",
    );
  }
  if (controller !== undefined) {
    try {
      controller.dispose();
    } catch {
      // Preserve the primary compatibility failure.
    }
  } else {
    cleanFailedCharacterControllerAttempt(tracker, attempt);
  }
  throw primary;
}

function productionDriverFactory(
  allocation: BabylonCharacterBodyNativeAllocationV1,
): BabylonCharacterBodyNativeDriverV1 {
  const controller = constructGroundAwareControllerExceptionSafe(allocation);
  return new BabylonPhysicsCharacterControllerDriverV1(controller);
}

interface BodyTokenOwnerV1 {
  readonly portId: symbol;
  readonly generation: number;
}

interface BodyTokenRecordV1 {
  readonly generation: number;
  readonly serial: number;
  readonly tick: number;
  status: "begun" | "resolved" | "committed";
}

interface BodyTransactionV1 {
  readonly token: MovementTickTokenV1;
  readonly tick: number;
  readonly serial: number;
  readonly sample: BodySampleV1;
  readonly nativeSupport: BabylonCharacterBodyNativeSupportV1;
  readonly beginSupportContacts:
    readonly BabylonCharacterBodyNativeContactV1[];
  readonly beginCheckpoint: unknown;
  readonly upwardSupportDepartureActive: boolean;
}

const tokenOwners = new WeakMap<object, BodyTokenOwnerV1>();

class BabylonCharacterBodyPortV1
  implements BabylonCharacterBodyRuntimePortV1 {
  private readonly portId = Symbol("BabylonCharacterBodyPortV1");
  private readonly tokenRecords = new WeakMap<object, BodyTokenRecordV1>();
  private readonly beginAttempts = new WeakMap<
    object,
    Readonly<{ generation: number; epoch: number }>
  >();
  private generation = 0;
  private serial = 0;
  private beginAttemptEpoch = 0;
  private transaction: BodyTransactionV1 | undefined;
  private retainedSupportSample: CharacterSupportProjectionSampleV1 | undefined;
  private stagedRetainedSupportSample:
    CharacterSupportProjectionSampleV1 | undefined;
  private latestCommittedSupportEvidence:
    | BabylonCharacterBodyCommittedSupportEvidenceV1
    | undefined;
  private upwardSupportDepartureActive = false;
  private disposed = false;

  constructor(
    private readonly options: BabylonCharacterBodyPortOptionsV1,
    private readonly configuration: BabylonCharacterBodyNativeConfigurationV1,
    private readonly driver: BabylonCharacterBodyNativeDriverV1,
  ) {}

  get physicsBody(): PhysicsBody {
    this.assertLive();
    const body = this.driver.getPhysicsBody?.();
    if (body === undefined) {
      throw new Error(
        "WORLDKIT_CHARACTER_PHYSICS_BODY_UNAVAILABLE: Native Body adapter did not expose its owned body.",
      );
    }
    return body;
  }

  beginTick(request: BodyBeginTickRequestV1): BodySampleV1 {
    this.assertLive();
    const value = record(request) ?? invalid("Body begin request must be a plain record.");
    if (!exact(value, ["token", "tick"]) ||
      !isMovementTickTokenV1(value.token) || !safeTick(value.tick)) {
      invalid("Body begin request is malformed.");
    }
    const token = value.token;
    this.claimToken(token);
    const priorAttempt = this.beginAttempts.get(token);
    if (priorAttempt === undefined || priorAttempt.generation !== this.generation) {
      this.beginAttemptEpoch += 1;
      this.beginAttempts.set(token, Object.freeze({
        generation: this.generation,
        epoch: this.beginAttemptEpoch,
      }));
    } else if (priorAttempt.epoch < this.beginAttemptEpoch) {
      stale("Body Tick token was superseded by a newer begin attempt.");
    }
    const known = this.tokenRecords.get(token);
    if (known !== undefined && known.generation === this.generation) {
      if (known.serial < this.serial) stale("Body Tick token is no longer current.");
      throw new Error(
        "3C_SUPPORT_SAMPLE_DUPLICATE: support was already sampled for this Body Tick.",
      );
    }
    if (this.transaction !== undefined) {
      const activeRecord = this.tokenRecords.get(this.transaction.token);
      if (activeRecord?.generation === this.generation &&
        activeRecord.status === "resolved") {
        activeRecord.status = "committed";
        this.retainedSupportSample = this.stagedRetainedSupportSample;
        this.stagedRetainedSupportSample = undefined;
        this.publishCommittedSupportEvidence(this.transaction);
        this.transaction = undefined;
      }
    }
    if (this.transaction !== undefined) {
      throw new Error(
        "3C_SUPPORT_SAMPLE_DUPLICATE: the previous Body Tick is still active.",
      );
    }
    const checkpoint = this.driver.captureState();
    try {
      const position = parseVec3(this.driver.getPositionMetersXYZ());
      const velocity = parseVec3(
        this.driver.getLinearVelocityMetersPerSecondXYZ(),
      );
      const nativeSupport = this.querySupport();
      const contacts = parseNativeContacts(this.driver.readCurrentContacts());
      const supportProjection = this.projectBeginSupport(
        position,
        velocity,
        nativeSupport,
        contacts,
      );
      const sample = parseBodySampleV1({
        schemaVersion: 1,
        token,
        tick: value.tick,
        positionMetersXYZ: position,
        linearVelocityMetersPerSecondXYZ: velocity,
        support: supportProjection.support,
      });
      const serial = this.serial + 1;
      this.serial = serial;
      this.tokenRecords.set(token, {
        generation: this.generation,
        serial,
        tick: value.tick,
        status: "begun",
      });
      this.transaction = Object.freeze({
        token,
        tick: value.tick,
        serial,
        sample,
        nativeSupport,
        beginSupportContacts: supportProjection.contacts,
        beginCheckpoint: checkpoint,
        upwardSupportDepartureActive: this.upwardSupportDepartureActive,
      });
      return sample;
    } catch (error) {
      this.restorePreservingPrimary(checkpoint);
      throw error;
    }
  }

  resolve(request: { readonly token: MovementTickTokenV1; readonly proposal: MovementProposalV1 }): BodyResolutionV1 {
    this.assertLive();
    const value = record(request) ?? invalid("Body resolve request must be a plain record.");
    if (!exact(value, ["token", "proposal"]) ||
      !isMovementTickTokenV1(value.token)) invalid("Body resolve request is malformed.");
    const token = value.token;
    this.assertOwnedToken(token);
    const known = this.tokenRecords.get(token);
    if (known === undefined || known.generation !== this.generation ||
      known.serial < this.serial) stale("Body Tick token is stale.");
    if (known.status === "resolved") {
      throw new Error(
        "3C_BODY_RESOLUTION_DUPLICATE: Body resolution already completed for this Tick.",
      );
    }
    const transaction = this.transaction;
    if (transaction === undefined || transaction.token !== token ||
      transaction.serial !== known.serial) stale("Body Tick is not active.");
    let proposal: MovementProposalV1;
    try {
      proposal = parseMovementProposalV1(value.proposal);
    } catch {
      return invalid("Movement proposal is invalid.");
    }
    assertMovementTickTokenIdentityV1(token, proposal.token);
    if (proposal.tick !== transaction.tick || proposal.tick !== known.tick) {
      stale("Movement proposal Tick does not match the Body Tick.");
    }
    const delta = proposal.translationDeltaMetersXYZ;
    const driverVelocity = freezeVec3(delta.map((component) =>
      checkedDivide(component, this.configuration.fixedDeltaSeconds)
    ));
    const integrateRequest = Object.freeze({
      fixedDeltaSeconds: this.configuration.fixedDeltaSeconds,
      translationDeltaMetersXYZ: delta,
      driverVelocityMetersPerSecondXYZ: driverVelocity,
      supportBeforeIntegrate: transaction.nativeSupport,
    });
    const checkpoint = this.driver.captureState();
    const integrateRollbackExternallySafe =
      this.driver.isIntegrateRollbackExternallySafe() === true;
    try {
      const integrateResult = this.driver.integrateExactTranslation(integrateRequest);
      const position = parseVec3(this.driver.getPositionMetersXYZ());
      const nativeVelocity = parseVec3(
        this.driver.getLinearVelocityMetersPerSecondXYZ(),
      );
      const contacts = parseNativeContacts(this.driver.readCurrentContacts());
      const appliedTranslation = freezeVec3(position.map((component, axis) =>
        checkedSubtract(component, transaction.sample.positionMetersXYZ[axis]!)
      ));
      assertProposalWasNotAmplified(
        appliedTranslation,
        delta,
        this.configuration.gravityDirectionXYZ,
        transaction.nativeSupport,
        this.configuration.fixedDeltaSeconds,
        this.options.controller.maxStepHeightMeters,
        this.configuration.maxSlopeCosine,
        this.options.controller.keepDistanceMeters +
          this.options.controller.keepContactToleranceMeters,
        integrateResult.maximumSolverCorrectionMeters,
        contacts,
      );
      const translationDifference = Math.max(...delta.map((component, axis) =>
        Math.abs(component - appliedTranslation[axis]!)
      ));
      if (!finite(translationDifference)) invalid("translation difference is invalid.");
      const post = this.projectPostContacts(
        proposal,
        position,
        contacts,
      );
      const velocity = this.projectPersistentVelocity(
        proposal,
        driverVelocity,
        nativeVelocity,
        contacts,
      );
      assertContactConeCoherent(
        velocity,
        contacts,
        this.options.controller.keepContactToleranceMeters,
      );
      if (velocity.some((component, axis) =>
        Math.abs(component - nativeVelocity[axis]!) >
          BODY_RESOLUTION_COHERENCE_TOLERANCE_METERS_V1
      )) {
        this.driver.setLinearVelocityMetersPerSecondXYZ(velocity);
        const persistedVelocity = parseVec3(
          this.driver.getLinearVelocityMetersPerSecondXYZ(),
        );
        if (persistedVelocity.some((component, axis) =>
          Math.abs(component - velocity[axis]!) >
            BODY_RESOLUTION_COHERENCE_TOLERANCE_METERS_V1
        )) invalid("native controller did not persist semantic post-resolve velocity.");
      }
      const resolution = parseBodyResolutionV1({
        schemaVersion: 1,
        token,
        tick: transaction.tick,
        positionMetersXYZ: position,
        appliedTranslationMetersXYZ: appliedTranslation,
        linearVelocityMetersPerSecondXYZ: velocity,
        support: post.support,
        hasCeilingContact: post.hasCeilingContact,
        isTranslationLimited:
          translationDifference > BODY_RESOLUTION_COHERENCE_TOLERANCE_METERS_V1,
      });
      this.stagedRetainedSupportSample = this.projectRetainedSupportSample(
        resolution.support,
        resolution.positionMetersXYZ,
        contacts,
      );
      for (let axis = 0; axis < 3; axis += 1) {
        const coherent = transaction.sample.positionMetersXYZ[axis]! +
          resolution.appliedTranslationMetersXYZ[axis]!;
        if (Math.abs(resolution.positionMetersXYZ[axis]! - coherent) >
          BODY_RESOLUTION_COHERENCE_TOLERANCE_METERS_V1) {
          invalid("Body resolution position is incoherent.");
        }
      }
      known.status = "resolved";
      this.upwardSupportDepartureActive = proposalLeavesSupportUpward(
        proposal,
        freezeVec3(
          this.configuration.gravityDirectionXYZ.map((value) =>
            value === 0 ? 0 : -value
          ),
        ),
      );
      return resolution;
    } catch (error) {
      this.stagedRetainedSupportSample = undefined;
      this.upwardSupportDepartureActive = transaction.upwardSupportDepartureActive;
      this.restorePreservingPrimary(checkpoint);
      if (!integrateRollbackExternallySafe && !this.disposed) {
        try {
          this.dispose();
        } catch {
          // Preserve the primary integrate/observation failure.
        }
      }
      throw error;
    }
  }

  commitTick(token: MovementTickTokenV1): void {
    this.assertLive();
    this.assertOwnedToken(token);
    const known = this.tokenRecords.get(token);
    if (known === undefined || known.generation !== this.generation ||
      known.serial < this.serial) stale("Body Tick token is stale.");
    if (known.status === "committed") {
      throw new Error(
        "3C_BODY_RESOLUTION_DUPLICATE: Body Tick was already committed.",
      );
    }
    const transaction = this.transaction;
    if (known.status !== "resolved" || transaction === undefined ||
      transaction.token !== token || transaction.serial !== known.serial) {
      stale("Body Tick has no resolved native state to commit.");
    }
    known.status = "committed";
    this.retainedSupportSample = this.stagedRetainedSupportSample;
    this.stagedRetainedSupportSample = undefined;
    this.publishCommittedSupportEvidence(transaction);
    this.transaction = undefined;
  }

  readCommittedSupportEvidence():
    | BabylonCharacterBodyCommittedSupportEvidenceV1
    | undefined {
    this.assertLive();
    return this.latestCommittedSupportEvidence;
  }

  abortTick(token: MovementTickTokenV1): void {
    this.assertLive();
    this.assertOwnedToken(token);
    const known = this.tokenRecords.get(token);
    if (known === undefined || known.generation !== this.generation ||
      known.serial < this.serial) stale("Body Tick token is stale.");
    if (known.status === "committed") {
      throw new Error(
        "3C_BODY_RESOLUTION_DUPLICATE: committed Body Tick cannot be aborted.",
      );
    }
    const transaction = this.transaction;
    if (transaction === undefined || transaction.token !== token ||
      transaction.serial !== known.serial) stale("Body Tick is not active.");
    try {
      this.driver.restoreState(transaction.beginCheckpoint);
      parseVec3(this.driver.getPositionMetersXYZ());
      parseVec3(this.driver.getLinearVelocityMetersPerSecondXYZ());
      this.upwardSupportDepartureActive = transaction.upwardSupportDepartureActive;
    } catch (error) {
      try {
        this.dispose();
      } catch {
        // Preserve the rollback failure.
      }
      throw error;
    }
    this.generation += 1;
    this.serial += 1;
    this.stagedRetainedSupportSample = undefined;
    this.transaction = undefined;
  }

  reset(): void {
    this.resetToState(this.options.resetState);
  }

  resetToState(input: Readonly<{
    positionMetersXYZ: MovementVec3V1;
    linearVelocityMetersPerSecondXYZ: MovementVec3V1;
  }>): void {
    this.assertLive();
    const positionInput = parseVec3(input.positionMetersXYZ);
    const velocityInput = parseVec3(input.linearVelocityMetersPerSecondXYZ);
    const checkpoint = this.driver.captureState();
    let nextRetainedSupportSample: CharacterSupportProjectionSampleV1;
    try {
      this.driver.setPositionMetersXYZ(positionInput);
      this.driver.setLinearVelocityMetersPerSecondXYZ(velocityInput);
      this.driver.synchronizeAfterTeleport?.();
      const position = parseVec3(this.driver.getPositionMetersXYZ());
      const velocity = parseVec3(
        this.driver.getLinearVelocityMetersPerSecondXYZ(),
      );
      if (position.some((component, axis) =>
        Math.abs(component - positionInput[axis]!) >
          BODY_RESOLUTION_COHERENCE_TOLERANCE_METERS_V1
      ) || velocity.some((component, axis) =>
        Math.abs(component - velocityInput[axis]!) >
          BODY_RESOLUTION_COHERENCE_TOLERANCE_METERS_V1
      )) invalid("native reset did not restore the requested physical snapshot.");
      const nativeSupport = this.querySupport();
      const contacts = parseNativeContacts(this.driver.readCurrentContacts());
      const support = this.projectBeginSupport(
        position,
        velocity,
        nativeSupport,
        contacts,
      );
      nextRetainedSupportSample = this.projectRetainedSupportSample(
        support.support,
        position,
        contacts,
      );
    } catch (error) {
      this.restorePreservingPrimary(checkpoint);
      throw error;
    }
    this.generation += 1;
    this.serial += 1;
    this.transaction = undefined;
    this.retainedSupportSample = nextRetainedSupportSample;
    this.stagedRetainedSupportSample = undefined;
    this.upwardSupportDepartureActive = false;
    this.latestCommittedSupportEvidence = undefined;
  }

  retainedCharacterSupportSample():
    CharacterSupportProjectionSampleV1 | undefined {
    this.assertLive();
    return this.retainedSupportSample;
  }

  readSupportProjectionLock(): BabylonCharacterBodySupportProjectionLockV1 {
    this.assertLive();
    return Object.freeze({
      capsuleRadiusMeters: this.options.capsule.radiusMeters,
      capsuleHeightMeters: this.options.capsule.heightMeters,
      footOffsetMeters: this.options.capsule.heightMeters / 2,
      keepDistanceMeters: this.options.controller.keepDistanceMeters,
      keepContactToleranceMeters:
        this.options.controller.keepContactToleranceMeters,
      maxSlopeCosine: this.configuration.maxSlopeCosine,
      maxStepHeightMeters: this.options.controller.maxStepHeightMeters,
    });
  }

  collisionFilterMasks(): Readonly<{
    membershipMask: number;
    collideMask: number;
  }> {
    const shape = this.physicsBody.shape;
    if (shape === null) {
      throw new Error(
        "WORLDKIT_CHARACTER_PHYSICS_SHAPE_UNAVAILABLE: Golden Body has no collision Shape.",
      );
    }
    return Object.freeze({
      membershipMask: shape.filterMembershipMask,
      collideMask: shape.filterCollideMask,
    });
  }

  setCollisionFilterMasks(membershipMask: number, collideMask: number): void {
    if (!Number.isSafeInteger(membershipMask) ||
      !Number.isSafeInteger(collideMask)) {
      invalid("collision filter masks must be safe integers.");
    }
    const shape = this.physicsBody.shape;
    if (shape === null) {
      throw new Error(
        "WORLDKIT_CHARACTER_PHYSICS_SHAPE_UNAVAILABLE: Golden Body has no collision Shape.",
      );
    }
    const beforeMembershipMask = shape.filterMembershipMask;
    const beforeCollideMask = shape.filterCollideMask;
    try {
      shape.filterMembershipMask = membershipMask;
      shape.filterCollideMask = collideMask;
    } catch (error) {
      shape.filterMembershipMask = beforeMembershipMask;
      shape.filterCollideMask = beforeCollideMask;
      throw error;
    }
  }

  probeGroundPlacementAt(
    desiredControllerCenterMetersXYZ: MovementVec3V1,
    filterMembershipMask: number,
    filterCollideMask: number,
  ): MovementVec3V1 | undefined {
    this.assertLive();
    const desiredCenter = parseVec3(desiredControllerCenterMetersXYZ);
    const probe = createGroundAwareControllerInternal(
      new Vector3(...desiredCenter),
      {
        capsuleHeight: this.options.capsule.heightMeters,
        capsuleRadius: this.options.capsule.radiusMeters,
      },
      this.options.scene,
    );
    try {
      probe.keepDistance = this.options.controller.keepDistanceMeters;
      probe.keepContactTolerance =
        this.options.controller.keepContactToleranceMeters;
      probe.maxSlopeCosine = this.configuration.maxSlopeCosine;
      probe.maxStepHeight = this.options.controller.maxStepHeightMeters;
      probe.characterMass = this.options.controller.characterMassKilograms;
      probe.shape.filterMembershipMask = filterMembershipMask;
      probe.shape.filterCollideMask = filterCollideMask;
      const result = probe.probeGroundPlacementAt(
        new Vector3(...desiredCenter),
        new Vector3(...this.configuration.gravityDirectionXYZ),
      );
      return result === undefined
        ? undefined
        : freezeVec3([
            result.controllerCenter.x,
            result.controllerCenter.y,
            result.controllerCenter.z,
          ]);
    } finally {
      probe.dispose();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.serial += 1;
    this.transaction = undefined;
    this.retainedSupportSample = undefined;
    this.stagedRetainedSupportSample = undefined;
    this.latestCommittedSupportEvidence = undefined;
    this.driver.dispose();
  }

  private projectRetainedSupportSample(
    support: BodySampleV1["support"],
    controllerCenterMetersXYZ: MovementVec3V1,
    contacts: readonly BabylonCharacterBodyNativeContactV1[],
  ): CharacterSupportProjectionSampleV1 {
    const up = freezeVec3(
      this.configuration.gravityDirectionXYZ.map((value) =>
        value === 0 ? 0 : -value
      ),
    );
    const supportContactBandMeters =
      this.options.controller.keepDistanceMeters +
      this.options.controller.keepContactToleranceMeters;
    const sampledFootPositionMetersXYZ = addScaled(
      controllerCenterMetersXYZ,
      up,
      -this.options.capsule.heightMeters / 2,
    );
    const supportContacts = support.mode === "unsupported"
      ? []
      : contacts.filter((contact) =>
          contact.motionType === "static" &&
          contact.distanceMeters <= supportContactBandMeters &&
          Math.abs(
            (contact.pointMetersXYZ[0] - sampledFootPositionMetersXYZ[0]) *
                up[0] +
              (contact.pointMetersXYZ[1] - sampledFootPositionMetersXYZ[1]) *
                up[1] +
              (contact.pointMetersXYZ[2] - sampledFootPositionMetersXYZ[2]) *
                up[2],
          ) <= supportContactBandMeters &&
          dot(contact.normalXYZ, up) > 0.08
        ).map((contact) => Object.freeze({
          pointMetersXYZ: contact.pointMetersXYZ,
          normalXYZ: contact.normalXYZ,
          ...(contact.colliderSubshapeId === undefined
            ? {}
            : { colliderSubshapeId: contact.colliderSubshapeId }),
          ...(contact.traversalSurfaceId === undefined
            ? {}
            : { traversalSurfaceId: contact.traversalSurfaceId }),
          ...(contact.surfaceEntityId === undefined
            ? {}
            : { surfaceEntityId: contact.surfaceEntityId }),
        }));
    // #region agent log
    {
      const uniqueRawTs = [...new Set(contacts.flatMap((contact) =>
        contact.traversalSurfaceId === undefined ? [] : [contact.traversalSurfaceId]
      ))];
      const uniqueKeptTs = [...new Set(supportContacts.flatMap((contact) =>
        contact.traversalSurfaceId === undefined ? [] : [contact.traversalSurfaceId]
      ))];
      const tick = this.transaction?.tick ?? -1;
      if (
        r1bInStepUpCorridor(controllerCenterMetersXYZ) ||
        r1bInStepUpCorridor(sampledFootPositionMetersXYZ) ||
        r1bIsFailureTick(tick) ||
        uniqueRawTs.length > 1 ||
        uniqueKeptTs.length > 1
      ) {
        r1bSupportDebug(
          "F",
          "babylon-character-body-port.ts:projectRetainedSupportSample",
          "retained-manifold",
          {
            tick,
            supportMode: support.mode,
            supportNormal: support.mode === "unsupported" ? up : support.normalXYZ,
            isDynamic: support.mode === "unsupported" ? false : support.isDynamic,
            center: controllerCenterMetersXYZ,
            foot: sampledFootPositionMetersXYZ,
            band: supportContactBandMeters,
            rawCount: contacts.length,
            keptCount: supportContacts.length,
            uniqueRawTs,
            uniqueKeptTs,
            uniqueRawEnt: [...new Set(contacts.flatMap((contact) =>
              contact.surfaceEntityId === undefined ? [] : [contact.surfaceEntityId]
            ))],
            rawContacts: contacts.map((contact) => ({
              p: contact.pointMetersXYZ,
              n: contact.normalXYZ,
              d: contact.distanceMeters,
              motion: contact.motionType,
              sub: contact.colliderSubshapeId ?? null,
              ts: contact.traversalSurfaceId ?? null,
              ent: contact.surfaceEntityId ?? null,
              col: contact.colliderId ?? null,
            })),
            keptContacts: supportContacts.map((contact) => ({
              p: contact.pointMetersXYZ,
              n: contact.normalXYZ,
              sub: contact.colliderSubshapeId ?? null,
              ts: contact.traversalSurfaceId ?? null,
              ent: contact.surfaceEntityId ?? null,
            })),
          },
        );
      }
    }
    // #endregion
    return Object.freeze({
      supportState: support.mode,
      supportNormalWorldXYZ: support.mode === "unsupported"
        ? up
        : support.normalXYZ,
      sampledControllerCenterMetersXYZ: controllerCenterMetersXYZ,
      sampledFootPositionMetersXYZ,
      supportContacts: Object.freeze(supportContacts),
      isSupportSurfaceDynamic:
        support.mode === "unsupported" ? false : support.isDynamic,
    });
  }

  private querySupport(): BabylonCharacterBodyNativeSupportV1 {
    return parseNativeSupport(this.driver.checkSupport(
      this.configuration.fixedDeltaSeconds,
      this.configuration.gravityDirectionXYZ,
    ));
  }

  private projectBeginSupport(
    position: MovementVec3V1,
    velocity: MovementVec3V1,
    nativeSupport: BabylonCharacterBodyNativeSupportV1,
    contacts: readonly BabylonCharacterBodyNativeContactV1[],
  ): Readonly<{
    support: BodySampleV1["support"];
    contacts: readonly BabylonCharacterBodyNativeContactV1[];
  }> {
    const up = freezeVec3(
      this.configuration.gravityDirectionXYZ.map((value) => value === 0 ? 0 : -value),
    );
    if (
      this.upwardSupportDepartureActive &&
      dot(velocity, up) > 0
    ) {
      return Object.freeze({
        support: Object.freeze({ mode: "unsupported" }),
        contacts: Object.freeze([]),
      });
    }
    if (nativeSupport.mode === "unsupported") {
      return Object.freeze({
        support: Object.freeze({ mode: "unsupported" }),
        contacts: Object.freeze([]),
      });
    }
    const normal = normalized(
      nativeSupport.averageSurfaceNormalXYZ,
      "native support normal is invalid.",
    );
    const supportingContacts = contacts
      .filter((contact) =>
        dot(contact.normalXYZ, up) > 0.08 &&
        contact.distanceMeters <= this.options.controller.keepContactToleranceMeters
      );
    // #region agent log
    {
      const uniqueSupportingTs = [...new Set(supportingContacts.flatMap((contact) =>
        contact.traversalSurfaceId === undefined ? [] : [contact.traversalSurfaceId]
      ))];
      const tick = this.transaction?.tick ?? -1;
      if (
        r1bInStepUpCorridor(position) ||
        r1bIsFailureTick(tick) ||
        uniqueSupportingTs.length > 1
      ) {
        r1bSupportDebug(
          "C",
          "babylon-character-body-port.ts:projectBeginSupport",
          "begin-checkSupport-vs-contacts",
          {
            tick,
            nativeSupportMode: nativeSupport.mode,
            nativeSupportNormal: nativeSupport.averageSurfaceNormalXYZ,
            nativeIsDynamic: nativeSupport.isSurfaceDynamic,
            center: position,
            uniqueSupportingTs,
            uniqueSupportingEnt: [...new Set(supportingContacts.flatMap((contact) =>
              contact.surfaceEntityId === undefined ? [] : [contact.surfaceEntityId]
            ))],
            rawCount: contacts.length,
            supportingCount: supportingContacts.length,
            supportingContacts: supportingContacts.map((contact) => ({
              p: contact.pointMetersXYZ,
              n: contact.normalXYZ,
              d: contact.distanceMeters,
              motion: contact.motionType,
              sub: contact.colliderSubshapeId ?? null,
              ts: contact.traversalSurfaceId ?? null,
              ent: contact.surfaceEntityId ?? null,
              col: contact.colliderId ?? null,
            })),
          },
        );
      }
    }
    // #endregion
    const point = supportingContacts.length > 0
      ? averageVec3(supportingContacts.map((contact) => contact.pointMetersXYZ))
      : addScaled(position, up, -this.options.capsule.heightMeters / 2);
    return Object.freeze({
      support: Object.freeze({
        mode: nativeSupport.mode,
        pointMetersXYZ: point,
        normalXYZ: normal,
        isDynamic: nativeSupport.isSurfaceDynamic,
      }),
      contacts: Object.freeze([...supportingContacts]),
    });
  }

  private publishCommittedSupportEvidence(transaction: BodyTransactionV1): void {
    const up = freezeVec3(
      this.configuration.gravityDirectionXYZ.map((value) =>
        value === 0 ? 0 : -value
      ),
    );
    this.latestCommittedSupportEvidence = Object.freeze({
      schemaVersion: 1,
      tick: transaction.tick,
      sampledControllerCenterMetersXYZ: transaction.sample.positionMetersXYZ,
      sampledFootPointMetersXYZ: addScaled(
        transaction.sample.positionMetersXYZ,
        up,
        -this.options.capsule.heightMeters / 2,
      ),
      support: transaction.sample.support,
      contacts: transaction.beginSupportContacts,
    });
  }

  private projectPostContacts(
    proposal: MovementProposalV1,
    position: MovementVec3V1,
    contacts: readonly BabylonCharacterBodyNativeContactV1[],
  ): Pick<BodyResolutionV1, "support" | "hasCeilingContact"> {
    const up = freezeVec3(
      this.configuration.gravityDirectionXYZ.map((value) => value === 0 ? 0 : -value),
    );
    const inContact = contacts.filter((contact) =>
      contact.distanceMeters <= this.options.controller.keepContactToleranceMeters
    );
    const movingUp = proposalLeavesSupportUpward(proposal, up);
    const supporting = movingUp
      ? []
      : inContact.filter((contact) => dot(contact.normalXYZ, up) > 0.08);
    let support: BodyResolutionV1["support"] = Object.freeze({ mode: "unsupported" });
    if (supporting.length > 0) {
      const normal = normalized(
        averageVec3(supporting.map((contact) => contact.normalXYZ)),
        "post-resolution support normal is invalid.",
      );
      support = Object.freeze({
        mode: dot(normal, up) >= this.configuration.maxSlopeCosine
          ? "supported"
          : "sliding",
        pointMetersXYZ: averageVec3(
          supporting.map((contact) => contact.pointMetersXYZ),
        ),
        normalXYZ: normal,
        isDynamic: supporting.some((contact) => contact.motionType === "dynamic"),
      });
    }
    const proposedUpward = dot(proposal.translationDeltaMetersXYZ, up) >
      BODY_RESOLUTION_COHERENCE_TOLERANCE_METERS_V1;
    const hasCeilingContact = proposedUpward && inContact.some((contact) =>
      dot(contact.normalXYZ, up) <= -0.5
    );
    // Touch position to force finite projection at this boundary even when
    // the resolved support is unsupported.
    parseVec3(position);
    return Object.freeze({ support, hasCeilingContact });
  }

  private projectPersistentVelocity(
    proposal: MovementProposalV1,
    driverVelocity: MovementVec3V1,
    nativeVelocity: MovementVec3V1,
    contacts: readonly BabylonCharacterBodyNativeContactV1[],
  ): MovementVec3V1 {
    if (!proposal.layeredMoves.some((move) => move.kind === "root-motion")) {
      return projectVelocityAgainstContacts(
        nativeVelocity,
        contacts,
        this.options.controller.keepContactToleranceMeters,
      );
    }
    const projectedDriverVelocity = projectVelocityAgainstContacts(
      driverVelocity,
      contacts,
      this.options.controller.keepContactToleranceMeters,
    );
    const projectedSemanticVelocity = projectVelocityAgainstContacts(
      proposal.proposedLinearVelocityMetersPerSecondXYZ,
      contacts,
      this.options.controller.keepContactToleranceMeters,
    );
    const candidate = freezeVec3(projectedSemanticVelocity.map((component, axis) =>
      component + nativeVelocity[axis]! - projectedDriverVelocity[axis]!
    ));
    return projectVelocityAgainstContacts(
      candidate,
      contacts,
      this.options.controller.keepContactToleranceMeters,
    );
  }

  private claimToken(token: MovementTickTokenV1): void {
    const owner = tokenOwners.get(token);
    if (owner === undefined) {
      tokenOwners.set(token, { portId: this.portId, generation: this.generation });
      return;
    }
    if (owner.portId !== this.portId || owner.generation !== this.generation) {
      stale("Body Tick token belongs to another port or generation.");
    }
  }

  private assertOwnedToken(token: MovementTickTokenV1): void {
    const owner = tokenOwners.get(token);
    if (owner === undefined || owner.portId !== this.portId ||
      owner.generation !== this.generation) {
      stale("Body Tick token belongs to another port or generation.");
    }
  }

  private assertLive(): void {
    if (this.disposed) {
      throw new Error("3C_RUNTIME_DISPOSED: Character BodyPort is disposed.");
    }
  }

  private restorePreservingPrimary(checkpoint: unknown): void {
    try {
      this.driver.restoreState(checkpoint);
    } catch {
      // Retry is safe only after a complete rollback. Fail the port closed and
      // release its native allocation while preserving the primary failure.
      try {
        this.dispose();
      } catch {
        // Preserve the primary validation/integrate failure.
      }
    }
  }
}

type BabylonCharacterBodyNativeDriverFactoryV1 = (
  allocation: BabylonCharacterBodyNativeAllocationV1,
) => BabylonCharacterBodyNativeDriverV1;

function createBabylonCharacterBodyPortWithNativeDriverV1(
  input: BabylonCharacterBodyPortOptionsV1,
  nativeDriverFactory: BabylonCharacterBodyNativeDriverFactoryV1,
): BabylonCharacterBodyTransactionPortV1 {
  const options = parseOptions(input);
  const gravityDirection = normalized(
    options.gravityMetersPerSecondSquaredXYZ,
    "gravity must be nonzero.",
  );
  const allocation = Object.freeze({
    scene: options.scene,
    capsule: options.capsule,
    initialPositionMetersXYZ: options.resetState.positionMetersXYZ,
  });
  const configuration = Object.freeze({
    fixedDeltaSeconds: options.fixedDeltaSeconds,
    gravityMetersPerSecondSquaredXYZ: options.gravityMetersPerSecondSquaredXYZ,
    gravityDirectionXYZ: gravityDirection,
    maxSlopeCosine: Math.cos(
      options.controller.maxSlopeDegrees * Math.PI / 180,
    ),
    capsule: options.capsule,
    controller: options.controller,
    resetState: options.resetState,
  });
  let driver: BabylonCharacterBodyNativeDriverV1 | undefined;
  try {
    driver = nativeDriverFactory(allocation);
    driver.configure(configuration);
    parseVec3(driver.getPositionMetersXYZ());
    parseVec3(driver.getLinearVelocityMetersPerSecondXYZ());
    return new BabylonCharacterBodyPortV1(options, configuration, driver);
  } catch (error) {
    if (driver !== undefined) {
      try {
        driver.dispose();
      } catch {
        // Preserve the primary construction failure.
      }
    }
    throw error;
  }
}

export interface BabylonCharacterBodyRuntimePortV1
  extends BabylonCharacterBodyTransactionPortV1 {
  readonly physicsBody: PhysicsBody;
  retainedCharacterSupportSample():
    CharacterSupportProjectionSampleV1 | undefined;
  readSupportProjectionLock(): BabylonCharacterBodySupportProjectionLockV1;
  collisionFilterMasks(): Readonly<{
    membershipMask: number;
    collideMask: number;
  }>;
  setCollisionFilterMasks(membershipMask: number, collideMask: number): void;
  probeGroundPlacementAt(
    desiredControllerCenterMetersXYZ: MovementVec3V1,
    filterMembershipMask: number,
    filterCollideMask: number,
  ): MovementVec3V1 | undefined;
}

export function createBabylonCharacterBodyPortV1(
  input: BabylonCharacterBodyPortOptionsV1,
): BabylonCharacterBodyRuntimePortV1 {
  return createBabylonCharacterBodyPortWithNativeDriverV1(
    input,
    productionDriverFactory,
  ) as BabylonCharacterBodyRuntimePortV1;
}

/** @internal Used only by the adjacent testing-only relative module. */
export function createBabylonCharacterBodyPortForTestingInternalV1(
  input: BabylonCharacterBodyPortOptionsV1,
  nativeDriverFactory: BabylonCharacterBodyNativeDriverFactoryV1,
): BabylonCharacterBodyTransactionPortV1 {
  return createBabylonCharacterBodyPortWithNativeDriverV1(
    input,
    nativeDriverFactory,
  );
}
