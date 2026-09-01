import { Camera } from "@babylonjs/core/Cameras/camera.js";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera.js";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type {
  BabylonNativeBlockMaterializerMetadataV1,
  FormalArtifactViewRequestV1,
  FormalOpeningObservationV1,
  FormalSemanticCaptureMapV1,
  FormalWorldCaptureViewIdV1,
} from "@whitebox-world/runtime-contracts";

import { fitOrthographicBoundsToWorldExtentsV1 } from "./formal-world-camera.js";

export interface FormalWorldCaptureLiveVisualGroupV1 {
  readonly visualGroupId: string;
  readonly meshes: readonly Mesh[];
}

export interface FormalWorldCaptureMeasurementInputV1 {
  readonly view: FormalArtifactViewRequestV1;
  readonly camera: Camera;
  readonly materializerMetadata: Pick<
    BabylonNativeBlockMaterializerMetadataV1,
    | "authoringManifestHash"
    | "checkedLayoutInventoryHash"
    | "contributionHash"
    | "visualGroups"
  >;
  readonly semanticCaptureMap: Pick<FormalSemanticCaptureMapV1, "bindings">;
  readonly liveHandleRegistry: Readonly<{
    visualGroups: readonly FormalWorldCaptureLiveVisualGroupV1[];
  }>;
}

export interface FormalWorldCaptureViewMeasurementV1 {
  readonly viewId: FormalWorldCaptureViewIdV1;
  readonly visualGroups: FormalOpeningObservationV1["visualGroups"];
}

type MeasuredVisualGroupV1 = FormalOpeningObservationV1["visualGroups"][number];
type FormalWorldArtifactViewRequestV1 = Extract<
  FormalArtifactViewRequestV1,
  { viewId: "world-side" | "world-top-down" }
>;

const LIVE_CAMERA_ALIGNMENT_TOLERANCE = 1e-6;

