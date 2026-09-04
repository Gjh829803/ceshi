import { sha256CanonicalJson, type Sha256HashV1 } from
  "@whitebox-world/protocol";
import type { TraversalCapabilityEnvelopeReceiptV1 } from
  "@whitebox-world/traversal";
import { isNil } from "lodash-es";

import { failBabylonNativeBlockProfileBuildV1 as fail } from
  "./build-failure.js";
import type {
  BabylonNativeBlockLogicalGroundModelV1,
  BabylonNativeBlockLogicalSolidOccupancyCellV1,
  BabylonNativeBlockLogicalSupportTopCellV1,
} from "./logical-ground-model.js";
import type {
  BabylonNativeBlockWalkableTopologyV1,
} from "./walkable-topology.js";
import {
  babylonNativeBlockChunkAxisIndexV1,
  parseBabylonNativeBlockChunkPolicyV1,
  type BabylonNativeBlockChunkPolicyV1,
} from "./chunk-policy.js";
import { BABYLON_NATIVE_BLOCK_OCCUPANCY_GRID_METERS_XYZ_V1 as GRID } from
  "./shapes.js";

export type BabylonNativeBlockGroundStandPositionV1 = readonly [
  xMeters: number,
  yMeters: number,
  zMeters: number,
];

export interface BabylonNativeBlockGroundAnalysisTargetV1 {
  readonly id: string;
  readonly acceptanceTargetRef: string;
  readonly standPositionMetersXYZ: BabylonNativeBlockGroundStandPositionV1;
}

export interface BabylonNativeBlockGroundTraversalBandV1 {
  readonly id: string;
  readonly acceptanceTargetRef: string;
  readonly centerlineStandPositionsMetersXYZ:
    readonly BabylonNativeBlockGroundStandPositionV1[];
  readonly halfWidthMeters: number;
}

export interface BabylonNativeBlockGroundCaseIntentV1 {
  readonly kind: "babylon-native-block-ground-case-intent";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly caseHash: Sha256HashV1;
  readonly groundFailurePolicy: "block-admission" | "measure-only";
  readonly groundModelEvidenceRef: string;
  readonly spawn: Readonly<{
    id: string;
    acceptanceTargetRef: string;
    standPositionMetersXYZ: BabylonNativeBlockGroundStandPositionV1;
    openingYawQuarterTurnsY: 0 | 1 | 2 | 3;
    openingFovDegrees: number;
  }>;
  readonly requiredTargets: readonly BabylonNativeBlockGroundAnalysisTargetV1[];
  readonly requiredTraversalBands:
    readonly BabylonNativeBlockGroundTraversalBandV1[];
  readonly requireSingleReachableComponent: boolean;
}

export interface BabylonNativeBlockGroundStandableNodeV1 {
  readonly id: string;
  readonly topCellKey: string;
  readonly positionMetersXYZ: BabylonNativeBlockGroundStandPositionV1;
  readonly sourceBlockId: string;
  readonly colliderId: string;
  readonly visualGroupId?: string;
  readonly neighborNodeIds: readonly string[];
  readonly componentId: string;
  readonly isReachableFromSpawn: boolean;
}

export interface BabylonNativeBlockGroundAnalysisMetricsV1 {
  readonly supportTopCellCount: number;
  readonly standablePositionCount: number;
  readonly clearanceBlockedPositionCount: number;
  readonly footprintUnsupportedPositionCount: number;
  readonly reachablePositionCount: number;
  readonly disconnectedStandablePositionCount: number;
  readonly componentCount: number;
  readonly requiredTargetCount: number;
  readonly reachableRequiredTargetCount: number;
  readonly requiredTraversalBandCount: number;
  readonly reachableRequiredTraversalBandCount: number;
  readonly reachableStandPositionBoundsMeters: Readonly<{
    readonly minimumMetersXYZ: BabylonNativeBlockGroundStandPositionV1;
    readonly maximumMetersXYZ: BabylonNativeBlockGroundStandPositionV1;
  }> | null;
  readonly reachableHorizontalSpanMetersXZ: readonly [number, number];
  readonly reachableChunkCount: number;
  readonly maximumReachableDistanceMeters: number;
  readonly offCameraReachablePositionCount: number;
  readonly offCameraReachableChunkCount: number;
}

export type BabylonNativeBlockGroundFailureMetricIdV1 =
  | "ground-support-coverage-basis-points"
  | "ground-support-height-millimeters"
  | "ground-clearance-millimeters"
  | "ground-step-up-millimeters"
  | "ground-step-down-millimeters"
  | "ground-spawn-standability"
  | "ground-target-standability"
  | "ground-target-reachability"
  | "ground-traversal-band-reachability"
  | "ground-component-reachability";

export type BabylonNativeBlockGroundFailureDetailsV1 =
  | Readonly<{
      kind: "basis-points-threshold";
      expectedBasisPoints: number;
      actualBasisPoints: number;
      maximumAllowedDriftBasisPoints: number;
      exceededByBasisPoints: number;
      correctionDirection: "increase" | "decrease";
    }>
  | Readonly<{
      kind: "millimeters-threshold";
      expectedMillimeters: number;
      actualMillimeters: number;
      maximumAllowedDriftMillimeters: number;
      exceededByMillimeters: number;
      correctionDirection: "increase" | "decrease";
    }>
  | Readonly<{
      kind: "state-mismatch";
      expectedValue: string;
      actualValue: string;
      correctionDirection: "replace";
    }>;

/**
 * Package-local analysis fact. The Reconstruction Host is the sole owner that
 * may convert this fact into the public World Reconstruction diagnostic DTO.
 */
export interface BabylonNativeBlockGroundFailureFactV1 {
  readonly id: string;
  readonly acceptanceTargetRef: string;
  readonly targetId: string;
  readonly metricId: BabylonNativeBlockGroundFailureMetricIdV1;
  readonly details: BabylonNativeBlockGroundFailureDetailsV1;
  readonly evidenceRef: string;
  readonly affectedSourceBlockIds: readonly string[];
  readonly message: string;
  readonly repairInstruction: string;
}

export interface BabylonNativeBlockGroundAnalysisReportV1 {
  readonly kind: "babylon-native-block-ground-analysis-report";
  readonly schemaVersion: 1;
  readonly identity: Readonly<{
    readonly logicalGroundModelHash: Sha256HashV1;
    readonly walkableTopologyHash: Sha256HashV1;
    readonly traversalCapabilityEnvelopeHash: Sha256HashV1;
    readonly caseHash: Sha256HashV1;
    readonly worldPackageRootHash: Sha256HashV1;
    readonly measurementChunkPolicyHash: Sha256HashV1;
  }>;
  readonly analysisOutcome: "passed" | "failed";
  readonly admissionOutcome: "passed" | "failed";
  readonly failureFacts: readonly BabylonNativeBlockGroundFailureFactV1[];
  readonly metrics: BabylonNativeBlockGroundAnalysisMetricsV1;
  readonly standableNodes: readonly BabylonNativeBlockGroundStandableNodeV1[];
}

export interface AnalyzeBabylonNativeBlockGroundInputV1 {
  readonly groundModel: BabylonNativeBlockLogicalGroundModelV1;
  readonly walkableTopology: BabylonNativeBlockWalkableTopologyV1;
  readonly traversalCapabilityEnvelopeReceipt:
    TraversalCapabilityEnvelopeReceiptV1;
  readonly caseIntent: BabylonNativeBlockGroundCaseIntentV1;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly measurementChunkPolicy: BabylonNativeBlockChunkPolicyV1;
  readonly budget: BabylonNativeBlockGroundAnalysisBudgetV1;
}

export interface BabylonNativeBlockGroundAnalysisBudgetV1 {
  readonly kind: "babylon-native-block-ground-analysis-budget";
  readonly schemaVersion: 1;
  readonly maximumSolidOccupancyCellCount: number;
  readonly maximumSupportTopCellCount: number;
}

const INPUT_CODE = "WORLDKIT_NATIVE_BLOCK_GROUND_ANALYSIS_INPUT_INVALID";
const IDENTITY_CODE = "WORLDKIT_NATIVE_BLOCK_GROUND_ANALYSIS_IDENTITY_MISMATCH";
const BUDGET_CODE = "WORLDKIT_NATIVE_BLOCK_GROUND_ANALYSIS_BUDGET_EXCEEDED";
const HASH = /^sha256:[a-f0-9]{64}$/;
const ID = /^[a-z0-9][a-z0-9-]{2,79}$/;
const REF = /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/;
const CELL = /^-?(?:0|[1-9][0-9]*),-?(?:0|[1-9][0-9]*),-?(?:0|[1-9][0-9]*)$/;
const EPSILON = 1e-8;

interface CandidateEvaluation {
  readonly positionMetersXYZ: BabylonNativeBlockGroundStandPositionV1;
  readonly requiredFootprintCellCount: number;
  readonly supportedFootprintCellCount: number;
  readonly supportCoverageBasisPoints: number;
  readonly availableClearanceMillimeters: number;
  readonly isStandable: boolean;
  readonly support: BabylonNativeBlockLogicalSupportTopCellV1 | undefined;
  readonly affectedSourceBlockIds: readonly string[];
}

interface TopologySupportSample {
  readonly supportHeightMeters: number;
  readonly affectedSourceBlockIds: readonly string[];
}

interface MutableNode {
  readonly id: string;
  readonly topCellKey: string;
  readonly positionMetersXYZ: BabylonNativeBlockGroundStandPositionV1;
  readonly support: BabylonNativeBlockLogicalSupportTopCellV1;
  readonly neighbors: Set<string>;
  componentId: string;
  isReachableFromSpawn: boolean;
}

