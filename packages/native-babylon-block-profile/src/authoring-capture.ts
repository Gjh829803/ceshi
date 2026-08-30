import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Viewport } from "@babylonjs/core/Maths/math.viewport.js";
import { Scene } from "@babylonjs/core/scene.js";

import type {
  BabylonNativeBlockProfileCheckResultV1,
  BabylonNativeBlockVisualGroupInventoryV1,
} from "./check.js";
import type { BabylonNativeBlockLayoutV1 } from "./layout.js";
import type { BabylonNativeBlockPositionMetersXYZV1 } from "./shapes.js";
import {
  babylonNativeBlockVisualGroupsMatchV1,
  deriveBabylonNativeBlockVisualGroupsV1,
} from "./babylon-visual-adapter.js";

export type BabylonNativeBlockAuthoringViewIdV1 =
  | "opening"
  | "top-down"
  | "side";

export interface BabylonNativeBlockAuthoringVisualGroupRegionV1 {
  readonly visualGroupId: string;
  readonly minimumNormalizedXY: readonly [number, number];
  readonly maximumNormalizedXY: readonly [number, number];
}

export interface BabylonNativeBlockAuthoringViewV1 {
  readonly id: BabylonNativeBlockAuthoringViewIdV1;
  readonly projection: "perspective" | "orthographic";
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly positionMetersXYZ: BabylonNativeBlockPositionMetersXYZV1;
  readonly targetMetersXYZ: BabylonNativeBlockPositionMetersXYZV1;
  readonly viewMatrix: readonly number[];
  readonly projectionMatrix: readonly number[];
  readonly visualGroupRegions:
    readonly BabylonNativeBlockAuthoringVisualGroupRegionV1[];
}

export interface BabylonNativeBlockAuthoringCaptureV1 {
  readonly kind: "babylon-native-block-authoring-capture";
  readonly schemaVersion: 1;
  readonly scope: "build-epoch-local";
  readonly buildEpochId: string;
  readonly views: readonly BabylonNativeBlockAuthoringViewV1[];
}

export interface CreateBabylonNativeBlockAuthoringCaptureInputV1 {
  readonly scene: Scene;
  readonly buildEpochId: string;
  readonly layout: BabylonNativeBlockLayoutV1;
  readonly checkResult: BabylonNativeBlockProfileCheckResultV1;
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly opening: Readonly<{
    readonly positionMetersXYZ: BabylonNativeBlockPositionMetersXYZV1;
    readonly targetMetersXYZ: BabylonNativeBlockPositionMetersXYZV1;
    readonly fovDegrees: number;
  }>;
}

const BUILD_EPOCH_ID = /^[a-z0-9][a-z0-9-]{2,79}$/;
const MAXIMUM_CAPTURE_DIMENSION_PIXELS = 16_384;
const NEAR_CLIP_METERS = 0.1;

