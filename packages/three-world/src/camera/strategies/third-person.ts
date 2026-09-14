import {cameraReferenceRotation} from './heading';
import { Matrix4, Quaternion, Vector3 } from "three";
import type { ResolvedCameraConfiguration } from "../../config/camera/index";
import { cameraConfigurationError } from "../../config/camera/validation";
import { subjectAnchor, cameraPositionAnchor, type CameraSubjectFacts } from "../subject";
import { evaluateStrategy, orbitQuaternion } from "./evaluation";
import type {
  CameraOpeningReference,
  CameraStrategyInput,
  CameraStrategyResult,
} from "./types";

/** Initialize all views at installation, not when a dormant view is first selected. */
export function createOpeningReference(
  subject: CameraSubjectFacts,
  configuration: Extract<ResolvedCameraConfiguration, { kind: "third-person" }>,
): CameraOpeningReference {
  const opening = configuration.opening;
  if (!opening) throw new Error("CAMERA_OPENING_REQUIRED");
  const position = new Vector3(...opening.positionWorldMetersXYZ);
  const target = new Vector3(...opening.lookAtWorldMetersXYZ);
  if (position.distanceToSquared(target) < 1e-24)
    throw new Error("CAMERA_OPENING_DIRECTION_INVALID");
  const rotation = new Quaternion().setFromRotationMatrix(
    new Matrix4().lookAt(
      position,
      target,
      new Vector3(...(opening.upWorldXYZ ?? [0, 1, 0])),
    ),
  );
  const reference = cameraReferenceRotation(subject,configuration.values.orientation.referenceFrame,undefined,configuration.values.orientation.inheritSubjectYaw);
  const localRotation = reference.clone().invert().multiply(rotation);
  let orbitYaw: number | undefined;
  if(configuration.values.position.anchorOffset.space==='orbit'){
    const delta=position.clone().sub(subjectAnchor(subject,configuration.values.position.anchor)).applyQuaternion(reference.clone().invert());
    const x=configuration.values.position.anchorOffset.offsetMetersXYZ[0],horizontal=Math.hypot(delta.x,delta.z);
    if(horizontal<Math.abs(x))throw new Error('CAMERA_OPENING_DIRECTION_INVALID');
    orbitYaw=Math.atan2(delta.x,delta.z)-Math.atan2(x,Math.sqrt(Math.max(0,horizontal*horizontal-x*x)));
  }
  const arm = position.clone().sub(cameraPositionAnchor(subject,configuration.values.position,undefined,
    orbitYaw===undefined?undefined:{yawRadians:orbitYaw,referenceQuaternionWorldXYZW:reference.toArray()})).applyQuaternion(reference.clone().invert());
  const distance = arm.length();
  const direction =
    distance > 1e-12
      ? arm.clone().normalize()
      : new Vector3(0, 0, 1).applyQuaternion(localRotation);
  const yaw = Math.atan2(direction.x, direction.z);
  const pitch = Math.asin(Math.max(-1, Math.min(1, direction.y)));
  for (const [field, angle] of [
    ["yawLimitsRadians", yaw],
    ["pitchLimitsRadians", pitch],
  ] as const) {
    const bounds = configuration.values.orientation[field];
    if (
      bounds.kind === "bounded" &&
      (angle < bounds.minimumRadians || angle > bounds.maximumRadians)
    ) {
      cameraConfigurationError(
        `/views/${configuration.viewId}/orientation/${field}`,
        "explicit bounds exclude the opening reference angle",
      );
    }
  }
  return {
    viewId: configuration.viewId,
    distanceMeters: distance,
    yawRadians: yaw,
    pitchRadians: pitch,
    framingQuaternionXYZW: orbitQuaternion(yaw, pitch)
      .invert()
      .multiply(localRotation)
      .toArray(),
  };
}
export function evaluateThirdPerson(
  input: CameraStrategyInput<"third-person">,
): CameraStrategyResult<"third-person"> {
  return evaluateStrategy(input);
}
