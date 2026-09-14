import { MathUtils, Matrix4, Quaternion, Vector3 } from "three";
import type { CameraVector3 } from "../config/camera/index";
import type { CameraQuaternion } from "./subject";
import type { CameraProposal } from "./strategies/types";

const epsilon = 1e-12;
const poleRegularization = 1e-3;

function frameQuaternion(right: Vector3, back: Vector3): Quaternion {
  return new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(right, back.clone().cross(right), back),
  );
}

/** Held authored poses and mixed-view blends have pose intent but no strategy metadata. */
export function captureCameraComposition(
  proposal: CameraProposal,
  referenceQuaternionWorldXYZW: CameraQuaternion,
): CameraProposal {
  if (proposal.composition) return proposal;
  const back = new Vector3(...proposal.positionWorldMetersXYZ)
    .sub(new Vector3(...proposal.pivotWorldMetersXYZ));
  if (back.lengthSq() < epsilon) return proposal;
  back.normalize();
  const orientation = new Quaternion(...proposal.quaternionWorldXYZW);
  const referenceUp = new Vector3(0, 1, 0)
    .applyQuaternion(new Quaternion(...referenceQuaternionWorldXYZW));
  const right = referenceUp.clone().cross(back);
  if (right.lengthSq() < epsilon)
    right.set(1, 0, 0).applyQuaternion(orientation).projectOnPlane(back);
  else if (new Vector3(0, 1, 0).applyQuaternion(orientation).dot(referenceUp) < 0)
    right.negate();
  if (right.lengthSq() < epsilon) return proposal;
  const aim = frameQuaternion(right.normalize(), back);
  return {
    ...proposal,
    composition: {
      referenceQuaternionWorldXYZW,
      nominalAimQuaternionWorldXYZW: aim.toArray(),
      relativeAimQuaternionXYZW: aim.clone().invert().multiply(orientation).toArray(),
    },
  };
}

/** Geometry owns the safe eye; the strategy owns immutable pivot/framing intent.
 * Ordinary corrections retain reference-up. At a pole or a reversed horizon,
 * prefer the transported source frame: strict world-up has no continuous yaw
 * there. A positive right component avoids both zero vectors and twist cuts. */
export function composeCameraAtPosition(
  proposal: CameraProposal,
  position: CameraVector3,
): CameraProposal {
  const eye = new Vector3(...position);
  let orientation = new Quaternion(...proposal.quaternionWorldXYZW);
  const composition = proposal.composition;
  const back = eye.clone().sub(new Vector3(...proposal.pivotWorldMetersXYZ));
  if (composition && back.lengthSq() >= epsilon) {
    back.normalize();
    const nominal = new Quaternion(...composition.nominalAimQuaternionWorldXYZW);
    const nominalBack = new Vector3(0, 0, 1).applyQuaternion(nominal);
    const nominalRight = new Vector3(1, 0, 0).applyQuaternion(nominal);
    // Antipodal directions have no unique shortest arc. Use the source right
    // axis deterministically rather than relying on a global-axis fallback.
    const transport = nominalBack.dot(back) < -1 + epsilon
      ? new Quaternion().setFromAxisAngle(nominalRight, Math.PI)
      : new Quaternion().setFromUnitVectors(nominalBack, back);
    const transportedRight = nominalRight.applyQuaternion(transport).projectOnPlane(back).normalize();
    const transportedUp = back.clone().cross(transportedRight);
    const referenceUp = new Vector3(0, 1, 0)
      .applyQuaternion(new Quaternion(...composition.referenceQuaternionWorldXYZW));
    const branch = new Vector3(0, 1, 0).applyQuaternion(nominal).dot(referenceUp);
    const weight = Math.sign(branch) * MathUtils.smoothstep(Math.abs(branch), 0, poleRegularization);
    const horizonRight = referenceUp.cross(back).multiplyScalar(weight);
    const right = transportedRight.clone()
      .multiplyScalar(Math.max(horizonRight.dot(transportedRight), poleRegularization))
      .addScaledVector(transportedUp, horizonRight.dot(transportedUp))
      .normalize();
    orientation = frameQuaternion(right, back)
      .multiply(new Quaternion(...composition.relativeAimQuaternionXYZW)).normalize();
  }
  const lookDistance = new Vector3(...proposal.positionWorldMetersXYZ)
    .distanceTo(new Vector3(...proposal.lookAtWorldMetersXYZ));
  return {
    ...proposal,
    positionWorldMetersXYZ: position,
    quaternionWorldXYZW: orientation.toArray(),
    upWorldXYZ: new Vector3(0, 1, 0).applyQuaternion(orientation).toArray(),
    lookAtWorldMetersXYZ: eye.add(new Vector3(0, 0, -1)
      .applyQuaternion(orientation).multiplyScalar(lookDistance)).toArray(),
  };
}
