import type { CameraGeometryHitV2 } from "./geometry-hit.js";

export type CameraHardDecollisionPhaseV1 =
  | "clear"
  | "constrained"
  | "recovering"
  | "emergency-inside";

export type CameraHardDecolliderVec3V1 = readonly [number, number, number];

export interface CameraHardDecolliderTransactionStateV1 {
  readonly phase: CameraHardDecollisionPhaseV1;
  readonly constrainedArmLengthMeters: number | undefined;
  readonly clearHoldRemainingSeconds: number;
  readonly stableHitEntityId: string | undefined;
  readonly stableHitNormalXYZ: CameraHardDecolliderVec3V1 | undefined;
  readonly lastSafePositionMetersXYZ: CameraHardDecolliderVec3V1 | undefined;
  readonly lastSafeTargetPositionMetersXYZ: CameraHardDecolliderVec3V1 | undefined;
  readonly authorityTick: number | undefined;
}

export interface CameraHardDecolliderSolveRequestV1 {
  readonly authorityTick: number;
  readonly desiredTargetPositionMetersXYZ: CameraHardDecolliderVec3V1;
  readonly desiredPositionMetersXYZ: CameraHardDecolliderVec3V1;
  readonly currentCommittedPositionMetersXYZ: CameraHardDecolliderVec3V1;
  readonly minimumUsableArmLengthMeters: number;
  readonly clearHoldSeconds: number;
  readonly recoveryHalfLifeSeconds: number;
  /** Explicit unlimited recovery keeps exponential damping without a speed cap. */
  readonly maximumRecoveryMetersPerSecond: number | "unlimited";
  readonly deltaSeconds: number;
  readonly geometryHit?: CameraGeometryHitV2;
  readonly preferCurrentEmergencyPosition?: boolean;
}

export interface CameraHardDecolliderSolveResultV1 {
  readonly positionMetersXYZ: CameraHardDecolliderVec3V1;
  readonly resolvedTargetPositionMetersXYZ: CameraHardDecolliderVec3V1;
  readonly safeArmLengthMeters: number;
  readonly effectiveArmLengthMeters: number;
  readonly isCollisionRetracted: boolean;
  readonly phase: CameraHardDecollisionPhaseV1;
  readonly stableHitEntityId?: string;
  readonly stableHitNormalXYZ?: CameraHardDecolliderVec3V1;
  readonly clearHoldRemainingSeconds: number;
}

const ARM_LENGTH_TOLERANCE_METERS_V1 = 1e-6;
const CONTACT_SWITCH_DISTANCE_METERS_V1 = 0.05;
const CONTACT_NORMAL_CLUSTER_COSINE_V1 = Math.cos((35 * Math.PI) / 180);
const OVERLAP_CLEARANCE_METERS_V1 = 0.001;

function freezeVec3(value: readonly number[]): CameraHardDecolliderVec3V1 {
  return Object.freeze([value[0]!, value[1]!, value[2]!]);
}

function finiteVec3(value: CameraHardDecolliderVec3V1): boolean {
  return value.length === 3 && value.every(Number.isFinite);
}

