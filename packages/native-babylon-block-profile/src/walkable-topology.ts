import type { BabylonNativeTraversalBindingV1 } from
  "@whitebox-world/native-babylon";
import { sha256CanonicalJson, type Sha256HashV1 } from
  "@whitebox-world/protocol";
import { isNil } from "lodash-es";

import { failBabylonNativeBlockProfileBuildV1 as fail } from
  "./build-failure.js";
import type {
  BabylonNativeBlockExposedEdgePolicyV1,
} from "./collider-contribution.js";
import type {
  BabylonNativeBlockLogicalColliderGroupV1,
  BabylonNativeBlockLogicalGroundModelV1,
  BabylonNativeBlockLogicalSolidOccupancyCellV1,
  BabylonNativeBlockLogicalSupportTopCellV1,
} from "./logical-ground-model.js";
import { BABYLON_NATIVE_BLOCK_OCCUPANCY_GRID_METERS_XYZ_V1 as GRID } from
  "./shapes.js";

export interface BabylonNativeBlockWalkableTopologyPolicyV1 {
  readonly kind: "babylon-native-block-walkable-topology-policy";
  readonly schemaVersion: 1;
  readonly maximumAutoSmoothHeightDeltaMeters: number;
  readonly visualOverlayOffsetMeters: number;
  readonly maximumLogicalColliderCount: number;
  readonly maximumColliderVertexCount: number;
  readonly maximumColliderTriangleCount: number;
}

export interface BabylonNativeBlockTopologyGeometryV1 {
  readonly logicalColliderId: string;
  readonly sourceBlockIds: readonly string[];
  readonly visualGroupIds: readonly string[];
  readonly traversalBinding: BabylonNativeTraversalBindingV1;
  readonly exposedEdgePolicy: BabylonNativeBlockExposedEdgePolicyV1;
  readonly frictionRatio?: number;
  readonly restitutionRatio?: number;
  readonly proxyKind:
    | "continuous-walkable-surface"
    | "exact-solid-union";
  readonly minimumMetersXYZ: readonly [number, number, number];
  readonly maximumMetersXYZ: readonly [number, number, number];
  readonly collisionPositionsMetersXYZ: readonly number[];
  readonly overlayPositionsMetersXYZ: readonly number[];
  readonly triangleIndices: readonly number[];
  readonly sourceCellCount: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly geometryHash: Sha256HashV1;
}

export interface BabylonNativeBlockWalkableTopologyV1 {
  readonly kind: "babylon-native-block-walkable-topology";
  readonly schemaVersion: 1;
  readonly identity: Readonly<{
    readonly logicalGroundModelHash: Sha256HashV1;
    readonly topologyPolicyHash: Sha256HashV1;
  }>;
  readonly walkableGeometries:
    readonly BabylonNativeBlockTopologyGeometryV1[];
  readonly solidGeometries: readonly BabylonNativeBlockTopologyGeometryV1[];
  readonly logicalColliderCount: number;
  readonly colliderVertexCount: number;
  readonly colliderTriangleCount: number;
  readonly removedInternalFaceCount: number;
  readonly topologyHash: Sha256HashV1;
}

export interface BuildBabylonNativeBlockWalkableTopologyInputV1 {
  readonly groundModel: BabylonNativeBlockLogicalGroundModelV1;
  readonly policy: BabylonNativeBlockWalkableTopologyPolicyV1;
}

/** @internal Host/profile policy; not part of the Native authoring API. */
export const BABYLON_NATIVE_BLOCK_CURRENT_WALKABLE_TOPOLOGY_POLICY_V1 =
  Object.freeze({
    kind: "babylon-native-block-walkable-topology-policy" as const,
    schemaVersion: 1 as const,
    maximumAutoSmoothHeightDeltaMeters: 0.3,
    visualOverlayOffsetMeters: 0.004,
    maximumLogicalColliderCount: 4_096,
    maximumColliderVertexCount: 1_048_576,
    maximumColliderTriangleCount: 2_097_152,
  });

