import { describe, expect, it } from "vitest";

import * as traversal from "./index.js";

const HASH_A =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const HASH_B =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const EMPTY_COLLIDER_ARTIFACT_HASH =
  "sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945" as const;

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function capabilityEnvelope() {
  return deepFreeze({
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
    resolvedTraversalLockHash: HASH_A,
    graphBuilderProfileRef:
      "worldkit://traversal-graph-builder-profile/outdoor-humanoid.r1@1",
    graphBuilderResolvedVersion: "1",
    graphBuilderProfileHash: HASH_A,
    clearanceMarginMeters: 0.05,
    voxelCellSizeMeters: 0.15,
    voxelCellHeightMeters: 0.1,
    tileSizeCells: 64,
    maximumEdgeLengthMeters: 2.4,
    maximumSimplificationErrorMeters: 0.15,
    positionQuantizationMeters: 0.001,
    slopeCostWeight: 1,
    stepCostWeight: 1,
    maximumNodes: 100_000,
    maximumEdges: 200_000,
    maximumTiles: 1_024,
    maximumSearchSteps: 100_000,
  });
}

function validBuildInput() {
  return {
    kind: "heightfield-route-build-input",
    schemaVersion: 1,
    authoringSpecHash: HASH_A,
    layoutSolveReportHash: HASH_A,
    resourceLockHash: HASH_A,
    connectivityRequirement: {
      constraintId: "hero-to-goal",
      traversingEntityId: "player",
      startAnchorEntityId: "spawn-main",
      destinationAnchorEntityId: "goal",
      routeId: "main-route",
    },
    startAnchor: {
      entityId: "spawn-main",
      positionMetersXYZ: [0, 0, 0],
    },
    destinationAnchor: {
      entityId: "goal",
      positionMetersXYZ: [1, 0, 0],
    },
    hardRibbon: {
      routeId: "main-route",
      pointsMetersXZ: [[0, 0], [1, 0]],
      widthMeters: 2,
      locomotionProfileRef:
        "worldkit://locomotion-profile/ground.standard@1",
    },
    traversalSurface: {
      traversalSurfaceId: "surface-main",
      surfaceEntityId: "terrain-main",
      colliderSubshapeId: "terrain-heightfield",
      resourceRef: "package://traversal-surface/terrain-main.heightfield@1",
      resolvedVersion: "1",
      resourceHash: HASH_A,
    },
    capabilityEnvelope: capabilityEnvelope(),
    terrainSource: {
      kind: "bounded",
      terrainEntityId: "terrain-main",
      terrainArtifactHash: HASH_A,
      triangleSoup: {
        positionsMetersXYZ: [0, 0, 0, 0, 0, 1, 1, 0, 0],
        triangleIndices: [0, 1, 2],
      },
      minimumMetersXZ: [0, 0],
      maximumMetersXZ: [1, 1],
    },
    blockingColliders: [],
    colliderArtifactHash: EMPTY_COLLIDER_ARTIFACT_HASH,
    blockedWaterExclusions: [],
  };
}

function assertBuildInput(value: unknown): unknown {
  const candidate = (
    traversal as typeof traversal & {
      assertHeightfieldRouteBuildInputV1?: (input: unknown) => unknown;
    }
  ).assertHeightfieldRouteBuildInputV1;
  expect(candidate).toBeTypeOf("function");
  return candidate!(value);
}

function hashBuildInput(value: unknown): string {
  const candidate = (
    traversal as typeof traversal & {
      hashHeightfieldRouteBuildInputV1?: (input: unknown) => string;
    }
  ).hashHeightfieldRouteBuildInputV1;
  expect(candidate).toBeTypeOf("function");
  return candidate!(value);
}

