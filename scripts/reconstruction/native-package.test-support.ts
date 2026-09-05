import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { parseSceneBriefV1 } from "@whitebox-world/authoring";
import { sha256Bytes, sha256CanonicalJson, stringifyCanonicalJson, type Sha256HashV1 } from "@whitebox-world/protocol";
import { hashFormalWorldCaptureIntentV1, parseFormalWorldCaptureIntentV1, type NativeBlockGroundExplorationV1 } from "@whitebox-world/runtime-contracts";
import { decideSceneAuthoringRouteV1 } from "@whitebox-world/scene-authoring-contracts";
import { hashWorldReconstructionEvaluationProfileV1, parseWorldReconstructionCaseV1, parseWorldReconstructionEvaluationProfileV1 } from "@whitebox-world/validation";
import { parseNativeSceneWorldBoundsPolicyV1, type NativeSceneWorldBoundsPolicyV1 } from "../native-scene/world-bounds-policy.js";
import assert from "node:assert/strict";

import { prepareNativeBlockGenerationTaskV1 } from "./generation-request.js";
import { runNativeBlockGenerationV1 } from "./generation-runner.js";

// Deterministic test fixture: stubbed generation, real Host Check/Ground/Package.
export const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../..");
const CASE_SOURCE = path.join(
  REPOSITORY_ROOT,
  "artifacts/scenes/cloud-temple-t-gate-native-block",
);
export const HOST_CLOSURE_ROOT = path.join(
  REPOSITORY_ROOT,
  "apps/playground/public/world-packages/cloud-ridge",
);
const execFileAsync = promisify(execFile);

function plannerPaletteMeasurement(
  visualTargetPixelCounts: readonly number[],
): unknown {
  return {
    widthPixels: 1600,
    heightPixels: 900,
    aspectRatio: 16 / 9,
    matchedBlockPixelCount: 72_000,
    blockPaletteCoverageRatio: 72_000 / (1600 * 900),
    traversablePixelCount: 64_000,
    interactivePixelCount: 0,
    blockPixelCountsBySemantic: {
      walkable: 64_000,
      obstacle: 0,
      "interactive-solid": 0,
      "interactive-trigger": 0,
      water: 0,
      "cloud-walkable": 0,
      "cloud-passable": 0,
      "visual-only": 0,
      "landmark-red": 0,
      "visual-target-2": 4_000,
      "visual-target-3": 4_000,
      "visual-target-4": 0,
      "visual-target-5": 0,
      "landmark-pink": 0,
      "visual-target-1-subject": 32_000,
    },
    visualTargetPixelCounts,
  };
}

