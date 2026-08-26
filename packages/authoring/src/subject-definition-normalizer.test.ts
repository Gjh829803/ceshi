import { describe, expect, it } from "vitest";

import { BIPED_BONE_IDS_V1 } from "@whitebox-world/subject-contracts";

import {
  builtInSubjectResourceRegistry,
  createSubjectResourceRegistry,
  type SubjectRegistryResourceInputV3,
  type SubjectResourceRegistryV3,
} from "@whitebox-world/subject-registry";
import subjectDefinitionsV3 from "../../../assets/registry/subject-definitions/catalog.json";
import {
  BUILT_IN_CAPABILITY_MANIFESTS,
  BUILT_IN_CAPABILITY_RESOURCES,
} from "../../subject-registry/src/built-in-capability-resources";
import { BUILT_IN_SUBJECT_DEFINITIONS } from "../../subject-registry/src/built-in-subject-definitions";
import { BUILT_IN_SUBJECT_RESOURCE_MANIFESTS } from "../../subject-registry/src/built-in-resource-manifests";
import type { RegistrySubjectDefinitionInputV3 } from "../../subject-registry/src/types-v3";

import {
  normalizeAuthoringSpecV4,
  normalizeSubjectDefinitionV2,
  ResourceLockBuilderV1,
  sha256CanonicalJson,
  type NormalizeAuthoringResultV4,
} from "./index";
import {
  createValidAuthoringSpec,
  createValidPackageSubjectWorld,
  createValidRiggedPackageDefinition,
  createValidRiggedPackageSubjectWorld,
} from "./test-fixture";

const SUBJECT_ASSET_REF = "worldkit://subject-asset/humanoid.golden@2";
const RIG_PROFILE_REF = "worldkit://rig-profile/biped.golden@2";
const ANIMATION_SET_REF = "worldkit://animation-set/humanoid.ground.golden@2";
const G_BOT_SUBJECT_ASSET_REF =
  "worldkit://subject-asset/actor.humanoid.g-bot@2";
const G_BOT_RIG_PROFILE_REF =
  "worldkit://rig-profile/biped.mixamo-g-bot@2";
const COLLIDER_PROFILE_REF =
  "worldkit://collider-profile/humanoid.medium-capsule@1";
const BIPED_BONE_IDS = [...BIPED_BONE_IDS_V1].sort();

const ALL_BUILT_IN_REGISTRY_INPUTS = [
  ...BUILT_IN_SUBJECT_DEFINITIONS,
  ...(subjectDefinitionsV3 as unknown as readonly RegistrySubjectDefinitionInputV3[]),
  ...BUILT_IN_SUBJECT_RESOURCE_MANIFESTS,
  ...BUILT_IN_CAPABILITY_MANIFESTS,
  ...BUILT_IN_CAPABILITY_RESOURCES,
] as const;

function expectExactKeys(value: object, expectedKeys: readonly string[]): void {
  expect(Object.keys(value).sort()).toEqual([...expectedKeys].sort());
}

function registryFrom(
  transform: (
    resource: SubjectRegistryResourceInputV3,
  ) => SubjectRegistryResourceInputV3 | undefined,
): SubjectResourceRegistryV3 {
  return createSubjectResourceRegistry(
    ALL_BUILT_IN_REGISTRY_INPUTS.flatMap((resource) => {
      const transformed = transform(structuredClone(resource));
      return transformed === undefined ? [] : [transformed];
    }),
  );
}

