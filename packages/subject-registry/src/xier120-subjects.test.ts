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
    byteLength: 4_001_184,
    contentHash: "sha256:b2416d0ee1ce33ac33878850e8f77362f06986dba2c03ca195636f82eed7e341",
    bounds: [[-4.997547149658203, 0, -2.7527832984924316], [4.997547149658203, 1.7764760255813599, 2.7527832984924316]],
    inventory: [6, 147_128, 49_184],
    category: "composite",
    bodyTopology: "composite",
    authoringAvailability: "experimental",
    collider: [0.9, 1.8],
  },
  {
    slug: "aerial-hanging",
    byteLength: 4_086_220,
    contentHash: "sha256:0010a055858bda14e6954bf291f57232f9f2eda90e6c20b8ee6ea41bf734f28d",
    bounds: [[-2.270571231842041, 0, -0.8879472017288208], [2.270571231842041, 2.8275671005249023, 0.8879472017288208]],
    inventory: [6, 150_388, 50_300],
    category: "composite",
    bodyTopology: "composite",
    authoringAvailability: "experimental",
    collider: [0.9, 2.85],
  },
  {
    slug: "aerial-seated",
    byteLength: 4_527_824,
    contentHash: "sha256:012b5eb2af7400f4e85a3c398dc441f702bf19a96c2c754022ba7ea4ff9ee587",
    bounds: [[-4.997547149658203, 0, -2.151205539703369], [4.997547149658203, 3.5654680728912354, 2.151205539703369]],
    inventory: [6, 165_954, 55_436],
    category: "composite",
    bodyTopology: "composite",
    authoringAvailability: "experimental",
    collider: [1, 3.6],
  },
  {
    slug: "aerial-seated-variant",
    byteLength: 4_521_096,
    contentHash: "sha256:ae55ee15fb4e07b232f07cdeac2ddfa653487bab408137651da4edacf90225be",
    bounds: [[-4.997547149658203, 0, -1.954379916191101], [4.997547149658203, 2.286599636077881, 1.954379916191101]],
    inventory: [5, 165_726, 55_356],
    category: "composite",
    bodyTopology: "composite",
    authoringAvailability: "experimental",
    collider: [1, 2.3],
  },
  {
    slug: "aerial-standing",
    byteLength: 3_999_544,
    contentHash: "sha256:38df41c03aeda89c01d1b39e7333fac0f97305323d390a29f2b8a62dab3bbf92",
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
    contentHash: "sha256:a58044ad4c8a95beaa1548234079bbd12335cb1fae3d1da9dfc8e646e54aad32",
    bounds: [[-1.4798578023910522, 0, -2.1709389686584473], [1.4798578023910522, 0.9396214485168457, 2.1709389686584473]],
    inventory: [3, 146_858, 49_124],
    category: "composite",
    bodyTopology: "composite",
    authoringAvailability: "experimental",
    collider: [0.475, 0.95],
  },
  {
    slug: "four-wheel",
    byteLength: 4_543_248,
    contentHash: "sha256:90de81af8af617a2714e014e1cdfcd041b5375893ab79cf12d28b9e9655c6afe",
    bounds: [[-1.4247379302978516, 0, -2.579864501953125], [1.4247379302978516, 2.285374402999878, 2.579864501953125]],
    inventory: [7, 166_464, 55_840],
    category: "vehicle",
    bodyTopology: "four-wheel",
    authoringAvailability: "experimental",
    collider: [1, 2.3],
  },
  {
    slug: "four-wheel-variant",
    byteLength: 4_627_976,
    contentHash: "sha256:10ffc48432ae9a4ca15e7161cbac275e1ae90b92cec96ed7c37f18c5d6532044",
    bounds: [[-1.4247379302978516, 0, -2.579864740371704], [1.4247379302978516, 2.0403995513916016, 2.579864740371704]],
    inventory: [3, 169_834, 57_011],
    category: "vehicle",
    bodyTopology: "four-wheel",
    authoringAvailability: "experimental",
    collider: [1, 2.05],
  },
  {
    slug: "hoverboard-standing",
    byteLength: 4_514_168,
    contentHash: "sha256:8b0afca1e4e679b80944f456d985088837f62e7f17ee40a28b52e7f63f97505d",
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
    contentHash: "sha256:9577634ecd5c88e2eb79dff5cbd7313fd0f07c1476d2834248c0970cb6453076",
    bounds: [[-1.4798578023910522, 0, -2.1709389686584473], [1.4798578023910522, 0.6468644142150879, 2.1709389686584473]],
    inventory: [3, 146_784, 49_124],
    category: "composite",
    bodyTopology: "composite",
    authoringAvailability: "experimental",
    collider: [0.325, 0.65],
  },
  {
    slug: "quadruped-animal",
    byteLength: 27_616,
    contentHash: "sha256:70c16cd59ba37ec17ddb5481aa92f9442f54d250c885ffdf778313e5f10f206b",
    bounds: [[-1.4184849262237549, 0, -1.0414180755615234], [1.4184849262237549, 1.5794458389282227, 1.0414180755615234]],
    inventory: [18, 490, 216],
    category: "animal",
    bodyTopology: "quadruped",
    authoringAvailability: "advanced",
    collider: [0.8, 1.6],
  },
  {
    slug: "quadruped-reptile",
    byteLength: 4_540_856,
    contentHash: "sha256:fab6b515fec64d61325291573d615609ab0066d795087a6533143cecedf5a9b3",
    bounds: [[-1.7284713983535767, 0, -0.3477635979652405], [1.7284713983535767, 1.8047341108322144, 0.3477635979652405]],
    inventory: [20, 166_036, 55_536],
    category: "animal",
    bodyTopology: "quadruped",
    authoringAvailability: "advanced",
    collider: [0.35, 1.85],
  },
  {
    slug: "quadruped-ridable",
    byteLength: 4_001_416,
    contentHash: "sha256:a35efef1b768f3aecf28c985cb77ed4528ee64737d514956a97f156bdf941596",
    bounds: [[-0.4912319779396057, 0, -1.0414180755615234], [0.4912319779396057, 1.9869701862335205, 1.0414180755615234]],
    inventory: [9, 147_044, 49_196],
    category: "composite",
    bodyTopology: "composite",
    authoringAvailability: "experimental",
    collider: [0.5, 2],
  },
  {
    slug: "snake-animal",
    byteLength: 41_700,
    contentHash: "sha256:660e62620429c492e68a81834a245a5c698ee85c32714817bb5e3da40e18217c",
    bounds: [[-0.874164342880249, 0, -3.380983352661133], [0.874164342880249, 0.3010602593421936, 3.380983352661133]],
    inventory: [3, 1_446, 678],
    category: "animal",
    bodyTopology: "custom",
    authoringAvailability: "advanced",
    collider: [0.175, 0.35],
  },
  {
    slug: "three-wheel",
    byteLength: 4_547_236,
    contentHash: "sha256:3eec5cb1503bf86c872461dbb8aa3b81a7cdf4b6625a3683a9215b563cfb9906",
    bounds: [[-1.0469019412994385, 0, -1.6943717002868652], [1.0469019412994385, 1.845245361328125, 1.6943717002868652]],
    inventory: [3, 166_728, 55_984],
    category: "vehicle",
    bodyTopology: "custom",
    authoringAvailability: "experimental",
    collider: [0.925, 1.85],
  },
  {
    slug: "tracked",
    byteLength: 4_699_792,
    contentHash: "sha256:c0c3e762f956a9cbcfe00fe760c765c220e4b12be1eaafa93696f7cc97652acd",
    bounds: [[-2.730105400085449, 0, -3.183220386505127], [2.730105400085449, 2.2917604446411133, 3.183220386505127]],
    inventory: [6, 172_536, 57_764],
    category: "vehicle",
    bodyTopology: "custom",
    authoringAvailability: "experimental",
    collider: [1, 2.3],
  },
  {
    slug: "two-wheel-motorcycle",
    byteLength: 4_546_392,
    contentHash: "sha256:b632297efb15870385d4fc053ae40dbd6f516eb660b698124069e9d36ed1972f",
    bounds: [[-0.40971457958221436, 0, -1.0134267807006836], [0.40971457958221436, 1.761342167854309, 1.0134267807006836]],
    inventory: [5, 166_659, 55_828],
    category: "vehicle",
    bodyTopology: "custom",
    authoringAvailability: "experimental",
    collider: [0.425, 1.8],
  },
  {
    slug: "two-wheel-motorcycle-variant",
    byteLength: 4_545_392,
    contentHash: "sha256:cbd48d5bd3dd30e4c51fa898dc41a983fcb756843b165d66d8df4aba1c02103b",
    bounds: [[-0.40971457958221436, 0, -1.0134267807006836], [0.40971457958221436, 1.7613420486450195, 1.0134267807006836]],
    inventory: [5, 166_615, 55_828],
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