interface BlockedStep {
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly deltaMeters: number;
  readonly maximumAllowedHeightDeltaMeters: number;
}

type TraversalBandSegmentFailureReason =
  | "both-endpoint-nodes-missing"
  | "start-node-missing"
  | "destination-node-missing"
  | "disconnected-inside-band";

interface TraversalBandSegmentFailure {
  readonly segmentIndex: number;
  readonly start: BabylonNativeBlockGroundStandPositionV1;
  readonly destination: BabylonNativeBlockGroundStandPositionV1;
  readonly reason: TraversalBandSegmentFailureReason;
}

interface SourceSurface {
  readonly id: string;
  readonly sourceBlockId: string;
  readonly topCellKeys: readonly string[];
  readonly positionMetersXYZ: BabylonNativeBlockGroundStandPositionV1;
}

type SolidOccupancyByHorizontalCell = ReadonlyMap<
  string,
  readonly BabylonNativeBlockLogicalSolidOccupancyCellV1[]
>;

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function freeze<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => freeze(entry))) as T;
  }
  if (value === null || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as object)) {
    output[key] = freeze(entry);
  }
  return Object.freeze(output) as T;
}

function assertAccessorFree(value: unknown, seen = new Set<object>()): void {
  if (isNil(value) || typeof value !== "object") return;
  if (seen.has(value)) return fail(INPUT_CODE, "input must be acyclic plain data");
  seen.add(value);
  let descriptors: PropertyDescriptorMap;
  let prototype: object | null;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
    prototype = Reflect.getPrototypeOf(value);
  } catch {
    return fail(INPUT_CODE, "input cannot be inspected safely");
  }
  if (
    prototype !== Object.prototype &&
    prototype !== Array.prototype
  ) return fail(INPUT_CODE, "input must contain ordinary objects and arrays only");
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!("value" in descriptor)) {
      return fail(INPUT_CODE, `input field '${key}' must not be an accessor`);
    }
    assertAccessorFree(descriptor.value, seen);
  }
  seen.delete(value);
}

function requireRecord(
  value: unknown,
  path: string,
): asserts value is Record<string, unknown> {
  if (isNil(value) || typeof value !== "object" || Array.isArray(value)) {
    return fail(INPUT_CODE, `${path} must be one ordinary record`);
  }
}

function requireArray(
  value: unknown,
  path: string,
): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) {
    return fail(INPUT_CODE, `${path} must be one ordinary array`);
  }
}

function requireClosedKeys(
  value: object,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  path: string,
): void {
  const keys = Object.keys(value);
  if (
    requiredKeys.some((key) => !keys.includes(key)) ||
    keys.some((key) =>
      !requiredKeys.includes(key) && !optionalKeys.includes(key))
  ) return fail(INPUT_CODE, `${path} must use the closed current field set`);
}

function requireHash(value: unknown, path: string): asserts value is Sha256HashV1 {
  if (typeof value !== "string" || !HASH.test(value)) {
    return fail(INPUT_CODE, `${path} must be one lowercase sha256 hash`);
  }
}

function requireId(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !ID.test(value)) {
    return fail(INPUT_CODE, `${path} must be one stable lowercase ID`);
  }
}

function requireRef(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !REF.test(value)) {
    return fail(INPUT_CODE, `${path} must be one absolute resource ref`);
  }
}

function finite(value: unknown, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || Object.is(value, -0)) {
    return fail(INPUT_CODE, `${path} must be one finite canonical number`);
  }
}

function requireStandPosition(
  value: unknown,
  path: string,
): asserts value is BabylonNativeBlockGroundStandPositionV1 {
  requireArray(value, path);
  if (value.length !== 3) {
    return fail(INPUT_CODE, `${path} must contain exactly three coordinates`);
  }
  value.forEach((coordinate, index) => finite(coordinate, `${path}[${index}]`));
}

function parseCellKey(value: string): readonly [number, number, number] {
  if (!CELL.test(value)) return fail(INPUT_CODE, `cell key '${value}' is invalid`);
  const tuple = value.split(",").map(Number) as [number, number, number];
  if (!tuple.every(Number.isSafeInteger)) {
    return fail(INPUT_CODE, `cell key '${value}' exceeds safe integer range`);
  }
  return tuple;
}

function cellKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function signedAxisToken(value: number): string {
  return `${value < 0 ? "n" : "p"}${Math.abs(value)}`;
}

function nodeId(standPositionKey: string): string {
  const [x, y, z] = parseCellKey(standPositionKey);
  return `ground-node-x-${signedAxisToken(x)}-y-${signedAxisToken(y)}-z-${signedAxisToken(z)}`;
}

function positionFromTopCellKey(
  topCellKey: string,
): BabylonNativeBlockGroundStandPositionV1 {
  const [x, y, z] = parseCellKey(topCellKey);
  return Object.freeze([
    (x + 0.5) * GRID[0],
    y * GRID[1],
    (z + 0.5) * GRID[2],
  ]);
}

function positionKey(
  position: BabylonNativeBlockGroundStandPositionV1,
): string {
  const standGridX = GRID[0] / 2;
  const standGridZ = GRID[2] / 2;
  const x = Math.round(position[0] / standGridX);
  const y = Math.round(position[1] / GRID[1]);
  const z = Math.round(position[2] / standGridZ);
  const canonical = Object.freeze([
    x * standGridX,
    y * GRID[1],
    z * standGridZ,
  ]) as BabylonNativeBlockGroundStandPositionV1;
  if (canonical.some((value, axis) =>
    Math.abs(value - position[axis]!) > EPSILON)) {
    return fail(INPUT_CODE,
      `stand position '${position.join(",")}' must use the Profile stand-sample lattice`);
  }
  return cellKey(x, y, z);
}

function formatStandPosition(
  position: BabylonNativeBlockGroundStandPositionV1,
): string {
  return `[${position.join(",")}]`;
}

function traversalBandFailureExplanation(
  reason: TraversalBandSegmentFailureReason,
): string {
  switch (reason) {
    case "both-endpoint-nodes-missing":
      return "neither endpoint resolves to a standable ground node";
    case "start-node-missing":
      return "the segment start does not resolve to a standable ground node";
    case "destination-node-missing":
      return "the segment destination does not resolve to a standable ground node";
    case "disconnected-inside-band":
      return "both endpoint supports exist, but no connected path stays inside the band";
  }
}

function projectedSupportHeightMeters(
  position: BabylonNativeBlockGroundStandPositionV1,
  vertices: readonly [
    BabylonNativeBlockGroundStandPositionV1,
    BabylonNativeBlockGroundStandPositionV1,
    BabylonNativeBlockGroundStandPositionV1,
  ],
): number | undefined {
  const [first, second, third] = vertices;
  const denominator =
    (second[2] - third[2]) * (first[0] - third[0]) +
    (third[0] - second[0]) * (first[2] - third[2]);
  if (Math.abs(denominator) <= EPSILON) return undefined;
  const firstWeight = (
    (second[2] - third[2]) * (position[0] - third[0]) +
    (third[0] - second[0]) * (position[2] - third[2])
  ) / denominator;
  const secondWeight = (
    (third[2] - first[2]) * (position[0] - third[0]) +
    (first[0] - third[0]) * (position[2] - third[2])
  ) / denominator;
  const thirdWeight = 1 - firstWeight - secondWeight;
  if (
    firstWeight < -EPSILON || secondWeight < -EPSILON ||
    thirdWeight < -EPSILON || firstWeight > 1 + EPSILON ||
    secondWeight > 1 + EPSILON || thirdWeight > 1 + EPSILON
  ) return undefined;
  return first[1] * firstWeight + second[1] * secondWeight +
    third[1] * thirdWeight;
}

function topologySupportSample(
  position: BabylonNativeBlockGroundStandPositionV1,
  topology: BabylonNativeBlockWalkableTopologyV1,
): TopologySupportSample | undefined {
  const samples = topology.walkableGeometries.flatMap((geometry) => {
    const positions = geometry.collisionPositionsMetersXYZ;
    const rows: Array<Readonly<{
      supportHeightMeters: number;
      logicalColliderId: string;
      triangleIndex: number;
      affectedSourceBlockIds: readonly string[];
    }>> = [];
    for (let offset = 0; offset < geometry.triangleIndices.length; offset += 3) {
      const vertexAt = (index: number) => Object.freeze([
        positions[index * 3]!,
        positions[index * 3 + 1]!,
        positions[index * 3 + 2]!,
      ]) as BabylonNativeBlockGroundStandPositionV1;
      const supportHeightMeters = projectedSupportHeightMeters(
        position,
        Object.freeze([
          vertexAt(geometry.triangleIndices[offset]!),
          vertexAt(geometry.triangleIndices[offset + 1]!),
          vertexAt(geometry.triangleIndices[offset + 2]!),
        ] as const),
      );
      if (isNil(supportHeightMeters)) continue;
      rows.push(Object.freeze({
        supportHeightMeters,
        logicalColliderId: geometry.logicalColliderId,
        triangleIndex: offset / 3,
        affectedSourceBlockIds: geometry.sourceBlockIds,
      }));
    }
    return rows;
  }).sort((left, right) =>
    Math.abs(left.supportHeightMeters - position[1]) -
      Math.abs(right.supportHeightMeters - position[1]) ||
    stableCompare(left.logicalColliderId, right.logicalColliderId) ||
    left.triangleIndex - right.triangleIndex);
  const sample = samples[0];
  return isNil(sample) ? undefined : Object.freeze({
    supportHeightMeters: sample.supportHeightMeters,
    affectedSourceBlockIds: sample.affectedSourceBlockIds,
  });
}