const INPUT_CODE = "WORLDKIT_NATIVE_BLOCK_TOPOLOGY_INPUT_INVALID";
const IDENTITY_CODE = "WORLDKIT_NATIVE_BLOCK_TOPOLOGY_IDENTITY_MISMATCH";
const BUDGET_CODE = "WORLDKIT_NATIVE_BLOCK_TOPOLOGY_BUDGET_EXCEEDED";
const CELL = /^-?(?:0|[1-9][0-9]*),-?(?:0|[1-9][0-9]*),-?(?:0|[1-9][0-9]*)$/;
const EPSILON = 1e-8;

type Position = readonly [number, number, number];

interface GeometryAccumulator {
  readonly group: BabylonNativeBlockLogicalColliderGroupV1;
  readonly proxyKind: BabylonNativeBlockTopologyGeometryV1["proxyKind"];
  readonly positions: number[];
  readonly indices: number[];
  readonly vertexIndexByKey: Map<string, number>;
  readonly sourceCellKeys: Set<string>;
}

interface SupportCell {
  readonly source: BabylonNativeBlockLogicalSupportTopCellV1;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly traversalSurfaceProfileRef: string;
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalNumber(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function cellCoordinates(key: string): readonly [number, number, number] {
  if (!CELL.test(key)) return fail(INPUT_CODE, `cell key '${key}' is invalid`);
  const tuple = key.split(",").map(Number) as [number, number, number];
  if (!tuple.every(Number.isSafeInteger)) {
    return fail(INPUT_CODE, `cell key '${key}' exceeds safe integer range`);
  }
  return tuple;
}

function cellKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function traversalBindingKey(binding: BabylonNativeTraversalBindingV1): string {
  return sha256CanonicalJson(binding);
}

function positionKey(position: Position): string {
  return position.map(canonicalNumber).join(",");
}

function addVertex(
  accumulator: GeometryAccumulator,
  position: Position,
): number {
  const key = positionKey(position);
  const prior = accumulator.vertexIndexByKey.get(key);
  if (!isNil(prior)) return prior;
  const index = accumulator.positions.length / 3;
  accumulator.positions.push(...position.map(canonicalNumber));
  accumulator.vertexIndexByKey.set(key, index);
  return index;
}

function addUpwardTopQuad(
  accumulator: GeometryAccumulator,
  corners: readonly [Position, Position, Position, Position],
): void {
  const indexes = corners.map((corner) => addVertex(accumulator, corner));
  const diagonalZeroTwoDelta = Math.abs(corners[0][1] - corners[2][1]);
  const diagonalOneThreeDelta = Math.abs(corners[1][1] - corners[3][1]);
  if (diagonalOneThreeDelta < diagonalZeroTwoDelta) {
    accumulator.indices.push(
      indexes[0]!, indexes[1]!, indexes[3]!,
      indexes[1]!, indexes[2]!, indexes[3]!,
    );
    return;
  }
  accumulator.indices.push(
    indexes[0]!, indexes[2]!, indexes[3]!,
    indexes[0]!, indexes[1]!, indexes[2]!,
  );
}

function addOrientedQuad(
  accumulator: GeometryAccumulator,
  corners: readonly [Position, Position, Position, Position],
  winding: "forward" | "reverse",
): void {
  const indexes = corners.map((corner) => addVertex(accumulator, corner));
  if (winding === "forward") {
    accumulator.indices.push(
      indexes[0]!, indexes[2]!, indexes[3]!,
      indexes[0]!, indexes[1]!, indexes[2]!,
    );
    return;
  }
  accumulator.indices.push(
    indexes[0]!, indexes[2]!, indexes[1]!,
    indexes[0]!, indexes[3]!, indexes[2]!,
  );
}

function quad(
  first: Position,
  second: Position,
  third: Position,
  fourth: Position,
): readonly [Position, Position, Position, Position] {
  return Object.freeze([first, second, third, fourth]);
}

function bounds(positions: readonly number[]): Readonly<{
  minimumMetersXYZ: Position;
  maximumMetersXYZ: Position;
}> {
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (let offset = 0; offset < positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis]!, positions[offset + axis]!);
      maximum[axis] = Math.max(maximum[axis]!, positions[offset + axis]!);
    }
  }
  return Object.freeze({
    minimumMetersXYZ: Object.freeze(minimum.map(canonicalNumber)) as Position,
    maximumMetersXYZ: Object.freeze(maximum.map(canonicalNumber)) as Position,
  });
}

