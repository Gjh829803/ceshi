import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  createTraversalCapabilityEnvelopeV1,
  resolveTraversalGraphBuilderProfileV1,
  resolveTraversalGraphBuilderProfileV2,
  resolveTraversalLockV1,
  BUILT_IN_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  type ResolvedTraversalLockV1,
  type ResolvedTraversalGraphBuilderProfileV2,
  type CreateTraversalCapabilityEnvelopeInputV1,
} from "./index.js";

const HASH_A =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const HASH_B =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;

function lockInput(
  overrides: Partial<ResolvedTraversalLockV1> = {},
): ResolvedTraversalLockV1 {
  return {
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
    runtimeBackendRef: "worldkit://runtime-backend/babylon-havok@1",
    runtimeBackendResolvedVersion: "9.21.2+1.3.14",
    runtimeBackendHash: HASH_A,
    runtimeAdapterRef: "worldkit://runtime-adapter/babylon.character-controller@1",
    runtimeAdapterResolvedVersion: "1",
    runtimeAdapterHash: HASH_B,
    capsuleRadiusMeters: 0.32,
    capsuleHeightMeters: 1.92,
    colliderCenterOffsetMetersXYZ: [0, 0.96, 0],
    maxSlopeDegrees: 42,
    maxStepHeightMeters: 0.3,
    ...overrides,
  };
}

function createEnvelope(
  lockOverrides: Partial<ResolvedTraversalLockV1> = {},
) {
  return createTraversalCapabilityEnvelopeV1({
    traversalLockReceipt: resolveTraversalLockV1(lockInput(lockOverrides)),
    graphBuilderProfile: resolveTraversalGraphBuilderProfileV2(
      BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
    ),
  });
}

