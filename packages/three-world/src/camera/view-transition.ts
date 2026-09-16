import type { ResolvedCameraConfiguration } from "../config/camera/index";
import { initialIntent } from "./configuration-state";
import { clampCameraIntent } from "./lifecycle";
import type { CameraTransition } from "./state";
import { cameraSubjectHeading, sameCameraReference } from "./strategies/heading";
import type { CameraIntent, CameraOpeningReference, CameraProposal, CameraStrategyHistory } from "./strategies/types";
import type { CameraSubjectFacts } from "./subject";

interface CameraViewTransitionInput {
  readonly configuration: ResolvedCameraConfiguration;
  readonly previousConfiguration: ResolvedCameraConfiguration;
  readonly subject: CameraSubjectFacts;
  readonly previousSubject: CameraSubjectFacts;
  readonly opening?: CameraOpeningReference | undefined;
  readonly headingHistory?: CameraStrategyHistory | undefined;
  readonly current?: CameraProposal | undefined;
  readonly requestedCut?: boolean | undefined;
}

/** Decide an admitted explicit view selection without querying geometry or publishing state.
 * Active-view no-ops, pending activation and subject identity checks belong to the controller. */
export function planCameraViewTransition(input: CameraViewTransitionInput): {
  readonly intent: CameraIntent;
  readonly transition: CameraTransition;
  readonly cut: boolean;
} {
  const { configuration, subject } = input;
  // Explicit selection starts from the calibrated opening, not cached manual input.
  let intent = initialIntent(configuration, subject, input.opening);
  if (subject.continuousHeadingSeedRadians !== undefined
    && configuration.values.orientation.referenceFrame === "world-up" && !input.opening)
    intent = clampCameraIntent({ ...intent,
      yawRadians: cameraSubjectHeading(subject, input.headingHistory) ?? intent.yawRadians,
    }, configuration);
  const firstPerson = input.previousConfiguration.kind === "first-person" || configuration.kind === "first-person";
  const incompatible = !sameCameraReference(input.previousConfiguration.values.orientation, configuration.values.orientation);
  const duration = firstPerson || input.requestedCut || incompatible ? 0 : configuration.transition.durationSeconds;
  const transition: CameraTransition = duration > 0 && input.current
    ? {
        kind: "blend",
        source: input.current,
        sourceSubject: input.previousSubject,
        targetViewId: configuration.viewId,
        elapsedSeconds: 0,
        durationSeconds: duration,
        configuredDurationSeconds: configuration.transition.durationSeconds,
        effectiveDurationSeconds: duration,
      }
    : {
        kind: "none",
        configuredDurationSeconds: configuration.transition.durationSeconds,
        effectiveDurationSeconds: 0,
        ...(firstPerson ? { reason: "first-person-cut" as const }
          : input.requestedCut ? { reason: "requested-cut" as const } : {}),
      };
  return { intent, transition, cut: duration === 0 };
}
