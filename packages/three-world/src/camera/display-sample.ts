import { Vector3 } from "three";
import { composeCameraAtPosition } from "./composition";
import type { ResolvedCameraConfiguration } from "../config/camera/index";
import { cameraDisplayAnchor, cameraDisplaySubject } from "./display-anchor";
import { sampleCameraPresentation } from "./presentation";
import { cameraFramesCompatible, type CameraFixedFrame, type PresentationSampleContext, type CameraTransition } from "./state";
import { cameraSubjectHeading } from "./strategies/heading";
import type { CameraIntent, CameraProposal, CameraStrategyHistory } from "./strategies/types";
import type { CameraSubjectFacts } from "./subject";

interface CameraDisplaySampleInput {
  readonly previous: CameraFixedFrame;
  readonly current: CameraFixedFrame;
  readonly configuration: ResolvedCameraConfiguration;
  readonly fixedSubject: CameraSubjectFacts;
  readonly displaySubject: CameraSubjectFacts | undefined;
  readonly history: CameraStrategyHistory | undefined;
  readonly intent: CameraIntent | undefined;
  readonly context: PresentationSampleContext;
  readonly mode: "authored" | "follow-pending" | "follow";
  readonly transition: CameraTransition;
}

/** Samples committed frames and aligns anchors to the displayed subject without advancing state.
 * The controller validates subject identity and projects the result against collision geometry.
 */
export function sampleCameraDisplay({
  previous, current, configuration, fixedSubject, displaySubject, history, intent, context, mode, transition,
}: CameraDisplaySampleInput): { readonly proposal: CameraProposal; readonly subject: CameraSubjectFacts } {
  let subject = displaySubject ?? fixedSubject;
  let proposal = sampleCameraPresentation(previous, current, context);
  if (displaySubject && previous.subjectAnchorWorldMetersXYZ && current.subjectAnchorWorldMetersXYZ) {
    const alpha = context.cut || !cameraFramesCompatible(previous, current) ? 1 : context.alpha;
    const sampled = cameraDisplaySubject(previous.subject!, current.subject!, displaySubject, alpha);
    subject = sampled;
    const fixedAnchor = new Vector3(...previous.subjectAnchorWorldMetersXYZ)
      .lerp(new Vector3(...current.subjectAnchorWorldMetersXYZ), alpha);
    // Preserve the displayed-heading correction. Posture facts use the same
    // pair of fixed samples, never the latest un-interpolated height.
    const displayHeading = cameraSubjectHeading(sampled, history) ?? history?.headingRadians;
    const orbitYaw = (previous.orbitYawRadians ?? intent!.yawRadians)
      + ((current.orbitYawRadians ?? intent!.yawRadians) - (previous.orbitYawRadians ?? intent!.yawRadians)) * alpha;
    const correction = cameraDisplayAnchor(sampled, configuration, displayHeading, orbitYaw).sub(fixedAnchor);
    const shift = (point: readonly [number, number, number]) => new Vector3(...point).add(correction).toArray();
    proposal = {
      ...proposal,
      positionWorldMetersXYZ: shift(proposal.positionWorldMetersXYZ),
      pivotWorldMetersXYZ: shift(proposal.pivotWorldMetersXYZ),
      lookAtWorldMetersXYZ: shift(proposal.lookAtWorldMetersXYZ),
      ...(proposal.visibilityTargetWorldMetersXYZ ? { visibilityTargetWorldMetersXYZ: shift(proposal.visibilityTargetWorldMetersXYZ) } : {}),
    };
  }
  // Re-aim interpolated look-at frames using the collision reference horizon.
  // Authored framing, blends and exact fixed endpoints retain their declared pose.
  if (mode === 'follow' && transition.kind === 'none' && proposal.composition
    && !context.cut && context.alpha > 0 && context.alpha < 1
    && cameraFramesCompatible(previous, current)
    && (configuration.kind === 'shoulder'
      || (configuration.kind === 'third-person' && configuration.values.framing.kind === 'look-at'))) {
    proposal = composeCameraAtPosition(proposal, proposal.positionWorldMetersXYZ, proposal.collisionComposition);
  }
  return { proposal, subject };
}
