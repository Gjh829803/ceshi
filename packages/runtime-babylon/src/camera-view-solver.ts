import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { CameraRigParametersV1 } from "@whitebox-world/camera";

export interface CameraViewSolveRequestV1 {
  readonly algorithmRef: string;
  readonly baseTarget: Vector3;
  readonly desiredTarget: Vector3;
  readonly forward: Vector3;
  readonly velocity: Vector3;
  readonly parameters: CameraRigParametersV1;
  readonly viewPitchOffsetRadians: number;
  readonly viewDistanceOffsetMeters: number;
  readonly shoulderSide: number;
}

export interface CameraViewSolveResultV1 {
  readonly desiredPosition: Vector3;
  readonly desiredTarget: Vector3;
  readonly requestedArmLengthMeters?: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** Computes only the desired camera pose from the Director-resolved inputs. */
export class CameraViewSolverV1 {
  solve(input: CameraViewSolveRequestV1): CameraViewSolveResultV1 {
    const desiredTarget = input.desiredTarget.clone();
    const pitch = clamp(
      input.parameters.pitchRadians + input.viewPitchOffsetRadians,
      input.parameters.minimumPitchRadians,
      input.parameters.maximumPitchRadians,
    );
    if (input.algorithmRef.endsWith("/socket-first-person@1")) {
      const desiredPosition = input.baseTarget.clone();
      const lookDirection = new Vector3(
        input.forward.x * Math.cos(pitch),
        Math.sin(pitch),
        input.forward.z * Math.cos(pitch),
      );
      return {
        desiredPosition,
        desiredTarget: desiredPosition.add(lookDirection),
      };
    }

    const distance = clamp(
      input.parameters.distanceMeters + input.viewDistanceOffsetMeters,
      input.parameters.minimumDistanceMeters,
      input.parameters.maximumDistanceMeters,
    );
    const horizontalDistance = Math.cos(pitch) * distance;
    const right = Vector3.Cross(Vector3.Up(), input.forward).normalize();
    const desiredPosition = desiredTarget
      .subtract(input.forward.scale(horizontalDistance))
      .add(right.scale(input.parameters.shoulderOffsetMeters * input.shoulderSide));
    desiredPosition.y += Math.sin(pitch) * distance;
    if (input.algorithmRef.endsWith("/flight-horizon@1")) {
      desiredTarget.y = input.baseTarget.y +
        input.velocity.y * Math.min(0.5, input.parameters.lookAheadSeconds);
    }
    return {
      desiredPosition,
      desiredTarget,
      requestedArmLengthMeters: Vector3.Distance(desiredTarget, desiredPosition),
    };
  }
}
