import { Camera } from "@babylonjs/core/Cameras/camera.js";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type {
  BabylonNativeBlockMaterializerMetadataV1,
  FormalArtifactViewRequestV1,
  FormalOpeningObservationV1,
  FormalSemanticCaptureMapV1,
  FormalWorldCaptureViewIdV1,
} from "@whitebox-world/runtime-contracts";

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
  if (
    !Number.isFinite(cameraDepthMeters) ||
    cameraDepthMeters <= input.camera.minZ
  ) {
    fail("PROJECTION", `${binding.blockVisualGroupId} center is behind the near plane`);
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
    const point = Vector3.Project(
      corner,
      Matrix.IdentityReadOnly,
      transform,
      viewport,
    );
    if (![point.x, point.y, point.z].every(Number.isFinite)) {
      fail("PROJECTION", `${binding.blockVisualGroupId} produced non-finite screen coordinates`);
    }
    if (
      point.x < viewport.x ||
      point.x > viewport.x + viewport.width ||
      point.y < viewport.y ||
      point.y > viewport.y + viewport.height
    ) fail("PROJECTION", `${binding.blockVisualGroupId} is outside the camera viewport`);
    return point;
  });

  const minimumX = Math.min(...projected.map(({ x }) => x)) /
    input.view.widthPixels;
  const maximumX = Math.max(...projected.map(({ x }) => x)) /
    input.view.widthPixels;
  const minimumY = Math.min(...projected.map(({ y }) => y)) /
    input.view.heightPixels;
  const maximumY = Math.max(...projected.map(({ y }) => y)) /
    input.view.heightPixels;
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

  const viewMatrix = input.camera.getViewMatrix(true);
  const projectionMatrix = input.camera.getProjectionMatrix(true);
  const transform = viewMatrix.multiply(projectionMatrix);
  const cameraPosition = input.camera.globalPosition.clone();
  const cameraForward = input.camera.getDirection(
    scene.useRightHandedSystem
      ? Vector3.RightHandedForwardReadOnly
      : Vector3.LeftHandedForwardReadOnly,
  );
  if (
    ![cameraPosition.x, cameraPosition.y, cameraPosition.z,
      cameraForward.x, cameraForward.y, cameraForward.z].every(Number.isFinite) ||
    cameraForward.lengthSquared() === 0
  ) fail("CAMERA_PROJECTION", "camera position or forward direction is invalid");
  cameraForward.normalize();

  const measuredWithoutOrder = input.semanticCaptureMap.bindings.map((binding) =>
    projectGroup(
      input,
      binding,
      materializedById.get(binding.blockVisualGroupId)!,
      cameraPosition,
      cameraForward,
      transform,
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
