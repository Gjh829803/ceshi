import { describe, expect, it } from "vitest";

import { sha256CanonicalJson } from "@whitebox-world/protocol";

import {
  builtInSubjectResourceRegistry,
  createSubjectResourceRegistry,
} from "./index";
import type {
  AnimationSetManifestInputV1,
} from "./index";

const SUBJECT_ASSET_REF = "worldkit://subject-asset/humanoid.golden@1";
const RIG_PROFILE_REF = "worldkit://rig-profile/biped.golden@1";
const ANIMATION_SET_REF = "worldkit://animation-set/humanoid.ground.golden@1";
const COLLIDER_PROFILE_REF =
  "worldkit://collider-profile/humanoid.medium-capsule@1";
const RIGGED_SUBJECT_DEFINITION_REF =
  "worldkit://subject-definition/humanoid.rigged-golden@1";
const G_BOT_SUBJECT_ASSET_REF =
  "worldkit://subject-asset/actor.humanoid.g-bot@1";
const G_BOT_RIG_PROFILE_REF =
  "worldkit://rig-profile/biped.mixamo-g-bot@1";
const G_BOT_ANIMATION_SET_REF =
  "worldkit://animation-set/humanoid.ground.g-bot@1";
const G_BOT_COLLIDER_PROFILE_REF =
  "worldkit://collider-profile/humanoid.g-bot-capsule@1";
const G_BOT_SUBJECT_DEFINITION_REF =
  "worldkit://subject-definition/humanoid.g-bot@1";

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
        loopMode: "repeat",
        playbackSpeedRatio: 1,
        blendDurationSeconds: 0.2,
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
      {
        actionId: "run",
        sourceClipName: "run",
        loopMode: "repeat",
        playbackSpeedRatio: 1,
        blendDurationSeconds: 0.15,
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

describe("subject resource registry", () => {
  it("exposes canonical subject-definition resource refs", () => {
    expect(
      builtInSubjectResourceRegistry
        .listSubjectDefinitions()
        .map((definition) => definition.resourceRef),
    ).toEqual([
      G_BOT_SUBJECT_DEFINITION_REF,
      RIGGED_SUBJECT_DEFINITION_REF,
      "worldkit://subject-definition/humanoid.third-person@1",
      "worldkit://subject-definition/quadruped.ground-proxy@1",
    ]);
  });

  it("shares the exact closed Subject unions across built-in definitions", () => {
    const definitions = builtInSubjectResourceRegistry.listSubjectDefinitions();
    const rigged = definitions.find(
      (definition) => definition.resourceRef === RIGGED_SUBJECT_DEFINITION_REF,
    )!;
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

    expect(rigged).toMatchObject({
      resourceRef: RIGGED_SUBJECT_DEFINITION_REF,
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
      visualBinding: { mode: "static" },
      sockets: [expect.objectContaining({ kind: "local" })],
    });
    expect(staticQuadruped).toMatchObject({
      visualBinding: { mode: "static" },
      sockets: [expect.objectContaining({ kind: "local" })],
    });
  });

  it("locks every immutable manifest with a canonical content hash", () => {
    for (const resource of builtInSubjectResourceRegistry.listResources()) {
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
      .listResources()
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
    const forwardRows = forward.listResources().filter((resource) =>
      newResourceKinds.has(resource.kind));
    const reversedRows = reversed.listResources().filter((resource) =>
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
      locomotion: {
        mode: "ground",
        walkSpeedMetersPerSecond: 2.4,
        runSpeedMetersPerSecond: 4,
        waterSpeedMetersPerSecond: 2.2,
        jumpSpeedMetersPerSecond: 5.5,
      },
    });
    expect(locomotionProfile?.contentHash).toBe(
      "sha256:a8d223d132e45027e5156f6857f9833b5ba89bdcd7408bea1cec7cf6ba47ac11",
    );
    expect(locomotionProfile?.locomotion).not.toHaveProperty(
      "groundSpeedMetersPerSecond",
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
  });

  it("resolves the exact Golden asset binding graph", () => {
    expect(builtInSubjectResourceRegistry.resolveSubjectAsset(SUBJECT_ASSET_REF)).toMatchObject({
      kind: "subject-asset",
      id: "humanoid.golden",
      version: 1,
      resourceRef: SUBJECT_ASSET_REF,
      format: "glb",
      artifact: {
        mediaType: "model/gltf-binary",
        byteLength: 43_656,
        contentHash:
          "sha256:1095fd65c754d53e6db3757ab5e1c9e5e9dcea2581f85d40f37ea4890ee8c2c2",
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
      version: 1,
      resourceRef: RIG_PROFILE_REF,
      bodyTopology: "biped",
      compatibleSubjectAssetRefs: [SUBJECT_ASSET_REF],
      skeletonRootBoneName: "root",
      requiredBoneIds: BIPED_BONE_IDS,
      sourceNodeNameByBoneId: Object.fromEntries(BIPED_BONE_IDS.map((id) => [id, id])),
    });

    expect(
      builtInSubjectResourceRegistry.resolveAnimationSet(ANIMATION_SET_REF),
    ).toMatchObject({
      kind: "animation-set",
      id: "humanoid.ground.golden",
      version: 1,
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
      version: 1,
      resourceRef: G_BOT_SUBJECT_ASSET_REF,
      artifact: {
        mediaType: "model/gltf-binary",
        byteLength: 5_302_160,
        contentHash:
          "sha256:41833210e735788da0777fc37badcec03f90ccf17ab5a7d89103f0727abeeb1b",
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
        licenseSpdxId: "LicenseRef-Company-Private",
        redistributionPolicy: "internal-only",
        author: "G Golden asset owner",
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
      requiredActionIds: ["idle", "jump", "run", "walk"],
      animationBindings: [
        expect.objectContaining({ actionId: "idle", sourceClipName: "idle" }),
        expect.objectContaining({ actionId: "jump", sourceClipName: "jump" }),
        expect.objectContaining({ actionId: "run", sourceClipName: "run" }),
        expect.objectContaining({ actionId: "walk", sourceClipName: "walk" }),
      ],
    });

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
          "sha256:ab59e67e2ff74448cad2a0b520524d019d7a78b02c8335f82428842b0f0fd7e4",
      },
      {
        resourceRef: G_BOT_RIG_PROFILE_REF,
        contentHash:
          "sha256:c73a33e59d5394f6b3190272177c2f30483cdfe7a5705ed8bbc6dadecd869545",
      },
      {
        resourceRef: G_BOT_ANIMATION_SET_REF,
        contentHash:
          "sha256:7853d41739601d4e3a2b35cabc558d074a9070cb91afcb3ef9ba25bff75690f5",
      },
      {
        resourceRef: G_BOT_COLLIDER_PROFILE_REF,
        contentHash:
          "sha256:229d120df97e2ffeb41f6884c47e83742a1848f5fcc056068e5c0d88fb228140",
      },
      {
        resourceRef: G_BOT_SUBJECT_DEFINITION_REF,
        contentHash:
          "sha256:2c8f17a171ab4a17ac1bd1477aabebcf7775eb8898ccf274b84e0c20216ebbfe",
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
      expect(resolve(exactRef.replace(/@1$/, "@latest"))).toBeUndefined();
      expect(resolve(exactRef.replace(/@1$/, ""))).toBeUndefined();
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
    const definition = builtInSubjectResourceRegistry.listSubjectDefinitions()[0];
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
      const resource = builtInSubjectResourceRegistry.listResources().find(
        (candidate) => candidate.kind === resourceKind,
      )!;

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
});
