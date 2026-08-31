import { sha256CanonicalJson, type Sha256HashV1 } from "@whitebox-world/protocol";
import {
  createBabylonNativeStaticColliderContributionV1,
  hashBabylonNativeSceneContributionV1,
  hashFormalSemanticCaptureMapV1,
  parseFormalSemanticCaptureMapV1,
} from "@whitebox-world/runtime-contracts";
import {
  hashWorldReconstructionCaseV1,
  parseWorldReconstructionCaseV1,
  type WorldReconstructionCaseV1,
} from "@whitebox-world/validation";
import { describe, expect, it } from "vitest";

import { bindBlockVisualGroupsToSemanticCaptureTargetsV1 } from "./formal-capture-identity.js";
import type { BabylonNativeBlockVisualGroupInventoryV1 } from "./check.js";

const H = (character: string) => `sha256:${character.repeat(64)}` as const;

function caseValue() {
  return {
    kind: "world-reconstruction-case",
    schemaVersion: 1,
    id: "cloud-temple.case",
    sceneBriefRef: "artifact://case/cloud-temple/scene-brief.json",
    sceneBriefHash: H("a"),
    referenceInputs: [
      {
        inputRef: "artifact://case/cloud-temple/reference.png",
        contentHash: H("b"),
        mediaType: "image/png",
      },
    ],
    evaluationProfileRef:
      "worldkit://reconstruction-evaluation-profile/cloud-temple@1",
    evaluationProfileHash: H("c"),
    acceptanceTargetRefs: [
      "worldkit://acceptance-target/central-ascent@1",
      "worldkit://acceptance-target/upper-t-junction@1",
    ],
    requiredEvidenceProfileRefs: [
      "worldkit://evidence-profile/native-block-formal-capture@1",
    ],
    expected: {
      topology: {
        acceptanceTargetRef: "worldkit://acceptance-target/upper-t-junction@1",
        nodeIds: ["central-ascent", "upper-t-junction"],
        relations: [{
          fromNodeId: "central-ascent",
          relation: "connects-to",
          toNodeId: "upper-t-junction",
        }],
        layerIds: ["ground", "upper"],
      },
      semanticSilhouetteTargets: [{
        acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
        visualGroupId: "central-ascent-group",
        normalizedBounds: {
          minXBasisPoints: 100,
          minYBasisPoints: 200,
          maxXBasisPoints: 500,
          maxYBasisPoints: 800,
        },
        normalizedCenter: { xBasisPoints: 300, yBasisPoints: 500 },
        coverageBasisPoints: 2_400,
      }],
      openingComposition: {
        acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
        targetRefs: ["worldkit://composition-target/opening@1"],
        regions: [{
          targetRef: "worldkit://composition-target/opening@1",
          normalizedBounds: {
            minXBasisPoints: 100,
            minYBasisPoints: 200,
            maxXBasisPoints: 500,
            maxYBasisPoints: 800,
          },
        }],
        anchors: [{
          targetRef: "worldkit://composition-target/opening@1",
          normalizedCenter: { xBasisPoints: 300, yBasisPoints: 500 },
        }],
        orderedTargetRefs: ["worldkit://composition-target/opening@1"],
      },
      spawnSupport: {
        acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
        spawnMarkerId: "player-spawn",
        supportColliderId: "spawn-ground",
        expectedMedium: "ground",
        expectedPositionXYZMeters: { xMeters: 0, yMeters: 1, zMeters: 0 },
      },
      colliders: [
        {
          acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
          contributionId: "spawn-ground-contribution",
          colliderId: "spawn-ground",
          role: "ground",
          requiresOverlay: true,
        },
        {
          acceptanceTargetRef: "worldkit://acceptance-target/upper-t-junction@1",
          contributionId: "west-wall-contribution",
          colliderId: "west-wall",
          role: "blocker",
          requiresOverlay: true,
        },
      ],
      criticalTraversalChecks: [{
        acceptanceTargetRef: "worldkit://acceptance-target/upper-t-junction@1",
        id: "reach-junction",
        evidenceKind: "scripted-fixed-input",
        expectation: "pass",
        checkpointIds: ["junction", "spawn"],
        fixedInputSequence: [
          { actions: ["move-forward"], axes: { moveYRatio: 1 }, ticks: 12 },
          { actions: ["jump"], ticks: 1 },
          { actions: ["move-forward"], ticks: 8 },
        ],
      }],
      deterministicBuild: {
        acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
        requiresCandidateReplay: true,
        requiresWorldPackageIdentityAgreement: true,
        requiresBuildIdentityAgreement: true,
        requiresCaptureIdentityAgreement: true,
      },
    },
  };
}

