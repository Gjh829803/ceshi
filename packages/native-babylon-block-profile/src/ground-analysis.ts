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
import type { BabylonNativeBlockOptimizationChunkPolicyV1 } from
  "./optimization.js";
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
  readonly isBidirectional: boolean;
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
  readonly groundAnalysisReportHash: Sha256HashV1;
}

export interface AnalyzeBabylonNativeBlockGroundInputV1 {
  readonly groundModel: BabylonNativeBlockLogicalGroundModelV1;
  readonly traversalCapabilityEnvelopeReceipt:
    TraversalCapabilityEnvelopeReceiptV1;
  readonly caseIntent: BabylonNativeBlockGroundCaseIntentV1;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly measurementChunkPolicy: BabylonNativeBlockOptimizationChunkPolicyV1;
}

const INPUT_CODE = "WORLDKIT_NATIVE_BLOCK_GROUND_ANALYSIS_INPUT_INVALID";
const IDENTITY_CODE = "WORLDKIT_NATIVE_BLOCK_GROUND_ANALYSIS_IDENTITY_MISMATCH";
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
}

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

function nodeId(topCellKey: string): string {
  const [x, y, z] = parseCellKey(topCellKey);
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
  const x = Math.round(position[0] / GRID[0] - 0.5);
  const y = Math.round(position[1] / GRID[1]);
  const z = Math.round(position[2] / GRID[2] - 0.5);
  const canonical = positionFromTopCellKey(cellKey(x, y, z));
  if (canonical.some((value, axis) =>
    Math.abs(value - position[axis]!) > EPSILON)) {
    return fail(INPUT_CODE,
      `stand position '${position.join(",")}' must use a Profile support-cell center`);
  }
  return cellKey(x, y, z);
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
  solidOccupancyCells:
    readonly BabylonNativeBlockLogicalSolidOccupancyCellV1[],
  capsuleRadiusMeters: number,
  capsuleHeightMeters: number,
): CandidateEvaluation {
  const [centerX, topY, centerZ] = parseCellKey(positionKey(position));
  const footprint = intersectingFootprintCells(position, capsuleRadiusMeters);
  const supported = footprint.filter(([x, z]) =>
    supportByTopCellKey.has(cellKey(x, topY, z)));
  let availableClearanceMeters = capsuleHeightMeters;
  const clearanceBlockerSourceBlockIds = new Set<string>();
  for (const solid of solidOccupancyCells) {
    const [x, y, z] = parseCellKey(solid.cellKey);
    const minimumY = y * GRID[1];
    const maximumY = (y + 1) * GRID[1];
    if (
      maximumY <= position[1] + EPSILON ||
      minimumY >= position[1] + capsuleHeightMeters - EPSILON ||
      !circleIntersectsOpenCell(
        position[0], position[2], capsuleRadiusMeters, x, z,
      )
    ) continue;
    availableClearanceMeters = Math.min(
      availableClearanceMeters,
      Math.max(0, minimumY - position[1]),
    );
    clearanceBlockerSourceBlockIds.add(solid.sourceBlockId);
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
    support: supportByTopCellKey.get(cellKey(centerX, topY, centerZ)),
    affectedSourceBlockIds: Object.freeze([...new Set([
      ...supported.map(([x, z]) =>
        supportByTopCellKey.get(cellKey(x, topY, z))!.sourceBlockId),
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
    "traversalCapabilityEnvelopeReceipt",
    "caseIntent",
    "worldPackageRootHash",
    "measurementChunkPolicy",
  ], [], "input");
  requireRecord(input.groundModel, "groundModel");
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
  requireClosedKeys(input.measurementChunkPolicy, [
    "kind",
    "sizeMetersXZ",
    "originMetersXZ",
    "boundaryMode",
  ], [], "measurementChunkPolicy");
  requireArray(
    input.measurementChunkPolicy.sizeMetersXZ,
    "measurementChunkPolicy.sizeMetersXZ",
  );
  requireArray(
    input.measurementChunkPolicy.originMetersXZ,
    "measurementChunkPolicy.originMetersXZ",
  );
  const chunkPolicy = input.measurementChunkPolicy;
  if (
    chunkPolicy.kind !== "fixed-xz-grid" ||
    chunkPolicy.boundaryMode !== "half-open-center-owned" ||
    chunkPolicy.sizeMetersXZ.length !== 2 ||
    chunkPolicy.originMetersXZ.length !== 2
  ) return fail(INPUT_CODE, "measurementChunkPolicy uses an unsupported contract");
  chunkPolicy.sizeMetersXZ.forEach((value, index) => {
    finite(value, `measurementChunkPolicy.sizeMetersXZ[${index}]`);
    if (value <= 0) {
      return fail(INPUT_CODE, "measurement Chunk sizes must be positive");
    }
  });
  chunkPolicy.originMetersXZ.forEach((value, index) =>
    finite(value, `measurementChunkPolicy.originMetersXZ[${index}]`));
  requireHash(input.groundModel.logicalGroundModelHash, "logicalGroundModelHash");
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
  const ids = new Set<string>([input.caseIntent.spawn.id]);
  const positions = new Set<string>();
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
    if (ids.has(target.id) || positions.has(key)) {
      return fail(INPUT_CODE, "required target IDs and positions must be unique");
    }
    ids.add(target.id);
    positions.add(key);
  }
  const bandIds = new Set<string>();
  for (const [index, band] of input.caseIntent.requiredTraversalBands.entries()) {
    requireRecord(band, `requiredTraversalBands[${index}]`);
    requireClosedKeys(band, [
      "id",
      "acceptanceTargetRef",
      "centerlineStandPositionsMetersXYZ",
      "halfWidthMeters",
      "isBidirectional",
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
      band.halfWidthMeters < 0 ||
      typeof band.isBidirectional !== "boolean" ||
      band.centerlineStandPositionsMetersXYZ.length < 2 ||
      band.centerlineStandPositionsMetersXYZ.length > 256
    ) return fail(INPUT_CODE, "traversal bands must be unique and non-empty");
    bandIds.add(band.id);
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
  finite(receipt.envelope.maxStepHeightMeters, "envelope.maxStepHeightMeters");
  if (
    actualEnvelopeHash !== receipt.traversalCapabilityEnvelopeHash ||
    receipt.envelope.traversalMode !== "ground" ||
    receipt.envelope.capsuleRadiusMeters < 0 ||
    receipt.envelope.capsuleHeightMeters <= 0 ||
    receipt.envelope.maxStepHeightMeters < 0
  ) return fail(IDENTITY_CODE, "traversal capability envelope is invalid or stale");
  if (
    input.groundModel.identity.traversalCapabilityEnvelopeHash !==
      receipt.traversalCapabilityEnvelopeHash ||
    input.groundModel.identity.caseHash !== input.caseIntent.caseHash
  ) return fail(IDENTITY_CODE,
    "Ground Model, Subject traversal envelope and Case intent do not match");
  const { logicalGroundModelHash: _hash, ...groundBody } = input.groundModel;
  if (sha256CanonicalJson(groundBody) !== input.groundModel.logicalGroundModelHash) {
    return fail(IDENTITY_CODE, "logical Ground Model hash is stale");
  }
}

function metricSummary(
  reachableNodeIds: ReadonlySet<string>,
  nodesById: ReadonlyMap<string, MutableNode>,
  spawn: BabylonNativeBlockGroundCaseIntentV1["spawn"],
  chunkPolicy: BabylonNativeBlockOptimizationChunkPolicyV1,
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
    const chunkKey = `${Math.floor(
      (position[0] - chunkPolicy.originMetersXZ[0]) /
        chunkPolicy.sizeMetersXZ[0],
    )},${Math.floor(
      (position[2] - chunkPolicy.originMetersXZ[1]) /
        chunkPolicy.sizeMetersXZ[1],
    )}`;
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
  const evaluations = [...supportByTopCellKey.entries()]
    .sort(([left], [right]) => stableCompare(left, right))
    .map(([key]) => evaluateCandidate(
      positionFromTopCellKey(key),
      supportByTopCellKey,
      solidOccupancyCells,
      envelope.capsuleRadiusMeters,
      envelope.capsuleHeightMeters,
    ));
  const nodesById = new Map<string, MutableNode>();
  const nodeIdByTopCellKey = new Map<string, string>();
  for (const evaluation of evaluations) {
    if (!evaluation.isStandable || isNil(evaluation.support)) continue;
    const id = nodeId(evaluation.support.topCellKey);
    nodesById.set(id, {
      id,
      topCellKey: evaluation.support.topCellKey,
      positionMetersXYZ: evaluation.positionMetersXYZ,
      support: evaluation.support,
      neighbors: new Set<string>(),
      componentId: "",
      isReachableFromSpawn: false,
    });
    nodeIdByTopCellKey.set(evaluation.support.topCellKey, id);
  }

  const blockedSteps: BlockedStep[] = [];
  const nodesByHorizontalCell = new Map<string, MutableNode[]>();
  for (const node of nodesById.values()) {
    const [x, _y, z] = parseCellKey(node.topCellKey);
    const rows = nodesByHorizontalCell.get(`${x},${z}`) ?? [];
    rows.push(node);
    nodesByHorizontalCell.set(`${x},${z}`, rows);
  }
  for (const node of nodesById.values()) {
    const [x, _y, z] = parseCellKey(node.topCellKey);
    for (const [neighborX, neighborZ] of [[x + 1, z], [x, z + 1]] as const) {
      for (const other of nodesByHorizontalCell.get(
        `${neighborX},${neighborZ}`,
      ) ?? []) {
        const delta = other.positionMetersXYZ[1] - node.positionMetersXYZ[1];
        if (Math.abs(delta) <= envelope.maxStepHeightMeters + EPSILON) {
          node.neighbors.add(other.id);
          other.neighbors.add(node.id);
        } else {
          blockedSteps.push(Object.freeze({
            fromNodeId: node.id,
            toNodeId: other.id,
            deltaMeters: delta,
          }));
          blockedSteps.push(Object.freeze({
            fromNodeId: other.id,
            toNodeId: node.id,
            deltaMeters: -delta,
          }));
        }
      }
    }
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
  const spawnEvaluation = evaluateCandidate(
    input.caseIntent.spawn.standPositionMetersXYZ,
    supportByTopCellKey,
    solidOccupancyCells,
    envelope.capsuleRadiusMeters,
    envelope.capsuleHeightMeters,
  );
  failureFacts.push(...failureFactsForPosition(
    spawnEvaluation,
    input.caseIntent.spawn,
    "ground-spawn-standability",
    envelope.capsuleHeightMeters,
    input.caseIntent.groundModelEvidenceRef,
  ));
  const spawnNodeId = nodeIdByTopCellKey.get(
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
      solidOccupancyCells,
      envelope.capsuleRadiusMeters,
      envelope.capsuleHeightMeters,
    );
    failureFacts.push(...failureFactsForPosition(
      evaluation,
      target,
      "ground-target-standability",
      envelope.capsuleHeightMeters,
      input.caseIntent.groundModelEvidenceRef,
    ));
    const targetNodeId = nodeIdByTopCellKey.get(
      positionKey(target.standPositionMetersXYZ),
    );
    if (!isNil(targetNodeId) && reachableNodeIds.has(targetNodeId)) {
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
      const allowedMillimeters = Math.round(envelope.maxStepHeightMeters * 1_000);
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
        message: `The closest disconnected frontier toward ${target.id} changes height by ${actualMillimeters}mm; the trusted step limit is ${allowedMillimeters}mm.`,
        instruction: `Add intermediate explicit step Blocks or lower the frontier toward ${target.id} until every height change is at most ${allowedMillimeters}mm; do not change the Physics Body profile.`,
      }));
    }
  }

  let reachableBandCount = 0;
  for (const band of input.caseIntent.requiredTraversalBands) {
    let isReachable = true;
    for (let index = 0;
      index < band.centerlineStandPositionsMetersXYZ.length - 1;
      index += 1) {
      const start = band.centerlineStandPositionsMetersXYZ[index]!;
      const destination = band.centerlineStandPositionsMetersXYZ[index + 1]!;
      const startNodeId = nodeIdByTopCellKey.get(positionKey(start));
      const destinationNodeId = nodeIdByTopCellKey.get(positionKey(destination));
      if (
        isNil(startNodeId) ||
        isNil(destinationNodeId) ||
        !canReachInsideBand(
          startNodeId,
          destinationNodeId,
          start,
          destination,
          band.halfWidthMeters,
          nodesById,
        ) ||
        (band.isBidirectional && !canReachInsideBand(
          destinationNodeId,
          startNodeId,
          destination,
          start,
          band.halfWidthMeters,
          nodesById,
        ))
      ) {
        isReachable = false;
        break;
      }
    }
    if (isReachable) {
      reachableBandCount += 1;
      continue;
    }
    failureFacts.push(stateFailureFact({
      acceptanceTargetRef: band.acceptanceTargetRef,
      targetId: band.id,
      metricId: "ground-traversal-band-reachability",
      expectedValue: "reachable-inside-declared-band",
      actualValue: "disconnected-or-detour-outside-band",
      evidenceRef: input.caseIntent.groundModelEvidenceRef,
      affectedSourceBlockIds: Object.freeze([...new Set(
        band.centerlineStandPositionsMetersXYZ.flatMap((position) => {
          const support = supportByTopCellKey.get(positionKey(position));
          return isNil(support) ? [] : [support.sourceBlockId];
        }),
      )].sort(stableCompare)),
      message: `Ground traversal band ${band.id} cannot traverse every centerline segment inside its ${band.halfWidthMeters}m half-width.`,
      instruction: `Add or move explicit static-surface Blocks inside the declared ${band.halfWidthMeters}m half-width of ${band.id}; do not widen the frozen band or add an invisible bridge.`,
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
  const body = freeze({
    kind: "babylon-native-block-ground-analysis-report" as const,
    schemaVersion: 1 as const,
    identity: {
      logicalGroundModelHash: input.groundModel.logicalGroundModelHash,
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
  return Object.freeze({
    ...body,
    groundAnalysisReportHash: sha256CanonicalJson(body) as Sha256HashV1,
  });
}
