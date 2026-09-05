import { execFile } from "node:child_process";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { parseSceneBriefV1 } from "@whitebox-world/authoring";
import { sha256Bytes, sha256CanonicalJson, stringifyCanonicalJson, type Sha256HashV1 } from "@whitebox-world/protocol";
import {
  BABYLON_NATIVE_BLOCK_CURRENT_WALKABLE_TOPOLOGY_POLICY_V1,
  createBabylonNativeBlockProfileInventoryIdentityFromMaterializedV1,
} from "@whitebox-world/native-babylon-block-profile/host";
import { hashBabylonNativeSceneContributionV1, parseFormalWorldCaptureIntentV1 } from "@whitebox-world/runtime-contracts";
import { decideSceneAuthoringRouteV1 } from "@whitebox-world/scene-authoring-contracts";
import {
  hashWorldReconstructionEvaluationProfileV1,
  parseWorldReconstructionCaseV1,
  parseWorldReconstructionEvaluationProfileV1,
} from "@whitebox-world/validation";
import { parseWorldPackageWorldBoundsV1 } from "@whitebox-world/world-package";
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

import { prepareNativeBlockGenerationTaskV1 } from "./generation-request.js";
import { runNativeBlockGenerationV1 } from "./generation-runner.js";
import { createProductionWorldReconstructionRunPortsV1, type ProductionWorldReconstructionRunPortOwnersV1 } from "./production-run-ports.js";
import {
  assertProductionNativeBlockGroundTopologyCompatibleV1,
} from
  "./native-ground-analysis-admission.js";
import {
  assertNativeBlockProductionSourceImportsV1,
  NativeBlockPackageErrorV1,
  packageNativeBlockAttemptV1,
} from "./native-package.js";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../..");
const CASE_SOURCE = path.join(
  REPOSITORY_ROOT,
  "artifacts/scenes/cloud-temple-t-gate-native-block",
);
const HOST_CLOSURE_ROOT = path.join(
  REPOSITORY_ROOT,
  "apps/playground/public/world-packages/cloud-ridge",
);
const temporaryRoots: string[] = [];
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

