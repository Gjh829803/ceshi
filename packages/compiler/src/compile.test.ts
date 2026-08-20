import { describe, expect, it } from "vitest";

import {
  normalizeAuthoringSpec,
  normalizeAuthoringSpecV3,
  sha256CanonicalJson,
  type AuthoringSpecV3,
  type NormalizedWorldIRV3,
} from "@whitebox-world/authoring";
import {
  builtInSubjectResourceRegistry,
  createSubjectResourceRegistry,
} from "@whitebox-world/subject-registry";
import {
  createValidPackageSubjectWorld,
  createValidAuthoringSpec,
  createValidRiggedPackageDefinition,
  createValidRiggedPackageSubjectWorld,
} from "../../authoring/src/test-fixture";

import { compileWorld, compileWorldV4, sampleTerrainHeight } from "./index";

const SUBJECT_ASSET_REF = "worldkit://subject-asset/humanoid.golden@1";
const RIG_PROFILE_REF = "worldkit://rig-profile/biped.golden@1";
const ANIMATION_SET_REF = "worldkit://animation-set/humanoid.ground.golden@1";
const COLLIDER_PROFILE_REF =
  "worldkit://collider-profile/humanoid.medium-capsule@1";
const BIPED_BONE_IDS = [
  "chest",
  "foot.left",
  "foot.right",
  "hand.left",
  "hand.right",
  "head",
  "hips",
  "lower-arm.left",
  "lower-arm.right",
  "lower-leg.left",
  "lower-leg.right",
  "neck",
  "spine",
  "upper-arm.left",
  "upper-arm.right",
  "upper-leg.left",
  "upper-leg.right",
] as const;
const INJECTED_SOURCE_URI = "https://registry.invalid/private/golden-humanoid.glb";
const INJECTED_LICENSE_URI = "https://registry.invalid/private/license";
const INJECTED_AI_TAG = "registry-private-discovery-tag";

