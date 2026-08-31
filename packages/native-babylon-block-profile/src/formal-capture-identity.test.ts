import {
  createBabylonNativeStaticColliderContributionV1,
  hashBabylonNativeSceneContributionV1,
  hashFormalSemanticCaptureMapV1,
  parseFormalSemanticCaptureMapV1,
} from "@whitebox-world/runtime-contracts";
import {
  hashWorldReconstructionCaseV1,
  parseWorldReconstructionCaseV1,
} from "@whitebox-world/validation";
import { describe, expect, it } from "vitest";

import {
  hashBabylonNativeBlockCheckedLayoutInventoryV1,
  hashNativeBlockAuthoringManifestV1,
  parseNativeBlockAuthoringManifestV1,
} from "./authoring-manifest.js";
import {
  bindBlockVisualGroupsToSemanticCaptureTargetsV1,
  type BindBlockVisualGroupsToSemanticCaptureTargetsInputV1,
} from "./formal-capture-identity.js";

const H = (character: string) => `sha256:${character.repeat(64)}` as const;

function caseValue() {
  return {
    kind: "world-reconstruction-case",
    schemaVersion: 1,
    id: "cloud-temple.case",
    sceneBriefRef: "artifact://case/cloud-temple/scene-brief.json",
    sceneBriefHash: H("a"),
    referenceInputs: [{
      inputRef: "artifact://case/cloud-temple/reference.png",
      contentHash: H("b"),
      mediaType: "image/png",
    }],
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
        acceptanceTargetRef:
          "worldkit://acceptance-target/upper-t-junction@1",
        nodeIds: ["central-ascent", "upper-t-junction"],
        relations: [{
          fromNodeId: "central-ascent",
          relation: "connects-to",
          toNodeId: "upper-t-junction",
        }],
        layerIds: ["ground", "upper"],
      },
      semanticSilhouetteTargets: [{
        acceptanceTargetRef:
          "worldkit://acceptance-target/central-ascent@1",
        visualGroupId: "central-ascent-group",
        normalizedBounds: {
          minXBasisPoints: 100,
          minYBasisPoints: 200,
          maxXBasisPoints: 500,
          maxYBasisPoints: 800,
        },
        normalizedCenter: { xBasisPoints: 300, yBasisPoints: 500 },
        coverageBasisPoints: 2_400,
      }, {
        acceptanceTargetRef:
          "worldkit://acceptance-target/upper-t-junction@1",
        visualGroupId: "upper-t-junction-group",
        normalizedBounds: {
          minXBasisPoints: 600,
          minYBasisPoints: 100,
          maxXBasisPoints: 900,
          maxYBasisPoints: 400,
        },
        normalizedCenter: { xBasisPoints: 750, yBasisPoints: 250 },
        coverageBasisPoints: 900,
      }],
      openingComposition: {
        acceptanceTargetRef:
          "worldkit://acceptance-target/central-ascent@1",
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
        acceptanceTargetRef:
          "worldkit://acceptance-target/central-ascent@1",
        spawnMarkerId: "player-spawn",
        supportColliderId: "spawn-ground",
        expectedMedium: "ground",
        expectedPositionXYZMeters: { xMeters: 0, yMeters: 1, zMeters: 0 },
      },
      colliders: [{
        acceptanceTargetRef:
          "worldkit://acceptance-target/central-ascent@1",
        contributionId: "spawn-ground-contribution",
        colliderId: "spawn-ground",
        role: "ground",
        requiresOverlay: true,
      }],
      criticalTraversalChecks: [{
        acceptanceTargetRef:
          "worldkit://acceptance-target/upper-t-junction@1",
        id: "reach-junction",
        evidenceKind: "scripted-fixed-input",
        expectation: "pass",
        checkpointIds: ["junction", "spawn"],
        fixedInputSequence: [{
          actions: ["move-forward"],
          axes: { moveYRatio: 1 },
          ticks: 12,
        }],
      }],
      deterministicBuild: {
        acceptanceTargetRef:
          "worldkit://acceptance-target/central-ascent@1",
        requiresCandidateReplay: true,
        requiresWorldPackageIdentityAgreement: true,
        requiresBuildIdentityAgreement: true,
        requiresCaptureIdentityAgreement: true,
      },
    },
  } as const;
}

function authoringManifestValue() {
  return {
    kind: "native-block-authoring",
    schemaVersion: 1,
    entryModulePath: "scene.ts",
    blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
    visualGroups: [{
      visualGroupId: "central-ascent-group",
      acceptanceTargetRef:
        "worldkit://acceptance-target/central-ascent@1",
      semanticClassId: "worldkit.native-block.group.central-ascent",
      identityColorHex: "#AEB8C4",
    }, {
      visualGroupId: "upper-t-junction-group",
      acceptanceTargetRef:
        "worldkit://acceptance-target/upper-t-junction@1",
      semanticClassId: "worldkit.native-block.group.upper-t-junction",
      identityColorHex: "#C9A96B",
    }],
  } as const;
}