function registryWithPermutedNewResourceCollections(
  isReversed: boolean,
): SubjectResourceRegistryV3 {
  const maybeReverse = <T>(values: readonly T[]): readonly T[] =>
    isReversed ? [...values].reverse() : [...values];

  return createSubjectResourceRegistry(
    ALL_BUILT_IN_REGISTRY_INPUTS.map((resource) => {
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
            G_BOT_SUBJECT_ASSET_REF,
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
  subjectResourceRegistry: SubjectResourceRegistryV3,
  mutateWorld?: (world: ReturnType<typeof createValidRiggedPackageSubjectWorld>) => void,
) {
  const world = createValidRiggedPackageSubjectWorld();
  mutateWorld?.(world);
  const result = normalizeAuthoringSpecV4(world, { subjectResourceRegistry });
  expect(result.ok).toBe(false);
  return result.diagnostics;
}

function createStaticAssetPackageSubjectWorld() {
  const world = createValidRiggedPackageSubjectWorld();
  const definition = world.resources.subjectDefinitions[0]!;
  world.resources = {
    ...world.resources,
    subjectDefinitions: [{
      ...definition,
      visualBinding: { mode: "static" },
      sockets: [],
      actionOrPoseSetRef: "worldkit://pose-set/static.whitebox@1",
    }],
  };
  return world;
}

function packageDefinitionHash(result: NormalizeAuthoringResultV4): string {
  return result.value!.resources.subjectDefinitions.find(
    (definition) => definition.source === "package",
  )!.subjectDefinitionHash;
}

describe("Package Subject Mount slots", () => {
  it("normalizes an exact stand slot and rejects a missing Mount Socket", () => {
    const world = createValidPackageSubjectWorld();
    const definition = world.resources.subjectDefinitions[0]!;
    definition.sockets = [
      ...definition.sockets,
      {
        id: "MountStand",
        kind: "local",
        localTransform: { positionMetersXYZ: [0, 0.25, 0] },
        semanticTags: ["mounted-on", "stand"],
      },
    ];
    definition.mountSlots = [{
      id: "stand",
      kind: "mount-slot",
      mode: "stand",
      mountSocketId: "MountStand",
      riderSubjectOriginOffsetMetersXYZ: [0, 0.2, 0],
      dismountCandidateOffsetsMetersXYZ: [[0.8, 0, 0]],
    }];

    const normalized = normalizeAuthoringSpecV4(world);
    expect(normalized.diagnostics).toEqual([]);
    expect(normalized.value?.resources.subjectDefinitions[0]?.mountSlots)
      .toEqual(definition.mountSlots);

    const missingSocket = createValidPackageSubjectWorld();
    missingSocket.resources.subjectDefinitions[0]!.mountSlots =
      definition.mountSlots;
    expect(normalizeAuthoringSpecV4(missingSocket).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "SUBJECT_MOUNT_SLOT_SOCKET_NOT_FOUND",
        instancePath:
          "/resources/subjectDefinitions/0/mountSlots/0/mountSocketId",
      }),
    );
  });

  it("sorts Mount slot IDs deterministically and rejects duplicate IDs", () => {
    const world = createValidPackageSubjectWorld();
    const definition = world.resources.subjectDefinitions[0]!;
    definition.sockets = [
      ...definition.sockets,
      {
        id: "MountFront",
        kind: "local",
        localTransform: { positionMetersXYZ: [0, 0.25, -0.2] },
        semanticTags: ["mounted-on", "stand"],
      },
      {
        id: "MountRear",
        kind: "local",
        localTransform: { positionMetersXYZ: [0, 0.25, 0.2] },
        semanticTags: ["mounted-on", "stand"],
      },
    ];
    definition.mountSlots = [
      {
        id: "rear",
        kind: "mount-slot",
        mode: "stand",
        mountSocketId: "MountRear",
        riderSubjectOriginOffsetMetersXYZ: [0, 0.2, 0],
        dismountCandidateOffsetsMetersXYZ: [[-0.8, 0, 0]],
      },
      {
        id: "front",
        kind: "mount-slot",
        mode: "stand",
        mountSocketId: "MountFront",
        riderSubjectOriginOffsetMetersXYZ: [0, 0.2, 0],
        dismountCandidateOffsetsMetersXYZ: [[0.8, 0, 0]],
      },
    ];

    const normalized = normalizeAuthoringSpecV4(world);
    expect(normalized.diagnostics).toEqual([]);
    expect(
      normalized.value?.resources.subjectDefinitions[0]?.mountSlots.map(
        ({ id }) => id,
      ),
    ).toEqual(["front", "rear"]);

    const duplicate = createValidPackageSubjectWorld();
    duplicate.resources.subjectDefinitions[0]!.sockets = definition.sockets;
    duplicate.resources.subjectDefinitions[0]!.mountSlots = [
      definition.mountSlots[0]!,
      { ...definition.mountSlots[1]!, id: definition.mountSlots[0]!.id },
    ];
    expect(normalizeAuthoringSpecV4(duplicate).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "SUBJECT_MOUNT_SLOT_DUPLICATE",
        instancePath: "/resources/subjectDefinitions/0/mountSlots/1/id",
      }),
    );
  });
});