function exactTopologyFailureFacts(
  position: BabylonNativeBlockGroundStandPositionV1,
  target: Readonly<{
    id: string;
    acceptanceTargetRef: string;
    standabilityMetricId:
      | "ground-spawn-standability"
      | "ground-target-standability";
  }>,
  evidenceRef: string,
  topology: BabylonNativeBlockWalkableTopologyV1,
  localSourceBlockIds: readonly string[],
): readonly BabylonNativeBlockGroundFailureFactV1[] {
  const sample = topologySupportSample(position, topology);
  if (isNil(sample)) {
    return Object.freeze([stateFailureFact({
      acceptanceTargetRef: target.acceptanceTargetRef,
      targetId: target.id,
      metricId: target.standabilityMetricId,
      expectedValue: "walkable-topology-support",
      actualValue: "missing-at-exact-position",
      evidenceRef,
      affectedSourceBlockIds: localSourceBlockIds,
      message: `Ground target ${target.id} has no final walkable-topology triangle at its exact XZ position.`,
      instruction: `Add or extend explicit static-surface Blocks beneath ${target.id}; keep the frozen target position and trusted Subject envelope unchanged.`,
    })]);
  }
  const deltaMeters = sample.supportHeightMeters - position[1];
  if (Math.abs(deltaMeters) <= EPSILON) return Object.freeze([]);
  const expectedMillimeters = position[1] * 1_000;
  const actualMillimeters = sample.supportHeightMeters * 1_000;
  return Object.freeze([failureFact({
    acceptanceTargetRef: target.acceptanceTargetRef,
    targetId: target.id,
    metricId: "ground-support-height-millimeters",
    details: {
      kind: "millimeters-threshold",
      expectedMillimeters,
      actualMillimeters,
      maximumAllowedDriftMillimeters: EPSILON * 1_000,
      exceededByMillimeters:
        Math.abs(actualMillimeters - expectedMillimeters) - EPSILON * 1_000,
      correctionDirection: deltaMeters > 0 ? "decrease" : "increase",
    },
    evidenceRef,
    affectedSourceBlockIds: localSourceBlockIds.length > 0
      ? localSourceBlockIds
      : sample.affectedSourceBlockIds,
    message: `Ground target ${target.id} expects ${expectedMillimeters}mm support height, but the final walkable topology is ${actualMillimeters}mm at that exact XZ position.`,
    instruction: `${deltaMeters > 0 ? "Lower" : "Raise"} the explicit static-surface Blocks beneath ${target.id} until the final smoothed topology matches ${expectedMillimeters}mm; do not move the frozen target or relax Runtime support tolerance.`,
  })]);
}

function sourceSurfaces(
  supportCells: readonly BabylonNativeBlockLogicalSupportTopCellV1[],
  solidCells: readonly BabylonNativeBlockLogicalSolidOccupancyCellV1[],
): readonly SourceSurface[] {
  const cellsBySurface = new Map<string, Array<readonly [
    cell: BabylonNativeBlockLogicalSupportTopCellV1,
    x: number,
    y: number,
    z: number,
  ]>>();
  for (const cell of supportCells) {
    const [x, y, z] = parseCellKey(cell.topCellKey);
    const surfaceKey = `${cell.sourceBlockId}\u0000${y}`;
    const rows = cellsBySurface.get(surfaceKey) ?? [];
    rows.push(Object.freeze([cell, x, y, z]));
    cellsBySurface.set(surfaceKey, rows);
  }
  const solidCellsBySourceBlockId = new Map<string, Array<readonly [
    x: number,
    y: number,
    z: number,
  ]>>();
  for (const solid of solidCells) {
    const rows = solidCellsBySourceBlockId.get(solid.sourceBlockId) ?? [];
    rows.push(parseCellKey(solid.cellKey));
    solidCellsBySourceBlockId.set(solid.sourceBlockId, rows);
  }
  return Object.freeze([...cellsBySurface.entries()].map(([id, rows]) => {
    const sourceBlockId = rows[0]![0].sourceBlockId;
    const topY = rows[0]![2];
    const completeTopLayer = (solidCellsBySourceBlockId.get(sourceBlockId) ?? [])
      .filter(([, y]) => y + 1 === topY);
    if (completeTopLayer.length === 0) {
      return fail(INPUT_CODE,
        `source Block '${sourceBlockId}' has no matching occupied top layer`);
    }
    const xs = completeTopLayer.map(([x]) => x);
    const zs = completeTopLayer.map(([, , z]) => z);
    return Object.freeze({
      id,
      sourceBlockId,
      topCellKeys: Object.freeze(rows.map(([cell]) => cell.topCellKey).sort(stableCompare)),
      positionMetersXYZ: Object.freeze([
        (Math.min(...xs) + Math.max(...xs) + 1) * GRID[0] / 2,
        rows[0]![2] * GRID[1],
        (Math.min(...zs) + Math.max(...zs) + 1) * GRID[2] / 2,
      ]) as BabylonNativeBlockGroundStandPositionV1,
    });
  }).sort((left, right) => stableCompare(left.id, right.id)));
}

function circleIntersectsOpenCell(
  centerX: number,
  centerZ: number,
  radius: number,
  cellX: number,
  cellZ: number,
): boolean {
  if (radius === 0) {
    return centerX >= cellX * GRID[0] - EPSILON &&
      centerX <= (cellX + 1) * GRID[0] + EPSILON &&
      centerZ >= cellZ * GRID[2] - EPSILON &&
      centerZ <= (cellZ + 1) * GRID[2] + EPSILON;
  }
  const minimumX = cellX * GRID[0];
  const maximumX = (cellX + 1) * GRID[0];
  const minimumZ = cellZ * GRID[2];
  const maximumZ = (cellZ + 1) * GRID[2];
  const closestX = Math.max(minimumX, Math.min(maximumX, centerX));
  const closestZ = Math.max(minimumZ, Math.min(maximumZ, centerZ));
  return (closestX - centerX) ** 2 + (closestZ - centerZ) ** 2 <
    radius ** 2 - EPSILON;
}

function intersectingFootprintCells(
  position: BabylonNativeBlockGroundStandPositionV1,
  radiusMeters: number,
): readonly (readonly [number, number])[] {
  const minimumX = Math.floor((position[0] - radiusMeters) / GRID[0]);
  const maximumX = Math.floor((position[0] + radiusMeters) / GRID[0]);
  const minimumZ = Math.floor((position[2] - radiusMeters) / GRID[2]);
  const maximumZ = Math.floor((position[2] + radiusMeters) / GRID[2]);
  const cells: Array<readonly [number, number]> = [];
  for (let z = minimumZ; z <= maximumZ; z += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      if (circleIntersectsOpenCell(
        position[0], position[2], radiusMeters, x, z,
      )) cells.push(Object.freeze([x, z]));
    }
  }
  return Object.freeze(cells);
}

function evaluateCandidate(
  position: BabylonNativeBlockGroundStandPositionV1,
  supportByTopCellKey: ReadonlyMap<
    string,
    BabylonNativeBlockLogicalSupportTopCellV1
  >,
  solidOccupancyByHorizontalCell: SolidOccupancyByHorizontalCell,
  capsuleRadiusMeters: number,
  capsuleHeightMeters: number,
): CandidateEvaluation {
  positionKey(position);
  const topY = Math.round(position[1] / GRID[1]);
  const footprint = intersectingFootprintCells(position, capsuleRadiusMeters);
  const supported = footprint.flatMap(([x, z]) => {
    const support = supportByTopCellKey.get(cellKey(x, topY, z));
    return isNil(support) ? [] : [support];
  });
  let availableClearanceMeters = capsuleHeightMeters;
  const clearanceBlockerSourceBlockIds = new Set<string>();
  for (const [x, z] of footprint) {
    for (const solid of solidOccupancyByHorizontalCell.get(`${x},${z}`) ?? []) {
      const [_solidX, y] = parseCellKey(solid.cellKey);
      const minimumY = y * GRID[1];
      const maximumY = (y + 1) * GRID[1];
      if (
        maximumY <= position[1] + EPSILON ||
        minimumY >= position[1] + capsuleHeightMeters - EPSILON
      ) continue;
      availableClearanceMeters = Math.min(
        availableClearanceMeters,
        Math.max(0, minimumY - position[1]),
      );
      clearanceBlockerSourceBlockIds.add(solid.sourceBlockId);
    }
  }
  const supportCoverageBasisPoints = footprint.length === 0
    ? 0
    : Math.floor(supported.length * 10_000 / footprint.length);
  const availableClearanceMillimeters = Math.round(
    Math.min(capsuleHeightMeters, availableClearanceMeters) * 1_000,
  );
  return Object.freeze({
    positionMetersXYZ: position,
    requiredFootprintCellCount: footprint.length,
    supportedFootprintCellCount: supported.length,
    supportCoverageBasisPoints,
    availableClearanceMillimeters,
    isStandable: supportCoverageBasisPoints === 10_000 &&
      availableClearanceMeters + EPSILON >= capsuleHeightMeters,
    support: [...supported].sort((left, right) => {
      const [leftX, , leftZ] = parseCellKey(left.topCellKey);
      const [rightX, , rightZ] = parseCellKey(right.topCellKey);
      const leftDistance =
        ((leftX + 0.5) * GRID[0] - position[0]) ** 2 +
        ((leftZ + 0.5) * GRID[2] - position[2]) ** 2;
      const rightDistance =
        ((rightX + 0.5) * GRID[0] - position[0]) ** 2 +
        ((rightZ + 0.5) * GRID[2] - position[2]) ** 2;
      return leftDistance - rightDistance ||
        stableCompare(left.topCellKey, right.topCellKey);
    })[0],
    affectedSourceBlockIds: Object.freeze([...new Set([
      ...supported.map(({ sourceBlockId }) => sourceBlockId),
      ...clearanceBlockerSourceBlockIds,
    ])].sort(stableCompare)),
  });
}

