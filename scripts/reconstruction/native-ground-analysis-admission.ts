import { compileSubjectTraversalLockV1, type NormalizedSubjectTraversalResourcesV1 } from "@whitebox-world/compiler";
import {
  BABYLON_NATIVE_BLOCK_CURRENT_WALKABLE_TOPOLOGY_POLICY_V1,
  BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
  analyzeBabylonNativeBlockGroundV1,
  type BabylonNativeBlockCheckedEpochEvidenceV1,
  type BabylonNativeBlockGroundFailureFactV1,
  type BabylonNativeBlockGroundAnalysisReportV1,
  type BabylonNativeBlockGroundCaseIntentV1,
  type BabylonNativeBlockGroundStandPositionV1,
} from "@whitebox-world/native-babylon-block-profile/host";
import {
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  worldResourceLockEntriesV1,
  admitNativeBlockGroundExplorationV1,
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
  type TraversalCapabilityEnvelopeReceiptV1,
} from "@whitebox-world/traversal";
import {
  hashWorldReconstructionCaseV1,
  type WorldReconstructionCaseV1,
  type WorldReconstructionDiagnosticV1,
} from "@whitebox-world/validation";
import { isNil } from "lodash-es";

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
const TOPOLOGY_CAPABILITY_EPSILON = 1e-8;

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

export function assertProductionNativeBlockGroundTopologyCompatibleV1(
  evidence: BabylonNativeBlockCheckedEpochEvidenceV1,
  traversalCapabilityEnvelopeReceipt:
    TraversalCapabilityEnvelopeReceiptV1,
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
  const envelope = traversalCapabilityEnvelopeReceipt.envelope;
  if (
    BABYLON_NATIVE_BLOCK_CURRENT_WALKABLE_TOPOLOGY_POLICY_V1
      .maximumAutoSmoothHeightDeltaMeters >
        envelope.maxStepHeightMeters + TOPOLOGY_CAPABILITY_EPSILON
  ) {
    return fail(
      `Block Profile auto-smooth limit ${
        BABYLON_NATIVE_BLOCK_CURRENT_WALKABLE_TOPOLOGY_POLICY_V1
          .maximumAutoSmoothHeightDeltaMeters
      }m exceeds controlled Subject maxStepHeightMeters ${
        envelope.maxStepHeightMeters
      }m`,
    );
  }
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
      if (!(normalLength > TOPOLOGY_CAPABILITY_EPSILON)) {
        return fail(
          `walkable topology '${geometry.logicalColliderId}' has a degenerate triangle`,
        );
      }
      if (!(normal[1] > TOPOLOGY_CAPABILITY_EPSILON)) {
        return fail(
          `walkable topology '${geometry.logicalColliderId}' has a downward-facing triangle`,
        );
      }
      const slopeDegrees = Math.acos(Math.min(
        1,
        normal[1] / normalLength,
      )) * 180 / Math.PI;
      if (
        slopeDegrees >
          envelope.maxSlopeDegrees + TOPOLOGY_CAPABILITY_EPSILON
      ) {
        return fail(
          `walkable topology '${geometry.logicalColliderId}' slope ${
            slopeDegrees
          }deg exceeds controlled Subject maxSlopeDegrees ${
            envelope.maxSlopeDegrees
          }deg`,
        );
      }
    }
  }
}

function createGroundCaseIntentV1(
  input: AnalyzeProductionNativeBlockGroundInputV1,
): BabylonNativeBlockGroundCaseIntentV1 {
  const expected = input.reconstructionCase.expected;
  const spawn = input.contribution.spawnMarker;
  const spawnDesired = Object.freeze([
    spawn.positionMetersXYZ[0],
    spawn.positionMetersXYZ[1],
    spawn.positionMetersXYZ[2],
  ]) as readonly [number, number, number];
  const requiredTargets = expected.groundConnectivity.requiredTraversalBands
    .map((band) => {
      const destination = band.centerlineStandPositionsXYZMeters.at(-1)!;
      return Object.freeze({
        id: band.id,
        acceptanceTargetRef: band.acceptanceTargetRef,
        standPositionMetersXYZ: Object.freeze([
          destination.xMeters,
          destination.yMeters,
          destination.zMeters,
        ]) as BabylonNativeBlockGroundStandPositionV1,
      });
    })
    .sort((left, right) => stableCompare(left.id, right.id));
  const exploration = admitNativeBlockGroundExplorationV1(
    input.groundExploration, expected.groundConnectivity.mode, spawnDesired,
    expected.groundConnectivity.requireSingleReachableComponent,
  );
  const groundAcceptanceTargetRef = expected.topology.acceptanceTargetRef;
  const normalizedYaw = ((Math.round(spawn.facingRadians / (Math.PI / 2)) % 4) + 4) % 4;
  return Object.freeze({
    kind: "babylon-native-block-ground-case-intent",
    schemaVersion: 1,
    id: `${input.reconstructionCase.id}-ground`,
    caseHash: hashWorldReconstructionCaseV1(input.reconstructionCase),
    groundFailurePolicy: expected.spawnSupport.expectedMedium === "ground"
      ? "block-admission"
      : "measure-only",
    groundModelEvidenceRef: input.groundModelEvidenceRef,
    spawn: Object.freeze({
      id: expected.spawnSupport.spawnMarkerId,
      acceptanceTargetRef: expected.spawnSupport.acceptanceTargetRef,
      // Spawn is Runtime truth. Never snap it to nearby support geometry or a
      // hole/ledge can pass analysis while the real Character falls.
      standPositionMetersXYZ: spawnDesired,
      openingYawQuarterTurnsY: normalizedYaw as 0 | 1 | 2 | 3,
      openingFovDegrees: input.openingCamera.fovDegrees,
    }),
    requiredTargets: exploration.mode === "source-authored"
      ? Object.freeze(exploration.requiredTargets.map((target) => Object.freeze({
          id: target.id,
          acceptanceTargetRef: groundAcceptanceTargetRef,
          standPositionMetersXYZ: target.standPositionMetersXYZ,
        })))
      : Object.freeze(requiredTargets),
    requiredTraversalBands: exploration.mode === "source-authored"
      ? Object.freeze(exploration.requiredTraversalBands.map((band) => Object.freeze({
          ...band, acceptanceTargetRef: groundAcceptanceTargetRef,
        })))
      : Object.freeze(
      expected.groundConnectivity.requiredTraversalBands.map((band) =>
        Object.freeze({
          id: band.id,
          acceptanceTargetRef: band.acceptanceTargetRef,
          centerlineStandPositionsMetersXYZ: Object.freeze(
            band.centerlineStandPositionsXYZMeters.map((position) =>
              Object.freeze([
                position.xMeters,
                position.yMeters,
                position.zMeters,
              ]) as BabylonNativeBlockGroundStandPositionV1
            ),
          ),
          halfWidthMeters: band.halfWidthMeters,
          // The existing case-defined contract declares bidirectional ground;
          // only source-authored intent supplies the old explicit direction flag.
          isBidirectional: true,
        })
      ),
    ),
    requireSingleReachableComponent:
      expected.groundConnectivity.requireSingleReachableComponent,
  });
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
  assertProductionNativeBlockGroundTopologyCompatibleV1(
    input.checkedEpochEvidence,
    traversalCapabilityEnvelopeReceipt,
  );
  const caseIntent = createGroundCaseIntentV1(input);
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
