import { describe, expect, it } from "vitest";

import {
  builtInSubjectResourceRegistry,
  createSubjectResourceRegistry,
  type SubjectRegistryResourceInputV1,
  type SubjectResourceRegistryV2,
} from "@whitebox-world/subject-registry";

import {
  normalizeAuthoringSpec,
  normalizeSubjectDefinitionV2,
  ResourceLockBuilderV1,
  sha256CanonicalJson,
  type NormalizeAuthoringResultV3,
} from "./index";
import {
  createValidPackageSubjectWorld,
  createValidRiggedPackageDefinition,
  createValidRiggedPackageSubjectWorld,
} from "./test-fixture";

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
  "root",
  "spine",
  "upper-arm.left",
  "upper-arm.right",
  "upper-leg.left",
  "upper-leg.right",
] as const;

function expectExactKeys(value: object, expectedKeys: readonly string[]): void {
  expect(Object.keys(value).sort()).toEqual([...expectedKeys].sort());
}

function registryFrom(
  transform: (
    resource: SubjectRegistryResourceInputV1,
  ) => SubjectRegistryResourceInputV1 | undefined,
): SubjectResourceRegistryV2 {
  return createSubjectResourceRegistry(
    builtInSubjectResourceRegistry
      .listResources()
      .flatMap((resource) => {
        const transformed = transform(structuredClone(resource));
        return transformed === undefined ? [] : [transformed];
      }),
  );
}

function registryWithPermutedNewResourceCollections(
  isReversed: boolean,
): SubjectResourceRegistryV2 {
  const maybeReverse = <T>(values: readonly T[]): readonly T[] =>
    isReversed ? [...values].reverse() : [...values];

  return createSubjectResourceRegistry(
    builtInSubjectResourceRegistry.listResources().map((resource) => {
      const input = structuredClone(resource);
      switch (input.kind) {
        case "subject-asset":
          return {
            ...input,
            inventory: {
              ...input.inventory,
              animationClipNames: maybeReverse(input.inventory.animationClipNames),
            },
            aiMetadata: {
              ...input.aiMetadata,
              semanticTags: maybeReverse(input.aiMetadata.semanticTags),
            },
          };
        case "rig-profile": {
          const compatibleSubjectAssetRefs = [
            SUBJECT_ASSET_REF,
            "worldkit://subject-asset/humanoid.other@1",
          ];
          const boneEntries = Object.entries(input.sourceNodeNameByBoneId);
          return {
            ...input,
            compatibleSubjectAssetRefs: maybeReverse(compatibleSubjectAssetRefs),
            requiredBoneIds: maybeReverse(input.requiredBoneIds),
            sourceNodeNameByBoneId: Object.fromEntries(
              maybeReverse(boneEntries),
            ) as typeof input.sourceNodeNameByBoneId,
            aiMetadata: {
              ...input.aiMetadata,
              semanticTags: maybeReverse(input.aiMetadata.semanticTags),
            },
          };
        }
        case "animation-set":
          return {
            ...input,
            requiredActionIds: maybeReverse(input.requiredActionIds),
            animationBindings: maybeReverse(input.animationBindings),
            aiMetadata: {
              ...input.aiMetadata,
              semanticTags: maybeReverse(input.aiMetadata.semanticTags),
            },
          };
        case "collider-profile": {
          const supportedBodyTopologies = ["biped", "custom"] as const;
          return {
            ...input,
            supportedBodyTopologies: maybeReverse(supportedBodyTopologies),
            aiMetadata: {
              ...input.aiMetadata,
              semanticTags: maybeReverse(input.aiMetadata.semanticTags),
            },
          };
        }
        default:
          return input;
      }
    }),
  );
}

function diagnosticForRiggedWorld(
  subjectResourceRegistry: SubjectResourceRegistryV2,
  mutateWorld?: (world: ReturnType<typeof createValidRiggedPackageSubjectWorld>) => void,
) {
  const world = createValidRiggedPackageSubjectWorld();
  mutateWorld?.(world);
  const result = normalizeAuthoringSpec(world, { subjectResourceRegistry });
  expect(result.ok).toBe(false);
  return result.diagnostics;
}

function packageDefinitionHash(result: NormalizeAuthoringResultV3): string {
  return result.value!.resources.subjectDefinitions.find(
    (definition) => definition.source === "package",
  )!.subjectDefinitionHash;
}

