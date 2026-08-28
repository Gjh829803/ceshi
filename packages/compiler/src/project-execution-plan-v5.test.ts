import {
  normalizeAuthoringSpecV4,
  type AuthoringSpecV4,
} from "@whitebox-world/authoring";
import {
  createValidMountedOnAuthoringSpec,
  createValidRiggedPackageSubjectWorldV4,
} from "@whitebox-world/authoring/testing";
import {
  createGameplayBootstrapResourceLockEntryV1,
  createGameplayBootstrapV1,
  type GameplayBootstrapV1,
} from "@whitebox-world/gameplay-contracts";
import {
  sha256CanonicalJson,
  stringifyCanonicalJson,
} from "@whitebox-world/protocol";
import {
  canonicalExecutionResourceLockEntriesV1,
  hashExecutionPlanV5,
  hashWorldRuntimeBootstrapBodyV1,
  parseExecutionPlanV5,
  type ExecutionPlanV5,
} from "@whitebox-world/runtime-contracts";
import { describe, expect, it } from "vitest";

import { compileWorldV5 } from "./compile.js";
import {
  EXECUTION_PLAN_V5_FIELD_ACCOUNTING_V1,
  hashProjectedCanonicalSceneExecutionPlanV1,
  projectExecutionPlanV5,
} from "./project-execution-plan-v5.js";

const RUNTIME_BOOTSTRAP_REF =
  "worldkit://world-runtime-bootstrap/bna1-v5-projection@1";
const PROJECTION_SOURCE_COMMIT =
  "8410cb30797cb635ba8768dde720183f88ff01a7";
const PROJECTION_RECEIPT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../artifacts/bna-1/execution-plan-v5-projection-receipt.json",
);

function withStaticTraversalSurface(spec: AuthoringSpecV4): AuthoringSpecV4 {
  return {
    ...spec,
    resources: {
      ...spec.resources,
      prototypes: spec.resources.prototypes.map((prototype) => ({
        ...prototype,
        collisionEnabled: true,
        traversalSurfaceBindings: [{
          id: "projection-deck",
          kind: "collider-subshape" as const,
          logicalSubshapeId: "primary",
          traversalSurfaceProfileRef:
            "worldkit://traversal-surface-profile/ground.static@1",
        }],
      })),
    },
  };
}

function compileFixture(
  spec: AuthoringSpecV4,
  gameplayBootstrap: GameplayBootstrapV1,
): ExecutionPlanV5 {
  const normalized = normalizeAuthoringSpecV4(spec);
  if (
    !normalized.ok ||
    normalized.value === undefined ||
    normalized.normalizedWorldIrHash === undefined
  ) {
    throw new Error(
      `Projection fixture normalization failed: ${JSON.stringify(normalized.diagnostics)}`,
    );
  }
  const compiled = compileWorldV5({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    gameplayBootstrapResourceLock:
      createGameplayBootstrapResourceLockEntryV1(gameplayBootstrap),
  });
  if (!compiled.ok || compiled.executionPlan === undefined) {
    throw new Error(
      `Projection fixture compilation failed: ${JSON.stringify(compiled.diagnostics)}`,
    );
  }
  return compiled.executionPlan;
}

function uniqueByKey<Value>(
  values: readonly Value[],
  key: (value: Value) => string,
): readonly Value[] {
  return [...new Map(values.map((value) => [key(value), value])).values()]
    .sort((left, right) => key(left).localeCompare(key(right)));
}

