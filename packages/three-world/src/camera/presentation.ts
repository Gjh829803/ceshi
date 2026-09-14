import { composeCameraAtPosition } from "./composition";
import {
  MathUtils,
  Matrix4,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from "three";
import { readObjectWorldMatrix } from "../camera-observation";
import {
  cameraFramesCompatible,
  type CameraFixedFrame,
  type PresentationSampleContext,
} from "./state";
import type { CameraProposal } from "./strategies/types";

function interpolate(
  source: CameraProposal,
  target: CameraProposal,
  alpha: number,
): CameraProposal {
  if (alpha === 0) return { ...source };
  if (alpha === 1) return { ...target };
  const position = new Vector3(...source.positionWorldMetersXYZ).lerp(
    new Vector3(...target.positionWorldMetersXYZ),
    alpha,
  );
  const orientation = new Quaternion(...source.quaternionWorldXYZW).slerp(
    new Quaternion(...target.quaternionWorldXYZW),
    alpha,
  );
  const vector = (
    a: readonly [number, number, number],
    b: readonly [number, number, number],
  ) => new Vector3(...a).lerp(new Vector3(...b), alpha).toArray();
  // Mixed first-person/orbit transitions retain the ordinary pose blend. A target
  // spread must not silently apply its pivot policy to the source sight direction.
  const { composition: targetComposition, ...targetPose } = target;
  const composition = source.composition && targetComposition ? {
    nominalAimQuaternionWorldXYZW: new Quaternion(...source.composition.nominalAimQuaternionWorldXYZW).slerp(new Quaternion(...targetComposition.nominalAimQuaternionWorldXYZW), alpha).toArray(),
    relativeAimQuaternionXYZW: new Quaternion(...source.composition.relativeAimQuaternionXYZW).slerp(new Quaternion(...targetComposition.relativeAimQuaternionXYZW), alpha).toArray(),
    referenceQuaternionWorldXYZW: new Quaternion(...source.composition.referenceQuaternionWorldXYZW).slerp(new Quaternion(...targetComposition.referenceQuaternionWorldXYZW), alpha).toArray(),
  } : undefined;
  const result: CameraProposal = {
    ...targetPose,
    ...(composition ? { composition } : {}),
    positionWorldMetersXYZ: position.toArray(),
    quaternionWorldXYZW: orientation.toArray(),
    lookAtWorldMetersXYZ: vector(
      source.lookAtWorldMetersXYZ,
      target.lookAtWorldMetersXYZ,
    ),
    pivotWorldMetersXYZ: vector(
      source.pivotWorldMetersXYZ,
      target.pivotWorldMetersXYZ,
    ),
    upWorldXYZ: new Vector3(0, 1, 0).applyQuaternion(orientation).toArray(),
    lens: {
      verticalFovDegrees: MathUtils.lerp(
        source.lens.verticalFovDegrees,
        target.lens.verticalFovDegrees,
        alpha,
      ),
      nearMeters: MathUtils.lerp(
        source.lens.nearMeters,
        target.lens.nearMeters,
        alpha,
      ),
      farMeters: MathUtils.lerp(
        source.lens.farMeters,
        target.lens.farMeters,
        alpha,
      ),
    },
    nominalDistanceMeters: MathUtils.lerp(
      source.nominalDistanceMeters,
      target.nominalDistanceMeters,
      alpha,
    ),
  };
  return composition ? composeCameraAtPosition(result, result.positionWorldMetersXYZ) : result;
}
/** Fixed controller advances transition time; this function only samples it. Constrain afterwards. */
export function blendCameraProposals(
  source: CameraProposal,
  target: CameraProposal,
  progress: number,
): CameraProposal {
  if (!Number.isFinite(progress))
    throw new Error("CAMERA_TRANSITION_PROGRESS_INVALID");
  return interpolate(source, target, MathUtils.smoothstep(progress, 0, 1));
}
/** Pure display interpolation. Controller must statelessly project the result before applying it. */
export function sampleCameraPresentation(
  previous: CameraFixedFrame,
  current: CameraFixedFrame,
  context: PresentationSampleContext,
): CameraProposal {
  if (
    !Number.isFinite(context.alpha) ||
    context.alpha < 0 ||
    context.alpha > 1 ||
    context.previousTick !== previous.simulationTick ||
    context.currentTick !== current.simulationTick
  )
    throw new Error("CAMERA_PRESENTATION_CONTEXT_INVALID");
  const alpha =
    context.cut || !cameraFramesCompatible(previous, current)
      ? 1
      : context.alpha;
  return interpolate(previous, current, alpha);
}

/** Read-only admission check; no ancestor/camera cache is refreshed. Rechecked at each application. */
export function validateCameraParent(camera: PerspectiveCamera): Matrix4 {
  const matrix = camera.parent
    ? readObjectWorldMatrix(camera.parent)
    : new Matrix4();
  const x = new Vector3().setFromMatrixColumn(matrix, 0);
  const y = new Vector3().setFromMatrixColumn(matrix, 1);
  const z = new Vector3().setFromMatrixColumn(matrix, 2);
  const tolerance = 1e-7;
  const rigid =
    matrix.elements.every(Number.isFinite) &&
    [
      x.lengthSq() - 1,
      y.lengthSq() - 1,
      z.lengthSq() - 1,
      x.dot(y),
      x.dot(z),
      y.dot(z),
      matrix.determinant() - 1,
      matrix.elements[3]!,
      matrix.elements[7]!,
      matrix.elements[11]!,
      matrix.elements[15]! - 1,
    ].every((value) => Math.abs(value) <= tolerance);
  const reconstructed = new Matrix4().compose(
    new Vector3().setFromMatrixPosition(matrix),
    new Quaternion().setFromRotationMatrix(matrix),
    new Vector3(1, 1, 1),
  );
  if (
    !rigid ||
    matrix.elements.some(
      (value, i) => Math.abs(value - reconstructed.elements[i]!) > tolerance,
    ) ||
    camera.scale.distanceToSquared(new Vector3(1, 1, 1)) > tolerance * tolerance
  )
    throw new Error("CAMERA_PARENT_MUST_BE_RIGID_UNIT_SCALE");
  return matrix;
}
/** The sole new-runtime rendered camera pose/lens write boundary. */
export function applyCameraPresentation(
  camera: PerspectiveCamera,
  proposal: CameraProposal,
  aspect: number,
): void {
  const parent = validateCameraParent(camera);
  validateCameraProposal(proposal, aspect);
  const lens = proposal.lens;
  const local = parent
    .invert()
    .multiply(
      new Matrix4().compose(
        new Vector3(...proposal.positionWorldMetersXYZ),
        new Quaternion(...proposal.quaternionWorldXYZW),
        new Vector3(1, 1, 1),
      ),
    );
  local.decompose(camera.position, camera.quaternion, camera.scale);
  // CameraLens is the complete supported projection. Author projection modifiers
  // must be admitted/captured before adoption, not retained as hidden lens state.
  camera.zoom = 1;
  camera.filmOffset = 0;
  camera.view = null;
  camera.fov = lens.verticalFovDegrees;
  camera.near = lens.nearMeters;
  camera.far = lens.farMeters;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  camera.updateMatrix();
  camera.updateWorldMatrix(true, false);
  // Externally supplied cameras may disable automatic world cache updates.
  camera.matrixWorld.compose(
    new Vector3(...proposal.positionWorldMetersXYZ),
    new Quaternion(...proposal.quaternionWorldXYZW),
    new Vector3(1, 1, 1),
  );
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
}

/** Pure admission shared by transactional installation and the final camera writer. */
export function validateCameraProposal(
  proposal: CameraProposal,
  aspect: number,
): void {
  const lens = proposal.lens;
  if (
    ![
      ...proposal.positionWorldMetersXYZ,
      ...proposal.quaternionWorldXYZW,
      ...proposal.pivotWorldMetersXYZ,
      ...proposal.lookAtWorldMetersXYZ,
      ...proposal.upWorldXYZ,
      ...(proposal.composition?.nominalAimQuaternionWorldXYZW ?? []),
      ...(proposal.composition?.relativeAimQuaternionXYZW ?? []),
      ...(proposal.composition?.referenceQuaternionWorldXYZW ?? []),
      ...(proposal.visibilityTargetWorldMetersXYZ ?? []),
      proposal.nominalDistanceMeters,
      aspect,
      ...Object.values(lens),
    ].every(Number.isFinite) ||
    Math.abs(new Quaternion(...proposal.quaternionWorldXYZW).lengthSq() - 1) >
      1e-7 ||
    (proposal.composition !== undefined && [proposal.composition.nominalAimQuaternionWorldXYZW, proposal.composition.relativeAimQuaternionXYZW, proposal.composition.referenceQuaternionWorldXYZW].some(value => Math.abs(new Quaternion(...value).lengthSq() - 1) > 1e-7)) ||
    aspect <= 0 ||
    lens.nearMeters <= 0 ||
    lens.farMeters <= lens.nearMeters ||
    lens.verticalFovDegrees <= 0 ||
    lens.verticalFovDegrees >= 180
  )
    throw new Error("CAMERA_PRESENTATION_INVALID");
}
