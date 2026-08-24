import { readFile } from "node:fs/promises";

import { sha256Bytes } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  XIER120_COLLIDER_PROFILES,
  XIER120_SUBJECT_ASSET_MANIFESTS,
} from "./xier120-resource-manifests";
import { XIER120_SUBJECT_DEFINITIONS } from "./xier120-subject-definitions";
import {
  builtInSubjectDefaultRegistry,
  builtInSubjectResourceRegistry,
} from "./index";

const EXPECTED_XIER120_RESOURCES = [
  {
    slug: "aerial-cockpit",
    byteLength: 4_001_180,
    contentHash: "sha256:469600255aef4050a2fcca300dd2a7b1d6d6616b28e13f1e8c77f2a8f3cf2955",
    bounds: [[-4.997547149658203, 0, -2.7527832984924316], [4.997547149658203, 1.7764760255813599, 2.7527832984924316]],
    inventory: [6, 147_128, 49_184],
    category: "composite",
    bodyTopology: "composite",
    authoringAvailability: "experimental",
    collider: [0.9, 1.8],
  },
  {
    slug: "aerial-hanging",
    byteLength: 4_086_216,
    contentHash: "sha256:d8247a2212624ad37e46cf0da1191d7eed3c31b5923c16843a7e4598431a7863",
    bounds: [[-2.270571231842041, 0, -0.8879472017288208], [2.270571231842041, 2.8275671005249023, 0.8879472017288208]],
    inventory: [6, 150_388, 50_300],
    category: "composite",
    bodyTopology: "composite",
    authoringAvailability: "experimental",
    collider: [0.9, 2.85],
  },
  {
    slug: "aerial-seated",
    byteLength: 4_527_820,
    contentHash: "sha256:51d69e239b7e5786db6f626bf14f195643fe2159f6deae8e9c2ba52433b92c66",
    bounds: [[-4.997547149658203, 0, -2.151205539703369], [4.997547149658203, 3.5654680728912354, 2.151205539703369]],
    inventory: [6, 165_954, 55_436],
    category: "composite",
    bodyTopology: "composite",
    authoringAvailability: "experimental",
    collider: [1, 3.6],
  },
  {
    slug: "aerial-seated-variant",
    byteLength: 4_521_092,
    contentHash: "sha256:3bd707ce2b876f3391cd264c6c95320a7d7dbc18b456c0e8caabb7837fe912b1",
    bounds: [[-4.997547149658203, 0, -1.954379916191101], [4.997547149658203, 2.286599636077881, 1.954379916191101]],
    inventory: [5, 165_726, 55_356],
    category: "composite",
    bodyTopology: "composite",
    authoringAvailability: "experimental",
    collider: [1, 2.3],
  },
  {
    slug: "aerial-standing",
    byteLength: 3_999_540,
    contentHash: "sha256:f2723e6f2229013b6233fa50aec37261393c2d4b69bbd9fa67a7bab0f42d74cc",
    bounds: [[-4.997547149658203, 0, -1.954379916191101], [4.997547149658203, 3.1471400260925293, 1.954379916191101]],
    inventory: [5, 147_100, 49_148],
    category: "composite",
    bodyTopology: "composite",
    authoringAvailability: "experimental",
    collider: [1, 3.15],
  },
  {
    slug: "biped-animal",
    byteLength: 13_876,
    contentHash: "sha256:d9885d03000557ec1b1a7838f98b752b16026183add7885ad8ef5233deeb89db",
    bounds: [[-1.6529110670089722, 0, -0.28151267766952515], [1.6529110670089722, 2.120368242263794, 0.28151267766952515]],
    inventory: [9, 244, 108],
    category: "animal",
    bodyTopology: "biped",
    authoringAvailability: "advanced",
    collider: [0.3, 2.15],
  },
  {
    slug: "flat-seated-glider",
    byteLength: 3_991_972,
    contentHash: "sha256:28ec6d6d1c5980494be6b414e94c29124aada61e4ce9feaa3181e9545e11dce9",
    bounds: [[-1.4798578023910522, 0, -2.1709389686584473], [1.4798578023910522, 0.9396214485168457, 2.1709389686584473]],
    inventory: [3, 146_858, 49_124],
    category: "composite",
    bodyTopology: "composite",
    authoringAvailability: "experimental",
    collider: [0.475, 0.95],
  },
  {
    slug: "four-wheel",
    byteLength: 4_542_952,
    contentHash: "sha256:10251fa0771a456c143e97402d77c6cab6c861aaa695b15b8f614ad52776b963",
    bounds: [[-1.4247379302978516, 0, -2.579864501953125], [1.4247379302978516, 2.285374402999878, 2.579864501953125]],
    inventory: [7, 166_452, 55_840],
    category: "vehicle",
    bodyTopology: "four-wheel",
    authoringAvailability: "experimental",
    collider: [1, 2.3],
  },
  {
    slug: "four-wheel-variant",
    byteLength: 4_627_824,
    contentHash: "sha256:83705f85c15654045bad1ab8464c5231270710219c4af818b544a76465594c70",
    bounds: [[-1.4247379302978516, 0, -2.579864740371704], [1.4247379302978516, 2.0403995513916016, 2.579864740371704]],
    inventory: [3, 169_828, 57_011],
    category: "vehicle",
    bodyTopology: "four-wheel",
    authoringAvailability: "experimental",
    collider: [1, 2.05],
  },
  {
    slug: "hoverboard-standing",
    byteLength: 4_514_168,
    contentHash: "sha256:a7ae3e2bc437ea5cb99dd5793611f9b965d373ea204e142bc20e6fea0375ecec",
    bounds: [[-0.7387374043464661, 0, -1.408867597579956], [0.7387374043464661, 1.5792903900146484, 1.408867597579956]],
    inventory: [3, 165_512, 55_332],
    category: "composite",
    bodyTopology: "composite",
    authoringAvailability: "experimental",
    collider: [0.75, 1.6],
  },
  {
    slug: "prone-glider",
    byteLength: 3_990_160,
    contentHash: "sha256:02f87ee002a0d111a9caf857441bc7f515980c83fd6e4478012e17cbcea744f4",
    bounds: [[-1.4798578023910522, 0, -2.1709389686584473], [1.4798578023910522, 0.6468644142150879, 2.1709389686584473]],
    inventory: [3, 146_784, 49_124],
    category: "composite",
    bodyTopology: "composite",
    authoringAvailability: "experimental",
    collider: [0.325, 0.65],
  },
  {
    slug: "quadruped-animal",
    byteLength: 27_316,
    contentHash: "sha256:57533e6e4f1fd6fcff6b0878e66d49c7bec874e23b79c05d103915be1f9411d4",
    bounds: [[-1.0414180755615234, 0, -1.4184849262237549], [1.0414180755615234, 1.5794458389282227, 1.4184849262237549]],
    inventory: [18, 478, 216],
    category: "animal",
    bodyTopology: "quadruped",
    authoringAvailability: "advanced",
    collider: [0.8, 1.6],
  },
  {
    slug: "quadruped-reptile",
    byteLength: 4_540_984,
    contentHash: "sha256:3cbdff110ee6ab0b1fab28eaaaca6e1786bf25686b7c16e858ed8f527d412ca9",
    bounds: [[-1.7284713983535767, 0, -0.3477635979652405], [1.7284713983535767, 1.8047341108322144, 0.3477635979652405]],
    inventory: [20, 166_042, 55_536],
    category: "animal",
    bodyTopology: "quadruped",
    authoringAvailability: "advanced",
    collider: [0.35, 1.85],
  },
  {
    slug: "quadruped-ridable",
    byteLength: 4_001_416,
    contentHash: "sha256:8094b1a3db7b969583b070c9857d450b9c689bdad40c2dbed0c87c71601c474f",
    bounds: [[-1.0414180755615234, 0, -0.4912319779396057], [1.0414180755615234, 1.9869701862335205, 0.4912319779396057]],
    inventory: [9, 147_044, 49_196],
    category: "composite",
    bodyTopology: "composite",
    authoringAvailability: "experimental",
    collider: [0.5, 2],
  },
  {
    slug: "snake-animal",
    byteLength: 41_696,
    contentHash: "sha256:19b6c3166c07295e41885d8a093034369bf3a176b2229c636c15c7d61389f9c8",
    bounds: [[-3.380983352661133, 0, -0.874164342880249], [3.380983352661133, 0.3010602593421936, 0.874164342880249]],
    inventory: [3, 1_446, 678],
    category: "animal",
    bodyTopology: "custom",
    authoringAvailability: "advanced",
    collider: [0.175, 0.35],
  },
  {
    slug: "three-wheel",
    byteLength: 4_547_260,
    contentHash: "sha256:0961d6a46e34374aef8a11572238c305df610445d2470ea7445d900224eddfaf",
    bounds: [[-1.0469019412994385, 0, -1.6943717002868652], [1.0469019412994385, 1.845245361328125, 1.6943717002868652]],
    inventory: [3, 166_729, 55_984],
    category: "vehicle",
    bodyTopology: "custom",
    authoringAvailability: "experimental",
    collider: [0.925, 1.85],
  },
  {
    slug: "tracked",
    byteLength: 4_699_628,
    contentHash: "sha256:4ee8e22228c5b9f04c22873165502b8eef782b1ec5347d87070ca4252dbfedb3",
    bounds: [[-2.730105400085449, 0, -3.183220386505127], [2.730105400085449, 2.2917604446411133, 3.183220386505127]],
    inventory: [6, 172_530, 57_764],
    category: "vehicle",
    bodyTopology: "custom",
    authoringAvailability: "experimental",
    collider: [1, 2.3],
  },
  {
    slug: "two-wheel-motorcycle",
    byteLength: 4_546_340,
    contentHash: "sha256:932f7e5ca9d3488069117df90bab1810786a5b2c38b2d21d8f6cdabd446938c0",
    bounds: [[-1.0134267807006836, 0, -0.40971457958221436], [1.0134267807006836, 1.761342167854309, 0.40971457958221436]],
    inventory: [5, 166_657, 55_828],
    category: "vehicle",
    bodyTopology: "custom",
    authoringAvailability: "experimental",
    collider: [0.425, 1.8],
  },
  {
    slug: "two-wheel-motorcycle-variant",
    byteLength: 4_545_340,
    contentHash: "sha256:c061d3f7fd3c02a22e412d4f2d0b060fc8aaad7693b5468fbd377ff88f7ee454",
    bounds: [[-1.0134267807006836, 0, -0.40971457958221436], [1.0134267807006836, 1.7613420486450195, 0.40971457958221436]],
    inventory: [5, 166_613, 55_828],
    category: "vehicle",
    bodyTopology: "custom",
    authoringAvailability: "experimental",
    collider: [0.425, 1.8],
  },
] as const;

