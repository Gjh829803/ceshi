import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type {
  CanonicalSceneExecutionPlanV1,
  CanonicalSceneStaticColliderV1,
  RuntimeVec3V1,
  WorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import type { BabylonRuntimeSubjectV1 } from "./runtime-subject";

import type { CharacterMovementComponentV1 } from "./character-movement-component";

export const BABYLON_TRAVERSAL_RUNTIME_INTERNAL = Symbol(
  "whitebox-world.babylon-traversal-runtime-internal.v1",
);

export interface StaticCollisionMeshEntryV1 {
  readonly collider: CanonicalSceneStaticColliderV1;
  readonly mesh: Mesh;
}

export interface BabylonTraversalRuntimeInternalV1 {
  readCanonicalSceneExecutionPlan(): CanonicalSceneExecutionPlanV1;
  readWorldRuntimeBootstrap(): WorldRuntimeBootstrapV1;
  readRuntimeSubjects(): readonly BabylonRuntimeSubjectV1[];
  readCreationExecutionPlanHash(): `sha256:${string}` | undefined;
  readControlledEntityId(): string | undefined;
  readConfigurationEpoch(): number;
  readTick(): number;
  isDisposed(): boolean;
  readCharacterMovement(entityId: string): CharacterMovementComponentV1 | undefined;
  readStaticCollisionMeshes(): readonly StaticCollisionMeshEntryV1[];
  resetToTraversalAnchor(input: Readonly<{
    traversingEntityId: string;
    subjectOriginPositionMetersXYZ: RuntimeVec3V1;
    facingYawRadians: number;
  }>): void;
  runTraversalFixedTick(input: Readonly<{
    traversingEntityId: string;
    walkDirectionWorldXZ: readonly [number, number];
  }>): void;
}
