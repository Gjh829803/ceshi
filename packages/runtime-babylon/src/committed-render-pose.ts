import type { Vec3 } from "@whitebox-world/runtime-contracts";

export interface CommittedRenderPoseV1 {
  readonly committedTick: number;
  readonly positionMetersXYZ: Vec3;
  readonly facingYawRadians: number;
}

function copyPose(pose: CommittedRenderPoseV1): CommittedRenderPoseV1 {
  if (
    !Number.isSafeInteger(pose.committedTick) ||
    pose.committedTick < 0 ||
    !pose.positionMetersXYZ.every(Number.isFinite) ||
    !Number.isFinite(pose.facingYawRadians)
  ) {
    throw new RangeError("Committed render pose must contain finite committed values.");
  }
  return Object.freeze({
    committedTick: pose.committedTick,
    positionMetersXYZ: Object.freeze([...pose.positionMetersXYZ]) as Vec3,
    facingYawRadians: pose.facingYawRadians,
  });
}

function shortestYawDeltaRadians(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/**
 * Display-only history of the last two committed poses. Sampling never mutates
 * the authoritative Movement Snapshot and never feeds a pose back into physics.
 */
export class CommittedRenderPoseBufferV1 {
  #previous: CommittedRenderPoseV1;
  #current: CommittedRenderPoseV1;

  constructor(initialPose: CommittedRenderPoseV1) {
    const admitted = copyPose(initialPose);
    this.#previous = admitted;
    this.#current = admitted;
  }

  reset(pose: CommittedRenderPoseV1): void {
    const admitted = copyPose(pose);
    this.#previous = admitted;
    this.#current = admitted;
  }

  commit(pose: CommittedRenderPoseV1): void {
    const admitted = copyPose(pose);
    if (admitted.committedTick < this.#current.committedTick) {
      throw new RangeError("Committed render pose Tick cannot move backwards.");
    }
    if (admitted.committedTick === this.#current.committedTick) {
      this.#current = admitted;
      return;
    }
    this.#previous = this.#current;
    this.#current = admitted;
  }

  sample(interpolationAlphaRatio: number): CommittedRenderPoseV1 {
    if (
      !Number.isFinite(interpolationAlphaRatio) ||
      interpolationAlphaRatio < 0 ||
      interpolationAlphaRatio > 1
    ) {
      throw new RangeError("Render interpolation alpha must be finite from 0 through 1.");
    }
    if (interpolationAlphaRatio === 0) return this.#previous;
    if (interpolationAlphaRatio === 1) return this.#current;
    const previous = this.#previous;
    const current = this.#current;
    return Object.freeze({
      committedTick: current.committedTick,
      positionMetersXYZ: Object.freeze([
        previous.positionMetersXYZ[0] +
          (current.positionMetersXYZ[0] - previous.positionMetersXYZ[0]) *
            interpolationAlphaRatio,
        previous.positionMetersXYZ[1] +
          (current.positionMetersXYZ[1] - previous.positionMetersXYZ[1]) *
            interpolationAlphaRatio,
        previous.positionMetersXYZ[2] +
          (current.positionMetersXYZ[2] - previous.positionMetersXYZ[2]) *
            interpolationAlphaRatio,
      ]) as Vec3,
      facingYawRadians: previous.facingYawRadians +
        shortestYawDeltaRadians(
          previous.facingYawRadians,
          current.facingYawRadians,
        ) * interpolationAlphaRatio,
    });
  }
}