function checkedLayoutValue() {
  const centralBlock = {
    id: "central-ascent-block",
    shape: "full",
    paletteRole: "route",
    visualGroupId: "central-ascent-group",
    centerMetersXYZ: [0, 0.5, -1],
    rotationQuarterTurnsY: 0,
    sizeMetersXYZ: [1, 1, 1],
    minimumMetersXYZ: [-0.5, 0, -1.5],
    maximumMetersXYZ: [0.5, 1, -0.5],
    occupiedMicroCellKeys: ["0,0,-3"],
  } as const;
  const upperBlock = {
    id: "upper-t-junction-block",
    shape: "full",
    paletteRole: "structure",
    visualGroupId: "upper-t-junction-group",
    centerMetersXYZ: [0, 1.5, -2],
    rotationQuarterTurnsY: 0,
    sizeMetersXYZ: [1, 1, 1],
    minimumMetersXYZ: [-0.5, 1, -2.5],
    maximumMetersXYZ: [0.5, 2, -1.5],
    occupiedMicroCellKeys: ["0,2,-5"],
  } as const;
  return {
    kind: "babylon-native-block-checked-layout",
    schemaVersion: 1,
    layout: {
      blocks: [centralBlock, upperBlock],
      issues: [],
      exposedTopSurfaceCellKeys: ["0,1,-3", "0,3,-5"],
      boundarySegmentKeys: ["central", "upper"],
      structuralStepTransitionKeys: ["central>upper"],
      unsupportedBlockIds: [],
    },
    checkResult: {
      kind: "babylon-native-block-profile-check-result",
      schemaVersion: 1,
      id: "cloud-temple-check",
      outcome: "passed",
      diagnostics: [],
      metrics: {
        blockCount: 2,
        blockCountByShape: {
          full: 2, half: 0, quarter: 0, small: 0, step: 0,
        },
        blockCountByPaletteRole: {
          ground: 0,
          route: 1,
          structure: 1,
          hazard: 0,
          "water-like-visual": 0,
          "background-mass": 0,
        },
        occupiedMicroCellCount: 2,
        exposedTopSurfaceCellCount: 2,
        boundarySegmentCount: 2,
        structuralStepTransitionCount: 1,
        unsupportedBlockCount: 0,
        structuralRouteComponentCount: 1,
        visualGroupCount: 2,
      },
      visualGroups: [{
        id: "central-ascent-group",
        blockIds: ["central-ascent-block"],
        paletteRoles: ["route"],
        minimumMetersXYZ: [-0.5, 0, -1.5],
        maximumMetersXYZ: [0.5, 1, -0.5],
      }, {
        id: "upper-t-junction-group",
        blockIds: ["upper-t-junction-block"],
        paletteRoles: ["structure"],
        minimumMetersXYZ: [-0.5, 1, -2.5],
        maximumMetersXYZ: [0.5, 2, -1.5],
      }],
    },
    records: [],
  } as const;
}

function checkpointSpatialCriteria() {
  return [{
    kind: "reach-bounds",
    checkpointId: "junction",
    expectation: "reach",
    sourceVisualGroupId: "upper-t-junction-group",
    sourceBoundsMeters: {
      minimumMetersXYZ: [-0.5, 1, -2.5],
      maximumMetersXYZ: [0.5, 2, -1.5],
    },
    capsuleRadiusMeters: 0.35,
    toleranceMeters: 0.05,
  }, {
    kind: "pass-plane",
    checkpointId: "spawn",
    expectation: "pass",
    sourceVisualGroupId: "central-ascent-group",
    sourceBoundsMeters: {
      minimumMetersXYZ: [-0.5, 0, -1.5],
      maximumMetersXYZ: [0.5, 1, -0.5],
    },
    axis: "z",
    sourceFace: "minimum",
    planeMeters: -1.5,
    expectedCenterSide: "negative",
    capsuleRadiusMeters: 0.35,
    toleranceMeters: 0.05,
  }] as const;
}

function contribution() {
  return {
    kind: "babylon-native-scene-contribution",
    schemaVersion: 1,
    sceneModuleRef: "worldkit://native-scene/cloud-temple@1",
    sceneModuleId: "cloud-temple-native",
    profileSettlement: {
      kind: "host-snapshot" as const,
      profileRef:
        "worldkit://native-scene-profile/whitebox.blocks@1" as const,
      targetCount: 2,
      profileInventoryHash: H("e"),
      settledVisualHash: H("f"),
    },
    spawnMarker: {
      id: "player-spawn",
      positionMetersXYZ: [0, 1.1, 18] as const,
      facingRadians: Math.PI,
    },
    staticColliders: [createBabylonNativeStaticColliderContributionV1({
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
    })],
  };
}

function bindInput(overrides: Record<string, unknown> = {}) {
  const reconstructionCase = parseWorldReconstructionCaseV1(caseValue());
  const authoringManifest = parseNativeBlockAuthoringManifestV1(
    authoringManifestValue(),
  );
  const checkedLayout = checkedLayoutValue();
  const frozenContribution = contribution();
  return {
    case: reconstructionCase,
    authoringManifest,
    authoringManifestHash:
      hashNativeBlockAuthoringManifestV1(authoringManifest),
    checkedLayout,
    checkedLayoutInventoryHash:
      hashBabylonNativeBlockCheckedLayoutInventoryV1(checkedLayout),
    contribution: frozenContribution,
    contributionHash:
      hashBabylonNativeSceneContributionV1(frozenContribution),
    checkpointSpatialCriteria: checkpointSpatialCriteria(),
    ...overrides,
  };
}

