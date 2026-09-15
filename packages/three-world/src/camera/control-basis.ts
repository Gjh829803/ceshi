import { Quaternion, Vector3 } from "three";
import type { CameraQuaternion, CameraSubjectFacts } from "./subject";
import type { ResolvedCameraConfiguration } from "../config/camera";
import type { CameraIntent, CameraOpeningReference, CameraStrategyHistory } from "./strategies/types";
import { cameraReferenceRotation, cameraSubjectHeading } from "./strategies/heading";
import { orbitQuaternion } from "./strategies/evaluation";
import { worldDirectionYaw } from "./strategies/recenter";

/** Input uses the commanded pose, before arm damping or collision correction.
 * Preserved openings also carry authored framing, which can face off the orbit arm. */
export function cameraInputRotation(
  configuration: ResolvedCameraConfiguration,
  subject: CameraSubjectFacts,
  intent: CameraIntent,
  opening?: CameraOpeningReference,
  history?: CameraStrategyHistory,
): Quaternion {
  const orientation = configuration.values.orientation;
  const preserving = configuration.kind === "third-person" && configuration.values.framing.kind === "preserve-opening";
  const relativeYaw = orientation.referenceFrame !== "world-up" && orientation.inheritSubjectYaw;
  const heading = preserving || relativeYaw ? cameraSubjectHeading(subject, history) ?? history?.headingRadians ?? 0 : 0;
  if (preserving) {
    if (!opening) throw new Error("CAMERA_OPENING_REFERENCE_REQUIRED");
    return cameraReferenceRotation(subject, orientation.referenceFrame, heading, orientation.inheritSubjectYaw)
      .multiply(orbitQuaternion(intent.yawRadians, intent.pitchRadians))
      .multiply(new Quaternion(...opening.framingQuaternionXYZW));
  }
  return orbitQuaternion((relativeYaw ? heading : 0) + intent.yawRadians, 0);
}

/** Preserve movement bearing across an automatic framing change without changing
 * the destination pitch or extending its authored yaw limits. */
export function cameraInputYaw(
  direction: Vector3,
  configuration: ResolvedCameraConfiguration,
  subject: CameraSubjectFacts,
  intent: CameraIntent,
  opening?: CameraOpeningReference,
  history?: CameraStrategyHistory,
): number {
  const orientation = configuration.values.orientation;
  const heading = cameraSubjectHeading(subject, history) ?? history?.headingRadians ?? 0;
  if (configuration.kind !== "third-person" || configuration.values.framing.kind !== "preserve-opening") {
    const relativeYaw = orientation.referenceFrame !== "world-up" && orientation.inheritSubjectYaw;
    return worldDirectionYaw(direction, orbitQuaternion(relativeYaw ? heading : 0, 0), intent.yawRadians, 0, orientation.yawLimitsRadians);
  }
  if (!opening) throw new Error("CAMERA_OPENING_REFERENCE_REQUIRED");
  const localRotation = orbitQuaternion(0, intent.pitchRadians).multiply(new Quaternion(...opening.framingQuaternionXYZW));
  const localForward = new Vector3(0, 0, -1).applyQuaternion(localRotation);
  const reference = cameraReferenceRotation(subject, orientation.referenceFrame, heading, orientation.inheritSubjectYaw);
  const referenceUp = new Vector3(0, 1, 0).applyQuaternion(reference);
  if (localForward.x * localForward.x + localForward.z * localForward.z < 1e-12 && referenceUp.x * referenceUp.x + referenceUp.z * referenceUp.z < 1e-12) {
    const right = new Vector3(1, 0, 0).applyQuaternion(localRotation);
    localForward.set(right.z, 0, -right.x).normalize().multiplyScalar(Math.sign(referenceUp.y));
  }
  const offset = Math.atan2(-localForward.x, -localForward.z);
  const pitch = -Math.asin(Math.max(-1, Math.min(1, localForward.y)));
  const limits = orientation.yawLimitsRadians;
  const shifted = limits.kind === "bounded" ? {...limits, minimumRadians: limits.minimumRadians + offset, maximumRadians: limits.maximumRadians + offset} : limits;
  return worldDirectionYaw(direction, reference, intent.yawRadians + offset, pitch, shifted) - offset;
}

/** Horizontal input direction from the selected camera orientation. At vertical
 * sight, the camera right axis still supplies heading; never invent world north. */
export function cameraControlForward(quaternion: CameraQuaternion): [number, number, number] {
  const rotation = new Quaternion(...quaternion);
  const forward = new Vector3(0, 0, -1).applyQuaternion(rotation);
  forward.y = 0;
  if (forward.lengthSq() < 1e-12) {
    const right = new Vector3(1, 0, 0).applyQuaternion(rotation);
    forward.set(right.z, 0, -right.x);
  }
  return forward.normalize().toArray();
}
