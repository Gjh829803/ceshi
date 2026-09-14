import { Euler, MathUtils, Quaternion, Vector3 } from "three";
import type {
  CameraAngleLimits,
  CameraKind,
  ResolvedCameraConfiguration,
} from "../../config/camera/index";
import { cameraPositionAnchor, subjectHeading } from "../subject";
import type {
  CameraIntent,
  CameraProposal,
  CameraStrategyInput,
  CameraStrategyResult,
} from "./types";

export function halfLifeAlpha(
  deltaSeconds: number,
  halfLifeSeconds: number,
): number {
  return halfLifeSeconds === 0
    ? 1
    : -Math.expm1((-Math.LN2 * deltaSeconds) / halfLifeSeconds);
}
export function orbitQuaternion(yaw: number, pitch: number): Quaternion {
  return new Quaternion().setFromEuler(new Euler(-pitch, yaw, 0, "YXZ"));
}
function limit(angle: number, limits: CameraAngleLimits): number {
  return limits.kind === "bounded"
    ? MathUtils.clamp(angle, limits.minimumRadians, limits.maximumRadians)
    : angle;
}
function wrap(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
/** Select an equivalent heading inside the interval, then follow its numeric path.
 * A bounded interval is not a wrapping circle: the shortest circular arc may exit it. */
function recenterYawTarget(
  current: number,
  heading: number,
  limits: CameraAngleLimits,
): number {
  const nearest = current + wrap(heading - current);
  if (limits.kind === "unbounded") return nearest;
  const turn = 2 * Math.PI;
  const minimumTurn = Math.ceil((limits.minimumRadians - heading) / turn);
  const maximumTurn = Math.floor((limits.maximumRadians - heading) / turn);
  if (minimumTurn <= maximumTurn) {
    const selectedTurn = MathUtils.clamp(
      Math.round((current - heading) / turn),
      minimumTurn,
      maximumTurn,
    );
    return heading + selectedTurn * turn;
  }
  return limit(nearest, limits);
}
function smooth(
  previous: number,
  target: number,
  dt: number,
  halfLife: number,
): number {
  return MathUtils.lerp(previous, target, halfLifeAlpha(dt, halfLife));
}

/** The only intent clock boundary: initialize, limit and recenter once before physics. */
export function prepareCameraIntent<K extends CameraKind>(
  input: Omit<CameraStrategyInput<K>, "intent"> & {
    readonly intent?: CameraIntent;
  },
): CameraIntent {
  const { subject, deltaSeconds: dt, opening, history } = input;
  if (!Number.isFinite(dt) || dt < 0) throw new Error("CAMERA_DELTA_INVALID");
  const configuration: ResolvedCameraConfiguration = input.configuration;
  const values = configuration.values;
  const preserving =
    configuration.kind === "third-person" &&
    configuration.values.framing.kind === "preserve-opening";
  if (preserving && !opening)
    throw new Error("CAMERA_OPENING_REFERENCE_REQUIRED");
  const measuredHeading = subjectHeading(subject);
  const heading = measuredHeading ?? history?.headingRadians ?? 0;
  const initialDistance = preserving
    ? opening!.distanceMeters
    : "zoom" in values
      ? values.position.distanceMeters
      : 0;
  const initialYaw = preserving
    ? opening!.yawRadians
    : values.orientation.referenceFrame === "subject-up"
      ? 0
      : heading;
  let intent: CameraIntent = input.intent ?? {
    yawRadians: initialYaw,
    pitchRadians: preserving
      ? opening!.pitchRadians
      : values.orientation.initialPitchRadians,
    distanceMeters: initialDistance,
    secondsSinceOrbit: 0,
  };
  if (
    !Object.values(intent).every(Number.isFinite) ||
    intent.secondsSinceOrbit < 0
  )
    throw new Error("CAMERA_INTENT_INVALID");
  const elapsed = intent.secondsSinceOrbit + dt;
  const recenter = values.orientation.recenter;
  let yaw = intent.yawRadians;
  let pitch = intent.pitchRadians;
  if (
    recenter.enabled &&
    measuredHeading !== undefined &&
    subject.speedMetersPerSecond >= recenter.minimumSpeedMetersPerSecond &&
    elapsed > recenter.delaySeconds
  ) {
    // Only integrate the part of this step after the delay expires.
    const recenterDelta = Math.min(dt, elapsed - recenter.delaySeconds);
    const targetYaw =
      values.orientation.referenceFrame === "subject-up" ? 0 : heading;
    yaw +=
      (recenterYawTarget(yaw, targetYaw, values.orientation.yawLimitsRadians) -
        yaw) *
      halfLifeAlpha(recenterDelta, recenter.yawHalfLifeSeconds);
    if (recenter.pitch)
      pitch = smooth(
        pitch,
        recenter.pitch.targetRadians,
        recenterDelta,
        recenter.pitch.halfLifeSeconds,
      );
  }
  yaw = limit(yaw, values.orientation.yawLimitsRadians);
  pitch = limit(pitch, values.orientation.pitchLimitsRadians);
  let distance =
    configuration.kind === "first-person"
      ? 0
      : Math.max(0, intent.distanceMeters);
  if ("zoom" in values && values.zoom.range.kind === "bounded")
    distance = MathUtils.clamp(
      distance,
      values.zoom.range.minimumDistanceMeters,
      values.zoom.range.maximumDistanceMeters,
    );
  intent = {
    yawRadians: yaw,
    pitchRadians: pitch,
    distanceMeters: distance,
    secondsSinceOrbit: elapsed,
  };
  return intent;
}

/** Pose/history evaluation consumes prepared intent and never advances its clock. */
export function evaluateStrategy<K extends CameraKind>(
  input: CameraStrategyInput<K>,
): CameraStrategyResult<K> {
  const { subject, deltaSeconds: dt, opening } = input;
  const configuration: ResolvedCameraConfiguration = input.configuration;
  if (!Number.isFinite(dt) || dt < 0) throw new Error("CAMERA_DELTA_INVALID");
  if (
    subject.id !== configuration.subjectId ||
    subject.generation !== configuration.subjectGeneration
  )
    throw new Error("CAMERA_SUBJECT_IDENTITY_MISMATCH");
  const values = configuration.values;
  const history = input.history;
  if (
    history &&
    (history.kind !== configuration.kind ||
      history.viewId !== configuration.viewId ||
      history.subjectId !== subject.id ||
      history.subjectGeneration !== subject.generation)
  )
    throw new Error("CAMERA_HISTORY_IDENTITY_MISMATCH");
  const preserving =
    configuration.kind === "third-person" &&
    configuration.values.framing.kind === "preserve-opening";
  if (preserving && (!opening || opening.viewId !== configuration.viewId))
    throw new Error("CAMERA_OPENING_REFERENCE_REQUIRED");
  const measuredHeading = subjectHeading(subject);
  const heading = measuredHeading ?? history?.headingRadians ?? 0;
  const reference =
    values.orientation.referenceFrame === "subject-up"
      ? new Quaternion(...(subject.semanticQuaternionWorldXYZW ?? [0, 0, 0, 1]))
      : new Quaternion();
  const intent = input.intent;
  const {
    yawRadians: yaw,
    pitchRadians: pitch,
    distanceMeters: distance,
  } = intent;
  if (!Object.values(intent).every(Number.isFinite))
    throw new Error("CAMERA_INTENT_INVALID");
  const origin = new Vector3(...subject.positionWorldMetersXYZ);
  const anchor = cameraPositionAnchor(subject, values.position, heading);
  const translation = history
    ? new Vector3(...history.translationWorldMetersXYZ).lerp(
        origin,
        halfLifeAlpha(dt, values.position.subjectTranslationHalfLifeSeconds),
      )
    : origin.clone();
  const relativeAnchor = anchor.clone().sub(origin);
  if (history)
    relativeAnchor.copy(
      new Vector3(...history.anchorRelativeMetersXYZ).lerp(
        relativeAnchor,
        halfLifeAlpha(dt, values.position.anchorHalfLifeSeconds),
      ),
    );
  const pivot = translation.clone().add(relativeAnchor);
  const zoom =
    "zoom" in values && history
      ? smooth(
          history.zoomDistanceMeters,
          distance,
          dt,
          values.zoom.halfLifeSeconds,
        )
      : distance;
  const fovEffect = values.effects.speedFov;
  const fovTarget = fovEffect.enabled
    ? MathUtils.clamp(
        subject.speedMetersPerSecond / fovEffect.fullEffectSpeedMetersPerSecond,
        0,
        1,
      ) * fovEffect.maximumOffsetDegrees
    : 0;
  const fov = history
    ? smooth(history.speedFovDegrees, fovTarget, dt, fovEffect.halfLifeSeconds)
    : fovTarget;
  let speedDistance = 0;
  if ("speedDistance" in values.effects) {
    const effect = values.effects.speedDistance;
    const target = effect.enabled
      ? MathUtils.clamp(
          subject.speedMetersPerSecond / effect.fullEffectSpeedMetersPerSecond,
          0,
          1,
        ) * effect.maximumOffsetMeters
      : 0;
    speedDistance = history
      ? smooth(
          history.speedDistanceMeters,
          target,
          dt,
          target > history.speedDistanceMeters
            ? effect.extendHalfLifeSeconds
            : effect.retractHalfLifeSeconds,
        )
      : target;
  }
  // Filter explicit orbit coordinates, never a Cartesian chord or an inferred
  // orientation branch. The controller supplies a continuous, unwrapped intent.
  const armHalfLife = values.position.armHalfLifeSeconds;
  const orbitYaw =
    history && configuration.kind !== "first-person"
      ? smooth(history.orbitYawRadians, yaw, dt, armHalfLife)
      : yaw;
  const orbitPitch =
    history && configuration.kind !== "first-person"
      ? smooth(history.orbitPitchRadians, pitch, dt, armHalfLife)
      : pitch;
  const radiusTarget =
    configuration.kind === "first-person" ? 0 : zoom + speedDistance;
  const orbitRadius = history
    ? smooth(history.orbitRadiusMeters, radiusTarget, dt, armHalfLife)
    : radiusTarget;
  const orientation = reference
    .clone()
    .multiply(orbitQuaternion(orbitYaw, orbitPitch));
  const arm = new Vector3(0, 0, orbitRadius).applyQuaternion(orientation);
  const nominalAim = orientation.toArray();
  if (preserving)
    orientation.multiply(new Quaternion(...opening!.framingQuaternionXYZW));
  const position = pivot.clone().add(arm);
  const lookAt =
    preserving ||
    configuration.kind === "first-person" ||
    arm.lengthSq() < 1e-12
      ? position.clone().add(new Vector3(0, 0, -1).applyQuaternion(orientation))
      : pivot;
  const visibility =
    configuration.kind === "first-person"
      ? "safety-only"
      : configuration.values.constraints.visibility;
  const proposal: CameraProposal = {
    positionWorldMetersXYZ: position.toArray(),
    quaternionWorldXYZW: orientation.toArray(),
    lookAtWorldMetersXYZ: lookAt.toArray(),
    upWorldXYZ: new Vector3(0, 1, 0).applyQuaternion(orientation).toArray(),
    pivotWorldMetersXYZ: pivot.toArray(),
    ...(configuration.kind !== "first-person" && orbitRadius > 1e-6 ? {composition: {
      referenceQuaternionWorldXYZW: reference.toArray(),
      nominalAimQuaternionWorldXYZW: nominalAim,
      relativeAimQuaternionXYZW: preserving ? opening!.framingQuaternionXYZW : new Quaternion().toArray(),
    }} : {}),
    lens: {
      ...values.lens,
      verticalFovDegrees: values.lens.verticalFovDegrees + fov,
    },
    visibility,
    ...(visibility !== "safety-only"
      ? { visibilityTargetWorldMetersXYZ: anchor.toArray() }
      : {}),
    nominalDistanceMeters: zoom + speedDistance,
  };
  if (
    ![
      ...position.toArray(),
      ...orientation.toArray(),
      ...Object.values(proposal.lens),
    ].every(Number.isFinite) ||
    proposal.lens.verticalFovDegrees <= 0 ||
    proposal.lens.verticalFovDegrees >= 180
  )
    throw new Error("CAMERA_PROPOSAL_INVALID");
  return {
    proposal,
    intent,
    history: {
      kind: configuration.kind as K,
      subjectId: subject.id,
      subjectGeneration: subject.generation,
      viewId: configuration.viewId,
      translationWorldMetersXYZ: translation.toArray(),
      anchorRelativeMetersXYZ: relativeAnchor.toArray(),
      orbitYawRadians: orbitYaw,
      orbitPitchRadians: orbitPitch,
      orbitRadiusMeters: orbitRadius,
      zoomDistanceMeters: zoom,
      speedDistanceMeters: speedDistance,
      speedFovDegrees: fov,
      headingRadians: heading,
      horizonQuaternionWorldXYZW: orientation.toArray(),
    },
  };
}