function bind(overrides: Record<string, unknown> = {}) {
  return bindBlockVisualGroupsToSemanticCaptureTargetsV1(
    bindInput(overrides) as unknown as
      BindBlockVisualGroupsToSemanticCaptureTargetsInputV1,
  );
}

describe("bindBlockVisualGroupsToSemanticCaptureTargetsV1", () => {
  it("consumes the canonical Manifest-to-checked-Layout binding identity", () => {
    const input = bindInput();
    const map = bind();
    expect(parseFormalSemanticCaptureMapV1(map)).toEqual(map);
    expect(map.caseHash).toBe(hashWorldReconstructionCaseV1(input.case));
    expect(map.layoutInventoryHash).toBe(input.checkedLayoutInventoryHash);
    expect(map.bindings.map(({ acceptanceTargetRef, blockVisualGroupId }) => ({
      acceptanceTargetRef,
      blockVisualGroupId,
    }))).toEqual([{
      acceptanceTargetRef:
        "worldkit://acceptance-target/central-ascent@1",
      blockVisualGroupId: "central-ascent-group",
    }, {
      acceptanceTargetRef:
        "worldkit://acceptance-target/upper-t-junction@1",
      blockVisualGroupId: "upper-t-junction-group",
    }]);
    expect(map.bindings[0]).toMatchObject({
      semanticClassId: "worldkit.native-block.group.central-ascent",
      identityColor: "#AEB8C4",
      authoringManifestHash: input.authoringManifestHash,
      layoutInventoryHash: input.checkedLayoutInventoryHash,
      contributionHash: input.contributionHash,
    });
    expect(map.traversalCheckBindings[0]).toMatchObject({
      traversalCheckId: "reach-junction",
      checkpointCriteria: checkpointSpatialCriteria(),
    });
    expect(hashFormalSemanticCaptureMapV1(bind())).toBe(
      hashFormalSemanticCaptureMapV1(map),
    );
  });

  it("rejects the obsolete lowercase Manifest dialect instead of translating it", () => {
    const lowercaseManifest = {
      ...authoringManifestValue(),
      visualGroups: authoringManifestValue().visualGroups.map((group) => ({
        ...group,
        identityColorHex: group.identityColorHex.toLowerCase(),
      })),
    };
    expect(() => bind({
      authoringManifest: lowercaseManifest,
      authoringManifestHash: H("9"),
    })).toThrowError("FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID");
  });

  it("rejects stale formal Manifest, full checked Layout, or Contribution identity", () => {
    expect(() => bind({ authoringManifestHash: H("9") }))
      .toThrowError("FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID");
    expect(() => bind({ checkedLayoutInventoryHash: H("9") }))
      .toThrowError("FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID");
    expect(() => bind({ contributionHash: H("9") }))
      .toThrowError("FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID");
  });

  it("rejects a checked Layout group omitted from the formal Manifest binding", () => {
    const manifest = authoringManifestValue();
    expect(() => bind({
      authoringManifest: {
        ...manifest,
        visualGroups: [manifest.visualGroups[0]],
      },
      authoringManifestHash: H("9"),
    })).toThrowError("FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID");
  });

  it("rejects checkpoint criteria stale against full Layout bounds or Contribution colliders", () => {
    const staleBounds = checkpointSpatialCriteria().map((criterion) =>
      criterion.checkpointId === "junction"
        ? {
            ...criterion,
            sourceBoundsMeters: {
              minimumMetersXYZ: [-1, 1, -2.5],
              maximumMetersXYZ: [0.5, 2, -1.5],
            },
          }
        : criterion);
    expect(() => bind({ checkpointSpatialCriteria: staleBounds }))
      .toThrowError("FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID");
    expect(() => bind({
      checkpointSpatialCriteria: [{
        kind: "block-plane",
        checkpointId: "junction",
        expectation: "block",
        sourceVisualGroupId: "upper-t-junction-group",
        sourceBoundsMeters: {
          minimumMetersXYZ: [-0.5, 1, -2.5],
          maximumMetersXYZ: [0.5, 2, -1.5],
        },
        colliderId: "missing-wall",
        axis: "x",
        sourceFace: "minimum",
        planeMeters: -0.5,
        expectedCenterSide: "negative",
        capsuleRadiusMeters: 0.35,
        toleranceMeters: 0.05,
      }, checkpointSpatialCriteria()[1]],
    })).toThrowError("FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID");
  });

  it("rejects Mesh/tag/name inference fields at the Capture boundary", () => {
    expect(() => bindBlockVisualGroupsToSemanticCaptureTargetsV1({
      ...bindInput(),
      meshNameByGroupId: { "central-ascent-group": "AscentMesh" },
    } as unknown as BindBlockVisualGroupsToSemanticCaptureTargetsInputV1))
      .toThrowError("FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID");
  });
});
