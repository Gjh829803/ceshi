import type { CameraKind, ResolvedCameraConfiguration } from "../config/camera/index";
import { blendCameraProposals } from "./presentation";
import type { CameraTransition } from "./state";
import { evaluateStrategy } from "./strategies/evaluation";
import { evaluateFirstPerson } from "./strategies/first-person";
import type { CameraProposal, CameraStrategyHistory, CameraStrategyInput } from "./strategies/types";

/** Evaluate the ideal pose from sampled facts. No geometry queries or state writes. */
export function evaluateCameraPose(input: CameraStrategyInput<CameraKind>) {
  return input.configuration.kind === "first-person"
    ? evaluateFirstPerson({
        ...input,
        configuration: input.configuration,
        history: input.history as CameraStrategyHistory<"first-person"> | undefined,
      })
    : evaluateStrategy(input);
}

interface CameraDesiredPoseInput {
  readonly configuration: ResolvedCameraConfiguration;
  readonly mode: "authored" | "follow-pending" | "follow";
  readonly pendingPose?: CameraProposal | undefined;
  readonly authoredPose?: CameraProposal | undefined;
  readonly transition: CameraTransition;
  readonly deltaSeconds: number;
}

/** Blend the ideal pose and select pending activation's endpoint before collision.
 * Returns proposed transition state; the controller publishes it only after solving. */
export function resolveCameraDesiredPose(
  proposal: CameraProposal,
  input: CameraDesiredPoseInput,
): { base: CameraProposal; desired: CameraProposal; transition: CameraTransition } {
  let base = proposal;
  let transition = input.transition;
  if (transition.kind === "blend") {
    const elapsed = Math.min(transition.durationSeconds, transition.elapsedSeconds + input.deltaSeconds);
    base = blendCameraProposals(transition.source, base, elapsed / transition.durationSeconds);
    transition = elapsed >= transition.durationSeconds
      ? { kind: "none", configuredDurationSeconds: transition.configuredDurationSeconds, effectiveDurationSeconds: 0 }
      : { ...transition, elapsedSeconds: elapsed };
  }
  const desired = input.mode === "follow-pending"
    ? (input.pendingPose ?? (input.configuration.kind === "third-person" && input.configuration.opening
      ? base : (input.authoredPose ?? base)))
    : base;
  return { base, desired, transition };
}