describe("ResourceLockBuilderV1 canonical ordering", () => {
  it("uses locale-independent byte order for punctuation-bearing refs", () => {
    const refs = [
      "package://subject-definition/a_a@1",
      "package://subject-definition/a.a@1",
      "package://subject-definition/a-a@1",
    ];
    const build = (orderedRefs: readonly string[]) => {
      const builder = new ResourceLockBuilderV1();
      const diagnostics: Array<
        NormalizeAuthoringResultV4["diagnostics"][number]
      > = [];
      for (const resourceRef of orderedRefs) {
        builder.addPackageSubjectDefinition(
          resourceRef,
          1,
          sha256CanonicalJson({ resourceRef }),
          "/resources",
          diagnostics,
        );
      }
      expect(diagnostics).toEqual([]);
      return builder.finish();
    };

    const forward = build(refs);
    const reversed = build([...refs].reverse());
    expect(forward.resourceLock.map((entry) => entry.resourceRef)).toEqual(
      [...refs].sort((left, right) => left < right ? -1 : left > right ? 1 : 0),
    );
    expect(reversed.resourceLock).toEqual(forward.resourceLock);
    expect(forward.resourceLockHash).toBe(
      sha256CanonicalJson(forward.resourceLock),
    );
    expect(reversed.resourceLockHash).toBe(forward.resourceLockHash);
  });
});

