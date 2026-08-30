import { describe, expect, it } from "vitest";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  BIPED_BONE_IDS_V1,
  GROUND_HUMANOID_ACTION_IDS_V1,
} from "@whitebox-world/subject-contracts";

import {
  builtInSubjectResourceRegistry,
  createSubjectResourceRegistry,
  FIRST_SLICE_ALLOWED_OVERRIDE_PATHS,
  XIER120_SUBJECT_DEFINITIONS,
} from "./index";
import type {
  AnimationSetManifestInputV1,
} from "./index";

const SUBJECT_ASSET_REF = "worldkit://subject-asset/humanoid.golden@2";
const RIG_PROFILE_REF = "worldkit://rig-profile/biped.golden@2";
const ANIMATION_SET_REF = "worldkit://animation-set/humanoid.ground.golden@2";
const COLLIDER_PROFILE_REF =
  "worldkit://collider-profile/humanoid.medium-capsule@1";
const RIGGED_SUBJECT_DEFINITION_REF =
  "worldkit://subject-definition/humanoid.rigged-golden@2";
const G_BOT_SUBJECT_ASSET_REF =
  "worldkit://subject-asset/actor.humanoid.g-bot@2";
const G_BOT_RIG_PROFILE_REF =
  "worldkit://rig-profile/biped.mixamo-g-bot@2";
const G_BOT_ANIMATION_SET_REF =
  "worldkit://animation-set/humanoid.ground.g-bot@2";
const G_BOT_COLLIDER_PROFILE_REF =
  "worldkit://collider-profile/humanoid.g-bot-capsule@1";
const G_BOT_SUBJECT_DEFINITION_REF =
  "worldkit://subject-definition/humanoid.g-bot@2";
const G_BOT_ACTION_IDS = GROUND_HUMANOID_ACTION_IDS_V1.filter(
  (actionId) => actionId !== "jump.small.takeoff" && actionId !== "jump.small.airborne",
).sort();
const BIPED_BONE_IDS = [...BIPED_BONE_IDS_V1].sort();

function goldenAnimationSetInput(): AnimationSetManifestInputV1 {
  return {
    kind: "animation-set",
    id: "humanoid.ground.test",
    version: 1,
    resourceRef: "worldkit://animation-set/humanoid.ground.test@1",
    subjectAssetRef: SUBJECT_ASSET_REF,
    rigProfileRef: RIG_PROFILE_REF,
    defaultActionId: "idle",
    requiredActionIds: ["idle", "walk", "run", "jump"],
    animationBindings: [
      {
        actionId: "idle",
        sourceClipName: "idle",
        semanticFamily: "ground",
        automaticPresentationKeys: ["locomotion.suspended", "locomotion.idle"],
        loopMode: "repeat",
        playbackSpeedRatio: 1,
        blendDurationSeconds: 0.2,
        rootMotionMode: "in-place",
      },
      {
        actionId: "walk",
        sourceClipName: "walk",
        semanticFamily: "ground",
        automaticPresentationKeys: ["locomotion.walk"],
        loopMode: "repeat",
        playbackSpeedRatio: 1,
        blendDurationSeconds: 0.2,
        rootMotionMode: "in-place",
      },
      {
        actionId: "run",
        sourceClipName: "run",
        semanticFamily: "ground",
        automaticPresentationKeys: ["locomotion.run"],
        loopMode: "repeat",
        playbackSpeedRatio: 1,
        blendDurationSeconds: 0.15,
        rootMotionMode: "in-place",
      },
      {
        actionId: "jump",
        sourceClipName: "jump",
        semanticFamily: "airborne",
        automaticPresentationKeys: [
          "locomotion.takeoff", "locomotion.rising", "locomotion.apex",
          "locomotion.falling", "locomotion.landing",
        ],
        loopMode: "once",
        playbackSpeedRatio: 1,
        blendDurationSeconds: 0.1,
        rootMotionMode: "in-place",
      },
    ],
    aiMetadata: {
      displayName: "Test ground animations",
      description: "Test-only complete ground action mapping.",
      semanticTags: ["animation", "test"],
    },
  };
}

