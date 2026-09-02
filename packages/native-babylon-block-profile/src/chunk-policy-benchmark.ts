import { sha256CanonicalJson, type Sha256HashV1 } from
  "@whitebox-world/protocol";
import { isNil } from "lodash-es";

import {
  hashBabylonNativeBlockChunkPolicyV1,
  parseBabylonNativeBlockChunkPolicyV1,
  type BabylonNativeBlockChunkPolicyV1,
} from "./chunk-policy.js";
import {
  assessBabylonNativeBlockOptimizationV1,
  type BabylonNativeBlockOptimizationBaselineResourcesV1,
  type BabylonNativeBlockOptimizationProjectedResourcesV1,
} from "./optimization.js";
import type { BabylonNativeBlockFinalizedEpochV1 } from "./session.js";

/**
 * One declared Case whose resource evidence is not part of this benchmark yet.
 * The slot exists so the frozen policy never silently claims Case coverage it
 * does not have; `NBR-65I` replaces the slot with a measured Case row.
 */
export interface BabylonNativeBlockChunkPolicyPendingCaseSlotV1 {
  readonly kind: "babylon-native-block-chunk-policy-pending-case-slot";
  readonly schemaVersion: 1;
  readonly caseId: string;
  readonly referenceLabel: string;
  readonly measurementStatus: "not-run";
  readonly ownerTask: "NBR-65I";
}

export interface BabylonNativeBlockChunkPolicyBenchmarkCaseMeasurementV1 {
  readonly caseId: string;
  readonly profileInventoryHash: `sha256:${string}`;
  readonly assessmentHash: `sha256:${string}`;
  readonly baselineResources: BabylonNativeBlockOptimizationBaselineResourcesV1;
  readonly projectedResources:
    BabylonNativeBlockOptimizationProjectedResourcesV1;
  readonly maximumResidencyGroupBlockCount: number;
}

export interface BabylonNativeBlockChunkPolicyBenchmarkTotalsV1 {
  readonly baselineVisualDrawUnitCount: number;
  readonly baselineColliderProxyCount: number;
  readonly visualDrawUnitCount: number;
  readonly visualGeometryBufferSetCount: number;
  readonly thinInstanceBatchCount: number;
  readonly independentVisualMeshCount: number;
  readonly residencyGroupCount: number;
  readonly colliderProxyCount: number;
  readonly colliderTriangleCount: number;
}

export interface BabylonNativeBlockChunkPolicyBenchmarkPolicyRowV1 {
  readonly policyId: string;
  readonly policyHash: Sha256HashV1;
  readonly chunkEdgeMetersXZ: readonly [number, number];
  readonly caseMeasurements:
    readonly BabylonNativeBlockChunkPolicyBenchmarkCaseMeasurementV1[];
  readonly totals: BabylonNativeBlockChunkPolicyBenchmarkTotalsV1;
  readonly maximumResidencyGroupBlockCount: number;
}

export const BABYLON_NATIVE_BLOCK_CHUNK_POLICY_SELECTION_RULE_V1 =
  "minimum-total-visual-draw-units-then-minimum-peak-residency-block-count-then-finest-chunk-edge-then-lexicographic-policy-id" as const;

export interface BabylonNativeBlockChunkPolicyBenchmarkV1 {
  readonly kind: "babylon-native-block-chunk-policy-benchmark";
  readonly schemaVersion: 1;
  readonly measurementKind: "deterministic-resource-counts";
  readonly measuredCaseIds: readonly string[];
  readonly pendingCaseSlots:
    readonly BabylonNativeBlockChunkPolicyPendingCaseSlotV1[];
  readonly policyRows:
    readonly BabylonNativeBlockChunkPolicyBenchmarkPolicyRowV1[];
  readonly selection: Readonly<{
    selectedPolicyId: string;
    selectedPolicyHash: Sha256HashV1;
    selectionRule: typeof BABYLON_NATIVE_BLOCK_CHUNK_POLICY_SELECTION_RULE_V1;
    isRealCaseEvidenceComplete: boolean;
    pendingRealCaseIds: readonly string[];
  }>;
  readonly benchmarkHash: Sha256HashV1;
}

export interface MeasureBabylonNativeBlockChunkPolicyBenchmarkInputV1 {
  readonly candidatePolicies: readonly BabylonNativeBlockChunkPolicyV1[];
  readonly measuredCases: readonly Readonly<{
    caseId: string;
    finalizedEpoch: BabylonNativeBlockFinalizedEpochV1;
  }>[];
  readonly pendingCaseSlots:
    readonly BabylonNativeBlockChunkPolicyPendingCaseSlotV1[];
}