function visualGroups(): readonly BabylonNativeBlockVisualGroupInventoryV1[] {
  return Object.freeze([
    Object.freeze({
      id: "central-ascent-group",
      blockIds: Object.freeze(["ascent-lower", "ascent-upper"]),
      paletteRoles: Object.freeze(["route", "structure"]),
      minimumMetersXYZ: Object.freeze([0, 0, 0]) as [number, number, number],
      maximumMetersXYZ: Object.freeze([4, 6, 4]) as [number, number, number],
    }),
    Object.freeze({
      id: "upper-t-junction-group",
      blockIds: Object.freeze(["t-deck"]),
      paletteRoles: Object.freeze(["structure"]),
      minimumMetersXYZ: Object.freeze([-2, 6, -6]) as [number, number, number],
      maximumMetersXYZ: Object.freeze([6, 8, 6]) as [number, number, number],
    }),
  ]);
}

function authoringManifest() {
  return {
    kind: "native-block-authoring",
    schemaVersion: 1,
    entryModulePath: "scene.ts",
    blockProfileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
    visualGroups: [
      {
        visualGroupId: "central-ascent-group",
        acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
        semanticClassId: "worldkit.native-block.group.central-ascent-group",
        identityColorHex: "#c9a96b",
      },
      {
        visualGroupId: "upper-t-junction-group",
        acceptanceTargetRef: "worldkit://acceptance-target/upper-t-junction@1",
        semanticClassId: "worldkit.native-block.group.upper-t-junction-group",
        identityColorHex: "#aeb8c4",
      },
    ],
  };
}

function contribution() {
  return {
    kind: "babylon-native-scene-contribution",
    schemaVersion: 1,
    sceneModuleRef: "worldkit://native-scene/cloud-temple@1",
    sceneModuleId: "cloud-temple-native",
    profileSettlement: {
      kind: "host-snapshot" as const,
      profileRef: "worldkit://native-scene-profile/whitebox.blocks@1" as const,
      targetCount: 2,
      profileInventoryHash: H("e"),
      settledVisualHash: H("s"),
    },
    spawnMarker: {
      id: "player-spawn",
      positionMetersXYZ: [0, 1.1, 18] as const,
      facingRadians: Math.PI,
    },
    staticColliders: [
      createBabylonNativeStaticColliderContributionV1({
        id: "spawn-ground",
        worldPositionsMetersXYZ: [0, 0, 0, 2, 0, 0, 0, 0, 2],
        triangleIndices: [0, 1, 2],
        frictionRatio: 0.75,
        restitutionRatio: 0,
        traversalBinding: {
          kind: "static-surface",
          surfaceEntityId: "spawn-ground",
          logicalSubshapeId: "primary",
          traversalSurfaceProfileRef:
            "worldkit://traversal-surface-profile/ground.static@1",
        },
      }),
    ],
  };
}