function registryWithPermutedNewResourceCollections(
  isReversed: boolean,
) {
  const maybeReverse = <T>(values: readonly T[]): readonly T[] =>
    isReversed ? [...values].reverse() : [...values];

  return createSubjectResourceRegistry(
    builtInSubjectResourceRegistry
      .listDiscoverableResources()
      .filter(
        (resource) =>
          resource.kind === "subject-asset" ||
          resource.kind === "rig-profile" ||
          resource.kind === "animation-set" ||
          resource.kind === "collider-profile" ||
          resource.kind === "capability" ||
          resource.kind === "physics-body-profile" ||
          resource.kind === "locomotion-profile" ||
          resource.kind === "collider-derivation-profile",
      )
      .map((resource) => {
      const { contentHash: _contentHash, ...input } = structuredClone(resource);
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

describe("subject resource registry", () => {
  it("rejects a Subject Definition without the current schemaVersion", () => {
    const currentDefinition = structuredClone(
      builtInSubjectResourceRegistry.resolveSubjectDefinition(
        G_BOT_SUBJECT_DEFINITION_REF,
      )!,
    );
    const {
      schemaVersion: _schemaVersion,
      contentHash: _contentHash,
      ...definitionWithoutVersion
    } = currentDefinition;

    expect(() => createSubjectResourceRegistry([
      definitionWithoutVersion as unknown as Parameters<
        typeof createSubjectResourceRegistry
      >[0][number],
    ])).toThrowError("SUBJECT_REGISTRY_SUBJECT_DEFINITION_VERSION_NOT_SUPPORTED");
  });

  it("exposes canonical subject-definition resource refs", () => {
    expect(
      builtInSubjectResourceRegistry
        .listDiscoverableResources({ kind: "subject-definition" })
        .map((definition) => definition.resourceRef),
    ).toEqual([
      "worldkit://subject-definition/animal.quadruped.forward-steer@1",
      "worldkit://subject-definition/animal.quadruped.forward-steer@2",
      "worldkit://subject-definition/glider.paraglider.unpowered@1",
      G_BOT_SUBJECT_DEFINITION_REF,
      "worldkit://subject-definition/humanoid.rigged-golden@2",
      "worldkit://subject-definition/humanoid.third-person@1",
      "worldkit://subject-definition/quadruped.ground-proxy@1",
      "worldkit://subject-definition/surface-craft.ice-skimmer@1",
      "worldkit://subject-definition/vehicle.four-wheel.arcade@1",
      "worldkit://subject-definition/watercraft.kayak.surface@1",
      ...XIER120_SUBJECT_DEFINITIONS
        .map((definition) => definition.resourceRef)
        .sort((left, right) => left.localeCompare(right)),
    ]);
  });

  it("shares the exact closed Subject unions across built-in definitions", () => {
    const definitions = builtInSubjectResourceRegistry.listDiscoverableResources({
      kind: "subject-definition",
    });
    const staticHumanoid = definitions.find(
      (definition) =>
        definition.resourceRef ===
        "worldkit://subject-definition/humanoid.third-person@1",
    )!;
    const staticQuadruped = definitions.find(
      (definition) =>
        definition.resourceRef ===
        "worldkit://subject-definition/quadruped.ground-proxy@1",
    )!;
    const riggedGolden =
      builtInSubjectResourceRegistry.resolveSubjectDefinition(
        RIGGED_SUBJECT_DEFINITION_REF,
      )!;

    expect(riggedGolden).toMatchObject({
      schemaVersion: 3,
      resourceRef: RIGGED_SUBJECT_DEFINITION_REF,
      profiles: {
        controlFeelProfileRef:
          "worldkit://control-feel-profile/humanoid.medium-ground@1",
        mediumProfileRef: "worldkit://medium-profile/ground-air.standard@1",
      },
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
    });
    expect(staticHumanoid).toMatchObject({
      schemaVersion: 3,
      visualBinding: { mode: "static" },
      sockets: [expect.objectContaining({ kind: "local" })],
      colliderPolicy: {
        kind: "profile",
        colliderProfileRef: COLLIDER_PROFILE_REF,
      },
      actionOrPoseSetRef: "worldkit://pose-set/static.whitebox@1",
    });
    expect(staticQuadruped).toMatchObject({
      visualBinding: { mode: "static" },
      sockets: [expect.objectContaining({ kind: "local" })],
    });
  });

  it("makes allowedOverridePaths the Definition-owned first-slice ceiling", () => {
    const definitions = builtInSubjectResourceRegistry.listDiscoverableResources({
      kind: "subject-definition",
    });
    expect(FIRST_SLICE_ALLOWED_OVERRIDE_PATHS).toEqual([
      "profiles.controlFeelProfileRef",
      "profiles.controlProfileRef",
      "profiles.motion.defaultMotionProfileRef",
    ]);
    expect(definitions.every((definition) =>
      definition.allowedOverridePaths.join(",") ===
        FIRST_SLICE_ALLOWED_OVERRIDE_PATHS.join(","),
    )).toBe(true);

    const seed = definitions[0]!;
    const { contentHash: _seedHash, ...seedInput } = seed;
    expect(sha256CanonicalJson({
      ...seedInput,
      allowedOverridePaths: [],
    })).not.toBe(seed.contentHash);

    const invalid = (allowedOverridePaths: unknown) =>
      createSubjectResourceRegistry([{
        ...seed,
        allowedOverridePaths: allowedOverridePaths as string[],
      }]);
    expect(() => invalid(undefined)).toThrowError(/SUBJECT_OVERRIDE_PATHS_INVALID/);
    expect(() => invalid([
      "profiles.motion.defaultMotionProfileRef",
      "profiles.controlFeelProfileRef",
    ])).toThrowError(/SUBJECT_OVERRIDE_PATHS_INVALID/);
    expect(() => invalid([
      "profiles.controlFeelProfileRef",
      "profiles.controlFeelProfileRef",
    ])).toThrowError(/SUBJECT_OVERRIDE_PATHS_INVALID/);
    expect(() => invalid(["profiles[0].controlFeelProfileRef"]))
      .toThrowError(/SUBJECT_OVERRIDE_PATHS_INVALID/);
    expect(() => invalid(["id"])).toThrowError(/SUBJECT_OVERRIDE_FORBIDDEN/);
  });

  it("locks every immutable manifest with a canonical content hash", () => {
    for (const resource of builtInSubjectResourceRegistry.listDiscoverableResources()) {
      const { contentHash, ...hashInput } = resource;
      expect(contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(contentHash).toBe(sha256CanonicalJson(hashInput));
      expect(Object.isFrozen(resource)).toBe(true);
      expect(Object.isFrozen(resource.aiMetadata)).toBe(true);
      expect(Object.isFrozen(resource.aiMetadata.semanticTags)).toBe(true);
    }

    const asset = builtInSubjectResourceRegistry.resolveSubjectAsset(SUBJECT_ASSET_REF);
    const rig = builtInSubjectResourceRegistry.resolveRigProfile(RIG_PROFILE_REF);
    const animationSet =
      builtInSubjectResourceRegistry.resolveAnimationSet(ANIMATION_SET_REF);
    const collider =
      builtInSubjectResourceRegistry.resolveColliderProfile(COLLIDER_PROFILE_REF);
    expect(Object.isFrozen(asset?.artifact)).toBe(true);
    expect(Object.isFrozen(asset?.inventory.animationClipNames)).toBe(true);
    expect(Object.isFrozen(rig?.sourceNodeNameByBoneId)).toBe(true);
    expect(Object.isFrozen(animationSet?.animationBindings)).toBe(true);
    expect(Object.isFrozen(animationSet?.animationBindings[0])).toBe(true);
    expect(Object.isFrozen(collider?.collider.centerOffsetFromSubjectOriginMetersXYZ)).toBe(
      true,
    );
  });

  it("lists every resource in stable resourceRef order", () => {
    const refs = builtInSubjectResourceRegistry
      .listDiscoverableResources()
      .map((resource) => resource.resourceRef);
    expect(refs).toEqual([...refs].sort((left, right) => left.localeCompare(right)));
  });

  it("canonicalizes every order-insensitive new-resource collection before hashing", () => {
    const forward = registryWithPermutedNewResourceCollections(false);
    const reversed = registryWithPermutedNewResourceCollections(true);
    const newResourceKinds = new Set([
      "subject-asset",
      "rig-profile",
      "animation-set",
      "collider-profile",
    ]);
    const forwardRows = forward.listDiscoverableResources().filter((resource) =>
      newResourceKinds.has(resource.kind));
    const reversedRows = reversed.listDiscoverableResources().filter((resource) =>
      newResourceKinds.has(resource.kind));

    expect(reversedRows).toEqual(forwardRows);
    for (const row of forwardRows) {
      const { contentHash, ...hashInput } = row;
      expect(contentHash).toBe(sha256CanonicalJson(hashInput));
    }
  });

  it("resolves exact capability and profile manifests", () => {
    expect(
      builtInSubjectResourceRegistry.resolveCapability(
        "worldkit://capability/locomotion.ground@1",
      ),
    ).toMatchObject({
      kind: "capability",
      id: "locomotion.ground",
      providedFeatures: ["ground-locomotion"],
    });
    expect(
      builtInSubjectResourceRegistry.resolvePhysicsBodyProfile(
        "worldkit://physics-body-profile/character.medium@1",
      ),
    ).toMatchObject({
      kind: "physics-body-profile",
      physicsBody: {
        mode: "character",
        massKilograms: 75,
        maxSlopeDegrees: 42,
        maxStepHeightMeters: 0.3,
      },
    });
    const locomotionProfile = builtInSubjectResourceRegistry.resolveLocomotionProfile(
      "worldkit://locomotion-profile/ground.standard@1",
    );
    expect(locomotionProfile).toMatchObject({
      kind: "locomotion-profile",
      allowWalk: true,
      allowRun: true,
      allowJump: true,
    });
    expect(locomotionProfile).not.toHaveProperty("locomotion");
    expect(
      builtInSubjectResourceRegistry.resolveControlFeelProfile(
        "worldkit://control-feel-profile/humanoid.medium-ground@1",
      ),
    ).toMatchObject({
      kind: "control-feel-profile",
      walkSpeedMetersPerSecond: 2.4,
      runSpeedMetersPerSecond: 4,
      accelerationMetersPerSecondSquared: 16,
    });
    expect(locomotionProfile?.contentHash).toBe(
      "sha256:8fa9019914d503e8813315e59cafdcbed2d750c4d9cc539e404ee741357c5cb3",
    );
    expect(
      builtInSubjectResourceRegistry.resolveColliderDerivationProfile(
        "worldkit://collider-derivation-profile/vertical-character-capsule@1",
      ),
    ).toMatchObject({
      kind: "collider-derivation-profile",
      colliderDerivation: {
        algorithm: "vertical-character-capsule",
        supportOriginToleranceMeters: 0.01,
      },
    });
    const projectionProfile = builtInSubjectResourceRegistry.resolveAiSchemaProjectionProfile(
      "worldkit://ai-schema-projection-profile/constrained-json@1",
    );
    expect(projectionProfile).toMatchObject({
      kind: "ai-schema-projection-profile",
      schemaVersion: 1,
      id: "constrained-json",
      version: 1,
      optionalFieldMode: "native-optional",
      maximumPropertyCount: 512,
      maximumNestingDepth: 8,
      maximumEnumValueCount: 32,
      maximumSchemaBytes: 65_536,
      maximumRegistrySearchResultCount: 32,
    });
    expect(projectionProfile?.authoringAvailability).toBe("recommended");
    expect(projectionProfile).not.toHaveProperty("provider");
    const { contentHash, ...hashInput } = projectionProfile!;
    expect(contentHash).toBe(sha256CanonicalJson(hashInput));
    expect(
      builtInSubjectResourceRegistry.listDiscoverableResources({
        kind: "ai-schema-projection-profile",
      }),
    ).toEqual([projectionProfile]);
    expect(() => createSubjectResourceRegistry([
      {
        ...hashInput,
        provider: "openai",
      } as never,
    ])).toThrowError(/SUBJECT_REGISTRY_UNKNOWN_FIELD/);
  });

  it("resolves the exact Golden asset binding graph", () => {
    expect(builtInSubjectResourceRegistry.resolveSubjectAsset(SUBJECT_ASSET_REF)).toMatchObject({
      kind: "subject-asset",
      id: "humanoid.golden",
      version: 2,
      resourceRef: SUBJECT_ASSET_REF,
      format: "glb",
      artifact: {
        mediaType: "model/gltf-binary",
        byteLength: 48_060,
        contentHash:
          "sha256:6cf29a2c9c024bdc108a8a436255abbb5f370d658d78cca0afb30f4872cd25a8",
      },
      coordinateConvention: {
        forwardAxis: "-Z",
        upAxis: "+Y",
        metersPerUnit: 1,
        pivot: "support-center",
      },
      bounds: {
        minimumMetersXYZ: [-0.39, 0, -0.16999999999999998],
        maximumMetersXYZ: [0.39, 1.94, 0.16],
      },
      inventory: {
        meshCount: 1,
        vertexCount: 360,
        triangleCount: 180,
        skeletonCount: 1,
        boneCount: 18,
        animationClipNames: ["idle", "jump", "run", "walk"],
      },
      provenance: {
        licenseSpdxId: "LicenseRef-Project-Owned",
        redistributionPolicy: "allowed",
        author: "Agent Whitebox World SDK",
      },
    });

    expect(builtInSubjectResourceRegistry.resolveRigProfile(RIG_PROFILE_REF)).toMatchObject({
      kind: "rig-profile",
      id: "biped.golden",
      version: 2,
      resourceRef: RIG_PROFILE_REF,
      bodyTopology: "biped",
      compatibleSubjectAssetRefs: [SUBJECT_ASSET_REF],
      skeletonRootBoneName: "root",
      requiredBoneIds: BIPED_BONE_IDS,
      sourceNodeNameByBoneId: Object.fromEntries(BIPED_BONE_IDS.map((id) => [id, id])),
      aiMetadata: {
        displayName: "Golden biped rig",
        description:
          "Canonical 17-bone anatomical mapping with an independent Skeleton root for the project-owned Golden humanoid fixture.",
      },
    });

    expect(
      builtInSubjectResourceRegistry.resolveAnimationSet(ANIMATION_SET_REF),
    ).toMatchObject({
      kind: "animation-set",
      id: "humanoid.ground.golden",
      version: 2,
      resourceRef: ANIMATION_SET_REF,
      subjectAssetRef: SUBJECT_ASSET_REF,
      rigProfileRef: RIG_PROFILE_REF,
      defaultActionId: "idle",
      requiredActionIds: ["idle", "jump", "run", "walk"],
      animationBindings: [
        {
          actionId: "idle",
          sourceClipName: "idle",
          loopMode: "repeat",
          playbackSpeedRatio: 1,
          blendDurationSeconds: 0.2,
          rootMotionMode: "in-place",
        },
        {
          actionId: "jump",
          sourceClipName: "jump",
          loopMode: "once",
          playbackSpeedRatio: 1,
          blendDurationSeconds: 0.1,
          rootMotionMode: "in-place",
        },
        {
          actionId: "run",
          sourceClipName: "run",
          loopMode: "repeat",
          playbackSpeedRatio: 1,
          blendDurationSeconds: 0.15,
          rootMotionMode: "in-place",
        },
        {
          actionId: "walk",
          sourceClipName: "walk",
          loopMode: "repeat",
          playbackSpeedRatio: 1,
          blendDurationSeconds: 0.2,
          rootMotionMode: "in-place",
        },
      ],
    });

    expect(
      builtInSubjectResourceRegistry.resolveColliderProfile(COLLIDER_PROFILE_REF),
    ).toMatchObject({
      kind: "collider-profile",
      id: "humanoid.medium-capsule",
      version: 1,
      resourceRef: COLLIDER_PROFILE_REF,
      supportedBodyTopologies: ["biped"],
      collider: {
        kind: "capsule",
        radiusMeters: 0.32,
        heightMeters: 1.92,
        centerOffsetFromSubjectOriginMetersXYZ: [0, 0.96, 0],
      },
    });
  });

  it("resolves the exact G Bot product asset binding graph", () => {
    expect(
      builtInSubjectResourceRegistry.resolveSubjectAsset(G_BOT_SUBJECT_ASSET_REF),
    ).toMatchObject({
      kind: "subject-asset",
      id: "actor.humanoid.g-bot",
      version: 2,
      resourceRef: G_BOT_SUBJECT_ASSET_REF,
      artifact: {
        mediaType: "model/gltf-binary",
        byteLength: 6_743_072,
        contentHash:
          "sha256:4bcf3fabdba1e083ef54bf172fd962ca740e0f2fabdb9cddaae45d5ea208718f",
      },
      bounds: {
        minimumMetersXYZ: [-0.9025661945343018, -0.0003511549439281225, -0.14895710349082947],
        maximumMetersXYZ: [0.9025658369064331, 1.8088831901550293, 0.17174167931079865],
      },
      inventory: {
        meshCount: 2,
        vertexCount: 28_374,
        triangleCount: 49_112,
        skeletonCount: 1,
        boneCount: 65,
        animationClipNames: [
          "dance.rumba",
          "emote.angry",
          "emote.salute",
          "fall",
          "fight.enter",
          "float",
          "fly",
          "idle",
          "idle.gaming",
          "jump",
          "land.hard",
          "land.hard.alt",
          "lay.idle",
          "roll.toRun",
          "run",
          "sit",
          "sit.ground.idle",
          "sit.idle",
          "sit.toStand",
          "stand",
          "swim.exit",
          "swim.surface",
          "swim.tread",
          "walk",
          "walk.step",
        ],
      },
      provenance: {
        licenseSpdxId: "LicenseRef-Loopit-Company-Private",
        redistributionPolicy: "internal-only",
        author: "Loopit asset team",
      },
    });

    expect(
      builtInSubjectResourceRegistry.resolveRigProfile(G_BOT_RIG_PROFILE_REF),
    ).toMatchObject({
      kind: "rig-profile",
      id: "biped.mixamo-g-bot",
      compatibleSubjectAssetRefs: [G_BOT_SUBJECT_ASSET_REF],
      skeletonRootBoneName: "mixamorig:Hips",
      requiredBoneIds: BIPED_BONE_IDS,
      sourceNodeNameByBoneId: {
        hips: "mixamorig:Hips",
        spine: "mixamorig:Spine",
        chest: "mixamorig:Spine2",
        neck: "mixamorig:Neck",
        head: "mixamorig:Head",
        "upper-arm.left": "mixamorig:LeftArm",
        "lower-arm.left": "mixamorig:LeftForeArm",
        "hand.left": "mixamorig:LeftHand",
        "upper-arm.right": "mixamorig:RightArm",
        "lower-arm.right": "mixamorig:RightForeArm",
        "hand.right": "mixamorig:RightHand",
        "upper-leg.left": "mixamorig:LeftUpLeg",
        "lower-leg.left": "mixamorig:LeftLeg",
        "foot.left": "mixamorig:LeftFoot",
        "upper-leg.right": "mixamorig:RightUpLeg",
        "lower-leg.right": "mixamorig:RightLeg",
        "foot.right": "mixamorig:RightFoot",
      },
    });

    expect(
      builtInSubjectResourceRegistry.resolveAnimationSet(G_BOT_ANIMATION_SET_REF),
    ).toMatchObject({
      subjectAssetRef: G_BOT_SUBJECT_ASSET_REF,
      rigProfileRef: G_BOT_RIG_PROFILE_REF,
      defaultActionId: "idle",
      requiredActionIds: G_BOT_ACTION_IDS,
    });
    expect(
      builtInSubjectResourceRegistry
        .resolveAnimationSet(G_BOT_ANIMATION_SET_REF)
        ?.animationBindings.map((binding) => binding.actionId),
    ).toEqual(G_BOT_ACTION_IDS);
    expect(
      builtInSubjectResourceRegistry
        .resolveAnimationSet(G_BOT_ANIMATION_SET_REF)
        ?.animationBindings.map((binding) => ({
          actionId: binding.actionId,
          semanticFamily: binding.semanticFamily,
          automaticPresentationKeys: binding.automaticPresentationKeys,
        })),
    ).toEqual([
      { actionId: "dance.rumba", semanticFamily: "dance", automaticPresentationKeys: [] },
      { actionId: "emote.angry", semanticFamily: "emote", automaticPresentationKeys: [] },
      { actionId: "emote.salute", semanticFamily: "emote", automaticPresentationKeys: [] },
      { actionId: "fall", semanticFamily: "airborne", automaticPresentationKeys: [] },
      { actionId: "fight.enter", semanticFamily: "combat", automaticPresentationKeys: [] },
      { actionId: "float", semanticFamily: "flight", automaticPresentationKeys: [] },
      { actionId: "fly", semanticFamily: "flight", automaticPresentationKeys: [] },
      { actionId: "idle", semanticFamily: "ground", automaticPresentationKeys: ["locomotion.idle", "locomotion.suspended"] },
      { actionId: "idle.gaming", semanticFamily: "posture", automaticPresentationKeys: [] },
      { actionId: "jump", semanticFamily: "airborne", automaticPresentationKeys: ["locomotion.apex", "locomotion.falling", "locomotion.landing", "locomotion.rising", "locomotion.takeoff"] },
      { actionId: "land.hard", semanticFamily: "airborne", automaticPresentationKeys: [] },
      { actionId: "land.hard.alt", semanticFamily: "airborne", automaticPresentationKeys: [] },
      { actionId: "lay.idle", semanticFamily: "posture", automaticPresentationKeys: [] },
      { actionId: "roll.toRun", semanticFamily: "ground", automaticPresentationKeys: [] },
      { actionId: "run", semanticFamily: "ground", automaticPresentationKeys: ["locomotion.run"] },
      { actionId: "sit", semanticFamily: "posture", automaticPresentationKeys: [] },
      { actionId: "sit.ground.idle", semanticFamily: "posture", automaticPresentationKeys: [] },
      { actionId: "sit.idle", semanticFamily: "posture", automaticPresentationKeys: [] },
      { actionId: "sit.toStand", semanticFamily: "posture", automaticPresentationKeys: [] },
      { actionId: "stand", semanticFamily: "posture", automaticPresentationKeys: [] },
      { actionId: "swim.exit", semanticFamily: "water", automaticPresentationKeys: [] },
      { actionId: "swim.surface", semanticFamily: "water", automaticPresentationKeys: [] },
      { actionId: "swim.tread", semanticFamily: "water", automaticPresentationKeys: [] },
      { actionId: "walk", semanticFamily: "ground", automaticPresentationKeys: ["locomotion.walk"] },
      { actionId: "walk.step", semanticFamily: "ground", automaticPresentationKeys: [] },
    ]);

    expect(
      builtInSubjectResourceRegistry.resolveColliderProfile(
        G_BOT_COLLIDER_PROFILE_REF,
      ),
    ).toMatchObject({
      collider: {
        kind: "capsule",
        radiusMeters: 0.35,
        heightMeters: 1.8,
        centerOffsetFromSubjectOriginMetersXYZ: [0, 0.9, 0],
      },
    });

    expect(
      builtInSubjectResourceRegistry.resolveSubjectDefinition(
        G_BOT_SUBJECT_DEFINITION_REF,
      ),
    ).toMatchObject({
      visualParts: [
        expect.objectContaining({
          kind: "asset",
          subjectAssetRef: G_BOT_SUBJECT_ASSET_REF,
        }),
      ],
      visualBinding: {
        mode: "rigged",
        rigProfileRef: G_BOT_RIG_PROFILE_REF,
        animationSetRef: G_BOT_ANIMATION_SET_REF,
      },
      colliderPolicy: {
        kind: "profile",
        colliderProfileRef: G_BOT_COLLIDER_PROFILE_REF,
      },
    });
  });

  it("discovers one canonical V3 G Bot definition with the complete socket contract", () => {
    const discoveredDefinitions = builtInSubjectResourceRegistry
      .listDiscoverableResources({ kind: "subject-definition" })
      .filter((definition) => definition.resourceRef.includes("humanoid.g-bot"));
    const resolvedDefinition = builtInSubjectResourceRegistry.resolveSubjectDefinition(
      G_BOT_SUBJECT_DEFINITION_REF,
    );

    expect(discoveredDefinitions.map((definition) => definition.resourceRef)).toEqual([
      G_BOT_SUBJECT_DEFINITION_REF,
    ]);
    expect(discoveredDefinitions[0]?.contentHash).toBe(resolvedDefinition?.contentHash);
    expect(resolvedDefinition).toMatchObject({
      schemaVersion: 3,
      resourceRef: G_BOT_SUBJECT_DEFINITION_REF,
      profiles: {
        controlProfileRef:
          "worldkit://control-profile/planar.camera-relative@1",
      },
    });

    const socketIds = resolvedDefinition?.sockets.map((socket) => socket.id).sort();
    expect(socketIds).toEqual([
      "CameraTarget3D",
      "FirstPersonView",
      "FootAlignment",
      "LookAhead",
      "SeatAlignment",
      "ThirdPersonTarget",
      "hand.right",
    ]);
    expect(new Set(socketIds).size).toBe(7);
  });

  it("locks the exact canonical hashes for every G Bot binding resource", () => {
    const resources = [
      builtInSubjectResourceRegistry.resolveSubjectAsset(G_BOT_SUBJECT_ASSET_REF),
      builtInSubjectResourceRegistry.resolveRigProfile(G_BOT_RIG_PROFILE_REF),
      builtInSubjectResourceRegistry.resolveAnimationSet(G_BOT_ANIMATION_SET_REF),
      builtInSubjectResourceRegistry.resolveColliderProfile(
        G_BOT_COLLIDER_PROFILE_REF,
      ),
      builtInSubjectResourceRegistry.resolveSubjectDefinition(
        G_BOT_SUBJECT_DEFINITION_REF,
      ),
    ];

    expect(
      resources.map((resource) => ({
        resourceRef: resource?.resourceRef,
        contentHash: resource?.contentHash,
      })),
    ).toEqual([
      {
        resourceRef: G_BOT_SUBJECT_ASSET_REF,
        contentHash:
          "sha256:23aae2c10473825c773712e1ce3ce7191580e05ed56601edec096b6075fc1c1d",
      },
      {
        resourceRef: G_BOT_RIG_PROFILE_REF,
        contentHash:
          "sha256:b64799dcb7eb6ec10a70b871516cd048963cc0b0536b71f1a0862812be0fa483",
      },
      {
        resourceRef: G_BOT_ANIMATION_SET_REF,
        contentHash:
          "sha256:bb70277c009d3a73ae64d9abe24a7b289b8613ebf6bbd87e11a10d2d820e41e2",
      },
      {
        resourceRef: G_BOT_COLLIDER_PROFILE_REF,
        contentHash:
          "sha256:229d120df97e2ffeb41f6884c47e83742a1848f5fcc056068e5c0d88fb228140",
      },
      {
        resourceRef: G_BOT_SUBJECT_DEFINITION_REF,
        contentHash:
          "sha256:0428f0bf18495ff665715e4c4007e86192735bcfeb9d38d4c6d765f5501335fd",
      },
    ]);
  });

  it("rejects non-exact Golden refs", () => {
    const cases = [
      {
        exactRef: SUBJECT_ASSET_REF,
        resolve: (resourceRef: string) =>
          builtInSubjectResourceRegistry.resolveSubjectAsset(resourceRef),
      },
      {
        exactRef: RIG_PROFILE_REF,
        resolve: (resourceRef: string) =>
          builtInSubjectResourceRegistry.resolveRigProfile(resourceRef),
      },
      {
        exactRef: ANIMATION_SET_REF,
        resolve: (resourceRef: string) =>
          builtInSubjectResourceRegistry.resolveAnimationSet(resourceRef),
      },
      {
        exactRef: COLLIDER_PROFILE_REF,
        resolve: (resourceRef: string) =>
          builtInSubjectResourceRegistry.resolveColliderProfile(resourceRef),
      },
    ];

    for (const { exactRef, resolve } of cases) {
      expect(resolve(exactRef)).toBeDefined();
      expect(resolve(exactRef.replace(/@\d+$/, "@latest"))).toBeUndefined();
      expect(resolve(exactRef.replace(/@\d+$/, ""))).toBeUndefined();
      expect(resolve(exactRef.replace(/^worldkit:/, "whitebox:"))).toBeUndefined();
    }
  });

  it("does not resolve aliases, unversioned refs, or old Kit refs", () => {
    expect(
      builtInSubjectResourceRegistry.resolveSubjectDefinition(
        "worldkit://subject-definition/humanoid.third-person@latest",
      ),
    ).toBeUndefined();
    expect(
      builtInSubjectResourceRegistry.resolveSubjectDefinition(
        "worldkit://subject-definition/humanoid.third-person",
      ),
    ).toBeUndefined();
    expect(
      builtInSubjectResourceRegistry.resolveSubjectDefinition(
        "worldkit://kit/humanoid.third-person@1",
      ),
    ).toBeUndefined();
  });

  it("rejects a duplicate resourceRef even when resource kinds differ", () => {
    const definition = builtInSubjectResourceRegistry
      .listDiscoverableResources({ kind: "subject-definition" })[0];
    const capability = builtInSubjectResourceRegistry.resolveCapability(
      "worldkit://capability/locomotion.ground@1",
    );
    expect(definition).toBeDefined();
    expect(capability).toBeDefined();

    expect(() =>
      createSubjectResourceRegistry([
        definition!,
        { ...capability!, resourceRef: definition!.resourceRef },
      ]),
    ).toThrowError(/SUBJECT_REGISTRY_DUPLICATE_REF/);
  });

  it("rejects duplicate required Action IDs", () => {
    const animationSet = goldenAnimationSetInput();
    expect(() =>
      createSubjectResourceRegistry([
        { ...animationSet, requiredActionIds: ["idle", "walk", "run", "idle"] },
      ]),
    ).toThrowError(/SUBJECT_REGISTRY_DUPLICATE_ACTION_ID/);
  });

  it("rejects duplicate Animation Binding Action IDs", () => {
    const animationSet = goldenAnimationSetInput();
    expect(() =>
      createSubjectResourceRegistry([
        {
          ...animationSet,
          animationBindings: [
            ...animationSet.animationBindings,
            { ...animationSet.animationBindings[0]! },
          ],
        },
      ]),
    ).toThrowError(/SUBJECT_REGISTRY_DUPLICATE_ACTION_ID/);
  });

  it("rejects duplicate source Clip mappings", () => {
    const animationSet = goldenAnimationSetInput();
    expect(() =>
      createSubjectResourceRegistry([
        {
          ...animationSet,
          animationBindings: animationSet.animationBindings.map((binding) =>
            binding.actionId === "walk" ? { ...binding, sourceClipName: "idle" } : binding,
          ),
        },
      ]),
    ).toThrowError(/SUBJECT_REGISTRY_DUPLICATE_CLIP_MAPPING/);
  });

  it("rejects duplicate Subject Asset inventory Clip names before canonical ordering", () => {
    const asset = builtInSubjectResourceRegistry.resolveSubjectAsset(SUBJECT_ASSET_REF)!;

    expect(() => createSubjectResourceRegistry([
      {
        ...asset,
        inventory: {
          ...asset.inventory,
          animationClipNames: [
            ...asset.inventory.animationClipNames,
            asset.inventory.animationClipNames[0]!,
          ],
        },
      },
    ])).toThrowError(/SUBJECT_REGISTRY_DUPLICATE_CLIP_NAME/);
  });

  it.each([
    "subject-asset",
    "rig-profile",
    "animation-set",
    "collider-profile",
  ] as const)(
    "rejects duplicate %s semantic tags before canonical ordering",
    (resourceKind) => {
      const resource = builtInSubjectResourceRegistry
        .listDiscoverableResources({ kind: resourceKind })[0]!;

      expect(() => createSubjectResourceRegistry([
        {
          ...resource,
          aiMetadata: {
            ...resource.aiMetadata,
            semanticTags: [
              ...resource.aiMetadata.semanticTags,
              resource.aiMetadata.semanticTags[0]!,
            ],
          },
        },
      ])).toThrowError(/SUBJECT_REGISTRY_DUPLICATE_SEMANTIC_TAG/);
    },
  );

  it("rejects duplicate Rig Bone IDs before canonical ordering", () => {
    const rig = builtInSubjectResourceRegistry.resolveRigProfile(RIG_PROFILE_REF)!;

    expect(() => createSubjectResourceRegistry([
      {
        ...rig,
        requiredBoneIds: [...rig.requiredBoneIds, rig.requiredBoneIds[0]!],
      },
    ])).toThrowError(/SUBJECT_REGISTRY_DUPLICATE_BONE_ID/);
  });

  it("rejects duplicate Rig compatible refs before canonical ordering", () => {
    const rig = builtInSubjectResourceRegistry.resolveRigProfile(RIG_PROFILE_REF)!;

    expect(() => createSubjectResourceRegistry([
      {
        ...rig,
        compatibleSubjectAssetRefs: [
          ...rig.compatibleSubjectAssetRefs,
          rig.compatibleSubjectAssetRefs[0]!,
        ],
      },
    ])).toThrowError(/SUBJECT_REGISTRY_DUPLICATE_COMPATIBLE_REF/);
  });

  it("rejects duplicate Collider body topologies before canonical ordering", () => {
    const collider = builtInSubjectResourceRegistry.resolveColliderProfile(
      COLLIDER_PROFILE_REF,
    )!;

    expect(() => createSubjectResourceRegistry([
      {
        ...collider,
        supportedBodyTopologies: [
          ...collider.supportedBodyTopologies,
          collider.supportedBodyTopologies[0]!,
        ],
      },
    ])).toThrowError(/SUBJECT_REGISTRY_DUPLICATE_BODY_TOPOLOGY/);
  });

  it("rejects non-finite or out-of-range Control Profile tuning", () => {
    const control = builtInSubjectResourceRegistry
      .listDiscoverableResources({ kind: "control-profile" })[0];
    expect(control).toBeDefined();

    expect(() => createSubjectResourceRegistry([{
      ...control!,
      moveDeadzoneRatio: Number.NaN,
    }])).toThrowError(/SUBJECT_REGISTRY_INVALID_CONTROL_INPUT_TUNING/);
    expect(() => createSubjectResourceRegistry([{
      ...control!,
      moveDeadzoneRatio: 0.5,
    }])).toThrowError(/SUBJECT_REGISTRY_INVALID_CONTROL_INPUT_TUNING/);
  });

  it("rejects Control Profile policies that its command runtime cannot execute", () => {
    const planar = builtInSubjectResourceRegistry
      .listDiscoverableResources({ kind: "control-profile" })
      .find((resource) => resource.resourceRef ===
        "worldkit://control-profile/planar.camera-relative@1")!;

    expect(() => createSubjectResourceRegistry([{
      ...planar,
      inputSpace: "subject-local",
    }])).toThrow("SUBJECT_REGISTRY_INVALID_CONTROL_PROFILE_COMBINATION");
    expect(() => createSubjectResourceRegistry([{
      ...planar,
      facingPolicy: "fixed",
    }])).toThrowError(/SUBJECT_REGISTRY_INVALID_CONTROL_PROFILE_COMBINATION/);
  });

  it("rejects non-finite or internally inconsistent Camera Profile parameters", () => {
    const camera = builtInSubjectResourceRegistry
      .listDiscoverableResources({ kind: "camera-rig-profile" })[0];
    expect(camera).toBeDefined();

    expect(() => createSubjectResourceRegistry([{
      ...camera!,
      parameters: { ...camera!.parameters, yawDampingPerSecond: Number.POSITIVE_INFINITY },
    }])).toThrowError(/SUBJECT_REGISTRY_INVALID_CAMERA_PARAMETERS/);
    expect(() => createSubjectResourceRegistry([{
      ...camera!,
      parameters: {
        ...camera!.parameters,
        minimumDistanceMeters: camera!.parameters.maximumDistanceMeters + 1,
      },
    }])).toThrowError(/SUBJECT_REGISTRY_INVALID_CAMERA_PARAMETERS/);
    expect(() => createSubjectResourceRegistry([{
      ...camera!,
      parameters: {
        ...camera!.parameters,
        baseFovDegrees: 170,
        maximumSpeedFovDegrees: 20,
      },
    }])).toThrowError(/SUBJECT_REGISTRY_INVALID_CAMERA_PARAMETERS/);
  });

  it("rejects Camera Profiles with missing or unknown parameter fields", () => {
    const camera = builtInSubjectResourceRegistry
      .listDiscoverableResources({ kind: "camera-rig-profile" })[0]!;
    const { yawDampingPerSecond: _missing, ...missingParameters } = camera.parameters;

    expect(() => createSubjectResourceRegistry([{
      ...camera,
      parameters: missingParameters as typeof camera.parameters,
    }])).toThrowError(/SUBJECT_REGISTRY_MISSING_CAMERA_PARAMETER/);
    expect(() => createSubjectResourceRegistry([{
      ...camera,
      parameters: {
        ...camera.parameters,
        inventedCameraKnob: 1,
      } as typeof camera.parameters,
    }])).toThrowError(/SUBJECT_REGISTRY_UNKNOWN_CAMERA_PARAMETER/);
  });

  it("rejects unknown Camera Modifier parameters", () => {
    const modifier = builtInSubjectResourceRegistry
      .listDiscoverableResources({ kind: "camera-modifier-profile" })[0]!;

    expect(() => createSubjectResourceRegistry([{
      ...modifier,
      parameterOverrides: {
        inventedCameraKnob: 1,
      } as typeof modifier.parameterOverrides,
    }])).toThrowError(/SUBJECT_REGISTRY_UNKNOWN_CAMERA_PARAMETER/);
  });

  it("rejects Camera Profile mode/algorithm mismatches and reserved algorithms", () => {
    const profile = builtInSubjectResourceRegistry.resolveCameraRigProfile(
      "worldkit://camera-profile/orbit.medium@1",
    )!;
    const algorithm = builtInSubjectResourceRegistry.resolveCameraRigAlgorithm(
      profile.algorithmRef,
    )!;

    expect(() => createSubjectResourceRegistry([
      algorithm,
      { ...profile, baseMode: "first-person" },
    ])).toThrowError(/SUBJECT_REGISTRY_CAMERA_MODE_ALGORITHM_MISMATCH/);
    expect(() => createSubjectResourceRegistry([
      { ...algorithm, runtimeStatus: "reserved" },
      profile,
    ])).toThrowError(/SUBJECT_REGISTRY_RESERVED_CAMERA_ALGORITHM/);
  });

  it("rejects finite Camera Modifiers that violate camera parameter invariants", () => {
    const modifier = builtInSubjectResourceRegistry
      .listDiscoverableResources({ kind: "camera-modifier-profile" })[0];
    expect(modifier).toBeDefined();

    expect(() => createSubjectResourceRegistry([{
      ...modifier!,
      parameterOverrides: {
        ...modifier!.parameterOverrides,
        baseFovDegrees: 200,
      },
    }])).toThrowError(/SUBJECT_REGISTRY_INVALID_CAMERA_MODIFIER_PARAMETERS/);
  });

  it("rejects a Camera Modifier that makes its Context base profile inconsistent", () => {
    const context = builtInSubjectResourceRegistry.resolveCameraContextProfile(
      "worldkit://camera-context/capability-driven.default@1",
    )!;
    const baseProfile = builtInSubjectResourceRegistry.resolveCameraRigProfile(
      context.defaultCameraRigProfileRef,
    )!;
    const algorithm = builtInSubjectResourceRegistry.resolveCameraRigAlgorithm(
      baseProfile.algorithmRef,
    )!;
    const modifier = builtInSubjectResourceRegistry.resolveCameraModifierProfile(
      "worldkit://camera-modifier/mounted-framing@1",
    )!;
    const resources = [
      algorithm,
      baseProfile,
      {
        ...modifier,
        parameterOverrides: { minimumDistanceMeters: 21 },
      },
      {
        kind: context.kind,
        id: context.id,
        version: context.version,
        resourceRef: context.resourceRef,
        authoringAvailability: context.authoringAvailability,
        defaultCameraRigProfileRef: context.defaultCameraRigProfileRef,
        rules: [{
          id: "invalid-composition",
          priority: 1,
          when: {},
          cameraModifierRefs: [modifier.resourceRef],
        }],
        aiMetadata: context.aiMetadata,
      },
    ];

    expect(() => createSubjectResourceRegistry(resources)).toThrowError(
      /SUBJECT_REGISTRY_INVALID_CAMERA_CONTEXT_PARAMETERS/,
    );
  });

  it("ignores third-person-only Context Modifier fields for a first-person base", () => {
    const context = builtInSubjectResourceRegistry.resolveCameraContextProfile(
      "worldkit://camera-context/capability-driven.default@1",
    )!;
    const defaultProfile = builtInSubjectResourceRegistry.resolveCameraRigProfile(
      context.defaultCameraRigProfileRef,
    )!;
    const firstPersonProfile = builtInSubjectResourceRegistry.resolveCameraRigProfile(
      context.firstPersonCameraRigProfileRef!,
    )!;
    const algorithms = [defaultProfile, firstPersonProfile].map((profile) =>
      builtInSubjectResourceRegistry.resolveCameraRigAlgorithm(profile.algorithmRef)!
    );
    const modifier = builtInSubjectResourceRegistry.resolveCameraModifierProfile(
      "worldkit://camera-modifier/mounted-framing@1",
    )!;
    const zeroDistanceFirstPersonProfile = {
      ...firstPersonProfile,
      parameters: {
        ...firstPersonProfile.parameters,
        maximumDistanceMeters: 0,
      },
    };

    expect(() => createSubjectResourceRegistry([
      ...algorithms,
      defaultProfile,
      zeroDistanceFirstPersonProfile,
      modifier,
      {
        kind: context.kind,
        id: context.id,
        version: context.version,
        resourceRef: context.resourceRef,
        authoringAvailability: context.authoringAvailability,
        defaultCameraRigProfileRef: defaultProfile.resourceRef,
        firstPersonCameraRigProfileRef: firstPersonProfile.resourceRef,
        rules: [{
          id: "mounted",
          priority: 1,
          when: {},
          cameraModifierRefs: [modifier.resourceRef],
        }],
        aiMetadata: context.aiMetadata,
      },
    ])).not.toThrow();
  });

  it("rejects two independently valid Context Modifiers whose composition is invalid", () => {
    const context = builtInSubjectResourceRegistry.resolveCameraContextProfile(
      "worldkit://camera-context/capability-driven.default@1",
    )!;
    const baseProfile = builtInSubjectResourceRegistry.resolveCameraRigProfile(
      context.defaultCameraRigProfileRef,
    )!;
    const algorithm = builtInSubjectResourceRegistry.resolveCameraRigAlgorithm(
      baseProfile.algorithmRef,
    )!;
    const modifierTemplate = builtInSubjectResourceRegistry.resolveCameraModifierProfile(
      "worldkit://camera-modifier/mounted-framing@1",
    )!;
    const distanceModifier = {
      ...modifierTemplate,
      id: "test-distance",
      resourceRef: "worldkit://camera-modifier/test-distance@1",
      parameterOverrides: { distanceMeters: 18 },
    };
    const maximumModifier = {
      ...modifierTemplate,
      id: "test-maximum",
      resourceRef: "worldkit://camera-modifier/test-maximum@1",
      parameterOverrides: { maximumDistanceMeters: 10 },
    };

    expect(() => createSubjectResourceRegistry([
      algorithm,
      baseProfile,
      distanceModifier,
      maximumModifier,
      {
        kind: context.kind,
        id: context.id,
        version: context.version,
        resourceRef: context.resourceRef,
        authoringAvailability: context.authoringAvailability,
        defaultCameraRigProfileRef: baseProfile.resourceRef,
        rules: [
          {
            id: "distance",
            priority: 2,
            when: {},
            cameraModifierRefs: [distanceModifier.resourceRef],
          },
          {
            id: "maximum",
            priority: 1,
            when: {},
            cameraModifierRefs: [maximumModifier.resourceRef],
          },
        ],
        aiMetadata: context.aiMetadata,
      },
    ])).toThrowError(/SUBJECT_REGISTRY_INVALID_CAMERA_CONTEXT_PARAMETERS/);
  });
});