describe("Package Subject Definition normalization", () => {
  it("normalizes and locks the complete Golden rigged graph without asset bytes", () => {
    const result = normalizeAuthoringSpec(createValidRiggedPackageSubjectWorld());

    expect(result.ok).toBe(true);
    expect(result.value?.resources).toMatchObject({
      subjectAssets: [
        {
          subjectAssetRef: SUBJECT_ASSET_REF,
          artifactContentHash:
            "sha256:1095fd65c754d53e6db3757ab5e1c9e5e9dcea2581f85d40f37ea4890ee8c2c2",
          byteLength: 43_656,
          mediaType: "model/gltf-binary",
          format: "glb",
        },
      ],
      rigProfiles: [{ rigProfileRef: RIG_PROFILE_REF }],
      animationSets: [{ animationSetRef: ANIMATION_SET_REF }],
      colliderProfiles: [{ colliderProfileRef: COLLIDER_PROFILE_REF }],
    });
    expect(result.value?.resources.subjectDefinitions[0]).toMatchObject({
      visualParts: [
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
        },
      ],
      visualBinding: {
        mode: "rigged",
        rigProfileRef: RIG_PROFILE_REF,
        animationSetRef: ANIMATION_SET_REF,
      },
      sockets: [
        expect.objectContaining({
          id: "hand.right",
          kind: "bone",
          boneId: "hand.right",
        }),
      ],
      colliderPolicy: {
        kind: "profile",
        colliderProfileRef: COLLIDER_PROFILE_REF,
      },
      collider: {
        kind: "capsule",
        radiusMeters: 0.32,
        heightMeters: 1.92,
        centerOffsetFromSubjectOriginMetersXYZ: [0, 0.96, 0],
      },
      resourceCost: { vertices: 360, triangles: 180, colliders: 1 },
    });
    const lockRefs = result.value!.resources.resourceLock.map(
      (entry) => entry.resourceRef,
    );
    expect(lockRefs).toEqual([
      "package://subject-definition/rigged-golden-package@1",
      ANIMATION_SET_REF,
      "worldkit://capability/locomotion.ground@1",
      COLLIDER_PROFILE_REF,
      "worldkit://locomotion-profile/ground.standard@1",
      "worldkit://physics-body-profile/character.medium@1",
      RIG_PROFILE_REF,
      SUBJECT_ASSET_REF,
    ]);
    expect(new Set(lockRefs).size).toBe(lockRefs.length);
    expect(JSON.stringify(result.value)).not.toMatch(
      /golden-humanoid\.glb|Uint8Array|ArrayBuffer/,
    );
  });

  it("locks the current rigged Subject Definition, Resource Lock, and Normalized IR hashes", () => {
    const result = normalizeAuthoringSpec(createValidRiggedPackageSubjectWorld());

    expect(result.ok).toBe(true);
    expect(packageDefinitionHash(result)).toBe(
      "sha256:2949c4c8f7ebbb321a3a40ea10890f4dd608178c26424c530e771c1b529d0a1b",
    );
    expect(result.value?.resources.resourceLockHash).toBe(
      "sha256:73caff41be6267df95087c08f870a3943ab6f38107a1feff4fa4ac43ff2d4aec",
    );
    expect(result.normalizedWorldIrHash).toBe(
      "sha256:272dd718b5f76d6902bd057c34efdc2e60675e2f7daa88ad92446232ee8eeb74",
    );
  });

  it("deduplicates transitive tables and locks across definitions", () => {
    const world = createValidRiggedPackageSubjectWorld();
    world.resources = {
      ...world.resources,
      subjectDefinitions: [
        ...world.resources.subjectDefinitions,
        { ...createValidRiggedPackageDefinition(), id: "rigged-golden-package-copy" },
      ],
    };

    const result = normalizeAuthoringSpec(world);

    expect(result.ok).toBe(true);
    expect(result.value?.resources.subjectAssets).toHaveLength(1);
    expect(result.value?.resources.rigProfiles).toHaveLength(1);
    expect(result.value?.resources.animationSets).toHaveLength(1);
    expect(result.value?.resources.colliderProfiles).toHaveLength(1);
    const transitiveRefs = result.value!.resources.resourceLock
      .map((entry) => entry.resourceRef)
      .filter((resourceRef) => resourceRef.startsWith("worldkit://"));
    expect(new Set(transitiveRefs).size).toBe(transitiveRefs.length);
  });

  it("keeps rigged hashes stable when Registry manifest collections are reordered", () => {
    const forward = normalizeAuthoringSpec(createValidRiggedPackageSubjectWorld(), {
      subjectResourceRegistry: registryWithPermutedNewResourceCollections(false),
    });
    const reversed = normalizeAuthoringSpec(createValidRiggedPackageSubjectWorld(), {
      subjectResourceRegistry: registryWithPermutedNewResourceCollections(true),
    });

    expect(forward.ok).toBe(true);
    expect(reversed.ok).toBe(true);
    expect(reversed.value?.resources.subjectAssets).toEqual(
      forward.value?.resources.subjectAssets,
    );
    expect(reversed.value?.resources.rigProfiles).toEqual(
      forward.value?.resources.rigProfiles,
    );
    expect(reversed.value?.resources.animationSets).toEqual(
      forward.value?.resources.animationSets,
    );
    expect(reversed.value?.resources.colliderProfiles).toEqual(
      forward.value?.resources.colliderProfiles,
    );
    expect(reversed.normalizedWorldIrHash).toBe(forward.normalizedWorldIrHash);
    expect(reversed.value?.resources.resourceLockHash).toBe(
      forward.value?.resources.resourceLockHash,
    );
  });

  it("emits exact minimal descriptors without Registry provenance or discovery metadata", () => {
    const sourceUri = "https://registry.invalid/private/golden-humanoid.glb";
    const licenseUri = "https://registry.invalid/private/license";
    const privateAiTag = "registry-private-discovery-tag";
    const world = createValidRiggedPackageSubjectWorld();
    world.provenance = { userPrompt: "top-level provenance remains allowed" };
    const subjectResourceRegistry = registryFrom((resource) =>
      resource.kind === "subject-asset"
        ? {
            ...resource,
            provenance: {
              ...resource.provenance,
              sourceUri,
              licenseUri,
            },
            aiMetadata: {
              ...resource.aiMetadata,
              semanticTags: [...resource.aiMetadata.semanticTags, privateAiTag],
            },
          }
        : resource,
    );

    const result = normalizeAuthoringSpec(world, { subjectResourceRegistry });
    expect(result.ok).toBe(true);
    const tables = {
      subjectAssets: result.value!.resources.subjectAssets,
      rigProfiles: result.value!.resources.rigProfiles,
      animationSets: result.value!.resources.animationSets,
      colliderProfiles: result.value!.resources.colliderProfiles,
    };
    expect(Object.keys(tables.subjectAssets[0]!).sort()).toEqual([
      "artifactContentHash",
      "byteLength",
      "format",
      "inventory",
      "mediaType",
      "subjectAssetRef",
    ]);
    expect(Object.keys(tables.rigProfiles[0]!).sort()).toEqual([
      "bodyTopology",
      "requiredBoneIds",
      "rigProfileRef",
      "skeletonRootNodeName",
      "sourceNodeNameByBoneId",
    ]);
    expect(Object.keys(tables.animationSets[0]!).sort()).toEqual([
      "animationBindings",
      "animationSetRef",
      "defaultActionId",
      "requiredActionIds",
      "rigProfileRef",
      "subjectAssetRef",
    ]);
    expect(Object.keys(tables.colliderProfiles[0]!).sort()).toEqual([
      "collider",
      "colliderProfileRef",
      "supportedBodyTopologies",
    ]);
    expect(tables.subjectAssets[0]).toEqual({
      subjectAssetRef: SUBJECT_ASSET_REF,
      artifactContentHash:
        "sha256:1095fd65c754d53e6db3757ab5e1c9e5e9dcea2581f85d40f37ea4890ee8c2c2",
      byteLength: 43_656,
      mediaType: "model/gltf-binary",
      format: "glb",
      inventory: {
        meshCount: 1,
        vertexCount: 360,
        triangleCount: 180,
        skeletonCount: 1,
        boneCount: 18,
        animationClipNames: ["idle", "jump", "run", "walk"],
      },
    });

    const serializedTables = JSON.stringify(tables);
    for (const forbiddenValue of [sourceUri, licenseUri, privateAiTag]) {
      expect(serializedTables).not.toContain(forbiddenValue);
      expect(JSON.stringify(result.value)).not.toContain(forbiddenValue);
    }
    expect(serializedTables).not.toMatch(
      /"(?:id|version|contentHash|aiMetadata|provenance|bounds|coordinateConvention)"/,
    );
    expect(JSON.stringify(result.value)).toContain("top-level provenance remains allowed");
    expect(JSON.stringify(result.value)).toContain('"contentHash"');
  });

  it("recursively projects only allowed nested execution data into Normalized IR", () => {
    const forbiddenValues = [
      "registry-inventory-provider-handle",
      "registry-rig-provider-handle",
      "registry-animation-source-uri",
      "registry-collider-provider-handle",
      "registry-collider-center-source-uri",
      "registry-locomotion-provider-handle",
    ] as const;
    const subjectResourceRegistry = registryFrom((resource) => {
      switch (resource.kind) {
        case "subject-asset":
          return {
            ...resource,
            inventory: {
              ...resource.inventory,
              providerHandle: forbiddenValues[0],
            },
          } as unknown as SubjectRegistryResourceInputV1;
        case "rig-profile":
          return {
            ...resource,
            sourceNodeNameByBoneId: {
              ...resource.sourceNodeNameByBoneId,
              providerHandle: forbiddenValues[1],
            },
          } as SubjectRegistryResourceInputV1;
        case "animation-set":
          return {
            ...resource,
            animationBindings: resource.animationBindings.map((binding) => ({
              ...binding,
              sourceUri: forbiddenValues[2],
            })),
          } as SubjectRegistryResourceInputV1;
        case "collider-profile": {
          const centerOffset = Object.assign(
            [...resource.collider.centerOffsetFromSubjectOriginMetersXYZ],
            { sourceUri: forbiddenValues[4] },
          );
          return {
            ...resource,
            collider: {
              ...resource.collider,
              centerOffsetFromSubjectOriginMetersXYZ: centerOffset,
              providerHandle: forbiddenValues[3],
            },
          } as unknown as SubjectRegistryResourceInputV1;
        }
        case "locomotion-profile":
          return {
            ...resource,
            locomotion: {
              ...resource.locomotion,
              providerHandle: forbiddenValues[5],
            },
          } as SubjectRegistryResourceInputV1;
        default:
          return resource;
      }
    });
    const registryBefore = structuredClone(subjectResourceRegistry.listResources());
    const world = createValidRiggedPackageSubjectWorld();
    const definition = world.resources.subjectDefinitions[0]!;
    definition.sockets = [
      ...definition.sockets,
      {
        id: "test.local",
        kind: "local",
        localTransform: {
          positionMetersXYZ: [0, 0, 0],
          rotationEulerRadiansXYZ: [0, 0, 0],
        },
        semanticTags: ["test"],
      },
    ];
    const worldBefore = structuredClone(world);

    const result = normalizeAuthoringSpec(world, { subjectResourceRegistry });

    expect(result.diagnostics).toEqual([]);
    expect(result.ok).toBe(true);
    expect(world).toEqual(worldBefore);
    expect(subjectResourceRegistry.listResources()).toEqual(registryBefore);
    const asset = result.value!.resources.subjectAssets[0]!;
    const rig = result.value!.resources.rigProfiles[0]!;
    const animationSet = result.value!.resources.animationSets[0]!;
    const colliderProfile = result.value!.resources.colliderProfiles[0]!;
    expectExactKeys(asset.inventory, [
      "animationClipNames",
      "boneCount",
      "meshCount",
      "skeletonCount",
      "triangleCount",
      "vertexCount",
    ]);
    expectExactKeys(rig.sourceNodeNameByBoneId, BIPED_BONE_IDS);
    for (const binding of animationSet.animationBindings) {
      expectExactKeys(binding, [
        "actionId",
        "blendDurationSeconds",
        "loopMode",
        "playbackSpeedRatio",
        "rootMotionMode",
        "sourceClipName",
      ]);
    }
    expectExactKeys(colliderProfile.collider, [
      "centerOffsetFromSubjectOriginMetersXYZ",
      "heightMeters",
      "kind",
      "radiusMeters",
    ]);
    expectExactKeys(
      colliderProfile.collider.centerOffsetFromSubjectOriginMetersXYZ,
      ["0", "1", "2"],
    );
    const normalizedDefinition = result.value!.resources.subjectDefinitions[0]!;
    expectExactKeys(normalizedDefinition.visualBinding, [
      "animationSetRef",
      "mode",
      "rigProfileRef",
    ]);
    expectExactKeys(normalizedDefinition.collider, [
      "centerOffsetFromSubjectOriginMetersXYZ",
      "heightMeters",
      "kind",
      "massKilograms",
      "maxSlopeDegrees",
      "maxStepHeightMeters",
      "radiusMeters",
    ]);
    expectExactKeys(
      normalizedDefinition.collider.centerOffsetFromSubjectOriginMetersXYZ,
      ["0", "1", "2"],
    );
    expectExactKeys(normalizedDefinition.locomotion, [
      "jumpSpeedMetersPerSecond",
      "mode",
      "runSpeedMetersPerSecond",
      "walkSpeedMetersPerSecond",
      "waterSpeedMetersPerSecond",
    ]);
    const normalizedAssetPart = normalizedDefinition.visualParts.find(
      (part) => part.kind === "asset",
    )!;
    expectExactKeys(normalizedAssetPart.localTransform, [
      "positionMetersXYZ",
      "rotationEulerRadiansXYZ",
      "scaleXYZ",
    ]);
    expectExactKeys(normalizedAssetPart.localTransform.positionMetersXYZ, ["0", "1", "2"]);
    expectExactKeys(normalizedAssetPart.localTransform.rotationEulerRadiansXYZ, ["0", "1", "2"]);
    expectExactKeys(normalizedAssetPart.localTransform.scaleXYZ, ["0", "1", "2"]);
    expectExactKeys(normalizedAssetPart.appearance, ["mode"]);
    const normalizedBoneSocket = normalizedDefinition.sockets.find(
      (socket) => socket.kind === "bone",
    )!;
    expectExactKeys(normalizedBoneSocket.offsetTransform, [
      "positionMetersXYZ",
      "rotationEulerRadiansXYZ",
    ]);
    expectExactKeys(normalizedBoneSocket.offsetTransform.positionMetersXYZ, ["0", "1", "2"]);
    expectExactKeys(normalizedBoneSocket.offsetTransform.rotationEulerRadiansXYZ, ["0", "1", "2"]);
    const normalizedLocalSocket = normalizedDefinition.sockets.find(
      (socket) => socket.kind === "local",
    )!;
    expectExactKeys(normalizedLocalSocket.localTransform, [
      "positionMetersXYZ",
      "rotationEulerRadiansXYZ",
    ]);
    expectExactKeys(normalizedLocalSocket.localTransform.positionMetersXYZ, ["0", "1", "2"]);
    expectExactKeys(normalizedLocalSocket.localTransform.rotationEulerRadiansXYZ, ["0", "1", "2"]);
    const serializedIr = JSON.stringify(result.value);
    for (const forbiddenValue of forbiddenValues) {
      expect(serializedIr).not.toContain(forbiddenValue);
    }

    for (const resourceRef of [
      SUBJECT_ASSET_REF,
      RIG_PROFILE_REF,
      ANIMATION_SET_REF,
      COLLIDER_PROFILE_REF,
    ]) {
      const lockedManifest = subjectResourceRegistry
        .listResources()
        .find((resource) => resource.resourceRef === resourceRef)!;
      expect(
        result.value!.resources.resourceLock.find(
          (entry) => entry.resourceRef === resourceRef,
        )?.contentHash,
      ).toBe(lockedManifest.contentHash);
    }
  });

  it.each([
    [
      "SUBJECT_ASSET_NOT_FOUND",
      "subject-asset",
      "/resources/subjectDefinitions/0/visualParts/0/subjectAssetRef",
      "worldkit://subject-asset/missing@1",
      "availableSubjectAssetRefs",
      SUBJECT_ASSET_REF,
    ],
    [
      "SUBJECT_RIG_PROFILE_NOT_FOUND",
      "rig-profile",
      "/resources/subjectDefinitions/0/visualBinding/rigProfileRef",
      "worldkit://rig-profile/missing@1",
      "compatibleRigProfileRefs",
      RIG_PROFILE_REF,
    ],
    [
      "SUBJECT_ANIMATION_SET_NOT_FOUND",
      "animation-set",
      "/resources/subjectDefinitions/0/visualBinding/animationSetRef",
      "worldkit://animation-set/missing@1",
      "compatibleAnimationSetRefs",
      ANIMATION_SET_REF,
    ],
    [
      "SUBJECT_COLLIDER_PROFILE_NOT_FOUND",
      "collider-profile",
      "/resources/subjectDefinitions/0/colliderPolicy/colliderProfileRef",
      "worldkit://collider-profile/missing@1",
      "compatibleColliderProfileRefs",
      COLLIDER_PROFILE_REF,
    ],
  ] as const)(
    "emits %s with the exact path and offending Ref",
    (code, missingKind, instancePath, resourceRef, availableKey, availableRef) => {
      const diagnostics = diagnosticForRiggedWorld(
        builtInSubjectResourceRegistry,
        (world) => {
          const definition = world.resources.subjectDefinitions[0]!;
          if (missingKind === "subject-asset") {
            const part = definition.visualParts[0]!;
            if (part.kind === "asset") part.subjectAssetRef = resourceRef;
          } else if (missingKind === "rig-profile") {
            if (definition.visualBinding.mode === "rigged") {
              definition.visualBinding.rigProfileRef = resourceRef;
            }
          } else if (missingKind === "animation-set") {
            if (definition.visualBinding.mode === "rigged") {
              definition.visualBinding.animationSetRef = resourceRef;
            }
          } else if (definition.colliderPolicy.kind === "profile") {
            definition.colliderPolicy.colliderProfileRef = resourceRef;
          }
        },
      );

      expect(diagnostics).toContainEqual(
        expect.objectContaining({
          severity: "error",
          code,
          instancePath,
          details: expect.objectContaining({
            resourceRef,
            [availableKey]: [availableRef],
          }),
        }),
      );
      expect(diagnostics.map((diagnostic) => diagnostic.message).join("\n")).not.toMatch(
        /Babylon|Scene script/i,
      );
    },
  );

  it.each([
    {
      label: "Rig rejects the Asset",
      transform: (resource: SubjectRegistryResourceInputV1) =>
        resource.kind === "rig-profile"
          ? { ...resource, compatibleSubjectAssetRefs: [] }
          : resource,
      instancePath: "/resources/subjectDefinitions/0/visualParts/0/subjectAssetRef",
      details: {
        subjectAssetRef: SUBJECT_ASSET_REF,
        rigProfileRef: RIG_PROFILE_REF,
        compatibleSubjectAssetRefs: [],
      },
    },
    {
      label: "Animation Set targets another Asset",
      transform: (resource: SubjectRegistryResourceInputV1) =>
        resource.kind === "animation-set"
          ? {
              ...resource,
              subjectAssetRef: "worldkit://subject-asset/other@1",
            }
          : resource,
      instancePath: "/resources/subjectDefinitions/0/visualBinding/animationSetRef",
      details: {
        animationSetRef: ANIMATION_SET_REF,
        subjectAssetRef: SUBJECT_ASSET_REF,
        compatibleSubjectAssetRefs: ["worldkit://subject-asset/other@1"],
      },
    },
    {
      label: "Animation Set targets another Rig",
      transform: (resource: SubjectRegistryResourceInputV1) =>
        resource.kind === "animation-set"
          ? {
              ...resource,
              rigProfileRef: "worldkit://rig-profile/other@1",
            }
          : resource,
      instancePath: "/resources/subjectDefinitions/0/visualBinding/animationSetRef",
      details: {
        animationSetRef: ANIMATION_SET_REF,
        rigProfileRef: RIG_PROFILE_REF,
        compatibleRigProfileRefs: ["worldkit://rig-profile/other@1"],
      },
    },
    {
      label: "required Action IDs are incomplete",
      transform: (resource: SubjectRegistryResourceInputV1) =>
        resource.kind === "animation-set"
          ? { ...resource, requiredActionIds: ["idle", "walk", "run"] as const }
          : resource,
      instancePath: "/resources/subjectDefinitions/0/visualBinding/animationSetRef",
      details: { missingActionIds: ["jump"] },
    },
    {
      label: "mapped Clip is absent from Asset inventory",
      transform: (resource: SubjectRegistryResourceInputV1) =>
        resource.kind === "subject-asset"
          ? {
              ...resource,
              inventory: {
                ...resource.inventory,
                animationClipNames: ["idle", "run", "walk"],
              },
            }
          : resource,
      instancePath: "/resources/subjectDefinitions/0/visualBinding/animationSetRef",
      details: { missingSourceClipNames: ["jump"] },
    },
    {
      label: "Bone Socket targets an undeclared Bone",
      transform: (resource: SubjectRegistryResourceInputV1) =>
        resource.kind === "rig-profile"
          ? {
              ...resource,
              requiredBoneIds: resource.requiredBoneIds.filter(
                (boneId) => boneId !== "hand.right",
              ),
            }
          : resource,
      instancePath: "/resources/subjectDefinitions/0/sockets/0/boneId",
      details: { boneId: "hand.right", rigProfileRef: RIG_PROFILE_REF },
    },
    {
      label: "Rig omits a required Bone mapping",
      transform: (resource: SubjectRegistryResourceInputV1) => {
        if (resource.kind !== "rig-profile") return resource;
        const sourceNodeNameByBoneId: Record<string, string> = {
          ...resource.sourceNodeNameByBoneId,
        };
        delete sourceNodeNameByBoneId.head;
        return {
          ...resource,
          sourceNodeNameByBoneId,
        } as SubjectRegistryResourceInputV1;
      },
      instancePath: "/resources/subjectDefinitions/0/visualBinding/rigProfileRef",
      details: { missingBoneIds: ["head"], rigProfileRef: RIG_PROFILE_REF },
    },
    {
      label: "Collider profile violates support-center origin",
      transform: (resource: SubjectRegistryResourceInputV1) =>
        resource.kind === "collider-profile"
          ? {
              ...resource,
              collider: {
                ...resource.collider,
                centerOffsetFromSubjectOriginMetersXYZ: [0, 0.5, 0] as const,
              },
            }
          : resource,
      instancePath: "/resources/subjectDefinitions/0/colliderPolicy/colliderProfileRef",
      details: { colliderProfileRef: COLLIDER_PROFILE_REF },
    },
  ])(
    "emits SUBJECT_ASSET_PROFILE_INCOMPATIBLE when $label",
    ({ transform, instancePath, details }) => {
      const diagnostics = diagnosticForRiggedWorld(registryFrom(transform));

      expect(diagnostics).toContainEqual(
        expect.objectContaining({
          severity: "error",
          code: "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
          instancePath,
          details: expect.objectContaining(details),
        }),
      );
    },
  );

  it("rejects a Rig whose body topology differs from the Definition", () => {
    const diagnostics = diagnosticForRiggedWorld(
      builtInSubjectResourceRegistry,
      (world) => {
        const definition = world.resources.subjectDefinitions[0]!;
        world.resources = {
          ...world.resources,
          subjectDefinitions: [{ ...definition, bodyTopology: "quadruped" }],
        };
      },
    );

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
        instancePath: "/resources/subjectDefinitions/0/visualBinding/rigProfileRef",
        details: expect.objectContaining({
          bodyTopology: "quadruped",
          rigBodyTopology: "biped",
          rigProfileRef: RIG_PROFILE_REF,
        }),
      }),
    );
  });

  it("requires exactly one Asset Part for a rigged Definition", () => {
    const diagnostics = diagnosticForRiggedWorld(
      builtInSubjectResourceRegistry,
      (world) => {
        const definition = world.resources.subjectDefinitions[0]!;
        const assetPart = definition.visualParts[0]!;
        world.resources = {
          ...world.resources,
          subjectDefinitions: [
            {
              ...definition,
              visualParts: [assetPart, { ...assetPart, id: "body.asset.copy" }],
            },
          ],
        };
      },
    );

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
        instancePath: "/resources/subjectDefinitions/0/visualParts",
        details: expect.objectContaining({ assetPartCount: 2, requiredAssetPartCount: 1 }),
      }),
    );
  });

  it("rejects non-positive Asset scale during semantic normalization", () => {
    const definition = structuredClone(
      createValidRiggedPackageDefinition(),
    ) as unknown as {
      visualParts: Array<{ localTransform: { scaleXYZ: [number, number, number] } }>;
    };
    definition.visualParts[0]!.localTransform.scaleXYZ = [1, 0, 1];
    const diagnostics: Array<{
      code: string;
      instancePath: string;
      details?: Readonly<Record<string, unknown>>;
    }> = [];

    const result = normalizeSubjectDefinitionV2({
      definition: definition as never,
      subjectDefinitionRef: "package://subject-definition/rigged-golden-package@1",
      source: "package",
      instancePath: "/resources/subjectDefinitions/0",
      subjectResourceRegistry: builtInSubjectResourceRegistry,
      resourceLockBuilder: new ResourceLockBuilderV1(),
      diagnostics: diagnostics as never,
    });

    expect(result).toBeUndefined();
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
        instancePath:
          "/resources/subjectDefinitions/0/visualParts/0/localTransform/scaleXYZ/1",
        details: expect.objectContaining({ scaleXYZ: [1, 0, 1] }),
      }),
    );
  });

  it("emits SUBJECT_ASSET_BUDGET_EXCEEDED at the world budget", () => {
    const diagnostics = diagnosticForRiggedWorld(
      builtInSubjectResourceRegistry,
      (world) => {
        world.world = {
          ...world.world,
          resourceBudget: { ...world.world.resourceBudget, maxVertices: 100 },
        };
      },
    );

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "SUBJECT_ASSET_BUDGET_EXCEEDED",
        instancePath: "/world/resourceBudget/maxVertices",
        details: expect.objectContaining({
          subjectAssetRef: SUBJECT_ASSET_REF,
          requiredVertices: 360,
          maxVertices: 100,
        }),
      }),
    );
  });

  it("normalizes one Package Definition once for two Subject instances", () => {
    const result = normalizeAuthoringSpec(createValidPackageSubjectWorld());

    expect(result.ok).toBe(true);
    expect(result.value?.resources.subjectDefinitions).toHaveLength(2);
    expect(
      result.value?.resources.subjectDefinitions.find(
        (definition) => definition.source === "package",
      ),
    ).toMatchObject({
      subjectDefinitionRef: "package://subject-definition/coastal-pack-animal@1",
      subjectDefinitionHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      source: "package",
      collider: {
        kind: "capsule",
        radiusMeters: 0.7,
        heightMeters: 1.4,
        centerOffsetFromSubjectOriginMetersXYZ: [0, 0.7, 0],
      },
      resourceCost: { vertices: 304, triangles: 524, colliders: 1 },
    });
    expect(
      result.value?.nodes.filter(
        (node) =>
          node.kind === "subject" &&
          node.subjectDefinitionRef ===
            "package://subject-definition/coastal-pack-animal@1",
      ),
    ).toHaveLength(2);
  });

  it("makes Definition and world hashes insensitive to order-only changes", () => {
    const first = normalizeAuthoringSpec(createValidPackageSubjectWorld());
    const reordered = normalizeAuthoringSpec(
      createValidPackageSubjectWorld({ reverseDefinitionCollections: true }),
    );

    expect(first.ok).toBe(true);
    expect(reordered.ok).toBe(true);
    expect(packageDefinitionHash(reordered)).toBe(packageDefinitionHash(first));
    expect(reordered.normalizedWorldIrHash).toBe(first.normalizedWorldIrHash);
  });

  it("changes Definition Hash for semantic geometry changes", () => {
    const first = normalizeAuthoringSpec(createValidPackageSubjectWorld());
    const changed = normalizeAuthoringSpec(
      createValidPackageSubjectWorld({ bodyWidthMeters: 1.1 }),
    );

    expect(first.ok).toBe(true);
    expect(changed.ok).toBe(true);
    expect(packageDefinitionHash(changed)).not.toBe(packageDefinitionHash(first));
  });

  it("emits a stable, de-duplicated Resource Lock", () => {
    const result = normalizeAuthoringSpec(createValidPackageSubjectWorld());

    expect(result.ok).toBe(true);
    const lock = result.value!.resources.resourceLock;
    expect(lock.map((entry) => entry.resourceRef)).toEqual([
      "package://subject-definition/coastal-pack-animal@1",
      "worldkit://capability/locomotion.ground@1",
      "worldkit://collider-derivation-profile/vertical-character-capsule@1",
      "worldkit://locomotion-profile/ground.standard@1",
      "worldkit://physics-body-profile/character.medium@1",
      "worldkit://subject-definition/humanoid.third-person@1",
    ]);
    expect(lock.every((entry) => /^sha256:[a-f0-9]{64}$/.test(entry.contentHash))).toBe(
      true,
    );
    expect(result.value!.resources.resourceLockHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("rejects duplicate Package Definition identity", () => {
    const spec = createValidPackageSubjectWorld();
    spec.resources = {
      ...spec.resources,
      subjectDefinitions: [
        ...spec.resources.subjectDefinitions,
        structuredClone(spec.resources.subjectDefinitions[0]!),
      ],
    };

    expect(normalizeAuthoringSpec(spec).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "SUBJECT_DEFINITION_DUPLICATE",
        instancePath: "/resources/subjectDefinitions/1",
      }),
    );
  });

  it("does not fall back when an exact Package Definition ref is missing", () => {
    const spec = createValidPackageSubjectWorld();
    spec.nodes = spec.nodes.map((node) =>
      node.id === "pack-animal-a" && node.kind === "subject"
        ? {
            ...node,
            subjectDefinitionRef:
              "package://subject-definition/missing-pack-animal@1",
          }
        : node,
    );

    expect(normalizeAuthoringSpec(spec).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "SUBJECT_DEFINITION_NOT_FOUND",
        instancePath: "/nodes/8/subjectDefinitionRef",
      }),
    );
  });

  it("rejects a missing exact Profile ref", () => {
    const spec = createValidPackageSubjectWorld();
    const definition = spec.resources.subjectDefinitions[0]!;
    spec.resources = {
      ...spec.resources,
      subjectDefinitions: [
        {
          ...definition,
          profiles: {
            ...definition.profiles,
            locomotionProfileRef:
              "worldkit://locomotion-profile/ground.missing@1",
          },
        },
      ],
    };

    expect(normalizeAuthoringSpec(spec).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "SUBJECT_CAPABILITY_UNSATISFIED",
        instancePath:
          "/resources/subjectDefinitions/0/profiles/locomotionProfileRef",
      }),
    );
  });

  it("maps support-center failures to the Package Definition path", () => {
    const spec = createValidPackageSubjectWorld();
    const definition = spec.resources.subjectDefinitions[0]!;
    spec.resources = {
      ...spec.resources,
      subjectDefinitions: [
        {
          ...definition,
          visualParts: definition.visualParts.map((part) =>
            part.kind === "primitive"
              ? {
                  ...part,
                  localTransform: {
                    ...part.localTransform,
                    positionMetersXYZ: [
                      part.localTransform.positionMetersXYZ[0],
                      part.localTransform.positionMetersXYZ[1] + 1,
                      part.localTransform.positionMetersXYZ[2],
                    ],
                  },
                }
              : {
                  ...part,
                  localTransform: {
                    ...part.localTransform,
                    positionMetersXYZ: [
                      part.localTransform.positionMetersXYZ[0],
                      part.localTransform.positionMetersXYZ[1] + 1,
                      part.localTransform.positionMetersXYZ[2],
                    ],
                  },
                },
          ),
        },
      ],
    };

    expect(normalizeAuthoringSpec(spec).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "SUBJECT_SUPPORT_ORIGIN_INVALID",
        instancePath: "/resources/subjectDefinitions/0/visualParts",
      }),
    );
  });

  it("rejects a composition that cannot derive the selected Collider", () => {
    const spec = createValidPackageSubjectWorld();
    const definition = spec.resources.subjectDefinitions[0]!;
    spec.resources = {
      ...spec.resources,
      subjectDefinitions: [
        {
          ...definition,
          visualParts: definition.visualParts.map((part) => ({
            ...part,
            colliderContribution: "exclude" as const,
          })),
        },
      ],
    };

    expect(normalizeAuthoringSpec(spec).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "SUBJECT_COLLIDER_DERIVATION_FAILED",
        instancePath: "/resources/subjectDefinitions/0/colliderPolicy",
      }),
    );
  });

  it("rejects Registry content that conflicts with its immutable hash", () => {
    const conflictingRegistry: SubjectResourceRegistryV2 = {
      ...builtInSubjectResourceRegistry,
      resolveCapability(resourceRef) {
        const resource = builtInSubjectResourceRegistry.resolveCapability(resourceRef);
        return resource === undefined
          ? undefined
          : { ...resource, contentHash: `sha256:${"f".repeat(64)}` };
      },
    };

    expect(
      normalizeAuthoringSpec(createValidPackageSubjectWorld(), {
        subjectResourceRegistry: conflictingRegistry,
      }).diagnostics,
    ).toContainEqual(
      expect.objectContaining({
        code: "SUBJECT_RESOURCE_LOCK_CONFLICT",
      }),
    );
  });
});
