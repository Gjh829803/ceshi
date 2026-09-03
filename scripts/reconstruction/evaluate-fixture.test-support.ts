import {
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  hashBabylonNativeBlockMaterializerMetadataV1,
  hashBabylonNativeSceneContributionV1,
  createBabylonNativeStaticColliderContributionV1,
  hashFormalArtifactViewRequestV1,
  hashFormalColliderOverlayObservationV1,
  hashFormalColliderOverlayRequestV1,
  hashFormalOpeningObservationV1,
  hashFormalScriptedTraversalObservationV1,
  hashFormalScriptedTraversalRequestV1,
  hashFormalSemanticCaptureMapV1,
  hashFormalSpawnSupportObservationV1,
  hashFormalWorldCaptureIntentV1,
  hashFormalWorldCaptureRequestV1,
  parseBabylonNativeBlockMaterializerMetadataV1,
  parseFormalColliderOverlayObservationV1,
  parseFormalOpeningObservationV1,
  parseFormalScriptedTraversalObservationV1,
  parseFormalSpawnSupportObservationV1,
  parseFormalWorldCaptureReceiptV1,
  parseFormalWorldCaptureIntentV1,
  parseWorldRuntimeSnapshotV4,
  type FormalWorldCaptureIntentV1,
  type FormalTraversalCheckpointIntentCriterionV1,
  type FormalTraversalCheckpointSpatialCriterionV1,
} from "@whitebox-world/runtime-contracts";
import {
  hashSceneAuthoringAttemptResultV1,
  hashSceneAuthoringAttemptV1,
} from "@whitebox-world/scene-authoring-contracts";
import {
  hashNativeBlockAuthoringManifestV1,
  parseNativeBlockAuthoringManifestV1,
} from "@whitebox-world/native-babylon-block-profile";
import {
  createBabylonNativeWorldPackageV1,
  verifyWorldPackageDirectoryV1,
} from "@whitebox-world/world-package";
import {
  createBabylonNativeBlockWorldPackageTestInputV1,
} from "@whitebox-world/world-package/testing";
import {
  hashWorldReconstructionCaseV1,
  hashWorldReconstructionEvaluationProfileV1,
  parseWorldReconstructionCaseV1,
  parseWorldReconstructionEvaluationProfileV1,
} from "@whitebox-world/validation";
import type { BuildWorldReconstructionEvidenceSetInputV1 } from "./evaluate-evidence-set.js";

const H = (character: string) => `sha256:${character.repeat(64)}` as const;
const GROUND_STATIC_TRAVERSAL_SURFACE_PROFILE_REF =
  "worldkit://traversal-surface-profile/ground.static@1" as const;

export interface EvidenceSetFixtureOptionsV1 {
  readonly allDimensionsPass?: boolean;
  readonly attemptIdentity?: Readonly<{
    readonly attemptIndex: 1;
    readonly generationRequestRef: string;
    readonly generationRequestHash: Sha256HashV1;
  }>;
  readonly includePaletteTraversalDisagreement?: boolean;
  readonly independentTraversalReset?: boolean;
  readonly traversalCheckExpectation?: "pass" | "block";
  readonly traversalCheckpointCriteria?: readonly FormalTraversalCheckpointSpatialCriterionV1[];
  readonly traversalCheckpoints?: readonly Readonly<{
    checkpointId: string;
    outcome: "reached" | "passed" | "blocked";
    observedAtTick: number;
  }>[];
}
const ACCEPTANCE_TARGET_REF =
  "worldkit://acceptance-target/package-fixture-opening@1";
const UPPER_TARGET_REF =
  "worldkit://acceptance-target/package-fixture-upper@1";
const COMPOSITION_TARGET_REF =
  "worldkit://composition-target/package-fixture-opening@1";
const UPPER_COMPOSITION_TARGET_REF =
  "worldkit://composition-target/package-fixture-upper@1";
const CASE_REF =
  "artifact://world-reconstruction-case/package-fixture.case/case.json";
const PROFILE_REF = "artifact://case/package-fixture/evaluation-profile.json";

function authoredCheckpointCriterion(
  criterion: FormalTraversalCheckpointSpatialCriterionV1,
): FormalTraversalCheckpointIntentCriterionV1 {
  if (criterion.kind === "reach-bounds") {
    const { sourceBoundsMeters: _resolvedBounds, ...authored } = criterion;
    return authored;
  }
  const {
    sourceBoundsMeters: _resolvedBounds,
    planeMeters: _resolvedPlane,
    ...authored
  } = criterion;
  return authored;
}

