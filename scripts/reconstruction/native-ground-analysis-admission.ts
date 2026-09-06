import { compileSubjectTraversalLockV1, type NormalizedSubjectTraversalResourcesV1 } from "@whitebox-world/compiler";
import {
  BABYLON_NATIVE_BLOCK_CURRENT_WALKABLE_TOPOLOGY_POLICY_V1,
  BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
  analyzeBabylonNativeBlockGroundV1,
  type BabylonNativeBlockCheckedEpochEvidenceV1,
  type BabylonNativeBlockGroundFailureFactV1,
  type BabylonNativeBlockGroundAnalysisReportV1,
} from "@whitebox-world/native-babylon-block-profile/host";
import {
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  worldResourceLockEntriesV1,
  type NativeBlockGroundExplorationV1,
  type BabylonNativeInitialCameraV1,
  type BabylonNativeSceneContributionV1,
  type WorldResourceLockEntryV1,
  type WorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import {
  createTraversalCapabilityEnvelopeV1,
  resolveTraversalGraphBuilderProfileV2,
  BUILT_IN_NATIVE_BLOCK_GROUND_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
} from "@whitebox-world/traversal";
import {
  hashWorldReconstructionCaseV1,
  type WorldReconstructionCaseV1,
  type WorldReconstructionDiagnosticV1,
} from "@whitebox-world/validation";
import { isNil } from "lodash-es";
import { createNativeBlockGroundIntentV1 } from "./native-ground-case-intent.js";

import {
  admitBabylonNativeSurfacesV1,
  BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
} from "@whitebox-world/runtime-babylon";
import type { WorldPackageWorldBoundsV1 } from
  "@whitebox-world/world-package";
import { createNativeGroundAnalysisRepairDiagnosticsV1 } from
  "./native-ground-analysis-diagnostics.js";

const MAXIMUM_OCCUPANCY_CELLS_PER_BLOCK = 16;
const MAXIMUM_SUPPORT_TOP_CELLS_PER_BLOCK = 4;
const TOPOLOGY_GEOMETRY_EPSILON = 1e-8;

export interface AnalyzeProductionNativeBlockGroundInputV1 {
  readonly groundExploration: NativeBlockGroundExplorationV1;
  readonly openingCamera: BabylonNativeInitialCameraV1;
  readonly reconstructionCase: WorldReconstructionCaseV1;
  readonly worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
  readonly subjectResources: NormalizedSubjectTraversalResourcesV1;
  readonly registryLock: readonly WorldResourceLockEntryV1[];
  readonly contribution: BabylonNativeSceneContributionV1;
  readonly worldBounds: WorldPackageWorldBoundsV1;
  readonly checkedEpochEvidence: BabylonNativeBlockCheckedEpochEvidenceV1;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly groundModelEvidenceRef: string;
}

export interface ProductionNativeBlockGroundAnalysisResultV1 {
  readonly report: BabylonNativeBlockGroundAnalysisReportV1;
  readonly repairDiagnostics: readonly WorldReconstructionDiagnosticV1[];
}

function fail(message: string): never {
  throw new TypeError(
    `WORLDKIT_NATIVE_BLOCK_GROUND_ADMISSION_INPUT_INVALID: ${message}`,
  );
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function controlledSubjectV1(runtime: WorldRuntimeBootstrapV1) {
  const subjects = runtime.subjectRuntimeDescriptors.filter(({ entityId }) =>
    entityId === runtime.initialControlledEntityId);
  if (subjects.length !== 1) return fail("controlled Subject is not unique");
  return subjects[0]!;
}

export function assertProductionNativeBlockGroundTopologyIntegrityV1(
  evidence: BabylonNativeBlockCheckedEpochEvidenceV1,
): void {
  const topology = evidence.topology;
  const groundModelHash = evidence.logicalGroundModel.logicalGroundModelHash;
  const expectedPolicyHash = sha256CanonicalJson(
    BABYLON_NATIVE_BLOCK_CURRENT_WALKABLE_TOPOLOGY_POLICY_V1,
  );
  const { topologyHash: _topologyHash, ...topologyBody } = topology;
  if (
    topology.identity.logicalGroundModelHash !== groundModelHash ||
    topology.identity.topologyPolicyHash !== expectedPolicyHash ||
    sha256CanonicalJson(topologyBody) !== topology.topologyHash
  ) {
    return fail("walkable topology identity or Profile policy is stale");
  }
  // The old 1m smoothing span constructs ramps, not vertical steps. Do not
  // reject an entire world using its Subject's step/slope settings; actual
  // Spawn support and required routes are checked by their existing owners.
  for (const geometry of topology.walkableGeometries) {
    const positions = geometry.collisionPositionsMetersXYZ;
    const indices = geometry.triangleIndices;
    if (positions.length % 3 !== 0 || indices.length % 3 !== 0) {
      return fail(`walkable topology '${geometry.logicalColliderId}' is malformed`);
    }
    for (let offset = 0; offset < indices.length; offset += 3) {
      const indexes = [indices[offset], indices[offset + 1], indices[offset + 2]];
      if (indexes.some((index) =>
        !Number.isSafeInteger(index) ||
        index! < 0 ||
        index! * 3 + 2 >= positions.length
      )) {
        return fail(
          `walkable topology '${geometry.logicalColliderId}' has an invalid triangle index`,
        );
      }
      const [first, second, third] = indexes.map((index) => [
        positions[index! * 3]!,
        positions[index! * 3 + 1]!,
        positions[index! * 3 + 2]!,
      ] as const);
      const firstEdge = [
        second![0] - first![0],
        second![1] - first![1],
        second![2] - first![2],
      ] as const;
      const secondEdge = [
        third![0] - first![0],
        third![1] - first![1],
        third![2] - first![2],
      ] as const;
      // Match Babylon 9.23 ComputeNormals and Runtime surface admission:
      // (p3 - p1) x (p2 - p1), not the opposite winding.
      const normal = [
        secondEdge[1] * firstEdge[2] - secondEdge[2] * firstEdge[1],
        secondEdge[2] * firstEdge[0] - secondEdge[0] * firstEdge[2],
        secondEdge[0] * firstEdge[1] - secondEdge[1] * firstEdge[0],
      ] as const;
      const normalLength = Math.hypot(...normal);
      if (!(normalLength > TOPOLOGY_GEOMETRY_EPSILON)) {
        return fail(
          `walkable topology '${geometry.logicalColliderId}' has a degenerate triangle`,
        );
      }
      if (!(normal[1] > TOPOLOGY_GEOMETRY_EPSILON)) {
        return fail(
          `walkable topology '${geometry.logicalColliderId}' has a downward-facing triangle`,
        );
      }
    }
  }
}


export function analyzeProductionNativeBlockGroundV1(
  input: AnalyzeProductionNativeBlockGroundInputV1,
): ProductionNativeBlockGroundAnalysisResultV1 {
  // Work bounds follow trusted inventory, not a generation quota. The analyzer's
  // positive-budget grammar must not introduce a new non-empty-world gate.
  const budgetBlockCount = Math.max(1, input.checkedEpochEvidence.checkedLayout.layout.blocks.length);
  const traversalCapabilityEnvelopeReceipt = createTraversalCapabilityEnvelopeV1({
    traversalLockReceipt: compileSubjectTraversalLockV1({
      resources: {
        ...input.subjectResources,
        resourceLock: worldResourceLockEntriesV1(input.registryLock),
      },
      worldRuntimeBootstrap: input.worldRuntimeBootstrap,
      traversingEntityId: input.worldRuntimeBootstrap.initialControlledEntityId,
      runtimeImplementationIdentity: BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
    }),
    graphBuilderProfile: resolveTraversalGraphBuilderProfileV2(
      BUILT_IN_NATIVE_BLOCK_GROUND_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
    ),
  });
  assertProductionNativeBlockGroundTopologyIntegrityV1(
    input.checkedEpochEvidence,
  );
  const caseIntent = Object.freeze({ ...createNativeBlockGroundIntentV1(input),
    caseHash: hashWorldReconstructionCaseV1(input.reconstructionCase) });
  const profileReport = analyzeBabylonNativeBlockGroundV1({
    groundModel: input.checkedEpochEvidence.logicalGroundModel,
    walkableTopology: input.checkedEpochEvidence.topology,
    traversalCapabilityEnvelopeReceipt,
    caseIntent,
    worldPackageRootHash: input.worldPackageRootHash,
    measurementChunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
    budget: Object.freeze({
      kind: "babylon-native-block-ground-analysis-budget",
      schemaVersion: 1,
      maximumSolidOccupancyCellCount:
        budgetBlockCount * MAXIMUM_OCCUPANCY_CELLS_PER_BLOCK,
      maximumSupportTopCellCount:
        budgetBlockCount * MAXIMUM_SUPPORT_TOP_CELLS_PER_BLOCK,
    }),
  });
  const runtimeSurfaceAdmission = caseIntent.groundFailurePolicy === "block-admission"
    ? admitBabylonNativeSurfacesV1({
        spawnGeometry: { kind: "native-block-source", groundModel: input.checkedEpochEvidence.logicalGroundModel },
        contribution: input.contribution,
        registryLock: input.registryLock,
        controlledSubject: controlledSubjectV1(input.worldRuntimeBootstrap),
        worldBounds: input.worldBounds,
      })
    : undefined;
  let report = profileReport;
  if (!isNil(runtimeSurfaceAdmission) && runtimeSurfaceAdmission.outcome === "rejected") {
    const relatedColliderSuffix = runtimeSurfaceAdmission.relatedColliderIds.length === 0
      ? ""
      : ` Related frozen Collider IDs: ${
          runtimeSurfaceAdmission.relatedColliderIds.join(", ")
        }.`;
    const runtimeFact: BabylonNativeBlockGroundFailureFactV1 = Object.freeze({
      id: `ground-analysis:ground-spawn-standability:${caseIntent.spawn.id}-runtime-surface`,
      acceptanceTargetRef: caseIntent.spawn.acceptanceTargetRef,
      targetId: caseIntent.spawn.id,
      metricId: "ground-spawn-standability",
      details: Object.freeze({
        kind: "state-mismatch" as const,
        expectedValue: "runtime-surface-admitted",
        actualValue: runtimeSurfaceAdmission.diagnostic.code,
        correctionDirection: "replace" as const,
      }),
      evidenceRef: input.groundModelEvidenceRef,
      affectedSourceBlockIds: Object.freeze([]),
      message: `${runtimeSurfaceAdmission.diagnostic.message}${relatedColliderSuffix}`,
      repairInstruction: `${runtimeSurfaceAdmission.diagnostic.repairHint}${relatedColliderSuffix} Keep the frozen Subject Capsule and Runtime admission threshold unchanged.`,
    });
    const failureFacts = Object.freeze([
      ...profileReport.failureFacts,
      runtimeFact,
    ].sort((left, right) =>
      stableCompare(left.metricId, right.metricId) ||
      stableCompare(left.acceptanceTargetRef, right.acceptanceTargetRef) ||
      stableCompare(left.targetId, right.targetId) ||
      stableCompare(left.id, right.id)));
    report = Object.freeze({
      ...profileReport,
      analysisOutcome: "failed" as const,
      admissionOutcome: caseIntent.groundFailurePolicy === "block-admission"
        ? "failed" as const
        : profileReport.admissionOutcome,
      failureFacts,
    });
  }
  return Object.freeze({
    report,
    repairDiagnostics: createNativeGroundAnalysisRepairDiagnosticsV1(report),
  });
}
