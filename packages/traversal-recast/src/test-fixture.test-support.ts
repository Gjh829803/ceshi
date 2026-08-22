import {
  BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
} from "@whitebox-world/runtime-babylon";
import {
  BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  createTraversalCapabilityEnvelopeV1,
  resolveTraversalGraphBuilderProfileV2,
  resolveTraversalLockV1,
  type ResolvedTraversalLockV1,
  type TraversalCapabilityEnvelopeV1,
} from "@whitebox-world/traversal";

const HASH_A =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

export function createRecastTestEnvelopeV1(
  overrides: Partial<ResolvedTraversalLockV1> = {},
): TraversalCapabilityEnvelopeV1 {
  const runtimeIdentity = BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1;
  const lock = resolveTraversalLockV1({
    kind: "resolved-traversal-lock",
    schemaVersion: 1,
    subjectEntityId: "player",
    subjectDefinitionRef: "worldkit://subject-definition/humanoid.third-person@1",
    subjectDefinitionHash: HASH_A,
    colliderProfileRef: "worldkit://collider-profile/humanoid.medium-capsule@1",
    colliderProfileHash: HASH_A,
    physicsBodyProfileRef: "worldkit://physics-body-profile/character.medium@1",
    physicsBodyProfileHash: HASH_A,
    locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
    locomotionProfileHash: HASH_A,
    locomotionCapabilityRef: "worldkit://capability/locomotion.ground@1",
    locomotionCapabilityHash: HASH_A,
    controlFeelProfileRef: "worldkit://control-feel-profile/humanoid.medium-ground@1",
    controlFeelProfileHash: HASH_A,
    controlProfileRef: "worldkit://control-profile/planar.camera-relative@1",
    controlProfileHash: HASH_A,
    motionProfileRef: "worldkit://motion-profile/free-ground.humanoid-medium@1",
    motionProfileHash: HASH_A,
    motionKernelRef: "worldkit://motion-kernel/free-ground@1",
    motionKernelHash: HASH_A,
    mediumProfileRef: "worldkit://medium-profile/ground-air.standard@1",
    mediumProfileHash: HASH_A,
    ...runtimeIdentity,
    capsuleRadiusMeters: 0.32,
    capsuleHeightMeters: 1.92,
    colliderCenterOffsetMetersXYZ: [0, 0.96, 0],
    maxSlopeDegrees: 42,
    maxStepHeightMeters: 0.3,
    ...overrides,
  });
  return createTraversalCapabilityEnvelopeV1({
    traversalLockReceipt: lock,
    graphBuilderProfile: resolveTraversalGraphBuilderProfileV2(
      BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
    ),
  }).envelope;
}