function squaredDistanceToSegmentXZ(
  position: BabylonNativeBlockGroundStandPositionV1,
  start: BabylonNativeBlockGroundStandPositionV1,
  end: BabylonNativeBlockGroundStandPositionV1,
): number {
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const lengthSquared = dx ** 2 + dz ** 2;
  if (lengthSquared <= EPSILON) {
    return (position[0] - start[0]) ** 2 + (position[2] - start[2]) ** 2;
  }
  const ratio = Math.max(0, Math.min(1,
    ((position[0] - start[0]) * dx +
      (position[2] - start[2]) * dz) / lengthSquared));
  return (position[0] - (start[0] + dx * ratio)) ** 2 +
    (position[2] - (start[2] + dz * ratio)) ** 2;
}

function canReachInsideBand(
  startNodeId: string,
  destinationNodeId: string,
  start: BabylonNativeBlockGroundStandPositionV1,
  destination: BabylonNativeBlockGroundStandPositionV1,
  halfWidthMeters: number,
  nodesById: ReadonlyMap<string, MutableNode>,
): boolean {
  if (startNodeId === destinationNodeId) return true;
  const maximumDistanceSquared = halfWidthMeters ** 2 + EPSILON;
  const visited = new Set([startNodeId]);
  const queue = [startNodeId];
  for (let index = 0; index < queue.length; index += 1) {
    const node = nodesById.get(queue[index]!)!;
    for (const neighborId of node.neighbors) {
      if (visited.has(neighborId)) continue;
      const neighbor = nodesById.get(neighborId)!;
      if (squaredDistanceToSegmentXZ(
        neighbor.positionMetersXYZ, start, destination,
      ) > maximumDistanceSquared) continue;
      if (neighborId === destinationNodeId) return true;
      visited.add(neighborId);
      queue.push(neighborId);
    }
  }
  return false;
}

function failureFact(input: Readonly<{
  acceptanceTargetRef: string;
  targetId: string;
  metricId: BabylonNativeBlockGroundFailureMetricIdV1;
  details: BabylonNativeBlockGroundFailureDetailsV1;
  evidenceRef: string;
  affectedSourceBlockIds: readonly string[];
  message: string;
  instruction: string;
}>): BabylonNativeBlockGroundFailureFactV1 {
  return freeze({
    id: `ground-analysis:${input.metricId}:${input.targetId}`,
    acceptanceTargetRef: input.acceptanceTargetRef,
    targetId: input.targetId,
    metricId: input.metricId,
    details: input.details,
    evidenceRef: input.evidenceRef,
    affectedSourceBlockIds: Object.freeze(
      [...new Set(input.affectedSourceBlockIds)].sort(stableCompare),
    ),
    message: input.message,
    repairInstruction: input.instruction,
  });
}

function stateFailureFact(input: Readonly<{
  acceptanceTargetRef: string;
  targetId: string;
  metricId: BabylonNativeBlockGroundFailureMetricIdV1;
  actualValue: string;
  expectedValue: string;
  evidenceRef: string;
  affectedSourceBlockIds: readonly string[];
  message: string;
  instruction: string;
}>): BabylonNativeBlockGroundFailureFactV1 {
  return failureFact({
    ...input,
    details: {
      kind: "state-mismatch",
      expectedValue: input.expectedValue,
      actualValue: input.actualValue,
      correctionDirection: "replace",
    },
  });
}

function failureFactsForPosition(
  evaluation: CandidateEvaluation,
  target: Readonly<{
    id: string;
    acceptanceTargetRef: string;
  }>,
  metricId: "ground-spawn-standability" | "ground-target-standability",
  capsuleHeightMeters: number,
  evidenceRef: string,
): readonly BabylonNativeBlockGroundFailureFactV1[] {
  if (evaluation.isStandable) return Object.freeze([]);
  const rows: BabylonNativeBlockGroundFailureFactV1[] = [];
  if (evaluation.supportCoverageBasisPoints < 10_000) {
    rows.push(failureFact({
      acceptanceTargetRef: target.acceptanceTargetRef,
      targetId: target.id,
      metricId: "ground-support-coverage-basis-points",
      details: {
        kind: "basis-points-threshold",
        expectedBasisPoints: 10_000,
        actualBasisPoints: evaluation.supportCoverageBasisPoints,
        maximumAllowedDriftBasisPoints: 0,
        exceededByBasisPoints: 10_000 - evaluation.supportCoverageBasisPoints,
        correctionDirection: "increase",
      },
      evidenceRef,
      affectedSourceBlockIds: evaluation.affectedSourceBlockIds,
      message: `Ground target ${target.id} has ${evaluation.supportCoverageBasisPoints} basis points of required Capsule footprint support; 10000 are required.`,
      instruction: `Add or extend explicit static-surface Blocks under ${target.id} until the complete Capsule footprint has 10000 basis points support; do not change the Capsule or threshold.`,
    }));
  }
  const expectedMillimeters = Math.round(capsuleHeightMeters * 1_000);
  if (evaluation.availableClearanceMillimeters < expectedMillimeters) {
    rows.push(failureFact({
      acceptanceTargetRef: target.acceptanceTargetRef,
      targetId: target.id,
      metricId: "ground-clearance-millimeters",
      details: {
        kind: "millimeters-threshold",
        expectedMillimeters,
        actualMillimeters: evaluation.availableClearanceMillimeters,
        maximumAllowedDriftMillimeters: 0,
        exceededByMillimeters:
          expectedMillimeters - evaluation.availableClearanceMillimeters,
        correctionDirection: "increase",
      },
      evidenceRef,
      affectedSourceBlockIds: evaluation.affectedSourceBlockIds,
      message: `Ground target ${target.id} has ${evaluation.availableClearanceMillimeters}mm vertical clearance; ${expectedMillimeters}mm are required.`,
      instruction: `Raise or remove the explicit solid Blocks above ${target.id} until vertical clearance reaches ${expectedMillimeters}mm; do not change the Capsule or threshold.`,
    }));
  }
  rows.push(stateFailureFact({
    acceptanceTargetRef: target.acceptanceTargetRef,
    targetId: target.id,
    metricId,
    expectedValue: "standable",
    actualValue: "not-standable",
    evidenceRef,
    affectedSourceBlockIds: evaluation.affectedSourceBlockIds,
    message: `Ground target ${target.id} is not standable for the resolved Subject Capsule.`,
    instruction: `Repair the explicit support and clearance geometry at ${target.id}; keep the frozen Spawn/target identity and trusted Subject envelope unchanged.`,
  }));
  return Object.freeze(rows);
}