const CODE = "WORLDKIT_NATIVE_BLOCK_CHUNK_POLICY_BENCHMARK_INPUT_INVALID";
const CASE_ID = /^[a-z0-9][a-z0-9-]{2,79}$/;

/**
 * The petrified-forest reference Case that `NBR-65I` must run through the
 * formal Native production route. `NBR-65F` measures the reconstruction Corpus
 * only, so this slot stays `not-run`.
 */
export const BABYLON_NATIVE_BLOCK_CHUNK_POLICY_PENDING_CASE_SLOTS_V1:
  readonly BabylonNativeBlockChunkPolicyPendingCaseSlotV1[] = Object.freeze([
    Object.freeze({
      kind: "babylon-native-block-chunk-policy-pending-case-slot" as const,
      schemaVersion: 1 as const,
      caseId: "petrified-primordial-forest",
      referenceLabel: "024_petrified_primordial_forest.png",
      measurementStatus: "not-run" as const,
      ownerTask: "NBR-65I" as const,
    }),
  ]);

function fail(message: string): never {
  throw new TypeError(`${CODE}: ${message}`);
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreezeData<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || isNil(value)) return value;
  for (const child of Object.values(value)) deepFreezeData(child);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

function parsePendingSlot(
  input: unknown,
): BabylonNativeBlockChunkPolicyPendingCaseSlotV1 {
  const keys = [
    "kind",
    "schemaVersion",
    "caseId",
    "referenceLabel",
    "measurementStatus",
    "ownerTask",
  ] as const;
  if (
    typeof input !== "object" ||
    isNil(input) ||
    Array.isArray(input) ||
    Reflect.getPrototypeOf(input) !== Object.prototype
  ) return fail("pending Case slot must be one plain record");
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (
    Object.keys(descriptors).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(descriptors, key)) ||
    Object.values(descriptors).some((descriptor) =>
      !descriptor.enumerable || !("value" in descriptor))
  ) return fail("pending Case slot must use the closed field set");
  const record = Object.fromEntries(keys.map((key) =>
    [key, descriptors[key]!.value])) as Record<string, unknown>;
  if (
    record.kind !== "babylon-native-block-chunk-policy-pending-case-slot" ||
    record.schemaVersion !== 1 ||
    record.measurementStatus !== "not-run" ||
    record.ownerTask !== "NBR-65I" ||
    typeof record.caseId !== "string" ||
    !CASE_ID.test(record.caseId) ||
    typeof record.referenceLabel !== "string" ||
    record.referenceLabel.length === 0 ||
    record.referenceLabel.trim() !== record.referenceLabel
  ) return fail("pending Case slot uses an unsupported contract");
  return Object.freeze({
    kind: "babylon-native-block-chunk-policy-pending-case-slot",
    schemaVersion: 1,
    caseId: record.caseId,
    referenceLabel: record.referenceLabel,
    measurementStatus: "not-run",
    ownerTask: "NBR-65I",
  });
}

