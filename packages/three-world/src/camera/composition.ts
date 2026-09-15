import { MathUtils, Matrix4, Quaternion, Vector3 } from "three";
import type { CameraVector3 } from "../config/camera/index";
import type { CameraQuaternion } from "./subject";
import type { CameraCompositionFrame, CameraProposal } from "./strategies/types";

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

/** Confidence belongs to geometric framing, not an accumulated rotation angle. */
function horizonConfidence(nominal: Quaternion, back: Vector3, reference: Quaternion): number {
  const up = new Vector3(0, 1, 0).applyQuaternion(reference);
  const branch = new Vector3(0, 1, 0).applyQuaternion(nominal).dot(up);
  return MathUtils.smoothstep(Math.abs(branch), 0, poleRegularization)
    * MathUtils.smoothstep(up.cross(back).length(), 0, poleRegularization);
}

/** Capture the applied aim, excluding authored framing, at a fixed/display sample. */
export function cameraCompositionFrame(proposal: CameraProposal): CameraCompositionFrame | undefined {
  if (proposal.collisionComposition) return proposal.collisionComposition;
  const composition = proposal.composition;
  if (!composition) return undefined;
  const back = new Vector3(...proposal.positionWorldMetersXYZ)
    .sub(new Vector3(...proposal.pivotWorldMetersXYZ));
  if (back.lengthSq() < epsilon) return undefined;
  const aim = new Quaternion(...proposal.quaternionWorldXYZW)
    .multiply(new Quaternion(...composition.relativeAimQuaternionXYZW).invert()).normalize();
  return {
    aimQuaternionWorldXYZW: aim.toArray(),
    referenceQuaternionWorldXYZW: composition.referenceQuaternionWorldXYZW,
    horizonConfidence: horizonConfidence(new Quaternion(...composition.nominalAimQuaternionWorldXYZW),
      back.normalize(), new Quaternion(...composition.referenceQuaternionWorldXYZW)),
  };
}

/** Geometry owns the safe eye; strategy owns pivot/framing intent. Near a pole
 * transport the applied frame, never a fractional number of accumulated turns.
 * When the horizon becomes better defined, consume that confidence increase to
 * return to reference-up. Fixed history chooses the frame; display only samples it. */
export function composeCameraAtPosition(
  proposal: CameraProposal,
  position: CameraVector3,
  continuity?: CameraCompositionFrame,
): CameraProposal {
  const eye = new Vector3(...position);
  let collisionComposition: CameraCompositionFrame | undefined;
  let orientation = new Quaternion(...proposal.quaternionWorldXYZW);
  const composition = proposal.composition;
  const back = eye.clone().sub(new Vector3(...proposal.pivotWorldMetersXYZ));
  if (composition && back.lengthSq() >= epsilon) {
    back.normalize();
    const nominal = new Quaternion(...composition.nominalAimQuaternionWorldXYZW);
    const reference = new Quaternion(...composition.referenceQuaternionWorldXYZW);
    const confidence = horizonConfidence(nominal, back, reference);
    const previous = continuity ?? cameraCompositionFrame(proposal);
    const source = previous
      ? reference.clone().multiply(new Quaternion(...previous.referenceQuaternionWorldXYZW).invert())
        .multiply(new Quaternion(...previous.aimQuaternionWorldXYZW))
      : nominal;
    const sourceBack = new Vector3(0, 0, 1).applyQuaternion(source);
    const sourceRight = new Vector3(1, 0, 0).applyQuaternion(source);
    // The exact antipodal ray has no unique shortest arc. Keep the applied right
    // axis as the deterministic half-turn axis instead of selecting a world axis.
    const directionDot = sourceBack.dot(back);
    const directionCross = sourceBack.clone().cross(back);
    // Three's setFromUnitVectors uses a wider antipodal fallback that chooses a
    // world axis. Use the same explicit frame-relative rule for this whole path.
    const transport = directionDot < -1 + epsilon
      ? new Quaternion().setFromAxisAngle(sourceRight, Math.PI)
      : new Quaternion(directionCross.x, directionCross.y, directionCross.z, 1 + directionDot).normalize();
    let right = sourceRight.applyQuaternion(transport).projectOnPlane(back).normalize();
    const referenceUp = new Vector3(0, 1, 0).applyQuaternion(reference);
    const branch = new Vector3(0, 1, 0).applyQuaternion(nominal).dot(referenceUp);
    const horizonRight = referenceUp.cross(back).multiplyScalar(Math.sign(branch));
    if (confidence === 1) right = horizonRight.normalize();
    else if (confidence > (previous?.horizonConfidence ?? 0)) {
      const gain = (confidence - (previous?.horizonConfidence ?? 0))
        / (1 - (previous?.horizonConfidence ?? 0));
      horizonRight.normalize();
      const angle = Math.atan2(back.dot(right.clone().cross(horizonRight)), right.dot(horizonRight));
      right.applyAxisAngle(back, angle * gain).normalize();
    }
    const aim = frameQuaternion(right, back);
    collisionComposition = {aimQuaternionWorldXYZW: aim.toArray(),
      referenceQuaternionWorldXYZW: composition.referenceQuaternionWorldXYZW,
      horizonConfidence: confidence};
    orientation = aim.multiply(new Quaternion(...composition.relativeAimQuaternionXYZW)).normalize();
  }
  const lookDistance = new Vector3(...proposal.positionWorldMetersXYZ)
    .distanceTo(new Vector3(...proposal.lookAtWorldMetersXYZ));
  const { collisionComposition: _previousComposition, ...pose } = proposal;
  return {
    ...pose,
    ...(collisionComposition === undefined ? {} : { collisionComposition }),
    positionWorldMetersXYZ: position,
    quaternionWorldXYZW: orientation.toArray(),
    upWorldXYZ: new Vector3(0, 1, 0).applyQuaternion(orientation).toArray(),
    lookAtWorldMetersXYZ: eye.add(new Vector3(0, 0, -1)
      .applyQuaternion(orientation).multiplyScalar(lookDistance)).toArray(),
  };
}
