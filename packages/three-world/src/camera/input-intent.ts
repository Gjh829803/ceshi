import type { CameraKind, ResolvedCameraConfiguration } from "../config/camera/index";
import { failure } from "../control-support";
import type { CameraControllerInput, CameraControlBasis } from "./state";
import { prepareCameraIntent } from "./strategies/evaluation";
import { cameraInputRotation } from "./control-basis";
import type { CameraIntent, CameraStrategyInput } from "./strategies/types";

interface CameraInputDelta {
  readonly yawRadians: number;
  readonly pitchRadians: number;
  readonly zoomMeters: number;
  readonly active: boolean;
}

/** Convert semantic input to this step's deltas. No device binding or state commit. */
export function resolveCameraInput(
  input: CameraControllerInput,
  rates: ResolvedCameraConfiguration["input"],
  deltaSeconds: number,
): CameraInputDelta {
  const delta = input.orbitDeltaRadiansXY ?? [0, 0],
    ratio = input.orbitRatioXY ?? [0, 0];
  if (
    ![...delta, ...ratio, input.zoomDeltaMeters ?? 0, deltaSeconds].every(Number.isFinite)
    || deltaSeconds < 0
    || ratio.some(value => Math.abs(value) > 1)
  ) throw failure("CAMERA_INPUT_INVALID");
  const yawRadians = delta[0] + ratio[0] * rates.orbitRateRadiansPerSecond * deltaSeconds;
  const pitchRadians = delta[1]
    + ratio[1] * (rates.orbitPitchRateRadiansPerSecond ?? rates.orbitRateRadiansPerSecond) * deltaSeconds;
  const active = !!input.movement || yawRadians !== 0 || pitchRadians !== 0 || (input.zoomDeltaMeters ?? 0) !== 0;
  return { yawRadians, pitchRadians, zoomMeters: input.zoomDeltaMeters ?? 0, active };
}

/** Compute intent and movement heading from the activated view. Collision cannot steer movement. */
export function prepareCameraControl(
  input: CameraStrategyInput<CameraKind>,
  delta: CameraInputDelta,
  controlViewId: string,
): { readonly intent: CameraIntent; readonly basis: CameraControlBasis } {
  const seed = input.intent;
  const intent = prepareCameraIntent({
    ...input,
    intent: {
      ...seed,
      yawRadians: seed.yawRadians + delta.yawRadians,
      pitchRadians: seed.pitchRadians + delta.pitchRadians,
      distanceMeters: seed.distanceMeters + delta.zoomMeters,
      secondsSinceOrbit: delta.yawRadians !== 0 || delta.pitchRadians !== 0 ? 0 : seed.secondsSinceOrbit,
    },
  });
  return {
    intent,
    basis: {
      quaternionWorldXYZW: cameraInputRotation(input.configuration, input.subject, intent, input.opening, input.headingHistory).toArray(),
      viewId: controlViewId,
      resolvedSubjectId: input.subject.id,
      subjectGeneration: input.subject.generation,
    },
  };
}