describe("Package Subject Definition normalization", () => {
  it("resolves, locks, and costs the one Asset Part of a static Definition", () => {
    const result = normalizeAuthoringSpecV4(createStaticAssetPackageSubjectWorld());

    expect(result.ok).toBe(true);
    const definition = result.value!.resources.subjectDefinitions[0]!;
    expect(definition.visualBinding).toEqual({ mode: "static" });
    expect(definition.visualParts).toEqual([
      expect.objectContaining({
        id: "body.asset",
        kind: "asset",
        subjectAssetRef: SUBJECT_ASSET_REF,
      }),
    ]);
    expect(definition.resourceCost).toEqual({
      vertices: 360,
      triangles: 180,
      colliders: 1,
    });
    expect(result.value!.resources.subjectAssets).toEqual([
      expect.objectContaining({ subjectAssetRef: SUBJECT_ASSET_REF }),
    ]);
    const lockRefs = result.value!.resources.resourceLock.map(
      (entry) => entry.resourceRef,
    );
    expect(lockRefs).toContain(SUBJECT_ASSET_REF);
    expect(lockRefs).not.toContain(RIG_PROFILE_REF);
    expect(lockRefs).not.toContain(ANIMATION_SET_REF);
  });

  it("rejects more than one Asset Part in a static Definition", () => {
    const world = createStaticAssetPackageSubjectWorld();
    const definition = world.resources.subjectDefinitions[0]!;
    const assetPart = definition.visualParts[0]!;
    world.resources = {
      ...world.resources,
      subjectDefinitions: [{
        ...definition,
        visualParts: [assetPart, { ...assetPart, id: "body.asset.copy" }],
      }],
    };

    expect(normalizeAuthoringSpecV4(world).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "STATIC_SUBJECT_MULTIPLE_ASSET_PARTS_UNSUPPORTED",
        instancePath: "/resources/subjectDefinitions/0/visualParts",
        details: expect.objectContaining({ assetPartCount: 2 }),
      }),
    );
  });

  it("preserves a zero-asset primitive static Definition", () => {
    const result = normalizeAuthoringSpecV4(createValidPackageSubjectWorld());

    expect(result.ok).toBe(true);
    const definition = result.value!.resources.subjectDefinitions.find(
      (candidate) =>
        candidate.subjectDefinitionRef ===
          "package://subject-definition/coastal-pack-animal@1",
    );
    expect(definition).toMatchObject({
      visualBinding: { mode: "static" },
      resourceCost: { vertices: 304, triangles: 524, colliders: 1 },
    });
    expect(definition?.visualParts.every((part) => part.kind === "primitive")).toBe(true);
    expect(result.value!.resources.subjectAssets).toEqual([]);
  });

  it("normalizes and locks the complete Golden rigged graph without asset bytes", () => {
    const result = normalizeAuthoringSpecV4(createValidRiggedPackageSubjectWorld());

    expect(result.ok).toBe(true);
    expect(result.value?.resources).toMatchObject({
      subjectAssets: [
        {
          subjectAssetRef: SUBJECT_ASSET_REF,
          artifactContentHash:
            "sha256:6cf29a2c9c024bdc108a8a436255abbb5f370d658d78cca0afb30f4872cd25a8",
          byteLength: 48_060,
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
      "worldkit://camera-context/capability-driven.default@1",
      "worldkit://camera-modifier/aim-framing@1",
      "worldkit://camera-modifier/mounted-framing@1",
      "worldkit://camera-modifier/reverse-stability@1",
      "worldkit://camera-modifier/sprint-emphasis@1",
      "worldkit://camera-modifier/water-stability@1",
      "worldkit://camera-profile/chase.surface-fast@1",
      "worldkit://camera-profile/first-person.standard@1",
      "worldkit://camera-profile/flight.glide@1",
      "worldkit://camera-profile/follow.medium@1",
      "worldkit://camera-profile/orbit.medium@1",
      "worldkit://camera-rig/flight-horizon@1",
      "worldkit://camera-rig/orbit-follow@1",
      "worldkit://camera-rig/socket-first-person@1",
      "worldkit://camera-rig/velocity-chase@1",
      "worldkit://capability/locomotion.ground@1",
      COLLIDER_PROFILE_REF,
      "worldkit://control-feel-profile/humanoid.heavy-ground@1",
      "worldkit://control-feel-profile/humanoid.medium-ground@1",
      "worldkit://control-profile/planar.camera-relative@1",
      "worldkit://harness-profile/subject.standard@1",
      "worldkit://locomotion-profile/ground.standard@1",
      "worldkit://medium-profile/ground-air.standard@1",
      "worldkit://motion-kernel/free-ground@1",
      "worldkit://motion-profile/free-ground.humanoid-medium@1",
      "worldkit://motion-profile/safe-ground@1",
      "worldkit://physics-body-profile/character.capability-medium@1",
      "worldkit://render-binding/subject.standard@1",
      RIG_PROFILE_REF,
      SUBJECT_ASSET_REF,
    ]);
    expect(new Set(lockRefs).size).toBe(lockRefs.length);
    expect(JSON.stringify(result.value)).not.toMatch(
      /golden-humanoid\.glb|Uint8Array|ArrayBuffer/,
    );
  });

  it("locks the current rigged Subject Definition, Resource Lock, and Normalized IR hashes", () => {
    const result = normalizeAuthoringSpecV4(createValidRiggedPackageSubjectWorld());

    expect(result.ok).toBe(true);
    expect(packageDefinitionHash(result)).toBe(
      "sha256:bbfe1cfbcc097ab2dc4e32af38c2b8fdf6abd7a70ba41a36d55175199e113e45",
    );
    expect(result.value?.resources.resourceLockHash).toBe(
      "sha256:ec36491175794fd9782955a6fe8428d0d48f199e676791998100980ea5eb7afc",
    );
    expect(result.normalizedWorldIrHash).toBe(
      "sha256:a60e7b989020b1f93915f9fa034e433ff4cd590348a64d4814304416fba4b95e",
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

    const result = normalizeAuthoringSpecV4(world);

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
    const forward = normalizeAuthoringSpecV4(createValidRiggedPackageSubjectWorld(), {
      subjectResourceRegistry: registryWithPermutedNewResourceCollections(false),
    });
    const reversed = normalizeAuthoringSpecV4(createValidRiggedPackageSubjectWorld(), {
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

    const result = normalizeAuthoringSpecV4(world, { subjectResourceRegistry });
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
      "subjectAssetManifestHash",
      "subjectAssetRef",
    ]);
    expect(Object.keys(tables.rigProfiles[0]!).sort()).toEqual([
      "bodyTopology",
      "requiredBoneIds",
      "rigProfileRef",
      "skeletonRootBoneName",
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
      subjectAssetManifestHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      artifactContentHash:
        "sha256:6cf29a2c9c024bdc108a8a436255abbb5f370d658d78cca0afb30f4872cd25a8",
      byteLength: 48_060,
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
          } as unknown as SubjectRegistryResourceInputV3;
        case "rig-profile":
          return {
            ...resource,
            sourceNodeNameByBoneId: {
              ...resource.sourceNodeNameByBoneId,
              providerHandle: forbiddenValues[1],
            },
          } as SubjectRegistryResourceInputV3;
        case "animation-set":
          return {
            ...resource,
            animationBindings: resource.animationBindings.map((binding) => ({
              ...binding,
              sourceUri: forbiddenValues[2],
            })),
          } as SubjectRegistryResourceInputV3;
        case "collider-profile":
          return {
            ...resource,
            collider: {
              ...resource.collider,
              providerHandle: forbiddenValues[3],
            },
          } as unknown as SubjectRegistryResourceInputV3;
        case "control-feel-profile":
          return {
            ...resource,
            providerHandle: forbiddenValues[4],
          } as unknown as SubjectRegistryResourceInputV3;
        default:
          return resource;
      }
    });
    const registryBefore = structuredClone(
      subjectResourceRegistry.listDiscoverableResources(),
    );
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

    const result = normalizeAuthoringSpecV4(world, { subjectResourceRegistry });

    expect(result.diagnostics).toEqual([]);
    expect(result.ok).toBe(true);
    expect(world).toEqual(worldBefore);
    expect(subjectResourceRegistry.listDiscoverableResources()).toEqual(registryBefore);
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
    expectExactKeys(normalizedDefinition.locomotion, ["allowJump", "allowRun", "allowWalk"]);
    const controlFeelKeys = [
      "accelerationMetersPerSecondSquared",
      "airControlRatio",
      "contentHash",
      "coyoteTimeSeconds",
      "decelerationMetersPerSecondSquared",
      "jumpBufferSeconds",
      "jumpHoldGravityRatio",
      "jumpReleaseGravityRatio",
      "jumpSpeedMetersPerSecond",
      "moveResponseExponent",
      "resourceRef",
      "runSpeedMetersPerSecond",
      "turnRateRadiansPerSecond",
      "variableJumpHoldSeconds",
      "walkSpeedMetersPerSecond",
    ] as const;
    expectExactKeys(normalizedDefinition.controlFeel, controlFeelKeys);
    expect(
      normalizedDefinition.availableControlFeels.map((feel) => feel.resourceRef),
    ).toEqual([
      "worldkit://control-feel-profile/humanoid.medium-ground@1",
      "worldkit://control-feel-profile/humanoid.heavy-ground@1",
    ]);
    for (const availableFeel of normalizedDefinition.availableControlFeels) {
      expectExactKeys(availableFeel, controlFeelKeys);
    }
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
        .resolveResource(resourceRef)!;
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
      builtInSubjectResourceRegistry
        .listDiscoverableResources({ kind: "subject-asset" })
        .map((resource) => resource.resourceRef)
        .sort((left, right) => left.localeCompare(right)),
    ],
    [
      "SUBJECT_RIG_PROFILE_NOT_FOUND",
      "rig-profile",
      "/resources/subjectDefinitions/0/visualBinding/rigProfileRef",
      "worldkit://rig-profile/missing@1",
      "compatibleRigProfileRefs",
      [RIG_PROFILE_REF],
    ],
    [
      "SUBJECT_ANIMATION_SET_NOT_FOUND",
      "animation-set",
      "/resources/subjectDefinitions/0/visualBinding/animationSetRef",
      "worldkit://animation-set/missing@1",
      "compatibleAnimationSetRefs",
      [ANIMATION_SET_REF],
    ],
    [
      "SUBJECT_COLLIDER_PROFILE_NOT_FOUND",
      "collider-profile",
      "/resources/subjectDefinitions/0/colliderPolicy/colliderProfileRef",
      "worldkit://collider-profile/missing@1",
      "compatibleColliderProfileRefs",
      builtInSubjectResourceRegistry
        .listDiscoverableResources({ kind: "collider-profile" })
        .filter((resource) =>
          resource.supportedBodyTopologies.includes("biped"),
        )
        .map((resource) => resource.resourceRef)
        .sort((left, right) => left.localeCompare(right)),
    ],
  ] as const)(
    "emits %s with the exact path and offending Ref",
    (code, missingKind, instancePath, resourceRef, availableKey, availableRefs) => {
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
            [availableKey]: availableRefs,
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
      transform: (resource: SubjectRegistryResourceInputV3) =>
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
      transform: (resource: SubjectRegistryResourceInputV3) =>
        resource.kind === "animation-set"
          ? {
              ...resource,
              subjectAssetRef: G_BOT_SUBJECT_ASSET_REF,
            }
          : resource,
      instancePath: "/resources/subjectDefinitions/0/visualBinding/animationSetRef",
      details: {
        animationSetRef: ANIMATION_SET_REF,
        subjectAssetRef: SUBJECT_ASSET_REF,
        compatibleSubjectAssetRefs: [G_BOT_SUBJECT_ASSET_REF],
      },
    },
    {
      label: "Animation Set targets another Rig",
      transform: (resource: SubjectRegistryResourceInputV3) =>
        resource.kind === "animation-set"
          ? {
              ...resource,
              rigProfileRef: G_BOT_RIG_PROFILE_REF,
            }
          : resource,
      instancePath: "/resources/subjectDefinitions/0/visualBinding/animationSetRef",
      details: {
        animationSetRef: ANIMATION_SET_REF,
        rigProfileRef: RIG_PROFILE_REF,
        compatibleRigProfileRefs: [G_BOT_RIG_PROFILE_REF],
      },
    },
    {
      label: "required Action IDs are incomplete",
      transform: (resource: SubjectRegistryResourceInputV3) =>
        resource.kind === "animation-set"
          ? { ...resource, requiredActionIds: ["idle", "walk", "run"] as const }
          : resource,
      instancePath: "/resources/subjectDefinitions/0/visualBinding/animationSetRef",
      details: { missingActionIds: ["jump"] },
    },
    {
      label: "mapped Clip is absent from Asset inventory",
      transform: (resource: SubjectRegistryResourceInputV3) =>
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
      transform: (resource: SubjectRegistryResourceInputV3) =>
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
      transform: (resource: SubjectRegistryResourceInputV3) => {
        if (resource.kind !== "rig-profile") return resource;
        const sourceNodeNameByBoneId: Record<string, string> = {
          ...resource.sourceNodeNameByBoneId,
        };
        delete sourceNodeNameByBoneId.head;
        return {
          ...resource,
          sourceNodeNameByBoneId,
        } as SubjectRegistryResourceInputV3;
      },
      instancePath: "/resources/subjectDefinitions/0/visualBinding/rigProfileRef",
      details: { missingBoneIds: ["head"], rigProfileRef: RIG_PROFILE_REF },
    },
    {
      label: "Collider profile violates support-center origin",
      transform: (resource: SubjectRegistryResourceInputV3) =>
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
    const result = normalizeAuthoringSpecV4(createValidPackageSubjectWorld());

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

  it("assembles every Package Subject from the complete locked capability graph", () => {
    const result = normalizeAuthoringSpecV4(createValidPackageSubjectWorld());
    const definition = result.value?.resources.subjectDefinitions.find(
      (row) =>
        row.subjectDefinitionRef ===
        "package://subject-definition/coastal-pack-animal@1",
    );

    expect(result.ok).toBe(true);
    expect(definition?.capabilityAssembly).toMatchObject({
      authoringAvailability: "recommended",
      physicsBodyProfileRef:
        "worldkit://physics-body-profile/character.capability-medium@1",
      locomotionProfileRef:
        "worldkit://locomotion-profile/ground.standard@1",
      defaultMotionProfile: {
        resourceRef:
          "worldkit://motion-profile/free-ground.humanoid-medium@1",
      },
      fallbackMotionProfile: {
        resourceRef: "worldkit://motion-profile/safe-ground@1",
      },
      controlProfile: {
        resourceRef:
          "worldkit://control-profile/planar.camera-relative@1",
      },
      cameraContextProfile: {
        resourceRef:
          "worldkit://camera-context/capability-driven.default@1",
      },
      mediumProfile: {
        resourceRef: "worldkit://medium-profile/ground-air.standard@1",
      },
      harnessProfile: {
        resourceRef: "worldkit://harness-profile/subject.standard@1",
      },
      actionOrPoseSetRef: "worldkit://pose-set/static.whitebox@1",
      renderBindingProfile: {
        resourceRef: "worldkit://render-binding/subject.standard@1",
      },
    });
  });

  it("makes Definition and world hashes insensitive to order-only changes", () => {
    const first = normalizeAuthoringSpecV4(createValidPackageSubjectWorld());
    const reordered = normalizeAuthoringSpecV4(
      createValidPackageSubjectWorld({ reverseDefinitionCollections: true }),
    );

    expect(first.ok).toBe(true);
    expect(reordered.ok).toBe(true);
    expect(packageDefinitionHash(reordered)).toBe(packageDefinitionHash(first));
    expect(reordered.normalizedWorldIrHash).toBe(first.normalizedWorldIrHash);
  });

  it("changes Definition Hash for semantic geometry changes", () => {
    const first = normalizeAuthoringSpecV4(createValidPackageSubjectWorld());
    const changed = normalizeAuthoringSpecV4(
      createValidPackageSubjectWorld({ bodyWidthMeters: 1.1 }),
    );

    expect(first.ok).toBe(true);
    expect(changed.ok).toBe(true);
    expect(packageDefinitionHash(changed)).not.toBe(packageDefinitionHash(first));
  });

  it("emits a stable, de-duplicated Resource Lock", () => {
    const result = normalizeAuthoringSpecV4(createValidPackageSubjectWorld());

    expect(result.ok).toBe(true);
    const lock = result.value!.resources.resourceLock;
    expect(lock.map((entry) => entry.resourceRef)).toEqual([
      "package://subject-definition/coastal-pack-animal@1",
      "worldkit://camera-context/capability-driven.default@1",
      "worldkit://camera-modifier/aim-framing@1",
      "worldkit://camera-modifier/mounted-framing@1",
      "worldkit://camera-modifier/reverse-stability@1",
      "worldkit://camera-modifier/sprint-emphasis@1",
      "worldkit://camera-modifier/water-stability@1",
      "worldkit://camera-profile/chase.surface-fast@1",
      "worldkit://camera-profile/first-person.standard@1",
      "worldkit://camera-profile/flight.glide@1",
      "worldkit://camera-profile/follow.medium@1",
      "worldkit://camera-profile/orbit.medium@1",
      "worldkit://camera-rig/flight-horizon@1",
      "worldkit://camera-rig/orbit-follow@1",
      "worldkit://camera-rig/socket-first-person@1",
      "worldkit://camera-rig/velocity-chase@1",
      "worldkit://capability/locomotion.ground@1",
      "worldkit://collider-derivation-profile/vertical-character-capsule@1",
      "worldkit://collider-profile/humanoid.medium-capsule@1",
      "worldkit://control-feel-profile/humanoid.heavy-ground@1",
      "worldkit://control-feel-profile/humanoid.medium-ground@1",
      "worldkit://control-profile/planar.camera-relative@1",
      "worldkit://harness-profile/subject.standard@1",
      "worldkit://locomotion-profile/ground.standard@1",
      "worldkit://medium-profile/ground-air.standard@1",
      "worldkit://motion-kernel/free-ground@1",
      "worldkit://motion-profile/free-ground.humanoid-medium@1",
      "worldkit://motion-profile/safe-ground@1",
      "worldkit://physics-body-profile/character.capability-medium@1",
      "worldkit://pose-set/static.whitebox@1",
      "worldkit://render-binding/subject.standard@1",
      "worldkit://subject-definition/humanoid.third-person@1",
    ]);
    expect(lock.every((entry) => /^sha256:[a-f0-9]{64}$/.test(entry.contentHash))).toBe(
      true,
    );
    expect(result.value!.resources.resourceLockHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("locks the complete capability graph for the primitive R1 humanoid without a GLB", () => {
    const result = normalizeAuthoringSpecV4(createValidAuthoringSpec());

    expect(result.ok).toBe(true);
    const definition = result.value!.resources.subjectDefinitions.find(
      (row) => row.subjectDefinitionRef ===
        "worldkit://subject-definition/humanoid.third-person@1",
    );
    expect(definition).toMatchObject({
      visualBinding: { mode: "static" },
      visualParts: [expect.objectContaining({ kind: "primitive" })],
      colliderPolicy: {
        kind: "profile",
        colliderProfileRef: COLLIDER_PROFILE_REF,
      },
      capabilityAssembly: {
        actionOrPoseSetRef: "worldkit://pose-set/static.whitebox@1",
      },
    });
    expect(result.value!.resources.subjectAssets).toEqual([]);
    const lockRefs = result.value!.resources.resourceLock.map(
      (entry) => entry.resourceRef,
    );
    expect(lockRefs).toEqual(expect.arrayContaining([
        "worldkit://subject-definition/humanoid.third-person@1",
        COLLIDER_PROFILE_REF,
        "worldkit://physics-body-profile/character.capability-medium@1",
        "worldkit://locomotion-profile/ground.standard@1",
        "worldkit://capability/locomotion.ground@1",
        "worldkit://control-feel-profile/humanoid.medium-ground@1",
        "worldkit://motion-profile/free-ground.humanoid-medium@1",
        "worldkit://motion-kernel/free-ground@1",
        "worldkit://control-profile/planar.camera-relative@1",
        "worldkit://medium-profile/ground-air.standard@1",
        "worldkit://harness-profile/subject.standard@1",
        "worldkit://pose-set/static.whitebox@1",
        "worldkit://render-binding/subject.standard@1",
      ]));
    expect(lockRefs).not.toContain(
      "worldkit://collider-derivation-profile/vertical-character-capsule@1",
    );
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

    expect(normalizeAuthoringSpecV4(spec).diagnostics).toContainEqual(
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

    expect(normalizeAuthoringSpecV4(spec).diagnostics).toContainEqual(
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

    expect(normalizeAuthoringSpecV4(spec).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "SUBJECT_CAPABILITY_UNSATISFIED",
        instancePath:
          "/resources/subjectDefinitions/0/profiles/locomotionProfileRef",
      }),
    );
  });

  it("rejects a missing controlFeelProfileRef", () => {
    const spec = createValidPackageSubjectWorld();
    const definition = structuredClone(spec.resources.subjectDefinitions[0]!);
    const { controlFeelProfileRef: _omittedControlFeelProfileRef, ...profiles } =
      definition.profiles;
    const diagnostics: Array<{
      code: string;
      instancePath: string;
      message?: string;
    }> = [];

    const result = normalizeSubjectDefinitionV2({
      definition: { ...definition, profiles: profiles as typeof definition.profiles },
      subjectDefinitionRef: "package://subject-definition/coastal-pack-animal@1",
      source: "package",
      instancePath: "/resources/subjectDefinitions/0",
      subjectResourceRegistry: builtInSubjectResourceRegistry,
      resourceLockBuilder: new ResourceLockBuilderV1(),
      diagnostics: diagnostics as never,
    });

    expect(result).toBeUndefined();
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "SUBJECT_CONTROL_FEEL_PROFILE_REQUIRED",
        message: expect.stringMatching(/^SUBJECT_CONTROL_FEEL_PROFILE_REQUIRED:/),
        instancePath:
          "/resources/subjectDefinitions/0/profiles/controlFeelProfileRef",
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

    expect(normalizeAuthoringSpecV4(spec).diagnostics).toContainEqual(
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

    expect(normalizeAuthoringSpecV4(spec).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "SUBJECT_COLLIDER_DERIVATION_FAILED",
        instancePath: "/resources/subjectDefinitions/0/colliderPolicy",
      }),
    );
  });

  it("rejects Registry content that conflicts with its immutable hash", () => {
    const conflictingRegistry: SubjectResourceRegistryV3 = {
      ...builtInSubjectResourceRegistry,
      resolveCapability(resourceRef) {
        const resource = builtInSubjectResourceRegistry.resolveCapability(resourceRef);
        return resource === undefined
          ? undefined
          : { ...resource, contentHash: `sha256:${"f".repeat(64)}` };
      },
    };

    expect(
      normalizeAuthoringSpecV4(createValidPackageSubjectWorld(), {
        subjectResourceRegistry: conflictingRegistry,
      }).diagnostics,
    ).toContainEqual(
      expect.objectContaining({
        code: "SUBJECT_RESOURCE_LOCK_CONFLICT",
      }),
    );
  });
});
