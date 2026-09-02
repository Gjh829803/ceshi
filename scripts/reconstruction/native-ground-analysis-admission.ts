import {
  BABYLON_NATIVE_BLOCK_OCCUPANCY_GRID_METERS_XYZ_V1,
} from "@whitebox-world/native-babylon-block-profile";
import {
  BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
  analyzeBabylonNativeBlockGroundV1,
  type BabylonNativeBlockCheckedEpochEvidenceV1,
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
  type BabylonNativeBlockMaterializerMetadataV1,
  type BabylonNativeSceneContributionV1,
  type WorldResourceLockEntryV1,
  type WorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import {
  createTraversalCapabilityEnvelopeV1,
  resolveTraversalGraphBuilderProfileV2,
  resolveTraversalLockV1,
  BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
} from "@whitebox-world/traversal";
import {
  hashWorldReconstructionCaseV1,
  type WorldReconstructionCaseV1,
  type WorldReconstructionDiagnosticV1,
} from "@whitebox-world/validation";
import { isEqual, isNil } from "lodash-es";

import {
  BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
} from "@whitebox-world/runtime-babylon";
import { createNativeGroundAnalysisRepairDiagnosticsV1 } from
  "./native-ground-analysis-diagnostics.js";

const MAXIMUM_OCCUPANCY_CELLS_PER_BLOCK = 16;
const MAXIMUM_SUPPORT_TOP_CELLS_PER_BLOCK = 4;

export interface AnalyzeProductionNativeBlockGroundInputV1 {
  readonly reconstructionCase: WorldReconstructionCaseV1;
  readonly worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
  readonly registryLock: readonly WorldResourceLockEntryV1[];
  readonly contribution: BabylonNativeSceneContributionV1;
  readonly materializerMetadata: BabylonNativeBlockMaterializerMetadataV1;
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

function canonicalSupportCellPosition(
  positionMetersXYZ: readonly [number, number, number],
): BabylonNativeBlockGroundStandPositionV1 {
  const grid = BABYLON_NATIVE_BLOCK_OCCUPANCY_GRID_METERS_XYZ_V1;
  return Object.freeze([
    (Math.round(positionMetersXYZ[0] / grid[0] - 0.5) + 0.5) * grid[0],
    Math.round(positionMetersXYZ[1] / grid[1]) * grid[1],
    (Math.round(positionMetersXYZ[2] / grid[2] - 0.5) + 0.5) * grid[2],
  ]);
}

function supportCellPosition(
  topCellKey: string,
): BabylonNativeBlockGroundStandPositionV1 {
  const coordinates = topCellKey.split(",").map(Number);
  if (
    coordinates.length !== 3 ||
    coordinates.some((coordinate) => !Number.isSafeInteger(coordinate))
  ) return fail(`invalid support top cell '${topCellKey}'`);
  const grid = BABYLON_NATIVE_BLOCK_OCCUPANCY_GRID_METERS_XYZ_V1;
  return Object.freeze([
    (coordinates[0]! + 0.5) * grid[0],
    coordinates[1]! * grid[1],
    (coordinates[2]! + 0.5) * grid[2],
  ]);
}

function nearestSupportPosition(
  evidence: BabylonNativeBlockCheckedEpochEvidenceV1,
  desiredPositionMetersXYZ: readonly [number, number, number],
  visualGroupId?: string,
): BabylonNativeBlockGroundStandPositionV1 {
  const candidates = evidence.logicalGroundModel.exposedSupportTopCells
    .filter((cell) => isNil(visualGroupId) || cell.visualGroupId === visualGroupId)
    .map((cell) => ({
      cell,
      position: supportCellPosition(cell.topCellKey),
    }))
    .sort((left, right) => {
      const leftDistance = left.position.reduce((sum, value, axis) =>
        sum + (value - desiredPositionMetersXYZ[axis]!) ** 2, 0);
      const rightDistance = right.position.reduce((sum, value, axis) =>
        sum + (value - desiredPositionMetersXYZ[axis]!) ** 2, 0);
      return leftDistance - rightDistance ||
        stableCompare(left.cell.topCellKey, right.cell.topCellKey);
    });
  return candidates[0]?.position ??
    canonicalSupportCellPosition(desiredPositionMetersXYZ);
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
  const subjects = runtime.subjectRuntimeDescriptors.filter(({ entityId }) =>
    entityId === runtime.initialControlledEntityId);
  if (subjects.length !== 1) return fail("controlled Subject is not unique");
  const subject = subjects[0]!;
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
      BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
    ),
  });
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
  const groupByAcceptanceTargetRef = new Map(
    input.materializerMetadata.visualGroups.map((group) =>
      [group.acceptanceTargetRef, group] as const),
  );
  const requiredTargets = expected.criticalTraversalChecks
    .filter(({ expectation }) => expectation === "pass")
    .map((check) => {
      const group = groupByAcceptanceTargetRef.get(check.acceptanceTargetRef);
      if (isNil(group)) {
        return fail(
          `pass check '${check.id}' has no Package visual-group target`,
        );
      }
      const desired = Object.freeze([
        (group.minimumMetersXYZ[0] + group.maximumMetersXYZ[0]) / 2,
        group.maximumMetersXYZ[1],
        (group.minimumMetersXYZ[2] + group.maximumMetersXYZ[2]) / 2,
      ]) as readonly [number, number, number];
      return Object.freeze({
        id: check.id,
        acceptanceTargetRef: check.acceptanceTargetRef,
        standPositionMetersXYZ: nearestSupportPosition(
          input.checkedEpochEvidence,
          desired,
          group.visualGroupId,
        ),
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
      standPositionMetersXYZ: nearestSupportPosition(
        input.checkedEpochEvidence,
        spawnDesired,
      ),
      openingYawQuarterTurnsY: normalizedYaw as 0 | 1 | 2 | 3,
      openingFovDegrees: input.worldRuntimeBootstrap.initialCamera.fovDegrees,
    }),
    requiredTargets: Object.freeze(requiredTargets),
    requiredTraversalBands: Object.freeze([]),
    // The current Case contract names required targets but no all-surfaces
    // connectedness policy. Do not invent one or turn decorative islands into
    // a false admission failure.
    requireSingleReachableComponent: false,
  });
}

export function analyzeProductionNativeBlockGroundV1(
  input: AnalyzeProductionNativeBlockGroundInputV1,
): ProductionNativeBlockGroundAnalysisResultV1 {
  if (!Number.isSafeInteger(input.maximumBlockCount) || input.maximumBlockCount <= 0) {
    return fail("maximumBlockCount must be one positive safe integer");
  }
  const report = analyzeBabylonNativeBlockGroundV1({
    groundModel: input.checkedEpochEvidence.logicalGroundModel,
    traversalCapabilityEnvelopeReceipt:
      createControlledTraversalCapabilityEnvelopeV1(
        input.worldRuntimeBootstrap,
        input.registryLock,
      ),
    caseIntent: createGroundCaseIntentV1(input),
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
  return Object.freeze({
    report,
    repairDiagnostics: createNativeGroundAnalysisRepairDiagnosticsV1(report),
  });
}