function snapshotValue() {
  return parseWorldRuntimeSnapshotV4({
    kind: "worldkit-runtime-snapshot",
    schemaVersion: 4,
    runtimeSessionId: "runtime-session-package-fixture",
    worldSessionId: "world-session-package-fixture",
    world: {
      publicationEpoch: 0,
      simulationTick: 4,
      worldStateRef: "worldkit://world-state/package-fixture",
      worldStateHash: H("a"),
      subjectStatesByEntityId: {
        player: {
          entityState: {
            id: "player",
            kind: "spatial-entity-state",
            entityDefinitionRef:
              "worldkit://subject-definition/humanoid.third-person@1",
            entityDefinitionHash: H("b"),
            semanticClassId: "subject.humanoid.player",
            lifecycleMode: "active",
            positionMetersXYZ: [0, 1, 0],
            rotationQuaternionXYZW: [0, 0, 0, 1],
            scaleRatioXYZ: [1, 1, 1],
            linearVelocityMetersPerSecondXYZ: [0, 0, 0],
          },
          capabilityStatesById: {
            "locomotion:player": {
              id: "locomotion:player",
              kind: "locomotion-capability-state-v2",
              ownerEntityId: "player",
              locomotionCapabilityRef:
                "worldkit://locomotion-capability/ground.standard@1",
              locomotionCapabilityHash: H("c"),
              locomotion: {
                schemaVersion: 2,
                status: "active",
                mobilityMode: "grounded",
                gait: "idle",
                verticalPhase: "none",
                supportMode: "supported",
                movementMedium: "ground",
                facingYawRadians: 0,
                linearVelocity: { x: 0, y: 0, z: 0 },
                horizontalSpeedMetersPerSecond: 0,
                committedTick: 4,
                phaseEnteredTick: 0,
                transitionSequence: 0,
              },
            },
          },
        },
      },
      gameplayInspection: {
        kind: "worldkit-gameplay-inspection-snapshot",
        schemaVersion: 1,
        projection: "inspection",
        id: "gameplay-inspection:world-session-package-fixture:4",
        runtimeSessionId: "runtime-session-package-fixture",
        worldSessionId: "world-session-package-fixture",
        gameplayModeRef: "worldkit://gameplay-mode/outdoor.default@1",
        phase: "ready",
        simulationTick: 4,
        participantStatesById: {
          primary: { id: "primary", mode: "active" },
        },
        controllerStatesById: {
          primary: { id: "primary", participantId: "primary" },
        },
        relationshipStatesById: {},
        activeActionStatesById: {},
        activatedGameplayFeatureRefs: [],
        lastEventSequence: 0,
      },
    },
    view: { viewStateRevision: 0, camera: { mode: "unbound" } },
    runtime: { phase: "ready", isPaused: false, fixedTimeStepSeconds: 1 / 60 },
    resources: {
      phase: "ready",
      meshCount: 1,
      physicsBodyCount: 1,
      terrainSampleCount: 0,
    },
  });
}