function nativePlannerReceiptText(input: Readonly<{
  sceneId: string;
  sceneBriefHash: Sha256HashV1;
  entryWhiteboxTargetHash: Sha256HashV1;
  worldPlanHash: Sha256HashV1;
}>): string {
  return stringifyCanonicalJson({
    kind: "worldkit-planner-self-check",
    schemaVersion: 1,
    validatorVersion: "worldkit-planner-self-check-v4",
    sceneId: input.sceneId,
    sceneSourceKind: "babylon-native",
    status: "passed",
    inputs: {
      sceneBriefHash: input.sceneBriefHash,
      worldPlanHash: input.worldPlanHash,
      entryWhiteboxTargetHash: input.entryWhiteboxTargetHash,
    },
    imageMeasurements: {
      widthPixels: 1600,
      heightPixels: 900,
      subjectMaskPixelCount: 32_000,
      subjectCenterXRatio: 0.5,
      subjectCenterErrorRatio: 0,
      maximumCenterErrorRatio: 0.015,
    },
    nativeBlockPaletteMeasurements: {
      worldPlan: plannerPaletteMeasurement([64, 64, 64, 0, 0]),
      entryWhiteboxTarget: plannerPaletteMeasurement([32_000, 0, 0, 0, 0]),
    },
    nativeEntryIdentityMeasurements: {
      widthPixels: 1600,
      heightPixels: 900,
      aspectRatio: 16 / 9,
      aspectErrorRatio: 0,
      requiredAspectRatio: 16 / 9,
      maximumAspectErrorRatio: 0.02,
      maximumIdentityRgbDistance: 40,
      minimumIdentitySeparationRgbUnits: 12,
      ambiguousIdentityPixelCount: 0,
      candidateIdentityPixelCount: 32_000,
      ambiguousIdentityRatio: 0,
      maximumAmbiguousIdentityRatio: 0.05,
      targets: [{
        visualTargetId: "visual-target-1",
        identityColorHex: "#E85D5D",
        exclusivelyAdmittedPixelCount: 32_000,
        imageCoverageRatio: 32_000 / (1600 * 900),
        componentCount: 1,
        coherentComponentCount: 1,
        coherentPixelCount: 32_000,
        coherentPixelRatio: 1,
        largestComponentPixelCount: 32_000,
        largestComponentImageCoverageRatio: 32_000 / (1600 * 900),
        largestComponentBoundingBoxWidthPixels: 160,
        largestComponentBoundingBoxHeightPixels: 320,
        largestComponentBoundingBoxWidthRatio: 0.1,
        largestComponentBoundingBoxHeightRatio: 320 / 900,
        minimumPixelCount: 360,
        minimumCoherentComponentPixelCount: 36,
        minimumCoherentPixelRatio: 0.75,
        minimumLargestComponentPixelCount: 1440,
        minimumLargestComponentImageCoverageRatio: 0.001,
        minimumLargestComponentBoundingBoxWidthRatio: 0.02,
        minimumLargestComponentBoundingBoxHeightRatio: 0.04,
      }],
    },
    diagnostics: [],
  });
}

export const SCENE_SOURCE = `import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
import { createBabylonNativeBlockProfileSessionV1 } from "@whitebox-world/native-babylon-block-profile";

export default defineBabylonNativeScene({
  kind: "babylon-native-scene-module",
  id: "cloud-temple-test",
  build(context) {
    const session = createBabylonNativeBlockProfileSessionV1(context, { maximumBlockCount: 64 });
    session.createBlockGrid({idPrefix: "foreground", shape: "full", paletteRole: "ground", visualGroupId: "foreground-platform-group", colliderGroupId: "foreground-ground-group", minimumCenterMetersXYZ: [-1, -0.5, 11], repeatCountXYZ: [3, 1, 8] });
    session.createBlockGrid({idPrefix: "central", shape: "full", paletteRole: "route", visualGroupId: "central-ascent-group", colliderGroupId: "central-ground-group", minimumCenterMetersXYZ: [-1, -0.5, 4], repeatCountXYZ: [3, 1, 7] });
    session.createBlock({id: "gate", shape: "full", paletteRole: "structure", visualGroupId: "gate-mass-group", centerMetersXYZ: [4, -0.5, 2] });
    session.createBlock({id: "mountain", shape: "full", paletteRole: "background-mass", visualGroupId: "mountain-cliff-layers-group", centerMetersXYZ: [-4, -0.5, 2] });
    session.createBlockGrid({idPrefix: "upper", shape: "full", paletteRole: "structure", visualGroupId: "upper-t-junction-group", colliderGroupId: "upper-ground-group", minimumCenterMetersXYZ: [-1, -0.5, 1], repeatCountXYZ: [3, 1, 3] });
    session.finalize({ staticColliders: [
      { id: "collider-central-steps", colliderGeometrySource: { kind: "block-group", colliderGroupId: "central-ground-group" }, traversalBinding: { kind: "static-surface", surfaceEntityId: "central-surface", logicalSubshapeId: "central-top", traversalSurfaceProfileRef: "worldkit://traversal-surface-profile/ground.static@1" }, exposedEdgePolicy: "none" },
      { id: "collider-cliff-blockers", colliderGeometrySource: { kind: "block", blockId: "mountain" }, traversalBinding: { kind: "not-traversable" }, exposedEdgePolicy: "none" },
      { id: "collider-foreground-ground", colliderGeometrySource: { kind: "block-group", colliderGroupId: "foreground-ground-group" }, traversalBinding: { kind: "static-surface", surfaceEntityId: "foreground-surface", logicalSubshapeId: "foreground-top", traversalSurfaceProfileRef: "worldkit://traversal-surface-profile/ground.static@1" }, exposedEdgePolicy: "protect-ground-subject" },
      { id: "collider-upper-ground", colliderGeometrySource: { kind: "block-group", colliderGroupId: "upper-ground-group" }, traversalBinding: { kind: "static-surface", surfaceEntityId: "upper-surface", logicalSubshapeId: "upper-top", traversalSurfaceProfileRef: "worldkit://traversal-surface-profile/ground.static@1" }, exposedEdgePolicy: "none" },
      { id: "collider-gate-walls", colliderGeometrySource: { kind: "block", blockId: "gate" }, traversalBinding: { kind: "not-traversable" }, exposedEdgePolicy: "none" },
    ] });
    context.registration.registerSpawnMarker({ id: context.bootstrap.spawnMarkerId, positionMetersXYZ: [0, 0, 18], facingRadians: 0 });
  },
});
`;