function freezeGeometry(
  accumulator: GeometryAccumulator,
  visualOverlayOffsetMeters: number,
): BabylonNativeBlockTopologyGeometryV1 {
  if (accumulator.indices.length === 0) {
    return fail(INPUT_CODE,
      `logical Collider '${accumulator.group.colliderId}' has empty topology`);
  }
  const collisionPositionsMetersXYZ = Object.freeze(
    accumulator.positions.map(canonicalNumber),
  );
  const overlayPositionsMetersXYZ = Object.freeze(
    collisionPositionsMetersXYZ.map((value, index) =>
      index % 3 === 1
        ? canonicalNumber(value + visualOverlayOffsetMeters)
        : value),
  );
  const triangleIndices = Object.freeze([...accumulator.indices]);
  const body = Object.freeze({
    logicalColliderId: accumulator.group.colliderId,
    sourceBlockIds: accumulator.group.sourceBlockIds,
    visualGroupIds: accumulator.group.visualGroupIds,
    traversalBinding: accumulator.group.traversalBinding,
    exposedEdgePolicy: accumulator.group.exposedEdgePolicy,
    ...(!Object.hasOwn(accumulator.group, "frictionRatio")
      ? {}
      : { frictionRatio: accumulator.group.frictionRatio }),
    ...(!Object.hasOwn(accumulator.group, "restitutionRatio")
      ? {}
      : { restitutionRatio: accumulator.group.restitutionRatio }),
    proxyKind: accumulator.proxyKind,
    ...bounds(collisionPositionsMetersXYZ),
    collisionPositionsMetersXYZ,
    overlayPositionsMetersXYZ,
    triangleIndices,
    sourceCellCount: accumulator.sourceCellKeys.size,
    vertexCount: collisionPositionsMetersXYZ.length / 3,
    triangleCount: triangleIndices.length / 3,
  });
  return Object.freeze({
    ...body,
    geometryHash: sha256CanonicalJson(body) as Sha256HashV1,
  });
}

function parsePolicy(
  input: BabylonNativeBlockWalkableTopologyPolicyV1,
): BabylonNativeBlockWalkableTopologyPolicyV1 {
  const keys = [
    "kind",
    "schemaVersion",
    "maximumAutoSmoothHeightDeltaMeters",
    "visualOverlayOffsetMeters",
    "maximumLogicalColliderCount",
    "maximumColliderVertexCount",
    "maximumColliderTriangleCount",
  ] as const;
  let descriptors: PropertyDescriptorMap;
  try {
    if (
      typeof input !== "object" ||
      isNil(input) ||
      Array.isArray(input) ||
      Reflect.getPrototypeOf(input) !== Object.prototype ||
      Reflect.ownKeys(input).some((key) => typeof key !== "string")
    ) return fail(INPUT_CODE, "topology policy must be one plain record");
    descriptors = Object.getOwnPropertyDescriptors(input);
  } catch {
    return fail(INPUT_CODE, "topology policy cannot be inspected safely");
  }
  if (
    Object.keys(descriptors).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(descriptors, key)) ||
    Object.values(descriptors).some((descriptor) =>
      !descriptor.enumerable || !("value" in descriptor))
  ) return fail(INPUT_CODE, "topology policy must use the closed field set");
  const policy = Object.freeze(Object.fromEntries(keys.map((key) =>
    [key, descriptors[key]!.value]))) as unknown as
    BabylonNativeBlockWalkableTopologyPolicyV1;
  if (
    policy.kind !== "babylon-native-block-walkable-topology-policy" ||
    policy.schemaVersion !== 1
  ) return fail(INPUT_CODE, "topology policy uses an unsupported contract");
  for (const [key, value] of Object.entries(policy)) {
    if (key === "kind" || key === "schemaVersion") continue;
    if (!Number.isFinite(value) || value < 0 || Object.is(value, -0)) {
      return fail(INPUT_CODE, `topology policy '${key}' is invalid`);
    }
  }
  if (
    !Number.isSafeInteger(policy.maximumLogicalColliderCount) ||
    !Number.isSafeInteger(policy.maximumColliderVertexCount) ||
    !Number.isSafeInteger(policy.maximumColliderTriangleCount) ||
    policy.maximumLogicalColliderCount === 0 ||
    policy.maximumColliderVertexCount === 0 ||
    policy.maximumColliderTriangleCount === 0
  ) return fail(INPUT_CODE, "topology budgets must be positive safe integers");
  return policy;
}