function fail(code: string, message: string): never {
  throw new TypeError(`${code}: ${message}`);
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalNumber(value: number): number {
  const rounded = Number(value.toFixed(12));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function frozenXYZ(vector: Vector3): BabylonNativeBlockPositionMetersXYZV1 {
  return Object.freeze([
    canonicalNumber(vector.x),
    canonicalNumber(vector.y),
    canonicalNumber(vector.z),
  ]);
}

function frozenMatrix(matrix: Matrix): readonly number[] {
  return Object.freeze(Array.from(matrix.asArray(), canonicalNumber));
}

function finiteXYZ(
  value: readonly number[],
): value is BabylonNativeBlockPositionMetersXYZV1 {
  return value.length === 3 && value.every(Number.isFinite);
}

function layoutBounds(layout: BabylonNativeBlockLayoutV1): Readonly<{
  minimum: Vector3;
  maximum: Vector3;
  center: Vector3;
  diagonalMeters: number;
}> {
  const minimum = new Vector3(
    Math.min(...layout.blocks.map((block) => block.minimumMetersXYZ[0])),
    Math.min(...layout.blocks.map((block) => block.minimumMetersXYZ[1])),
    Math.min(...layout.blocks.map((block) => block.minimumMetersXYZ[2])),
  );
  const maximum = new Vector3(
    Math.max(...layout.blocks.map((block) => block.maximumMetersXYZ[0])),
    Math.max(...layout.blocks.map((block) => block.maximumMetersXYZ[1])),
    Math.max(...layout.blocks.map((block) => block.maximumMetersXYZ[2])),
  );
  return Object.freeze({
    minimum,
    maximum,
    center: minimum.add(maximum).scale(0.5),
    diagonalMeters: Math.max(Vector3.Distance(minimum, maximum), 1),
  });
}

function corners(
  group: BabylonNativeBlockVisualGroupInventoryV1,
): readonly Vector3[] {
  const [minimumX, minimumY, minimumZ] = group.minimumMetersXYZ;
  const [maximumX, maximumY, maximumZ] = group.maximumMetersXYZ;
  return Object.freeze([
    new Vector3(minimumX, minimumY, minimumZ),
    new Vector3(minimumX, minimumY, maximumZ),
    new Vector3(minimumX, maximumY, minimumZ),
    new Vector3(minimumX, maximumY, maximumZ),
    new Vector3(maximumX, minimumY, minimumZ),
    new Vector3(maximumX, minimumY, maximumZ),
    new Vector3(maximumX, maximumY, minimumZ),
    new Vector3(maximumX, maximumY, maximumZ),
  ]);
}

function projectedRegions(
  viewId: BabylonNativeBlockAuthoringViewIdV1,
  groups: readonly BabylonNativeBlockVisualGroupInventoryV1[],
  view: Matrix,
  projection: Matrix,
): readonly BabylonNativeBlockAuthoringVisualGroupRegionV1[] {
  const transform = view.multiply(projection);
  const viewport = new Viewport(0, 0, 1, 1);
  return Object.freeze(groups.map((group) => {
    const points = corners(group).map((point) =>
      Vector3.Project(point, Matrix.IdentityReadOnly, transform, viewport));
    const minimumX = Math.max(0, Math.min(1, ...points.map(({ x }) => x)));
    const minimumY = Math.max(0, Math.min(1, ...points.map(({ y }) => y)));
    const maximumX = Math.max(0, Math.min(1, Math.max(...points.map(({ x }) => x))));
    const maximumY = Math.max(0, Math.min(1, Math.max(...points.map(({ y }) => y))));
    if (
      ![minimumX, minimumY, maximumX, maximumY].every(Number.isFinite) ||
      minimumX >= maximumX ||
      minimumY >= maximumY
    ) {
      return fail(
        "WORLDKIT_NATIVE_BLOCK_AUTHORING_CAPTURE_REGION_INVALID",
        `visual group '${group.id}' is outside or degenerate in '${viewId}'`,
      );
    }
    return Object.freeze({
      visualGroupId: group.id,
      minimumNormalizedXY: Object.freeze([
        canonicalNumber(minimumX),
        canonicalNumber(minimumY),
      ] as const),
      maximumNormalizedXY: Object.freeze([
        canonicalNumber(maximumX),
        canonicalNumber(maximumY),
      ] as const),
    });
  }));
}

function createView(input: Readonly<{
  id: BabylonNativeBlockAuthoringViewIdV1;
  projectionKind: "perspective" | "orthographic";
  widthPixels: number;
  heightPixels: number;
  position: Vector3;
  target: Vector3;
  up: Vector3;
  projection: Matrix;
  visualGroups: readonly BabylonNativeBlockVisualGroupInventoryV1[];
}>): BabylonNativeBlockAuthoringViewV1 {
  const view = Matrix.LookAtLH(input.position, input.target, input.up);
  return Object.freeze({
    id: input.id,
    projection: input.projectionKind,
    widthPixels: input.widthPixels,
    heightPixels: input.heightPixels,
    positionMetersXYZ: frozenXYZ(input.position),
    targetMetersXYZ: frozenXYZ(input.target),
    viewMatrix: frozenMatrix(view),
    projectionMatrix: frozenMatrix(input.projection),
    visualGroupRegions: projectedRegions(
      input.id,
      input.visualGroups,
      view,
      input.projection,
    ),
  });
}

export function createBabylonNativeBlockAuthoringCaptureV1(
  input: CreateBabylonNativeBlockAuthoringCaptureInputV1,
): BabylonNativeBlockAuthoringCaptureV1 {
  if (
    !(input.scene instanceof Scene) ||
    input.scene.isDisposed ||
    !BUILD_EPOCH_ID.test(input.buildEpochId) ||
    !Number.isSafeInteger(input.widthPixels) ||
    input.widthPixels <= 0 ||
    input.widthPixels > MAXIMUM_CAPTURE_DIMENSION_PIXELS ||
    !Number.isSafeInteger(input.heightPixels) ||
    input.heightPixels <= 0 ||
    input.heightPixels > MAXIMUM_CAPTURE_DIMENSION_PIXELS ||
    !finiteXYZ(input.opening.positionMetersXYZ) ||
    !finiteXYZ(input.opening.targetMetersXYZ) ||
    !Number.isFinite(input.opening.fovDegrees) ||
    input.opening.fovDegrees <= 1 ||
    input.opening.fovDegrees >= 179 ||
    input.layout.blocks.length === 0 ||
    input.layout.issues.length > 0 ||
    input.checkResult.outcome !== "passed"
  ) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_AUTHORING_CAPTURE_INVALID",
      "capture input must be one live, finite, issue-free Build Epoch layout",
    );
  }
  const openingPosition = Vector3.FromArray(input.opening.positionMetersXYZ);
  const openingTarget = Vector3.FromArray(input.opening.targetMetersXYZ);
  if (Vector3.DistanceSquared(openingPosition, openingTarget) <= 1e-12) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_AUTHORING_CAPTURE_INVALID",
      "opening position and target must differ",
    );
  }
  const expectedGroups = deriveBabylonNativeBlockVisualGroupsV1(input.layout);
  const sortedGroups = Object.freeze([
    ...input.checkResult.visualGroups,
  ].sort((left, right) => stableCompare(left.id, right.id)));
  if (!babylonNativeBlockVisualGroupsMatchV1(expectedGroups, sortedGroups)) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_AUTHORING_CAPTURE_GROUP_MISMATCH",
      "visualGroups must exactly describe the checked in-memory layout",
    );
  }

  const bounds = layoutBounds(input.layout);
  const aspect = input.widthPixels / input.heightPixels;
  const spanX = bounds.maximum.x - bounds.minimum.x;
  const spanY = bounds.maximum.y - bounds.minimum.y;
  const spanZ = bounds.maximum.z - bounds.minimum.z;
  const orthographicHeight = Math.max(
    spanY,
    spanZ,
    spanX / aspect,
    1,
  ) * 1.25;
  const orthographicWidth = orthographicHeight * aspect;
  const orthographicProjection = Matrix.OrthoOffCenterLH(
    -orthographicWidth / 2,
    orthographicWidth / 2,
    -orthographicHeight / 2,
    orthographicHeight / 2,
    NEAR_CLIP_METERS,
    bounds.diagonalMeters * 6,
  );
  const topPosition = bounds.center.add(new Vector3(
    0,
    bounds.diagonalMeters * 2,
    0,
  ));
  const sidePosition = bounds.center.add(new Vector3(
    0,
    0,
    bounds.diagonalMeters * 2,
  ));
  const openingProjection = Matrix.PerspectiveFovLH(
    input.opening.fovDegrees * Math.PI / 180,
    aspect,
    NEAR_CLIP_METERS,
    Math.max(
      Vector3.Distance(openingPosition, openingTarget) +
        bounds.diagonalMeters * 4,
      10,
    ),
  );

  return Object.freeze({
    kind: "babylon-native-block-authoring-capture",
    schemaVersion: 1,
    scope: "build-epoch-local",
    buildEpochId: input.buildEpochId,
    views: Object.freeze([
      createView({
        id: "opening",
        projectionKind: "perspective",
        widthPixels: input.widthPixels,
        heightPixels: input.heightPixels,
        position: openingPosition,
        target: openingTarget,
        up: Vector3.Up(),
        projection: openingProjection,
        visualGroups: sortedGroups,
      }),
      createView({
        id: "top-down",
        projectionKind: "orthographic",
        widthPixels: input.widthPixels,
        heightPixels: input.heightPixels,
        position: topPosition,
        target: bounds.center,
        up: Vector3.Forward(),
        projection: orthographicProjection,
        visualGroups: sortedGroups,
      }),
      createView({
        id: "side",
        projectionKind: "orthographic",
        widthPixels: input.widthPixels,
        heightPixels: input.heightPixels,
        position: sidePosition,
        target: bounds.center,
        up: Vector3.Up(),
        projection: orthographicProjection,
        visualGroups: sortedGroups,
      }),
    ]),
  });
}
