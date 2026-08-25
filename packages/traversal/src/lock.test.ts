import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  assertMatchingTraversalLocksV1,
  resolveTraversalLockV1,
} from "./lock.js";
import type { ResolvedTraversalLockV1 } from "./types.js";

const HASH_A =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const HASH_B =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;

function validLockInput(
  overrides: Partial<ResolvedTraversalLockV1> = {},
): ResolvedTraversalLockV1 {
  return {
    kind: "resolved-traversal-lock",
    schemaVersion: 1,
    subjectEntityId: "player",
    resourceLockHash: HASH_A,
    subjectDefinitionRef: "worldkit://subject-definition/player@1",
    subjectDefinitionHash: HASH_A,
    colliderProfileRef: "worldkit://collider-profile/humanoid@1",
    colliderProfileHash: HASH_A,
    physicsBodyProfileRef: "worldkit://physics-body-profile/humanoid@1",
    physicsBodyProfileHash: HASH_A,
    locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
    locomotionProfileHash: HASH_A,
    locomotionCapabilityRef: "worldkit://capability/locomotion.ground@1",
    locomotionCapabilityHash: HASH_A,
    controlFeelProfileRef: "worldkit://control-feel-profile/ground@1",
    controlFeelProfileHash: HASH_A,
    controlProfileRef: "worldkit://control-profile/ground@1",
    controlProfileHash: HASH_A,
    motionProfileRef: "worldkit://motion-profile/ground@1",
    motionProfileHash: HASH_A,
    motionKernelRef: "worldkit://motion-kernel/ground@1",
    motionKernelHash: HASH_A,
    mediumProfileRef: "worldkit://medium-profile/ground@1",
    mediumProfileHash: HASH_A,
    runtimeBackendRef: "worldkit://runtime-backend/babylon-havok@1",
    runtimeBackendResolvedVersion: "1",
    runtimeBackendHash: HASH_A,
    runtimeAdapterRef: "worldkit://runtime-adapter/babylon-world-runtime@1",
    runtimeAdapterResolvedVersion: "1",
    runtimeAdapterHash: HASH_A,
    capsuleRadiusMeters: 0.35,
    capsuleHeightMeters: 1.8,
    colliderCenterOffsetMetersXYZ: [0, 0.9, 0],
    maxSlopeDegrees: 42,
    maxStepHeightMeters: 0.3,
    ...overrides,
  };
}

describe("resolveTraversalLockV1", () => {
  it("hashes the closed lock including capability and adapter identities", () => {
    const lockInput = validLockInput();
    expect(resolveTraversalLockV1(lockInput)).toMatchObject({
      resolvedTraversalLockHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      lock: {
        maxStepHeightMeters: 0.3,
        maxSlopeDegrees: 42,
        capsuleRadiusMeters: 0.35,
        locomotionCapabilityRef: "worldkit://capability/locomotion.ground@1",
        runtimeAdapterRef: "worldkit://runtime-adapter/babylon-world-runtime@1",
      },
    });

    const receipt = resolveTraversalLockV1(lockInput);
    expect(receipt.resolvedTraversalLockHash).toBe(
      sha256CanonicalJson(receipt.lock),
    );
    expect(receipt.lock).not.toHaveProperty("resolvedTraversalLockHash");
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt.lock)).toBe(true);
  });

  it("changes the lock hash when any lock authority field differs", () => {
    const baseline = resolveTraversalLockV1(validLockInput())
      .resolvedTraversalLockHash;
    const mutations: Partial<ResolvedTraversalLockV1>[] = [
      { controlFeelProfileHash: HASH_B },
      { motionKernelHash: HASH_B },
      { locomotionCapabilityHash: HASH_B },
      { runtimeBackendResolvedVersion: "2" },
      { runtimeAdapterRef: "worldkit://runtime-adapter/other-runtime@1" },
      { runtimeAdapterHash: HASH_B },
      { colliderProfileHash: HASH_B },
      { physicsBodyProfileHash: HASH_B },
    ];

    for (const mutation of mutations) {
      expect(
        resolveTraversalLockV1(validLockInput(mutation)).resolvedTraversalLockHash,
      ).not.toBe(baseline);
    }
  });

  it("rejects unknown fields and missing capability or adapter identities", () => {
    expect(() =>
      resolveTraversalLockV1({
        ...validLockInput(),
        providerNavMeshId: "poly-1",
      } as ResolvedTraversalLockV1),
    ).toThrow("TRAVERSAL_LOCK_INVALID");

    const missingCapability = { ...validLockInput() } as Record<string, unknown>;
    delete missingCapability.locomotionCapabilityRef;
    expect(() => resolveTraversalLockV1(missingCapability)).toThrow(
      "TRAVERSAL_LOCK_INVALID",
    );

    const missingAdapter = { ...validLockInput() } as Record<string, unknown>;
    delete missingAdapter.runtimeAdapterHash;
    expect(() => resolveTraversalLockV1(missingAdapter)).toThrow(
      "TRAVERSAL_LOCK_INVALID",
    );
  });

  it("uses the same closed slope interval as provider admission", () => {
    expect(resolveTraversalLockV1(validLockInput({ maxSlopeDegrees: 0 })).lock)
      .toMatchObject({ maxSlopeDegrees: 0 });
    expect(resolveTraversalLockV1(validLockInput({ maxSlopeDegrees: 89.999 })).lock)
      .toMatchObject({ maxSlopeDegrees: 89.999 });
    expect(() => resolveTraversalLockV1(
      validLockInput({ maxSlopeDegrees: 90 }),
    )).toThrow("must be in [0, 90)");
  });
});

describe("assertMatchingTraversalLocksV1", () => {
  it("accepts identical graph and runtime lock hashes", () => {
    const hash = resolveTraversalLockV1(validLockInput())
      .resolvedTraversalLockHash;
    expect(() => assertMatchingTraversalLocksV1(hash, hash)).not.toThrow();
  });

  it("rejects mismatched graph and runtime lock hashes before query", () => {
    expect(() =>
      assertMatchingTraversalLocksV1(
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ),
    ).toThrow("ROUTE_TRAVERSAL_LOCK_MISMATCH");
  });
});
