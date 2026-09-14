import {failure} from '../control-support';
import { Euler, MathUtils, Quaternion, Vector3 } from "three";
import type { ResolvedCameraConfiguration } from "../config/camera/index";
import type { CameraSubjectFacts } from "./subject";
import { subjectHeading } from "./subject";
import { orbitQuaternion } from "./strategies/evaluation";
import type { CameraIntent } from "./strategies/types";

export interface CameraLifecycleEvent {
  readonly operationId: string;
  readonly kind: "retarget" | "relocate";
  readonly previousSubject: CameraSubjectFacts;
  readonly subject: CameraSubjectFacts;
}
export function sameCameraSubject(
  a: CameraSubjectFacts,
  b: CameraSubjectFacts,
): boolean {
  return a.id === b.id && a.generation === b.generation;
}
export function cameraReference(
  subject: CameraSubjectFacts,
  configuration: ResolvedCameraConfiguration,
): Quaternion {
  return configuration.values.orientation.referenceFrame === "subject-up"
    ? new Quaternion(...(subject.semanticQuaternionWorldXYZW ?? [0, 0, 0, 1]))
    : new Quaternion();
}
/** Preserve the unwrapped angle branch when expressing a direction in a new reference. */
export function rebaseCameraIntent(
  intent: CameraIntent,
  previous: CameraSubjectFacts,
  next: CameraSubjectFacts,
  oldConfiguration: ResolvedCameraConfiguration,
  configuration: ResolvedCameraConfiguration,
  relocate: boolean,
  rangePolicy: "clamp" | "reject" = "clamp",
): CameraIntent {
  const admit=(candidate:CameraIntent):CameraIntent=>{
    const clamped=clampCameraIntent(candidate,configuration);
    if(rangePolicy==='reject'&&(clamped.distanceMeters!==candidate.distanceMeters||clamped.yawRadians!==candidate.yawRadians||clamped.pitchRadians!==candidate.pitchRadians))throw failure('CAMERA_INTENT_OUT_OF_RANGE');
    return clamped;
  };
  const oldFrame = oldConfiguration.values.orientation.referenceFrame;
  const newFrame = configuration.values.orientation.referenceFrame;
  if (relocate && oldFrame === newFrame) {
    if (newFrame === "subject-up")
      return admit(intent);
    const a = subjectHeading(previous),
      b = subjectHeading(next);
    return admit(
      {
        ...intent,
        yawRadians:
          intent.yawRadians +
          (a === undefined || b === undefined
            ? 0
            : Math.atan2(Math.sin(b - a), Math.cos(b - a))),
      },
    );
  }
  if (oldFrame === newFrame && newFrame === "world-up")
    return admit(intent);
  const rotation = cameraReference(next, configuration)
    .invert()
    .multiply(cameraReference(previous, oldConfiguration))
    .multiply(orbitQuaternion(intent.yawRadians, intent.pitchRadians));
  const angles = new Euler().setFromQuaternion(rotation, "YXZ");
  const yaw =
    angles.y +
    Math.round((intent.yawRadians - angles.y) / (2 * Math.PI)) * 2 * Math.PI;
  return admit(
    { ...intent, yawRadians: yaw, pitchRadians: -angles.x },
  );
}
export function clampCameraIntent(
  intent: CameraIntent,
  configuration: ResolvedCameraConfiguration,
): CameraIntent {
  const { orientation } = configuration.values;
  const clamp = (value: number, limit: typeof orientation.yawLimitsRadians) =>
    limit.kind === "bounded"
      ? MathUtils.clamp(value, limit.minimumRadians, limit.maximumRadians)
      : value;
  let distance = Math.max(0, intent.distanceMeters);
  if (configuration.kind === "first-person") distance = 0;
  else if (configuration.values.zoom.range.kind === "bounded")
    distance = MathUtils.clamp(
      distance,
      configuration.values.zoom.range.minimumDistanceMeters,
      configuration.values.zoom.range.maximumDistanceMeters,
    );
  return {
    ...intent,
    yawRadians: clamp(intent.yawRadians, orientation.yawLimitsRadians),
    pitchRadians: clamp(intent.pitchRadians, orientation.pitchLimitsRadians),
    distanceMeters: distance,
  };
}

/** Rebase a held opening, never a collision-derived distance or user intent. */
export function relocateCameraProposal(
  pose: import("./strategies/types").CameraProposal,
  previous: CameraSubjectFacts,
  next: CameraSubjectFacts,
  referenceFrame: "world-up" | "subject-up",
  rotate = true,
  previousAnchor: readonly [number, number, number] = previous.positionWorldMetersXYZ,
  nextAnchor: readonly [number, number, number] = next.positionWorldMetersXYZ,
): import("./strategies/types").CameraProposal {
  const rotation = !rotate
    ? new Quaternion()
    : referenceFrame === "subject-up"
      ? new Quaternion(
          ...(next.semanticQuaternionWorldXYZW ?? [0, 0, 0, 1]),
        ).multiply(
          new Quaternion(
            ...(previous.semanticQuaternionWorldXYZW ?? [0, 0, 0, 1]),
          ).invert(),
        )
      : new Quaternion().setFromAxisAngle(
          new Vector3(0, 1, 0),
          (subjectHeading(next) ?? 0) - (subjectHeading(previous) ?? 0),
        );
  const point = (value: readonly [number, number, number]) =>
    new Vector3(...value)
      .sub(new Vector3(...previousAnchor))
      .applyQuaternion(rotation)
      .add(new Vector3(...nextAnchor))
      .toArray();
  return {
    ...pose,
    ...(pose.composition ? {composition: {...pose.composition,
      nominalAimQuaternionWorldXYZW: rotation.clone().multiply(new Quaternion(...pose.composition.nominalAimQuaternionWorldXYZW)).toArray(),
      referenceQuaternionWorldXYZW: rotation.clone().multiply(new Quaternion(...pose.composition.referenceQuaternionWorldXYZW)).toArray(),
    }} : {}),
    positionWorldMetersXYZ: point(pose.positionWorldMetersXYZ),
    pivotWorldMetersXYZ: point(pose.pivotWorldMetersXYZ),
    lookAtWorldMetersXYZ: point(pose.lookAtWorldMetersXYZ),
    quaternionWorldXYZW: rotation
      .clone()
      .multiply(new Quaternion(...pose.quaternionWorldXYZW))
      .toArray(),
    upWorldXYZ: new Vector3(...pose.upWorldXYZ)
      .applyQuaternion(rotation)
      .toArray(),
    ...(pose.visibilityTargetWorldMetersXYZ
      ? {
          visibilityTargetWorldMetersXYZ: point(pose.visibilityTargetWorldMetersXYZ),
        }
      : {}),
  };
}
