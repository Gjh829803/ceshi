import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type {
  ExecutionPlanV4,
  ExecutionPlanV5,
  ExecutionStaticColliderV1,
  Vec3,
} from "@whitebox-world/runtime-contracts";

import type { SubjectController } from "./subject-controller";

export const BABYLON_TRAVERSAL_RUNTIME_INTERNAL = Symbol(
  "whitebox-world.babylon-traversal-runtime-internal.v1",
);

export interface StaticCollisionMeshEntryV1 {
  readonly collider: ExecutionStaticColliderV1;
  readonly mesh: Mesh;
}

export interface BabylonTraversalRuntimeInternalV1 {
  readExecutionPlan(): ExecutionPlanV4 | ExecutionPlanV5;
  readCreationExecutionPlanHash(): `sha256:${string}` | undefined;
  readControlledEntityId(): string | undefined;
  readConfigurationEpoch(): number;
  readTick(): number;
  isDisposed(): boolean;
  readSubjectController(entityId: string): SubjectController | undefined;
  readStaticCollisionMeshes(): readonly StaticCollisionMeshEntryV1[];
  resetToTraversalAnchor(input: Readonly<{
    traversingEntityId: string;
    subjectOriginPositionMetersXYZ: Vec3;
    facingYawRadians: number;
  }>): void;
  runTraversalFixedTick(input: Readonly<{
    traversingEntityId: string;
    walkDirectionWorldXZ: readonly [number, number];
  }>): void;
}
