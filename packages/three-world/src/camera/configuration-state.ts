import {sameCameraReference} from './strategies/heading';
import { Quaternion, Vector3 } from "three";
import {
  resolveCameraConfiguration,
  parseCameraDocument,
  type CameraDocument,
  type ResolvedCameraConfiguration,
} from "../config/camera/index";
import { failure } from "../control-support";
import type { ControllerState } from "./state";
import { cameraPositionAnchor, type CameraSubjectFacts } from "./subject";
import { resolveCameraPosition } from "../config/camera/resolve";
import type {
  CameraIntent,
  CameraOpeningReference,
  CameraProposal,
} from "./strategies/types";
import { prepareCameraIntent } from "./strategies/evaluation";
import { createOpeningReference } from "./strategies/third-person";
import { clampCameraIntent } from "./lifecycle";
export function sameCameraData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = Object.keys(a),
    right = Object.keys(b);
  return (
    left.length === right.length &&
    left.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(b, key) &&
        sameCameraData(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
        ),
    )
  );
}
const equal = sameCameraData;
export function resolve(
  document: CameraDocument,
  viewId: string,
  subject: CameraSubjectFacts,
  opening?: Pick<CameraOpeningReference, "distanceMeters">,
): ResolvedCameraConfiguration {
  const view = document.views[viewId];
  const distance =
    opening?.distanceMeters ??
    (view?.kind === "third-person" && view.opening
      ? new Vector3(...view.opening.positionWorldMetersXYZ).distanceTo(
          cameraPositionAnchor(subject, resolveCameraPosition(document, viewId, subject.id)),
        )
      : undefined);
  return resolveCameraConfiguration(document, {
    viewId,
    subjectId: subject.id,
    subjectGeneration: subject.generation,
    subjectKind: subject.kind,
    availableAnchors: [
      ...(subject.eyeWorldMetersXYZ ? ["eye" as const] : []),
      ...(subject.seatWorldMetersXYZ ? ["seat" as const] : []),
      ...(subject.followPivotWorldMetersXYZ ? ["follow-pivot" as const] : []),
      ...(subject.shoulderEyeWorldMetersXYZ ? ["shoulder-eye" as const] : []),
    ],
    ...(subject.body ? { body: subject.body } : {}),
    headingAvailable: subject.semanticQuaternionWorldXYZW !== undefined,
    velocityAvailable: subject.velocityWorldMetersPerSecondXYZ !== undefined,
    ...(distance === undefined ? {} : { openingDistanceMeters: distance }),
  });
}
export function initialIntent(
  configuration: ResolvedCameraConfiguration,
  subject: CameraSubjectFacts,
  opening?: CameraOpeningReference,
): CameraIntent {
  return prepareCameraIntent({
    configuration,
    subject,
    opening,
    deltaSeconds: 0,
  });
}
export function openingReferences(
  document: CameraDocument,
  initialSubject: CameraSubjectFacts,
  previous: ControllerState,
): Map<string, CameraOpeningReference> {
  const openings = new Map<string, CameraOpeningReference>();
  for (const [viewId, view] of Object.entries(document.views)) {
    if (view.kind !== "third-person" || !view.opening) continue;
    const previousView = previous.document?.views[viewId];
    const old = previous.openings.get(viewId);
    const configuration = resolve(document, viewId, initialSubject);
    if (configuration.kind !== "third-person") continue;
    // Compare declarations on the same initial subject. A cached view may have
    // been resolved for a mounted subject with a different preset or anchor.
    const previousConfiguration = previous.document && previousView?.kind === "third-person"
      ? resolve(previous.document, viewId, initialSubject, previous.initialOpenings.get(viewId))
      : undefined;
    const unchanged =
      old &&
      previousView?.kind === "third-person" &&
      equal(previousView.opening, view.opening) &&
      previousConfiguration && sameOpeningBasis(previousConfiguration, configuration);
    openings.set(
      viewId,
      unchanged ? old : createOpeningReference(initialSubject, configuration),
    );
  }
  return openings;
}
export function sameOpeningBasis(a: ResolvedCameraConfiguration, b: ResolvedCameraConfiguration): boolean {
  return equal(a.values.position.anchor, b.values.position.anchor) &&
    equal(a.values.position.anchorOffset, b.values.position.anchorOffset) &&
    sameCameraReference(a.values.orientation,b.values.orientation);
}
/** Position-only resolution does not admit dormant eye/seat capabilities. */
export function sameDeclaredOpeningAnchor(a: CameraDocument, b: CameraDocument, viewId: string, subject: CameraSubjectFacts): boolean {
  const previous = resolveCameraPosition(a, viewId, subject.id);
  const next = resolveCameraPosition(b, viewId, subject.id);
  return equal(previous.anchor, next.anchor) && equal(previous.anchorOffset, next.anchorOffset);
}
export function validateHotIntent(
  old: ResolvedCameraConfiguration,
  next: ResolvedCameraConfiguration,
  intent: CameraIntent,
): CameraIntent {
  const values = next.values;
  let candidate = { ...intent };
  const fieldChanged = (path: string) =>
    !equal(old.fields[path], next.fields[path]);
  const preserving =
    next.kind === "third-person" &&
    next.values.framing.kind === "preserve-opening";
  if (
    !preserving &&
    next.kind !== "first-person" &&
    fieldChanged("position.distanceMeters")
  )
    candidate.distanceMeters = next.values.position.distanceMeters;
  if (!preserving && fieldChanged("orientation.initialPitchRadians"))
    candidate.pitchRadians = values.orientation.initialPitchRadians;
  const clamped = clampCameraIntent(candidate, next);
  if (!equal(clamped, candidate))
    throw failure(
      "CAMERA_INTENT_OUT_OF_RANGE",
      `View ${next.viewId} needs an explicit distance/angle edit: ${JSON.stringify({ requested: candidate, required: clamped })}`,
    );
  return candidate;
}
export function needsHistoryReset(
  a: ResolvedCameraConfiguration,
  b: ResolvedCameraConfiguration,
): boolean {
  return (
    !equal(a.values.position.anchor, b.values.position.anchor) ||
    !equal(a.values.position.anchorOffset, b.values.position.anchorOffset) ||
    !sameCameraReference(a.values.orientation,b.values.orientation) ||
    !equal(a.values.constraints.collision, b.values.constraints.collision) ||
    ("framing" in a.values &&
      "framing" in b.values &&
      !equal(a.values.framing, b.values.framing))
  );
}