function verifyInput(input: AnalyzeBabylonNativeBlockGroundInputV1): void {
  assertAccessorFree(input);
  requireRecord(input, "input");
  requireClosedKeys(input, [
    "groundModel",
    "walkableTopology",
    "traversalCapabilityEnvelopeReceipt",
    "caseIntent",
    "worldPackageRootHash",
    "measurementChunkPolicy",
    "budget",
  ], [], "input");
  requireRecord(input.groundModel, "groundModel");
  requireRecord(input.walkableTopology, "walkableTopology");
  requireRecord(input.groundModel.identity, "groundModel.identity");
  requireArray(
    input.groundModel.solidOccupancyCells,
    "groundModel.solidOccupancyCells",
  );
  requireArray(
    input.groundModel.exposedSupportTopCells,
    "groundModel.exposedSupportTopCells",
  );
  requireRecord(
    input.traversalCapabilityEnvelopeReceipt,
    "traversalCapabilityEnvelopeReceipt",
  );
  requireRecord(
    input.traversalCapabilityEnvelopeReceipt.envelope,
    "traversalCapabilityEnvelopeReceipt.envelope",
  );
  requireRecord(input.caseIntent, "caseIntent");
  requireClosedKeys(input.caseIntent, [
    "kind",
    "schemaVersion",
    "id",
    "caseHash",
    "groundFailurePolicy",
    "groundModelEvidenceRef",
    "spawn",
    "requiredTargets",
    "requiredTraversalBands",
    "requireSingleReachableComponent",
  ], [], "caseIntent");
  requireRecord(input.caseIntent.spawn, "caseIntent.spawn");
  requireClosedKeys(input.caseIntent.spawn, [
    "id",
    "acceptanceTargetRef",
    "standPositionMetersXYZ",
    "openingYawQuarterTurnsY",
    "openingFovDegrees",
  ], [], "caseIntent.spawn");
  requireStandPosition(
    input.caseIntent.spawn.standPositionMetersXYZ,
    "caseIntent.spawn.standPositionMetersXYZ",
  );
  requireArray(input.caseIntent.requiredTargets, "caseIntent.requiredTargets");
  requireArray(
    input.caseIntent.requiredTraversalBands,
    "caseIntent.requiredTraversalBands",
  );
  requireHash(input.worldPackageRootHash, "worldPackageRootHash");
  requireRecord(input.measurementChunkPolicy, "measurementChunkPolicy");
  requireRecord(input.budget, "budget");
  requireClosedKeys(input.budget, [
    "kind",
    "schemaVersion",
    "maximumSolidOccupancyCellCount",
    "maximumSupportTopCellCount",
  ], [], "budget");
  if (
    input.budget.kind !== "babylon-native-block-ground-analysis-budget" ||
    input.budget.schemaVersion !== 1 ||
    !Number.isSafeInteger(input.budget.maximumSolidOccupancyCellCount) ||
    !Number.isSafeInteger(input.budget.maximumSupportTopCellCount) ||
    input.budget.maximumSolidOccupancyCellCount <= 0 ||
    input.budget.maximumSupportTopCellCount <= 0
  ) return fail(INPUT_CODE, "ground analysis budget is invalid");
  if (
    input.groundModel.solidOccupancyCells.length >
      input.budget.maximumSolidOccupancyCellCount ||
    input.groundModel.exposedSupportTopCells.length >
      input.budget.maximumSupportTopCellCount
  ) return fail(
    BUDGET_CODE,
    `Ground Model uses ${input.groundModel.solidOccupancyCells.length} solid cells and ${input.groundModel.exposedSupportTopCells.length} support tops; Host budget allows ${input.budget.maximumSolidOccupancyCellCount} and ${input.budget.maximumSupportTopCellCount}.`,
  );
  try {
    parseBabylonNativeBlockChunkPolicyV1(input.measurementChunkPolicy);
  } catch {
    return fail(
      INPUT_CODE,
      "measurementChunkPolicy uses an unsupported contract",
    );
  }
  requireHash(input.groundModel.logicalGroundModelHash, "logicalGroundModelHash");
  requireHash(input.walkableTopology.topologyHash, "walkableTopologyHash");
  requireHash(input.caseIntent.caseHash, "caseIntent.caseHash");
  requireId(input.caseIntent.id, "caseIntent.id");
  requireId(input.caseIntent.spawn.id, "caseIntent.spawn.id");
  requireRef(
    input.caseIntent.spawn.acceptanceTargetRef,
    "caseIntent.spawn.acceptanceTargetRef",
  );
  requireRef(input.caseIntent.groundModelEvidenceRef,
    "caseIntent.groundModelEvidenceRef");
  if (
    input.caseIntent.kind !== "babylon-native-block-ground-case-intent" ||
    input.caseIntent.schemaVersion !== 1 ||
    typeof input.caseIntent.requireSingleReachableComponent !== "boolean" ||
    !["block-admission", "measure-only"].includes(
      input.caseIntent.groundFailurePolicy,
    )
  ) return fail(INPUT_CODE, "caseIntent uses an unsupported contract");
  finite(input.caseIntent.spawn.openingFovDegrees, "spawn.openingFovDegrees");
  if (
    input.caseIntent.spawn.openingFovDegrees <= 0 ||
    input.caseIntent.spawn.openingFovDegrees >= 180 ||
    ![0, 1, 2, 3].includes(input.caseIntent.spawn.openingYawQuarterTurnsY)
  ) return fail(INPUT_CODE, "opening camera measurement inputs are invalid");
  if (input.caseIntent.requiredTargets.length > 256) {
    return fail(INPUT_CODE, "caseIntent supports at most 256 required targets");
  }
  const ids = new Set<string>();
  const positions = new Set<string>();
  const targetRefs = new Set<string>();
  for (const [index, target] of input.caseIntent.requiredTargets.entries()) {
    requireRecord(target, `requiredTargets[${index}]`);
    requireClosedKeys(target, [
      "id",
      "acceptanceTargetRef",
      "standPositionMetersXYZ",
    ], [], `requiredTargets[${index}]`);
    requireId(target.id, `requiredTargets[${index}].id`);
    requireRef(target.acceptanceTargetRef,
      `requiredTargets[${index}].acceptanceTargetRef`);
    requireStandPosition(
      target.standPositionMetersXYZ,
      `requiredTargets[${index}].standPositionMetersXYZ`,
    );
    const key = positionKey(target.standPositionMetersXYZ);
    if (ids.has(target.id) || positions.has(key) ||
      targetRefs.has(target.acceptanceTargetRef)) {
      return fail(INPUT_CODE,
        "required target IDs, acceptance refs and positions must be unique");
    }
    ids.add(target.id);
    positions.add(key);
    targetRefs.add(target.acceptanceTargetRef);
  }
  const bandIds = new Set<string>();
  const bandTargetRefs = new Set<string>();
  for (const [index, band] of input.caseIntent.requiredTraversalBands.entries()) {
    requireRecord(band, `requiredTraversalBands[${index}]`);
    requireClosedKeys(band, [
      "id",
      "acceptanceTargetRef",
      "centerlineStandPositionsMetersXYZ",
      "halfWidthMeters",
    ], [], `requiredTraversalBands[${index}]`);
    requireId(band.id, `requiredTraversalBands[${index}].id`);
    requireRef(band.acceptanceTargetRef,
      `requiredTraversalBands[${index}].acceptanceTargetRef`);
    requireArray(
      band.centerlineStandPositionsMetersXYZ,
      `requiredTraversalBands[${index}].centerlineStandPositionsMetersXYZ`,
    );
    finite(band.halfWidthMeters,
      `requiredTraversalBands[${index}].halfWidthMeters`);
    if (
      bandIds.has(band.id) ||
      bandTargetRefs.has(band.acceptanceTargetRef) ||
      band.halfWidthMeters <= 0 ||
      band.centerlineStandPositionsMetersXYZ.length < 2 ||
      band.centerlineStandPositionsMetersXYZ.length > 256
    ) return fail(INPUT_CODE, "traversal bands must be unique and non-empty");
    bandIds.add(band.id);
    bandTargetRefs.add(band.acceptanceTargetRef);
    band.centerlineStandPositionsMetersXYZ.forEach((position, positionIndex) => {
      requireStandPosition(
        position,
        `requiredTraversalBands[${index}].centerlineStandPositionsMetersXYZ[${positionIndex}]`,
      );
      positionKey(position);
    });
  }
  positionKey(input.caseIntent.spawn.standPositionMetersXYZ);

  const receipt = input.traversalCapabilityEnvelopeReceipt;
  requireHash(receipt.traversalCapabilityEnvelopeHash,
    "traversalCapabilityEnvelopeHash");
  const actualEnvelopeHash = sha256CanonicalJson(receipt.envelope) as Sha256HashV1;
  finite(receipt.envelope.capsuleRadiusMeters, "envelope.capsuleRadiusMeters");
  finite(receipt.envelope.capsuleHeightMeters, "envelope.capsuleHeightMeters");
  finite(receipt.envelope.clearanceMarginMeters,
    "envelope.clearanceMarginMeters");
  finite(receipt.envelope.maxSlopeDegrees, "envelope.maxSlopeDegrees");
  finite(receipt.envelope.maxStepHeightMeters, "envelope.maxStepHeightMeters");
  if (
    actualEnvelopeHash !== receipt.traversalCapabilityEnvelopeHash ||
    receipt.envelope.traversalMode !== "ground" ||
    receipt.envelope.capsuleRadiusMeters < 0 ||
    receipt.envelope.capsuleHeightMeters <= 0 ||
    receipt.envelope.clearanceMarginMeters < 0 ||
    receipt.envelope.maxSlopeDegrees < 0 ||
    receipt.envelope.maxSlopeDegrees >= 90 ||
    receipt.envelope.maxStepHeightMeters < 0
  ) return fail(IDENTITY_CODE, "traversal capability envelope is invalid or stale");
  const { logicalGroundModelHash: _hash, ...groundBody } = input.groundModel;
  if (sha256CanonicalJson(groundBody) !== input.groundModel.logicalGroundModelHash) {
    return fail(IDENTITY_CODE, "logical Ground Model hash is stale");
  }
  requireRecord(input.walkableTopology.identity, "walkableTopology.identity");
  const { topologyHash: _topologyHash, ...topologyBody } = input.walkableTopology;
  if (
    input.walkableTopology.identity.logicalGroundModelHash !==
      input.groundModel.logicalGroundModelHash ||
    sha256CanonicalJson(topologyBody) !== input.walkableTopology.topologyHash
  ) return fail(IDENTITY_CODE, "walkable topology identity is stale or mismatched");
}

function metricSummary(
  reachableNodeIds: ReadonlySet<string>,
  nodesById: ReadonlyMap<string, MutableNode>,
  spawn: BabylonNativeBlockGroundCaseIntentV1["spawn"],
  chunkPolicy: BabylonNativeBlockChunkPolicyV1,
): Pick<
  BabylonNativeBlockGroundAnalysisMetricsV1,
  | "reachableStandPositionBoundsMeters"
  | "reachableHorizontalSpanMetersXZ"
  | "reachableChunkCount"
  | "maximumReachableDistanceMeters"
  | "offCameraReachablePositionCount"
  | "offCameraReachableChunkCount"
