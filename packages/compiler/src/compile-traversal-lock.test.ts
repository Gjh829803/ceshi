import { describe, expect, it } from "vitest";

import {
  normalizeAuthoringSpecV4,
  type AuthoringSpecV4,
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import {
  createGameplayBootstrapV1,
  RETAINED_SUPPORT_SEMANTIC_FACT_PROJECTOR_PROFILE_RESOURCE_V1,
} from "@whitebox-world/gameplay-contracts";
import {
  createCanonicalSceneExecutionPlanV1,
  createWorldRuntimeBootstrapV1,
  type CanonicalSceneExecutionPlanV1,
  type WorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import type { TraversalRuntimeImplementationIdentityV1 } from "@whitebox-world/traversal";
import {
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import { createValidAuthoringSpec } from "@whitebox-world/authoring/testing";

import { compileResolvedTraversalLockV1, compileCanonicalWorldV1 } from "./index";

const RUNTIME_IDENTITY: TraversalRuntimeImplementationIdentityV1 = {
  runtimeBackendRef: "worldkit://runtime-backend/babylon-havok@1",
  runtimeBackendResolvedVersion: "9.21.2+1.3.14",
  runtimeBackendHash: `sha256:${"a".repeat(64)}`,
  runtimeAdapterRef: "worldkit://runtime-adapter/babylon.character-controller@1",
  runtimeAdapterResolvedVersion: "1",
  runtimeAdapterHash: `sha256:${"b".repeat(64)}`,
};
const GAMEPLAY_BOOTSTRAP = createGameplayBootstrapV1({
    kind: "gameplay-bootstrap",
    id: "compile-traversal-lock-test.gameplay",
    version: 1,
    resourceRef: "worldkit://gameplay-bootstrap/compile-traversal-lock-test@1",
    semanticFactProjectorProfileResource:
      RETAINED_SUPPORT_SEMANTIC_FACT_PROJECTOR_PROFILE_RESOURCE_V1,
    entityDescriptors: [],
    featureResourceLocks: [],
    semanticActionDefinitions: [],
    availableCapabilityRefs: [],
    initialRelationshipStates: [],
  });

function routeWorld(): AuthoringSpecV4 {
  const source = createValidAuthoringSpec();
  return {
    ...source,
    schemaVersion: 4,
    resources: {
      ...source.resources,
      prototypes: source.resources.prototypes.map((prototype) => ({
        ...prototype,
        traversalSurfaceBindings: [{
          id: "deck",
          kind: "collider-subshape" as const,
          logicalSubshapeId: "primary",
          traversalSurfaceProfileRef:
            "worldkit://traversal-surface-profile/ground.static@1",
        }],
      })),
    },
    spatial: {
      ...source.spatial,
      traversalAreas: [],
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
  canonicalSceneExecutionPlan: CanonicalSceneExecutionPlanV1;
  worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
} {
  const normalized = normalizeAuthoringSpecV4(routeWorld());
  if (!normalized.ok || normalized.value === undefined ||
    normalized.normalizedWorldIrHash === undefined) {
    throw new Error("Route fixture normalization failed.");
  }
  const compiled = compileCanonicalWorldV1({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    gameplayBootstrap: GAMEPLAY_BOOTSTRAP,
    worldRuntimeBootstrapRef:
      `worldkit://world-runtime-bootstrap/${normalized.value.id}@1`,
  });
  if (!compiled.ok) {
    throw new Error("Route fixture compilation failed.");
  }
  return {
    normalizedWorldIr: normalized.value,
    canonicalSceneExecutionPlan: compiled.canonicalSceneExecutionPlan,
    worldRuntimeBootstrap: compiled.worldRuntimeBootstrap,
  };
}

function recreateRuntimeBootstrap(
  input: WorldRuntimeBootstrapV1,
): WorldRuntimeBootstrapV1 {
  const { contentHash: _contentHash, ...body } = input;
  return createWorldRuntimeBootstrapV1(body);
}

function relinkScenePlan(
  input: CanonicalSceneExecutionPlanV1,
  worldRuntimeBootstrap: WorldRuntimeBootstrapV1,
): CanonicalSceneExecutionPlanV1 {
  return createCanonicalSceneExecutionPlanV1({
    ...input,
    worldRuntimeBootstrapHash: worldRuntimeBootstrap.contentHash,
  });
}

describe("compileResolvedTraversalLockV1", () => {
  it("preserves the Traversal Surface Profile row byte-identically", () => {
    const fixture = compileFixture();
    const normalizedRow = fixture.normalizedWorldIr.resources.resourceLock.find(
      (row) => row.resourceKind === "traversal-surface-profile",
    );
    const executionRow = fixture.canonicalSceneExecutionPlan.sceneResourceLockEntries.find(
      (row) => row.resourceKind === "traversal-surface-profile",
    );

    expect(normalizedRow).toEqual({
      resourceRef: "worldkit://traversal-surface-profile/ground.static@1",
      resourceKind: "traversal-surface-profile",
      resolvedVersion: "1",
      contentHash:
        "sha256:16d21f75625a849156be42b27c11cea30f461292f346ce8aae52f6049f0aa4d4",
    });
    expect(executionRow).toEqual(normalizedRow);
  });

  it("fails closed when a bound Profile lock row is missing or changed consistently", () => {
    const fixture = compileFixture();
    const compileTampered = (normalizedWorldIr: NormalizedWorldIRV4) =>
      compileCanonicalWorldV1({
        normalizedWorldIr,
        normalizedWorldIrHash:
          sha256CanonicalJson(normalizedWorldIr) as Sha256HashV1,
        gameplayBootstrap: GAMEPLAY_BOOTSTRAP,
        worldRuntimeBootstrapRef:
          `worldkit://world-runtime-bootstrap/${normalizedWorldIr.id}@1`,
      });

    const expectProfileLockFailure = (result: ReturnType<typeof compileCanonicalWorldV1>) => {
      expect(result).toMatchObject({
        ok: false,
        diagnostics: expect.arrayContaining([expect.objectContaining({
          code: "COMPILER_NORMALIZED_IR_INVALID",
          message: expect.stringMatching(/Traversal Surface Profile lock join/),
        })]),
      });
    };

    const missingWorld = structuredClone(fixture.normalizedWorldIr);
    missingWorld.resources.resourceLock = missingWorld.resources.resourceLock.filter(
      (row) => row.resourceKind !== "traversal-surface-profile",
    );
    missingWorld.resources.resourceLockHash = sha256CanonicalJson(
      missingWorld.resources.resourceLock,
    );
    expectProfileLockFailure(compileTampered(missingWorld));

    const changedWorld = structuredClone(fixture.normalizedWorldIr);
    changedWorld.resources.resourceLock = changedWorld.resources.resourceLock.map(
      (row) => row.resourceKind === "traversal-surface-profile"
        ? { ...row, contentHash: `sha256:${"f".repeat(64)}` }
        : row,
    );
    changedWorld.resources.resourceLockHash = sha256CanonicalJson(
      changedWorld.resources.resourceLock,
    );
    expectProfileLockFailure(compileTampered(changedWorld));
  });

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
      canonicalSceneExecutionPlan: fixture.canonicalSceneExecutionPlan,
      worldRuntimeBootstrap: fixture.worldRuntimeBootstrap,
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
      canonicalSceneExecutionPlan: fixture.canonicalSceneExecutionPlan,
      worldRuntimeBootstrap: fixture.worldRuntimeBootstrap,
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
      canonicalSceneExecutionPlan: fixture.canonicalSceneExecutionPlan,
      worldRuntimeBootstrap: fixture.worldRuntimeBootstrap,
      traversingEntityId: "player",
      runtimeImplementationIdentity: RUNTIME_IDENTITY,
    })).toThrowError(/TRAVERSAL_LOCK_COMPILE_FAILED.*ground-locomotion/);

    const legacyRuntime = structuredClone(fixture.worldRuntimeBootstrap);
    const legacySubject = legacyRuntime.subjectRuntimeDescriptors[0] as {
      capabilityAssembly?: unknown;
    };
    delete legacySubject.capabilityAssembly;
    expect(() => compileResolvedTraversalLockV1({
      normalizedWorldIr: fixture.normalizedWorldIr,
      canonicalSceneExecutionPlan: fixture.canonicalSceneExecutionPlan,
      worldRuntimeBootstrap: legacyRuntime,
      traversingEntityId: "player",
      runtimeImplementationIdentity: RUNTIME_IDENTITY,
    })).toThrowError(
      /TRAVERSAL_LOCK_COMPILE_FAILED.*Canonical Scene Plan or Runtime Bootstrap/,
    );
  });

  it("rejects collider values that do not match the locked normalized Subject", () => {
    const fixture = compileFixture();
    const mutableRuntime = structuredClone(fixture.worldRuntimeBootstrap);
    mutableRuntime.subjectRuntimeDescriptors[0]!.collider.maxSlopeDegrees = 10;
    const tamperedRuntime = recreateRuntimeBootstrap(mutableRuntime);
    const relinkedScene = relinkScenePlan(
      fixture.canonicalSceneExecutionPlan,
      tamperedRuntime,
    );

    expect(() => compileResolvedTraversalLockV1({
      normalizedWorldIr: fixture.normalizedWorldIr,
      canonicalSceneExecutionPlan: relinkedScene,
      worldRuntimeBootstrap: tamperedRuntime,
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
      canonicalSceneExecutionPlan: fixture.canonicalSceneExecutionPlan,
      worldRuntimeBootstrap: fixture.worldRuntimeBootstrap,
      traversingEntityId: "player",
      runtimeImplementationIdentity: RUNTIME_IDENTITY,
    })).toThrowError(/TRAVERSAL_LOCK_COMPILE_FAILED.*Resource Lock hash/);
  });

  it("rejects deleted, changed, or reordered owner Resource Lock rows", () => {
    const fixture = compileFixture();
    const compileTampered = (input: {
      canonicalSceneExecutionPlan?: CanonicalSceneExecutionPlanV1;
      worldRuntimeBootstrap?: WorldRuntimeBootstrapV1;
    }) =>
      compileResolvedTraversalLockV1({
        normalizedWorldIr: fixture.normalizedWorldIr,
        canonicalSceneExecutionPlan:
          input.canonicalSceneExecutionPlan ?? fixture.canonicalSceneExecutionPlan,
        worldRuntimeBootstrap:
          input.worldRuntimeBootstrap ?? fixture.worldRuntimeBootstrap,
        traversingEntityId: "player",
        runtimeImplementationIdentity: RUNTIME_IDENTITY,
      });

    const deletedEntries = fixture.canonicalSceneExecutionPlan
      .sceneResourceLockEntries.slice(1);
    const deleted: CanonicalSceneExecutionPlanV1 = {
      ...structuredClone(fixture.canonicalSceneExecutionPlan),
      sceneResourceLockEntries: deletedEntries,
      sceneResourceLockHash:
        sha256CanonicalJson(deletedEntries) as Sha256HashV1,
    };
    expect(() => compileTampered({ canonicalSceneExecutionPlan: deleted }))
      .toThrowError(
      /TRAVERSAL_LOCK_COMPILE_FAILED.*Resource Lock/,
    );

    const changedEntries = fixture.worldRuntimeBootstrap.runtimeResourceLockEntries.map(
      (entry, index) => index === 0
        ? { ...entry, resolvedVersion: "forged" }
        : entry,
    );
    const changed: WorldRuntimeBootstrapV1 = {
      ...structuredClone(fixture.worldRuntimeBootstrap),
      runtimeResourceLockEntries: changedEntries,
    };
    expect(() => compileTampered({ worldRuntimeBootstrap: changed }))
      .toThrowError(
      /TRAVERSAL_LOCK_COMPILE_FAILED.*Canonical Scene Plan or Runtime Bootstrap/,
    );

    const reordered: WorldRuntimeBootstrapV1 = {
      ...structuredClone(fixture.worldRuntimeBootstrap),
      runtimeResourceLockEntries: [
        ...fixture.worldRuntimeBootstrap.runtimeResourceLockEntries,
      ].reverse(),
    };
    expect(() => compileTampered({ worldRuntimeBootstrap: reordered }))
      .toThrowError(
      /TRAVERSAL_LOCK_COMPILE_FAILED.*Canonical Scene Plan or Runtime Bootstrap/,
    );
  });

  it("rejects either side of a Plan-to-normalized-Definition hash mismatch", () => {
    const fixture = compileFixture();
    const mutableRuntime = {
      ...structuredClone(fixture.worldRuntimeBootstrap),
      subjectRuntimeDescriptors:
        fixture.worldRuntimeBootstrap.subjectRuntimeDescriptors.map(
          (subject, index) => index === 0
            ? {
                ...structuredClone(subject),
                subjectDefinitionHash:
                  `sha256:${"d".repeat(64)}` as Sha256HashV1,
              }
            : structuredClone(subject),
        ),
    };
    const tamperedRuntime = recreateRuntimeBootstrap(mutableRuntime);
    const relinkedScene = relinkScenePlan(
      fixture.canonicalSceneExecutionPlan,
      tamperedRuntime,
    );
    expect(() => compileResolvedTraversalLockV1({
      normalizedWorldIr: fixture.normalizedWorldIr,
      canonicalSceneExecutionPlan: relinkedScene,
      worldRuntimeBootstrap: tamperedRuntime,
      traversingEntityId: "player",
      runtimeImplementationIdentity: RUNTIME_IDENTITY,
    })).toThrowError(/TRAVERSAL_LOCK_COMPILE_FAILED.*Subject Definition/);

    const tamperedWorld = structuredClone(fixture.normalizedWorldIr);
    tamperedWorld.resources.subjectDefinitions[0]!.subjectDefinitionHash =
      `sha256:${"e".repeat(64)}`;
    expect(() => compileResolvedTraversalLockV1({
      normalizedWorldIr: tamperedWorld,
      canonicalSceneExecutionPlan: fixture.canonicalSceneExecutionPlan,
      worldRuntimeBootstrap: fixture.worldRuntimeBootstrap,
      traversingEntityId: "player",
      runtimeImplementationIdentity: RUNTIME_IDENTITY,
    })).toThrowError(/TRAVERSAL_LOCK_COMPILE_FAILED.*Subject Definition/);
  });

  it("maps incomplete capability assemblies to the closed lock diagnostic", () => {
    const fixture = compileFixture();
    const incompleteRuntime = {
      ...structuredClone(fixture.worldRuntimeBootstrap),
      subjectRuntimeDescriptors:
        fixture.worldRuntimeBootstrap.subjectRuntimeDescriptors.map(
          (subject, index) => index === 0
            ? { ...structuredClone(subject), capabilityAssembly: {} as never }
            : structuredClone(subject),
        ),
    };

    expect(() => compileResolvedTraversalLockV1({
      normalizedWorldIr: fixture.normalizedWorldIr,
      canonicalSceneExecutionPlan: fixture.canonicalSceneExecutionPlan,
      worldRuntimeBootstrap: incompleteRuntime,
      traversingEntityId: "player",
      runtimeImplementationIdentity: RUNTIME_IDENTITY,
    })).toThrowError(/^TRAVERSAL_LOCK_COMPILE_FAILED:/);
  });
});