const AUTHORING = {
  kind: "native-block-authoring",
  groundExploration: { mode: "case-defined" as const },
  openingCamera: { mode: "third-person" as const, distanceMeters: 5, targetHeightMeters: 1.2, pitchRadians: 0.18, fovDegrees: 56 },
  schemaVersion: 1,
  entryModulePath: "scene.ts",
  blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
  visualGroups: [
    { visualGroupId: "central-ascent-group", acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1", semanticClassId: "route.central-ascent", identityColorHex: "#AA0001" },
    { visualGroupId: "foreground-platform-group", acceptanceTargetRef: "worldkit://acceptance-target/foreground-platform@1", semanticClassId: "ground.foreground-platform", identityColorHex: "#AA0002" },
    { visualGroupId: "gate-mass-group", acceptanceTargetRef: "worldkit://acceptance-target/gate-mass@1", semanticClassId: "structure.gate-mass", identityColorHex: "#AA0003" },
    { visualGroupId: "mountain-cliff-layers-group", acceptanceTargetRef: "worldkit://acceptance-target/mountain-cliff-layers@1", semanticClassId: "terrain.mountain-cliff", identityColorHex: "#AA0004" },
    { visualGroupId: "upper-t-junction-group", acceptanceTargetRef: "worldkit://acceptance-target/upper-t-junction@1", semanticClassId: "structure.upper-t", identityColorHex: "#AA0005" },
  ],
} as const;

export const REPLACED_PLACEMENT_DIALECT_SCENE_SOURCE = SCENE_SOURCE.replace(
  `    session.createBlock({id: "gate", shape: "full", paletteRole: "structure", visualGroupId: "gate-mass-group", centerMetersXYZ: [4, -0.5, 2] });`,
  `    const gate = session.createBlock({id: "gate", shape: "full", paletteRole: "structure", visualGroupId: "gate-mass-group" });
    gate.position.set(4, -0.5, 2);`,
);

export const REGENERATED_GRID_SCENE_SOURCE = SCENE_SOURCE
  .replace(
    `    session.createBlock({id: "gate", shape: "full", paletteRole: "structure", visualGroupId: "gate-mass-group", centerMetersXYZ: [4, -0.5, 2] });`,
    `    session.createBlock({id: "gate", shape: "full", paletteRole: "structure", visualGroupId: "gate-mass-group", centerMetersXYZ: [5, -0.5, 2] });`,
  );

export const MOCK_CONTEXT_LAYOUT_BRANCH_SCENE_SOURCE = SCENE_SOURCE.replace(
  `    session.createBlock({id: "gate", shape: "full", paletteRole: "structure", visualGroupId: "gate-mass-group", centerMetersXYZ: [4, -0.5, 2] });`,
  `    const capturedContext = context;
    session.createBlock({id: "gate", shape: "full", paletteRole: "structure", visualGroupId: "gate-mass-group", centerMetersXYZ: [capturedContext.scene === undefined ? 4 : 5, -0.5, 2] });`,
);

export const MOCK_CONTEXT_GAP_BRANCH_SCENE_SOURCE = SCENE_SOURCE.replace(
  `    session.finalize({ staticColliders: [`,
  `    const capturedContext = context;
    session.finalize({ displayGapMeters: capturedContext.scene === undefined ? 0.04 : 0.08, staticColliders: [`,
);

export const MOCK_CONTEXT_SPAWN_BRANCH_SCENE_SOURCE = SCENE_SOURCE.replace(
  `    context.registration.registerSpawnMarker({ id: context.bootstrap.spawnMarkerId, positionMetersXYZ: [0, 0, 18], facingRadians: 0 });`,
  `    const spawnContext = context;
    context.registration.registerSpawnMarker({ id: context.bootstrap.spawnMarkerId, positionMetersXYZ: [0, 0, spawnContext.scene === undefined ? 18 : 17], facingRadians: 0 });`,
);

export const MULTIPLE_ROUTE_COMPONENTS_SCENE_SOURCE = SCENE_SOURCE.replace(
  `    session.createBlock({id: "gate", shape: "full", paletteRole: "structure", visualGroupId: "gate-mass-group", centerMetersXYZ: [4, -0.5, 2] });`,
  `    session.createBlock({id: "isolated-route", shape: "full", paletteRole: "route", visualGroupId: "central-ascent-group", centerMetersXYZ: [20, -0.5, 20] });
    session.createBlock({id: "gate", shape: "full", paletteRole: "structure", visualGroupId: "gate-mass-group", centerMetersXYZ: [4, -0.5, 2] });`,
);

export const MISSING_GRID_CHILD_SCENE_SOURCE = SCENE_SOURCE.replace(
  `{ kind: "block-group", colliderGroupId: "foreground-ground-group" }`,
  `{ kind: "block", blockId: "foreground" }`,
);

export const NARROW_SPAWN_GROUND_SCENE_SOURCE = SCENE_SOURCE.replace(
  `shape: "full", paletteRole: "ground", visualGroupId: "foreground-platform-group", colliderGroupId: "foreground-ground-group", minimumCenterMetersXYZ: [-1, -0.5, 11], repeatCountXYZ: [3, 1, 8]`,
  `shape: "small", paletteRole: "ground", visualGroupId: "foreground-platform-group", colliderGroupId: "foreground-ground-group", minimumCenterMetersXYZ: [0.25, -0.25, 11.25], repeatCountXYZ: [1, 1, 14]`,
);

export const SPAWN_ADJACENT_STEP_SCENE_SOURCE = SCENE_SOURCE.replace(
  `    session.createBlock({id: "gate", shape: "full", paletteRole: "structure", visualGroupId: "gate-mass-group", centerMetersXYZ: [4, -0.5, 2] });`,
  `    session.createBlockGrid({idPrefix: "spawn-step-left", shape: "step", paletteRole: "route", visualGroupId: "central-ascent-group", colliderGroupId: "central-ground-group", minimumCenterMetersXYZ: [-1, 0.125, 11], repeatCountXYZ: [1, 1, 8] });
    session.createBlock({id: "gate", shape: "full", paletteRole: "structure", visualGroupId: "gate-mass-group", centerMetersXYZ: [4, -0.5, 2] });`,
);

export const EXTRA_VISUAL_GROUP_SCENE_SOURCE = SCENE_SOURCE.replace(
  `    session.createBlockGrid({idPrefix: "upper",`,
  `    session.createBlock({id: "supported-spawn", shape: "full", paletteRole: "ground", visualGroupId: "supported-spawn-group", centerMetersXYZ: [8, -0.5, 2] });
    session.createBlockGrid({idPrefix: "upper",`,
);

export const EXTRA_VISUAL_GROUP_AUTHORING = {
  ...AUTHORING,
  visualGroups: [
    ...AUTHORING.visualGroups.slice(0, 4),
    { visualGroupId: "supported-spawn-group", acceptanceTargetRef: "worldkit://acceptance-target/supported-spawn@1", semanticClassId: "ground.supported-spawn", identityColorHex: "#AA0006" },
    AUTHORING.visualGroups[4]!,
  ],
} as const;

type NativeBlockPackageAttemptFixtureOptionsV1 = Readonly<{
  withoutScriptedTraversal?: boolean;
  sceneSource?: string;
  authoring?: typeof AUTHORING | typeof EXTRA_VISUAL_GROUP_AUTHORING;
  omitAdvisory?: boolean;
  target3IdentityColorHex?: string;
  groundExploration?: NativeBlockGroundExplorationV1;
  maximumBlockCount?: number;
  worldBoundsPolicy?: NativeSceneWorldBoundsPolicyV1;
}>;

export async function createNativeBlockPackageAttemptFixtureV1(
  options: NativeBlockPackageAttemptFixtureOptionsV1 = {},
) {
  const root = await realpath(await mkdtemp(
    path.join(os.tmpdir(), "worldkit-native-package-"),
  ));
  try {
    return await prepareFixture(root, options);
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

async function prepareFixture(root: string, options: NativeBlockPackageAttemptFixtureOptionsV1) {
  const sceneSource = options.sceneSource ?? SCENE_SOURCE;
  const authoring = { ...(options.authoring ?? AUTHORING),
    groundExploration: options.groundExploration ?? (options.authoring ?? AUTHORING).groundExploration };
  const caseRoot = path.join(root, "case");
  await cp(CASE_SOURCE, caseRoot, { recursive: true });
  const casePath = path.join(caseRoot, "case.json");
  const inputDirectoryPath = path.join(caseRoot, "inputs");
  const [caseValue, profileValue, boundsValue] = await Promise.all([
    readFile(casePath, "utf8").then(JSON.parse),
    readFile(path.join(caseRoot, "evaluation-profile.json"), "utf8").then(JSON.parse),
    readFile(path.join(inputDirectoryPath, "world-bounds-policy.json"), "utf8").then(JSON.parse),
  ]);
  if (options.worldBoundsPolicy !== undefined) {
    await writeFile(path.join(inputDirectoryPath, "world-bounds-policy.json"),
      stringifyCanonicalJson(options.worldBoundsPolicy));
  }
  const sceneBrief = parseSceneBriefV1(await readFile(
    path.join(inputDirectoryPath, caseValue.sceneBriefRef),
    "utf8",
  ));
  if (!sceneBrief.ok) throw new TypeError("TEST_SCENE_BRIEF_INVALID");
  // This package-owner fixture intentionally builds a compact straight route.
  // Keep its trusted Ground Analysis band local to that geometry instead of
  // inheriting the production Case's gate-detour samples whenever the real
  // acceptance corpus evolves.
  caseValue.expected.groundConnectivity.requiredTraversalBands[0]
    .centerlineStandPositionsXYZMeters = [
      { xMeters: 0, yMeters: 0, zMeters: 18 },
      { xMeters: 0, yMeters: 0, zMeters: 10 },
      { xMeters: 0, yMeters: 0, zMeters: 3 },
    ];
  if (authoring.groundExploration.mode === "source-authored") {
    caseValue.expected.groundConnectivity = {
      mode: "source-authored", requireSingleReachableComponent: true, requiredTraversalBands: [],
    };
  }
  if (options.withoutScriptedTraversal === true) {
    assert.equal(authoring.groundExploration.mode, "source-authored");
    caseValue.expected.criticalTraversalChecks = [];
    caseValue.expected.topology.relations = [];
    const intentPath = path.join(caseRoot, caseValue.formalCaptureIntentRef);
    const intent = parseFormalWorldCaptureIntentV1({
      ...JSON.parse(await readFile(intentPath, "utf8")),
      topologyRelations: [], checkpointSpatialCriteria: [],
    });
    caseValue.formalCaptureIntentHash = hashFormalWorldCaptureIntentV1(intent);
    await writeFile(intentPath, stringifyCanonicalJson(intent));
  }
  const nativeTarget3Ref =
    "worldkit://acceptance-target/visual-target-3@1";
  const gateTargetRef = "worldkit://acceptance-target/gate-mass@1";
  if (options.target3IdentityColorHex !== undefined) {
    caseValue.acceptanceTargetRefs = caseValue.acceptanceTargetRefs
      .map((targetRef: string) =>
        targetRef === gateTargetRef ? nativeTarget3Ref : targetRef)
      .sort();
    caseValue.expected.semanticSilhouetteTargets =
      caseValue.expected.semanticSilhouetteTargets
        .map((target: { acceptanceTargetRef: string }) => ({
          ...target,
          acceptanceTargetRef: target.acceptanceTargetRef === gateTargetRef
            ? nativeTarget3Ref
            : target.acceptanceTargetRef,
        }))
        .sort((left: { acceptanceTargetRef: string }, right: {
          acceptanceTargetRef: string;
        }) => left.acceptanceTargetRef.localeCompare(right.acceptanceTargetRef));
    for (const target of [
      ...caseValue.expected.colliders,
      ...caseValue.expected.criticalTraversalChecks,
    ]) {
      if (target.acceptanceTargetRef === gateTargetRef) {
        target.acceptanceTargetRef = nativeTarget3Ref;
      }
    }
    profileValue.thresholds.semanticSilhouetteTargets =
      profileValue.thresholds.semanticSilhouetteTargets
        .map((target: { acceptanceTargetRef: string }) => ({
          ...target,
          acceptanceTargetRef: target.acceptanceTargetRef === gateTargetRef
            ? nativeTarget3Ref
            : target.acceptanceTargetRef,
        }))
        .sort((left: { acceptanceTargetRef: string }, right: {
          acceptanceTargetRef: string;
        }) => left.acceptanceTargetRef.localeCompare(right.acceptanceTargetRef));
    caseValue.evaluationProfileHash =
      hashWorldReconstructionEvaluationProfileV1(
        parseWorldReconstructionEvaluationProfileV1(profileValue),
      );
  }
  const visualReviewInputBytes = await readFile(path.join(
    inputDirectoryPath,
    "reference-0.png",
  ));
  const entryWhiteboxTargetHash = sha256Bytes(
    visualReviewInputBytes,
  ) as Sha256HashV1;
  const worldPlanHash = sha256Bytes(visualReviewInputBytes) as Sha256HashV1;
  const visualIdentityPaletteBytes = new TextEncoder().encode(
    stringifyCanonicalJson({
      kind: "worldkit-visual-identity-palette",
      schemaVersion: 1,
      sceneId: caseValue.id,
      sceneBriefHash: sceneBrief.sceneBriefHash,
      movementMode: "ground-walk",
      movementModeLabel: "Ground walk",
      targets: [
        { id: "visual-target-1", visualTargetId: "visual-target-1", targetKind: "subject", name: "Explorer", description: "controlled Subject", role: "primary-subject", semanticClassId: "visual.subject", identityColor: "#E85D5D" },
        ...(options.target3IdentityColorHex === undefined ? [] : [
          { id: "visual-target-2", visualTargetId: "visual-target-2", targetKind: "landmark", name: "Gate", description: "primary gate", role: "primary-landmark", semanticClassId: "visual.gate", identityColor: "#F28E2B" },
          { id: "visual-target-3", visualTargetId: "visual-target-3", targetKind: "landmark", name: "Moon", description: "remote moon", role: "secondary-landmark", semanticClassId: "visual.moon", identityColor: "#D9A514" },
        ]),
      ],
    }),
  );
  const plannerReceiptBytes = new TextEncoder().encode(
    nativePlannerReceiptText({
      sceneId: caseValue.id,
      sceneBriefHash: caseValue.sceneBriefHash as Sha256HashV1,
      entryWhiteboxTargetHash,
      worldPlanHash,
    }),
  );
  await Promise.all([
    writeFile(
      path.join(inputDirectoryPath, "entry-whitebox-target.png"),
      visualReviewInputBytes,
      { flag: "wx" },
    ),
    writeFile(
      path.join(inputDirectoryPath, "world-plan.png"),
      visualReviewInputBytes,
      { flag: "wx" },
    ),
    writeFile(
      path.join(inputDirectoryPath, "planner-self-check.json"),
      plannerReceiptBytes,
      { flag: "wx" },
    ),
    writeFile(
      path.join(inputDirectoryPath, "visual-identity-palette.json"),
      visualIdentityPaletteBytes,
      { flag: "wx" },
    ),
  ]);
  caseValue.referenceInputs = [
    ...caseValue.referenceInputs,
    {
      inputRef: "entry-whitebox-target.png",
      contentHash: entryWhiteboxTargetHash,
      mediaType: "image/png",
    },
    {
      inputRef: "planner-self-check.json",
      contentHash: sha256Bytes(plannerReceiptBytes),
      mediaType: "application/json",
    },
    {
      inputRef: "visual-identity-palette.json",
      contentHash: sha256Bytes(visualIdentityPaletteBytes),
      mediaType: "application/json",
    },
    {
      inputRef: "world-plan.png",
      contentHash: worldPlanHash,
      mediaType: "image/png",
    },
  ].sort((left, right) => left.inputRef.localeCompare(right.inputRef));
  await Promise.all([
    writeFile(casePath, `${stringifyCanonicalJson(caseValue)}\n`),
    writeFile(
      path.join(caseRoot, "evaluation-profile.json"),
      `${stringifyCanonicalJson(profileValue)}\n`,
    ),
  ]);
  const reconstructionCase = parseWorldReconstructionCaseV1(caseValue);
  const profile = parseWorldReconstructionEvaluationProfileV1(profileValue);
  const routeDecision = decideSceneAuthoringRouteV1({
    id: `${reconstructionCase.id}-route`,
    sceneBriefRef: reconstructionCase.sceneBriefRef,
    sceneBriefHash: reconstructionCase.sceneBriefHash,
    trustProfileRef: "worldkit://trust-profile/trusted-local@1",
    trustProfileHash: sha256CanonicalJson({ id: "trusted-local", version: 1 }) as Sha256HashV1,
    requiredCapabilityRefs: [],
    requestedSourceKind: "babylon-native",
    nativeTrustAdmitted: true,
    referenceDrivenDistinctiveSilhouette: true,
  });
  const runDirectoryPath = path.join(caseRoot, "runs", "test");
  await mkdir(path.dirname(runDirectoryPath), { recursive: true });
  const generationInput = {
    case: reconstructionCase,
    profile,
    routeDecision,
    runId: "test",
    attemptIndex: 0,
    backend: "local",
    runDirectoryPath,
    inputDirectoryPath,
    taskInstructionPath: path.join(inputDirectoryPath, "task-instruction.md"),
    builderSkillPath: path.join(inputDirectoryPath, "builder-skill", "SKILL.md"),
    nativeSceneApiPath: path.join(inputDirectoryPath, "native-scene-api.json"),
    nativeSceneProfilePath: path.join(inputDirectoryPath, "native-scene-profile.json"),
    blockProfilePath: path.join(inputDirectoryPath, "block-profile.json"),
    hostClosureRootPath: HOST_CLOSURE_ROOT,
    gameplayBootstrapPath: path.join(HOST_CLOSURE_ROOT, "gameplay/bootstrap.json"),
    worldRuntimeBootstrapPath: path.join(HOST_CLOSURE_ROOT, "runtime/world-runtime-bootstrap.json"),
    worldRuntimeBootstrapRef: "worldkit://world-runtime-bootstrap/cloud-ridge@1",
    worldBoundsPolicyPath: path.join(inputDirectoryPath, "world-bounds-policy.json"),
    worldBoundsPolicy: parseNativeSceneWorldBoundsPolicyV1(options.worldBoundsPolicy ?? boundsValue),
    bootstrapId: `${reconstructionCase.id}-native`,
    sceneModuleRef: `worldkit://native-scene/${reconstructionCase.id}@1`,
    seed: 19,
    budgets: {
      maximumBlockCount: options.maximumBlockCount ?? 64,
      maximumStaticColliderCount: 8,
      maximumStaticColliderVertexCount: 1024,
      maximumStaticColliderTriangleCount: 1024,
      maximumOutputBytes: 4_000_000,
      timeoutSeconds: 30,
    },
  } satisfies Parameters<typeof prepareNativeBlockGenerationTaskV1>[0];
  const prepared = await prepareNativeBlockGenerationTaskV1(generationInput);
  await Promise.all([
    writeFile(path.join(prepared.stagingDirectoryPath, "scene.ts"), sceneSource),
    writeFile(
      path.join(prepared.stagingDirectoryPath, "native-block-authoring.json"),
      stringifyCanonicalJson(options.target3IdentityColorHex === undefined
        ? authoring
        : {
            ...authoring,
            visualGroups: authoring.visualGroups.map((group) =>
              group.acceptanceTargetRef !== gateTargetRef
                ? group
                : {
                    ...group,
                    acceptanceTargetRef: nativeTarget3Ref,
                    semanticClassId: "visual.moon",
                    identityColorHex: options.target3IdentityColorHex,
                  }),
          }),
    ),
    writeFile(path.join(prepared.stagingDirectoryPath, "native-resources.json"), stringifyCanonicalJson({ kind: "native-visual-resource-list", schemaVersion: 1, resourceRefs: [] })),
  ]);
  if (options.omitAdvisory !== true) {
    const attemptDirectoryPath = path.dirname(prepared.stagingDirectoryPath);
    const advisoryDirectoryPath = path.join(attemptDirectoryPath, "advisory");
    await mkdir(advisoryDirectoryPath, { recursive: true });
    await execFileAsync(process.execPath, [
      path.join(
        prepared.taskWorkspacePath,
        "inputs/builder-skill/scripts/render-visual-review.mjs",
      ),
      "--workspace",
      prepared.taskWorkspacePath,
      "--source",
      path.join(prepared.stagingDirectoryPath, "scene.ts"),
      "--authoring",
      path.join(prepared.stagingDirectoryPath, "native-block-authoring.json"),
      "--bootstrap",
      path.join(prepared.taskWorkspacePath, "inputs/native-scene.bootstrap.json"),
      "--subject-visual-review-proxy",
      path.join(
        prepared.taskWorkspacePath,
        "inputs/subject-visual-review-proxy.json",
      ),
      "--world-plan",
      path.join(prepared.taskWorkspacePath, "inputs/world-plan.png"),
      "--entry-target",
      path.join(prepared.taskWorkspacePath, "inputs/entry-whitebox-target.png"),
      "--top-down-output",
      path.join(advisoryDirectoryPath, "builder-top-down-comparison.png"),
      "--entry-output",
      path.join(advisoryDirectoryPath, "builder-entry-comparison.png"),
    ], {
      cwd: prepared.taskWorkspacePath,
      encoding: "utf8",
      maxBuffer: 1_000_000,
      shell: false,
      timeout: 30_000,
    });
  }
  const generated = await runNativeBlockGenerationV1(prepared, {
    process: {
      async run() {
        return {
          exitCode: 0,
          stdout: `WORLDKIT_LOCAL_CODEX_JOB coding-agent ${prepared.routerRequestId} pid=123 profile=formal model=gpt-5.6-sol reasoning=xhigh\n`,
          stderr: "",
          taskOutcome: {
            kind: "worldkit-codex-task-outcome" as const,
            schemaVersion: 1 as const,
            requestId: prepared.routerRequestId,
            outcome: "completed" as const,
          },
        };
      },
    },
    selfCheck: async () => ({ ok: true, diagnosticCodes: [] }),
    reconcile: async () => ({ outcome: "missing" }),
    cleanup: async () => ({ outcome: "completed" }),
  });
  assert.equal(generated.receipt.outcome, "completed", JSON.stringify(generated.receipt));
  const attemptDirectoryPath = path.dirname(generated.sourceDirectoryPath!);
  await writeFile(
    path.join(attemptDirectoryPath, "generation-receipt.json"),
    `${stringifyCanonicalJson(generated.receipt)}\n`,
  );
  return {
    root,
    casePath,
    generationInput,
    prepared,
    reconstructionCase,
    profile,
    attemptDirectoryPath,
    outputDirectoryPath: path.join(attemptDirectoryPath, "world-package"),
  };
}