describe("createTraversalCapabilityEnvelopeV1", () => {
  it("joins only locked traversal capability and V2 build-policy authorities", () => {
    const receipt = createEnvelope();

    expect(receipt.envelope).toEqual({
      kind: "traversal-capability-envelope",
      schemaVersion: 1,
      traversalMode: "ground",
      subjectEntityId: "player",
      colliderProfileRef: "worldkit://collider-profile/humanoid.medium-capsule@1",
      colliderProfileHash: HASH_A,
      physicsBodyProfileRef: "worldkit://physics-body-profile/character.medium@1",
      physicsBodyProfileHash: HASH_A,
      locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
      locomotionProfileHash: HASH_A,
      locomotionCapabilityRef: "worldkit://capability/locomotion.ground@1",
      locomotionCapabilityHash: HASH_A,
      runtimeBackendRef: "worldkit://runtime-backend/babylon-havok@1",
      runtimeBackendResolvedVersion: "9.21.2+1.3.14",
      runtimeBackendHash: HASH_A,
      runtimeAdapterRef: "worldkit://runtime-adapter/babylon.character-controller@1",
      runtimeAdapterResolvedVersion: "1",
      runtimeAdapterHash: HASH_B,
      capsuleRadiusMeters: 0.32,
      capsuleHeightMeters: 1.92,
      colliderCenterOffsetMetersXYZ: [0, 0.96, 0],
      maxSlopeDegrees: 42,
      maxStepHeightMeters: 0.3,
      resolvedTraversalLockHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      graphBuilderProfileRef:
        BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
      graphBuilderResolvedVersion: "1",
      graphBuilderProfileHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      clearanceMarginMeters: 0.05,
      voxelCellSizeMeters: 0.15,
      voxelCellHeightMeters: 0.1,
      tileSizeCells: 64,
      maximumEdgeLengthMeters: 2.4,
      maximumSimplificationErrorMeters: 0.15,
      positionQuantizationMeters: 0.001,
      slopeCostWeight: 1,
      stepCostWeight: 1,
      maximumNodes: 100000,
      maximumEdges: 200000,
      maximumTiles: 1024,
      maximumSearchSteps: 100000,
    });
    expect(receipt.traversalCapabilityEnvelopeHash).toBe(
      sha256CanonicalJson(receipt.envelope),
    );
    expect(receipt.envelope).not.toHaveProperty("traversalCapabilityEnvelopeHash");
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt.envelope)).toBe(true);
    expect(Object.isFrozen(receipt.envelope.colliderCenterOffsetMetersXYZ)).toBe(true);
  });

  it("contains no Subject Definition, control, validation, Driver, or Provider dialect", () => {
    const envelope = createEnvelope().envelope;

    for (const forbidden of [
      "subjectDefinitionRef",
      "subjectDefinitionHash",
      "controlFeelProfileRef",
      "controlProfileRef",
      "motionProfileRef",
      "motionKernelRef",
      "mediumProfileRef",
      "validationProfileRef",
      "maximumProbeTicks",
      "driverProfileRef",
      "walkSpeedMetersPerSecond",
      "gravityMetersPerSecondSquared",
    ]) {
      expect(envelope).not.toHaveProperty(forbidden);
    }
    const json = JSON.stringify(envelope).toLowerCase();
    for (const providerDialect of [
      "recast",
      "walkableradius",
      "polyref",
      "tileref",
      "dtpoly",
      "navmesh",
      "wasm",
    ]) {
      expect(json).not.toContain(providerDialect);
    }
  });

  it("validates Lock and Profile receipts independently and rejects V1", () => {
    const lockReceipt = resolveTraversalLockV1(lockInput());
    const graphBuilderProfile = resolveTraversalGraphBuilderProfileV2(
      BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
    );
    const wrongLockHash = Object.freeze({
      ...lockReceipt,
      resolvedTraversalLockHash: HASH_B,
    });
    const wrongProfileHash = Object.freeze({
      ...graphBuilderProfile,
      contentHash: HASH_B,
    });

    expect(() => createTraversalCapabilityEnvelopeV1({
      traversalLockReceipt: wrongLockHash,
      graphBuilderProfile,
    })).toThrow("TRAVERSAL_CAPABILITY_ENVELOPE_LOCK_RECEIPT_INVALID");
    expect(() => createTraversalCapabilityEnvelopeV1({
      traversalLockReceipt: lockReceipt,
      graphBuilderProfile: wrongProfileHash,
    })).toThrow("TRAVERSAL_CAPABILITY_ENVELOPE_PROFILE_RECEIPT_INVALID");
    expect(() => createTraversalCapabilityEnvelopeV1({
      traversalLockReceipt: lockReceipt,
      graphBuilderProfile: resolveTraversalGraphBuilderProfileV1(
        BUILT_IN_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
      ) as unknown as ResolvedTraversalGraphBuilderProfileV2,
    })).toThrow("TRAVERSAL_CAPABILITY_ENVELOPE_PROFILE_VERSION_UNSUPPORTED");
  });

  it("rejects missing and extra factory inputs with a stable diagnostic", () => {
    const validInput: CreateTraversalCapabilityEnvelopeInputV1 = {
      traversalLockReceipt: resolveTraversalLockV1(lockInput()),
      graphBuilderProfile: resolveTraversalGraphBuilderProfileV2(
        BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
      ),
    };

    for (const invalid of [
      undefined,
      {},
      { traversalLockReceipt: validInput.traversalLockReceipt },
      { ...validInput, providerConfig: {} },
    ]) {
      expect(() => createTraversalCapabilityEnvelopeV1(
        invalid as unknown as CreateTraversalCapabilityEnvelopeInputV1,
      )).toThrow("TRAVERSAL_CAPABILITY_ENVELOPE_INPUT_INVALID");
    }
  });

  it("rejects mutable or non-finite inputs before deriving canonical bytes", () => {
    const lockReceipt = resolveTraversalLockV1(lockInput());
    const graphBuilderProfile = resolveTraversalGraphBuilderProfileV2(
      BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
    );
    const mutableReceipt = structuredClone(lockReceipt);
    const mutableOffset = [...lockReceipt.lock.colliderCenterOffsetMetersXYZ] as [
      number,
      number,
      number,
    ];
    const shallowFrozenLock = Object.freeze({
      ...lockReceipt.lock,
      colliderCenterOffsetMetersXYZ: mutableOffset,
    });
    const shallowFrozenReceipt = Object.freeze({
      lock: shallowFrozenLock,
      resolvedTraversalLockHash: sha256CanonicalJson(
        shallowFrozenLock,
      ) as `sha256:${string}`,
    });
    const nonFiniteLock = Object.freeze({
      ...lockReceipt.lock,
      capsuleRadiusMeters: Number.NaN,
    });
    const nonFiniteReceipt = Object.freeze({
      lock: nonFiniteLock,
      resolvedTraversalLockHash: HASH_A,
    });

    expect(() => createTraversalCapabilityEnvelopeV1({
      traversalLockReceipt: mutableReceipt,
      graphBuilderProfile,
    })).toThrow("TRAVERSAL_CAPABILITY_ENVELOPE_INPUT_MUTABLE");
    expect(() => createTraversalCapabilityEnvelopeV1({
      traversalLockReceipt: shallowFrozenReceipt,
      graphBuilderProfile,
    })).toThrow("TRAVERSAL_CAPABILITY_ENVELOPE_INPUT_MUTABLE");
    expect(() => createTraversalCapabilityEnvelopeV1({
      traversalLockReceipt: nonFiniteReceipt,
      graphBuilderProfile,
    })).toThrow("TRAVERSAL_LOCK_INVALID");
  });

  it("changes canonical identity with geometry and every copied policy field", () => {
    const baseline = createEnvelope();
    const changedRadius = createEnvelope({ capsuleRadiusMeters: 0.33 });
    const changedClearanceEnvelope = {
      ...baseline.envelope,
      clearanceMarginMeters: 0.06,
    };
    const changedVoxelEnvelope = {
      ...baseline.envelope,
      voxelCellSizeMeters: 0.16,
    };

    expect(changedRadius.traversalCapabilityEnvelopeHash).not.toBe(
      baseline.traversalCapabilityEnvelopeHash,
    );
    expect(sha256CanonicalJson(changedClearanceEnvelope)).not.toBe(
      baseline.traversalCapabilityEnvelopeHash,
    );
    expect(sha256CanonicalJson(changedVoxelEnvelope)).not.toBe(
      baseline.traversalCapabilityEnvelopeHash,
    );
  });
});