const EXPECTED_GROUND_PROFILES = {
  physicsBodyProfileRef:
    "worldkit://physics-body-profile/character.capability-medium@1",
  locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
  controlFeelProfileRef:
    "worldkit://control-feel-profile/humanoid.medium-ground@1",
  allowedControlFeelProfileRefs: [
    "worldkit://control-feel-profile/humanoid.medium-ground@1",
    "worldkit://control-feel-profile/humanoid.heavy-ground@1",
  ],
  motion: {
    defaultMotionProfileRef:
      "worldkit://motion-profile/free-ground.humanoid-medium@1",
    optionalMotionProfileRefs: ["worldkit://motion-profile/safe-ground@1"],
    fallbackMotionProfileRef: "worldkit://motion-profile/safe-ground@1",
  },
  controlProfileRef: "worldkit://control-profile/planar.camera-relative@1",
  cameraContextProfileRef:
    "worldkit://camera-context/capability-driven.default@1",
  mediumProfileRef: "worldkit://medium-profile/ground-air.standard@1",
  harnessProfileRef: "worldkit://harness-profile/subject.standard@1",
} as const;

describe("xier120 static Subject Registry closures", () => {
  it("locks exactly nineteen literal GLB manifests to the committed bytes and bake inventory", async () => {
    expect(EXPECTED_XIER120_RESOURCES).toHaveLength(19);
    expect(XIER120_SUBJECT_ASSET_MANIFESTS).toHaveLength(19);

    for (const [index, expected] of EXPECTED_XIER120_RESOURCES.entries()) {
      const manifest = XIER120_SUBJECT_ASSET_MANIFESTS[index];
      const resourceRef = `worldkit://subject-asset/xier120.${expected.slug}@1`;
      const bytes = await readFile(new URL(
        `../../../apps/playground/public/subject-assets/xier120/${expected.slug}/v1/${expected.slug}.glb`,
        import.meta.url,
      ));

      expect(manifest).toMatchObject({
        kind: "subject-asset",
        id: `xier120.${expected.slug}`,
        version: 1,
        resourceRef,
        format: "glb",
        artifact: {
          mediaType: "model/gltf-binary",
          byteLength: expected.byteLength,
          contentHash: expected.contentHash,
        },
        coordinateConvention: {
          forwardAxis: "-Z",
          upAxis: "+Y",
          metersPerUnit: 1,
          pivot: "support-center",
        },
        bounds: {
          minimumMetersXYZ: expected.bounds[0],
          maximumMetersXYZ: expected.bounds[1],
        },
        inventory: {
          meshCount: expected.inventory[0],
          vertexCount: expected.inventory[1],
          triangleCount: expected.inventory[2],
          skeletonCount: 0,
          boneCount: 0,
          animationClipCount: 0,
          animationClipNames: [],
        },
        provenance: {
          licenseSpdxId: "LicenseRef-Loopit-Company-Private",
          redistributionPolicy: "internal-only",
          author: "xier120",
        },
        runtimeReadiness: {
          productionReady: false,
          runtimeStateBinding: "implemented",
        },
      });
      expect(bytes.byteLength).toBe(expected.byteLength);
      expect(sha256Bytes(bytes)).toBe(expected.contentHash);
    }
  });

  it("registers one compatible support-centered capsule and one V3 identity Asset Part per Subject", () => {
    expect(XIER120_COLLIDER_PROFILES).toHaveLength(19);
    expect(XIER120_SUBJECT_DEFINITIONS).toHaveLength(19);

    for (const [index, expected] of EXPECTED_XIER120_RESOURCES.entries()) {
      const asset = XIER120_SUBJECT_ASSET_MANIFESTS[index];
      const collider = XIER120_COLLIDER_PROFILES[index];
      const definition = XIER120_SUBJECT_DEFINITIONS[index];
      const colliderRef =
        `worldkit://collider-profile/xier120.${expected.slug}@1`;

      expect(collider).toMatchObject({
        kind: "collider-profile",
        id: `xier120.${expected.slug}`,
        version: 1,
        resourceRef: colliderRef,
        supportedBodyTopologies: [expected.bodyTopology],
        collider: {
          kind: "capsule",
          radiusMeters: expected.collider[0],
          heightMeters: expected.collider[1],
          centerOffsetFromSubjectOriginMetersXYZ: [
            0,
            expected.collider[1] / 2,
            0,
          ],
        },
      });
      expect(collider!.collider.heightMeters).toBeGreaterThanOrEqual(
        asset!.bounds.maximumMetersXYZ[1],
      );
      expect(collider!.collider.radiusMeters * 2).toBeLessThanOrEqual(
        collider!.collider.heightMeters,
      );
      expect(definition).toMatchObject({
        kind: "subject-definition",
        schemaVersion: 3,
        id: `xier120.${expected.slug}`,
        version: 1,
        resourceRef:
          `worldkit://subject-definition/xier120.${expected.slug}@1`,
        authoringAvailability: expected.authoringAvailability,
        category: expected.category,
        bodyTopology: expected.bodyTopology,
        coordinateConvention: {
          forwardAxis: "-Z",
          upAxis: "+Y",
          metersPerUnit: 1,
          pivot: "support-center",
        },
        visualParts: [{
          id: "body.asset",
          kind: "asset",
          subjectAssetRef: asset?.resourceRef,
          localTransform: {
            positionMetersXYZ: [0, 0, 0],
            rotationEulerRadiansXYZ: [0, 0, 0],
            scaleXYZ: [1, 1, 1],
          },
          appearance: { mode: "whitebox-neutral" },
        }],
        visualBinding: { mode: "static" },
        sockets: [],
        colliderPolicy: { kind: "profile", colliderProfileRef: colliderRef },
        capabilityRefs: ["worldkit://capability/locomotion.ground@1"],
        profiles: EXPECTED_GROUND_PROFILES,
        relationshipCapabilityRefs: [],
        actionOrPoseSetRef: "worldkit://pose-set/static.whitebox@1",
        renderBindingProfileRef:
          "worldkit://render-binding/subject.standard@1",
      });
      expect(definition?.visualParts).toHaveLength(1);

      expect(
        builtInSubjectResourceRegistry.resolveSubjectAsset(asset!.resourceRef),
      ).toMatchObject(asset!);
      expect(
        builtInSubjectResourceRegistry.resolveColliderProfile(collider!.resourceRef),
      ).toMatchObject(collider!);
      expect(
        builtInSubjectResourceRegistry.resolveSubjectDefinition(
          definition!.resourceRef,
        ),
      ).toMatchObject({
        kind: "subject-definition",
        schemaVersion: 3,
        resourceRef: definition!.resourceRef,
        visualParts: [{ subjectAssetRef: asset!.resourceRef }],
        colliderPolicy: { colliderProfileRef: collider!.resourceRef },
        contentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      });
    }

    const registeredXier120DefinitionRefs = builtInSubjectResourceRegistry
      .listCapabilitySubjectDefinitions()
      .filter((definition) =>
        definition.resourceRef.startsWith(
          "worldkit://subject-definition/xier120.",
        ),
      )
      .map((definition) => definition.resourceRef);
    expect(registeredXier120DefinitionRefs).toHaveLength(19);
    expect(registeredXier120DefinitionRefs).toEqual(expect.arrayContaining(
      EXPECTED_XIER120_RESOURCES.map(
        ({ slug }) => `worldkit://subject-definition/xier120.${slug}@1`,
      ),
    ));
  });

  it("keeps every xier120 entry out of the public-default Catalog", () => {
    const defaults = builtInSubjectDefaultRegistry.listPublicDefaults();

    expect(defaults).toHaveLength(6);
    expect(
      defaults.some((entry) => entry.subjectDefinitionRef.includes("/xier120.")),
    ).toBe(false);
  });
});