function expectExactKeys(value: object, expectedKeys: readonly string[]): void {
  expect(Object.keys(value).sort()).toEqual([...expectedKeys].sort());
}

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
  mutate?: (spec: AuthoringSpecV3) => void,
  usePrivateRegistry = false,
) {
  const spec = createValidRiggedPackageSubjectWorld();
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

function compileNormalizedWorld(world: NormalizedWorldIRV3) {
  return compileWorld({
    normalizedWorldIr: world,
    normalizedWorldIrHash: sha256CanonicalJson(world),
  });
}

function compilePackageWorld() {
  const normalized = normalizeAuthoringSpec(createValidPackageSubjectWorld());
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

function createSolvedLayoutWorldV3(): AuthoringSpecV3 {
  const base = createValidAuthoringSpec();
  return {
    ...base,
    spatial: {
      regions: [{
        id: "spawn-zone",
        kind: "polygon-xz",
        pointsMetersXZ: [[-4, -4], [4, -4], [4, 4], [-4, 4]],
        semanticClassId: "terrain.spawn-zone",
      }],
      routes: [],
      screenRegions: [],
    },
    nodes: base.nodes.map((node) =>
      node.id === "spawn-main" && node.kind === "anchor"
        ? {
            ...node,
            placement: {
              kind: "solved" as const,
              placementConstraintIds: ["spawn-inside", "spawn-supported"],
            },
          }
        : node
    ),
    constraints: {
      placements: [
        {
          id: "spawn-inside",
          kind: "inside-region",
          requirement: "required",
          entityId: "spawn-main",
          regionId: "spawn-zone",
          boundaryClearanceMeters: 0,
        },
        {
          id: "spawn-supported",
          kind: "supported-by",
          requirement: "required",
          supportedEntityId: "spawn-main",
          supportingEntityId: "terrain-main",
          maximumSupportGapMeters: 0,
          minimumSupportRatio: 1,
        },
      ],
    },
  };
}

function normalizeSolvedLayoutWorldV3() {
  const result = normalizeAuthoringSpecV3(createSolvedLayoutWorldV3());
  if (!result.ok || result.value === undefined || result.normalizedWorldIrHash === undefined) {
    throw new Error(`V3 fixture did not normalize: ${JSON.stringify(result.diagnostics)}`);
  }
  return result;
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
      "skeletonRootBoneName",
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
    const serializedRigProfile = JSON.parse(
      JSON.stringify(plan.rigProfiles[0]),
    ) as {
      requiredBoneIds: readonly string[];
      skeletonRootBoneName: string;
      sourceNodeNameByBoneId: Readonly<Record<string, unknown>>;
    };
    expect(serializedRigProfile.skeletonRootBoneName).toBe("root");
    expect(serializedRigProfile.requiredBoneIds).toEqual(BIPED_BONE_IDS);
    expectExactKeys(serializedRigProfile.sourceNodeNameByBoneId, BIPED_BONE_IDS);
    for (const boneId of BIPED_BONE_IDS) {
      expect(
        Object.prototype.hasOwnProperty.call(
          serializedRigProfile.sourceNodeNameByBoneId,
          boneId,
        ),
      ).toBe(true);
      const sourceNodeName = serializedRigProfile.sourceNodeNameByBoneId[boneId];
      expect(sourceNodeName).toEqual(expect.any(String));
      expect((sourceNodeName as string).trim()).not.toBe("");
    }

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

  it("locks the current valid rigged ExecutionPlan hash", () => {
    const rigged = normalizeRiggedWorld();

    expect(
      compileWorld({
        normalizedWorldIr: rigged.value!,
        normalizedWorldIrHash: rigged.normalizedWorldIrHash!,
      }).executionPlanHash,
    ).toBe(
      "sha256:3dd15d8544b3114a7f86c768c388f43fc8685540c16956745d513736e836f9e2",
    );
  });

  it.each([
    {
      label: "missing canonical Bone mapping",
      mutate: (world: NormalizedWorldIRV3) => {
        const sourceNodeNameByBoneId = world.resources.rigProfiles[0]!
          .sourceNodeNameByBoneId as unknown as Record<string, string>;
        delete sourceNodeNameByBoneId.head;
      },
      message:
        "NormalizedWorldIRV3 invariant violated: Rig Profile 'worldkit://rig-profile/biped.golden@1' is missing source-node mapping for Bone 'head'.",
    },
    {
      label: "whitespace-only canonical Bone mapping",
      mutate: (world: NormalizedWorldIRV3) => {
        const sourceNodeNameByBoneId = world.resources.rigProfiles[0]!
          .sourceNodeNameByBoneId as unknown as Record<string, string>;
        sourceNodeNameByBoneId.head = " \t ";
      },
      message:
        "NormalizedWorldIRV3 invariant violated: Rig Profile 'worldkit://rig-profile/biped.golden@1' has an empty source-node mapping for Bone 'head'.",
    },
    {
      label: "own-property undefined canonical Bone mapping",
      mutate: (world: NormalizedWorldIRV3) => {
        const sourceNodeNameByBoneId = world.resources.rigProfiles[0]!
          .sourceNodeNameByBoneId as unknown as Record<string, unknown>;
        sourceNodeNameByBoneId.head = undefined;
      },
      message:
        "NormalizedWorldIRV3 invariant violated: Rig Profile 'worldkit://rig-profile/biped.golden@1' is missing source-node mapping for Bone 'head'.",
    },
    {
      label: "numeric canonical Bone mapping",
      mutate: (world: NormalizedWorldIRV3) => {
        const sourceNodeNameByBoneId = world.resources.rigProfiles[0]!
          .sourceNodeNameByBoneId as unknown as Record<string, unknown>;
        sourceNodeNameByBoneId.head = 123;
      },
      message:
        "NormalizedWorldIRV3 invariant violated: Rig Profile 'worldkit://rig-profile/biped.golden@1' is missing source-node mapping for Bone 'head'.",
    },
    {
      label: "explicit empty canonical Bone mapping",
      mutate: (world: NormalizedWorldIRV3) => {
        const sourceNodeNameByBoneId = world.resources.rigProfiles[0]!
          .sourceNodeNameByBoneId as unknown as Record<string, string>;
        sourceNodeNameByBoneId.head = "";
      },
      message:
        "NormalizedWorldIRV3 invariant violated: Rig Profile 'worldkit://rig-profile/biped.golden@1' has an empty source-node mapping for Bone 'head'.",
    },
  ])("rejects a $label", ({ mutate, message }) => {
    const normalized = normalizeRiggedWorld();
    const world = structuredClone(normalized.value!);
    mutate(world);
    const result = compileNormalizedWorld(world);

    expect(result).toEqual({
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
    expect(result.executionPlan).toBeUndefined();
  });

  it("recursively projects forged Normalized descriptors and Subject data", () => {
    const forbiddenValues = [
      "normalized-inventory-provider-handle",
      "normalized-rig-provider-handle",
      "normalized-animation-source-uri",
      "normalized-collider-provider-handle",
      "normalized-collider-center-source-uri",
      "normalized-binding-provider-handle",
      "normalized-asset-transform-provider-handle",
      "normalized-asset-position-source-uri",
      "normalized-asset-scale-provider-handle",
      "normalized-appearance-source-uri",
      "normalized-bone-transform-provider-handle",
      "normalized-bone-position-source-uri",
      "normalized-local-transform-provider-handle",
      "normalized-local-position-source-uri",
      "normalized-subject-collider-provider-handle",
      "normalized-subject-collider-center-source-uri",
      "normalized-locomotion-provider-handle",
    ] as const;
    const normalized = normalizeRiggedWorld();
    const world = structuredClone(normalized.value!);
    const asset = world.resources.subjectAssets[0]!;
    const rig = world.resources.rigProfiles[0]!;
    const animationSet = world.resources.animationSets[0]!;
    const colliderProfile = world.resources.colliderProfiles[0]!;
    Object.assign(asset.inventory, { providerHandle: forbiddenValues[0] });
    Object.assign(rig.sourceNodeNameByBoneId, { providerHandle: forbiddenValues[1] });
    for (const binding of animationSet.animationBindings) {
      Object.assign(binding, { sourceUri: forbiddenValues[2] });
    }
    Object.assign(colliderProfile.collider, { providerHandle: forbiddenValues[3] });
    Object.assign(colliderProfile.collider.centerOffsetFromSubjectOriginMetersXYZ, {
      sourceUri: forbiddenValues[4],
    });
    const definition = world.resources.subjectDefinitions[0]!;
    Object.assign(definition.visualBinding, { providerHandle: forbiddenValues[5] });
    const assetPart = definition.visualParts.find((part) => part.kind === "asset")!;
    Object.assign(assetPart.localTransform, { providerHandle: forbiddenValues[6] });
    Object.assign(assetPart.localTransform.positionMetersXYZ, {
      sourceUri: forbiddenValues[7],
    });
    Object.assign(assetPart.localTransform.scaleXYZ, {
      providerHandle: forbiddenValues[8],
    });
    Object.assign(assetPart.appearance, { sourceUri: forbiddenValues[9] });
    const boneSocket = definition.sockets.find((socket) => socket.kind === "bone")!;
    Object.assign(boneSocket.offsetTransform, { providerHandle: forbiddenValues[10] });
    Object.assign(boneSocket.offsetTransform.positionMetersXYZ, {
      sourceUri: forbiddenValues[11],
    });
    definition.sockets = [
      ...definition.sockets,
      {
        id: "test.local",
        kind: "local",
        localTransform: {
          positionMetersXYZ: Object.assign([0, 0, 0] as [number, number, number], {
            sourceUri: forbiddenValues[13],
          }),
          rotationEulerRadiansXYZ: [0, 0, 0],
          providerHandle: forbiddenValues[12],
        },
        semanticTags: ["test"],
      } as unknown as (typeof definition.sockets)[number],
    ];
    Object.assign(definition.collider, { providerHandle: forbiddenValues[14] });
    Object.assign(definition.collider.centerOffsetFromSubjectOriginMetersXYZ, {
      sourceUri: forbiddenValues[15],
    });
    Object.assign(definition.locomotion, { providerHandle: forbiddenValues[16] });
    const beforeCompile = structuredClone(world);

    const result = compileNormalizedWorld(world);

    expect(result.ok).toBe(true);
    expect(world).toEqual(beforeCompile);
    const plan = result.executionPlan!;
    const executionAsset = plan.subjectAssets[0]!;
    const executionRig = plan.rigProfiles[0]!;
    const executionAnimationSet = plan.animationSets[0]!;
    const executionColliderProfile = plan.colliderProfiles[0]!;
    expectExactKeys(executionAsset.inventory, [
      "animationClipNames",
      "boneCount",
      "meshCount",
      "skeletonCount",
      "triangleCount",
      "vertexCount",
    ]);
    expectExactKeys(executionRig.sourceNodeNameByBoneId, BIPED_BONE_IDS);
    for (const binding of executionAnimationSet.animationBindings) {
      expectExactKeys(binding, [
        "actionId",
        "blendDurationSeconds",
        "loopMode",
        "playbackSpeedRatio",
        "rootMotionMode",
        "sourceClipName",
      ]);
    }
    expectExactKeys(executionColliderProfile.collider, [
      "centerOffsetFromSubjectOriginMetersXYZ",
      "heightMeters",
      "kind",
      "radiusMeters",
    ]);
    expectExactKeys(
      executionColliderProfile.collider.centerOffsetFromSubjectOriginMetersXYZ,
      ["0", "1", "2"],
    );
    const subject = plan.subjects.find((candidate) => candidate.entityId === "player")!;
    expectExactKeys(subject.visualBinding, [
      "animationSetRef",
      "mode",
      "rigProfileRef",
    ]);
    const executionAssetPart = subject.visualParts.find((part) => part.kind === "asset")!;
    expectExactKeys(executionAssetPart.localTransform, [
      "positionMetersXYZ",
      "rotationEulerRadiansXYZ",
      "scaleXYZ",
    ]);
    expectExactKeys(executionAssetPart.localTransform.positionMetersXYZ, ["0", "1", "2"]);
    expectExactKeys(executionAssetPart.localTransform.rotationEulerRadiansXYZ, ["0", "1", "2"]);
    expectExactKeys(executionAssetPart.localTransform.scaleXYZ, ["0", "1", "2"]);
    expectExactKeys(executionAssetPart.appearance, ["mode"]);
    const executionBoneSocket = subject.sockets.find((socket) => socket.kind === "bone")!;
    expectExactKeys(executionBoneSocket.offsetTransform, [
      "positionMetersXYZ",
      "rotationEulerRadiansXYZ",
    ]);
    expectExactKeys(executionBoneSocket.offsetTransform.positionMetersXYZ, ["0", "1", "2"]);
    expectExactKeys(executionBoneSocket.offsetTransform.rotationEulerRadiansXYZ, ["0", "1", "2"]);
    const executionLocalSocket = subject.sockets.find((socket) => socket.kind === "local")!;
    expectExactKeys(executionLocalSocket.localTransform, [
      "positionMetersXYZ",
      "rotationEulerRadiansXYZ",
    ]);
    expectExactKeys(executionLocalSocket.localTransform.positionMetersXYZ, ["0", "1", "2"]);
    expectExactKeys(executionLocalSocket.localTransform.rotationEulerRadiansXYZ, ["0", "1", "2"]);
    expectExactKeys(subject.collider, [
      "centerOffsetFromSubjectOriginMetersXYZ",
      "heightMeters",
      "kind",
      "massKilograms",
      "maxSlopeDegrees",
      "maxStepHeightMeters",
      "radiusMeters",
    ]);
    expectExactKeys(subject.collider.centerOffsetFromSubjectOriginMetersXYZ, ["0", "1", "2"]);
    expectExactKeys(subject.locomotion, [
      "jumpSpeedMetersPerSecond",
      "mode",
      "runSpeedMetersPerSecond",
      "walkSpeedMetersPerSecond",
      "waterSpeedMetersPerSecond",
    ]);
    const serializedPlan = JSON.stringify(plan);
    for (const forbiddenValue of forbiddenValues) {
      expect(serializedPlan).not.toContain(forbiddenValue);
    }
  });

  it("deduplicates reachable resources while charging each rigged Subject instance once", () => {
    const single = normalizeRiggedWorld();
    const shared = normalizeRiggedWorld((spec) => {
      spec.nodes = [
        ...spec.nodes,
        {
          id: "spawn-rigged-copy",
          kind: "anchor",
          placement: { kind: "fixed", transform: { positionMetersXYZ: [6, 0, 30] } },
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
    const spec = createValidPackageSubjectWorld();
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
      mutate: (world: NormalizedWorldIRV3) => {
        world.resources.subjectAssets = [];
      },
      message:
        "NormalizedWorldIRV3 invariant violated: missing Subject Asset 'worldkit://subject-asset/humanoid.golden@1'.",
    },
    {
      label: "duplicate Subject Asset row",
      mutate: (world: NormalizedWorldIRV3) => {
        world.resources.subjectAssets = [
          ...world.resources.subjectAssets,
          structuredClone(world.resources.subjectAssets[0]!),
        ];
      },
      message:
        "NormalizedWorldIRV3 invariant violated: duplicate Subject Asset 'worldkit://subject-asset/humanoid.golden@1'.",
    },
    {
      label: "mismatched Animation Set Asset row",
      mutate: (world: NormalizedWorldIRV3) => {
        world.resources.animationSets = world.resources.animationSets.map((row) => ({
          ...row,
          subjectAssetRef: "worldkit://subject-asset/other@1",
        }));
      },
      message:
        "NormalizedWorldIRV3 invariant violated: Animation Set 'worldkit://animation-set/humanoid.ground.golden@1' targets Subject Asset 'worldkit://subject-asset/other@1', but Subject 'player' selects 'worldkit://subject-asset/humanoid.golden@1'.",
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
    expect(result.executionPlan?.schemaVersion).toBe(4);
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

  it("copies fixed Anchor position without adding Terrain or Collider height", () => {
    const result = compilePackageWorld();
    const executionPlan = result.executionPlan!;
    const subject = executionPlan.subjects.find(
      (candidate) => candidate.entityId === "pack-animal-a",
    )!;

    expect(sampleTerrainHeight(executionPlan.terrain, [-4, 5])).not.toBe(0);
    expect(subject.spawnSubjectOriginPositionMetersXYZ).toEqual([-4, 0, 5]);
    expect(subject.collider).toMatchObject({
      radiusMeters: 0.7,
      heightMeters: 1.4,
      centerOffsetFromSubjectOriginMetersXYZ: [0, 0.7, 0],
    });
  });

  it("samples the exact rendered Terrain triangles rather than a bilinear surface", () => {
    const terrain = {
      ...compilePackageWorld().executionPlan!.terrain,
      centerMetersXZ: [0, 0] as const,
      sizeMetersXZ: [2, 2] as const,
      resolutionCellsXZ: [2, 2] as const,
      heightSamplesMeters: [0, 2, 4, 0],
    };

    expect(sampleTerrainHeight(terrain, [0, 0])).toBe(3);
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
    const spec = createValidPackageSubjectWorld();
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
    const normalized = normalizeAuthoringSpec(createValidPackageSubjectWorld());
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

  it("compiles V3 solved layout IR into an exact V4 execution layout projection", () => {
    const normalized = normalizeSolvedLayoutWorldV3();
    const result = compileWorldV4({
      normalizedWorldIr: normalized.value!,
      normalizedWorldIrHash: normalized.normalizedWorldIrHash!,
    });

    expect(result.ok).toBe(true);
    expect(result.executionPlan).toMatchObject({
      kind: "worldkit-execution-plan",
      schemaVersion: 4,
      normalizedWorldIrHash: normalized.normalizedWorldIrHash,
      camera: { aspectRatio: 16 / 9 },
      layout: {
        layoutSolveReportHash: normalized.layoutSolveReportHash,
        placementsByEntityId: {
          "spawn-main": expect.objectContaining({
            entityId: "spawn-main",
            placementProvenance: expect.objectContaining({ kind: "solved" }),
          }),
          "wall-east": expect.objectContaining({
            entityId: "wall-east",
            placementProvenance: expect.objectContaining({ kind: "fixed" }),
          }),
        },
        layoutAssertions: expect.arrayContaining([
          expect.objectContaining({ constraintId: "spawn-inside", kind: "inside-region" }),
          expect.objectContaining({ constraintId: "spawn-supported", kind: "supported-by" }),
        ]),
      },
    });
    expect(result.executionPlan?.terrain.heightSamplesHash).toBe(
      sha256CanonicalJson(normalized.value!.layout.heightfields[0]!.heightSamplesMeters),
    );
    const serialized = JSON.stringify(result.executionPlan);
    expect(serialized).not.toContain('"constraints"');
    expect(serialized).not.toMatch(/candidateRegionIds|sourceUri|licenseUri|providerHandle/);
    expect(result.executionPlanHash).toBe(
      "sha256:c0400052aea7146cb0b7530e02c7d6ad3c28508b008123162e1e67d757b85f87",
    );
  });

  it("copies the solved spawn position and Y rotation without terrain resampling", () => {
    const normalized = normalizeSolvedLayoutWorldV3();
    const world = structuredClone(normalized.value!) as unknown as {
      nodes: Array<NormalizedWorldIRV3["nodes"][number]>;
    } & NormalizedWorldIRV3;
    const spawnAnchor = world.nodes.find(
      (node) => node.kind === "anchor" && node.id === "spawn-main",
    );
    if (spawnAnchor === undefined || spawnAnchor.kind !== "anchor") {
      throw new Error("Solved spawn Anchor fixture is missing.");
    }
    Object.assign(spawnAnchor, {
      transform: {
        ...spawnAnchor.transform,
        positionMetersXYZ: [0, 7.25, 0],
        rotationEulerRadiansXYZ: [0, Math.PI / 2, 0],
      },
    });

    const result = compileNormalizedWorld(world);
    const terrain = result.executionPlan!.terrain;
    const subject = result.executionPlan?.subjects.find(
      (candidate) => candidate.entityId === "player",
    );

    expect(new Set(terrain.heightSamplesMeters).size).toBeGreaterThan(1);
    expect(sampleTerrainHeight(terrain, [0, 0])).not.toBe(0);
    expect(subject?.spawnSubjectOriginPositionMetersXYZ).toEqual([0, 7.25, 0]);
    expect(subject?.spawnSubjectFacingRadians).toBe(Math.PI / 2);
  });

  it("projects forged nested IR objects explicitly and rejects a V3 IR hash mismatch", () => {
    const normalized = normalizeSolvedLayoutWorldV3();
    const forged = structuredClone(normalized.value!) as unknown as {
      layout: {
        regions: Array<Record<string, unknown>>;
        assertions: Array<Record<string, unknown>>;
      };
    };
    forged.layout.regions[0]!.providerHandle = "private-region-handle";
    forged.layout.assertions[0]!.providerHandle = "private-assertion-handle";
    const projected = compileWorldV4({
      normalizedWorldIr: forged as unknown as NonNullable<typeof normalized.value>,
      normalizedWorldIrHash: sha256CanonicalJson(forged),
    });
    expect(projected.ok).toBe(true);
    expect(JSON.stringify(projected.executionPlan)).not.toContain("private-");

    expect(compileWorldV4({
      normalizedWorldIr: normalized.value!,
      normalizedWorldIrHash: `sha256:${"0".repeat(64)}`,
    })).toMatchObject({
      ok: false,
      diagnostics: [{
        code: "COMPILER_NORMALIZED_HASH_MISMATCH",
        instancePath: "/normalizedWorldIrHash",
      }],
    });
  });
});
