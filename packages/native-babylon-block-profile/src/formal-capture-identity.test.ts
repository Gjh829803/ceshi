import {
  createBabylonNativeStaticColliderContributionV1,
  hashBabylonNativeSceneContributionV1,
  hashBabylonNativeBlockMaterializerMetadataV1,
  hashFormalWorldCaptureIntentV1,
  hashFormalSemanticCaptureMapV1,
  parseBabylonNativeBlockMaterializerMetadataV1,
  parseFormalSemanticCaptureMapV1,
  parseFormalWorldCaptureIntentV1,
} from "@whitebox-world/runtime-contracts";
import {
  hashWorldReconstructionCaseV1,
  parseWorldReconstructionCaseV1,
} from "@whitebox-world/validation";
import { describe, expect, it } from "vitest";

import {
  bindNativeBlockAuthoringManifestToCheckedLayoutV1,
  hashBabylonNativeBlockCheckedLayoutInventoryV1,
  hashNativeBlockAuthoringManifestV1,
  parseNativeBlockAuthoringManifestV1,
} from "./authoring-manifest.js";
import {
  bindBlockMaterializerMetadataToSemanticCaptureTargetsV1,
  type BindBlockMaterializerMetadataToSemanticCaptureTargetsInputV1,
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
    formalCaptureIntentRef: "inputs/formal-world-capture-intent.json",
    formalCaptureIntentHash: H("d"),
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
        viewRequirements: [{
          viewId: "opening",
          mode: "reference-projection-required",
          normalizedBounds: {
            minXBasisPoints: 100,
            minYBasisPoints: 200,
            maxXBasisPoints: 500,
            maxYBasisPoints: 800,
          },
          normalizedCenter: { xBasisPoints: 300, yBasisPoints: 500 },
          coverageBasisPoints: 2_400,
        }, {
          viewId: "world-side",
          mode: "presence-required",
        }, {
          viewId: "world-top-down",
          mode: "presence-required",
        }],
      }, {
        acceptanceTargetRef:
          "worldkit://acceptance-target/upper-t-junction@1",
        visualGroupId: "upper-t-junction-group",
        viewRequirements: [{
          viewId: "opening",
          mode: "reference-projection-required",
          normalizedBounds: {
            minXBasisPoints: 600,
            minYBasisPoints: 100,
            maxXBasisPoints: 900,
            maxYBasisPoints: 400,
          },
          normalizedCenter: { xBasisPoints: 750, yBasisPoints: 250 },
          coverageBasisPoints: 900,
        }, {
          viewId: "world-side",
          mode: "presence-required",
        }, {
          viewId: "world-top-down",
          mode: "presence-required",
        }],
      }],
      openingComposition: {
        acceptanceTargetRef:
          "worldkit://acceptance-target/central-ascent@1",
        targetRefs: [
          "worldkit://composition-target/central-ascent@1",
          "worldkit://composition-target/upper-t-junction@1",
        ],
        regions: [{
          targetRef: "worldkit://composition-target/central-ascent@1",
          normalizedBounds: {
            minXBasisPoints: 100,
            minYBasisPoints: 200,
            maxXBasisPoints: 500,
            maxYBasisPoints: 800,
          },
        }, {
          targetRef: "worldkit://composition-target/upper-t-junction@1",
          normalizedBounds: {
            minXBasisPoints: 600,
            minYBasisPoints: 100,
            maxXBasisPoints: 900,
            maxYBasisPoints: 400,
          },
        }],
        anchors: [{
          targetRef: "worldkit://composition-target/central-ascent@1",
          normalizedCenter: { xBasisPoints: 300, yBasisPoints: 500 },
        }, {
          targetRef: "worldkit://composition-target/upper-t-junction@1",
          normalizedCenter: { xBasisPoints: 750, yBasisPoints: 250 },
        }],
        orderedTargetRefs: [
          "worldkit://composition-target/central-ascent@1",
          "worldkit://composition-target/upper-t-junction@1",
        ],
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
      }, {
        acceptanceTargetRef:
          "worldkit://acceptance-target/upper-t-junction@1",
        contributionId: "upper-blocker-contribution",
        colliderId: "upper-blocker",
        role: "blocker",
        requiresOverlay: true,
      }, {
        acceptanceTargetRef:
          "worldkit://acceptance-target/upper-t-junction@1",
        contributionId: "upper-step-contribution",
        colliderId: "upper-step",
        role: "step",
        requiresOverlay: true,
      }],
      groundConnectivity: {
        requireSingleReachableComponent: true,
        requiredTraversalBands: [{
          acceptanceTargetRef:
            "worldkit://acceptance-target/upper-t-junction@1",
          id: "central-ascent-band",
          centerlineStandPositionsXYZMeters: [
            { xMeters: 0, yMeters: 1, zMeters: 0 },
            { xMeters: 0, yMeters: 2, zMeters: -2 },
          ],
          halfWidthMeters: 1,
        }],
      },
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
    openingCamera: { mode: "third-person" as const, distanceMeters: 5, targetHeightMeters: 1.2, pitchRadians: 0.18, fovDegrees: 56 },
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

