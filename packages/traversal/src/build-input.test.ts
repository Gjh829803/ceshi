import { describe, expect, it } from "vitest";

import * as traversal from "./index.js";
import {
  assertRouteBuildInputV2,
  assertRouteBuildInputReceiptV2,
  hashRouteBuildInputV2,
  createRouteBuildInputReceiptV2,
} from "./build-input.js";
import { completeV2BuildInput } from "./route-v2-test-support.js";

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

function traversalLock() {
  return {
    kind: "resolved-traversal-lock",
    schemaVersion: 1,
    subjectEntityId: "player",
    resourceLockHash: HASH_A,
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
  } as const;
}

function capabilityEnvelope() {
  return traversal.createTraversalCapabilityEnvelopeV1({
    traversalLockReceipt: traversalLockReceipt(),
    graphBuilderProfile: traversal.resolveTraversalGraphBuilderProfileV2(
      traversal.BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
    ),
  }).envelope;
}

function traversalLockReceipt() {
  return traversal.resolveTraversalLockV1(traversalLock());
}

function createReceipt(input: ReturnType<typeof validBuildInput>) {
  return createRouteBuildInputReceiptV2({ input, traversalLockReceipt: traversalLockReceipt() });
}

function validBuildInput() {
  return completeV2BuildInput();
}

function rehashed(input: ReturnType<typeof validBuildInput> extends infer T ? T : never, overrides: Record<string, unknown> = {}) {
  const {
    terrainArtifactHash: _terrainArtifactHash,
    colliderArtifactHash: _colliderArtifactHash,
    geometryArtifactHash: _geometryArtifactHash,
    surfaceArtifactHash: _surfaceArtifactHash,
    ...draft
  } = input;
  return completeV2BuildInput({
    ...draft,
    ...overrides,
  } as Parameters<typeof completeV2BuildInput>[0]);
}


function assertBuildInput(value: unknown): unknown {
  return assertRouteBuildInputV2(value);
}

function hashBuildInput(value: unknown): string {
  const candidate = (
    traversal as typeof traversal & {
      hashRouteBuildInputV2?: (input: unknown) => string;
    }
  ).hashRouteBuildInputV2;
  expect(candidate).toBeTypeOf("function");
  return candidate!(value);
}