> {
  if (reachableNodeIds.size === 0) return {
    reachableStandPositionBoundsMeters: null,
    reachableHorizontalSpanMetersXZ: Object.freeze([0, 0]),
    reachableChunkCount: 0,
    maximumReachableDistanceMeters: 0,
    offCameraReachablePositionCount: 0,
    offCameraReachableChunkCount: 0,
  };
  const nodes = [...reachableNodeIds].map((id) => nodesById.get(id)!);
  const positions = nodes.map(({ positionMetersXYZ }) => positionMetersXYZ);
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  let minimumSurfaceX = Infinity;
  let maximumSurfaceX = -Infinity;
  let minimumSurfaceZ = Infinity;
  let maximumSurfaceZ = -Infinity;
  const chunks = new Set<string>();
  const offCameraChunks = new Set<string>();
  const forward = ([[0, -1], [-1, 0], [0, 1], [1, 0]] as const)[
    spawn.openingYawQuarterTurnsY
  ];
  const halfFovTangent = Math.tan(
    spawn.openingFovDegrees * Math.PI / 360,
  );
  let maximumDistance = 0;
  let offCameraCount = 0;
  for (const [index, position] of positions.entries()) {
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis]!, position[axis]!);
      maximum[axis] = Math.max(maximum[axis]!, position[axis]!);
    }
    const [cellX, _cellY, cellZ] = parseCellKey(nodes[index]!.topCellKey);
    minimumSurfaceX = Math.min(minimumSurfaceX, cellX * GRID[0]);
    maximumSurfaceX = Math.max(maximumSurfaceX, (cellX + 1) * GRID[0]);
    minimumSurfaceZ = Math.min(minimumSurfaceZ, cellZ * GRID[2]);
    maximumSurfaceZ = Math.max(maximumSurfaceZ, (cellZ + 1) * GRID[2]);
    const chunkKey = `${
      babylonNativeBlockChunkAxisIndexV1(chunkPolicy, 0, position[0]!)
    },${babylonNativeBlockChunkAxisIndexV1(chunkPolicy, 1, position[2]!)}`;
    chunks.add(chunkKey);
    const deltaX = position[0] - spawn.standPositionMetersXYZ[0];
    const deltaZ = position[2] - spawn.standPositionMetersXYZ[2];
    const distance = Math.hypot(deltaX, deltaZ);
    maximumDistance = Math.max(maximumDistance, distance);
    if (distance === 0) continue;
    const forwardDistance = deltaX * forward[0] + deltaZ * forward[1];
    const lateralDistance = Math.abs(deltaX * forward[1] - deltaZ * forward[0]);
    if (forwardDistance <= 0 || lateralDistance > forwardDistance * halfFovTangent) {
      offCameraCount += 1;
      offCameraChunks.add(chunkKey);
    }
  }
  return {
    reachableStandPositionBoundsMeters: freeze({
      minimumMetersXYZ: minimum as [number, number, number],
      maximumMetersXYZ: maximum as [number, number, number],
    }),
    reachableHorizontalSpanMetersXZ: Object.freeze([
      maximumSurfaceX - minimumSurfaceX,
      maximumSurfaceZ - minimumSurfaceZ,
    ]),
    reachableChunkCount: chunks.size,
    maximumReachableDistanceMeters: maximumDistance,
    offCameraReachablePositionCount: offCameraCount,
    offCameraReachableChunkCount: offCameraChunks.size,
  };
}

function indexSolidOccupancyByHorizontalCell(
  solids: readonly BabylonNativeBlockLogicalSolidOccupancyCellV1[],
): SolidOccupancyByHorizontalCell {
  const mutable = new Map<
    string,
    BabylonNativeBlockLogicalSolidOccupancyCellV1[]
  >();
  for (const solid of solids) {
    const [x, _y, z] = parseCellKey(solid.cellKey);
    const key = `${x},${z}`;
    const column = mutable.get(key) ?? [];
    column.push(solid);
    mutable.set(key, column);
  }
  return new Map([...mutable.entries()].map(([key, column]) => [
    key,
    Object.freeze(column.sort((left, right) =>
      stableCompare(left.cellKey, right.cellKey) ||
      stableCompare(left.sourceBlockId, right.sourceBlockId))),
  ] as const));
}