function asymmetricProjectionFixture(): Readonly<{
  executionPlan: ExecutionPlanV5;
  gameplayBootstrap: GameplayBootstrapV1;
}> {
  const mountedSpec = withStaticTraversalSurface(
    createValidMountedOnAuthoringSpec(),
  );
  const mountedNormalized = normalizeAuthoringSpecV4(mountedSpec);
  if (!mountedNormalized.ok || mountedNormalized.value === undefined) {
    throw new Error("Mounted projection fixture did not normalize.");
  }
  const gameplayBootstrap = createGameplayBootstrapV1({
    kind: "gameplay-bootstrap",
    id: "bna1-v5-projection.gameplay",
    version: 1,
    resourceRef: "worldkit://gameplay-bootstrap/bna1-v5-projection@1",
    entityDescriptors: [],
    featureResourceLocks: [],
    semanticActionDefinitions: [],
    availableCapabilityRefs: [],
    initialRelationshipStates: mountedNormalized.value.relationships.map(
      (relationship) => ({
        ...structuredClone(relationship),
        establishedSimulationTick: 0,
      }),
    ),
  });
  const mountedPlan = compileFixture(mountedSpec, gameplayBootstrap);
  const riggedPlan = compileFixture(
    createValidRiggedPackageSubjectWorldV4(),
    gameplayBootstrap,
  );
  const resourceLockEntries = canonicalExecutionResourceLockEntriesV1(
    uniqueByKey(
      [...mountedPlan.resourceLockEntries, ...riggedPlan.resourceLockEntries],
      (entry) => `${entry.resourceKind}\u0000${entry.resourceRef}`,
    ),
  );
  const rawPlan: ExecutionPlanV5 = {
    ...structuredClone(mountedPlan),
    gravityMetersPerSecondSquaredXYZ: [0.35, -12.5, 0.15],
    subjectAssets: uniqueByKey(
      [...mountedPlan.subjectAssets, ...riggedPlan.subjectAssets],
      (asset) => asset.subjectAssetRef,
    ),
    rigProfiles: uniqueByKey(
      [...mountedPlan.rigProfiles, ...riggedPlan.rigProfiles],
      (profile) => profile.rigProfileRef,
    ),
    animationSets: uniqueByKey(
      [...mountedPlan.animationSets, ...riggedPlan.animationSets],
      (set) => set.animationSetRef,
    ),
    colliderProfiles: uniqueByKey(
      [...mountedPlan.colliderProfiles, ...riggedPlan.colliderProfiles],
      (profile) => profile.colliderProfileRef,
    ),
    subjects: [
      ...mountedPlan.subjects.filter((subject) => subject.entityId !== "player"),
      ...riggedPlan.subjects,
    ]
      .sort((left, right) => left.entityId.localeCompare(right.entityId)),
    camera: {
      ...mountedPlan.camera,
      pitchRadians: 0.22,
      distanceMeters: 5.5,
      targetHeightMeters: 1.7,
      fovDegrees: 61,
      aspectRatio: 16 / 9,
    },
    resourceLockEntries,
    resourceLockHash: sha256CanonicalJson(resourceLockEntries),
  };
  return {
    executionPlan: parseExecutionPlanV5(rawPlan),
    gameplayBootstrap,
  };
}