export function measureBabylonNativeBlockChunkPolicyBenchmarkV1(
  input: MeasureBabylonNativeBlockChunkPolicyBenchmarkInputV1,
): BabylonNativeBlockChunkPolicyBenchmarkV1 {
  if (
    typeof input !== "object" ||
    isNil(input) ||
    Array.isArray(input) ||
    Reflect.getPrototypeOf(input) !== Object.prototype ||
    !Array.isArray(input.candidatePolicies) ||
    !Array.isArray(input.measuredCases) ||
    !Array.isArray(input.pendingCaseSlots)
  ) fail("benchmark input must contain three ordinary arrays");
  const candidatePolicies = input.candidatePolicies
    .map(parseBabylonNativeBlockChunkPolicyV1)
    .sort((left, right) => stableCompare(left.id, right.id));
  if (candidatePolicies.length < 2) {
    fail("a Chunk policy benchmark requires at least two candidate profiles");
  }
  if (new Set(candidatePolicies.map(({ id }) => id)).size !==
    candidatePolicies.length) fail("candidate policy ids must be unique");
  const measuredCases = [...input.measuredCases]
    .sort((left, right) => stableCompare(left.caseId, right.caseId));
  if (measuredCases.length === 0) {
    fail("a Chunk policy benchmark requires at least one measured Case");
  }
  if (measuredCases.some(({ caseId }) =>
    typeof caseId !== "string" || !CASE_ID.test(caseId))) {
    fail("measured Case ids must be stable lowercase ids");
  }
  if (new Set(measuredCases.map(({ caseId }) => caseId)).size !==
    measuredCases.length) fail("measured Case ids must be unique");
  const pendingCaseSlots = input.pendingCaseSlots
    .map(parsePendingSlot)
    .sort((left, right) => stableCompare(left.caseId, right.caseId));
  if (new Set(pendingCaseSlots.map(({ caseId }) => caseId)).size !==
    pendingCaseSlots.length) fail("pending Case ids must be unique");
  if (pendingCaseSlots.some(({ caseId }) =>
    measuredCases.some((measured) => measured.caseId === caseId))) {
    fail("one Case cannot be both measured and pending");
  }

  const policyRows = candidatePolicies.map((chunkPolicy) => {
    const caseMeasurements = measuredCases.map((measuredCase) => {
      const assessment = assessBabylonNativeBlockOptimizationV1({
        finalizedEpoch: measuredCase.finalizedEpoch,
        chunkPolicy,
      });
      return {
        caseId: measuredCase.caseId,
        profileInventoryHash: assessment.profileInventoryHash,
        assessmentHash: assessment.assessmentHash,
        baselineResources: assessment.baselineResources,
        projectedResources: assessment.projectedResources,
        maximumResidencyGroupBlockCount: Math.max(
          ...assessment.residencyGroups.map(({ blockIds }) => blockIds.length),
        ),
      };
    });
    const total = (
      select: (
        measurement: BabylonNativeBlockChunkPolicyBenchmarkCaseMeasurementV1,
      ) => number,
    ): number => caseMeasurements.reduce(
      (sum, measurement) => sum + select(measurement),
      0,
    );
    return {
      policyId: chunkPolicy.id,
      policyHash: hashBabylonNativeBlockChunkPolicyV1(chunkPolicy),
      chunkEdgeMetersXZ: chunkPolicy.sizeMetersXZ,
      caseMeasurements,
      totals: {
        baselineVisualDrawUnitCount: total(({ baselineResources }) =>
          baselineResources.visualDrawUnitCount),
        baselineColliderProxyCount: total(({ baselineResources }) =>
          baselineResources.colliderProxyCount),
        visualDrawUnitCount: total(({ projectedResources }) =>
          projectedResources.visualDrawUnitCount),
        visualGeometryBufferSetCount: total(({ projectedResources }) =>
          projectedResources.visualGeometryBufferSetCount),
        thinInstanceBatchCount: total(({ projectedResources }) =>
          projectedResources.thinInstanceBatchCount),
        independentVisualMeshCount: total(({ projectedResources }) =>
          projectedResources.independentVisualMeshCount),
        residencyGroupCount: total(({ projectedResources }) =>
          projectedResources.residencyGroupCount),
        colliderProxyCount: total(({ projectedResources }) =>
          projectedResources.colliderProxyCount),
        colliderTriangleCount: total(({ projectedResources }) =>
          projectedResources.colliderTriangleCount),
      },
      maximumResidencyGroupBlockCount: Math.max(
        ...caseMeasurements.map((measurement) =>
          measurement.maximumResidencyGroupBlockCount),
      ),
    };
  });

  const selected = [...policyRows].sort((left, right) =>
    left.totals.visualDrawUnitCount - right.totals.visualDrawUnitCount ||
    left.maximumResidencyGroupBlockCount -
      right.maximumResidencyGroupBlockCount ||
    left.chunkEdgeMetersXZ[0]! - right.chunkEdgeMetersXZ[0]! ||
    left.chunkEdgeMetersXZ[1]! - right.chunkEdgeMetersXZ[1]! ||
    stableCompare(left.policyId, right.policyId))[0]!;

  const body = {
    kind: "babylon-native-block-chunk-policy-benchmark" as const,
    schemaVersion: 1 as const,
    measurementKind: "deterministic-resource-counts" as const,
    measuredCaseIds: measuredCases.map(({ caseId }) => caseId),
    pendingCaseSlots,
    policyRows,
    selection: {
      selectedPolicyId: selected.policyId,
      selectedPolicyHash: selected.policyHash,
      selectionRule: BABYLON_NATIVE_BLOCK_CHUNK_POLICY_SELECTION_RULE_V1,
      isRealCaseEvidenceComplete: pendingCaseSlots.length === 0,
      pendingRealCaseIds: pendingCaseSlots.map(({ caseId }) => caseId),
    },
  };
  return deepFreezeData({
    ...body,
    benchmarkHash: sha256CanonicalJson(body) as Sha256HashV1,
  }) as BabylonNativeBlockChunkPolicyBenchmarkV1;
}
