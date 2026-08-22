import { describe, expect, it } from "vitest";

import {
  normalizeAuthoringSpecV4,
  type AuthoringSpecV4,
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import type { ExecutionPlanV5 } from "@whitebox-world/runtime-contracts";
import type { TraversalRuntimeImplementationIdentityV1 } from "@whitebox-world/traversal";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { createValidAuthoringSpec } from "../../authoring/src/test-fixture";

import { compileResolvedTraversalLockV1, compileWorldV5 } from "./index";

const RUNTIME_IDENTITY: TraversalRuntimeImplementationIdentityV1 = {
  runtimeBackendRef: "worldkit://runtime-backend/babylon-havok@1",
  runtimeBackendResolvedVersion: "9.21.2+1.3.14",
  runtimeBackendHash: `sha256:${"a".repeat(64)}`,
  runtimeAdapterRef: "worldkit://runtime-adapter/babylon.character-controller@1",
  runtimeAdapterResolvedVersion: "1",
  runtimeAdapterHash: `sha256:${"b".repeat(64)}`,
};

function routeWorld(): AuthoringSpecV4 {
  const source = createValidAuthoringSpec();
  return {
    ...source,
    schemaVersion: 4,
    spatial: {
      ...source.spatial,
      routes: [{
        id: "main-route",
        kind: "polyline-xz",
        pointsMetersXZ: [[0, 30], [0, -20]],
        widthMeters: 4,
        locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
      }],
    },
    nodes: [
      ...source.nodes,
      {
        id: "goal",
        kind: "anchor",
        placement: {
          kind: "fixed",
          transform: { positionMetersXYZ: [0, 0, -20] },
        },
        semantic: { classId: "route.destination" },
      },
    ],
    constraints: {
      placements: source.constraints.placements,
      connectivity: [{
        id: "hero-to-goal",
        kind: "connected-by-route",
        requirement: "required",
        traversingEntityId: "player",
        startAnchorEntityId: "spawn-main",
        destinationAnchorEntityId: "goal",
        routeId: "main-route",
      }],
    },
  };
}

function compileFixture(): {
  normalizedWorldIr: NormalizedWorldIRV4;
  executionPlan: ExecutionPlanV5;
} {
  const normalized = normalizeAuthoringSpecV4(routeWorld());
  if (!normalized.ok || normalized.value === undefined ||
    normalized.normalizedWorldIrHash === undefined) {
    throw new Error("Route fixture normalization failed.");
  }
  const compiled = compileWorldV5({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
  });
  if (!compiled.ok || compiled.executionPlan === undefined) {
    throw new Error("Route fixture compilation failed.");
  }
  return { normalizedWorldIr: normalized.value, executionPlan: compiled.executionPlan };
}

describe("compileResolvedTraversalLockV1", () => {
  it("joins only normalized lock resources, compiled Subject geometry, and trusted Runtime identity", () => {
    const fixture = compileFixture();
    const receipt = compileResolvedTraversalLockV1({
      ...fixture,
      traversingEntityId: "player",
      runtimeImplementationIdentity: RUNTIME_IDENTITY,
    });

    expect(receipt.lock).toMatchObject({
      subjectEntityId: "player",
      subjectDefinitionRef: "worldkit://subject-definition/humanoid.third-person@1",
      colliderProfileRef: "worldkit://collider-profile/humanoid.medium-capsule@1",
      physicsBodyProfileRef:
        "worldkit://physics-body-profile/character.capability-medium@1",
      locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
      locomotionCapabilityRef: "worldkit://capability/locomotion.ground@1",
      controlFeelProfileRef:
        "worldkit://control-feel-profile/humanoid.medium-ground@1",
      controlProfileRef: "worldkit://control-profile/planar.camera-relative@1",
      motionProfileRef:
        "worldkit://motion-profile/free-ground.humanoid-medium@1",
      motionKernelRef: "worldkit://motion-kernel/free-ground@1",
      mediumProfileRef: "worldkit://medium-profile/ground-air.standard@1",
      runtimeBackendRef: RUNTIME_IDENTITY.runtimeBackendRef,
      runtimeAdapterRef: RUNTIME_IDENTITY.runtimeAdapterRef,
      capsuleRadiusMeters: 0.32,
      capsuleHeightMeters: 1.92,
      maxSlopeDegrees: 42,
      maxStepHeightMeters: 0.3,
    });
    for (const [field, value] of Object.entries(receipt.lock)) {
      if (field.endsWith("Hash")) expect(value).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt.lock)).toBe(true);
  });

  it("is byte-stable across Resource Lock ordering and changes with Runtime identity", () => {
    const fixture = compileFixture();
    const first = compileResolvedTraversalLockV1({
      ...fixture,
      traversingEntityId: "player",
      runtimeImplementationIdentity: RUNTIME_IDENTITY,
    });
    const reorderedWorld = structuredClone(fixture.normalizedWorldIr);
    reorderedWorld.resources.resourceLock = [
      ...reorderedWorld.resources.resourceLock,
    ].reverse();
    const reordered = compileResolvedTraversalLockV1({
      normalizedWorldIr: reorderedWorld,
      executionPlan: fixture.executionPlan,
      traversingEntityId: "player",
      runtimeImplementationIdentity: RUNTIME_IDENTITY,
    });
    const changed = compileResolvedTraversalLockV1({
      ...fixture,
      traversingEntityId: "player",
      runtimeImplementationIdentity: {
        ...RUNTIME_IDENTITY,
        runtimeAdapterHash: `sha256:${"c".repeat(64)}`,
      },
    });

    expect(reordered).toEqual(first);
    expect(changed.resolvedTraversalLockHash).not.toBe(first.resolvedTraversalLockHash);
  });

  it("fails closed for missing, ambiguous, or legacy capability authority", () => {
    const fixture = compileFixture();
    const missingResourceWorld = structuredClone(fixture.normalizedWorldIr);
    missingResourceWorld.resources.resourceLock = missingResourceWorld.resources.resourceLock
      .filter((row) => row.resourceRef !==
        "worldkit://motion-kernel/free-ground@1");
    expect(() => compileResolvedTraversalLockV1({
      normalizedWorldIr: missingResourceWorld,
      executionPlan: fixture.executionPlan,
      traversingEntityId: "player",
      runtimeImplementationIdentity: RUNTIME_IDENTITY,
    })).toThrowError(/TRAVERSAL_LOCK_COMPILE_FAILED.*motion-kernel/);

    const ambiguousWorld = structuredClone(fixture.normalizedWorldIr);
    const definition = ambiguousWorld.resources.subjectDefinitions.find(
      (row) => row.subjectDefinitionRef ===
        "worldkit://subject-definition/humanoid.third-person@1",
    )!;
    definition.capabilityRefs = [
      ...definition.capabilityRefs,
      "worldkit://capability/locomotion.ground@1",
    ];
    expect(() => compileResolvedTraversalLockV1({
      normalizedWorldIr: ambiguousWorld,
      executionPlan: fixture.executionPlan,
      traversingEntityId: "player",
      runtimeImplementationIdentity: RUNTIME_IDENTITY,
    })).toThrowError(/TRAVERSAL_LOCK_COMPILE_FAILED.*ground-locomotion/);

    const legacyPlan = structuredClone(fixture.executionPlan);
    delete legacyPlan.subjects[0]!.capabilityAssembly;
    expect(() => compileResolvedTraversalLockV1({
      normalizedWorldIr: fixture.normalizedWorldIr,
      executionPlan: legacyPlan,
      traversingEntityId: "player",
      runtimeImplementationIdentity: RUNTIME_IDENTITY,
    })).toThrowError(/TRAVERSAL_LOCK_COMPILE_FAILED.*capability/);
  });

  it("rejects collider values that do not match the locked normalized Subject", () => {
    const fixture = compileFixture();
    const tamperedPlan = structuredClone(fixture.executionPlan);
    tamperedPlan.subjects[0]!.collider.maxSlopeDegrees = 10;

    expect(() => compileResolvedTraversalLockV1({
      normalizedWorldIr: fixture.normalizedWorldIr,
      executionPlan: tamperedPlan,
      traversingEntityId: "player",
      runtimeImplementationIdentity: RUNTIME_IDENTITY,
    })).toThrowError(/TRAVERSAL_LOCK_COMPILE_FAILED.*collider/);
  });

  it("rejects a changed Subject Definition lock row without a matching collection hash", () => {
    const fixture = compileFixture();
    const tamperedWorld = structuredClone(fixture.normalizedWorldIr);
    const subjectDefinitionLock = tamperedWorld.resources.resourceLock.find(
      (row) => row.resourceRef ===
        "worldkit://subject-definition/humanoid.third-person@1",
    )!;
    subjectDefinitionLock.contentHash = `sha256:${"f".repeat(64)}`;

    expect(() => compileResolvedTraversalLockV1({
      normalizedWorldIr: tamperedWorld,
      executionPlan: fixture.executionPlan,
      traversingEntityId: "player",
      runtimeImplementationIdentity: RUNTIME_IDENTITY,
    })).toThrowError(/TRAVERSAL_LOCK_COMPILE_FAILED.*Resource Lock hash/);
  });

  it("rejects deleted, changed, or reordered Execution Resource Lock rows", () => {
    const fixture = compileFixture();
    const compileTampered = (executionPlan: ExecutionPlanV5) =>
      compileResolvedTraversalLockV1({
        normalizedWorldIr: fixture.normalizedWorldIr,
        executionPlan,
        traversingEntityId: "player",
        runtimeImplementationIdentity: RUNTIME_IDENTITY,
      });

    const deletedEntries = fixture.executionPlan.resourceLockEntries.slice(1);
    const deleted: ExecutionPlanV5 = {
      ...structuredClone(fixture.executionPlan),
      resourceLockEntries: deletedEntries,
      resourceLockHash: sha256CanonicalJson(deletedEntries),
    };
    expect(() => compileTampered(deleted)).toThrowError(
      /TRAVERSAL_LOCK_COMPILE_FAILED.*Resource Lock/,
    );

    const changedEntries = fixture.executionPlan.resourceLockEntries.map(
      (entry, index) => index === 0
        ? { ...entry, resolvedVersion: "forged" }
        : entry,
    );
    const changed: ExecutionPlanV5 = {
      ...structuredClone(fixture.executionPlan),
      resourceLockEntries: changedEntries,
      resourceLockHash: sha256CanonicalJson(changedEntries),
    };
    expect(() => compileTampered(changed)).toThrowError(
      /TRAVERSAL_LOCK_COMPILE_FAILED.*Resource Lock/,
    );

    const reordered: ExecutionPlanV5 = {
      ...structuredClone(fixture.executionPlan),
      resourceLockEntries: [...fixture.executionPlan.resourceLockEntries]
        .reverse(),
    };
    expect(() => compileTampered(reordered)).toThrowError(
      /TRAVERSAL_LOCK_COMPILE_FAILED.*Resource Lock/,
    );
  });

  it("rejects either side of a Plan-to-normalized-Definition hash mismatch", () => {
    const fixture = compileFixture();
    const tamperedPlan = structuredClone(fixture.executionPlan);
    tamperedPlan.subjects[0]!.subjectDefinitionHash =
      `sha256:${"d".repeat(64)}`;
    expect(() => compileResolvedTraversalLockV1({
      normalizedWorldIr: fixture.normalizedWorldIr,
      executionPlan: tamperedPlan,
      traversingEntityId: "player",
      runtimeImplementationIdentity: RUNTIME_IDENTITY,
    })).toThrowError(/TRAVERSAL_LOCK_COMPILE_FAILED.*Subject Definition/);

    const tamperedWorld = structuredClone(fixture.normalizedWorldIr);
    tamperedWorld.resources.subjectDefinitions[0]!.subjectDefinitionHash =
      `sha256:${"e".repeat(64)}`;
    expect(() => compileResolvedTraversalLockV1({
      normalizedWorldIr: tamperedWorld,
      executionPlan: fixture.executionPlan,
      traversingEntityId: "player",
      runtimeImplementationIdentity: RUNTIME_IDENTITY,
    })).toThrowError(/TRAVERSAL_LOCK_COMPILE_FAILED.*Subject Definition/);
  });

  it("maps incomplete capability assemblies to the closed lock diagnostic", () => {
    const fixture = compileFixture();
    const incompletePlan = structuredClone(fixture.executionPlan);
    incompletePlan.subjects[0]!.capabilityAssembly = {} as never;

    expect(() => compileResolvedTraversalLockV1({
      normalizedWorldIr: fixture.normalizedWorldIr,
      executionPlan: incompletePlan,
      traversingEntityId: "player",
      runtimeImplementationIdentity: RUNTIME_IDENTITY,
    })).toThrowError(/^TRAVERSAL_LOCK_COMPILE_FAILED:/);
  });
});
