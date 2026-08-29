import type {
  CanonicalSceneExecutionPlanV1,
  RuntimeSubjectDescriptorV1,
  WorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";

/**
 * Provider-local runtime view. This is assembled in memory from the two
 * independently hashed artifacts and is never serialized as another world
 * contract.
 */
export interface BabylonRuntimeSubjectV1 extends RuntimeSubjectDescriptorV1 {
  readonly spawnAnchorEntityId: string;
  readonly spawnSubjectOriginPositionMetersXYZ:
    readonly [x: number, y: number, z: number];
  readonly spawnSubjectFacingRadians: number;
}

export function resolveBabylonRuntimeSubjectsV1(
  scenePlan: CanonicalSceneExecutionPlanV1,
  runtimeBootstrap: WorldRuntimeBootstrapV1,
): readonly BabylonRuntimeSubjectV1[] {
  if (scenePlan.worldRuntimeBootstrapHash !== runtimeBootstrap.contentHash) {
    throw new Error("WORLDKIT_RUNTIME_BOOTSTRAP_HASH_MISMATCH");
  }
  const instancesByEntityId = new Map(
    scenePlan.subjectInstances.map((instance) => [instance.entityId, instance]),
  );
  if (
    instancesByEntityId.size !== scenePlan.subjectInstances.length ||
    runtimeBootstrap.subjectRuntimeDescriptors.length !==
      scenePlan.subjectInstances.length
  ) {
    throw new Error("WORLDKIT_RUNTIME_SUBJECT_SET_MISMATCH");
  }
  const subjects = runtimeBootstrap.subjectRuntimeDescriptors.map(
    (descriptor): BabylonRuntimeSubjectV1 => {
      const instance = instancesByEntityId.get(descriptor.entityId);
      if (instance === undefined) {
        throw new Error(
          `WORLDKIT_RUNTIME_SUBJECT_INSTANCE_MISSING: ${descriptor.entityId}`,
        );
      }
      return Object.freeze({
        ...descriptor,
        spawnAnchorEntityId: instance.spawnAnchorEntityId,
        spawnSubjectOriginPositionMetersXYZ:
          instance.subjectOriginPositionMetersXYZ,
        spawnSubjectFacingRadians: instance.subjectFacingRadians,
      });
    },
  );
  return Object.freeze(subjects);
}

export function resolveBabylonNativeRuntimeSubjectsV1(
  runtimeBootstrap: WorldRuntimeBootstrapV1,
  spawnMarker: Readonly<{
    id: string;
    positionMetersXYZ: readonly [number, number, number];
    facingRadians: number;
  }>,
): readonly BabylonRuntimeSubjectV1[] {
  if (runtimeBootstrap.subjectRuntimeDescriptors.length !== 1) {
    throw new Error("WORLDKIT_NATIVE_SCENE_SUBJECT_SET_UNSUPPORTED");
  }
  const descriptor = runtimeBootstrap.subjectRuntimeDescriptors[0]!;
  if (descriptor.entityId !== runtimeBootstrap.initialControlledEntityId) {
    throw new Error("WORLDKIT_NATIVE_SCENE_CONTROLLED_ENTITY_MISMATCH");
  }
  return Object.freeze([Object.freeze({
    ...descriptor,
    spawnAnchorEntityId: spawnMarker.id,
    spawnSubjectOriginPositionMetersXYZ: spawnMarker.positionMetersXYZ,
    spawnSubjectFacingRadians: spawnMarker.facingRadians,
  })]);
}
