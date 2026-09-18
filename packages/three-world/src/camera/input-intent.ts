import type { CameraKind, ResolvedCameraConfiguration } from "../config/camera/index";
import { failure } from "../control-support";
import type { CameraControllerInput, CameraControlBasis } from "./state";
import { prepareCameraIntent } from "./strategies/evaluation";
import { cameraInputRotation } from "./control-basis";
import type { CameraIntent, CameraStrategyInput } from "./strategies/types";

interface CameraInputDelta {
  readonly yawRadians: number;
  readonly pitchRadians: number;
  readonly pointerPitchRadians: number;
  readonly orbitPitchMaxOffsetRadians: number | undefined;
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
    || input.orbitPitchMaxOffsetRadians !== undefined
      && (!Number.isFinite(input.orbitPitchMaxOffsetRadians) || input.orbitPitchMaxOffsetRadians < 0)
  ) throw failure("CAMERA_INPUT_INVALID");
  const yawRadians = delta[0] + ratio[0] * rates.orbitRateRadiansPerSecond * deltaSeconds;
  const pitchRadians = delta[1]
    + ratio[1] * (rates.orbitPitchRateRadiansPerSecond ?? rates.orbitRateRadiansPerSecond) * deltaSeconds;
  const active = !!input.movement || yawRadians !== 0 || pitchRadians !== 0 || (input.zoomDeltaMeters ?? 0) !== 0;
  return { yawRadians, pitchRadians, pointerPitchRadians: delta[1],
    orbitPitchMaxOffsetRadians: input.orbitPitchMaxOffsetRadians,
    zoomMeters: input.zoomDeltaMeters ?? 0, active };
}

/** Compute intent and movement heading from the activated view. Collision cannot steer movement. */
export function prepareCameraControl(
  input: CameraStrategyInput<CameraKind>,
  delta: CameraInputDelta,
  controlViewId: string,
): { readonly intent: CameraIntent; readonly basis: CameraControlBasis } {
  const seed = input.intent;
  let boundedPitch = delta.pitchRadians;
  if (delta.orbitPitchMaxOffsetRadians !== undefined) {
    const { configuration, opening } = input;
    const center = configuration.kind === 'third-person' && configuration.values.framing.kind === 'preserve-opening'
      ? opening!.pitchRadians : configuration.values.orientation.initialPitchRadians;
    const limit = delta.orbitPitchMaxOffsetRadians, ratioPitch = delta.pitchRadians - delta.pointerPitchRadians;
    // Only bound ratio input; a mouse orbit outside the range can return gradually.
    boundedPitch = delta.pointerPitchRadians + (ratioPitch < 0
      ? Math.max(ratioPitch, Math.min(0, center - limit - seed.pitchRadians))
      : Math.min(ratioPitch, Math.max(0, center + limit - seed.pitchRadians)));
  }
  const intent = prepareCameraIntent({
    ...input,
    intent: {
      ...seed,
      yawRadians: seed.yawRadians + delta.yawRadians,
      pitchRadians: seed.pitchRadians + boundedPitch,
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