/** Explicit first-install adoption becomes persisted project data, not a second
 * runtime-only opening source. Quaternion/lens are the admitted author pose. */
export function adoptAuthoredOpening(
  document: CameraDocument,
  viewId: string,
  subject: CameraSubjectFacts,
  pose: CameraProposal,
): CameraDocument {
  const view = document.views[viewId];
  if (view?.kind !== "third-person") return document;
  const orientation = new Quaternion(...pose.quaternionWorldXYZW);
  const position = new Vector3(...pose.positionWorldMetersXYZ);
  const resolved = resolve(document, viewId, subject, {
    distanceMeters: position.distanceTo(
      cameraPositionAnchor(subject, resolveCameraPosition(document, viewId, subject.id)),
    ),
  });
  if (
    resolved.kind !== "third-person" ||
    resolved.values.framing.kind !== "preserve-opening"
  )
    return document;
  const candidate = parseCameraDocument({
    ...document,
    views: {
      ...document.views,
      [viewId]: {
        ...view,
        opening: {
          positionWorldMetersXYZ: position.toArray(),
          lookAtWorldMetersXYZ: pose.lookAtWorldMetersXYZ,
          upWorldXYZ: new Vector3(0, 1, 0)
            .applyQuaternion(orientation)
            .toArray(),
          fovDegrees: pose.lens.verticalFovDegrees,
        },
      },
    },
  });
  return candidate;
}
