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
  type BabylonNativeSceneContributionV1,
  type WorldResourceLockEntryV1,
  type WorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import {
  createTraversalCapabilityEnvelopeV1,
  resolveTraversalGraphBuilderProfileV2,
  resolveTraversalLockV1,
  BUILT_IN_NATIVE_BLOCK_GROUND_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  type TraversalCapabilityEnvelopeReceiptV1,
} from "@whitebox-world/traversal";
import {
  hashWorldReconstructionCaseV1,
  type WorldReconstructionCaseV1,
  type WorldReconstructionDiagnosticV1,
} from "@whitebox-world/validation";
import { isEqual, isNil } from "lodash-es";

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
  readonly reconstructionCase: WorldReconstructionCaseV1;
  readonly worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
  readonly registryLock: readonly WorldResourceLockEntryV1[];
  readonly contribution: BabylonNativeSceneContributionV1;
  readonly worldBounds: WorldPackageWorldBoundsV1;
  readonly checkedEpochEvidence: BabylonNativeBlockCheckedEpochEvidenceV1;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly maximumBlockCount: number;
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

function resourceEntry(
  rows: readonly WorldResourceLockEntryV1[],
  resourceRef: string,
  resourceKind: WorldResourceLockEntryV1["resourceKind"],
): WorldResourceLockEntryV1 {
  const matches = rows.filter((row) =>
    row.resourceRef === resourceRef && row.resourceKind === resourceKind);
  if (matches.length !== 1) {
    return fail(`expected one locked ${resourceKind} '${resourceRef}'`);
  }
  return matches[0]!;
}

function createControlledTraversalCapabilityEnvelopeV1(
  runtime: WorldRuntimeBootstrapV1,
  registryLockInput: readonly WorldResourceLockEntryV1[],
) {
  const registryLock = worldResourceLockEntriesV1(registryLockInput);
  const subject = controlledSubjectV1(runtime);
  const colliderShape = {
    kind: subject.collider.kind,
    radiusMeters: subject.collider.radiusMeters,
    heightMeters: subject.collider.heightMeters,
    centerOffsetFromSubjectOriginMetersXYZ:
      subject.collider.centerOffsetFromSubjectOriginMetersXYZ,
  };
  const colliderProfiles = runtime.colliderProfiles.filter(({ collider }) =>
    isEqual(collider, colliderShape));
  if (colliderProfiles.length !== 1) {
    return fail("controlled Subject collider Profile is not unique");
  }
  const colliderProfile = colliderProfiles[0]!;
  const assembly = subject.capabilityAssembly;
  const motionProfile = assembly.defaultMotionProfile;
  const locked = (
    resourceRef: string,
    resourceKind: WorldResourceLockEntryV1["resourceKind"],
  ) => resourceEntry(registryLock, resourceRef, resourceKind);
  const collider = locked(colliderProfile.colliderProfileRef, "collider-profile");
  const physicsBody = locked(subject.physicsBodyProfileRef,
    "physics-body-profile");
  const locomotion = locked(subject.locomotionProfileRef,
    "locomotion-profile");
  const capability = locked(subject.locomotionCapabilityRef, "capability");
  const controlFeel = locked(subject.controlFeel.resourceRef,
    "control-feel-profile");
  const control = locked(assembly.controlProfile.resourceRef,
    "control-profile");
  const motion = locked(motionProfile.resourceRef, "motion-profile");
  const motionKernel = locked(motionProfile.motionKernelRef, "motion-kernel");
  const medium = locked(assembly.mediumProfile.resourceRef, "medium-profile");
  if (
    controlFeel.contentHash !== subject.controlFeel.contentHash ||
    control.contentHash !== assembly.controlProfile.contentHash ||
    motion.contentHash !== motionProfile.contentHash ||
    capability.contentHash !== subject.locomotionCapabilityHash
  ) return fail("controlled Subject resource identity is stale");
  const traversalLockReceipt = resolveTraversalLockV1({
    kind: "resolved-traversal-lock",
    schemaVersion: 1,
    subjectEntityId: subject.entityId,
    resourceLockHash: sha256CanonicalJson(registryLock),
    subjectDefinitionRef: subject.subjectDefinitionRef,
    subjectDefinitionHash: subject.subjectDefinitionHash,
    colliderProfileRef: collider.resourceRef,
    colliderProfileHash: collider.contentHash,
    physicsBodyProfileRef: physicsBody.resourceRef,
    physicsBodyProfileHash: physicsBody.contentHash,
    locomotionProfileRef: locomotion.resourceRef,
    locomotionProfileHash: locomotion.contentHash,
    locomotionCapabilityRef: capability.resourceRef,
    locomotionCapabilityHash: capability.contentHash,
    controlFeelProfileRef: controlFeel.resourceRef,
    controlFeelProfileHash: controlFeel.contentHash,
    controlProfileRef: control.resourceRef,
    controlProfileHash: control.contentHash,
    motionProfileRef: motion.resourceRef,
    motionProfileHash: motion.contentHash,
    motionKernelRef: motionKernel.resourceRef,
    motionKernelHash: motionKernel.contentHash,
    mediumProfileRef: medium.resourceRef,
    mediumProfileHash: medium.contentHash,
    ...BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
    capsuleRadiusMeters: subject.collider.radiusMeters,
    capsuleHeightMeters: subject.collider.heightMeters,
    colliderCenterOffsetMetersXYZ:
      subject.collider.centerOffsetFromSubjectOriginMetersXYZ,
    maxSlopeDegrees: subject.collider.maxSlopeDegrees,
    maxStepHeightMeters: subject.collider.maxStepHeightMeters,
  });
  return createTraversalCapabilityEnvelopeV1({
    traversalLockReceipt,
    graphBuilderProfile: resolveTraversalGraphBuilderProfileV2(
      BUILT_IN_NATIVE_BLOCK_GROUND_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
    ),
  });
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
      openingFovDegrees: input.worldRuntimeBootstrap.initialCamera.fovDegrees,
    }),
    requiredTargets: Object.freeze(requiredTargets),
    requiredTraversalBands: Object.freeze(
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
  if (!Number.isSafeInteger(input.maximumBlockCount) || input.maximumBlockCount <= 0) {
    return fail("maximumBlockCount must be one positive safe integer");
  }
  const traversalCapabilityEnvelopeReceipt =
    createControlledTraversalCapabilityEnvelopeV1(
      input.worldRuntimeBootstrap,
      input.registryLock,
    );
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
        input.maximumBlockCount * MAXIMUM_OCCUPANCY_CELLS_PER_BLOCK,
      maximumSupportTopCellCount:
        input.maximumBlockCount * MAXIMUM_SUPPORT_TOP_CELLS_PER_BLOCK,
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