describe("one-time ExecutionPlanV5 projection", () => {
  it("accounts for every V5 top-level field exactly once, including explicit deletions", () => {
    const { executionPlan } = asymmetricProjectionFixture();
    const sourceFields = EXECUTION_PLAN_V5_FIELD_ACCOUNTING_V1.map(
      (row) => row.sourceField,
    );

    expect(sourceFields).toEqual([...sourceFields].sort());
    expect(new Set(sourceFields).size).toBe(sourceFields.length);
    expect(sourceFields).toEqual(Object.keys(executionPlan).sort());
    expect(EXECUTION_PLAN_V5_FIELD_ACCOUNTING_V1).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceField: "runtimeBackend",
          allocations: [expect.objectContaining({
            owner: "deliberate-deletion",
            sourceSlice: "all",
          })],
        }),
        expect.objectContaining({
          sourceField: "camera",
          allocations: expect.arrayContaining([
            expect.objectContaining({ owner: "runtime-bootstrap" }),
            expect.objectContaining({
              owner: "deliberate-deletion",
              sourceSlice: "aspectRatio",
            }),
          ]),
        }),
      ]),
    );
  });

  it("preserves every asymmetric Runtime closure and Scene field exactly once", () => {
    const { executionPlan, gameplayBootstrap } = asymmetricProjectionFixture();
    const projected = projectExecutionPlanV5({
      executionPlan,
      gameplayBootstrap,
      worldRuntimeBootstrapRef: RUNTIME_BOOTSTRAP_REF,
    });
    const scene = projected.canonicalSceneExecutionPlan;
    const runtime = projected.worldRuntimeBootstrap;

    expect(executionPlan.gravityMetersPerSecondSquaredXYZ).not.toEqual([0, -9.81, 0]);
    expect(executionPlan.camera).toMatchObject({
      pitchRadians: 0.22,
      distanceMeters: 5.5,
      targetHeightMeters: 1.7,
      fovDegrees: 61,
      aspectRatio: 16 / 9,
    });
    expect(executionPlan.waters.length).toBeGreaterThan(0);
    expect(executionPlan.staticColliders.length).toBeGreaterThan(0);
    expect(
      executionPlan.traversal.surfaces.some(
        (surface) => surface.kind === "static-collider",
      ),
    ).toBe(true);
    expect(
      executionPlan.subjects.some(
        (subject) => subject.visualBinding.mode === "rigged",
      ),
    ).toBe(true);
    expect(
      executionPlan.subjects.some(
        (subject) => subject.availableControlFeels.length > 1,
      ),
    ).toBe(true);
    expect(executionPlan.initialRelationships).toHaveLength(1);
    expect(Object.keys(executionPlan.layout.placementsByEntityId).length)
      .toBeGreaterThan(0);

    expect(runtime.gravityMetersPerSecondSquaredXYZ).toEqual(
      executionPlan.gravityMetersPerSecondSquaredXYZ,
    );
    expect(runtime.initialCamera).toEqual({
      mode: "third-person",
      cameraEntityId: executionPlan.camera.cameraEntityId,
      targetEntityId: executionPlan.camera.targetEntityId,
      cameraRigProfileRef: executionPlan.camera.rigRef,
      pitchRadians: executionPlan.camera.pitchRadians,
      distanceMeters: executionPlan.camera.distanceMeters,
      targetHeightMeters: executionPlan.camera.targetHeightMeters,
      fovDegrees: executionPlan.camera.fovDegrees,
      manualSwitchAllowed: executionPlan.camera.manualSwitchAllowed,
    });
    expect(runtime.initialCamera).not.toHaveProperty("aspectRatio");
    expect(runtime.subjectAssets).toEqual(executionPlan.subjectAssets);
    expect(runtime.rigProfiles).toEqual(executionPlan.rigProfiles);
    expect(runtime.animationSets).toEqual(executionPlan.animationSets);
    expect(runtime.colliderProfiles).toEqual(executionPlan.colliderProfiles);
    expect(runtime.actionPresentationRegistry).toEqual(
      executionPlan.actionPresentationRegistry,
    );
    expect(runtime.subjectRuntimeDescriptors).toEqual(
      executionPlan.subjects.map((subject) => {
        const {
          spawnAnchorEntityId: _spawnAnchorEntityId,
          spawnSubjectOriginPositionMetersXYZ: _position,
          spawnSubjectFacingRadians: _facing,
          ...descriptor
        } = subject;
        return descriptor;
      }),
    );
    expect(runtime.contentHash).toBe(
      hashWorldRuntimeBootstrapBodyV1(
        Object.fromEntries(
          Object.entries(runtime).filter(([key]) => key !== "contentHash"),
        ),
      ),
    );

    expect(scene).toMatchObject({
      kind: "worldkit-canonical-scene-execution-plan",
      schemaVersion: 1,
      id: executionPlan.id,
      seed: executionPlan.seed,
      authoringSpecHash: executionPlan.authoringSpecHash,
      normalizedWorldIrHash: executionPlan.normalizedWorldIrHash,
      coordinateSystem: executionPlan.coordinateSystem,
      atmospherePreset: executionPlan.atmospherePreset,
      worldRuntimeBootstrapRef: RUNTIME_BOOTSTRAP_REF,
      worldRuntimeBootstrapHash: runtime.contentHash,
      terrain: executionPlan.terrain,
      waters: executionPlan.waters,
      objects: executionPlan.objects,
      sceneResourceUsage: executionPlan.resourceUsage,
      layout: executionPlan.layout,
      traversal: executionPlan.traversal,
      staticColliders: executionPlan.staticColliders,
    });
    expect(scene.subjectInstances).toEqual(
      executionPlan.subjects.map((subject) => ({
        entityId: subject.entityId,
        spawnAnchorEntityId: subject.spawnAnchorEntityId,
        subjectOriginPositionMetersXYZ:
          subject.spawnSubjectOriginPositionMetersXYZ,
        subjectFacingRadians: subject.spawnSubjectFacingRadians,
      })),
    );
    expect(scene).not.toHaveProperty("gravityMetersPerSecondSquaredXYZ");
    expect(scene).not.toHaveProperty("camera");
    expect(scene).not.toHaveProperty("subjects");
    expect(runtime).not.toHaveProperty("terrain");
    expect(runtime).not.toHaveProperty("layout");
    expect(runtime).not.toHaveProperty("traversal");
  });

  it("partitions every Resource Lock and preserves Gameplay relationships", () => {
    const { executionPlan, gameplayBootstrap } = asymmetricProjectionFixture();
    const projected = projectExecutionPlanV5({
      executionPlan,
      gameplayBootstrap,
      worldRuntimeBootstrapRef: RUNTIME_BOOTSTRAP_REF,
    });
    const sceneLocks = projected.canonicalSceneExecutionPlan
      .sceneResourceLockEntries;
    const runtimeLocks = projected.worldRuntimeBootstrap
      .runtimeResourceLockEntries;

    expect(sceneLocks.every(
      (entry) => entry.resourceKind === "traversal-surface-profile",
    )).toBe(true);
    expect(runtimeLocks.some(
      (entry) => entry.resourceKind === "gameplay-bootstrap",
    )).toBe(true);
    expect(
      [...sceneLocks, ...runtimeLocks]
        .sort((left, right) =>
          left.resourceRef.localeCompare(right.resourceRef) ||
          left.resourceKind.localeCompare(right.resourceKind)),
    ).toEqual(executionPlan.resourceLockEntries);
    expect(runtimeLocks).toContainEqual(
      createGameplayBootstrapResourceLockEntryV1(gameplayBootstrap),
    );
    expect(gameplayBootstrap.initialRelationshipStates).toEqual(
      executionPlan.initialRelationships,
    );
  });

  it("recomputes independent canonical hashes and rejects stale Gameplay authority", () => {
    const { executionPlan, gameplayBootstrap } = asymmetricProjectionFixture();
    const projected = projectExecutionPlanV5({
      executionPlan,
      gameplayBootstrap,
      worldRuntimeBootstrapRef: RUNTIME_BOOTSTRAP_REF,
    });

    expect(projected.sourceExecutionPlanHash).toBe(
      hashExecutionPlanV5(executionPlan),
    );
    expect(projected.executionPlanHash).toBe(
      hashProjectedCanonicalSceneExecutionPlanV1(
        projected.canonicalSceneExecutionPlan,
      ),
    );
    expect(projected.executionPlanHash).toBe(
      sha256CanonicalJson(projected.canonicalSceneExecutionPlan),
    );
    expect(projected.fieldAccounting).toBe(
      EXECUTION_PLAN_V5_FIELD_ACCOUNTING_V1,
    );

    const { contentHash: _contentHash, ...gameplayBody } = gameplayBootstrap;
    const staleGameplay = createGameplayBootstrapV1({
      ...gameplayBody,
      initialRelationshipStates: [],
    });
    expect(() => projectExecutionPlanV5({
      executionPlan,
      gameplayBootstrap: staleGameplay,
      worldRuntimeBootstrapRef: RUNTIME_BOOTSTRAP_REF,
    })).toThrow(/EXECUTION_PLAN_V5_PROJECTION_INVALID/);

    const wrongRef = createGameplayBootstrapV1({
      ...gameplayBody,
      resourceRef: "worldkit://gameplay-bootstrap/wrong@1",
    });
    expect(() => projectExecutionPlanV5({
      executionPlan,
      gameplayBootstrap: wrongRef,
      worldRuntimeBootstrapRef: RUNTIME_BOOTSTRAP_REF,
    })).toThrow(/EXECUTION_PLAN_V5_PROJECTION_INVALID/);

    expect(stringifyCanonicalJson(projected.fieldAccounting)).toContain(
      "viewport aspect ratio",
    );
  });

  it("matches the durable receipt generated from this exact asymmetric fixture", () => {
    const { executionPlan, gameplayBootstrap } = asymmetricProjectionFixture();
    const projected = projectExecutionPlanV5({
      executionPlan,
      gameplayBootstrap,
      worldRuntimeBootstrapRef: RUNTIME_BOOTSTRAP_REF,
    });
    const expectedReceipt = {
      kind: "execution-plan-v5-projection-receipt",
      schemaVersion: 1,
      sourceCommit: PROJECTION_SOURCE_COMMIT,
      fixtureIds: {
        executionPlanId: executionPlan.id,
        gameplayBootstrapId: gameplayBootstrap.id,
        initialControlledEntityId: executionPlan.initialControlledEntityId,
        worldRuntimeBootstrapRef: RUNTIME_BOOTSTRAP_REF,
      },
      sourceExecutionPlanHash: projected.sourceExecutionPlanHash,
      projectedExecutionPlanHash: projected.executionPlanHash,
      worldRuntimeBootstrapHash:
        projected.worldRuntimeBootstrap.contentHash,
      gameplayBootstrapHash: gameplayBootstrap.contentHash,
      fieldAccounting: EXECUTION_PLAN_V5_FIELD_ACCOUNTING_V1,
      asymmetricFacts: {
        gravityMetersPerSecondSquaredXYZ:
          executionPlan.gravityMetersPerSecondSquaredXYZ,
        camera: executionPlan.camera,
        riggedSubjectEntityIds: executionPlan.subjects
          .filter((subject) => subject.visualBinding.mode === "rigged")
          .map((subject) => subject.entityId),
        multiFeelSubjectEntityIds: executionPlan.subjects
          .filter((subject) => subject.availableControlFeels.length > 1)
          .map((subject) => subject.entityId),
        relationshipIds: executionPlan.initialRelationships.map(
          (relationship) => relationship.id,
        ),
        waterEntityIds: executionPlan.waters.map((water) => water.entityId),
        staticColliderIds: executionPlan.staticColliders.map(
          (collider) => collider.colliderSubshapeId,
        ),
        traversalSurfaceIds: executionPlan.traversal.surfaces.map(
          (surface) => surface.traversalSurfaceId,
        ),
        layoutPlacementEntityIds: Object.keys(
          executionPlan.layout.placementsByEntityId,
        ).sort(),
        resourceLockRefs: executionPlan.resourceLockEntries.map(
          (entry) => entry.resourceRef,
        ),
      },
      commandEvidence: {
        command:
          "pnpm vitest run packages/compiler/src/project-execution-plan-v5.test.ts",
        outcome: "passed",
        testFilesPassed: 1,
        testsPassed: 5,
      },
      acceptance: "migration-evidence-only-not-production-admission",
    };

    if (process.env.BNA1_WRITE_PROJECTION_RECEIPT === "1") {
      mkdirSync(path.dirname(PROJECTION_RECEIPT_PATH), { recursive: true });
      writeFileSync(
        PROJECTION_RECEIPT_PATH,
        `${JSON.stringify(expectedReceipt, null, 2)}\n`,
        "utf8",
      );
    }
    expect(
      JSON.parse(readFileSync(PROJECTION_RECEIPT_PATH, "utf8")),
    ).toEqual(expectedReceipt);
  });
});
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