describe("Heightfield route build input contract", () => {
  it("accepts exact provider-neutral bytes and hashes them deterministically", () => {
    const input = validBuildInput();

    expect(assertBuildInput(input)).toEqual(input);
    expect(hashBuildInput(input)).toBe(hashBuildInput(validBuildInput()));
    expect(hashBuildInput(input)).toMatch(/^sha256:[a-f0-9]{64}$/);
    const { capabilityEnvelope: lockedCapabilityEvidence, ...providerNeutralSource } = input;
    expect(lockedCapabilityEvidence.runtimeBackendRef).toBeTypeOf("string");
    expect(JSON.stringify(providerNeutralSource).toLowerCase()).not.toMatch(
      /babylon|havok|recast|navmesh|polyref|wasm|file:\/\//,
    );
  });

  it("uses one strict empty terrain-source variant without soup or bounds", () => {
    const bounded = validBuildInput();
    const empty = {
      ...bounded,
      terrainSource: {
        kind: "empty",
        terrainEntityId: "terrain-main",
        terrainArtifactHash: HASH_A,
      },
    };
    expect(assertBuildInput(empty)).toEqual(empty);

    expect(() => assertBuildInput({
      ...empty,
      terrainSource: {
        ...empty.terrainSource,
        triangleSoup: bounded.terrainSource.triangleSoup,
      },
    })).toThrow("HEIGHTFIELD_ROUTE_BUILD_INPUT_INVALID");
  });

  it("rejects diverging repeated role ids and provider-shaped unknown fields", () => {
    const input = validBuildInput();
    expect(() => assertBuildInput({
      ...input,
      startAnchor: { ...input.startAnchor, entityId: "other-start" },
    })).toThrow("HEIGHTFIELD_ROUTE_BUILD_INPUT_INVALID");
    expect(() => assertBuildInput({
      ...input,
      recastConfig: { walkableRadius: 3 },
    })).toThrow("HEIGHTFIELD_ROUTE_BUILD_INPUT_INVALID");
    expect(() => assertBuildInput({
      ...input,
      hardRibbon: { ...input.hardRibbon, providerRef: "recast" },
    })).toThrow("HEIGHTFIELD_ROUTE_BUILD_INPUT_INVALID");
  });

  it("rejects a hard-ribbon locomotion Ref that diverges from the locked Envelope", () => {
    const input = validBuildInput();

    expect(() => assertBuildInput({
      ...input,
      hardRibbon: {
        ...input.hardRibbon,
        locomotionProfileRef:
          "worldkit://locomotion-profile/ground.other@1",
      },
    })).toThrow("HEIGHTFIELD_ROUTE_BUILD_INPUT_INVALID");
  });

  it("rejects a Collider artifact hash that does not bind the canonical rows", () => {
    const input = validBuildInput();

    expect(() => assertBuildInput({
      ...input,
      colliderArtifactHash: HASH_A,
    })).toThrow("HEIGHTFIELD_ROUTE_BUILD_INPUT_INVALID");
  });

  it("rejects malformed, duplicate, degenerate, and wrong-winding terrain soup", () => {
    const input = validBuildInput();
    const soup = input.terrainSource.triangleSoup;
    for (const triangleSoup of [
      { ...soup, positionsMetersXYZ: [...soup.positionsMetersXYZ, 2] },
      { ...soup, positionsMetersXYZ: [0, 0, 0, 0, 0, 1, Number.NaN, 0, 0] },
      { ...soup, triangleIndices: [0, 1] },
      { ...soup, triangleIndices: [0, 1, 3] },
      { ...soup, triangleIndices: [0, 1, 1] },
      { ...soup, triangleIndices: [0, 1, 2, 0, 1, 2] },
      {
        positionsMetersXYZ: [0, 0, 0, 1, 0, 0, 0, 0, 1],
        triangleIndices: [0, 1, 2],
      },
    ]) {
      expect(() => assertBuildInput({
        ...input,
        terrainSource: { ...input.terrainSource, triangleSoup },
      })).toThrow("HEIGHTFIELD_ROUTE_BUILD_INPUT_INVALID");
    }
  });

  it("requires exact bounded extrema and a deeply frozen Capability Envelope", () => {
    const input = validBuildInput();
    expect(() => assertBuildInput({
      ...input,
      terrainSource: {
        ...input.terrainSource,
        maximumMetersXZ: [2, 1],
      },
    })).toThrow("HEIGHTFIELD_ROUTE_BUILD_INPUT_INVALID");
    expect(() => assertBuildInput({
      ...input,
      capabilityEnvelope: structuredClone(input.capabilityEnvelope),
    })).toThrow("HEIGHTFIELD_ROUTE_BUILD_INPUT_INVALID");
  });

  it("keeps nested Traversal Surface failures inside the Build Input error contract", () => {
    const input = validBuildInput();
    expect(() => assertBuildInput({
      ...input,
      traversalSurface: {
        ...input.traversalSurface,
        resourceHash: "SHA256:not-canonical",
      },
    })).toThrow("HEIGHTFIELD_ROUTE_BUILD_INPUT_INVALID");
  });
});