export function createEvidenceSetFixtureInputV1(
  options: EvidenceSetFixtureOptionsV1 = {},
): BuildWorldReconstructionEvidenceSetInputV1 & Readonly<{
  formalCaptureIntent: FormalWorldCaptureIntentV1;
}> {
  const allDimensionsPass = options.allDimensionsPass === true;
  const paletteTraversalDisagreement =
    options.includePaletteTraversalDisagreement === true;
  const traversalCheckExpectation = options.traversalCheckExpectation ?? "pass";
  const needsBlockerCollider = paletteTraversalDisagreement ||
    traversalCheckExpectation === "block";
  const traversalCheckpointCriteria = options.traversalCheckpointCriteria ?? [{
    kind: "reach-bounds" as const,
    checkpointId: "ground",
    expectation: "reach" as const,
    sourceVisualGroupId: "ground-group",
    sourceBoundsMeters: {
      minimumMetersXYZ: [-5, -1, -5] as const,
      maximumMetersXYZ: [5, 0, 5] as const,
    },
    capsuleRadiusMeters: 0.35,
    toleranceMeters: 0.05,
  }];
  const supportTraversalCheckpointCriteria = [{
    kind: "reach-bounds" as const,
    checkpointId: "support-ground",
    expectation: "reach" as const,
    sourceVisualGroupId: "ground-group",
    sourceBoundsMeters: {
      minimumMetersXYZ: [-5, -1, -5] as const,
      maximumMetersXYZ: [5, 0, 5] as const,
    },
    capsuleRadiusMeters: 0.35,
    toleranceMeters: 0.05,
  }];
  const evaluationProfile = parseWorldReconstructionEvaluationProfileV1({
    kind: "world-reconstruction-evaluation-profile",
    schemaVersion: 1,
    id: "package-fixture.profile",
    dimensionIds: [
      "collider",
      "critical-traversal",
      "deterministic-build",
      "opening-composition",
      "semantic-silhouette",
      "spawn-support",
      "topology",
    ],
    maximumRepairAttemptCount: 3,
    builderSelfRepairAttemptCount: 3,
    thresholds: {
      semanticSilhouetteTargets: [{
        acceptanceTargetRef: ACCEPTANCE_TARGET_REF,
        maximumBoundsDriftBasisPoints: 100,
        maximumCenterDriftBasisPoints: 100,
        maximumCoverageDriftBasisPoints: 100,
      }, ...allDimensionsPass
        ? [{
          acceptanceTargetRef: UPPER_TARGET_REF,
          maximumBoundsDriftBasisPoints: 100,
          maximumCenterDriftBasisPoints: 100,
          maximumCoverageDriftBasisPoints: 100,
        }]
        : []],
      openingComposition: {
        regions: [{ targetRef: COMPOSITION_TARGET_REF, maximumDriftBasisPoints: 100 },
          ...allDimensionsPass
            ? [{
              targetRef: UPPER_COMPOSITION_TARGET_REF,
              maximumDriftBasisPoints: 100,
            }]
            : []],
        anchors: [{ targetRef: COMPOSITION_TARGET_REF, maximumDriftBasisPoints: 100 },
          ...allDimensionsPass
            ? [{
              targetRef: UPPER_COMPOSITION_TARGET_REF,
              maximumDriftBasisPoints: 100,
            }]
            : []],
      },
      spawnSupport: {
        maximumPositionDriftMillimeters: 100,
        maximumSupportGapMillimeters: 10,
      },
    },
    requiredEvidenceByDimension: [
      "collider",
      "critical-traversal",
      "deterministic-build",
      "opening-composition",
      "semantic-silhouette",
      "spawn-support",
      "topology",
    ].map((dimensionId) => ({
      dimensionId,
      evidenceProfileRefs: [`worldkit://evidence-profile/${dimensionId}@1`],
    })),
  });
  const evaluationProfileHash =
    hashWorldReconstructionEvaluationProfileV1(evaluationProfile);
  const formalCaptureIntent = parseFormalWorldCaptureIntentV1({
    kind: "formal-world-capture-intent",
    schemaVersion: 1,
    id: "package-fixture.case.formal-world-capture-intent",
    captureProfile: {
      widthPixels: 320,
      heightPixels: 180,
      devicePixelRatio: 1,
    },
    semanticCaptureTargetBindings: [{
      acceptanceTargetRef: ACCEPTANCE_TARGET_REF,
      compositionTargetRef: COMPOSITION_TARGET_REF,
      topologyNodeId: "ground",
      semanticLayerId: "ground",
      blockVisualGroupId: "ground-group",
    }, {
      acceptanceTargetRef: UPPER_TARGET_REF,
      compositionTargetRef: UPPER_COMPOSITION_TARGET_REF,
      topologyNodeId: "upper",
      semanticLayerId: "ground",
      blockVisualGroupId: "upper-group",
    }],
    topologyRelations: [{
      fromNodeId: "ground",
      relation: "connects-to",
      toNodeId: "upper",
      measurementSource: "scripted-traversal",
      traversalCheckId: "reach-ground",
    }],
    checkpointSpatialCriteria: traversalCheckpointCriteria.map(
      authoredCheckpointCriterion,
    ),
  });
  const reconstructionCase = parseWorldReconstructionCaseV1({
    kind: "world-reconstruction-case",
    schemaVersion: 1,
    id: "package-fixture.case",
    sceneBriefRef: "artifact://case/package-fixture/scene-brief.json",
    sceneBriefHash: H("d"),
    referenceInputs: [{
      inputRef: "artifact://case/package-fixture/reference.png",
      contentHash: H("e"),
      mediaType: "image/png",
    }],
    evaluationProfileRef: PROFILE_REF,
    evaluationProfileHash,
    formalCaptureIntentRef: "inputs/formal-world-capture-intent.json",
    formalCaptureIntentHash: hashFormalWorldCaptureIntentV1(formalCaptureIntent),
    acceptanceTargetRefs: [
      ACCEPTANCE_TARGET_REF,
      ...allDimensionsPass ? [UPPER_TARGET_REF] : [],
    ],
    requiredEvidenceProfileRefs: evaluationProfile.requiredEvidenceByDimension
      .flatMap((entry) => entry.evidenceProfileRefs),
    expected: {
      topology: {
        acceptanceTargetRef: ACCEPTANCE_TARGET_REF,
        nodeIds: ["ground", "upper"],
        relations: [{
          fromNodeId: "ground",
          relation: "connects-to",
          toNodeId: "upper",
        }],
        layerIds: ["ground"],
      },
      semanticSilhouetteTargets: [{
        acceptanceTargetRef: ACCEPTANCE_TARGET_REF,
        visualGroupId: "ground-group",
        normalizedBounds: {
          minXBasisPoints: 100,
          minYBasisPoints: 200,
          maxXBasisPoints: 900,
          maxYBasisPoints: 800,
        },
        normalizedCenter: { xBasisPoints: 500, yBasisPoints: 500 },
        coverageBasisPoints: 4_800,
      }, ...allDimensionsPass
        ? [{
          acceptanceTargetRef: UPPER_TARGET_REF,
          visualGroupId: "upper-group",
          normalizedBounds: {
            minXBasisPoints: 400,
            minYBasisPoints: 100,
            maxXBasisPoints: 600,
            maxYBasisPoints: 300,
          },
          normalizedCenter: { xBasisPoints: 500, yBasisPoints: 200 },
          coverageBasisPoints: 400,
        }]
        : []],
      openingComposition: {
        acceptanceTargetRef: ACCEPTANCE_TARGET_REF,
        targetRefs: [COMPOSITION_TARGET_REF,
          ...allDimensionsPass ? [UPPER_COMPOSITION_TARGET_REF] : []],
        regions: [{
          targetRef: COMPOSITION_TARGET_REF,
          normalizedBounds: {
            minXBasisPoints: 100,
            minYBasisPoints: 200,
            maxXBasisPoints: 900,
            maxYBasisPoints: 800,
          },
        }, ...allDimensionsPass
          ? [{
            targetRef: UPPER_COMPOSITION_TARGET_REF,
            normalizedBounds: {
              minXBasisPoints: 400,
              minYBasisPoints: 100,
              maxXBasisPoints: 600,
              maxYBasisPoints: 300,
            },
          }]
          : []],
        anchors: [{
          targetRef: COMPOSITION_TARGET_REF,
          normalizedCenter: { xBasisPoints: 500, yBasisPoints: 500 },
        }, ...allDimensionsPass
          ? [{
            targetRef: UPPER_COMPOSITION_TARGET_REF,
            normalizedCenter: { xBasisPoints: 500, yBasisPoints: 200 },
          }]
          : []],
        orderedTargetRefs: [COMPOSITION_TARGET_REF,
          ...allDimensionsPass ? [UPPER_COMPOSITION_TARGET_REF] : []],
      },
      spawnSupport: {
        acceptanceTargetRef: ACCEPTANCE_TARGET_REF,
        spawnMarkerId: "player-spawn",
        supportColliderId: "ground",
        expectedMedium: "ground",
        expectedPositionXYZMeters: { xMeters: 0, yMeters: 0, zMeters: 0 },
      },
      colliders: [{
        acceptanceTargetRef: ACCEPTANCE_TARGET_REF,
        contributionId: "ground",
        colliderId: "ground",
        role: "ground",
        requiresOverlay: true,
      }, ...needsBlockerCollider
        ? [{
          acceptanceTargetRef: ACCEPTANCE_TARGET_REF,
          contributionId: "palette-ground-blocker",
          colliderId: "palette-ground-blocker",
          role: "blocker" as const,
          requiresOverlay: false,
        }]
        : []],
      groundConnectivity: {
        requireSingleReachableComponent: true,
        requiredTraversalBands: [{
          acceptanceTargetRef: ACCEPTANCE_TARGET_REF,
          id: "ground-band",
          centerlineStandPositionsXYZMeters: [
            { xMeters: 0, yMeters: 0, zMeters: 0 },
            { xMeters: 0, yMeters: 0, zMeters: -1 },
          ],
          halfWidthMeters: 1,
        }],
      },
      criticalTraversalChecks: [{
        acceptanceTargetRef: ACCEPTANCE_TARGET_REF,
        id: "reach-ground",
        evidenceKind: "scripted-fixed-input",
        expectation: traversalCheckExpectation,
        checkpointIds: traversalCheckpointCriteria.map(({ checkpointId }) => checkpointId),
        fixedInputSequence: [{ actions: ["move-forward"], ticks: 1 }],
      }, ...traversalCheckExpectation === "block"
        ? [{
          acceptanceTargetRef: ACCEPTANCE_TARGET_REF,
          id: "support-ground",
          evidenceKind: "scripted-fixed-input" as const,
          expectation: "pass" as const,
          checkpointIds: supportTraversalCheckpointCriteria.map(
            ({ checkpointId }) => checkpointId,
          ),
          fixedInputSequence: [{ actions: ["move-forward"], ticks: 1 }],
        }]
        : []],
      deterministicBuild: {
        acceptanceTargetRef: ACCEPTANCE_TARGET_REF,
        requiresCandidateReplay: true,
        requiresWorldPackageIdentityAgreement: true,
        requiresBuildIdentityAgreement: true,
        requiresCaptureIdentityAgreement: true,
      },
    },
  });
  const caseHash = hashWorldReconstructionCaseV1(reconstructionCase);
  const authoringManifest = parseNativeBlockAuthoringManifestV1({
    kind: "native-block-authoring",
    schemaVersion: 1,
    entryModulePath: "scene.ts",
    blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
    visualGroups: [{
      visualGroupId: "ground-group",
      acceptanceTargetRef: ACCEPTANCE_TARGET_REF,
      semanticClassId: "ground.fixture",
      identityColorHex: "#AA0001",
    }, {
      visualGroupId: "upper-group",
      acceptanceTargetRef: UPPER_TARGET_REF,
      semanticClassId: "upper.fixture",
      identityColorHex: "#AA0002",
    }],
  });
  const authoringManifestHash = hashNativeBlockAuthoringManifestV1(authoringManifest);
  const packageInput = createBabylonNativeBlockWorldPackageTestInputV1();
  if (packageInput.nativeSceneContribution.profileSettlement.kind !== "host-snapshot") {
    throw new Error("fixture must use Block profile settlement");
  }
  const baseMetadata = packageInput.nativeBlockMaterializerMetadata!;
  const extraColliders = needsBlockerCollider
    ? [
      createBabylonNativeStaticColliderContributionV1({
        id: "palette-ground-blocker",
        runtimeRole: "scene-static-collider",
        worldPositionsMetersXYZ: [1.5, 0, 1.5, 2.5, 0, 1.5, 2, 0, 2.5],
        triangleIndices: [0, 1, 2],
        frictionRatio: 0.8,
        restitutionRatio: 0,
        traversalBinding: { kind: "not-traversable" },
      }),
      ...paletteTraversalDisagreement ? [createBabylonNativeStaticColliderContributionV1({
        id: "structure-painted-ground",
        runtimeRole: "scene-static-collider",
        worldPositionsMetersXYZ: [-1, 1, -4, 1, 1, -4, 0, 1, -2],
        triangleIndices: [0, 1, 2],
        frictionRatio: 0.8,
        restitutionRatio: 0,
        traversalBinding: {
          kind: "static-surface",
          surfaceEntityId: "upper-surface",
          logicalSubshapeId: "top",
          traversalSurfaceProfileRef: GROUND_STATIC_TRAVERSAL_SURFACE_PROFILE_REF,
        },
      })] : [],
    ]
    : [];
  const extraBlocks = needsBlockerCollider
    ? [{
      blockId: "step-shaped-ground-block",
      runtimeEntityId: "native-block:step-shaped-ground-block",
      semanticCaptureClassId: "worldkit.native-block.group.ground-group",
      shape: "step" as const,
      paletteRole: "ground" as const,
      visualGroupId: "ground-group",
      centerMetersXYZ: [2, -0.5, 2] as const,
      rotationQuarterTurnsY: 0 as const,
      sizeMetersXYZ: [1, 1, 1] as const,
    }]
    : [];
  const extraJoins = needsBlockerCollider
    ? [
      {
        colliderId: "palette-ground-blocker",
        sourceBlockIds: ["step-shaped-ground-block"],
        visualGroupIds: ["ground-group"],
        proxyKind: "exact-solid-union" as const,
        minimumMetersXYZ: [1.5, 0, 1.5],
        maximumMetersXYZ: [2.5, 0, 2.5],
        vertexCount: 3,
        triangleCount: 1,
        topologyHash: H("9"),
      },
      ...paletteTraversalDisagreement ? [{
        colliderId: "structure-painted-ground",
        sourceBlockIds: ["upper-block"],
        visualGroupIds: ["upper-group"],
        proxyKind: "continuous-walkable-surface" as const,
        minimumMetersXYZ: [-1, 1, -4],
        maximumMetersXYZ: [1, 1, -2],
        vertexCount: 3,
        triangleCount: 1,
        topologyHash: H("9"),
      }] : [],
    ]
    : [];
  const nativeSceneContribution = {
    ...packageInput.nativeSceneContribution,
    profileSettlement: {
      ...packageInput.nativeSceneContribution.profileSettlement,
      targetCount: 3 + extraColliders.length,
    },
    staticColliders: [
      ...packageInput.nativeSceneContribution.staticColliders,
      ...extraColliders,
    ].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  };
  const packageSceneAuthoringAttempt = {
    ...packageInput.sceneAuthoringAttempt,
    ...(options.attemptIdentity === undefined
      ? {}
      : {
        id: "package-fixture.repair",
        sourceInput: {
          ...packageInput.sceneAuthoringAttempt.sourceInput,
          generationRequestRef: options.attemptIdentity.generationRequestRef,
          generationRequestHash: options.attemptIdentity.generationRequestHash,
        },
      }),
    acceptanceTargetRefs: [
      ACCEPTANCE_TARGET_REF,
      ...allDimensionsPass ? [UPPER_TARGET_REF] : [],
    ],
  };
  const packageSceneAuthoringAttemptResult = {
    ...packageInput.sceneAuthoringAttemptResult,
    ...(options.attemptIdentity === undefined
      ? {}
      : {
        id: "package-fixture.repair.result",
        sceneAuthoringAttemptRef:
          "artifact://case/package-fixture/attempts/1/attempt.json",
      }),
    sceneAuthoringAttemptHash: hashSceneAuthoringAttemptV1(packageSceneAuthoringAttempt),
  };
  const metadata = parseBabylonNativeBlockMaterializerMetadataV1({
    ...baseMetadata,
    caseHash,
    authoringManifestHash,
    contributionHash: hashBabylonNativeSceneContributionV1(nativeSceneContribution),
    blocks: [
      ...baseMetadata.blocks,
      ...extraBlocks,
      {
        blockId: "upper-block",
        runtimeEntityId: "native-block:upper-block",
        semanticCaptureClassId: "worldkit.native-block.group.upper-group",
        shape: "full",
        paletteRole: "structure",
        visualGroupId: "upper-group",
        centerMetersXYZ: [0, 1, -3],
        rotationQuarterTurnsY: 0,
        sizeMetersXYZ: [2, 2, 2],
      },
    ].sort((left, right) =>
      left.blockId < right.blockId ? -1 : left.blockId > right.blockId ? 1 : 0),
    visualGroups: [
      ...baseMetadata.visualGroups.map((group) =>
        group.visualGroupId === "ground-group" && extraBlocks.length > 0
          ? {
            ...group,
            blockIds: [...group.blockIds, ...extraBlocks.map(({ blockId }) => blockId)]
              .sort((left, right) => left < right ? -1 : left > right ? 1 : 0),
          }
          : group),
      {
        visualGroupId: "upper-group",
        acceptanceTargetRef: UPPER_TARGET_REF,
        semanticClassId: "upper.fixture",
        identityColorHex: "#AA0002",
        blockIds: ["upper-block"],
        paletteRoles: ["structure"],
        minimumMetersXYZ: [-1, 0, -4],
        maximumMetersXYZ: [1, 2, -2],
      },
    ],
    colliderJoins: [
      ...baseMetadata.colliderJoins,
      ...extraJoins,
    ].sort((left, right) => left.colliderId < right.colliderId
      ? -1
      : left.colliderId > right.colliderId ? 1 : 0),
  });
  const directory = createBabylonNativeWorldPackageV1({
    ...packageInput,
    sceneAuthoringAttempt: packageSceneAuthoringAttempt,
    sceneAuthoringAttemptResult: packageSceneAuthoringAttemptResult,
    ...(options.attemptIdentity === undefined
      ? {}
      : {
        sceneAuthoringAttemptResultRef:
          "artifact://case/package-fixture/attempts/1/attempt-result.json",
      }),
    nativeSceneContribution,
    nativeBlockMaterializerMetadata: metadata,
  });
  const verifiedWorldPackage = verifyWorldPackageDirectoryV1(directory);
  if (verifiedWorldPackage.kind !== "babylon-native-scene") {
    throw new Error("fixture must be Babylon Native");
  }
  const { receipt, sceneAuthoringAttempt, sceneAuthoringAttemptResult } =
    verifiedWorldPackage;
  const attemptIndex = options.attemptIdentity?.attemptIndex ?? 0;
  const attemptRef = `artifact://case/package-fixture/attempts/${attemptIndex}/attempt.json`;
  const attemptResultRef =
    `artifact://case/package-fixture/attempts/${attemptIndex}/attempt-result.json`;
  const buildReceiptRef =
    `artifact://case/package-fixture/attempts/${attemptIndex}/world-package-build-receipt.json`;
  const buildIdentityRef =
    `artifact://case/package-fixture/attempts/${attemptIndex}/world-build-identity.json`;
  const semanticCaptureMap = {
    kind: "formal-semantic-capture-map" as const,
    schemaVersion: 1 as const,
    id: "package-fixture.semantic-map",
    caseRef: CASE_REF,
    caseHash,
    authoringManifestHash,
    layoutInventoryHash: metadata.checkedLayoutInventoryHash,
    contributionHash: metadata.contributionHash,
    bindings: [{
      acceptanceTargetRef: ACCEPTANCE_TARGET_REF,
      compositionTargetRef: COMPOSITION_TARGET_REF,
      topologyNodeId: "ground",
      semanticLayerId: "ground",
      blockVisualGroupId: "ground-group",
      semanticClassId: "ground.fixture",
      identityColor: "#AA0001" as const,
      projectedBoundsSource: "checked-layout-visual-group" as const,
      requiredWorldViewIds: ["opening", "world-side", "world-top-down"] as const,
      authoringManifestHash,
      layoutInventoryHash: metadata.checkedLayoutInventoryHash,
      contributionHash: metadata.contributionHash,
    }, {
      acceptanceTargetRef: UPPER_TARGET_REF,
      compositionTargetRef: UPPER_COMPOSITION_TARGET_REF,
      topologyNodeId: "upper",
      semanticLayerId: "upper",
      blockVisualGroupId: "upper-group",
      semanticClassId: "upper.fixture",
      identityColor: "#AA0002" as const,
      projectedBoundsSource: "checked-layout-visual-group" as const,
      requiredWorldViewIds: ["opening", "world-side", "world-top-down"] as const,
      authoringManifestHash,
      layoutInventoryHash: metadata.checkedLayoutInventoryHash,
      contributionHash: metadata.contributionHash,
    }],
    topologyRelations: [{
      fromNodeId: "ground",
      relation: "connects-to" as const,
      toNodeId: "upper",
      measurementSource: "package-bounds" as const,
      fromVisualGroupId: "ground-group",
      toVisualGroupId: "upper-group",
    }],
    traversalCheckBindings: [{
      traversalCheckId: "reach-ground",
      acceptanceTargetRef: ACCEPTANCE_TARGET_REF,
      checkExpectation: traversalCheckExpectation,
      fixedInputSequenceHash: sha256CanonicalJson([{ actions: ["move-forward"], ticks: 1 }]),
      checkpointCriteria: traversalCheckpointCriteria,
    }, ...traversalCheckExpectation === "block"
      ? [{
        traversalCheckId: "support-ground",
        acceptanceTargetRef: ACCEPTANCE_TARGET_REF,
        checkExpectation: "pass" as const,
        fixedInputSequenceHash: sha256CanonicalJson([{
          actions: ["move-forward"],
          ticks: 1,
        }]),
        checkpointCriteria: supportTraversalCheckpointCriteria,
      }]
      : []],
  };
  const openingRequest = {
    kind: "formal-artifact-view-request" as const,
    schemaVersion: 1 as const,
    viewId: "opening" as const,
    projection: "perspective" as const,
    widthPixels: 1280,
    heightPixels: 720,
    devicePixelRatio: 1,
  };
  const sideRequest = {
    kind: "formal-artifact-view-request" as const,
    schemaVersion: 1 as const,
    viewId: "world-side" as const,
    projection: "orthographic" as const,
    widthPixels: 1280,
    heightPixels: 720,
    devicePixelRatio: 1,
    worldBoundsMeters: {
      minimumMetersXYZ: [-40, 0, -40] as const,
      maximumMetersXYZ: [40, 24, 40] as const,
    },
    cameraPositionMetersXYZ: [80, 12, 0] as const,
    targetMetersXYZ: [0, 12, 0] as const,
  };
  const topRequest = {
    ...sideRequest,
    viewId: "world-top-down" as const,
    cameraPositionMetersXYZ: [0, 80, 0] as const,
  };
  const fixedInputSequence = [{ actions: ["move-forward"], ticks: 1 }] as const;
  const checkpointCriteria = semanticCaptureMap.traversalCheckBindings[0]!.checkpointCriteria;
  const colliderOverlay = {
    kind: "formal-collider-overlay-request" as const,
    schemaVersion: 1 as const,
    isRequired: true as const,
    contributionHash: metadata.contributionHash,
  };
  const scriptedTraversal = {
    kind: "formal-scripted-traversal-request" as const,
    schemaVersion: 1 as const,
    checks: [{
      id: "reach-ground",
      acceptanceTargetRef: ACCEPTANCE_TARGET_REF,
      checkExpectation: traversalCheckExpectation,
      fixedInputSequence,
      fixedInputSequenceHash: sha256CanonicalJson(fixedInputSequence),
      checkpointCriteria,
    }, ...traversalCheckExpectation === "block"
      ? [{
        id: "support-ground",
        acceptanceTargetRef: ACCEPTANCE_TARGET_REF,
        checkExpectation: "pass" as const,
        fixedInputSequence,
        fixedInputSequenceHash: sha256CanonicalJson(fixedInputSequence),
        checkpointCriteria: supportTraversalCheckpointCriteria,
      }]
      : []],
  };
  const formalRequestRef =
    `artifact://case/package-fixture/attempts/${attemptIndex}/formal-world-capture-request.json`;
  const formalRequest = {
    kind: "formal-world-capture-request" as const,
    schemaVersion: 1 as const,
    id: "package-fixture.formal-capture-request",
    formalRequestRef,
    caseRef: CASE_REF,
    caseHash,
    evaluationProfileRef: PROFILE_REF,
    evaluationProfileHash,
    sceneAuthoringRouteDecisionRef:
      "artifact://case/package-fixture/route-decision.json",
    sceneAuthoringRouteDecisionHash:
      sceneAuthoringAttempt.sceneAuthoringRouteDecisionHash,
    sceneAuthoringAttemptRef: attemptRef,
    sceneAuthoringAttemptHash: hashSceneAuthoringAttemptV1(sceneAuthoringAttempt),
    sceneAuthoringAttemptResultRef: attemptResultRef,
    sceneAuthoringAttemptResultHash:
      hashSceneAuthoringAttemptResultV1(sceneAuthoringAttemptResult),
    worldPackageRef: receipt.worldPackageRef,
    worldPackageRootHash: receipt.worldPackageRootHash,
    worldBuildIdentityRef: buildIdentityRef,
    worldBuildIdentityHash: receipt.worldBuildIdentityHash,
    worldPackageBuildReceiptRef: buildReceiptRef,
    worldPackageBuildReceiptHash: sha256CanonicalJson(receipt),
    semanticCaptureMapRef:
      `artifact://case/package-fixture/attempts/${attemptIndex}/semantic-capture-map.json`,
    semanticCaptureMap,
    semanticCaptureMapHash: hashFormalSemanticCaptureMapV1(semanticCaptureMap),
    nativeBlockMaterializerMetadataRef:
      "world-package://native/block-materializer-metadata.json",
    nativeBlockMaterializerMetadataHash:
      hashBabylonNativeBlockMaterializerMetadataV1(metadata),
    views: [openingRequest, sideRequest, topRequest],
    colliderOverlay,
    scriptedTraversal,
  };
  const snapshot = snapshotValue();
  const traversalResetSnapshot = options.independentTraversalReset === true
    ? parseWorldRuntimeSnapshotV4({
      ...snapshot,
      worldSessionId: "world-session-package-fixture-traversal",
      world: {
        ...snapshot.world,
        gameplayInspection: {
          ...snapshot.world.gameplayInspection,
          id: "gameplay-inspection:world-session-package-fixture-traversal:4",
          worldSessionId: "world-session-package-fixture-traversal",
        },
      },
    })
    : snapshot;
  const supportTraversalResetSnapshot = parseWorldRuntimeSnapshotV4({
    ...snapshot,
    worldSessionId: "world-session-package-fixture-support-ground",
    world: {
      ...snapshot.world,
      gameplayInspection: {
        ...snapshot.world.gameplayInspection,
        id: "gameplay-inspection:world-session-package-fixture-support-ground:4",
        worldSessionId: "world-session-package-fixture-support-ground",
      },
    },
  });
  const ownerIdentities = [
    ["action", "actions", "1"],
    ["camera", "camera", "2"],
    ["input", "input", "3"],
    ["physics", "physics", "4"],
    ["subject", "subject", "5"],
  ].map(([ownerId, name, hash]) => ({
    ownerId,
    implementationRef: `worldkit://sdk-owner/${name}@1`,
    implementationHash: H(hash!),
  }));
  const observationIdentity = (kind: string, ownerId: string) => ({
    kind,
    schemaVersion: 1,
    id: `package-fixture.${kind}`,
    worldPackageRef: receipt.worldPackageRef,
    worldPackageRootHash: receipt.worldPackageRootHash,
    worldBuildIdentityRef: buildIdentityRef,
    worldBuildIdentityHash: receipt.worldBuildIdentityHash,
    formalRequestRef,
    formalRequest,
    formalRequestHash: hashFormalWorldCaptureRequestV1(formalRequest),
    semanticCaptureMapHash: hashFormalSemanticCaptureMapV1(semanticCaptureMap),
    runtimeSessionId: snapshot.runtimeSessionId,
    resetReadySnapshot: snapshot,
    resetReadySnapshotHash: sha256CanonicalJson(snapshot),
    domainOwnerIdentity: ownerIdentities.find((owner) => owner.ownerId === ownerId)!,
  });
  const openingObservation = parseFormalOpeningObservationV1({
    ...observationIdentity("formal-opening-observation", "camera"),
    controlledSubjectProjection: {
      subjectEntityId: "player",
      centerXBasisPoints: 5_000,
      centerYBasisPoints: 5_000,
      widthBasisPoints: 1_500,
      heightBasisPoints: 4_000,
      coverageBasisPoints: 600,
    },
    visualGroups: [{
      acceptanceTargetRef: ACCEPTANCE_TARGET_REF,
      compositionTargetRef: COMPOSITION_TARGET_REF,
      topologyNodeId: "ground",
      semanticLayerId: "ground",
      blockVisualGroupId: "ground-group",
      sourceBoundsMeters: {
        minimumMetersXYZ: [-5, -1, -5],
        maximumMetersXYZ: [5, 0, 5],
      },
      normalizedBounds: {
        minXBasisPoints: 100,
        minYBasisPoints: 200,
        maxXBasisPoints: 900,
        maxYBasisPoints: 800,
      },
      normalizedCenter: { xBasisPoints: 500, yBasisPoints: 500 },
      coverageBasisPoints: 4_800,
      cameraDepthMeters: 12,
      depthOrder: 0,
    }, {
      acceptanceTargetRef: UPPER_TARGET_REF,
      compositionTargetRef: UPPER_COMPOSITION_TARGET_REF,
      topologyNodeId: "upper",
      semanticLayerId: "upper",
      blockVisualGroupId: "upper-group",
      sourceBoundsMeters: {
        minimumMetersXYZ: [-1, 0, -4],
        maximumMetersXYZ: [1, 2, -2],
      },
      normalizedBounds: {
        minXBasisPoints: 400,
        minYBasisPoints: 100,
        maxXBasisPoints: 600,
        maxYBasisPoints: 300,
      },
      normalizedCenter: { xBasisPoints: 500, yBasisPoints: 200 },
      coverageBasisPoints: 400,
      cameraDepthMeters: 8,
      depthOrder: 1,
    }],
    observedTopologyRelations: [{
      fromNodeId: "ground",
      relation: "connects-to",
      toNodeId: "upper",
    }],
  });
  const spawnSupportObservation = parseFormalSpawnSupportObservationV1({
    ...observationIdentity("formal-spawn-support-observation", "physics"),
    spawnMarkerId: "player-spawn",
    subjectEntityId: "player",
    supportContact: {
      colliderId: "ground",
      sourceBlockId: "ground-block",
      surfaceEntityId: "ground-surface",
      logicalSubshapeId: "top",
      pointMetersXYZ: [0, 0, 0],
    },
    capsuleFootPointMetersXYZ: [0, 0, 0],
    supportGapMillimeters: 0,
    movementMedium: "ground",
    observedTopologyRelations: [],
  });
  const colliderOverlayObservation = parseFormalColliderOverlayObservationV1({
    ...observationIdentity("formal-collider-overlay-observation", "physics"),
    colliders: [{
      colliderId: "ground",
      sourceBlockIds: ["ground-block"],
      colliderSubshapeId: "collider-subshape:ground",
      chunkParts: [{
        chunkPartId: "ground-grid-chunk-xp0-zp0",
        chunkResidencyGroupId: "grid-chunk-xp0-zp0",
        overlayRecordId: "overlay:ground-grid-chunk-xp0-zp0",
        physicsResidency: {
          mode: "resident",
          physicsBodyId: "physics-body:ground-grid-chunk-xp0-zp0",
        },
      }],
    }],
    observedTopologyRelations: [],
  });
  const scriptedTraversalObservation = parseFormalScriptedTraversalObservationV1({
    ...observationIdentity("formal-scripted-traversal-observation", "input"),
    resetReadySnapshot: traversalResetSnapshot,
    resetReadySnapshotHash: sha256CanonicalJson(traversalResetSnapshot),
    checks: [{
      id: "reach-ground",
      acceptanceTargetRef: ACCEPTANCE_TARGET_REF,
      checkExpectation: traversalCheckExpectation,
      resetReadySnapshot: traversalResetSnapshot,
      resetReadySnapshotHash: sha256CanonicalJson(traversalResetSnapshot),
      fixedTicks: [{
        tick: 1,
        fixedInputStepIndex: 0,
        committedSnapshotHash: H("f"),
        positionMetersXYZ: [0, 0, 0],
        movementMedium: "ground",
      }],
      checkpoints: options.traversalCheckpoints ?? [
        { checkpointId: "ground", outcome: "reached", observedAtTick: 1 },
      ],
      outcome: traversalCheckExpectation === "pass" ? "passed" : "blocked",
      observedTopologyRelations: [],
    }, ...traversalCheckExpectation === "block"
      ? [{
        id: "support-ground",
        acceptanceTargetRef: ACCEPTANCE_TARGET_REF,
        checkExpectation: "pass" as const,
        resetReadySnapshot: supportTraversalResetSnapshot,
        resetReadySnapshotHash: sha256CanonicalJson(supportTraversalResetSnapshot),
        fixedTicks: [{
          tick: 1,
          fixedInputStepIndex: 0,
          committedSnapshotHash: H("f"),
          positionMetersXYZ: [0, 0, 0] as const,
          movementMedium: "ground" as const,
        }],
        checkpoints: [{
          checkpointId: "support-ground",
          outcome: "reached" as const,
          observedAtTick: 1,
        }],
        outcome: "passed" as const,
        observedTopologyRelations: [],
      }]
      : []],
  });
  const viewRecords = [openingRequest, sideRequest, topRequest].map((request, index) => ({
    viewId: request.viewId,
    request,
    requestHash: hashFormalArtifactViewRequestV1(request),
    pngArtifactRef: `artifact://case/package-fixture/capture/${request.viewId}.png`,
    pngContentHash: H(String(index + 6)),
  }));
  const captureReceipt = parseFormalWorldCaptureReceiptV1({
    kind: "formal-world-capture-receipt",
    schemaVersion: 1,
    id: "package-fixture.formal-capture",
    formalRequestRef,
    formalRequest,
    formalRequestHash: hashFormalWorldCaptureRequestV1(formalRequest),
    caseRef: CASE_REF,
    caseHash,
    evaluationProfileRef: PROFILE_REF,
    evaluationProfileHash,
    sceneAuthoringRouteDecisionRef: formalRequest.sceneAuthoringRouteDecisionRef,
    sceneAuthoringRouteDecisionHash: formalRequest.sceneAuthoringRouteDecisionHash,
    sceneAuthoringAttemptRef: attemptRef,
    sceneAuthoringAttemptHash: formalRequest.sceneAuthoringAttemptHash,
    sceneAuthoringAttemptResultRef: attemptResultRef,
    sceneAuthoringAttemptResultHash: formalRequest.sceneAuthoringAttemptResultHash,
    worldPackageRef: receipt.worldPackageRef,
    worldPackageRootHash: receipt.worldPackageRootHash,
    worldBuildIdentityRef: buildIdentityRef,
    worldBuildIdentityHash: receipt.worldBuildIdentityHash,
    worldPackageBuildReceiptRef: buildReceiptRef,
    worldPackageBuildReceiptHash: sha256CanonicalJson(receipt),
    runtimeSessionId: snapshot.runtimeSessionId,
    readySnapshot: snapshot,
    readySnapshotHash: sha256CanonicalJson(snapshot),
    sdkOwnerIdentities: ownerIdentities,
    semanticCaptureMapHash: formalRequest.semanticCaptureMapHash,
    nativeBlockMaterializerMetadataHash:
      formalRequest.nativeBlockMaterializerMetadataHash,
    colliderOverlayRequestHash: hashFormalColliderOverlayRequestV1(colliderOverlay),
    scriptedTraversalRequestHash: hashFormalScriptedTraversalRequestV1(scriptedTraversal),
    viewportWidthPixels: 1280,
    viewportHeightPixels: 720,
    devicePixelRatio: 1,
    rendererIdentity: "contract-fixture-renderer",
    browserIdentity: "contract-fixture-browser",
    views: viewRecords,
    openingObservationArtifactRef:
      "artifact://case/package-fixture/capture/opening-observation.json",
    openingObservationContentHash: hashFormalOpeningObservationV1(openingObservation),
    spawnSupportObservationArtifactRef:
      "artifact://case/package-fixture/capture/spawn-support-observation.json",
    spawnSupportObservationContentHash:
      hashFormalSpawnSupportObservationV1(spawnSupportObservation),
    colliderOverlayPngArtifactRef:
      "artifact://case/package-fixture/capture/collider-overlay.png",
    colliderOverlayPngContentHash: H("9"),
    colliderOverlayObservationArtifactRef:
      "artifact://case/package-fixture/capture/collider-overlay-observation.json",
    colliderOverlayObservationContentHash:
      hashFormalColliderOverlayObservationV1(colliderOverlayObservation),
    scriptedTraversalArtifactRef:
      "artifact://case/package-fixture/capture/scripted-traversal.json",
    scriptedTraversalContentHash:
      hashFormalScriptedTraversalObservationV1(scriptedTraversalObservation),
    cameraRollbackOutcome: "completed",
    resetOutcome: "completed",
    cleanupOutcome: "completed",
  });
  return {
    id: `package-fixture.attempt-${attemptIndex}.evidence`,
    caseRef: CASE_REF,
    reconstructionCase,
    formalCaptureIntent,
    evaluationProfileRef: PROFILE_REF,
    evaluationProfile,
    authoringManifest,
    verifiedWorldPackage,
    captureReceiptRef:
      `artifact://case/package-fixture/attempts/${attemptIndex}/capture-receipt.json`,
    captureReceipt,
    openingObservation,
    spawnSupportObservation,
    colliderOverlayObservation,
    scriptedTraversalObservation,
  };
}
