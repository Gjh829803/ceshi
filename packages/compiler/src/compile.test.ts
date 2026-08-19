import { describe, expect, it } from "vitest";

import {
  normalizeAuthoringSpec,
  sha256CanonicalJson,
  type AuthoringSpecV2,
  type NormalizedWorldIRV2,
} from "@whitebox-world/authoring";
import {
  builtInSubjectResourceRegistry,
  createSubjectResourceRegistry,
} from "@whitebox-world/subject-registry";
import {
  createValidPackageSubjectWorldV2,
  createValidRiggedPackageDefinition,
  createValidRiggedPackageSubjectWorldV2,
} from "../../authoring/src/test-fixture";

import { compileWorld, sampleTerrainHeight } from "./index";

const SUBJECT_ASSET_REF = "worldkit://subject-asset/humanoid.golden@1";
const RIG_PROFILE_REF = "worldkit://rig-profile/biped.golden@1";
const ANIMATION_SET_REF = "worldkit://animation-set/humanoid.ground.golden@1";
const COLLIDER_PROFILE_REF =
  "worldkit://collider-profile/humanoid.medium-capsule@1";
const INJECTED_SOURCE_URI = "https://registry.invalid/private/golden-humanoid.glb";
const INJECTED_LICENSE_URI = "https://registry.invalid/private/license";
const INJECTED_AI_TAG = "registry-private-discovery-tag";

function registryWithPrivateAssetMetadata() {
  return createSubjectResourceRegistry(
    builtInSubjectResourceRegistry.listResources().map((resource) =>
      resource.kind === "subject-asset"
        ? {
            ...resource,
            provenance: {
              ...resource.provenance,
              sourceUri: INJECTED_SOURCE_URI,
              licenseUri: INJECTED_LICENSE_URI,
            },
            aiMetadata: {
              ...resource.aiMetadata,
              semanticTags: [...resource.aiMetadata.semanticTags, INJECTED_AI_TAG],
            },
          }
        : structuredClone(resource),
    ),
  );
}

function normalizeRiggedWorld(
  mutate?: (spec: AuthoringSpecV2) => void,
  usePrivateRegistry = false,
) {
  const spec = createValidRiggedPackageSubjectWorldV2();
  mutate?.(spec);
  const normalized = normalizeAuthoringSpec(
    spec,
    usePrivateRegistry
      ? { subjectResourceRegistry: registryWithPrivateAssetMetadata() }
      : undefined,
  );
  if (
    !normalized.ok ||
    normalized.value === undefined ||
    normalized.normalizedWorldIrHash === undefined
  ) {
    throw new Error(`Rigged fixture did not normalize: ${JSON.stringify(normalized.diagnostics)}`);
  }
  return normalized;
}

function compileNormalizedWorld(world: NormalizedWorldIRV2) {
  return compileWorld({
    normalizedWorldIr: world,
    normalizedWorldIrHash: sha256CanonicalJson(world),
  });
}

function compilePackageWorld() {
  const normalized = normalizeAuthoringSpec(createValidPackageSubjectWorldV2());
  if (
    !normalized.ok ||
    normalized.value === undefined ||
    normalized.normalizedWorldIrHash === undefined
  ) {
    throw new Error("Package Subject fixture did not normalize.");
  }
  return compileWorld({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
  });
}

