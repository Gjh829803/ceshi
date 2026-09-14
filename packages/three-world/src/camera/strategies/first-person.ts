import { MathUtils, Quaternion, Vector3 } from "three";
import { evaluateStrategy, orbitQuaternion } from "./evaluation";
import type { CameraStrategyInput, CameraStrategyResult } from "./types";

export function evaluateFirstPerson(
  input: CameraStrategyInput<"first-person">,
): CameraStrategyResult<"first-person"> {
  const result = evaluateStrategy(input);
  const { subject, configuration, history } = input;
  const orientation = new Quaternion(...result.proposal.quaternionWorldXYZW);
  let horizon = orientation.clone();
  {
    const forward = new Vector3(0, 0, -1).applyQuaternion(orientation);
    const right = forward.clone().cross(new Vector3(0, 1, 0));
    if (right.lengthSq() > 1e-12) {
      const horizonYaw = Math.atan2(-forward.x, -forward.z);
      const horizonPitch = -Math.asin(MathUtils.clamp(forward.y, -1, 1));
      horizon = orbitQuaternion(horizonYaw, horizonPitch);
    } else if (history)
      horizon = new Quaternion(...history.horizonQuaternionWorldXYZW);
    const subjectUp = new Vector3(0, 1, 0).applyQuaternion(
      new Quaternion(...(subject.semanticQuaternionWorldXYZW ?? [0, 0, 0, 1])),
    );
    const baseUp = new Vector3(0, 1, 0)
      .applyQuaternion(horizon)
      .projectOnPlane(forward)
      .normalize();
    const inheritedUp = subjectUp.projectOnPlane(forward);
    let roll = 0;
    if (inheritedUp.lengthSq() > 1e-12) {
      inheritedUp.normalize();
      roll = Math.atan2(
        forward.dot(baseUp.clone().cross(inheritedUp)),
        baseUp.dot(inheritedUp),
      );
    }
    // Apply roll about the actual sight direction; keep pitch/yaw at a vertical pole.
    const currentUp = new Vector3(0, 1, 0)
      .applyQuaternion(orientation)
      .projectOnPlane(forward)
      .normalize();
    const removeRoll = Math.atan2(
      forward.dot(currentUp.clone().cross(baseUp)),
      currentUp.dot(baseUp),
    );
    orientation.premultiply(
      new Quaternion().setFromAxisAngle(
        forward,
        removeRoll +
          roll * configuration.values.orientation.rollInheritanceRatio,
      ),
    );
  }

  const forward = new Vector3(0, 0, -1).applyQuaternion(orientation);
  return {
    ...result,
    proposal: {
      ...result.proposal,
      quaternionWorldXYZW: orientation.toArray(),
      lookAtWorldMetersXYZ: new Vector3(
        ...result.proposal.positionWorldMetersXYZ,
      )
        .add(forward)
        .toArray(),
      upWorldXYZ: new Vector3(0, 1, 0).applyQuaternion(orientation).toArray(),
    },
    history: {
      ...result.history,
      horizonQuaternionWorldXYZW: horizon.toArray(),
    },
  };
}