function createAccumulator(
  group: BabylonNativeBlockLogicalColliderGroupV1,
  proxyKind: BabylonNativeBlockTopologyGeometryV1["proxyKind"],
): GeometryAccumulator {
  return {
    group,
    proxyKind,
    positions: [],
    indices: [],
    vertexIndexByKey: new Map(),
    sourceCellKeys: new Set(),
  };
}

const SOLID_FACE_DIRECTIONS = Object.freeze([
  Object.freeze({ axis: "negative-x", delta: [-1, 0, 0] as const }),
  Object.freeze({ axis: "positive-x", delta: [1, 0, 0] as const }),
  Object.freeze({ axis: "negative-y", delta: [0, -1, 0] as const }),
  Object.freeze({ axis: "positive-y", delta: [0, 1, 0] as const }),
  Object.freeze({ axis: "negative-z", delta: [0, 0, -1] as const }),
  Object.freeze({ axis: "positive-z", delta: [0, 0, 1] as const }),
] as const);

function solidFace(
  axis: typeof SOLID_FACE_DIRECTIONS[number]["axis"],
  minimum: Position,
  maximum: Position,
): Readonly<{
  corners: readonly [Position, Position, Position, Position];
  winding: "forward" | "reverse";
}> {
  const [x0, y0, z0] = minimum;
  const [x1, y1, z1] = maximum;
  switch (axis) {
    case "negative-x": return Object.freeze({
      corners: quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]),
      winding: "reverse" as const,
    });
    case "positive-x": return Object.freeze({
      corners: quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]),
      winding: "forward" as const,
    });
    case "negative-y": return Object.freeze({
      corners: quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]),
      winding: "reverse" as const,
    });
    case "positive-y": return Object.freeze({
      corners: quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]),
      winding: "forward" as const,
    });
    case "negative-z": return Object.freeze({
      corners: quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]),
      winding: "forward" as const,
    });
    case "positive-z": return Object.freeze({
      corners: quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]),
      winding: "reverse" as const,
    });
  }
}