export function analyzeBabylonNativeBlockGroundV1(
  input: AnalyzeBabylonNativeBlockGroundInputV1,
): BabylonNativeBlockGroundAnalysisReportV1 {
  verifyInput(input);
  const envelope = input.traversalCapabilityEnvelopeReceipt.envelope;
  const supportByTopCellKey = new Map(
    input.groundModel.exposedSupportTopCells.map((cell) =>
      [cell.topCellKey, cell] as const),
  );
  const solidOccupancyCells = [...input.groundModel.solidOccupancyCells]
    .sort((left, right) => stableCompare(left.cellKey, right.cellKey) ||
      stableCompare(left.sourceBlockId, right.sourceBlockId));
  const solidOccupancyByHorizontalCell =
    indexSolidOccupancyByHorizontalCell(solidOccupancyCells);
  const effectiveCapsuleRadiusMeters =
    envelope.capsuleRadiusMeters + envelope.clearanceMarginMeters;
  const surfaces = sourceSurfaces(
    input.groundModel.exposedSupportTopCells,
    solidOccupancyCells,
  );
  const candidatePositionByKey = new Map<string,
    BabylonNativeBlockGroundStandPositionV1>();
  const addCandidate = (
    position: BabylonNativeBlockGroundStandPositionV1,
  ): void => {
    candidatePositionByKey.set(positionKey(position), position);
  };
  input.groundModel.exposedSupportTopCells.forEach((cell) =>
    addCandidate(positionFromTopCellKey(cell.topCellKey)));
  surfaces.forEach(({ positionMetersXYZ }) => addCandidate(positionMetersXYZ));
  addCandidate(input.caseIntent.spawn.standPositionMetersXYZ);
  input.caseIntent.requiredTargets.forEach(({ standPositionMetersXYZ }) =>
    addCandidate(standPositionMetersXYZ));
  input.caseIntent.requiredTraversalBands.forEach((band) =>
    band.centerlineStandPositionsMetersXYZ.forEach(addCandidate));
  const evaluations = [...candidatePositionByKey.entries()]
    .sort(([left], [right]) => stableCompare(left, right))
    .map(([, position]) => evaluateCandidate(
      position,
      supportByTopCellKey,
      solidOccupancyByHorizontalCell,
      effectiveCapsuleRadiusMeters,
      envelope.capsuleHeightMeters,
    ));
  const nodesById = new Map<string, MutableNode>();
  const nodeIdByPositionKey = new Map<string, string>();
  for (const evaluation of evaluations) {
    if (!evaluation.isStandable || isNil(evaluation.support)) continue;
    const key = positionKey(evaluation.positionMetersXYZ);
    const id = nodeId(key);
    nodesById.set(id, {
      id,
      topCellKey: evaluation.support.topCellKey,
      positionMetersXYZ: evaluation.positionMetersXYZ,
      support: evaluation.support,
      neighbors: new Set<string>(),
      componentId: "",
      isReachableFromSpawn: false,
    });
    nodeIdByPositionKey.set(key, id);
  }

  const blockedSteps: BlockedStep[] = [];
  const connect = (left: MutableNode, right: MutableNode): void => {
    left.neighbors.add(right.id);
    right.neighbors.add(left.id);
  };
  const nodeByStandIndices = new Map([...nodesById.values()].map((node) => [
    positionKey(node.positionMetersXYZ),
    node,
  ] as const));
  for (const node of nodesById.values()) {
    const [x, y, z] = parseCellKey(positionKey(node.positionMetersXYZ));
    for (const [neighborX, neighborZ] of [
      [x + 1, z], [x + 2, z], [x, z + 1], [x, z + 2],
    ] as const) {
      const other = nodeByStandIndices.get(cellKey(neighborX, y, neighborZ));
      if (isNil(other)) continue;
      if (
        Math.abs(neighborX - x) === 2 || Math.abs(neighborZ - z) === 2
      ) {
        const midpoint = Object.freeze([
          (node.positionMetersXYZ[0] + other.positionMetersXYZ[0]) / 2,
          node.positionMetersXYZ[1],
          (node.positionMetersXYZ[2] + other.positionMetersXYZ[2]) / 2,
        ]) as BabylonNativeBlockGroundStandPositionV1;
        if (!evaluateCandidate(
          midpoint,
          supportByTopCellKey,
          solidOccupancyByHorizontalCell,
          effectiveCapsuleRadiusMeters,
          envelope.capsuleHeightMeters,
        ).isStandable) continue;
      }
      connect(node, other);
    }
  }

  const surfaceById = new Map(surfaces.map((surface) =>
    [surface.id, surface] as const));
  const surfaceIdByTopCellKey = new Map(surfaces.flatMap((surface) =>
    surface.topCellKeys.map((topCellKey) =>
      [topCellKey, surface.id] as const)));
  const supportCellsByHorizontalCell = new Map<string,
    BabylonNativeBlockLogicalSupportTopCellV1[]>();
  for (const cell of input.groundModel.exposedSupportTopCells) {
    const [x, , z] = parseCellKey(cell.topCellKey);
    const rows = supportCellsByHorizontalCell.get(`${x},${z}`) ?? [];
    rows.push(cell);
    supportCellsByHorizontalCell.set(`${x},${z}`, rows);
  }
  for (const surface of surfaces) {
    const centerNode = nodeByStandIndices.get(positionKey(
      surface.positionMetersXYZ,
    ));
    if (isNil(centerNode)) continue;
    const surfaceTopCellKeys = new Set(surface.topCellKeys);
    for (const node of nodesById.values()) {
      if (
        node.id === centerNode.id ||
        !surfaceTopCellKeys.has(node.topCellKey)
      ) continue;
      connect(centerNode, node);
    }
  }
  const adjacentSurfacePairs = new Set<string>();
  for (const cell of input.groundModel.exposedSupportTopCells) {
    const [x, , z] = parseCellKey(cell.topCellKey);
    const surfaceId = surfaceIdByTopCellKey.get(cell.topCellKey)!;
    for (const [neighborX, neighborZ] of [[x + 1, z], [x, z + 1]] as const) {
      for (const neighbor of supportCellsByHorizontalCell.get(
        `${neighborX},${neighborZ}`,
      ) ?? []) {
        const neighborSurfaceId = surfaceIdByTopCellKey.get(
          neighbor.topCellKey,
        )!;
        if (surfaceId === neighborSurfaceId) continue;
        adjacentSurfacePairs.add(surfaceId < neighborSurfaceId
          ? `${surfaceId}\u0001${neighborSurfaceId}`
          : `${neighborSurfaceId}\u0001${surfaceId}`);
      }
    }
  }
  for (const pair of [...adjacentSurfacePairs].sort(stableCompare)) {
    const [leftId, rightId] = pair.split("\u0001");
    const leftSurface = surfaceById.get(leftId!)!;
    const rightSurface = surfaceById.get(rightId!)!;
    const leftNode = nodeByStandIndices.get(positionKey(
      leftSurface.positionMetersXYZ,
    ));
    const rightNode = nodeByStandIndices.get(positionKey(
      rightSurface.positionMetersXYZ,
    ));
    if (isNil(leftNode) || isNil(rightNode)) continue;
    const delta = rightNode.positionMetersXYZ[1] -
      leftNode.positionMetersXYZ[1];
    const horizontalDistanceMeters = Math.hypot(
      rightNode.positionMetersXYZ[0] - leftNode.positionMetersXYZ[0],
      rightNode.positionMetersXYZ[2] - leftNode.positionMetersXYZ[2],
    );
    const maximumAllowedHeightDeltaMeters = Math.min(
      envelope.maxStepHeightMeters,
      horizontalDistanceMeters * Math.tan(
        envelope.maxSlopeDegrees * Math.PI / 180,
      ),
    );
    if (Math.abs(delta) <= maximumAllowedHeightDeltaMeters + EPSILON) {
      connect(leftNode, rightNode);
      continue;
    }
    blockedSteps.push(Object.freeze({
      fromNodeId: leftNode.id,
      toNodeId: rightNode.id,
      deltaMeters: delta,
      maximumAllowedHeightDeltaMeters,
    }));
    blockedSteps.push(Object.freeze({
      fromNodeId: rightNode.id,
      toNodeId: leftNode.id,
      deltaMeters: -delta,
      maximumAllowedHeightDeltaMeters,
    }));
  }

  const componentIds: string[] = [];
  const unassigned = new Set(nodesById.keys());
  while (unassigned.size > 0) {
    const first = [...unassigned].sort(stableCompare)[0]!;
    const members: string[] = [];
    const queue = [first];
    unassigned.delete(first);
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index]!;
      members.push(current);
      for (const neighbor of nodesById.get(current)!.neighbors) {
        if (!unassigned.delete(neighbor)) continue;
        queue.push(neighbor);
      }
    }
    members.sort(stableCompare);
    const componentId = `ground-component-${componentIds.length
      .toString().padStart(4, "0")}`;
    componentIds.push(componentId);
    members.forEach((id) => {
      nodesById.get(id)!.componentId = componentId;
    });
  }

  const failureFacts: BabylonNativeBlockGroundFailureFactV1[] = [];
  const topologyFailurePositionKeys = new Set<string>();
  const spawnEvaluation = evaluateCandidate(
    input.caseIntent.spawn.standPositionMetersXYZ,
    supportByTopCellKey,
    solidOccupancyByHorizontalCell,
    effectiveCapsuleRadiusMeters,
    envelope.capsuleHeightMeters,
  );
  failureFacts.push(...failureFactsForPosition(
    spawnEvaluation,
    input.caseIntent.spawn,
    "ground-spawn-standability",
    envelope.capsuleHeightMeters,
    input.caseIntent.groundModelEvidenceRef,
  ));
  const spawnTopologyFacts = !spawnEvaluation.isStandable
    ? Object.freeze([])
    : exactTopologyFailureFacts(
        input.caseIntent.spawn.standPositionMetersXYZ,
        Object.freeze({
          ...input.caseIntent.spawn,
          standabilityMetricId: "ground-spawn-standability" as const,
        }),
        input.caseIntent.groundModelEvidenceRef,
        input.walkableTopology,
        spawnEvaluation.affectedSourceBlockIds,
      );
  failureFacts.push(...spawnTopologyFacts);
  if (spawnTopologyFacts.length > 0) {
    topologyFailurePositionKeys.add(positionKey(
      input.caseIntent.spawn.standPositionMetersXYZ,
    ));
  }
  const spawnNodeId = nodeIdByPositionKey.get(
    positionKey(input.caseIntent.spawn.standPositionMetersXYZ),
  );
  const reachableNodeIds = new Set<string>();
  if (!isNil(spawnNodeId)) {
    const queue = [spawnNodeId];
    reachableNodeIds.add(spawnNodeId);
    for (let index = 0; index < queue.length; index += 1) {
      const current = nodesById.get(queue[index]!)!;
      current.isReachableFromSpawn = true;
      for (const neighbor of current.neighbors) {
        if (reachableNodeIds.has(neighbor)) continue;
        reachableNodeIds.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  let reachableTargetCount = 0;
  for (const target of input.caseIntent.requiredTargets) {
    const evaluation = evaluateCandidate(
      target.standPositionMetersXYZ,
      supportByTopCellKey,
      solidOccupancyByHorizontalCell,
      effectiveCapsuleRadiusMeters,
      envelope.capsuleHeightMeters,
    );
    failureFacts.push(...failureFactsForPosition(
      evaluation,
      target,
      "ground-target-standability",
      envelope.capsuleHeightMeters,
      input.caseIntent.groundModelEvidenceRef,
    ));
    const targetTopologyFacts = !evaluation.isStandable
      ? Object.freeze([])
      : exactTopologyFailureFacts(
          target.standPositionMetersXYZ,
          Object.freeze({
            ...target,
            standabilityMetricId: "ground-target-standability" as const,
          }),
          input.caseIntent.groundModelEvidenceRef,
          input.walkableTopology,
          evaluation.affectedSourceBlockIds,
        );
    failureFacts.push(...targetTopologyFacts);
    if (targetTopologyFacts.length > 0) {
      topologyFailurePositionKeys.add(positionKey(
        target.standPositionMetersXYZ,
      ));
    }
    const targetNodeId = nodeIdByPositionKey.get(
      positionKey(target.standPositionMetersXYZ),
    );
    if (
      targetTopologyFacts.length === 0 &&
      !isNil(targetNodeId) &&
      reachableNodeIds.has(targetNodeId)
    ) {
      reachableTargetCount += 1;
      continue;
    }
    if (!evaluation.isStandable || isNil(targetNodeId)) continue;
    failureFacts.push(stateFailureFact({
      acceptanceTargetRef: target.acceptanceTargetRef,
      targetId: target.id,
      metricId: "ground-target-reachability",
      expectedValue: "reachable-from-spawn",
      actualValue: "disconnected-from-spawn",
      evidenceRef: input.caseIntent.groundModelEvidenceRef,
      affectedSourceBlockIds: evaluation.affectedSourceBlockIds,
      message: `Ground target ${target.id} is standable but disconnected from Spawn.`,
      instruction: `Add or adjust explicit static-surface Blocks between Spawn and ${target.id} so the target is connected within the trusted step limit; do not add an invisible floor or change the Subject envelope.`,
    }));
    const targetComponentId = nodesById.get(targetNodeId)!.componentId;
    const frontier = blockedSteps
      .filter(({ fromNodeId, toNodeId }) =>
        reachableNodeIds.has(fromNodeId) &&
        nodesById.get(toNodeId)?.componentId === targetComponentId)
      .sort((left, right) =>
        Math.abs(left.deltaMeters) - Math.abs(right.deltaMeters) ||
        stableCompare(left.fromNodeId, right.fromNodeId) ||
        stableCompare(left.toNodeId, right.toNodeId))[0];
    if (!isNil(frontier)) {
      const actualMillimeters = Math.round(Math.abs(frontier.deltaMeters) * 1_000);
      const allowedMillimeters = Math.round(
        frontier.maximumAllowedHeightDeltaMeters * 1_000,
      );
      failureFacts.push(failureFact({
        acceptanceTargetRef: target.acceptanceTargetRef,
        targetId: target.id,
        metricId: frontier.deltaMeters > 0
          ? "ground-step-up-millimeters"
          : "ground-step-down-millimeters",
        details: {
          kind: "millimeters-threshold",
          expectedMillimeters: 0,
          actualMillimeters,
          maximumAllowedDriftMillimeters: allowedMillimeters,
          exceededByMillimeters: actualMillimeters - allowedMillimeters,
          correctionDirection: "decrease",
        },
        evidenceRef: input.caseIntent.groundModelEvidenceRef,
        affectedSourceBlockIds: Object.freeze([
          nodesById.get(frontier.fromNodeId)!.support.sourceBlockId,
          nodesById.get(frontier.toNodeId)!.support.sourceBlockId,
        ].sort(stableCompare)),
        message: `The closest disconnected frontier toward ${target.id} changes height by ${actualMillimeters}mm; the trusted combined step/slope limit is ${allowedMillimeters}mm.`,
        instruction: `Add intermediate explicit step Blocks or lower the frontier toward ${target.id} until every smoothed height change is at most ${allowedMillimeters}mm; do not change the Physics Body profile.`,
      }));
    }
  }

  let reachableBandCount = 0;
  for (const band of input.caseIntent.requiredTraversalBands) {
    let isReachable = true;
    let failedSegment: TraversalBandSegmentFailure | undefined;
    for (const [waypointIndex, waypoint] of
      band.centerlineStandPositionsMetersXYZ.entries()) {
      const waypointPositionKey = positionKey(waypoint);
      if (topologyFailurePositionKeys.has(waypointPositionKey)) {
        isReachable = false;
        continue;
      }
      const waypointEvaluation = evaluateCandidate(
        waypoint,
        supportByTopCellKey,
        solidOccupancyByHorizontalCell,
        effectiveCapsuleRadiusMeters,
        envelope.capsuleHeightMeters,
      );
      const waypointFacts = !waypointEvaluation.isStandable
        ? Object.freeze([])
        : exactTopologyFailureFacts(
            waypoint,
            Object.freeze({
              id: `${band.id}-waypoint-${waypointIndex.toString().padStart(3, "0")}`,
              acceptanceTargetRef: band.acceptanceTargetRef,
              standabilityMetricId: "ground-target-standability" as const,
            }),
            input.caseIntent.groundModelEvidenceRef,
            input.walkableTopology,
            waypointEvaluation.affectedSourceBlockIds,
          );
      failureFacts.push(...waypointFacts);
      if (waypointFacts.length > 0) {
        topologyFailurePositionKeys.add(waypointPositionKey);
        isReachable = false;
      }
    }
    for (let index = 0;
      index < band.centerlineStandPositionsMetersXYZ.length - 1;
      index += 1) {
      const start = band.centerlineStandPositionsMetersXYZ[index]!;
      const destination = band.centerlineStandPositionsMetersXYZ[index + 1]!;
      const startNodeId = nodeIdByPositionKey.get(positionKey(start));
      const destinationNodeId = nodeIdByPositionKey.get(positionKey(destination));
      const reason: TraversalBandSegmentFailureReason | undefined =
        isNil(startNodeId) && isNil(destinationNodeId)
          ? "both-endpoint-nodes-missing"
          : isNil(startNodeId)
            ? "start-node-missing"
            : isNil(destinationNodeId)
              ? "destination-node-missing"
              : canReachInsideBand(
                  startNodeId,
                  destinationNodeId,
                  start,
                  destination,
                  band.halfWidthMeters,
                  nodesById,
                )
                ? undefined
                : "disconnected-inside-band";
      if (isNil(reason)) continue;

      // Retain the first exact failing segment. A band-level boolean made
      // bounded repair Agents guess at unrelated geometry and repeat the same
      // failure without learning which local connection remained invalid.
      failedSegment = Object.freeze({
        segmentIndex: index,
        start,
        destination,
        reason,
      });
      isReachable = false;
      break;
    }
    if (isReachable) {
      reachableBandCount += 1;
      continue;
    }
    const segmentId = isNil(failedSegment)
      ? undefined
      : `segment-${failedSegment.segmentIndex.toString().padStart(3, "0")}`;
    const failureExplanation = isNil(failedSegment)
      ? undefined
      : traversalBandFailureExplanation(failedSegment.reason);
    const segmentBlockIds = isNil(failedSegment)
      ? Object.freeze([])
      : Object.freeze([...new Set([
          nodeIdByPositionKey.get(positionKey(failedSegment.start)),
          nodeIdByPositionKey.get(positionKey(failedSegment.destination)),
        ].flatMap((id) => {
          const support = isNil(id) ? undefined : nodesById.get(id)?.support;
          return isNil(support) ? [] : [support.sourceBlockId];
        }))].sort(stableCompare));
    const bandBlockIds = Object.freeze([...new Set(
      band.centerlineStandPositionsMetersXYZ.flatMap((position) => {
        const id = nodeIdByPositionKey.get(positionKey(position));
        const support = isNil(id) ? undefined : nodesById.get(id)?.support;
        return isNil(support) ? [] : [support.sourceBlockId];
      }),
    )].sort(stableCompare));
    failureFacts.push(stateFailureFact({
      acceptanceTargetRef: band.acceptanceTargetRef,
      targetId: band.id,
      metricId: "ground-traversal-band-reachability",
      expectedValue: "reachable-inside-declared-band",
      actualValue: isNil(failedSegment) || isNil(segmentId)
        ? "waypoint-topology-invalid"
        : `${failedSegment.reason}:${segmentId}`,
      evidenceRef: input.caseIntent.groundModelEvidenceRef,
      affectedSourceBlockIds: segmentBlockIds.length > 0
        ? segmentBlockIds
        : bandBlockIds,
      message: isNil(failedSegment) || isNil(segmentId) ||
          isNil(failureExplanation)
        ? `Ground traversal band ${band.id} has an invalid centerline waypoint in the final walkable topology.`
        : `Ground traversal band ${band.id} fails at segment ${segmentId} from ${formatStandPosition(failedSegment.start)} to ${formatStandPosition(failedSegment.destination)}: ${failureExplanation}; the path must remain inside its ${band.halfWidthMeters}m half-width.`,
      instruction: isNil(failedSegment) || isNil(failureExplanation)
        ? `Repair the exact centerline waypoint reported by the accompanying standability fact for ${band.id}; do not move the frozen waypoint or add an invisible bridge.`
        : `Add, resize, or move explicit static-surface Blocks between ${formatStandPosition(failedSegment.start)} and ${formatStandPosition(failedSegment.destination)} inside the declared ${band.halfWidthMeters}m half-width of ${band.id}; ${failureExplanation}. Keep the frozen centerline and trusted Subject envelope unchanged, and do not add an invisible bridge.`,
    }));
  }

  const disconnectedCount = nodesById.size - reachableNodeIds.size;
  if (input.caseIntent.requireSingleReachableComponent && disconnectedCount > 0) {
    failureFacts.push(stateFailureFact({
      acceptanceTargetRef: input.caseIntent.spawn.acceptanceTargetRef,
      targetId: input.caseIntent.id,
      metricId: "ground-component-reachability",
      expectedValue: "one-spawn-reachable-component",
      actualValue: `${componentIds.length}-components-${disconnectedCount}-positions-disconnected`,
      evidenceRef: input.caseIntent.groundModelEvidenceRef,
      affectedSourceBlockIds: Object.freeze([...new Set(
        [...nodesById.values()]
          .filter(({ isReachableFromSpawn }) => !isReachableFromSpawn)
          .map(({ support }) => support.sourceBlockId),
      )].sort(stableCompare)),
      message: `${disconnectedCount} standable positions across ${componentIds.length} components are disconnected from Spawn.`,
      instruction: `Connect the explicit ground components with supported Block geometry within the trusted step limit, or remove unintended isolated support; do not add a hidden foundation.`,
    }));
  }

  const sortedFailureFacts = Object.freeze([...failureFacts].sort((left, right) =>
    stableCompare(left.metricId, right.metricId) ||
    stableCompare(left.acceptanceTargetRef, right.acceptanceTargetRef) ||
    stableCompare(left.targetId, right.targetId)));
  const analysisOutcome: "passed" | "failed" =
    sortedFailureFacts.length === 0 ? "passed" : "failed";
  const admissionOutcome: "passed" | "failed" =
    input.caseIntent.groundFailurePolicy === "block-admission"
      ? analysisOutcome
      : "passed";
  const metrics = freeze({
    supportTopCellCount: input.groundModel.exposedSupportTopCells.length,
    standablePositionCount: nodesById.size,
    clearanceBlockedPositionCount: evaluations.filter((row) =>
      row.supportCoverageBasisPoints === 10_000 && !row.isStandable).length,
    footprintUnsupportedPositionCount: evaluations.filter((row) =>
      row.supportCoverageBasisPoints < 10_000).length,
    reachablePositionCount: reachableNodeIds.size,
    disconnectedStandablePositionCount: disconnectedCount,
    componentCount: componentIds.length,
    requiredTargetCount: input.caseIntent.requiredTargets.length,
    reachableRequiredTargetCount: reachableTargetCount,
    requiredTraversalBandCount: input.caseIntent.requiredTraversalBands.length,
    reachableRequiredTraversalBandCount: reachableBandCount,
    ...metricSummary(
      reachableNodeIds,
      nodesById,
      input.caseIntent.spawn,
      input.measurementChunkPolicy,
    ),
  });
  const standableNodes = Object.freeze([...nodesById.values()]
    .sort((left, right) => stableCompare(left.id, right.id))
    .map((node) => freeze({
      id: node.id,
      topCellKey: node.topCellKey,
      positionMetersXYZ: node.positionMetersXYZ,
      sourceBlockId: node.support.sourceBlockId,
      colliderId: node.support.colliderId,
      ...(isNil(node.support.visualGroupId)
        ? {}
        : { visualGroupId: node.support.visualGroupId }),
      neighborNodeIds: [...node.neighbors].sort(stableCompare),
      componentId: node.componentId,
      isReachableFromSpawn: node.isReachableFromSpawn,
    })));
  return freeze({
    kind: "babylon-native-block-ground-analysis-report" as const,
    schemaVersion: 1 as const,
    identity: {
      logicalGroundModelHash: input.groundModel.logicalGroundModelHash,
      walkableTopologyHash: input.walkableTopology.topologyHash,
      traversalCapabilityEnvelopeHash:
        input.traversalCapabilityEnvelopeReceipt.traversalCapabilityEnvelopeHash,
      caseHash: input.caseIntent.caseHash,
      worldPackageRootHash: input.worldPackageRootHash,
      measurementChunkPolicyHash: sha256CanonicalJson(
        input.measurementChunkPolicy,
      ) as Sha256HashV1,
    },
    analysisOutcome,
    admissionOutcome,
    failureFacts: sortedFailureFacts,
    metrics,
    standableNodes,
  });
}