function subtract(
  left: CameraHardDecolliderVec3V1,
  right: CameraHardDecolliderVec3V1,
): [number, number, number] {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function length(value: readonly [number, number, number]): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function distance(
  left: CameraHardDecolliderVec3V1,
  right: CameraHardDecolliderVec3V1,
): number {
  return length(subtract(left, right));
}

function addScaled(
  position: CameraHardDecolliderVec3V1,
  direction: CameraHardDecolliderVec3V1,
  scale: number,
): CameraHardDecolliderVec3V1 {
  return freezeVec3([
    position[0] + direction[0] * scale,
    position[1] + direction[1] * scale,
    position[2] + direction[2] * scale,
  ]);
}

function positionAlongArm(
  target: CameraHardDecolliderVec3V1,
  desiredPosition: CameraHardDecolliderVec3V1,
  armLengthMeters: number,
): CameraHardDecolliderVec3V1 {
  const displacement = subtract(desiredPosition, target);
  const desiredArmLengthMeters = length(displacement);
  if (desiredArmLengthMeters <= ARM_LENGTH_TOLERANCE_METERS_V1) return freezeVec3(target);
  const scale = armLengthMeters / desiredArmLengthMeters;
  return freezeVec3([
    target[0] + displacement[0] * scale,
    target[1] + displacement[1] * scale,
    target[2] + displacement[2] * scale,
  ]);
}

function dot(
  left: CameraHardDecolliderVec3V1,
  right: CameraHardDecolliderVec3V1,
): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function recoverTowards(
  currentMeters: number,
  targetMeters: number,
  deltaSeconds: number,
  halfLifeSeconds: number,
  maximumMetersPerSecond: number | "unlimited",
): number {
  if (targetMeters <= currentMeters) return targetMeters;
  const safeDeltaSeconds = Math.max(0, deltaSeconds);
  if (safeDeltaSeconds === 0) return currentMeters;
  const exponentialDelta = halfLifeSeconds <= 0
    ? targetMeters - currentMeters
    : (targetMeters - currentMeters) *
      (1 - Math.pow(0.5, safeDeltaSeconds / halfLifeSeconds));
  const speedDelta = maximumMetersPerSecond === "unlimited"
    ? exponentialDelta
    : Math.max(0, maximumMetersPerSecond) * safeDeltaSeconds;
  return Math.min(targetMeters, currentMeters + Math.min(exponentialDelta, speedDelta));
}

function initialState(): CameraHardDecolliderTransactionStateV1 {
  return Object.freeze({
    phase: "clear",
    constrainedArmLengthMeters: undefined,
    clearHoldRemainingSeconds: 0,
    stableHitEntityId: undefined,
    stableHitNormalXYZ: undefined,
    lastSafePositionMetersXYZ: undefined,
    lastSafeTargetPositionMetersXYZ: undefined,
    authorityTick: undefined,
  });
}

function frozenState(
  value: CameraHardDecolliderTransactionStateV1,
): CameraHardDecolliderTransactionStateV1 {
  return Object.freeze({
    ...value,
    stableHitNormalXYZ: value.stableHitNormalXYZ === undefined
      ? undefined
      : freezeVec3(value.stableHitNormalXYZ),
    lastSafePositionMetersXYZ: value.lastSafePositionMetersXYZ === undefined
      ? undefined
      : freezeVec3(value.lastSafePositionMetersXYZ),
    lastSafeTargetPositionMetersXYZ: value.lastSafeTargetPositionMetersXYZ === undefined
      ? undefined
      : freezeVec3(value.lastSafeTargetPositionMetersXYZ),
  });
}

/** Provider-neutral hard collision and temporal recovery owner. */
export class CameraHardDecolliderV1 {
  private state: CameraHardDecolliderTransactionStateV1 = initialState();

  reset(): void {
    this.state = initialState();
  }

  captureTransactionState(): CameraHardDecolliderTransactionStateV1 {
    return frozenState(this.state);
  }

  restoreTransactionState(state: CameraHardDecolliderTransactionStateV1): void {
    this.state = frozenState(state);
  }

  solve(input: CameraHardDecolliderSolveRequestV1): CameraHardDecolliderSolveResultV1 {
    this.requireValidInput(input);
    const target = freezeVec3(input.desiredTargetPositionMetersXYZ);
    const desiredPosition = freezeVec3(input.desiredPositionMetersXYZ);
    const desiredArmLengthMeters = distance(target, desiredPosition);
    const previous = this.state;
    const hit = input.geometryHit;

    if (hit?.startedOverlapping === true) {
      const resolvedTarget = addScaled(
        target,
        hit.hitNormalXYZ,
        hit.penetrationDepthMeters + OVERLAP_CLEARANCE_METERS_V1,
      );
      const priorSafe = previous.lastSafePositionMetersXYZ;
      const priorSafeTarget = previous.lastSafeTargetPositionMetersXYZ;
      const rebasedPriorSafe = priorSafe !== undefined && priorSafeTarget !== undefined
        ? addScaled(priorSafe, subtract(target, priorSafeTarget), 1)
        : undefined;
      const current = freezeVec3(input.currentCommittedPositionMetersXYZ);
      const usable = (candidate: CameraHardDecolliderVec3V1 | undefined) =>
        candidate !== undefined &&
        distance(resolvedTarget, candidate) + ARM_LENGTH_TOLERANCE_METERS_V1 >=
          input.minimumUsableArmLengthMeters;
      const fallback = input.preferCurrentEmergencyPosition === true
        ? usable(current)
          ? current
          : usable(rebasedPriorSafe)
            ? rebasedPriorSafe
            : undefined
        : usable(rebasedPriorSafe)
          ? rebasedPriorSafe
          : usable(current)
            ? current
            : undefined;
      if (fallback === undefined) {
        throw new Error("CAMERA_HARD_DECOLLIDER_NO_SAFE_POSE");
      }
      const effectiveArmLengthMeters = distance(resolvedTarget, fallback);
      const next = frozenState({
        phase: "emergency-inside",
        constrainedArmLengthMeters: effectiveArmLengthMeters,
        clearHoldRemainingSeconds: input.clearHoldSeconds,
        stableHitEntityId: hit.hitEntityId,
        stableHitNormalXYZ: hit.hitNormalXYZ,
        lastSafePositionMetersXYZ: fallback,
        lastSafeTargetPositionMetersXYZ: target,
        authorityTick: input.authorityTick,
      });
      this.state = next;
      return this.result(
        fallback,
        resolvedTarget,
        0,
        effectiveArmLengthMeters,
        desiredArmLengthMeters,
        next,
      );
    }

    if (hit !== undefined) {
      const safeArmLengthMeters = Math.max(
        0,
        Math.min(desiredArmLengthMeters, hit.travelDistanceMeters),
      );
      const previousArmLengthMeters = previous.constrainedArmLengthMeters ??
        desiredArmLengthMeters;
      const effectiveArmLengthMeters = safeArmLengthMeters <= previousArmLengthMeters
        ? safeArmLengthMeters
        : recoverTowards(
            previousArmLengthMeters,
            safeArmLengthMeters,
            input.deltaSeconds,
            input.recoveryHalfLifeSeconds,
            input.maximumRecoveryMetersPerSecond,
          );
      const position = positionAlongArm(target, desiredPosition, effectiveArmLengthMeters);
      const normalMatchesCluster = previous.stableHitNormalXYZ !== undefined &&
        dot(previous.stableHitNormalXYZ, hit.hitNormalXYZ) >=
          CONTACT_NORMAL_CLUSTER_COSINE_V1;
      const contactMustSwitch = previous.stableHitEntityId === undefined ||
        previous.stableHitEntityId === hit.hitEntityId || normalMatchesCluster ||
        safeArmLengthMeters < previousArmLengthMeters -
          CONTACT_SWITCH_DISTANCE_METERS_V1;
      const next = frozenState({
        phase: "constrained",
        constrainedArmLengthMeters: effectiveArmLengthMeters,
        clearHoldRemainingSeconds: input.clearHoldSeconds,
        stableHitEntityId: contactMustSwitch
          ? hit.hitEntityId
          : previous.stableHitEntityId,
        stableHitNormalXYZ: contactMustSwitch
          ? hit.hitNormalXYZ
          : previous.stableHitNormalXYZ,
        lastSafePositionMetersXYZ: position,
        lastSafeTargetPositionMetersXYZ: target,
        authorityTick: input.authorityTick,
      });
      this.state = next;
      return this.result(
        position,
        target,
        safeArmLengthMeters,
        effectiveArmLengthMeters,
        desiredArmLengthMeters,
        next,
      );
    }

    const previousArmLengthMeters = previous.constrainedArmLengthMeters;
    if (previousArmLengthMeters === undefined ||
      previousArmLengthMeters >= desiredArmLengthMeters - ARM_LENGTH_TOLERANCE_METERS_V1) {
      const next = frozenState({
        phase: "clear",
        constrainedArmLengthMeters: desiredArmLengthMeters,
        clearHoldRemainingSeconds: 0,
        stableHitEntityId: undefined,
        stableHitNormalXYZ: undefined,
        lastSafePositionMetersXYZ: desiredPosition,
        lastSafeTargetPositionMetersXYZ: target,
        authorityTick: input.authorityTick,
      });
      this.state = next;
      return this.result(
        desiredPosition,
        target,
        desiredArmLengthMeters,
        desiredArmLengthMeters,
        desiredArmLengthMeters,
        next,
      );
    }

    const remainingHoldSeconds = Math.max(
      0,
      previous.clearHoldRemainingSeconds - Math.max(0, input.deltaSeconds),
    );
    const recoveryDeltaSeconds = Math.max(
      0,
      Math.max(0, input.deltaSeconds) - previous.clearHoldRemainingSeconds,
    );
    const effectiveArmLengthMeters = recoveryDeltaSeconds <= 0
      ? previousArmLengthMeters
      : recoverTowards(
          previousArmLengthMeters,
          desiredArmLengthMeters,
          recoveryDeltaSeconds,
          input.recoveryHalfLifeSeconds,
          input.maximumRecoveryMetersPerSecond,
        );
    const position = positionAlongArm(target, desiredPosition, effectiveArmLengthMeters);
    const isClear = effectiveArmLengthMeters >=
      desiredArmLengthMeters - ARM_LENGTH_TOLERANCE_METERS_V1;
    const next = frozenState({
      phase: isClear ? "clear" : "recovering",
      constrainedArmLengthMeters: effectiveArmLengthMeters,
      clearHoldRemainingSeconds: remainingHoldSeconds,
      stableHitEntityId: isClear ? undefined : previous.stableHitEntityId,
      stableHitNormalXYZ: isClear ? undefined : previous.stableHitNormalXYZ,
      lastSafePositionMetersXYZ: position,
      lastSafeTargetPositionMetersXYZ: target,
      authorityTick: input.authorityTick,
    });
    this.state = next;
    return this.result(
      position,
      target,
      desiredArmLengthMeters,
      effectiveArmLengthMeters,
      desiredArmLengthMeters,
      next,
    );
  }

  private result(
    positionMetersXYZ: CameraHardDecolliderVec3V1,
    resolvedTargetPositionMetersXYZ: CameraHardDecolliderVec3V1,
    safeArmLengthMeters: number,
    effectiveArmLengthMeters: number,
    desiredArmLengthMeters: number,
    state: CameraHardDecolliderTransactionStateV1,
  ): CameraHardDecolliderSolveResultV1 {
    return Object.freeze({
      positionMetersXYZ: freezeVec3(positionMetersXYZ),
      resolvedTargetPositionMetersXYZ: freezeVec3(resolvedTargetPositionMetersXYZ),
      safeArmLengthMeters,
      effectiveArmLengthMeters,
      isCollisionRetracted:
        effectiveArmLengthMeters < desiredArmLengthMeters - ARM_LENGTH_TOLERANCE_METERS_V1,
      phase: state.phase,
      ...(state.stableHitEntityId === undefined
        ? {}
        : { stableHitEntityId: state.stableHitEntityId }),
      ...(state.stableHitNormalXYZ === undefined
        ? {}
        : { stableHitNormalXYZ: freezeVec3(state.stableHitNormalXYZ) }),
      clearHoldRemainingSeconds: state.clearHoldRemainingSeconds,
    });
  }

  private requireValidInput(input: CameraHardDecolliderSolveRequestV1): void {
    if (!Number.isSafeInteger(input.authorityTick) || input.authorityTick < 0 ||
      !finiteVec3(input.desiredTargetPositionMetersXYZ) ||
      !finiteVec3(input.desiredPositionMetersXYZ) ||
      !finiteVec3(input.currentCommittedPositionMetersXYZ) ||
      ![
        input.minimumUsableArmLengthMeters,
        input.clearHoldSeconds,
        input.recoveryHalfLifeSeconds,
        input.deltaSeconds,
      ].every(Number.isFinite) || input.minimumUsableArmLengthMeters < 0 ||
      input.clearHoldSeconds < 0 || input.recoveryHalfLifeSeconds < 0 ||
      (input.maximumRecoveryMetersPerSecond !== "unlimited" &&
        (!Number.isFinite(input.maximumRecoveryMetersPerSecond) || input.maximumRecoveryMetersPerSecond < 0))) {
      throw new RangeError("CAMERA_HARD_DECOLLIDER_INPUT_INVALID");
    }
    if (input.preferCurrentEmergencyPosition !== undefined &&
      typeof input.preferCurrentEmergencyPosition !== "boolean") {
      throw new TypeError("CAMERA_HARD_DECOLLIDER_INPUT_INVALID");
    }
  }
}