export function buildBabylonNativeBlockWalkableTopologyV1(
  input: BuildBabylonNativeBlockWalkableTopologyInputV1,
): BabylonNativeBlockWalkableTopologyV1 {
  const policy = parsePolicy(input.policy);
  const { logicalGroundModelHash, ...groundBody } = input.groundModel;
  if (sha256CanonicalJson(groundBody) !== logicalGroundModelHash) {
    return fail(IDENTITY_CODE, "logical Ground Model hash is stale");
  }
  const groupByColliderId = new Map(
    input.groundModel.colliderGroups.map((group) =>
      [group.colliderId, group] as const),
  );
  if (groupByColliderId.size !== input.groundModel.colliderGroups.length) {
    return fail(INPUT_CODE, "logical Collider IDs must be unique");
  }

  const supportCells: SupportCell[] = input.groundModel.exposedSupportTopCells
    .map((source) => {
      const group = groupByColliderId.get(source.colliderId);
      if (
        isNil(group) ||
        group.traversalBinding.kind !== "static-surface" ||
        traversalBindingKey(group.traversalBinding) !==
          traversalBindingKey(source.traversalBinding)
      ) return fail(INPUT_CODE, "support cells must match one static-surface group");
      const [x, y, z] = cellCoordinates(source.topCellKey);
      return Object.freeze({
        source,
        x,
        y,
        z,
        traversalSurfaceProfileRef:
          source.traversalBinding.traversalSurfaceProfileRef,
      });
    })
    .sort((left, right) =>
      stableCompare(left.source.topCellKey, right.source.topCellKey) ||
      stableCompare(left.source.colliderId, right.source.colliderId));
  const supportKeys = new Set<string>();
  const cornerHeightsByKey = new Map<string, number[]>();
  for (const cell of supportCells) {
    const uniqueKey = `${cell.source.topCellKey}\u0000${cell.source.colliderId}`;
    if (supportKeys.has(uniqueKey)) {
      return fail(INPUT_CODE, "support topology contains duplicate cells");
    }
    supportKeys.add(uniqueKey);
    for (const [cornerX, cornerZ] of [
      [cell.x, cell.z],
      [cell.x + 1, cell.z],
      [cell.x + 1, cell.z + 1],
      [cell.x, cell.z + 1],
    ] as const) {
      const key =
        `${cell.traversalSurfaceProfileRef}:${cornerX},${cornerZ}`;
      const heights = cornerHeightsByKey.get(key) ?? [];
      heights.push(cell.y * GRID[1]);
      cornerHeightsByKey.set(key, heights);
    }
  }
  const walkableByColliderId = new Map<string, GeometryAccumulator>();
  const smoothedHeight = (
    cell: SupportCell,
    cornerX: number,
    cornerZ: number,
  ): number => {
    const heights = cornerHeightsByKey.get(
      `${cell.traversalSurfaceProfileRef}:${cornerX},${cornerZ}`,
    ) ?? [cell.y * GRID[1]];
    const minimum = Math.min(...heights);
    const maximum = Math.max(...heights);
    if (
      maximum - minimum >
        policy.maximumAutoSmoothHeightDeltaMeters + EPSILON
    ) return cell.y * GRID[1];
    return canonicalNumber(
      heights.reduce((sum, value) => sum + value, 0) / heights.length,
    );
  };
  for (const cell of supportCells) {
    const group = groupByColliderId.get(cell.source.colliderId)!;
    let accumulator = walkableByColliderId.get(group.colliderId);
    if (isNil(accumulator)) {
      accumulator = createAccumulator(group, "continuous-walkable-surface");
      walkableByColliderId.set(group.colliderId, accumulator);
    }
    accumulator.sourceCellKeys.add(cell.source.topCellKey);
    const x0 = cell.x * GRID[0];
    const x1 = (cell.x + 1) * GRID[0];
    const z0 = cell.z * GRID[2];
    const z1 = (cell.z + 1) * GRID[2];
    addUpwardTopQuad(accumulator, [
      [x0, smoothedHeight(cell, cell.x, cell.z), z0],
      [x1, smoothedHeight(cell, cell.x + 1, cell.z), z0],
      [x1, smoothedHeight(cell, cell.x + 1, cell.z + 1), z1],
      [x0, smoothedHeight(cell, cell.x, cell.z + 1), z1],
    ]);
  }

  const solidByCellKey = new Map<string,
    BabylonNativeBlockLogicalSolidOccupancyCellV1>();
  for (const solid of input.groundModel.solidOccupancyCells) {
    cellCoordinates(solid.cellKey);
    if (
      solidByCellKey.has(solid.cellKey) ||
      !groupByColliderId.has(solid.colliderId)
    ) return fail(INPUT_CODE, "solid occupancy must be unique and group-bound");
    solidByCellKey.set(solid.cellKey, solid);
  }
  const solidByColliderId = new Map<string, GeometryAccumulator>();
  const walkableColliderIds = new Set(walkableByColliderId.keys());
  let removedInternalFaceCount = 0;
  for (const solid of solidByCellKey.values()) {
    const [x, y, z] = cellCoordinates(solid.cellKey);
    for (const [deltaX, deltaY, deltaZ] of [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ] as const) {
      if (solidByCellKey.has(cellKey(
        x + deltaX,
        y + deltaY,
        z + deltaZ,
      ))) removedInternalFaceCount += 1;
    }
  }
  for (const solid of [...solidByCellKey.values()].sort((left, right) =>
    stableCompare(left.cellKey, right.cellKey))) {
    const group = groupByColliderId.get(solid.colliderId)!;
    if (walkableColliderIds.has(group.colliderId)) continue;
    let accumulator = solidByColliderId.get(group.colliderId);
    if (isNil(accumulator)) {
      accumulator = createAccumulator(group, "exact-solid-union");
      solidByColliderId.set(group.colliderId, accumulator);
    }
    accumulator.sourceCellKeys.add(solid.cellKey);
    const [x, y, z] = cellCoordinates(solid.cellKey);
    const minimum = [x * GRID[0], y * GRID[1], z * GRID[2]] as const;
    const maximum = [
      (x + 1) * GRID[0],
      (y + 1) * GRID[1],
      (z + 1) * GRID[2],
    ] as const;
    for (const direction of SOLID_FACE_DIRECTIONS) {
      const neighborKey = cellKey(
        x + direction.delta[0],
        y + direction.delta[1],
        z + direction.delta[2],
      );
      if (solidByCellKey.has(neighborKey)) {
        continue;
      }
      const face = solidFace(direction.axis, minimum, maximum);
      addOrientedQuad(accumulator, face.corners, face.winding);
    }
  }

  const walkableGeometries = Object.freeze([...walkableByColliderId.values()]
    .sort((left, right) =>
      stableCompare(left.group.colliderId, right.group.colliderId))
    .map((accumulator) => freezeGeometry(
      accumulator,
      policy.visualOverlayOffsetMeters,
    )));
  const solidGeometries = Object.freeze([...solidByColliderId.values()]
    .sort((left, right) =>
      stableCompare(left.group.colliderId, right.group.colliderId))
    .map((accumulator) => freezeGeometry(accumulator, 0)));
  const geometries = [...walkableGeometries, ...solidGeometries];
  const logicalColliderCount = geometries.length;
  const colliderVertexCount = geometries.reduce(
    (sum, geometry) => sum + geometry.vertexCount,
    0,
  );
  const colliderTriangleCount = geometries.reduce(
    (sum, geometry) => sum + geometry.triangleCount,
    0,
  );
  if (
    logicalColliderCount > policy.maximumLogicalColliderCount ||
    colliderVertexCount > policy.maximumColliderVertexCount ||
    colliderTriangleCount > policy.maximumColliderTriangleCount
  ) return fail(BUDGET_CODE,
    `topology uses ${logicalColliderCount} Colliders, ${colliderVertexCount} vertices and ${colliderTriangleCount} triangles`);
  const body = Object.freeze({
    kind: "babylon-native-block-walkable-topology" as const,
    schemaVersion: 1 as const,
    identity: Object.freeze({
      logicalGroundModelHash,
      topologyPolicyHash: sha256CanonicalJson(policy) as Sha256HashV1,
    }),
    walkableGeometries,
    solidGeometries,
    logicalColliderCount,
    colliderVertexCount,
    colliderTriangleCount,
    removedInternalFaceCount,
  });
  return Object.freeze({
    ...body,
    topologyHash: sha256CanonicalJson(body) as Sha256HashV1,
  });
}
