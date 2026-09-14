import {cameraReferenceRotation,cameraSubjectHeading} from "./heading";
import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from "three";
import type {
  CameraAngleLimits,
  CameraKind,
  ResolvedCameraConfiguration,
} from "../../config/camera/index";
import { cameraPositionAnchor } from "../subject";
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
  const measuredHeading = cameraSubjectHeading(subject, input.headingHistory ?? history);
  const heading = measuredHeading ?? history?.headingRadians ?? 0;
  const initialDistance = preserving
    ? opening!.distanceMeters
    : "zoom" in values
      ? values.position.distanceMeters
      : 0;
  const initialYaw = preserving
    ? opening!.yawRadians
    : (values.orientation.referenceFrame !== "world-up" && values.orientation.inheritSubjectYaw)
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
      (values.orientation.referenceFrame !== "world-up" && values.orientation.inheritSubjectYaw) ? 0 : heading;
    yaw +=
      (recenterYawTarget(yaw, targetYaw, values.orientation.yawLimitsRadians) -
        yaw) *
      halfLifeAlpha(recenterDelta, recenter.yawHalfLifeSeconds);
    if (recenter.pitch)
      pitch = smooth(
        pitch,
        recenter.pitch.targetSource==='subject' ? subject.preferredOrbitPitchRadians??recenter.pitch.targetRadians : recenter.pitch.targetRadians,
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
  const measuredHeading = cameraSubjectHeading(subject, input.headingHistory ?? history);
  const heading = measuredHeading ?? history?.headingRadians ?? 0;
  const reference = cameraReferenceRotation(subject,values.orientation.referenceFrame,heading,values.orientation.inheritSubjectYaw);
  const intent = input.intent;
  const {
    yawRadians: yaw,
    pitchRadians: pitch,
    distanceMeters: distance,
  } = intent;
  if (!Object.values(intent).every(Number.isFinite))
    throw new Error("CAMERA_INTENT_INVALID");
  const origin = new Vector3(...subject.positionWorldMetersXYZ);
  const anchor = cameraPositionAnchor(subject, values.position, heading, {yawRadians:yaw,referenceQuaternionWorldXYZW:reference.toArray()});
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
  const baseFov=values.lens.verticalFovDegrees;
  const previousFov=input.previousVerticalFovDegrees ?? (history ? baseFov+history.speedFovDegrees : baseFov+fovTarget);
  let fov=fovEffect.enabled ? smooth(previousFov,baseFov+fovTarget,dt,fovEffect.halfLifeSeconds)-baseFov : 0;
  if(configuration.kind==='third-person'&&fovEffect.enabled&&Math.abs(baseFov+fov-previousFov)<=.0001)fov=previousFov-baseFov;
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
  // The established follow camera inherits translation, then damps the arm in
  // world space. Damping angles instead changes both the path and the response.
  let radiusTarget = configuration.kind === "first-person" ? 0 : zoom + speedDistance;
  if (configuration.kind === "third-person" && configuration.values.effects.speedDistance.enabled) {
    const effect = configuration.values.effects.speedDistance;
    const target = zoom + MathUtils.clamp(subject.speedMetersPerSecond / effect.fullEffectSpeedMetersPerSecond, 0, 1) * effect.maximumOffsetMeters;
    const previous = history?.nominalDistanceMeters ?? target;
    radiusTarget = smooth(previous, target, dt, target > previous ? effect.extendHalfLifeSeconds : effect.retractHalfLifeSeconds);
  }
  const desiredOrientation = reference.clone().multiply(orbitQuaternion(yaw, pitch));
  const arm = new Vector3(0, 0, radiusTarget).applyQuaternion(desiredOrientation);
  if (history && configuration.kind !== "first-person") {
    const previous = history.armWorldMetersXYZ
      ? new Vector3(...history.armWorldMetersXYZ)
      : new Vector3(0, 0, history.orbitRadiusMeters).applyQuaternion(reference.clone().multiply(orbitQuaternion(history.orbitYawRadians, history.orbitPitchRadians)));
    arm.copy(previous.lerp(arm, halfLifeAlpha(dt, values.position.armHalfLifeSeconds)));
  }
  const localArm = arm.clone().applyQuaternion(reference.clone().invert());
  const orbitRadius = arm.length();
  let orbitYaw = orbitRadius > 1e-12 ? Math.atan2(localArm.x, localArm.z) : yaw;
  let orbitPitch = orbitRadius > 1e-12 ? Math.asin(MathUtils.clamp(localArm.y / orbitRadius, -1, 1)) : pitch;
  // Select an equivalent measured arm frame using committed orientation. The
  // commanded pitch can cross a pole before a damped Cartesian arm reaches it.
  const alternateYaw=orbitYaw+Math.PI,alternatePitch=Math.PI-orbitPitch;
  const continuity=history?new Quaternion(...history.horizonQuaternionWorldXYZW):desiredOrientation;
  const direct=reference.clone().multiply(orbitQuaternion(orbitYaw,orbitPitch));
  const alternate=reference.clone().multiply(orbitQuaternion(alternateYaw,alternatePitch));
  if(values.orientation.pitchLimitsRadians.kind==='unbounded'&&alternate.angleTo(continuity)<direct.angleTo(continuity)){
    orbitYaw=alternateYaw;orbitPitch=alternatePitch;
  }
  orbitYaw += Math.round(((history?.orbitYawRadians??yaw)-orbitYaw)/(2*Math.PI))*2*Math.PI;
  orbitPitch += Math.round(((history?.orbitPitchRadians??pitch)-orbitPitch)/(2*Math.PI))*2*Math.PI;
  const orientation = configuration.kind === "first-person" ? desiredOrientation : reference.clone().multiply(orbitQuaternion(orbitYaw, orbitPitch));
  const referenceUp=new Vector3(0,1,0).applyQuaternion(reference);
  if(configuration.kind!=='first-person'){
    const previousReferenceUp=history?.referenceUpWorldXYZ??input.headingHistory?.referenceUpWorldXYZ;
    const previousUp=previousReferenceUp?new Vector3(...previousReferenceUp):new Vector3(0,1,0);
    referenceUp.copy(previousUp.lerp(referenceUp,halfLifeAlpha(dt,configuration.values.orientation.upHalfLifeSeconds))).normalize();
    if(configuration.values.orientation.upHalfLifeSeconds>0&&arm.lengthSq()>1e-12)
      orientation.setFromRotationMatrix(new Matrix4().lookAt(pivot.clone().add(arm),pivot,referenceUp));
  }
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
      // Collision must use the same horizon as the nominal pose; using the raw
      // subject frame here would undo up smoothing whenever the arm contracts.
      referenceQuaternionWorldXYZW: configuration.values.orientation.upHalfLifeSeconds > 0
        ? new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), referenceUp).toArray()
        : reference.toArray(),
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
    nominalDistanceMeters: radiusTarget,
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
      armWorldMetersXYZ: arm.toArray(),
      nominalDistanceMeters: radiusTarget,
      orbitYawRadians: orbitYaw,
      orbitPitchRadians: orbitPitch,
      orbitRadiusMeters: orbitRadius,
      zoomDistanceMeters: zoom,
      speedDistanceMeters: speedDistance,
      speedFovDegrees: fov,
      headingRadians: heading,
      headingQuaternionWorldXYZW: subject.semanticQuaternionWorldXYZW,
      horizonQuaternionWorldXYZW: orientation.toArray(),
      referenceUpWorldXYZ:referenceUp.toArray(),
    },
  };
}