interface LiveCameraPoseV1 {
  readonly position: Vector3;
  readonly forward: Vector3;
  readonly viewMatrix: Matrix;
  readonly transform: Matrix;
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(section: string, message: string): never {
  throw new TypeError(
    `BABYLON_FORMAL_WORLD_CAPTURE_MEASUREMENT_INVALID: ${section}: ${message}`,
  );
}

function uniqueById<T>(
  values: readonly T[],
  idOf: (value: T) => string,
  section: string,
): ReadonlyMap<string, T> {
  const output = new Map<string, T>();
  for (const value of values) {
    const id = idOf(value);
    if (output.has(id)) fail(section, `duplicate visualGroupId ${id}`);
    output.set(id, value);
  }
  return output;
}

function assertExactIds(
  expectedIds: readonly string[],
  actualIds: readonly string[],
  section: string,
): void {
  const expected = [...expectedIds].sort(stableCompare);
  const actual = [...actualIds].sort(stableCompare);
  if (
    expected.length !== actual.length ||
    expected.some((id, index) => id !== actual[index])
  ) {
    fail(
      section,
      `expected [${expected.join(",")}] but received [${actual.join(",")}]`,
    );
  }
}

function assertFiniteClose(
  actual: number,
  expected: number,
  section: string,
  message: string,
): void {
  if (
    !Number.isFinite(actual) ||
    !Number.isFinite(expected) ||
    Math.abs(actual - expected) > LIVE_CAMERA_ALIGNMENT_TOLERANCE
  ) {
    fail(section, message);
  }
}

function assertEmptyVisualInventory(
  input: FormalWorldCaptureMeasurementInputV1,
): void {
  if (
    input.materializerMetadata.visualGroups.length === 0 ||
    input.semanticCaptureMap.bindings.length === 0 ||
    input.liveHandleRegistry.visualGroups.length === 0
  ) {
    fail("VISUAL_INVENTORY", "visual inventory is empty");
  }
}

function assertCameraProjection(
  view: FormalArtifactViewRequestV1,
  camera: Camera,
): void {
  const expectedMode = view.projection === "perspective"
    ? Camera.PERSPECTIVE_CAMERA
    : Camera.ORTHOGRAPHIC_CAMERA;
  if (camera.mode !== expectedMode) {
    fail(
      "CAMERA_PROJECTION",
      `${view.viewId} requires ${view.projection}`,
    );
  }
  const engine = camera.getEngine();
  if (
    engine.getRenderWidth(true) !== view.widthPixels ||
    engine.getRenderHeight(true) !== view.heightPixels
  ) {
    fail("CAMERA_PROJECTION", "render target dimensions do not match the formal view");
  }
  const hardwareScalingLevel = engine.getHardwareScalingLevel();
  if (!Number.isFinite(hardwareScalingLevel) || hardwareScalingLevel <= 0) {
    fail("CAMERA_PROJECTION", "engine hardwareScalingLevel must be a positive finite value");
  }
  assertFiniteClose(
    1 / hardwareScalingLevel,
    view.devicePixelRatio,
    "CAMERA_PROJECTION",
    "devicePixelRatio does not match the live engine",
  );
}

function isWorldArtifactView(
  view: FormalArtifactViewRequestV1,
): view is FormalWorldArtifactViewRequestV1 {
  return view.viewId === "world-side" || view.viewId === "world-top-down";
}

function liveCameraPose(
  camera: Camera,
  scene: Scene,
): LiveCameraPoseV1 {
  // Babylon 9.23.0 Camera.getViewMatrix(true) always sets _hasMoved, bumps
  // _childUpdateId, marks _refreshFrustumPlanes, notifies observers, and
  // rewrites _globalPosition. getDirection() goes through getWorldMatrix()
  // and the same path. There is no public view compute-to-ref API, so
  // rebuild the view with the same LookAt* helpers Camera uses.
  // getProjectionMatrix() without force is the non-mutating read when the
  // matrix is frozen or already synced, and it is the only public way to
  // honor freezeProjectionMatrix. Reject minZ <= 0 first: the installed
  // getter would otherwise rewrite minZ to 0.1.
  if (!(camera instanceof TargetCamera) || camera.parent !== null) {
    fail("CAMERA_PROJECTION", "measurement requires an unparented TargetCamera");
  }
  if (camera.oblique !== null) {
    fail("CAMERA_PROJECTION", "oblique projection is not admitted for formal measurement");
  }
  if (!Number.isFinite(camera.minZ) || camera.minZ <= 0) {
    fail("CAMERA_PROJECTION", "minZ must be a positive finite near plane");
  }
  if (!camera.ignoreCameraMaxZ && (!Number.isFinite(camera.maxZ) || camera.maxZ <= camera.minZ)) {
    fail("CAMERA_PROJECTION", "maxZ must be a finite far plane beyond minZ");
  }
  const rotation = new Matrix();
  if (camera.rotationQuaternion != null) {
    camera.rotationQuaternion.toRotationMatrix(rotation);
  } else {
    Matrix.RotationYawPitchRollToRef(
      camera.rotation.y,
      camera.rotation.x,
      camera.rotation.z,
      rotation,
    );
  }
  const forward = Vector3.TransformNormal(
    scene.useRightHandedSystem
      ? Vector3.RightHandedForwardReadOnly
      : Vector3.LeftHandedForwardReadOnly,
    rotation,
  );
  if (
    ![camera.position.x, camera.position.y, camera.position.z,
      forward.x, forward.y, forward.z].every(Number.isFinite) ||
    forward.lengthSquared() === 0
  ) fail("CAMERA_PROJECTION", "camera position or forward direction is invalid");
  forward.normalize();
  const viewMatrix = new Matrix();
  const target = camera.position.add(forward);
  if (scene.useRightHandedSystem) {
    Matrix.LookAtRHToRef(camera.position, target, camera.upVector, viewMatrix);
  } else {
    Matrix.LookAtLHToRef(camera.position, target, camera.upVector, viewMatrix);
  }
  const projectionMatrix = camera.getProjectionMatrix();
  if (
    !viewMatrix.asArray().every(Number.isFinite) ||
    !projectionMatrix.asArray().every(Number.isFinite)
  ) {
    fail("CAMERA_PROJECTION", "camera view or projection matrix is non-finite");
  }
  return Object.freeze({
    position: camera.position.clone(),
    forward,
    viewMatrix,
    transform: viewMatrix.multiply(projectionMatrix),
  });
}

function assertWorldViewMatchesLive(
  view: FormalWorldArtifactViewRequestV1,
  camera: Camera,
  pose: LiveCameraPoseV1,
): void {
  assertFiniteClose(
    pose.position.x,
    view.cameraPositionMetersXYZ[0],
    "CAMERA_PROJECTION",
    `${view.viewId} live camera position does not match the formal request`,
  );
  assertFiniteClose(
    pose.position.y,
    view.cameraPositionMetersXYZ[1],
    "CAMERA_PROJECTION",
    `${view.viewId} live camera position does not match the formal request`,
  );
  assertFiniteClose(
    pose.position.z,
    view.cameraPositionMetersXYZ[2],
    "CAMERA_PROJECTION",
    `${view.viewId} live camera position does not match the formal request`,
  );

  const declaredForward = new Vector3(
    view.targetMetersXYZ[0] - view.cameraPositionMetersXYZ[0],
    view.targetMetersXYZ[1] - view.cameraPositionMetersXYZ[1],
    view.targetMetersXYZ[2] - view.cameraPositionMetersXYZ[2],
  );
  if (declaredForward.lengthSquared() === 0) {
    fail(
      "CAMERA_PROJECTION",
      `${view.viewId} declared camera target is coincident with position`,
    );
  }
  declaredForward.normalize();
  assertFiniteClose(
    pose.forward.x,
    declaredForward.x,
    "CAMERA_PROJECTION",
    `${view.viewId} live camera target does not match the formal request`,
  );
  assertFiniteClose(
    pose.forward.y,
    declaredForward.y,
    "CAMERA_PROJECTION",
    `${view.viewId} live camera target does not match the formal request`,
  );
  assertFiniteClose(
    pose.forward.z,
    declaredForward.z,
    "CAMERA_PROJECTION",
    `${view.viewId} live camera target does not match the formal request`,
  );

  if (
    camera.orthoLeft === null ||
    camera.orthoRight === null ||
    camera.orthoBottom === null ||
    camera.orthoTop === null
  ) {
    fail("CAMERA_PROJECTION", `${view.viewId} live camera is missing orthographic bounds`);
  }
  const fitted = fitOrthographicBoundsToWorldExtentsV1(
    view.worldBoundsMeters,
    pose.viewMatrix,
    view.widthPixels / view.heightPixels,
  );
  assertFiniteClose(
    camera.orthoLeft,
    fitted.orthoLeft,
    "CAMERA_PROJECTION",
    `${view.viewId} live ortho does not match declared world bounds`,
  );
  assertFiniteClose(
    camera.orthoRight,
    fitted.orthoRight,
    "CAMERA_PROJECTION",
    `${view.viewId} live ortho does not match declared world bounds`,
  );
  assertFiniteClose(
    camera.orthoBottom,
    fitted.orthoBottom,
    "CAMERA_PROJECTION",
    `${view.viewId} live ortho does not match declared world bounds`,
  );
  assertFiniteClose(
    camera.orthoTop,
    fitted.orthoTop,
    "CAMERA_PROJECTION",
    `${view.viewId} live ortho does not match declared world bounds`,
  );
}

function boundsCorners(
  minimum: readonly [number, number, number],
  maximum: readonly [number, number, number],
): readonly Vector3[] {
  for (let axis = 0; axis < 3; axis += 1) {
    if (
      !Number.isFinite(minimum[axis]) ||
      !Number.isFinite(maximum[axis]) ||
      minimum[axis]! >= maximum[axis]!
    ) fail("PACKAGE_BINDING", "visual-group AABB must be finite and positive");
  }
  return Object.freeze([
    new Vector3(minimum[0], minimum[1], minimum[2]),
    new Vector3(maximum[0], minimum[1], minimum[2]),
    new Vector3(minimum[0], maximum[1], minimum[2]),
    new Vector3(maximum[0], maximum[1], minimum[2]),
    new Vector3(minimum[0], minimum[1], maximum[2]),
    new Vector3(maximum[0], minimum[1], maximum[2]),
    new Vector3(minimum[0], maximum[1], maximum[2]),
    new Vector3(maximum[0], maximum[1], maximum[2]),
  ]);
}

function farClipMeters(camera: Camera): number {
  return camera.ignoreCameraMaxZ ? Number.POSITIVE_INFINITY : camera.maxZ;
}

function projectGroup(
  input: FormalWorldCaptureMeasurementInputV1,
  binding: FormalSemanticCaptureMapV1["bindings"][number],
  materializedGroup: BabylonNativeBlockMaterializerMetadataV1["visualGroups"][number],
  cameraPosition: Vector3,
  cameraForward: Vector3,
  transform: Matrix,
): Omit<MeasuredVisualGroupV1, "depthOrder"> {
  const minimum = materializedGroup.minimumMetersXYZ;
  const maximum = materializedGroup.maximumMetersXYZ;
  const corners = boundsCorners(minimum, maximum);
  const center = new Vector3(
    (minimum[0] + maximum[0]) / 2,
    (minimum[1] + maximum[1]) / 2,
    (minimum[2] + maximum[2]) / 2,
  );
  const cameraDepthMeters = Vector3.Dot(
    center.subtract(cameraPosition),
    cameraForward,
  );
  const farPlaneMeters = farClipMeters(input.camera);
  if (
    !Number.isFinite(cameraDepthMeters) ||
    cameraDepthMeters <= input.camera.minZ
  ) {
    fail("PROJECTION", `${binding.blockVisualGroupId} center is behind the near plane`);
  }
  if (cameraDepthMeters >= farPlaneMeters) {
    fail("PROJECTION", `${binding.blockVisualGroupId} center is beyond the far plane`);
  }

  const viewport = input.camera.viewport.toGlobal(
    input.view.widthPixels,
    input.view.heightPixels,
  );
  if (
    ![viewport.x, viewport.y, viewport.width, viewport.height]
      .every(Number.isFinite) ||
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    viewport.x < 0 ||
    viewport.y < 0 ||
    viewport.x + viewport.width > input.view.widthPixels ||
    viewport.y + viewport.height > input.view.heightPixels
  ) fail("PROJECTION", "camera viewport is outside the formal render target");

  const projected = corners.map((corner) => {
    const cornerDepthMeters = Vector3.Dot(
      corner.subtract(cameraPosition),
      cameraForward,
    );
    if (
      !Number.isFinite(cornerDepthMeters) ||
      cornerDepthMeters <= input.camera.minZ
    ) {
      fail(
        "PROJECTION",
        `${binding.blockVisualGroupId} crosses or is behind the near plane`,
      );
    }
    if (cornerDepthMeters >= farPlaneMeters) {
      fail(
        "PROJECTION",
        `${binding.blockVisualGroupId} crosses or is beyond the far plane`,
      );
    }
    const point = Vector3.Project(
      corner,
      Matrix.IdentityReadOnly,
      transform,
      viewport,
    );
    if (![point.x, point.y, point.z].every(Number.isFinite)) {
      fail("PROJECTION", `${binding.blockVisualGroupId} produced non-finite screen coordinates`);
    }
    return point;
  });

  const viewportMinX = viewport.x;
  const viewportMaxX = viewport.x + viewport.width;
  const viewportMinY = viewport.y;
  const viewportMaxY = viewport.y + viewport.height;
  const projectedMinX = Math.min(...projected.map(({ x }) => x));
  const projectedMaxX = Math.max(...projected.map(({ x }) => x));
  const projectedMinY = Math.min(...projected.map(({ y }) => y));
  const projectedMaxY = Math.max(...projected.map(({ y }) => y));
  if (
    projectedMaxX <= viewportMinX ||
    projectedMinX >= viewportMaxX ||
    projectedMaxY <= viewportMinY ||
    projectedMinY >= viewportMaxY
  ) {
    fail("PROJECTION", `${binding.blockVisualGroupId} is outside the camera viewport`);
  }

  const visibleMinX = Math.max(projectedMinX, viewportMinX);
  const visibleMaxX = Math.min(projectedMaxX, viewportMaxX);
  const visibleMinY = Math.max(projectedMinY, viewportMinY);
  const visibleMaxY = Math.min(projectedMaxY, viewportMaxY);
  const minimumX = visibleMinX / input.view.widthPixels;
  const maximumX = visibleMaxX / input.view.widthPixels;
  const minimumY = visibleMinY / input.view.heightPixels;
  const maximumY = visibleMaxY / input.view.heightPixels;
  const width = maximumX - minimumX;
  const height = maximumY - minimumY;
  if (
    ![minimumX, maximumX, minimumY, maximumY, width, height]
      .every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  ) fail("PROJECTION", `${binding.blockVisualGroupId} has zero projected area`);

  const normalizedBounds = Object.freeze({
    minXBasisPoints: Math.max(0, Math.floor(minimumX * 10_000)),
    minYBasisPoints: Math.max(0, Math.floor(minimumY * 10_000)),
    maxXBasisPoints: Math.min(10_000, Math.ceil(maximumX * 10_000)),
    maxYBasisPoints: Math.min(10_000, Math.ceil(maximumY * 10_000)),
  });
  if (
    normalizedBounds.minXBasisPoints >= normalizedBounds.maxXBasisPoints ||
    normalizedBounds.minYBasisPoints >= normalizedBounds.maxYBasisPoints
  ) fail("PROJECTION", `${binding.blockVisualGroupId} quantizes to zero area`);

  return Object.freeze({
    acceptanceTargetRef: binding.acceptanceTargetRef,
    compositionTargetRef: binding.compositionTargetRef,
    topologyNodeId: binding.topologyNodeId,
    semanticLayerId: binding.semanticLayerId,
    blockVisualGroupId: binding.blockVisualGroupId,
    sourceBoundsMeters: Object.freeze({
      minimumMetersXYZ: Object.freeze([...minimum]) as
        readonly [number, number, number],
      maximumMetersXYZ: Object.freeze([...maximum]) as
        readonly [number, number, number],
    }),
    normalizedBounds,
    normalizedCenter: Object.freeze({
      xBasisPoints: Math.max(
        normalizedBounds.minXBasisPoints,
        Math.min(
          normalizedBounds.maxXBasisPoints,
          Math.round(((minimumX + maximumX) / 2) * 10_000),
        ),
      ),
      yBasisPoints: Math.max(
        normalizedBounds.minYBasisPoints,
        Math.min(
          normalizedBounds.maxYBasisPoints,
          Math.round(((minimumY + maximumY) / 2) * 10_000),
        ),
      ),
    }),
    coverageBasisPoints: Math.max(
      1,
      Math.min(10_000, Math.floor(width * height * 10_000)),
    ),
    cameraDepthMeters,
  });
}

export function measureFormalWorldCaptureViewV1(
  input: FormalWorldCaptureMeasurementInputV1,
): FormalWorldCaptureViewMeasurementV1 {
  assertCameraProjection(input.view, input.camera);
  assertEmptyVisualInventory(input);

  const materializedById = uniqueById(
    input.materializerMetadata.visualGroups,
    ({ visualGroupId }) => visualGroupId,
    "PACKAGE_BINDING",
  );
  const bindingById = uniqueById(
    input.semanticCaptureMap.bindings,
    ({ blockVisualGroupId }) => blockVisualGroupId,
    "PACKAGE_BINDING",
  );
  const liveById = uniqueById(
    input.liveHandleRegistry.visualGroups,
    ({ visualGroupId }) => visualGroupId,
    "LIVE_VISUAL_GROUPS",
  );
  const materializedIds = [...materializedById.keys()];
  assertExactIds(materializedIds, [...bindingById.keys()], "PACKAGE_BINDING");
  assertExactIds(materializedIds, [...liveById.keys()], "LIVE_VISUAL_GROUPS");

  const scene = input.camera.getScene();
  for (const [visualGroupId, live] of liveById) {
    if (live.meshes.length === 0) {
      fail("LIVE_VISUAL_GROUPS", `${visualGroupId} has no explicit Mesh handle`);
    }
    if (live.meshes.some((mesh) => mesh.isDisposed() || mesh.getScene() !== scene)) {
      fail("LIVE_VISUAL_GROUPS", `${visualGroupId} contains a non-live or foreign Mesh`);
    }
  }

  for (const binding of input.semanticCaptureMap.bindings) {
    const group = materializedById.get(binding.blockVisualGroupId)!;
    if (
      group.acceptanceTargetRef !== binding.acceptanceTargetRef ||
      group.semanticClassId !== binding.semanticClassId ||
      group.identityColorHex !== binding.identityColor ||
      binding.authoringManifestHash !==
        input.materializerMetadata.authoringManifestHash ||
      binding.layoutInventoryHash !==
        input.materializerMetadata.checkedLayoutInventoryHash ||
      binding.contributionHash !== input.materializerMetadata.contributionHash ||
      !binding.requiredWorldViewIds.includes(input.view.viewId)
    ) fail("PACKAGE_BINDING", `${binding.blockVisualGroupId} identity does not match the Package`);
  }

  const pose = liveCameraPose(input.camera, scene);
  if (isWorldArtifactView(input.view)) {
    assertWorldViewMatchesLive(input.view, input.camera, pose);
  }

  const measuredWithoutOrder = input.semanticCaptureMap.bindings.map((binding) =>
    projectGroup(
      input,
      binding,
      materializedById.get(binding.blockVisualGroupId)!,
      pose.position,
      pose.forward,
      pose.transform,
    ));
  const depthRankByTargetRef = new Map(
    [...measuredWithoutOrder]
      .sort((left, right) =>
        left.cameraDepthMeters - right.cameraDepthMeters ||
        stableCompare(left.acceptanceTargetRef, right.acceptanceTargetRef))
      .map((measurement, depthOrder) =>
        [measurement.acceptanceTargetRef, depthOrder] as const),
  );
  const visualGroups = measuredWithoutOrder
    .map((measurement) => Object.freeze({
      ...measurement,
      depthOrder: depthRankByTargetRef.get(measurement.acceptanceTargetRef)!,
    }))
    .sort((left, right) =>
      stableCompare(left.acceptanceTargetRef, right.acceptanceTargetRef));

  return Object.freeze({
    viewId: input.view.viewId,
    visualGroups: Object.freeze(visualGroups),
  });
}