function bindInput(overrides: Record<string, unknown> = {}) {
  const parsedCase = parseWorldReconstructionCaseV1(caseValue());
  const blockVisualGroups = visualGroups();
  const manifest = authoringManifest();
  const frozenContribution = contribution();
  return {
    case: parsedCase,
    blockVisualGroups,
    contributionHash: hashBabylonNativeSceneContributionV1(frozenContribution),
    authoringManifestHash: sha256CanonicalJson(manifest) as Sha256HashV1,
    layoutInventoryHash: sha256CanonicalJson(blockVisualGroups) as Sha256HashV1,
    authoringManifest: manifest,
    contribution: frozenContribution,
    ...overrides,
  };
}

describe("bindBlockVisualGroupsToSemanticCaptureTargetsV1", () => {
  it("binds every Case target to exactly one checked Block visual group", () => {
    const input = bindInput();
    const map = bindBlockVisualGroupsToSemanticCaptureTargetsV1(input);
    expect(parseFormalSemanticCaptureMapV1(map)).toEqual(map);
    expect(map.bindings.map(({ acceptanceTargetRef, blockVisualGroupId }) => ({
      acceptanceTargetRef,
      blockVisualGroupId,
    }))).toEqual([
      {
        acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
        blockVisualGroupId: "central-ascent-group",
      },
      {
        acceptanceTargetRef: "worldkit://acceptance-target/upper-t-junction@1",
        blockVisualGroupId: "upper-t-junction-group",
      },
    ]);
    expect(map.caseHash).toBe(hashWorldReconstructionCaseV1(input.case));
    expect(map.bindings[0]).toMatchObject({
      semanticClassId: "worldkit.native-block.group.central-ascent-group",
      identityColor: "#c9a96b",
      projectedBoundsSource: "checked-layout-visual-group",
      requiredWorldViewIds: ["opening", "world-side", "world-top-down"],
      authoringManifestHash: input.authoringManifestHash,
      layoutInventoryHash: input.layoutInventoryHash,
      contributionHash: input.contributionHash,
    });
    const reversed = bindBlockVisualGroupsToSemanticCaptureTargetsV1(bindInput({
      blockVisualGroups: [...visualGroups()].reverse(),
      authoringManifest: {
        ...authoringManifest(),
        visualGroups: [...authoringManifest().visualGroups].reverse(),
      },
      authoringManifestHash: sha256CanonicalJson({
        ...authoringManifest(),
        visualGroups: [...authoringManifest().visualGroups].reverse(),
      }),
    }));
    expect(hashFormalSemanticCaptureMapV1(map)).toBe(
      hashFormalSemanticCaptureMapV1(reversed),
    );
  });

  it("rejects a missing Case target binding", () => {
    const manifest = authoringManifest();
    manifest.visualGroups = [manifest.visualGroups[0]!];
    expect(() => bindBlockVisualGroupsToSemanticCaptureTargetsV1(bindInput({
      authoringManifest: manifest,
      authoringManifestHash: sha256CanonicalJson(manifest),
    }))).toThrowError("FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID");
  });

  it("rejects a duplicate Case target binding", () => {
    const manifest = authoringManifest();
    manifest.visualGroups = [
      manifest.visualGroups[0]!,
      {
        ...manifest.visualGroups[1]!,
        visualGroupId: "upper-t-junction-group",
        acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
      },
    ];
    expect(() => bindBlockVisualGroupsToSemanticCaptureTargetsV1(bindInput({
      authoringManifest: manifest,
      authoringManifestHash: sha256CanonicalJson(manifest),
    }))).toThrowError("FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID");
  });

  it("rejects one visual group bound to contradictory semantic targets", () => {
    const manifest = authoringManifest();
    manifest.visualGroups[1] = {
      ...manifest.visualGroups[1]!,
      visualGroupId: "central-ascent-group",
    };
    expect(() => bindBlockVisualGroupsToSemanticCaptureTargetsV1(bindInput({
      authoringManifest: manifest,
      authoringManifestHash: sha256CanonicalJson(manifest),
    }))).toThrowError("FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID");
  });

  it("rejects an undeclared visual group", () => {
    const manifest = authoringManifest();
    manifest.visualGroups[1] = {
      ...manifest.visualGroups[1]!,
      visualGroupId: "invented-from-mesh-name",
    };
    expect(() => bindBlockVisualGroupsToSemanticCaptureTargetsV1(bindInput({
      authoringManifest: manifest,
      authoringManifestHash: sha256CanonicalJson(manifest),
    }))).toThrowError("FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID");
  });

  it("rejects stale Manifest, Layout, or Contribution identities", () => {
    expect(() => bindBlockVisualGroupsToSemanticCaptureTargetsV1(bindInput({
      authoringManifestHash: H("9"),
    }))).toThrowError("FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID");
    expect(() => bindBlockVisualGroupsToSemanticCaptureTargetsV1(bindInput({
      layoutInventoryHash: H("9"),
    }))).toThrowError("FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID");
    expect(() => bindBlockVisualGroupsToSemanticCaptureTargetsV1(bindInput({
      contributionHash: H("9"),
    }))).toThrowError("FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID");
  });

  it("rejects an extra target that is not a Case acceptance target", () => {
    const manifest = authoringManifest();
    manifest.visualGroups.push({
      visualGroupId: "central-ascent-group",
      acceptanceTargetRef: "worldkit://acceptance-target/cloud-layer@1",
      semanticClassId: "worldkit.native-block.group.cloud-layer",
      identityColorHex: "#4e91b5",
    });
    expect(() => bindBlockVisualGroupsToSemanticCaptureTargetsV1(bindInput({
      authoringManifest: manifest,
      authoringManifestHash: sha256CanonicalJson(manifest),
    }))).toThrowError("FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID");
  });

  it("sorts bindings deterministically and does not infer Mesh, tag, or name membership", () => {
    const reversedGroups = [...visualGroups()].reverse();
    const reversedManifest = authoringManifest();
    reversedManifest.visualGroups = [...reversedManifest.visualGroups].reverse();
    const map = bindBlockVisualGroupsToSemanticCaptureTargetsV1(bindInput({
      blockVisualGroups: reversedGroups,
      authoringManifest: reversedManifest,
      authoringManifestHash: sha256CanonicalJson(reversedManifest),
      layoutInventoryHash: sha256CanonicalJson(visualGroups()),
    }));
    expect(map.bindings.map(({ blockVisualGroupId }) => blockVisualGroupId))
      .toEqual(["central-ascent-group", "upper-t-junction-group"]);
    expect(() => bindBlockVisualGroupsToSemanticCaptureTargetsV1(bindInput({
      blockVisualGroups: visualGroups().map((group) => ({
        ...group,
        meshName: group.id,
        tag: group.id,
      })),
    }))).toThrowError("FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID");
    const inferred = bindInput();
    expect(() => bindBlockVisualGroupsToSemanticCaptureTargetsV1({
      ...inferred,
      authoringManifest: {
        ...authoringManifest(),
        visualGroups: [],
      },
      authoringManifestHash: sha256CanonicalJson({
        ...authoringManifest(),
        visualGroups: [],
      }),
      meshNameByGroupId: {
        "central-ascent-group": "AscentMesh",
        "upper-t-junction-group": "TDeck",
      },
    })).toThrowError("FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID");
  });

  it("does not treat a Case as already bound from visualGroupId alone", () => {
    const parsedCase = parseWorldReconstructionCaseV1(caseValue()) as WorldReconstructionCaseV1;
    expect(parsedCase.expected.semanticSilhouetteTargets[0]?.visualGroupId)
      .toBe("central-ascent-group");
    expect(() => bindBlockVisualGroupsToSemanticCaptureTargetsV1(bindInput({
      authoringManifest: {
        ...authoringManifest(),
        visualGroups: [],
      },
      authoringManifestHash: sha256CanonicalJson({
        ...authoringManifest(),
        visualGroups: [],
      }),
    }))).toThrowError("FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID");
  });
});