describe("Heightfield route build input contract", () => {
  it("accepts only sorted provider-neutral blocked traversal-area provenance", () => {
    const input = validBuildInput();
    const exclusion = {
      traversalAreaId: "dry-trench",
      surfaceEntityId: "terrain-main",
      boundary: {
        kind: "polygon-xz",
        pointsMetersXZ: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
      },
    };
    expect(assertBuildInput({
      ...input,
      blockedTraversalAreaExclusions: [exclusion],
    })).toMatchObject({ blockedTraversalAreaExclusions: [exclusion] });
    expect(() => assertBuildInput({
      ...input,
      blockedTraversalAreaExclusions: [
        { ...exclusion, traversalAreaId: "z-area" },
        { ...exclusion, traversalAreaId: "a-area" },
      ],
    })).toThrow("ROUTE_BUILD_INPUT_INVALID");
    expect(() => assertBuildInput({
      ...input,
      blockedTraversalAreaExclusions: [{
        ...exclusion,
        surfaceEntityId: "terrain-other",
      }],
    })).toThrow("ROUTE_BUILD_INPUT_INVALID");
  });

  it("rejects non-simple traversal-area exclusion boundaries and accepts concavity", () => {
    const input = validBuildInput();
    const exclusion = (pointsMetersXZ: readonly (readonly [number, number])[]) => ({
      traversalAreaId: "dry-trench",
      surfaceEntityId: "terrain-main",
      boundary: { kind: "polygon-xz" as const, pointsMetersXZ },
    });
    expect(() => assertBuildInput({
      ...input,
      blockedTraversalAreaExclusions: [exclusion([
        [0, 0], [3, 0], [1, 0], [1, 2], [0, 2],
      ])],
    })).toThrow("ROUTE_BUILD_INPUT_INVALID");
    expect(assertBuildInput({
      ...input,
      blockedTraversalAreaExclusions: [exclusion([
        [0, 0], [3, 0], [3, 3], [1.5, 1], [0, 3],
      ])],
    })).toMatchObject({
      blockedTraversalAreaExclusions: [{ traversalAreaId: "dry-trench" }],
    });
  });

  it("enforces the frozen traversal-area provenance complexity limits", () => {
    const input = validBuildInput();
    const regularPolygon = (pointCount: number) =>
      Array.from({ length: pointCount }, (_, index) => {
        const angle = (index / pointCount) * Math.PI * 2;
        return [Math.cos(angle), Math.sin(angle)] as const;
      });
    const exclusions = (areaCount: number, pointCount: number) =>
      Array.from({ length: areaCount }, (_, index) => ({
        traversalAreaId: `area-${String(index).padStart(3, "0")}`,
        surfaceEntityId: "terrain-main",
        boundary: {
          kind: "polygon-xz" as const,
          pointsMetersXZ: regularPolygon(pointCount),
        },
      }));
    expect(() => assertBuildInput({
      ...input,
      blockedTraversalAreaExclusions: exclusions(65, 4),
    })).toThrow("blockedTraversalAreaExclusions");
    expect(() => assertBuildInput({
      ...input,
      blockedTraversalAreaExclusions: exclusions(1, 129),
    })).toThrow("blockedTraversalAreaExclusions/0/boundary/pointsMetersXZ");
    expect(() => assertBuildInput({
      ...input,
      blockedTraversalAreaExclusions: exclusions(17, 128),
    })).toThrow("blockedTraversalAreaExclusions");
    const accepted = assertBuildInput({
      ...input,
      blockedTraversalAreaExclusions: exclusions(16, 128),
    }) as { readonly blockedTraversalAreaExclusions: readonly unknown[] };
    expect(accepted.blockedTraversalAreaExclusions).toHaveLength(16);
  });

  it("accepts exact provider-neutral bytes and hashes them deterministically", () => {
    const input = validBuildInput();

    expect(input.capabilityEnvelope.maximumTraversalSurfaceCount).toBe(61);
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
    const empty = rehashed(bounded, {
      terrainSource: {
        kind: "empty",
        terrainEntityId: bounded.terrainSource.kind === "bounded"
          ? bounded.terrainSource.terrainEntityId
          : "terrain-main",
      },
    });
    expect(assertBuildInput(empty)).toEqual(empty);

    const boundedSource = bounded.terrainSource;
    if (boundedSource.kind !== "bounded") {
      throw new Error("expected bounded terrain");
    }
    expect(() => assertBuildInput({
      ...empty,
      terrainSource: {
        ...empty.terrainSource,
        triangleSoup: boundedSource.triangleSoup,
      },
    })).toThrow("ROUTE_BUILD_INPUT_INVALID");
  });

  it("rejects diverging repeated role ids and provider-shaped unknown fields", () => {
    const input = validBuildInput();
    expect(() => assertBuildInput({
      ...input,
      startAnchor: { ...input.startAnchor, entityId: "other-start" },
    })).toThrow("ROUTE_BUILD_INPUT_INVALID");
    expect(() => assertBuildInput({
      ...input,
      recastConfig: { walkableRadius: 3 },
    })).toThrow("ROUTE_BUILD_INPUT_INVALID");
    expect(() => assertBuildInput({
      ...input,
      hardRibbon: { ...input.hardRibbon, providerRef: "recast" },
    })).toThrow("ROUTE_BUILD_INPUT_INVALID");
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
    })).toThrow("ROUTE_BUILD_INPUT_INVALID");
  });

  it("rejects a Collider artifact hash that does not bind the canonical rows", () => {
    const input = validBuildInput();

    expect(() => assertBuildInput({
      ...input,
      colliderArtifactHash: HASH_A,
    })).toThrow("ROUTE_BUILD_INPUT_INVALID");
  });

  it("rejects malformed, duplicate, degenerate, and wrong-winding terrain soup", () => {
    const input = validBuildInput();
    const soup = input.terrainSource.kind === "bounded"
      ? input.terrainSource.triangleSoup
      : undefined;
    if (soup === undefined) {
      throw new Error("expected bounded terrain");
    }
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
      })).toThrow("ROUTE_BUILD_INPUT_INVALID");
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
    })).toThrow("ROUTE_BUILD_INPUT_INVALID");
    expect(() => assertBuildInput({
      ...input,
      capabilityEnvelope: structuredClone(input.capabilityEnvelope),
    })).toThrow("ROUTE_BUILD_INPUT_INVALID");
  });

  it("keeps nested Traversal Surface failures inside the Build Input error contract", () => {
    const input = validBuildInput();
    expect(() => assertBuildInput({
      ...input,
      traversalSurfaces: [{
        ...input.traversalSurfaces[0]!,
        resourceHash: "SHA256:not-canonical",
      }],
    })).toThrow("ROUTE_BUILD_INPUT_INVALID");
  });

  it("admits one exact deeply frozen Receipt and recomputes bounded budget evidence", () => {
    const input = deepFreeze(validBuildInput());
    const receipt = createReceipt(input);

    expect(assertRouteBuildInputReceiptV2(receipt)).toEqual(receipt);
    expect(Object.isFrozen(receipt.input.terrainSource)).toBe(true);
    const changedAuthoringInput = deepFreeze({
      ...input,
      authoringSpecHash: HASH_B,
    });
    expect(hashRouteBuildInputV2(changedAuthoringInput)).not.toBe(
      receipt.routeBuildInputHash,
    );
  });

  it("rejects mutable, stale-hash, forged-policy, and stale-budget Receipts", () => {
    const input = deepFreeze(validBuildInput());
    const receipt = createReceipt(input);

    expect(() => assertRouteBuildInputReceiptV2({ ...receipt }))
      .toThrow("ROUTE_BUILD_INPUT_INVALID");
    expect(() => assertRouteBuildInputReceiptV2(deepFreeze({
      ...receipt,
      routeBuildInputHash: HASH_B,
    }))).toThrow("ROUTE_BUILD_INPUT_INVALID");
    const forgedPolicyInput = deepFreeze({
      ...input,
      capabilityEnvelope: {
        ...input.capabilityEnvelope,
        maximumSearchSteps: input.capabilityEnvelope.maximumSearchSteps - 1,
      },
    });
    expect(() => assertRouteBuildInputReceiptV2(deepFreeze({
      ...receipt,
      input: forgedPolicyInput,
      routeBuildInputHash: hashRouteBuildInputV2(forgedPolicyInput),
    }))).toThrow("ROUTE_BUILD_INPUT_INVALID");
    expect(() => assertRouteBuildInputReceiptV2(deepFreeze({
      ...receipt,
      budgetEvidence: { ...receipt.budgetEvidence, estimatedTiles: 2 },
    }))).toThrow("ROUTE_BUILD_INPUT_INVALID");
  });

  it("rejects every Lock-derived Capability Envelope drift", () => {
    const input = deepFreeze(validBuildInput());
    const receipt = createReceipt(input);
    const mutations = [
      { capsuleRadiusMeters: input.capabilityEnvelope.capsuleRadiusMeters + 0.01 },
      { capsuleHeightMeters: input.capabilityEnvelope.capsuleHeightMeters + 0.01 },
      { colliderCenterOffsetMetersXYZ: [0, 1.01, 0] as const },
      { maxSlopeDegrees: input.capabilityEnvelope.maxSlopeDegrees - 1 },
      { maxStepHeightMeters: input.capabilityEnvelope.maxStepHeightMeters + 0.01 },
    ];

    for (const mutation of mutations) {
      const forgedInput = deepFreeze({
        ...input,
        capabilityEnvelope: {
          ...input.capabilityEnvelope,
          ...mutation,
        },
      });
      expect(() => createRouteBuildInputReceiptV2({
        input: forgedInput,
        traversalLockReceipt: traversalLockReceipt(),
      }))
        .toThrow("ROUTE_BUILD_INPUT_INVALID");
      expect(() => assertRouteBuildInputReceiptV2(deepFreeze({
        ...receipt,
        input: forgedInput,
        routeBuildInputHash: hashRouteBuildInputV2(forgedInput),
      }))).toThrow("ROUTE_BUILD_INPUT_INVALID");
    }
  });

  it("requires the exact empty-source budget evidence variant", () => {
    const bounded = validBuildInput();
    const input = deepFreeze(rehashed(bounded, {
      terrainSource: {
        kind: "empty",
        terrainEntityId: bounded.terrainSource.kind === "bounded"
          ? bounded.terrainSource.terrainEntityId
          : "terrain-main",
      },
    }));
    const receipt = createReceipt(input);

    expect(assertRouteBuildInputReceiptV2(receipt)).toEqual(receipt);
    expect(() => assertRouteBuildInputReceiptV2(deepFreeze({
      ...receipt,
      budgetEvidence: {
        kind: "route-geometry-tile-estimate",
        tilesX: 1,
        tilesZ: 1,
        estimatedTiles: 1,
        maximumTiles: 1_024,
        minimumMetersXZ: [0, 0],
        maximumMetersXZ: [1, 1],
      },
    }))).toThrow("ROUTE_BUILD_INPUT_INVALID");
  });

  it("hashes the V2 Route Build Input as sha256", () => {
    expect(hashRouteBuildInputV2(validBuildInput())).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