const SCENE_SOURCE = `import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
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

const REPLACED_PLACEMENT_DIALECT_SCENE_SOURCE = SCENE_SOURCE.replace(
  `    session.createBlock({id: "gate", shape: "full", paletteRole: "structure", visualGroupId: "gate-mass-group", centerMetersXYZ: [4, -0.5, 2] });`,
  `    const gate = session.createBlock({id: "gate", shape: "full", paletteRole: "structure", visualGroupId: "gate-mass-group" });
    gate.position.set(4, -0.5, 2);`,
);

const REGENERATED_GRID_SCENE_SOURCE = SCENE_SOURCE
  .replace(
    `    session.createBlock({id: "gate", shape: "full", paletteRole: "structure", visualGroupId: "gate-mass-group", centerMetersXYZ: [4, -0.5, 2] });`,
    `    session.createBlock({id: "gate", shape: "full", paletteRole: "structure", visualGroupId: "gate-mass-group", centerMetersXYZ: [5, -0.5, 2] });`,
  );

const MOCK_CONTEXT_LAYOUT_BRANCH_SCENE_SOURCE = SCENE_SOURCE.replace(
  `    session.createBlock({id: "gate", shape: "full", paletteRole: "structure", visualGroupId: "gate-mass-group", centerMetersXYZ: [4, -0.5, 2] });`,
  `    const capturedContext = context;
    session.createBlock({id: "gate", shape: "full", paletteRole: "structure", visualGroupId: "gate-mass-group", centerMetersXYZ: [capturedContext.scene === undefined ? 4 : 5, -0.5, 2] });`,
);

const MOCK_CONTEXT_GAP_BRANCH_SCENE_SOURCE = SCENE_SOURCE.replace(
  `    session.finalize({ staticColliders: [`,
  `    const capturedContext = context;
    session.finalize({ displayGapMeters: capturedContext.scene === undefined ? 0.04 : 0.08, staticColliders: [`,
);

const MOCK_CONTEXT_SPAWN_BRANCH_SCENE_SOURCE = SCENE_SOURCE.replace(
  `    context.registration.registerSpawnMarker({ id: context.bootstrap.spawnMarkerId, positionMetersXYZ: [0, 0, 18], facingRadians: 0 });`,
  `    const spawnContext = context;
    context.registration.registerSpawnMarker({ id: context.bootstrap.spawnMarkerId, positionMetersXYZ: [0, 0, spawnContext.scene === undefined ? 18 : 17], facingRadians: 0 });`,
);

const MULTIPLE_ROUTE_COMPONENTS_SCENE_SOURCE = SCENE_SOURCE.replace(
  `    session.createBlock({id: "gate", shape: "full", paletteRole: "structure", visualGroupId: "gate-mass-group", centerMetersXYZ: [4, -0.5, 2] });`,
  `    session.createBlock({id: "isolated-route", shape: "full", paletteRole: "route", visualGroupId: "central-ascent-group", centerMetersXYZ: [20, -0.5, 20] });
    session.createBlock({id: "gate", shape: "full", paletteRole: "structure", visualGroupId: "gate-mass-group", centerMetersXYZ: [4, -0.5, 2] });`,
);

const MISSING_GRID_CHILD_SCENE_SOURCE = SCENE_SOURCE.replace(
  `{ kind: "block-group", colliderGroupId: "foreground-ground-group" }`,
  `{ kind: "block", blockId: "foreground" }`,
);

const NARROW_SPAWN_GROUND_SCENE_SOURCE = SCENE_SOURCE.replace(
  `shape: "full", paletteRole: "ground", visualGroupId: "foreground-platform-group", colliderGroupId: "foreground-ground-group", minimumCenterMetersXYZ: [-1, -0.5, 11], repeatCountXYZ: [3, 1, 8]`,
  `shape: "small", paletteRole: "ground", visualGroupId: "foreground-platform-group", colliderGroupId: "foreground-ground-group", minimumCenterMetersXYZ: [0.25, -0.25, 11.25], repeatCountXYZ: [1, 1, 14]`,
);

const SPAWN_ADJACENT_STEP_SCENE_SOURCE = SCENE_SOURCE.replace(
  `    session.createBlock({id: "gate", shape: "full", paletteRole: "structure", visualGroupId: "gate-mass-group", centerMetersXYZ: [4, -0.5, 2] });`,
  `    session.createBlockGrid({idPrefix: "spawn-step-left", shape: "step", paletteRole: "route", visualGroupId: "central-ascent-group", colliderGroupId: "central-ground-group", minimumCenterMetersXYZ: [-1, 0.125, 11], repeatCountXYZ: [1, 1, 8] });
    session.createBlock({id: "gate", shape: "full", paletteRole: "structure", visualGroupId: "gate-mass-group", centerMetersXYZ: [4, -0.5, 2] });`,
);

const EXTRA_VISUAL_GROUP_SCENE_SOURCE = SCENE_SOURCE.replace(
  `    session.createBlockGrid({idPrefix: "upper",`,
  `    session.createBlock({id: "supported-spawn", shape: "full", paletteRole: "ground", visualGroupId: "supported-spawn-group", centerMetersXYZ: [8, -0.5, 2] });
    session.createBlockGrid({idPrefix: "upper",`,
);

const EXTRA_VISUAL_GROUP_AUTHORING = {
  ...AUTHORING,
  visualGroups: [
    ...AUTHORING.visualGroups.slice(0, 4),
    { visualGroupId: "supported-spawn-group", acceptanceTargetRef: "worldkit://acceptance-target/supported-spawn@1", semanticClassId: "ground.supported-spawn", identityColorHex: "#AA0006" },
    AUTHORING.visualGroups[4]!,
  ],
} as const;

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })));
});

async function completedAttempt(options: Readonly<{
  sceneSource?: string;
  authoring?: typeof AUTHORING | typeof EXTRA_VISUAL_GROUP_AUTHORING;
  omitAdvisory?: boolean;
  target3IdentityColorHex?: string;
}> = {}) {
  const sceneSource = options.sceneSource ?? SCENE_SOURCE;
  const authoring = options.authoring ?? AUTHORING;
  const root = await realpath(await mkdtemp(
    path.join(os.tmpdir(), "worldkit-native-package-"),
  ));
  temporaryRoots.push(root);
  const caseRoot = path.join(root, "case");
  await cp(CASE_SOURCE, caseRoot, { recursive: true });
  const casePath = path.join(caseRoot, "case.json");
  const inputDirectoryPath = path.join(caseRoot, "inputs");
  const [caseValue, profileValue, boundsValue] = await Promise.all([
    readFile(casePath, "utf8").then(JSON.parse),
    readFile(path.join(caseRoot, "evaluation-profile.json"), "utf8").then(JSON.parse),
    readFile(path.join(inputDirectoryPath, "world-bounds.json"), "utf8").then(JSON.parse),
  ]);
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
    worldBoundsPath: path.join(inputDirectoryPath, "world-bounds.json"),
    worldBounds: parseWorldPackageWorldBoundsV1(boundsValue),
    bootstrapId: `${reconstructionCase.id}-native`,
    sceneModuleRef: `worldkit://native-scene/${reconstructionCase.id}@1`,
    seed: 19,
    budgets: {
      maximumBlockCount: 64,
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
  expect(
    generated.receipt.outcome,
    JSON.stringify(generated.receipt),
  ).toBe("completed");
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

async function expectVisualReviewRejectedBeforeGround(
  fixture: Awaited<ReturnType<typeof completedAttempt>>,
  diagnostic: string,
): Promise<void> {
  await expect(packageNativeBlockAttemptV1({
    repositoryRoot: REPOSITORY_ROOT,
    attemptDirectoryPath: fixture.attemptDirectoryPath,
    casePath: fixture.casePath,
    outputDirectoryPath: fixture.outputDirectoryPath,
  })).rejects.toMatchObject({ diagnostics: [diagnostic] });
  await expect(lstat(path.join(
    fixture.attemptDirectoryPath,
    "native-check-result.json",
  ))).resolves.toBeDefined();
  await expect(lstat(path.join(
    fixture.attemptDirectoryPath,
    "ground-analysis-report.json",
  ))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(lstat(fixture.outputDirectoryPath)).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect((await readdir(fixture.attemptDirectoryPath)).filter((name) =>
    name.startsWith(".native-block-visual-replay-")
  )).toEqual([]);
}

describe("packageNativeBlockAttemptV1", () => {
  it("exposes the single materialized Profile identity authority through the Host entrypoint", () => {
    expect(typeof createBabylonNativeBlockProfileInventoryIdentityFromMaterializedV1)
      .toBe("function");
  });

  it("fails closed when the Profile topology exceeds the controlled Subject envelope", () => {
    const evidence = (options: Readonly<{
      riseMeters?: number;
      reverseWinding?: boolean;
      topologyPolicyHash?: Sha256HashV1;
    }> = {}) => {
      const logicalGroundModelHash = sha256CanonicalJson({ ground: "model" });
      const topologyBody = {
        kind: "babylon-native-block-walkable-topology",
        schemaVersion: 1,
        identity: {
          logicalGroundModelHash,
          topologyPolicyHash: options.topologyPolicyHash ?? sha256CanonicalJson(
            BABYLON_NATIVE_BLOCK_CURRENT_WALKABLE_TOPOLOGY_POLICY_V1,
          ),
        },
        walkableGeometries: [{
          logicalColliderId: "ground",
          collisionPositionsMetersXYZ: [
            0, 0, 0,
            1, options.riseMeters ?? 0, 0,
            0, 0, 1,
          ],
          triangleIndices: options.reverseWinding ? [0, 2, 1] : [0, 1, 2],
        }],
        solidGeometries: [],
        logicalColliderCount: 1,
        colliderVertexCount: 3,
        colliderTriangleCount: 1,
        removedInternalFaceCount: 0,
      };
      return {
        logicalGroundModel: { logicalGroundModelHash },
        topology: {
          ...topologyBody,
          topologyHash: sha256CanonicalJson(topologyBody),
        },
      } as never;
    };
    const envelope = (maxStepHeightMeters: number, maxSlopeDegrees: number) => ({
      envelope: { maxStepHeightMeters, maxSlopeDegrees },
    }) as never;

    expect(() => assertProductionNativeBlockGroundTopologyCompatibleV1(
      evidence(),
      envelope(0.3, 42),
    )).not.toThrow();
    expect(() => assertProductionNativeBlockGroundTopologyCompatibleV1(
      evidence(),
      envelope(0.2, 42),
    )).toThrow(
      "WORLDKIT_NATIVE_BLOCK_GROUND_ADMISSION_INPUT_INVALID: Block Profile auto-smooth limit 0.3m exceeds controlled Subject maxStepHeightMeters 0.2m",
    );
    expect(() => assertProductionNativeBlockGroundTopologyCompatibleV1(
      evidence({ riseMeters: 0.5 }),
      envelope(0.3, 20),
    )).toThrow(/slope .* exceeds controlled Subject maxSlopeDegrees 20deg/);
    expect(() => assertProductionNativeBlockGroundTopologyCompatibleV1(
      evidence({ reverseWinding: true }),
      envelope(0.3, 42),
    )).toThrow(/downward-facing triangle/);
    expect(() => assertProductionNativeBlockGroundTopologyCompatibleV1(
      evidence({ topologyPolicyHash: `sha256:${"0".repeat(64)}` }),
      envelope(0.3, 42),
    )).toThrow(/topology identity or Profile policy is stale/);
  });

  it("admits exactly the two current Native Block imports in production", () => {
    expect(() => assertNativeBlockProductionSourceImportsV1([
      "@whitebox-world/native-babylon",
      "@whitebox-world/native-babylon-block-profile",
    ])).not.toThrow();
    expect(() => assertNativeBlockProductionSourceImportsV1([
      "@whitebox-world/native-babylon",
      "@whitebox-world/native-babylon-block-profile",
      "@babylonjs/core/Maths/math.vector.js",
    ])).toThrowError(expect.objectContaining({
      diagnostics: [
        "production-native-import-set-invalid:@babylonjs/core/Maths/math.vector.js,@whitebox-world/native-babylon,@whitebox-world/native-babylon-block-profile",
      ],
    }));
    expect(() => assertNativeBlockProductionSourceImportsV1([
      "@whitebox-world/native-babylon",
    ])).toThrowError(expect.objectContaining({
      diagnostics: [
        "production-native-import-set-invalid:@whitebox-world/native-babylon",
      ],
    }));
  });

  it("restores original owner receipts when generation completed before the Host checkpoint commit", async () => {
    const fixture = await completedAttempt({ omitAdvisory: true });
    // The reconstruction runner normally creates the advisory directory. No rendering is
    // needed to exercise the generation receipt/checkpoint crash boundary.
    await mkdir(path.join(fixture.attemptDirectoryPath, "advisory"));
    const forbidden = vi.fn(async () => { throw new Error("UNEXPECTED_OWNER_REEXECUTION"); });
    const owners: ProductionWorldReconstructionRunPortOwnersV1 = {
      prepareGeneration: forbidden, runGeneration: forbidden, runSelfCheck: forbidden,
      packageAttempt: forbidden, materializeCaptureRequest: forbidden,
      capturePackage: forbidden, evaluateAttempt: forbidden, reconcileGeneration: forbidden,
      createProcessPort: vi.fn(() => { throw new Error("UNEXPECTED_PROCESS"); }),
      resolveFrozenOwnerIdentities: vi.fn(() => { throw new Error("UNEXPECTED_OWNER_RESOLUTION"); }),
    };
    const formalCaptureIntent = parseFormalWorldCaptureIntentV1(JSON.parse(await readFile(path.join(
      path.dirname(fixture.casePath), "inputs/formal-world-capture-intent.json"), "utf8")));
    const input = { executionPurpose: "production" as const, hostRecoveryIndex: 1,
      repositoryRoot: REPOSITORY_ROOT, casePath: fixture.casePath,
      caseRef: `artifact://world-reconstruction-case/${fixture.reconstructionCase.id}/case.json`,
      evaluationProfilePath: path.join(path.dirname(fixture.casePath), "evaluation-profile.json"),
      reconstructionCase: fixture.reconstructionCase, evaluationProfile: fixture.profile,
      generationInput: fixture.generationInput, formalCaptureIntent };
    const stageInput = { attemptIndex: 0 as const, backend: "local" as const, runId: "test",
      requestId: fixture.prepared.routerRequestId, frozenOwnerIdentities: fixture.prepared.frozenOwnerIdentities };
    const receiptBefore = await readFile(path.join(fixture.attemptDirectoryPath, "generation-receipt.json"));
    const ports = await createProductionWorldReconstructionRunPortsV1(input, owners);
    // A lost Host checkpoint does not allow stale owner bytes to become a new baseline.
    for (const relativePath of ["source/scene.ts", "context/case.json"]) {
      const target = path.join(fixture.attemptDirectoryPath, relativePath);
      const original = await readFile(target);
      await writeFile(target, "changed-after-generation");
      await expect(ports.restoreGenerated!(stageInput)).rejects.toThrow("HOST_CHECKPOINT_INVALID");
      await writeFile(target, original);
    }
    await expect(ports.restoreGenerated!({ ...stageInput, requestId: "foreign-request" }))
      .rejects.toThrow("HOST_CHECKPOINT_INVALID");
    await expect(ports.restoreGenerated!({ ...stageInput, frozenOwnerIdentities: {
      ...stageInput.frozenOwnerIdentities, caseHash: `sha256:${"f".repeat(64)}`,
    } })).rejects.toThrow("HOST_CHECKPOINT_INVALID");
    const generated = await ports.restoreGenerated!(stageInput);
    expect(generated).toMatchObject({ outcome: "completed", requestId: fixture.prepared.routerRequestId,
      requestHash: fixture.prepared.routerTaskPayloadHash });
    const restarted = await createProductionWorldReconstructionRunPortsV1({ ...input, hostRecoveryIndex: 2 }, owners);
    expect(await restarted.restoreGenerated!(stageInput)).toEqual(generated);
    expect(forbidden).not.toHaveBeenCalled();
    expect(await readFile(path.join(fixture.attemptDirectoryPath, "generation-receipt.json"))).toEqual(receiptBefore);
    expect(await readFile(path.join(fixture.attemptDirectoryPath, "host-checkpoints/generate.json"), "utf8"))
      .toContain(fixture.prepared.routerRequestId);
  }, 30_000);

  it("packages the original generated Attempt into a recovery epoch without overwriting the failed check", async () => {
    const fixture = await completedAttempt();
    const originalReceipt = await readFile(path.join(fixture.attemptDirectoryPath, "generation-receipt.json"));
    const originalSource = await readFile(path.join(fixture.attemptDirectoryPath, "source/scene.ts"));
    await writeFile(path.join(fixture.attemptDirectoryPath, "native-check-result.json"), "historical-failure");
    const outputDirectoryPath = path.join(fixture.attemptDirectoryPath, "host-recoveries/1/world-package");
    const result = await packageNativeBlockAttemptV1({ repositoryRoot: REPOSITORY_ROOT,
      attemptDirectoryPath: fixture.attemptDirectoryPath, casePath: fixture.casePath, outputDirectoryPath });
    expect(result.outcome).toBe("completed");
    expect(result.groundAnalysisReportPath).toBe(path.join(path.dirname(outputDirectoryPath), "ground-analysis-report.json"));
    expect(await readFile(path.join(fixture.attemptDirectoryPath, "native-check-result.json"), "utf8")).toBe("historical-failure");
    expect(await readFile(path.join(fixture.attemptDirectoryPath, "generation-receipt.json"))).toEqual(originalReceipt);
    expect(await readFile(path.join(fixture.attemptDirectoryPath, "source/scene.ts"))).toEqual(originalSource);
  }, 60_000);

  it("checks and binds the generated Layout before atomically publishing one verified Package", async () => {
    const fixture = await completedAttempt();
    const packaged = await packageNativeBlockAttemptV1({
      repositoryRoot: REPOSITORY_ROOT,
      attemptDirectoryPath: fixture.attemptDirectoryPath,
      casePath: fixture.casePath,
      outputDirectoryPath: fixture.outputDirectoryPath,
    }).catch(async (error: unknown) => {
      const check = await readFile(path.join(
        fixture.attemptDirectoryPath,
        "native-check-result.json",
      ), "utf8");
      const groundReport = await readFile(path.join(
        fixture.attemptDirectoryPath,
        "ground-analysis-report.json",
      ), "utf8").catch(() => "ground report not written");
      const cause = error instanceof Error ? error.cause : undefined;
      const nestedCause = cause instanceof Error ? cause.cause : undefined;
      throw new Error(
        [
          error,
          error instanceof NativeBlockPackageErrorV1
            ? JSON.stringify(error.diagnostics)
            : "",
          cause,
          nestedCause,
          check,
          groundReport,
        ].map(String).join("\n"),
      );
    });

    expect(packaged.checkResult.outcome).toBe("passed");
    expect(packaged.verifiedWorldPackage.kind).toBe("babylon-native-scene");
    expect(packaged.sceneAuthoringAttemptResult.authoredSourceHash).toBe(
      packaged.verifiedWorldPackage.sceneModuleBundleManifest.sourceGraphHash,
    );
    expect(
      packaged.verifiedWorldPackage.nativeBlockMaterializerMetadata
        ?.visualGroups,
    ).toHaveLength(5);
    const contribution = packaged.verifiedWorldPackage.nativeSceneContribution;
    const groundBoundary = contribution.staticColliders.find(
      ({ runtimeRole }) => runtimeRole === "ground-safety-boundary",
    );
    expect(groundBoundary).toMatchObject({
      runtimeRole: "ground-safety-boundary",
      traversalBinding: { kind: "not-traversable" },
    });
    expect(
      packaged.verifiedWorldPackage.nativeBlockMaterializerMetadata
        ?.colliderJoins.some(({ colliderId }) => colliderId === groundBoundary?.id),
    ).toBe(false);
    expect(packaged.verifiedWorldPackage.receipt.manifest.sceneSource).toEqual(
      expect.objectContaining({
        kind: "babylon-native-scene",
        nativeSceneContributionHash:
          hashBabylonNativeSceneContributionV1(contribution),
      }),
    );
    expect(packaged.worldPackageRef).toBe(
      packaged.verifiedWorldPackage.receipt.worldPackageRef,
    );
    expect(packaged.groundAnalysisReport).toMatchObject({
      kind: "babylon-native-block-ground-analysis-report",
      admissionOutcome: "passed",
      identity: {
        worldPackageRootHash: packaged.worldPackageRootHash,
      },
    });
    expect(packaged.groundAnalysisReport.standableNodes).toEqual(
      expect.arrayContaining([expect.objectContaining({
        positionMetersXYZ: [0, 0, 18],
        isReachableFromSpawn: true,
      })]),
    );
    expect(packaged.groundAnalysisReportHash).toBe(
      sha256CanonicalJson(packaged.groundAnalysisReport),
    );
    expect(JSON.parse(await readFile(
      packaged.groundAnalysisReportPath,
      "utf8",
    ))).toEqual(packaged.groundAnalysisReport);
    await expect(lstat(path.join(
      fixture.attemptDirectoryPath,
      "logical-ground-model.json",
    ))).resolves.toBeDefined();
    await expect(lstat(path.join(
      fixture.attemptDirectoryPath,
      "ground-analysis-diagnostics.json",
    ))).resolves.toBeDefined();
    await expect(lstat(path.join(
      fixture.outputDirectoryPath,
      "native",
      "block-materializer-metadata.json",
    ))).resolves.toBeDefined();
    await expect(lstat(path.join(
      fixture.attemptDirectoryPath,
      "native-block-authoring-layout-binding.json",
    ))).rejects.toMatchObject({ code: "ENOENT" });
    expect(JSON.parse(await readFile(path.join(
      fixture.attemptDirectoryPath,
      "attempt-result.json",
    ), "utf8"))).toEqual(packaged.sceneAuthoringAttemptResult);
    expect(await readFile(path.join(
      fixture.attemptDirectoryPath,
      "native-explain.txt",
    ), "utf8")).toBe("outcome: passed\n");
    await expect(lstat(path.join(
      fixture.attemptDirectoryPath,
      "scene-authoring-attempt-result.json",
    ))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await readdir(fixture.attemptDirectoryPath)).filter((name) =>
      name.startsWith(".native-block-visual-replay-")
    )).toEqual([]);
  }, 60_000);

  it("rejects a Builder-selected target color before Native Check", async () => {
    const fixture = await completedAttempt({
      target3IdentityColorHex: "#123456",
      omitAdvisory: true,
    });

    await expect(packageNativeBlockAttemptV1({
      repositoryRoot: REPOSITORY_ROOT,
      attemptDirectoryPath: fixture.attemptDirectoryPath,
      casePath: fixture.casePath,
      outputDirectoryPath: fixture.outputDirectoryPath,
    })).rejects.toMatchObject({
      diagnostics: [
        "WORLDKIT_NATIVE_BLOCK_VISUAL_IDENTITY_BINDING_INVALID",
      ],
      visualIdentityAdmissionRejection: {
        outcome: "rejected",
        diagnostics: [expect.objectContaining({
          reason: "identity-color-mismatch",
          visualTargetId: "visual-target-3",
          expectedIdentityColorHex: "#D9A514",
          actualIdentityColorHex: "#123456",
        })],
      },
    });
    await expect(lstat(path.join(
      fixture.attemptDirectoryPath,
      "native-check-result.json",
    ))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(fixture.outputDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  }, 60_000);

  it("completes Package publication when route palette Blocks form multiple advisory components", async () => {
    const fixture = await completedAttempt({
      sceneSource: MULTIPLE_ROUTE_COMPONENTS_SCENE_SOURCE,
    });

    const packaged = await packageNativeBlockAttemptV1({
      repositoryRoot: REPOSITORY_ROOT,
      attemptDirectoryPath: fixture.attemptDirectoryPath,
      casePath: fixture.casePath,
      outputDirectoryPath: fixture.outputDirectoryPath,
    });

    expect(packaged.outcome).toBe("completed");
    expect(packaged.checkResult.outcome).toBe("passed");
    expect(packaged.groundAnalysisReport.admissionOutcome).toBe("passed");
    const routeBlocks = packaged.verifiedWorldPackage
      .nativeBlockMaterializerMetadata?.blocks.filter(
        ({ paletteRole }) => paletteRole === "route",
      );
    expect(routeBlocks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        blockId: "isolated-route",
        centerMetersXYZ: [20, -0.5, 20],
      }),
      expect.objectContaining({
        blockId: "central-x0-y0-z0",
      }),
    ]));
    expect(await readFile(path.join(
      fixture.attemptDirectoryPath,
      "native-explain.txt",
    ), "utf8")).toBe("outcome: passed\n");
  }, 60_000);

  it("fails closed after Native Check when one Builder advisory output is missing", async () => {
    const fixture = await completedAttempt();
    await rm(path.join(
      fixture.attemptDirectoryPath,
      "advisory/builder-top-down-comparison.png",
    ));

    await expectVisualReviewRejectedBeforeGround(
      fixture,
      "native-block-visual-review-output-missing",
    );
  }, 60_000);

  it("fails closed on a valid fixed-dimension PNG whose decoded RGBA differs from Host replay", async () => {
    const fixture = await completedAttempt();
    const topPath = path.join(
      fixture.attemptDirectoryPath,
      "advisory/builder-top-down-comparison.png",
    );
    const decoded = await sharp(await readFile(topPath))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    decoded.data[0] = decoded.data[0] === 255 ? 254 : decoded.data[0]! + 1;
    await writeFile(topPath, await sharp(decoded.data, {
      raw: decoded.info,
    }).png().toBuffer());

    await expectVisualReviewRejectedBeforeGround(
      fixture,
      "native-block-visual-review-rgba-mismatch",
    );
  }, 60_000);

  it("rejects advisory pixels whose mock layout differs from the checked Native Profile layout", async () => {
    const fixture = await completedAttempt({
      sceneSource: MOCK_CONTEXT_LAYOUT_BRANCH_SCENE_SOURCE,
    });

    await expectVisualReviewRejectedBeforeGround(
      fixture,
      "native-block-visual-review-layout-mismatch",
    );
  }, 60_000);

  it("joins captured displayGap through the checked Profile inventory identity", async () => {
    const fixture = await completedAttempt({
      sceneSource: MOCK_CONTEXT_GAP_BRANCH_SCENE_SOURCE,
    });

    await expectVisualReviewRejectedBeforeGround(
      fixture,
      "native-block-visual-review-layout-mismatch",
    );
  }, 60_000);

  it("joins captured Spawn exactly to the checked Native contribution", async () => {
    const fixture = await completedAttempt({
      sceneSource: MOCK_CONTEXT_SPAWN_BRANCH_SCENE_SOURCE,
    });

    await expectVisualReviewRejectedBeforeGround(
      fixture,
      "native-block-visual-review-layout-mismatch",
    );
  }, 60_000);

  it("fails closed before reading advisory output bytes outside the closed budget", async () => {
    const fixture = await completedAttempt();
    await writeFile(path.join(
      fixture.attemptDirectoryPath,
      "advisory/builder-top-down-comparison.png",
    ), Buffer.alloc(4_000_001));

    await expectVisualReviewRejectedBeforeGround(
      fixture,
      "native-block-visual-review-output-budget-exceeded",
    );
  }, 60_000);

  it("rejects a compressed PNG whose decoded pixels exceed the fixed review surface", async () => {
    const fixture = await completedAttempt();
    const compressedBomb = await sharp({
      create: {
        width: 2_048,
        height: 2_048,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    }).png({ compressionLevel: 9 }).toBuffer();
    await writeFile(path.join(
      fixture.attemptDirectoryPath,
      "advisory/builder-top-down-comparison.png",
    ), compressedBomb);

    await expectVisualReviewRejectedBeforeGround(
      fixture,
      "native-block-visual-review-png-invalid",
    );
  }, 60_000);

  it("rejects a valid PNG with the wrong fixed review dimensions", async () => {
    const fixture = await completedAttempt();
    const entryBytes = await readFile(path.join(
      fixture.attemptDirectoryPath,
      "advisory/builder-entry-comparison.png",
    ));
    await writeFile(path.join(
      fixture.attemptDirectoryPath,
      "advisory/builder-top-down-comparison.png",
    ), entryBytes);

    await expectVisualReviewRejectedBeforeGround(
      fixture,
      "native-block-visual-review-png-invalid",
    );
  }, 60_000);

  it("fails closed when the durable Builder renderer no longer closes its frozen hash", async () => {
    const fixture = await completedAttempt();
    const rendererPath = path.join(
      fixture.attemptDirectoryPath,
      "inputs/builder-skill/scripts/render-visual-review.mjs",
    );
    await writeFile(
      rendererPath,
      Buffer.concat([await readFile(rendererPath), Buffer.from("\n")]),
    );

    await expectVisualReviewRejectedBeforeGround(
      fixture,
      "native-block-visual-review-renderer-stale",
    );
  }, 60_000);

  it("fails closed when the Host-owned Subject visual proxy bytes drift", async () => {
    const fixture = await completedAttempt();
    const proxyPath = path.join(
      fixture.attemptDirectoryPath,
      "inputs/subject-visual-review-proxy.json",
    );
    await writeFile(
      proxyPath,
      Buffer.concat([await readFile(proxyPath), Buffer.from("\n")]),
    );

    await expectVisualReviewRejectedBeforeGround(
      fixture,
      "native-block-subject-visual-review-proxy-stale",
    );
  }, 60_000);

  it("fails closed when a durable planning image no longer closes Case and Request identity", async () => {
    const fixture = await completedAttempt();
    await writeFile(path.join(
      fixture.attemptDirectoryPath,
      "inputs/world-plan.png",
    ), "tampered");

    await expectVisualReviewRejectedBeforeGround(
      fixture,
      "native-block-visual-review-input-stale",
    );
  }, 60_000);

  it("rejects an extra authored visual group at the visual identity boundary", async () => {
    const fixture = await completedAttempt({
      sceneSource: EXTRA_VISUAL_GROUP_SCENE_SOURCE,
      authoring: EXTRA_VISUAL_GROUP_AUTHORING,
    });

    await expect(packageNativeBlockAttemptV1({
      repositoryRoot: REPOSITORY_ROOT,
      attemptDirectoryPath: fixture.attemptDirectoryPath,
      casePath: fixture.casePath,
      outputDirectoryPath: fixture.outputDirectoryPath,
    })).rejects.toMatchObject({
      diagnostics: ["WORLDKIT_NATIVE_BLOCK_VISUAL_IDENTITY_BINDING_INVALID"],
    });
  }, 60_000);

  it("fails closed before Package publication when the Spawn Capsule footprint is not fully supported", async () => {
    const fixture = await completedAttempt({
      sceneSource: NARROW_SPAWN_GROUND_SCENE_SOURCE,
    });

    const rejected = await packageNativeBlockAttemptV1({
      repositoryRoot: REPOSITORY_ROOT,
      attemptDirectoryPath: fixture.attemptDirectoryPath,
      casePath: fixture.casePath,
      outputDirectoryPath: fixture.outputDirectoryPath,
    }).catch((error: unknown) => error);
    expect(rejected).toMatchObject({
      diagnostics: [
        "WORLD_RECONSTRUCTION_REQUIRED_TRAVERSAL_BLOCKED",
        "native-ground-analysis-rejected",
      ],
      groundAnalysisRejection: {
        kind: "ground-analysis-rejected",
        groundAnalysisReport: {
          admissionOutcome: "failed",
        },
        repairDiagnostics: expect.arrayContaining([
          expect.objectContaining({
            metricId: "ground-support-coverage-basis-points",
            targetId: "spawn-foreground-platform",
          }),
        ]),
      },
    });
    const report = JSON.parse(await readFile(path.join(
      fixture.attemptDirectoryPath,
      "ground-analysis-report.json",
    ), "utf8"));
    expect(report).toMatchObject({
      kind: "babylon-native-block-ground-analysis-report",
      admissionOutcome: "failed",
    });
    expect(report.failureFacts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        metricId: "ground-support-coverage-basis-points",
        targetId: "spawn-foreground-platform",
      }),
    ]));
    expect(JSON.parse(await readFile(path.join(
      fixture.attemptDirectoryPath,
      "attempt-result.json",
    ), "utf8"))).toMatchObject({
      outcome: "completed",
      authoredSourceRef: expect.any(String),
      authoredSourceHash: expect.stringMatching(/^sha256:/),
    });
    await expect(lstat(fixture.outputDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  }, 60_000);

  it("reuses Runtime surface admission before Package publication when final topology obstructs the Spawn Capsule", async () => {
    const fixture = await completedAttempt({
      sceneSource: SPAWN_ADJACENT_STEP_SCENE_SOURCE,
    });

    const rejected = await packageNativeBlockAttemptV1({
      repositoryRoot: REPOSITORY_ROOT,
      attemptDirectoryPath: fixture.attemptDirectoryPath,
      casePath: fixture.casePath,
      outputDirectoryPath: fixture.outputDirectoryPath,
    }).catch((error: unknown) => error);

    expect(rejected).toMatchObject({
      diagnostics: [
        "WORLD_RECONSTRUCTION_REQUIRED_TRAVERSAL_BLOCKED",
        "native-ground-analysis-rejected",
      ],
      groundAnalysisRejection: {
        groundAnalysisReport: {
          admissionOutcome: "failed",
          failureFacts: expect.arrayContaining([
            expect.objectContaining({
              metricId: "ground-spawn-standability",
              targetId: "spawn-foreground-platform",
              details: {
                kind: "state-mismatch",
                expectedValue: "runtime-surface-admitted",
                actualValue:
                  "WORLDKIT_NATIVE_SCENE_RUNTIME_SPAWN_CAPSULE_OBSTRUCTED",
                correctionDirection: "replace",
              },
            }),
          ]),
        },
        repairDiagnostics: expect.arrayContaining([
          expect.objectContaining({
            metricId: "ground-spawn-standability",
            message: expect.stringContaining("Related frozen Collider IDs:"),
            repairAction: expect.objectContaining({
              instruction: expect.stringContaining(
                "Keep the frozen Subject Capsule and Runtime admission threshold unchanged.",
              ),
            }),
          }),
        ]),
      },
    });
    await expect(lstat(fixture.outputDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  }, 60_000);

  it("rejects post-creation Block placement without inventing a Builder repair", async () => {
    const fixture = await completedAttempt({
      sceneSource: REPLACED_PLACEMENT_DIALECT_SCENE_SOURCE,
      omitAdvisory: true,
    });

    await expect(packageNativeBlockAttemptV1({
      repositoryRoot: REPOSITORY_ROOT,
      attemptDirectoryPath: fixture.attemptDirectoryPath,
      casePath: fixture.casePath,
      outputDirectoryPath: fixture.outputDirectoryPath,
    })).rejects.toMatchObject({
      diagnostics: ["native-check-rejected"],
      nativeCheckRejection: {
        kind: "native-check-rejected",
        repairDiagnostics: [],
      },
    });
    expect(await readFile(path.join(
      fixture.attemptDirectoryPath,
      "native-check-result.json",
    ), "utf8")).toContain("WORLDKIT_NATIVE_SCENE_TYPECHECK_FAILED");
    await expect(lstat(fixture.outputDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  }, 60_000);

  it("rejects a Grid Collider that names the prefix instead of a child Block", async () => {
    const fixture = await completedAttempt({
      sceneSource: MISSING_GRID_CHILD_SCENE_SOURCE,
    });

    await expect(packageNativeBlockAttemptV1({
      repositoryRoot: REPOSITORY_ROOT,
      attemptDirectoryPath: fixture.attemptDirectoryPath,
      casePath: fixture.casePath,
      outputDirectoryPath: fixture.outputDirectoryPath,
    })).rejects.toMatchObject({ diagnostics: ["native-check-rejected"] });
    const checkResult = await readFile(path.join(
      fixture.attemptDirectoryPath,
      "native-check-result.json",
    ), "utf8");
    expect(checkResult).toContain("WORLDKIT_NATIVE_BLOCK_COLLIDER_SOURCE_MISSING");
    expect(checkResult).not.toContain("WORLDKIT_NATIVE_SCENE_MODULE_BUILD_FAILED");
    expect(checkResult).not.toMatch(/(?:Error:|\n\s+at\s)/);
    await expect(lstat(fixture.outputDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  }, 60_000);

  it("gives regenerated current-API source a new authored-source and Package identity", async () => {
    const publishedResultPath = path.join(
      HOST_CLOSURE_ROOT,
      "authoring/scene-authoring-attempt-result.json",
    );
    const publishedBefore = await readFile(publishedResultPath, "utf8");
    const [baseline, regenerated] = [
      await completedAttempt(),
      await completedAttempt({ sceneSource: REGENERATED_GRID_SCENE_SOURCE }),
    ];

    const [baselinePackage, regeneratedPackage] = await Promise.all([
      packageNativeBlockAttemptV1({
        repositoryRoot: REPOSITORY_ROOT,
        attemptDirectoryPath: baseline.attemptDirectoryPath,
        casePath: baseline.casePath,
        outputDirectoryPath: baseline.outputDirectoryPath,
      }),
      packageNativeBlockAttemptV1({
        repositoryRoot: REPOSITORY_ROOT,
        attemptDirectoryPath: regenerated.attemptDirectoryPath,
        casePath: regenerated.casePath,
        outputDirectoryPath: regenerated.outputDirectoryPath,
      }),
    ]);

    expect(regeneratedPackage.checkResult.outcome).toBe("passed");
    expect(regeneratedPackage.sceneAuthoringAttemptResult.authoredSourceHash)
      .not.toBe(baselinePackage.sceneAuthoringAttemptResult.authoredSourceHash);
    expect(regeneratedPackage.worldPackageRootHash)
      .not.toBe(baselinePackage.worldPackageRootHash);
    expect(regeneratedPackage.buildReceiptHash)
      .not.toBe(baselinePackage.buildReceiptHash);
    expect(regeneratedPackage.sceneAuthoringAttemptResult.authoredSourceHash)
      .toBe(
        regeneratedPackage.verifiedWorldPackage.sceneModuleBundleManifest
          .sourceGraphHash,
      );

    const publishedResult = JSON.parse(publishedBefore);
    expect(regeneratedPackage.sceneAuthoringAttemptResult.authoredSourceHash)
      .not.toBe(publishedResult.authoredSourceHash);
    expect(await readFile(publishedResultPath, "utf8")).toBe(publishedBefore);
  }, 120_000);

  it("rejects a stale Generation Receipt before creating a check or Package output", async () => {
    const fixture = await completedAttempt();
    const receiptPath = path.join(fixture.attemptDirectoryPath, "generation-receipt.json");
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    receipt.generationRequestHash = `sha256:${"f".repeat(64)}`;
    await writeFile(receiptPath, `${stringifyCanonicalJson(receipt)}\n`);

    await expect(packageNativeBlockAttemptV1({
      repositoryRoot: REPOSITORY_ROOT,
      attemptDirectoryPath: fixture.attemptDirectoryPath,
      casePath: fixture.casePath,
      outputDirectoryPath: fixture.outputDirectoryPath,
    })).rejects.toBeInstanceOf(NativeBlockPackageErrorV1);
    await expect(lstat(fixture.outputDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects every Package output location except the canonical Attempt child", async () => {
    const fixture = await completedAttempt();
    const externalOutputPath = path.join(fixture.root, "packages", "world");

    await expect(packageNativeBlockAttemptV1({
      repositoryRoot: REPOSITORY_ROOT,
      attemptDirectoryPath: fixture.attemptDirectoryPath,
      casePath: fixture.casePath,
      outputDirectoryPath: externalOutputPath,
    })).rejects.toMatchObject({
      diagnostics: ["output-location-invalid"],
    });
    await expect(packageNativeBlockAttemptV1({
      repositoryRoot: REPOSITORY_ROOT,
      attemptDirectoryPath: fixture.attemptDirectoryPath,
      casePath: fixture.casePath,
      outputDirectoryPath: path.join(fixture.attemptDirectoryPath, "other"),
    })).rejects.toMatchObject({
      diagnostics: ["output-location-invalid"],
    });
    await expect(lstat(externalOutputPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