describe("compileWorld", () => {
  it("compiles one rigged Subject into ref-only parts and minimal resource tables", () => {
    const normalized = normalizeRiggedWorld(undefined, true);
    const result = compileWorld({
      normalizedWorldIr: normalized.value!,
      normalizedWorldIrHash: normalized.normalizedWorldIrHash!,
    });

    expect(result.ok).toBe(true);
    const plan = result.executionPlan!;
    const subject = plan.subjects.find((candidate) => candidate.entityId === "player")!;
    expect(subject.visualParts).toEqual([
      {
        id: "body.asset",
        kind: "asset",
        subjectAssetRef: SUBJECT_ASSET_REF,
        localTransform: {
          positionMetersXYZ: [0, 0, 0],
          rotationEulerRadiansXYZ: [0, 0, 0],
          scaleXYZ: [1, 1, 1],
        },
        appearance: { mode: "whitebox-neutral" },
        semanticTags: ["body", "golden", "rigged"],
      },
    ]);
    expect(subject.visualBinding).toEqual({
      mode: "rigged",
      rigProfileRef: RIG_PROFILE_REF,
      animationSetRef: ANIMATION_SET_REF,
    });
    expect(subject.sockets).toEqual([
      {
        id: "hand.right",
        kind: "bone",
        boneId: "hand.right",
        offsetTransform: {
          positionMetersXYZ: [0, 0, 0],
          rotationEulerRadiansXYZ: [0, 0, 0],
        },
        semanticTags: ["equipment-grip", "hand"],
      },
    ]);
    expect(plan.subjectAssets).toHaveLength(1);
    expect(plan.rigProfiles).toHaveLength(1);
    expect(plan.animationSets).toHaveLength(1);
    expect(plan.colliderProfiles).toHaveLength(1);
    expect(Object.keys(plan.subjectAssets[0]!).sort()).toEqual([
      "artifactContentHash",
      "byteLength",
      "format",
      "inventory",
      "mediaType",
      "subjectAssetRef",
    ]);
    expect(Object.keys(plan.rigProfiles[0]!).sort()).toEqual([
      "bodyTopology",
      "requiredBoneIds",
      "rigProfileRef",
      "skeletonRootNodeName",
      "sourceNodeNameByBoneId",
    ]);
    expect(Object.keys(plan.animationSets[0]!).sort()).toEqual([
      "animationBindings",
      "animationSetRef",
      "defaultActionId",
      "requiredActionIds",
      "rigProfileRef",
      "subjectAssetRef",
    ]);
    expect(Object.keys(plan.colliderProfiles[0]!).sort()).toEqual([
      "collider",
      "colliderProfileRef",
      "supportedBodyTopologies",
    ]);
    expect(plan.subjectAssets[0]).toMatchObject({
      subjectAssetRef: SUBJECT_ASSET_REF,
      artifactContentHash:
        "sha256:1095fd65c754d53e6db3757ab5e1c9e5e9dcea2581f85d40f37ea4890ee8c2c2",
      byteLength: 43_656,
      mediaType: "model/gltf-binary",
      format: "glb",
      inventory: { vertexCount: 360, triangleCount: 180 },
    });

    const serializedNormalized = JSON.stringify(normalized.value);
    const serializedPlan = JSON.stringify(plan);
    for (const forbiddenValue of [
      INJECTED_SOURCE_URI,
      INJECTED_LICENSE_URI,
      INJECTED_AI_TAG,
    ]) {
      expect(serializedNormalized).not.toContain(forbiddenValue);
      expect(serializedPlan).not.toContain(forbiddenValue);
    }
    expect(serializedPlan).not.toContain("golden-humanoid.glb");
    expect(serializedPlan).not.toMatch(
      /Babylon|Havok|AssetContainer|Uint8Array|ArrayBuffer/,
    );
    expect(serializedPlan).not.toContain('"contentHash"');
  });

  it("deduplicates reachable resources while charging each rigged Subject instance once", () => {
    const single = normalizeRiggedWorld();
    const shared = normalizeRiggedWorld((spec) => {
      spec.nodes = [
        ...spec.nodes,
        {
          id: "spawn-rigged-copy",
          kind: "anchor",
          transform: { positionMetersXYZ: [6, 0, 30] },
          semantic: { classId: "spawn" },
        },
        {
          id: "rigged-copy",
          kind: "subject",
          subjectDefinitionRef:
            "package://subject-definition/rigged-golden-package@1",
          spawnAnchorEntityId: "spawn-rigged-copy",
        },
      ];
    });
    const singlePlan = compileWorld({
      normalizedWorldIr: single.value!,
      normalizedWorldIrHash: single.normalizedWorldIrHash!,
    }).executionPlan!;
    const result = compileWorld({
      normalizedWorldIr: shared.value!,
      normalizedWorldIrHash: shared.normalizedWorldIrHash!,
    });

    expect(result.ok).toBe(true);
    const plan = result.executionPlan!;
    expect(plan.subjects.map((subject) => subject.entityId)).toEqual([
      "player",
      "rigged-copy",
    ]);
    expect(plan.subjectAssets).toHaveLength(1);
    expect(plan.rigProfiles).toHaveLength(1);
    expect(plan.animationSets).toHaveLength(1);
    expect(plan.colliderProfiles).toHaveLength(1);
    expect(plan.resourceUsage).toEqual({
      vertices: singlePlan.resourceUsage.vertices + 360,
      triangles: singlePlan.resourceUsage.triangles + 180,
      colliders: singlePlan.resourceUsage.colliders + 1,
    });
  });

  it("excludes normalized resources reachable only from unused Definitions", () => {
    const spec = createValidPackageSubjectWorldV2();
    spec.resources = {
      ...spec.resources,
      subjectDefinitions: [
        ...spec.resources.subjectDefinitions,
        createValidRiggedPackageDefinition(),
      ],
    };
    const normalized = normalizeAuthoringSpec(spec);
    expect(normalized.ok).toBe(true);
    expect(normalized.value?.resources.subjectAssets).toHaveLength(1);

    const result = compileWorld({
      normalizedWorldIr: normalized.value!,
      normalizedWorldIrHash: normalized.normalizedWorldIrHash!,
    });

    expect(result.ok).toBe(true);
    expect(result.executionPlan).toMatchObject({
      subjectAssets: [],
      rigProfiles: [],
      animationSets: [],
      colliderProfiles: [],
    });
  });

  it.each([
    {
      label: "missing reachable Subject Asset row",
      mutate: (world: NormalizedWorldIRV2) => {
        world.resources.subjectAssets = [];
      },
      message:
        "NormalizedWorldIRV2 invariant violated: missing Subject Asset 'worldkit://subject-asset/humanoid.golden@1'.",
    },
    {
      label: "duplicate Subject Asset row",
      mutate: (world: NormalizedWorldIRV2) => {
        world.resources.subjectAssets = [
          ...world.resources.subjectAssets,
          structuredClone(world.resources.subjectAssets[0]!),
        ];
      },
      message:
        "NormalizedWorldIRV2 invariant violated: duplicate Subject Asset 'worldkit://subject-asset/humanoid.golden@1'.",
    },
    {
      label: "mismatched Animation Set Asset row",
      mutate: (world: NormalizedWorldIRV2) => {
        world.resources.animationSets = world.resources.animationSets.map((row) => ({
          ...row,
          subjectAssetRef: "worldkit://subject-asset/other@1",
        }));
      },
      message:
        "NormalizedWorldIRV2 invariant violated: Animation Set 'worldkit://animation-set/humanoid.ground.golden@1' targets Subject Asset 'worldkit://subject-asset/other@1', but Subject 'player' selects 'worldkit://subject-asset/humanoid.golden@1'.",
    },
  ])("rejects a $label with a stable diagnostic", ({ mutate, message }) => {
    const normalized = normalizeRiggedWorld();
    const world = structuredClone(normalized.value!);
    mutate(world);

    expect(compileNormalizedWorld(world)).toEqual({
      ok: false,
      diagnostics: [
        {
          severity: "error",
          code: "COMPILER_NORMALIZED_IR_INVALID",
          instancePath: "/normalizedWorldIr",
          message,
        },
      ],
    });
  });

  it("compiles two instances from one resolved Package Definition", () => {
    const result = compilePackageWorld();

    expect(result.ok).toBe(true);
    expect(result.executionPlan?.schemaVersion).toBe(3);
    expect(
      result.executionPlan?.subjects.map((subject) => ({
        entityId: subject.entityId,
        ref: subject.subjectDefinitionRef,
        hash: subject.subjectDefinitionHash,
      })),
    ).toEqual([
      {
        entityId: "pack-animal-a",
        ref: "package://subject-definition/coastal-pack-animal@1",
        hash: expect.stringMatching(/^sha256:/),
      },
      {
        entityId: "pack-animal-b",
        ref: "package://subject-definition/coastal-pack-animal@1",
        hash: expect.stringMatching(/^sha256:/),
      },
      expect.objectContaining({ entityId: "player" }),
    ]);
    expect(result.executionPlan?.subjects[0]?.subjectDefinitionHash).toBe(
      result.executionPlan?.subjects[1]?.subjectDefinitionHash,
    );
  });

  it("places Subject Origin on sampled Terrain without adding Collider height", () => {
    const result = compilePackageWorld();
    const executionPlan = result.executionPlan!;
    const subject = executionPlan.subjects.find(
      (candidate) => candidate.entityId === "pack-animal-a",
    )!;

    expect(subject.spawnSubjectOriginPositionMetersXYZ[1]).toBeCloseTo(
      sampleTerrainHeight(executionPlan.terrain, [-4, 5]),
    );
    expect(subject.collider).toMatchObject({
      radiusMeters: 0.7,
      heightMeters: 1.4,
      centerOffsetFromSubjectOriginMetersXYZ: [0, 0.7, 0],
    });
    expect(subject.spawnSubjectOriginPositionMetersXYZ[1]).not.toBeCloseTo(
      sampleTerrainHeight(executionPlan.terrain, [-4, 5]) +
        subject.collider.heightMeters / 2,
    );
  });

  it("propagates stable Sockets and normalized visual composition", () => {
    const subject = compilePackageWorld().executionPlan!.subjects.find(
      (candidate) => candidate.entityId === "pack-animal-a",
    )!;

    expect(subject.sockets.map((socket) => socket.id)).toEqual([
      "seat.mount",
      "tow.rear",
    ]);
    expect(subject.visualParts.map((part) => part.id)).toEqual([
      "body",
      "leg.back-left",
      "leg.back-right",
      "leg.front-left",
      "leg.front-right",
    ]);
    expect(subject.visualParts[0]).toHaveProperty(
      "localTransform.positionMetersXYZ",
    );
  });

  it("aggregates resource cost once per Subject instance", () => {
    expect(compilePackageWorld().executionPlan?.resourceUsage).toEqual({
      vertices: 4_956,
      triangles: 9_380,
      colliders: 5,
    });
  });

  it("is deterministic for the same normalized input and seed", () => {
    const first = compilePackageWorld();
    const second = compilePackageWorld();

    expect(first.executionPlan).toEqual(second.executionPlan);
    expect(first.executionPlanHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.executionPlanHash).toBe(second.executionPlanHash);
  });

  it("fails before runtime construction when the plan exceeds a resource budget", () => {
    const spec = createValidPackageSubjectWorldV2();
    spec.world = {
      ...spec.world,
      resourceBudget: { ...spec.world.resourceBudget, maxVertices: 100 },
    };
    const normalized = normalizeAuthoringSpec(spec);
    if (
      !normalized.ok ||
      normalized.value === undefined ||
      normalized.normalizedWorldIrHash === undefined
    ) {
      throw new Error("Fixture did not normalize.");
    }

    const result = compileWorld({
      normalizedWorldIr: normalized.value,
      normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    });

    expect(result.ok).toBe(false);
    expect(result.executionPlan).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "COMPILER_RESOURCE_BUDGET_EXCEEDED",
        instancePath: "/world/resourceBudget/maxVertices",
      }),
    );
  });

  it("rejects a normalized hash that does not match the supplied V2 IR", () => {
    const normalized = normalizeAuthoringSpec(createValidPackageSubjectWorldV2());
    if (!normalized.ok || normalized.value === undefined) {
      throw new Error("Fixture did not normalize.");
    }

    const result = compileWorld({
      normalizedWorldIr: normalized.value,
      normalizedWorldIrHash: `sha256:${"0".repeat(64)}`,
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "COMPILER_NORMALIZED_HASH_MISMATCH",
          instancePath: "/normalizedWorldIrHash",
        },
      ],
    });
  });
});
