import { admitNativeBlockGroundExplorationV1, type BabylonNativeInitialCameraV1, type BabylonNativeSceneContributionV1, type NativeBlockGroundExplorationV1 } from "@whitebox-world/runtime-contracts";
import type { WorldReconstructionCaseV1 } from "@whitebox-world/validation";
import type { BabylonNativeBlockGroundCaseIntentV1, BabylonNativeBlockGroundStandPositionV1 } from "@whitebox-world/native-babylon-block-profile/host";

export interface NativeBlockGroundIntentInputV1 {
  readonly reconstructionCase: WorldReconstructionCaseV1;
  readonly contribution: Pick<BabylonNativeSceneContributionV1, "spawnMarker">;
  readonly groundExploration: NativeBlockGroundExplorationV1;
  readonly openingCamera: BabylonNativeInitialCameraV1;
  readonly groundModelEvidenceRef: string;
}
function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Shared Case/source intent mapping; formal Package identity is bound by Host. */
export function createNativeBlockGroundIntentV1(
  input: NativeBlockGroundIntentInputV1,
): Omit<BabylonNativeBlockGroundCaseIntentV1, "caseHash"> {
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
