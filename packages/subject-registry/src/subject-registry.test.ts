import { describe, expect, it } from "vitest";

import { sha256CanonicalJson } from "@whitebox-world/protocol";

import {
  builtInSubjectResourceRegistry,
  createSubjectResourceRegistry,
} from "./index";
import type { AnimationSetManifestInputV1 } from "./index";

const SUBJECT_ASSET_REF = "worldkit://subject-asset/humanoid.golden@1";
const RIG_PROFILE_REF = "worldkit://rig-profile/biped.golden@1";
const ANIMATION_SET_REF = "worldkit://animation-set/humanoid.ground.golden@1";
const COLLIDER_PROFILE_REF =
  "worldkit://collider-profile/humanoid.medium-capsule@1";
const RIGGED_SUBJECT_DEFINITION_REF =
  "worldkit://subject-definition/humanoid.rigged-golden@1";

const BIPED_BONE_IDS = [
  "root",
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "upper-arm.left",
  "lower-arm.left",
  "hand.left",
  "upper-arm.right",
  "lower-arm.right",
  "hand.right",
  "upper-leg.left",
  "lower-leg.left",
  "foot.left",
  "upper-leg.right",
  "lower-leg.right",
  "foot.right",
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

describe("subject resource registry", () => {
  it("exposes canonical subject-definition resource refs", () => {
    expect(
      builtInSubjectResourceRegistry
        .listSubjectDefinitions()
        .map((definition) => definition.resourceRef),
    ).toEqual([
      RIGGED_SUBJECT_DEFINITION_REF,
      "worldkit://subject-definition/humanoid.third-person@1",
      "worldkit://subject-definition/quadruped.ground-proxy@1",
    ]);
  });

  it("shares the exact closed Subject unions across built-in definitions", () => {
    const [rigged, staticHumanoid, staticQuadruped] =
      builtInSubjectResourceRegistry.listSubjectDefinitions();

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
    expect(
      builtInSubjectResourceRegistry.resolveLocomotionProfile(
        "worldkit://locomotion-profile/ground.standard@1",
      ),
    ).toMatchObject({
      kind: "locomotion-profile",
      locomotion: {
        mode: "ground",
        groundSpeedMetersPerSecond: 4,
        waterSpeedMetersPerSecond: 2.2,
        jumpSpeedMetersPerSecond: 5.5,
      },
    });
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
      skeletonRootNodeName: "root",
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
});