function resolvedCheckpointSpatialCriteria() {
  return [{
    kind: "reach-position",
    checkpointId: "junction",
    expectation: "reach",
    sourceVisualGroupId: "upper-t-junction-group",
    standPositionMetersXYZ: [0, 2, -2] as const,
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

function authoredCheckpointSpatialCriteria() {
  return [{
    kind: "reach-position",
    standPositionMetersXYZ: [0, 2, -2] as const,
    checkpointId: "junction",
    expectation: "reach",
    sourceVisualGroupId: "upper-t-junction-group",
    capsuleRadiusMeters: 0.35,
    toleranceMeters: 0.05,
  }, {
    kind: "pass-plane",
    checkpointId: "spawn",
    expectation: "pass",
    sourceVisualGroupId: "central-ascent-group",
    axis: "z",
    sourceFace: "minimum",
    expectedCenterSide: "negative",
    capsuleRadiusMeters: 0.35,
    toleranceMeters: 0.05,
  }] as const;
}

function formalCaptureIntentValue(overrides: Record<string, unknown> = {}) {
  return parseFormalWorldCaptureIntentV1({
    kind: "formal-world-capture-intent",
    schemaVersion: 1,
    id: "cloud-temple.case.formal-world-capture-intent",
    captureProfile: {
      widthPixels: 1280,
      heightPixels: 720,
      devicePixelRatio: 1,
    },
    semanticCaptureTargetBindings: [{
      acceptanceTargetRef:
        "worldkit://acceptance-target/central-ascent@1",
      compositionTargetRef:
        "worldkit://composition-target/central-ascent@1",
      topologyNodeId: "central-ascent",
      semanticLayerId: "ground",
      blockVisualGroupId: "central-ascent-group",
    }, {
      acceptanceTargetRef:
        "worldkit://acceptance-target/upper-t-junction@1",
      compositionTargetRef:
        "worldkit://composition-target/upper-t-junction@1",
      topologyNodeId: "upper-t-junction",
      semanticLayerId: "upper",
      blockVisualGroupId: "upper-t-junction-group",
    }],
    topologyRelations: [{
      fromNodeId: "central-ascent",
      relation: "connects-to",
      toNodeId: "upper-t-junction",
      measurementSource: "scripted-traversal",
      traversalCheckId: "reach-junction",
    }],
    checkpointSpatialCriteria: authoredCheckpointSpatialCriteria(),
    ...overrides,
  });
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
      runtimeRole: "scene-static-collider",
      worldPositionsMetersXYZ: [
        0, 0, 0,
        2, 0, 0,
        0, 0, 2,
        0, 2, 0,
      ],
      triangleIndices: [0, 1, 2, 0, 3, 1, 0, 2, 3, 1, 3, 2],
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
  const formalCaptureIntent = formalCaptureIntentValue();
  const reconstructionCase = parseWorldReconstructionCaseV1({
    ...caseValue(),
    formalCaptureIntentHash:
      hashFormalWorldCaptureIntentV1(formalCaptureIntent),
  });
  const authoringManifest = parseNativeBlockAuthoringManifestV1(
    authoringManifestValue(),
  );
  const checkedLayout = checkedLayoutValue();
  const frozenContribution = contribution();
  const contributionHash = hashBabylonNativeSceneContributionV1(
    frozenContribution,
  );
  const authoringManifestHash =
    hashNativeBlockAuthoringManifestV1(authoringManifest);
  const checkedLayoutInventoryHash =
    hashBabylonNativeBlockCheckedLayoutInventoryV1(checkedLayout);
  const binding = bindNativeBlockAuthoringManifestToCheckedLayoutV1({
    reconstructionCase,
    authoringManifest,
    authoringManifestHash,
    checkedLayout,
    checkedLayoutInventoryHash,
    contributionHash,
    frozenContributionHash: contributionHash,
  });
  const materializerMetadata =
    parseBabylonNativeBlockMaterializerMetadataV1({
      kind: "babylon-native-block-materializer-metadata",
      openingCamera: { mode: "third-person" as const, distanceMeters: 5, targetHeightMeters: 1.2, pitchRadians: 0.18, fovDegrees: 56 },
      schemaVersion: 1,
      nativeSceneProfileRef:
        "worldkit://native-scene-profile/whitebox.blocks@1",
      caseHash: binding.caseHash,
      authoringManifestHash,
      checkedLayoutInventoryHash,
      contributionHash,
      profileInventoryHash: frozenContribution.profileSettlement.profileInventoryHash,
      settledVisualHash: frozenContribution.profileSettlement.settledVisualHash,
      blocks: checkedLayout.layout.blocks.map((block) => ({
        blockId: block.id,
        runtimeEntityId: `native-block:${block.id}`,
        semanticCaptureClassId:
          `worldkit.native-block.group.${block.visualGroupId ?? "ungrouped"}`,
        shape: block.shape,
        paletteRole: block.paletteRole,
        ...(block.visualGroupId === undefined
          ? {}
          : { visualGroupId: block.visualGroupId }),
        centerMetersXYZ: block.centerMetersXYZ,
        rotationQuarterTurnsY: block.rotationQuarterTurnsY,
        sizeMetersXYZ: block.sizeMetersXYZ,
      })),
      visualGroups: binding.visualGroups,
      colliderJoins: [{
        colliderId: "spawn-ground",
        sourceBlockIds: [checkedLayout.layout.blocks[0]!.id],
        visualGroupIds: ["central-ascent-group"],
        proxyKind: "continuous-walkable-surface",
        minimumMetersXYZ: [0, 0, 0],
        maximumMetersXYZ: [2, 2, 2],
        vertexCount: 4,
        triangleCount: 4,
        topologyHash: H("9"),
      }],
    });
  return {
    case: reconstructionCase,
    materializerMetadata,
    materializerMetadataHash:
      hashBabylonNativeBlockMaterializerMetadataV1(materializerMetadata),
    contribution: frozenContribution,
    formalCaptureIntent,
    ...overrides,
  };
}

function bind(overrides: Record<string, unknown> = {}) {
  return bindBlockMaterializerMetadataToSemanticCaptureTargetsV1(
    bindInput(overrides) as unknown as
      BindBlockMaterializerMetadataToSemanticCaptureTargetsInputV1,
  );
}

describe("bindBlockMaterializerMetadataToSemanticCaptureTargetsV1", () => {
  it("does not require the Case-only supported-spawn target to have a visual binding", () => {
    const input = bindInput();
    const supportedSpawnTarget =
      "worldkit://acceptance-target/supported-spawn@1";
    const reconstructionCase = parseWorldReconstructionCaseV1({
      ...input.case,
      acceptanceTargetRefs: [
        input.case.acceptanceTargetRefs[0],
        supportedSpawnTarget,
        input.case.acceptanceTargetRefs[1],
      ],
      expected: {
        ...input.case.expected,
        spawnSupport: {
          ...input.case.expected.spawnSupport,
          acceptanceTargetRef: supportedSpawnTarget,
        },
        colliders: input.case.expected.colliders.map((collider) =>
          collider.colliderId === input.case.expected.spawnSupport.supportColliderId
            ? { ...collider, acceptanceTargetRef: supportedSpawnTarget }
            : collider
        ),
      },
    });
    const materializerMetadata =
      parseBabylonNativeBlockMaterializerMetadataV1({
        ...input.materializerMetadata,
        caseHash: hashWorldReconstructionCaseV1(reconstructionCase),
      });

    expect(() => bind({
      case: reconstructionCase,
      materializerMetadata,
      materializerMetadataHash:
        hashBabylonNativeBlockMaterializerMetadataV1(materializerMetadata),
    })).not.toThrow();
  });

  it("consumes the canonical Manifest-to-checked-Layout binding identity", () => {
    const input = bindInput();
    const map = bind();
    expect(parseFormalSemanticCaptureMapV1(map)).toEqual(map);
    expect(map.caseRef).toBe(
      "artifact://world-reconstruction-case/cloud-temple.case/case.json",
    );
    expect(map.caseHash).toBe(hashWorldReconstructionCaseV1(input.case));
    expect(map.layoutInventoryHash).toBe(
      input.materializerMetadata.checkedLayoutInventoryHash,
    );
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
      compositionTargetRef:
        "worldkit://composition-target/central-ascent@1",
      topologyNodeId: "central-ascent",
      semanticLayerId: "ground",
      semanticClassId: "worldkit.native-block.group.central-ascent",
      identityColor: "#AEB8C4",
      authoringManifestHash: input.materializerMetadata.authoringManifestHash,
      layoutInventoryHash: input.materializerMetadata.checkedLayoutInventoryHash,
      contributionHash: input.materializerMetadata.contributionHash,
    });
    expect(map.topologyRelations).toEqual([{
      fromNodeId: "central-ascent",
      relation: "connects-to",
      toNodeId: "upper-t-junction",
      measurementSource: "scripted-traversal",
      traversalCheckId: "reach-junction",
    }]);
    expect(map.traversalCheckBindings[0]).toMatchObject({
      traversalCheckId: "reach-junction",
      checkpointCriteria: resolvedCheckpointSpatialCriteria(),
    });
    expect(hashFormalSemanticCaptureMapV1(bind())).toBe(
      hashFormalSemanticCaptureMapV1(map),
    );
  });

  it("preserves the executable proof identity for every topology measurement source", () => {
    const input = bindInput();
    const expectedTopologyRelations = [{
      fromNodeId: "central-ascent",
      relation: "above",
      toNodeId: "upper-t-junction",
    }, {
      fromNodeId: "central-ascent",
      relation: "blocks",
      toNodeId: "upper-t-junction",
    }, {
      fromNodeId: "central-ascent",
      relation: "connects-to",
      toNodeId: "upper-t-junction",
    }, {
      fromNodeId: "upper-t-junction",
      relation: "contains",
      toNodeId: "central-ascent",
    }] as const;
    const topologyRelations = [{
      fromNodeId: "central-ascent",
      relation: "above",
      toNodeId: "upper-t-junction",
      measurementSource: "package-bounds",
      fromVisualGroupId: "central-ascent-group",
      toVisualGroupId: "upper-t-junction-group",
    }, {
      fromNodeId: "central-ascent",
      relation: "blocks",
      toNodeId: "upper-t-junction",
      measurementSource: "sdk-collider",
      colliderId: "spawn-ground",
      sourceVisualGroupId: "central-ascent-group",
    }, {
      fromNodeId: "central-ascent",
      relation: "connects-to",
      toNodeId: "upper-t-junction",
      measurementSource: "scripted-traversal",
      traversalCheckId: "reach-junction",
    }, {
      fromNodeId: "upper-t-junction",
      relation: "contains",
      toNodeId: "central-ascent",
      measurementSource: "sdk-support",
      subjectEntityId: "player",
      colliderId: "spawn-ground",
    }] as const;
    const formalCaptureIntent = formalCaptureIntentValue({ topologyRelations });
    const reconstructionCase = parseWorldReconstructionCaseV1({
      ...caseValue(),
      formalCaptureIntentHash:
        hashFormalWorldCaptureIntentV1(formalCaptureIntent),
      expected: {
        ...caseValue().expected,
        topology: {
          ...caseValue().expected.topology,
          relations: expectedTopologyRelations,
        },
      },
    });
    const materializerMetadata =
      parseBabylonNativeBlockMaterializerMetadataV1({
        ...input.materializerMetadata,
        caseHash: hashWorldReconstructionCaseV1(reconstructionCase),
      });

    expect(bind({
      case: reconstructionCase,
      materializerMetadata,
      materializerMetadataHash:
        hashBabylonNativeBlockMaterializerMetadataV1(materializerMetadata),
      formalCaptureIntent,
    }).topologyRelations).toEqual(topologyRelations);
  });

  it("rejects stale Package materializer identity", () => {
    expect(() => bind({ materializerMetadataHash: H("9") }))
      .toThrowError("FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID");
  });

  it("preserves authored reach endpoints and resolves pass criteria from verified visual-group bounds", () => {
    expect(bind().traversalCheckBindings[0]?.checkpointCriteria).toEqual(
      resolvedCheckpointSpatialCriteria(),
    );
  });

  it("does not replace a frozen local endpoint with an expanded cross-region visual-group AABB", () => {
    const input = bindInput();
    const template = input.materializerMetadata.blocks.find(({ visualGroupId }) =>
      visualGroupId === "upper-t-junction-group")!;
    const distantBlocks = [[-19.5, -0.5, -39.5], [19.5, 1.5, 4.5]].map(
      (centerMetersXYZ, index) => ({
        ...structuredClone(template),
        blockId: `upper-t-junction-distant-${index}`,
        runtimeEntityId: `native-block:upper-t-junction-distant-${index}`,
        centerMetersXYZ,
      }),
    );
    const expanded = parseBabylonNativeBlockMaterializerMetadataV1({
      ...input.materializerMetadata,
      blocks: [...input.materializerMetadata.blocks, ...distantBlocks],
      visualGroups: input.materializerMetadata.visualGroups.map((group) =>
        group.visualGroupId === "upper-t-junction-group" ? {
          ...group,
          blockIds: [...group.blockIds, ...distantBlocks.map(({ blockId }) => blockId)],
          minimumMetersXYZ: [-20, -1, -40],
          maximumMetersXYZ: [20, 2, 5],
        } : group),
    });
    const result = bindBlockMaterializerMetadataToSemanticCaptureTargetsV1({
      ...input,
      materializerMetadata: expanded,
      materializerMetadataHash: hashBabylonNativeBlockMaterializerMetadataV1(expanded),
    });
    expect(result.traversalCheckBindings[0]!.checkpointCriteria[0])
      .toEqual(authoredCheckpointSpatialCriteria()[0]);
  });

  it("rejects a plane criterion when Spawn already starts on its expected crossed side", () => {
    const input = bindInput();
    const invalidIntent = formalCaptureIntentValue({
      checkpointSpatialCriteria: [
        authoredCheckpointSpatialCriteria()[0],
        {
          ...authoredCheckpointSpatialCriteria()[1],
          expectedCenterSide: "positive",
        },
      ],
    });
    const invalidCase = parseWorldReconstructionCaseV1({
      ...input.case,
      formalCaptureIntentHash: hashFormalWorldCaptureIntentV1(invalidIntent),
    });
    const materializerMetadata =
      parseBabylonNativeBlockMaterializerMetadataV1({
        ...input.materializerMetadata,
        caseHash: hashWorldReconstructionCaseV1(invalidCase),
      });

    expect(() => bind({
      case: invalidCase,
      materializerMetadata,
      materializerMetadataHash:
        hashBabylonNativeBlockMaterializerMetadataV1(materializerMetadata),
      formalCaptureIntent: invalidIntent,
    })).toThrowError(
      "spawn must start with Spawn on the opposite approach side outside capsule clearance",
    );
  });

  it("rejects a Block plane whose collider does not exist", () => {
    expect(() => bind({
      formalCaptureIntent: formalCaptureIntentValue({
        checkpointSpatialCriteria: [{
          kind: "block-plane",
          checkpointId: "junction",
          expectation: "block",
          sourceVisualGroupId: "upper-t-junction-group",
          colliderId: "missing-wall",
          axis: "x",
          sourceFace: "minimum",
          expectedCenterSide: "negative",
          capsuleRadiusMeters: 0.35,
          toleranceMeters: 0.05,
        }, authoredCheckpointSpatialCriteria()[1]],
      }),
    })).toThrowError("FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID");
  });

  it("resolves a Block plane from the declared visual-group Blocks inside a multi-group Collider", () => {
    const input = bindInput();
    const blockedIntent = formalCaptureIntentValue({
      checkpointSpatialCriteria: [authoredCheckpointSpatialCriteria()[0], {
        kind: "block-plane",
        checkpointId: "spawn",
        expectation: "block",
        sourceVisualGroupId: "central-ascent-group",
        colliderId: "spawn-ground",
        axis: "x",
        sourceFace: "maximum",
        expectedCenterSide: "positive",
        capsuleRadiusMeters: 0.35,
        toleranceMeters: 0.05,
      }, {
        kind: "reach-position",
        standPositionMetersXYZ: [0, 0, 0] as const,
        checkpointId: "upper-support",
        expectation: "reach",
        sourceVisualGroupId: "upper-t-junction-group",
        capsuleRadiusMeters: 0.35,
        toleranceMeters: 0.05,
      }],
    });
    const blockedCase = parseWorldReconstructionCaseV1({
      ...caseValue(),
      formalCaptureIntentHash: hashFormalWorldCaptureIntentV1(blockedIntent),
      expected: {
        ...caseValue().expected,
        criticalTraversalChecks: [{
          ...caseValue().expected.criticalTraversalChecks[0],
          expectation: "block",
        }, {
          acceptanceTargetRef:
            "worldkit://acceptance-target/upper-t-junction@1",
          id: "traverse-upper-support",
          evidenceKind: "scripted-fixed-input",
          expectation: "pass",
          checkpointIds: ["upper-support"],
          fixedInputSequence: [{
            actions: ["move-forward"],
            axes: { moveYRatio: 1 },
            ticks: 1,
          }],
        }],
      },
    });
    const materializerMetadata = parseBabylonNativeBlockMaterializerMetadataV1({
      ...input.materializerMetadata,
      caseHash: hashWorldReconstructionCaseV1(blockedCase),
      colliderJoins: [{
        ...input.materializerMetadata.colliderJoins[0],
        sourceBlockIds: [
          "central-ascent-block",
          "upper-t-junction-block",
        ],
        visualGroupIds: [
          "central-ascent-group",
          "upper-t-junction-group",
        ],
      }],
    });

    const map = bind({
      case: blockedCase,
      materializerMetadata,
      materializerMetadataHash:
        hashBabylonNativeBlockMaterializerMetadataV1(materializerMetadata),
      formalCaptureIntent: blockedIntent,
    });

    expect(map.traversalCheckBindings[0]?.checkpointCriteria[1]).toEqual({
      kind: "block-plane",
      checkpointId: "spawn",
      expectation: "block",
      sourceVisualGroupId: "central-ascent-group",
      sourceBoundsMeters: {
        minimumMetersXYZ: [-0.5, 0, -1.5],
        maximumMetersXYZ: [0.5, 1, -0.5],
      },
      colliderId: "spawn-ground",
      axis: "x",
      sourceFace: "maximum",
      planeMeters: 0.5,
      expectedCenterSide: "positive",
      capsuleRadiusMeters: 0.35,
      toleranceMeters: 0.05,
    });
  });

  it("rejects a Block plane collider joined to a different visual group", () => {
    const input = bindInput();
    const blockedIntent = formalCaptureIntentValue({
      checkpointSpatialCriteria: [{
        kind: "block-plane",
        checkpointId: "junction",
        expectation: "block",
        sourceVisualGroupId: "upper-t-junction-group",
        colliderId: "spawn-ground",
        axis: "x",
        sourceFace: "minimum",
        expectedCenterSide: "negative",
        capsuleRadiusMeters: 0.35,
        toleranceMeters: 0.05,
      }, authoredCheckpointSpatialCriteria()[1], {
        kind: "reach-position",
        standPositionMetersXYZ: [0, 0, 0] as const,
        checkpointId: "upper-support",
        expectation: "reach",
        sourceVisualGroupId: "upper-t-junction-group",
        capsuleRadiusMeters: 0.35,
        toleranceMeters: 0.05,
      }],
    });
    const blockedCase = parseWorldReconstructionCaseV1({
      ...caseValue(),
      formalCaptureIntentHash: hashFormalWorldCaptureIntentV1(blockedIntent),
      expected: {
        ...caseValue().expected,
        criticalTraversalChecks: [{
          ...caseValue().expected.criticalTraversalChecks[0],
          expectation: "block",
        }, {
          acceptanceTargetRef:
            "worldkit://acceptance-target/upper-t-junction@1",
          id: "traverse-upper-support",
          evidenceKind: "scripted-fixed-input",
          expectation: "pass",
          checkpointIds: ["upper-support"],
          fixedInputSequence: [{
            actions: ["move-forward"],
            axes: { moveYRatio: 1 },
            ticks: 1,
          }],
        }],
      },
    });
    const materializerMetadata =
      parseBabylonNativeBlockMaterializerMetadataV1({
        ...input.materializerMetadata,
        caseHash: hashWorldReconstructionCaseV1(blockedCase),
      });
    expect(() => bind({
      case: blockedCase,
      materializerMetadata,
      materializerMetadataHash:
        hashBabylonNativeBlockMaterializerMetadataV1(materializerMetadata),
      formalCaptureIntent: blockedIntent,
    })).toThrowError("FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID");
  });

  it("rejects Mesh/tag/name inference fields at the Capture boundary", () => {
    expect(() => bindBlockMaterializerMetadataToSemanticCaptureTargetsV1({
      ...bindInput(),
      meshNameByGroupId: { "central-ascent-group": "AscentMesh" },
    } as unknown as BindBlockMaterializerMetadataToSemanticCaptureTargetsInputV1))
      .toThrowError("FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID");
  });

  it("requires an explicit complete one-to-one Case and Package semantic mapping", () => {
    const input = bindInput();
    const missing = { ...input } as Record<string, unknown>;
    delete missing.formalCaptureIntent;
    expect(() => bindBlockMaterializerMetadataToSemanticCaptureTargetsV1(
      missing as unknown as BindBlockMaterializerMetadataToSemanticCaptureTargetsInputV1,
    )).toThrowError("FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID");
    expect(() => bind({
      formalCaptureIntent: {
        ...input.formalCaptureIntent,
        semanticCaptureTargetBindings:
          input.formalCaptureIntent.semanticCaptureTargetBindings.slice(0, 1),
      },
    })).toThrowError("FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID");
    expect(() => bind({
      formalCaptureIntent: {
        ...input.formalCaptureIntent,
        semanticCaptureTargetBindings:
          input.formalCaptureIntent.semanticCaptureTargetBindings.map(
            (binding, index) => index === 1
              ? { ...binding, compositionTargetRef:
                  "worldkit://composition-target/central-ascent@1" }
              : binding,
          ),
      },
    })).toThrowError("FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID");
    expect(() => bind({
      formalCaptureIntent: {
        ...input.formalCaptureIntent,
        topologyRelations: [{
          ...input.formalCaptureIntent.topologyRelations[0],
          toNodeId: "central-ascent",
        }],
      },
    })).toThrowError("FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID");
  });
});
