import { builtInSubjectResourceRegistry, createSubjectResourceRegistry, type SubjectRegistryResourceInputV3 } from "@whitebox-world/subject-registry";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { normalizeAuthoringSpecV4, parseSceneBriefV1, type ComposedSubjectDesignV1 } from "@whitebox-world/authoring";
import {
  createValidPackageSubjectWorldV4,
  createValidRiggedPackageSubjectWorldV4,
} from "@whitebox-world/authoring/testing";
import sharp from "sharp";

import { sha256Bytes, sha256CanonicalJson, stringifyCanonicalJson, type Sha256HashV1 } from "@whitebox-world/protocol";
import { createGameplayBootstrapV1, parseGameplayBootstrapV1 } from "@whitebox-world/gameplay-contracts";
import { createWorldRuntimeBootstrapV1, parseWorldRuntimeBootstrapV1 } from "@whitebox-world/runtime-contracts";
import { decideSceneAuthoringRouteV1, parseSceneAuthoringRouteDecisionV1, type SceneAuthoringRouteDecisionV1 } from "@whitebox-world/scene-authoring-contracts";
import { hashWorldReconstructionEvaluationProfileV1, parseWorldReconstructionCaseV1, parseWorldReconstructionDiagnosticV1, parseWorldReconstructionEvaluationProfileV1 } from "@whitebox-world/validation";

import {
  decideNativeBlockReconstructionRouteV1,
  deriveNativeBlockGenerationBootstrapV1,
  prepareNativeBlockGenerationTaskV1,
  resolveWorldReconstructionFrozenOwnerIdentitiesV1,
} from "./generation-request.js";
import {
  NATIVE_BLOCK_RECONSTRUCTION_FORMAL_BUDGETS_V1,
  NATIVE_BLOCK_RECONSTRUCTION_FORMAL_TIMEOUT_SECONDS_V1,
  evaluateBlockSourceResourceBudgetV1,
} from "./native-block-production-budget.js";
import {
  deriveNativeBlockSubjectVisualReviewProxyV1,
  parseNativeBlockSubjectVisualReviewProxyV1,
} from "./native-block-subject-visual-review-proxy.js";
import { createNativeBlockRepairInstructionV1 } from "./repair-request.js";
import { checkNativeSubjectHostedSelectionV1, createNativeSubjectAuthoringCatalogV1, createNativeSubjectHostContextV1, parseNativeSubjectHostContextV1, resolveNativeSubjectAuthoringClosureV1 } from "./native-subject-host-context.js";
import { BNA2_WHITEBOX_ADMISSION_BUDGET_V1 } from
  "../native-scene/admission-budget.js";
import {
  compileNativeSubjectHostClosureV1,
  compileNativeSubjectHostClosureFromDesignV1,
  type NativeSubjectHostClosureInputV1,
} from "./native-subject-host-closure.js";
import {
  checkNativeComposedSubjectDesignV1,
  compileNativeComposedSubjectDefinitionV1,
} from "./native-composed-subject-definition.js";

const hash = (character: string) => `sha256:${character.repeat(64)}` as `sha256:${string}`;
const API_HASH = hash("a");
const SCENE_PROFILE_HASH = hash("b");
const BLOCK_PROFILE_HASH = hash("c");
const TRUSTED_LOCAL_HASH = sha256CanonicalJson({ id: "trusted-local", version: 1 }) as `sha256:${string}`;
const BABYLON_NATIVE_VISUAL_IDENTITY_COLORS = Object.freeze([
  "#E85D5D",
  "#F28E2B",
  "#D9A514",
  "#4E79A7",
  "#9C6ADE",
] as const);

function nativeVisualIdentityPaletteText(
  sceneBriefHash: Sha256HashV1,
): string {
  return JSON.stringify({
    kind: "worldkit-visual-identity-palette",
    schemaVersion: 1,
    sceneId: "cloud-temple-t-gate-native-block",
    sceneBriefHash,
    movementModes: ["ground-walk"],
    movementModeLabels: ["陆地步行"],
    targets: BABYLON_NATIVE_VISUAL_IDENTITY_COLORS.map(
      (identityColor, index) => ({
        id: `visual-target-${index + 1}`,
        visualTargetId: `visual-target-${index + 1}`,
        targetKind: index === 0 ? "subject" : "landmark",
        name: index === 0 ? "Explorer" : `Landmark ${index}`,
        description: index === 0
          ? "controlled Subject"
          : `landmark ${index}`,
        role: index === 0
          ? "primary-subject"
          : index === 1 ? "primary-landmark" : "secondary-landmark",
        semanticClassId: index === 0
          ? "visual.subject"
          : "visual.landmark",
        identityColor,
      }),
    ),
  });
}

function nativePlannerReceiptText(input: Readonly<{
  sceneId: string;
  sceneBriefHash: Sha256HashV1;
  entryWhiteboxTargetHash: Sha256HashV1;
  worldPlanHash: Sha256HashV1;
}>): string {
  return JSON.stringify({
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

function resolutionDescriptor(
  resourceKind: "native-scene-api" | "native-scene-profile" | "native-block-profile",
  resourceRef: string,
  contentHash: `sha256:${string}`,
): string {
  return stringifyCanonicalJson({
    kind: "worldkit-resolved-resource",
    schemaVersion: 1,
    resourceKind,
    resourceRef,
    resolvedVersion: "1",
    contentHash,
  });
}

async function fixture(): Promise<Readonly<{
  root: string;
  inputDirectory: string;
  plannerReceiptHash: Sha256HashV1;
  visualIdentityPaletteHash: Sha256HashV1;
  routeDecision: SceneAuthoringRouteDecisionV1;
}>> {
  const root = await mkdtemp(path.join(os.tmpdir(), "worldkit-generation-request-"));
  const inputDirectory = path.join(root, "inputs");
  const sceneBriefBytes = await readFile(path.resolve(
    "artifacts/scenes/cloud-temple-t-gate-native-block/inputs/scene-brief.md",
  ));
  const sceneBrief = parseSceneBriefV1(sceneBriefBytes.toString("utf8"));
  if (!sceneBrief.ok) throw new Error("Invalid committed Scene Brief fixture");
  const entryBytes = new TextEncoder().encode("entry");
  const worldPlanBytes = new TextEncoder().encode("plan");
  const sceneBriefHash = sha256Bytes(sceneBriefBytes) as Sha256HashV1;
  const visualIdentityPaletteText = nativeVisualIdentityPaletteText(
    sceneBrief.sceneBriefHash as Sha256HashV1,
  );
  const visualIdentityPaletteHash = sha256Bytes(
    new TextEncoder().encode(visualIdentityPaletteText),
  ) as Sha256HashV1;
  const plannerReceiptText = nativePlannerReceiptText({
    sceneId: "cloud-temple-t-gate-native-block",
    sceneBriefHash,
    entryWhiteboxTargetHash: sha256Bytes(entryBytes) as Sha256HashV1,
    worldPlanHash: sha256Bytes(worldPlanBytes) as Sha256HashV1,
  });
  const plannerReceiptHash = sha256Bytes(
    new TextEncoder().encode(plannerReceiptText),
  ) as Sha256HashV1;
  await Promise.all([
    mkdir(path.join(inputDirectory, "builder-skill", "references"), { recursive: true }),
    mkdir(path.join(inputDirectory, "builder-skill", "scripts"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(inputDirectory, "scene-brief.md"), sceneBriefBytes),
    writeFile(path.join(inputDirectory, "entry-whitebox-target.png"), entryBytes),
    writeFile(path.join(inputDirectory, "planner-self-check.json"), plannerReceiptText),
    writeFile(path.join(inputDirectory, "reference-0.png"), "reference"),
    writeFile(
      path.join(inputDirectory, "visual-identity-palette.json"),
      visualIdentityPaletteText,
    ),
    writeFile(path.join(inputDirectory, "world-plan.png"), worldPlanBytes),
    writeFile(path.join(inputDirectory, "native-scene-api.json"), resolutionDescriptor("native-scene-api", "worldkit://native-scene-api/babylon@1", API_HASH)),
    writeFile(path.join(inputDirectory, "native-scene-profile.json"), resolutionDescriptor("native-scene-profile", "worldkit://native-scene-profile/whitebox.blocks@1", SCENE_PROFILE_HASH)),
    writeFile(path.join(inputDirectory, "block-profile.json"), resolutionDescriptor("native-block-profile", "worldkit://native-block-profile/whitebox.blocks@1", BLOCK_PROFILE_HASH)),
    writeFile(path.join(inputDirectory, "instruction.md"), "Build exactly the declared files.\n"),
    writeFile(path.join(inputDirectory, "builder-skill", "SKILL.md"), "# Builder\n"),
    writeFile(path.join(inputDirectory, "builder-skill", "references", "native-block-output-contract.md"), "# Contract\n"),
    writeFile(path.join(inputDirectory, "builder-skill", "scripts", "self-check.mjs"), "export {};\n"),
    writeFile(path.join(inputDirectory, "builder-skill", "scripts", "render-visual-review.mjs"), "export {};\n"),
  ]);
  const routeDecision = decideSceneAuthoringRouteV1({
    id: "cloud-temple-t-gate-native-block-route",
    sceneBriefRef: "scene-brief.md",
    sceneBriefHash,
    trustProfileRef: "worldkit://trust-profile/trusted-local@1",
    trustProfileHash: TRUSTED_LOCAL_HASH,
    requiredCapabilityRefs: [],
    requestedSourceKind: "babylon-native",
    nativeTrustAdmitted: true,
    referenceDrivenDistinctiveSilhouette: true,
  });
  return {
    root,
    inputDirectory,
    plannerReceiptHash,
    visualIdentityPaletteHash,
    routeDecision,
  };
}

async function writePriorRepairContext(
  priorAttemptRoot: string,
  input: Readonly<{
    sceneAuthoringAttemptRef: string;
    sceneAuthoringAttemptHash: `sha256:${string}`;
    priorSourceRef: string;
    priorSourceHash: `sha256:${string}`;
    evaluationText: string;
  }>,
): Promise<void> {
  await Promise.all([
    mkdir(path.join(priorAttemptRoot, "source"), { recursive: true }),
    mkdir(path.join(priorAttemptRoot, "capture"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(priorAttemptRoot, "source", "scene.ts"), "export default {}\n"),
    writeFile(path.join(priorAttemptRoot, "source", "native-block-authoring.json"), "{}"),
    writeFile(path.join(priorAttemptRoot, "source", "native-resources.json"), "{}"),
    writeFile(path.join(priorAttemptRoot, "attempt-result.json"), stringifyCanonicalJson({
      kind: "scene-authoring-attempt-result",
      schemaVersion: 1,
      id: "cloud-temple-t-gate-native-block-attempt-0-result",
      sceneAuthoringAttemptRef: input.sceneAuthoringAttemptRef,
      sceneAuthoringAttemptHash: input.sceneAuthoringAttemptHash,
      outcome: "completed",
      authoredSourceRef: input.priorSourceRef,
      authoredSourceHash: input.priorSourceHash,
      evidenceRefs: ["worldkit://native-scene-check-result/cloud-temple@1"],
    })),
    writeFile(path.join(priorAttemptRoot, "evaluation.json"), input.evaluationText),
    writeFile(path.join(priorAttemptRoot, "capture", "opening.png"), "opening"),
    ...["world-side.png", "world-top-down.png", "opening-identity-mask.png",
      "world-side-identity-mask.png", "world-top-down-identity-mask.png",
      "semantic-view-observation-set.json"].map((name) =>
      writeFile(path.join(priorAttemptRoot, "capture", name), name)),
    writeFile(path.join(priorAttemptRoot, "capture", "opening-observation.json"), "{}"),
    writeFile(path.join(priorAttemptRoot, "capture", "collider-overlay.png"), "collider"),
    writeFile(path.join(priorAttemptRoot, "capture", "collider-overlay-observation.json"), "{}"),
    writeFile(path.join(priorAttemptRoot, "capture", "spawn-support-observation.json"), "{}"),
    writeFile(path.join(priorAttemptRoot, "capture", "scripted-traversal.json"), "{}"),
  ]);
}

function input(fixtureValue: Awaited<ReturnType<typeof fixture>>) {
  const profile = parseWorldReconstructionEvaluationProfileV1({ kind: "world-reconstruction-evaluation-profile", schemaVersion: 1, id: "cloud-temple-profile", dimensionIds: ["collider", "critical-traversal", "deterministic-build", "opening-composition", "semantic-silhouette", "spawn-support", "topology"], qualityGateMode: "required-for-publication", maximumRepairAttemptCount: 3, builderSelfRepairAttemptCount: 3, thresholds: { semanticSilhouetteTargets: [{ acceptanceTargetRef: "worldkit://acceptance-target/gate@1", maximumBoundsDriftBasisPoints: 100, maximumCenterDriftBasisPoints: 100, maximumCoverageDriftBasisPoints: 100 }], openingComposition: { regions: [{ targetRef: "worldkit://composition-target/opening@1", maximumDriftBasisPoints: 100 }], anchors: [{ targetRef: "worldkit://composition-target/opening@1", maximumDriftBasisPoints: 100 }] }, spawnSupport: { maximumPositionDriftMillimeters: 100, maximumSupportGapMillimeters: 10 } }, requiredEvidenceByDimension: ["collider", "critical-traversal", "deterministic-build", "opening-composition", "semantic-silhouette", "spawn-support", "topology"].map((dimensionId) => ({ dimensionId, evidenceProfileRefs: [`worldkit://evidence/${dimensionId}@1`] })) });
  const requiredEvidenceProfileRefs = profile.requiredEvidenceByDimension
    .flatMap((entry) => entry.evidenceProfileRefs)
    .sort();
  const reconstructionCase = parseWorldReconstructionCaseV1({
    kind: "world-reconstruction-case", schemaVersion: 1, id: "cloud-temple-t-gate-native-block", sceneBriefRef: "scene-brief.md", sceneBriefHash: fixtureValue.routeDecision.sceneBriefHash,
    referenceInputs: [
      { inputRef: "entry-whitebox-target.png", contentHash: sha256Bytes(new TextEncoder().encode("entry")), mediaType: "image/png" },
      { inputRef: "planner-self-check.json", contentHash: fixtureValue.plannerReceiptHash, mediaType: "application/json" },
      { inputRef: "reference-0.png", contentHash: sha256Bytes(new TextEncoder().encode("reference")), mediaType: "image/png" },
      { inputRef: "visual-identity-palette.json", contentHash: fixtureValue.visualIdentityPaletteHash, mediaType: "application/json" },
      { inputRef: "world-plan.png", contentHash: sha256Bytes(new TextEncoder().encode("plan")), mediaType: "image/png" },
    ], evaluationProfileRef: "evaluation-profile.json", evaluationProfileHash: hashWorldReconstructionEvaluationProfileV1(profile), formalCaptureIntentRef: "inputs/formal-world-capture-intent.json", formalCaptureIntentHash: sha256Bytes(new TextEncoder().encode("intent")), acceptanceTargetRefs: ["worldkit://acceptance-target/gate@1"], requiredEvidenceProfileRefs,
    expected: {
      topology: { acceptanceTargetRef: "worldkit://acceptance-target/gate@1", nodeIds: ["gate", "spawn"], relations: [{ fromNodeId: "gate", relation: "connects-to", toNodeId: "spawn" }], layerIds: ["main"] },
      semanticSilhouetteTargets: [{ acceptanceTargetRef: "worldkit://acceptance-target/gate@1", visualGroupId: "gate", viewRequirements: [{ viewId: "opening", mode: "reference-projection-required", normalizedBounds: { minXBasisPoints: 100, minYBasisPoints: 100, maxXBasisPoints: 900, maxYBasisPoints: 900 }, normalizedCenter: { xBasisPoints: 500, yBasisPoints: 500 }, coverageBasisPoints: 5_000 }, { viewId: "world-side", mode: "presence-required" }, { viewId: "world-top-down", mode: "presence-required" }] }],
      openingComposition: { acceptanceTargetRef: "worldkit://acceptance-target/gate@1", targetRefs: ["worldkit://composition-target/opening@1"], regions: [{ targetRef: "worldkit://composition-target/opening@1", normalizedBounds: { minXBasisPoints: 100, minYBasisPoints: 100, maxXBasisPoints: 900, maxYBasisPoints: 900 } }], anchors: [{ targetRef: "worldkit://composition-target/opening@1", normalizedCenter: { xBasisPoints: 500, yBasisPoints: 500 } }], orderedTargetRefs: ["worldkit://composition-target/opening@1"] },
      spawnSupport: { acceptanceTargetRef: "worldkit://acceptance-target/gate@1", spawnMarkerId: "spawn", supportColliderId: "ground", expectedMedium: "ground", expectedPositionXYZMeters: { xMeters: 0, yMeters: 0, zMeters: 0 } },
      colliders: [{ acceptanceTargetRef: "worldkit://acceptance-target/gate@1", contributionId: "ground-contribution", colliderId: "ground", role: "ground", requiresOverlay: true }],
      groundConnectivity: { mode: "case-defined" as const, requireSingleReachableComponent: true, requiredTraversalBands: [{ acceptanceTargetRef: "worldkit://acceptance-target/gate@1", id: "ground-band", centerlineStandPositionsXYZMeters: [{ xMeters: 0, yMeters: 0, zMeters: 0 }, { xMeters: 0, yMeters: 0, zMeters: -1 }], halfWidthMeters: 1 }] },
      criticalTraversalChecks: [{ acceptanceTargetRef: "worldkit://acceptance-target/gate@1", id: "walk", evidenceKind: "scripted-fixed-input", expectation: "pass", checkpointIds: ["spawn"], fixedInputSequence: [{ actions: ["move-forward"], axes: { moveYRatio: 1 }, ticks: 1 }] }],
      deterministicBuild: { acceptanceTargetRef: "worldkit://acceptance-target/gate@1", requiresCandidateReplay: true, requiresWorldPackageIdentityAgreement: true, requiresBuildIdentityAgreement: true, requiresCaptureIdentityAgreement: true },
    },
  });
  return {
    case: reconstructionCase,
    profile,
    routeDecision: fixtureValue.routeDecision,
    runId: "initial",
    attemptIndex: 0,
    backend: "cloud" as const,
    cloudOutputS3Root: "s3://bucket/worldkit",
    runDirectoryPath: path.join(fixtureValue.root, "runs", "initial"),
    inputDirectoryPath: fixtureValue.inputDirectory,
    taskInstructionPath: path.join(fixtureValue.inputDirectory, "instruction.md"),
    builderSkillPath: path.join(fixtureValue.inputDirectory, "builder-skill", "SKILL.md"),
    nativeSceneApiPath: path.join(fixtureValue.inputDirectory, "native-scene-api.json"),
    nativeSceneProfilePath: path.join(fixtureValue.inputDirectory, "native-scene-profile.json"),
    blockProfilePath: path.join(fixtureValue.inputDirectory, "block-profile.json"),
    subjectHostContext: createNativeSubjectHostContextV1(reconstructionCase.id, "camera-main"),
    worldBoundsPolicyPath: path.join(fixtureValue.inputDirectory, "world-bounds-policy.json"),
    worldBoundsPolicy: {
      mode: "fixed",
      worldBounds: {
      centerMetersXZ: [0, -15],
      sizeMetersXZ: [180, 180],
      heightRangeMeters: [-40, 100],
      },
    } as const,
    bootstrapId: "fixture-native",
    sceneModuleRef: "worldkit://native-scene/fixture@1",
    seed: 17,
    budgets: {
      maximumBlockCount: 2000,
      maximumStaticColliderCount: 500,
      maximumStaticColliderVertexCount: 200000,
      maximumStaticColliderTriangleCount: 100000,
      maximumOutputBytes: 4000000,
      timeoutSeconds: NATIVE_BLOCK_RECONSTRUCTION_FORMAL_TIMEOUT_SECONDS_V1,
    },
  };
}

function subjectHostInput(subject: NativeSubjectHostClosureInputV1["subject"]): NativeSubjectHostClosureInputV1 {
  return {
    worldId: "cf12-subject",
    seed: 17,
    controlledEntityId: "requested-subject",
    subject,
    resourceBudget: createValidPackageSubjectWorldV4().world.resourceBudget,
    gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0],
    initialCamera: {
      mode: "third-person",
      cameraEntityId: "camera-main",
      pitchRadians: 0.12,
      distanceMeters: 7,
      targetHeightMeters: 1.4,
      fovDegrees: 56,
      manualSwitchAllowed: true,
    },
  };
}

describe("prepareNativeBlockGenerationTaskV1", () => {
  function composedDesign(rigged = false): ComposedSubjectDesignV1 {
    const definition = (rigged ? createValidRiggedPackageSubjectWorldV4() : createValidPackageSubjectWorldV4())
      .resources.subjectDefinitions[0]!;
    return {
      id: definition.id,
      category: definition.category,
      bodyTopology: definition.bodyTopology,
      semanticClassId: definition.semanticClassId,
      displayName: definition.aiMetadata.displayName,
      description: definition.aiMetadata.description,
      visualParts: definition.visualParts.map((part) => {
        if (part.kind === "primitive") return part;
        const { appearance: _appearance, ...design } = part;
        return design;
      }),
      visualBinding: definition.visualBinding.mode === "static" ? { mode: "static" } : {
        ...definition.visualBinding,
        colliderProfileRef: definition.colliderPolicy.kind === "profile" ? definition.colliderPolicy.colliderProfileRef : "invalid",
      },
    };
  }

  function nativeComposedDesign(rigged = false): ComposedSubjectDesignV1 {
    const design = composedDesign(rigged);
    design.visualParts = design.visualParts.map((part) => ({ ...part, id: part.id.replaceAll(".", "-") }));
    return design;
  }

  it.each([false, true])("compiles the complete old composed Subject defaults and real Host proxy (rigged=%s)", (rigged) => {
    const design = composedDesign(rigged);
    const before = stringifyCanonicalJson(design);
    const result = compileNativeComposedSubjectDefinitionV1(design);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === undefined) throw new Error(JSON.stringify(result.diagnostics));
    const expected = (rigged ? createValidRiggedPackageSubjectWorldV4() : createValidPackageSubjectWorldV4())
      .resources.subjectDefinitions[0]!;
    // The pinned old Block compiler overrides these Authoring fixture fields.
    expected.authoringAvailability = "advanced";
    expected.allowedOverridePaths = [];
    expected.sockets = [];
    expected.mountSlots = [];
    expected.relationshipCapabilityRefs = [];
    expected.aiMetadata.semanticTags = [design.category, design.bodyTopology, "block-world-composed"];
    for (const part of expected.visualParts) {
      part.localTransform.rotationEulerRadiansXYZ ??= [0, 0, 0];
    }
    expect(result.value).toEqual(expected);
    // Captured by executing compilePackageSubjectDefinitions from pinned
    // 9e35ab53 against these same two designs, not generated from this helper.
    expect(sha256CanonicalJson(result.value)).toBe(rigged
      ? "sha256:934d6eb2626feb4dec4d0fa122f56fa36eec8cd519baf1c3fa59fd27466d697b"
      : "sha256:a84f80b27bd08ff0fb6c5e5225f155b9fa02ae2fe5e8e3c7f9f9d26b4a918ba0");
    const closure = compileNativeSubjectHostClosureV1(subjectHostInput({ source: "package", definition: result.value }), builtInSubjectResourceRegistry);
    const expectedClosure = compileNativeSubjectHostClosureV1(subjectHostInput({ source: "package", definition: expected }), builtInSubjectResourceRegistry);
    expect(closure).toEqual(expectedClosure);
    if (!closure.ok) throw new Error(JSON.stringify(closure.diagnostics));
    const proxy = deriveNativeBlockSubjectVisualReviewProxyV1({
      worldRuntimeBootstrap: closure.worldRuntimeBootstrap,
      worldRuntimeBootstrapRef: closure.worldRuntimeBootstrapRef,
      worldRuntimeBootstrapBytesHash: sha256Bytes(new TextEncoder().encode(stringifyCanonicalJson(closure.worldRuntimeBootstrap))) as Sha256HashV1,
    }, builtInSubjectResourceRegistry);
    expect(proxy.subjectDefinitionRef).toBe(`package://subject-definition/${design.id}@1`);
    expect(proxy.cuboids.length).toBeGreaterThan(0);
    expect(stringifyCanonicalJson(design)).toBe(before);
    expect(compileNativeComposedSubjectDefinitionV1(design)).toEqual(result);
  });

  it("quantizes all composed primitive dimensions and transforms as the pinned old compiler", () => {
    const design = composedDesign();
    const shapes = [
      { kind: "box", sizeMetersXYZ: [0.80000000004, 0.7, 1.4] },
      { kind: "sphere", radiusMeters: 0.10000000006 },
      { kind: "cylinder", radiusMeters: 0.10000000006, heightMeters: 0.70000000006 },
      { kind: "capsule", radiusMeters: 0.10000000006, heightMeters: 0.70000000006 },
    ] as const;
    design.visualParts = shapes.map((shape, index) => ({
      id: `part-${index}`, kind: "primitive", shape,
      localTransform: { positionMetersXYZ: [-0.00000000004, 0.35, 0], rotationEulerRadiansXYZ: [0, 0.12000000004, 0] },
      colliderContribution: index === 3 ? "exclude" : "include", semanticTags: ["body"],
    }));
    const result = compileNativeComposedSubjectDefinitionV1(design);
    if (!result.ok || result.value === undefined) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.value.visualParts.map((part) => part.kind === "primitive" && part.shape)).toEqual([
      { kind: "box", sizeMetersXYZ: [0.8, 0.7, 1.4] },
      { kind: "sphere", radiusMeters: 0.1 },
      { kind: "cylinder", radiusMeters: 0.1, heightMeters: 0.7 },
      { kind: "capsule", radiusMeters: 0.1, heightMeters: 0.7 },
    ]);
    expect(result.value.visualParts.every((part) =>
      !Object.is(part.localTransform.positionMetersXYZ[0], -0) && part.localTransform.rotationEulerRadiansXYZ?.[1] === 0.12)).toBe(true);
    expect(result.value.visualParts[3]).toMatchObject({ colliderContribution: "exclude" });
    expect(design.visualParts[0]!.localTransform.positionMetersXYZ[0]).toBe(-0.00000000004);
  });

  it("rejects malformed composed design through the existing Subject schema and never executes accessors", () => {
    const invalid = composedDesign();
    invalid.visualParts[0]!.localTransform.positionMetersXYZ = [0, Number.NaN, 0];
    expect(compileNativeComposedSubjectDefinitionV1(invalid).ok).toBe(false);
    expect(compileNativeComposedSubjectDefinitionV1({
      ...composedDesign(), profiles: { physicsBodyProfileRef: "forged" },
    } as ComposedSubjectDesignV1).ok).toBe(false);
    const coerced = composedDesign();
    coerced.visualParts[0]!.localTransform.positionMetersXYZ = ["0", 0.85, 0] as unknown as readonly [number, number, number];
    expect(compileNativeComposedSubjectDefinitionV1(coerced).ok).toBe(false);
    const accessor = composedDesign();
    let executed = false;
    Object.defineProperty(accessor, "visualParts", { enumerable: true, get() { executed = true; throw new Error("accessor"); } });
    expect(compileNativeComposedSubjectDefinitionV1(accessor).ok).toBe(false);
    expect(executed).toBe(false);
  });

  it("preserves composed asset transforms, exact rigged refs and independent output data", () => {
    const design = composedDesign(true);
    const asset = design.visualParts[0]!;
    if (asset.kind !== "asset") throw new Error("Missing asset fixture.");
    asset.localTransform.positionMetersXYZ = [0.1234567894, 0.00000000004, -0.00000000004];
    asset.localTransform.rotationEulerRadiansXYZ = [0, 0.2345678914, 0];
    asset.localTransform.scaleXYZ = [1.00000000004, 1.1234567894, 1];
    const original = structuredClone(design);
    const result = compileNativeComposedSubjectDefinitionV1(design);
    if (!result.ok || result.value === undefined) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.value.visualParts[0]).toEqual({
      ...asset,
      appearance: { mode: "whitebox-neutral" },
      localTransform: {
        positionMetersXYZ: [0.123456789, 0, 0],
        rotationEulerRadiansXYZ: [0, 0.234567891, 0],
        scaleXYZ: [1, 1.123456789, 1],
      },
    });
    if (design.visualBinding.mode !== "rigged") throw new Error("Missing rigged fixture.");
    expect(result.value.visualBinding).toEqual({
      mode: "rigged", rigProfileRef: design.visualBinding.rigProfileRef, animationSetRef: design.visualBinding.animationSetRef,
    });
    expect(result.value.colliderPolicy).toEqual({ kind: "profile", colliderProfileRef: design.visualBinding.colliderProfileRef });
    expect(result.value.actionOrPoseSetRef).toBe(design.visualBinding.animationSetRef);
    result.value.visualParts[0]!.localTransform.positionMetersXYZ = [9, 9, 9];
    (result.value.profiles.allowedControlFeelProfileRefs as string[]).push("changed-output");
    expect(design).toEqual(original);
    const replay = compileNativeComposedSubjectDefinitionV1(design);
    expect(replay.value?.profiles.allowedControlFeelProfileRefs).not.toContain("changed-output");
    expect(replay.value?.visualParts[0]!.localTransform.positionMetersXYZ).toEqual([0.123456789, 0, 0]);
  });

  it.each([
    ["worldkit://subject-definition/missing@1", "AUTHORING_REFERENCE_NOT_FOUND"],
    ["worldkit://subject-definition/vehicle.four-wheel.arcade@1", "SUBJECT_CAPABILITY_UNSATISFIED"],
    ["worldkit://subject-definition/glider.paraglider.unpowered@1", "SUBJECT_CAPABILITY_UNSATISFIED"],
  ])("preserves existing rejection for unavailable Subject %s without substitution", (subjectDefinitionRef, code) => {
    const result = compileNativeSubjectHostClosureV1(subjectHostInput({ source: "registry", subjectDefinitionRef }), builtInSubjectResourceRegistry);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Unavailable Subject was substituted.");
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === code)).toBe(true);
    expect(result).not.toHaveProperty("worldRuntimeBootstrap");
  });

  it("resolves registered Subject proposals through the same exact Host owner without fallback", () => {
    const subjectDefinitionRef = "worldkit://subject-definition/humanoid.g-bot@2";
    const input = subjectHostInput({ source: "registry", subjectDefinitionRef });
    const { subject: _subject, ...hostInput } = input;
    expect(compileNativeSubjectHostClosureFromDesignV1({
      ...hostInput, subjectDesign: { kind: "registered", subjectDefinitionRef },
    }, builtInSubjectResourceRegistry)).toEqual(compileNativeSubjectHostClosureV1(input, builtInSubjectResourceRegistry));
    for (const subjectDesign of [undefined, { kind: "registered", subjectDefinitionRef: "worldkit://subject-definition/missing@1" },
      { kind: "registered", subjectDefinitionRef: "worldkit://subject-definition/glider.paraglider.unpowered@1" },
      { kind: "registered", subjectDefinitionRef, runtime: {} }]) {
      const result = compileNativeSubjectHostClosureFromDesignV1({ ...hostInput, subjectDesign }, builtInSubjectResourceRegistry);
      expect(result.ok).toBe(false);
      expect(result).not.toHaveProperty("worldRuntimeBootstrap");
    }
    let executed = false;
    const accessor = { kind: "registered" };
    Object.defineProperty(accessor, "subjectDefinitionRef", { enumerable: true, get() { executed = true; return subjectDefinitionRef; } });
    expect(compileNativeSubjectHostClosureFromDesignV1({ ...hostInput, subjectDesign: accessor }, builtInSubjectResourceRegistry).ok).toBe(false);
    expect(executed).toBe(false);
  });

  it.each(["registered", "registered-heavy", "composed"])("uses the actual compiled %s Subject cost in old source accounting", (kind) => {
    const { subject: _subject, ...hostInput } = subjectHostInput({ source: "registry", subjectDefinitionRef: "unused" });
    const closure = compileNativeSubjectHostClosureFromDesignV1({ ...hostInput,
      subjectDesign: kind !== "composed"
        ? { kind: "registered", subjectDefinitionRef: kind === "registered-heavy"
            ? "worldkit://subject-definition/xier120.tracked@1"
            : "worldkit://subject-definition/humanoid.g-bot@2" }
        : { kind: "composed", definition: nativeComposedDesign() },
    }, builtInSubjectResourceRegistry);
    if (!closure.ok) throw new Error("fixture Subject must compile");
    const before = structuredClone(closure.subjectResourceCost);
    expect(before.vertices).toBeGreaterThan(0);
    expect(before.triangles).toBeGreaterThan(0);
    const accounting = evaluateBlockSourceResourceBudgetV1({
      sourceBlockCount: 8_000, runtimeClusterCount: 2, solidRuntimeClusterCount: 1,
      subjectResourceCost: closure.subjectResourceCost,
    });
    expect(accounting.usage).toEqual({
      vertices: before.vertices + 52, triangles: before.triangles + 26, colliders: before.colliders + 2,
    });
    expect(accounting.diagnostics).toEqual([]);
    expect(closure.subjectResourceCost).toEqual(before);
    if (kind === "registered-heavy") {
      expect(before.vertices).toBe(172_536);
      expect(evaluateBlockSourceResourceBudgetV1({
        sourceBlockCount: 8_000, runtimeClusterCount: 8_000, solidRuntimeClusterCount: 1,
        subjectResourceCost: closure.subjectResourceCost,
      }).diagnostics).toMatchObject([{
        code: "COMPILER_RESOURCE_BUDGET_EXCEEDED", instancePath: "/world/resourceBudget/maxVertices",
        details: { actual: 364_540, maximum: 342_000 },
      }]);
    }
  });

  it("preserves the old composed Subject part-count, identity and tag policies at Host compilation", () => {
    const { subject: _subject, ...hostInput } = subjectHostInput({ source: "registry", subjectDefinitionRef: "unused" });
    const compile = (definition: ComposedSubjectDesignV1) => compileNativeSubjectHostClosureFromDesignV1({
      ...hostInput, subjectDesign: { kind: "composed", definition },
    }, builtInSubjectResourceRegistry);
    const base = nativeComposedDesign();
    const parts = base.visualParts;
    expect(compile(base).ok).toBe(true);
    for (const definition of [
      { ...base, id: "bad.id" }, { ...base, displayName: " " }, { ...base, description: "\t" },
      { ...base, semanticClassId: "xx" },
      { ...base, visualParts: [...parts, parts[0]!] },
      { ...base, visualParts: parts.map((part, i) => i === 0 ? { ...part, id: "bad.id" } : part) },
      { ...base, visualParts: parts.map((part, i) => i === 0 ? { ...part, semanticTags: [] } : part) },
      { ...base, visualParts: parts.map((part, i) => i === 0 ? { ...part, semanticTags: ["x"] } : part) },
      { ...base, visualParts: Array.from({ length: 49 }, (_, i) => ({ ...parts[i % parts.length]!, id: `part-${i}` })) },
    ]) {
      expect(compile(definition)).toMatchObject({ ok: false, diagnostics: [expect.objectContaining({ code: "NATIVE_SUBJECT_DESIGN_INVALID" })] });
    }
    expect(compile({ ...base, visualParts: Array.from({ length: 48 }, (_, i) => ({ ...parts[i % parts.length]!, id: `part-${i}` })) }).ok).toBe(true);
  });

  it("keeps the old human/biped visual-height and asset-scale limits without applying them to other bodies", () => {
    const { subject: _subject, ...hostInput } = subjectHostInput({ source: "registry", subjectDefinitionRef: "unused" });
    const compile = (definition: ComposedSubjectDesignV1) => compileNativeSubjectHostClosureFromDesignV1({
      ...hostInput, subjectDesign: { kind: "composed", definition },
    }, builtInSubjectResourceRegistry);
    const human = nativeComposedDesign();
    human.category = "human";
    human.bodyTopology = "biped";
    const heightDesign = (height: number): ComposedSubjectDesignV1 => ({ ...human, visualParts: [{
      id: "body", kind: "primitive", shape: { kind: "box", sizeMetersXYZ: [0.4, height, 0.4] },
      localTransform: { positionMetersXYZ: [0, height / 2, 0] }, colliderContribution: "include", semanticTags: ["body"],
    }] });
    for (const height of [1.6, 2.1]) expect(compile(heightDesign(height)).ok).toBe(true);
    for (const height of [1.59, 2.11]) {
      expect(compile(heightDesign(height))).toMatchObject({ ok: false, diagnostics: [expect.objectContaining({ code: "NATIVE_SUBJECT_DESIGN_SCALE_INVALID" })] });
    }
    expect(compile({ ...heightDesign(1.4), category: "animal", bodyTopology: "quadruped" }).ok).toBe(true);
    const rigged = nativeComposedDesign(true);
    const asset = rigged.visualParts[0]!;
    if (asset.kind !== "asset") throw new Error("Missing asset fixture.");
    asset.localTransform.scaleXYZ = [1, 1.26, 1];
    expect(compile(rigged)).toMatchObject({ ok: false, diagnostics: [expect.objectContaining({ code: "NATIVE_SUBJECT_DESIGN_SCALE_INVALID" })] });
  });

  it("preserves old Subject policy epsilon and rotated primitive measurements including excluded visual parts", () => {
    const base = nativeComposedDesign();
    const shapes = [
      { kind: "box", sizeMetersXYZ: [1.4, 1.8, 1.4] },
      { kind: "sphere", radiusMeters: 0.9 },
      { kind: "cylinder", radiusMeters: 0.8, heightMeters: 1.8 },
      { kind: "capsule", radiusMeters: 0.8, heightMeters: 1.8 },
    ] as const;
    for (const shape of shapes) {
      for (const tilt of [0, 1e-8, 2e-8, Math.PI / 2]) {
        const design: ComposedSubjectDesignV1 = { ...base, category: "human", bodyTopology: "biped", visualParts: [{
          id: "body", kind: "primitive", shape, localTransform: { positionMetersXYZ: [0, 0.9, 0], rotationEulerRadiansXYZ: [tilt, 0, 0] },
          colliderContribution: "exclude", semanticTags: ["body"],
        }] };
        const diagnostics = checkNativeComposedSubjectDesignV1(design);
        expect(diagnostics.length).toBe(shape.kind === "sphere" || tilt <= 1e-8 ? 0 : 1);
      }
    }
    const asset = nativeComposedDesign(true);
    const part = asset.visualParts[0]!;
    if (part.kind !== "asset") throw new Error("Missing asset fixture.");
    for (const [scale, rejected] of [[1.25, false], [1.25 + 1e-8, false], [1.25 + 2e-8, true]] as const) {
      part.localTransform.scaleXYZ = [1, scale, 1];
      expect(checkNativeComposedSubjectDesignV1(asset).length > 0).toBe(rejected);
    }
  });

  it("validates package Subject data with the existing schema before compilation", () => {
    const definition = createValidPackageSubjectWorldV4().resources.subjectDefinitions[0]!;
    const part = definition.visualParts[0]!;
    if (part.kind !== "primitive" || part.shape.kind !== "box") throw new Error("Missing body fixture.");
    part.shape.sizeMetersXYZ = [-1, 0.7, 1.4];
    const result = compileNativeSubjectHostClosureV1(subjectHostInput({ source: "package", definition }), builtInSubjectResourceRegistry);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Malformed Subject was compiled.");
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result).not.toHaveProperty("worldRuntimeBootstrap");
  });

  it("rejects accessor-bearing Subject data without executing the accessor", () => {
    const definition = createValidPackageSubjectWorldV4().resources.subjectDefinitions[0]!;
    let executed = false;
    Object.defineProperty(definition.visualParts[0]!, "shape", {
      enumerable: true,
      get() { executed = true; throw new Error("untrusted accessor"); },
    });
    const result = compileNativeSubjectHostClosureV1(subjectHostInput({ source: "package", definition }), builtInSubjectResourceRegistry);
    expect(executed).toBe(false);
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: "NATIVE_SUBJECT_HOST_INPUT_INVALID" }] });
  });

  it("binds changed package silhouette to Runtime, locks and proxy without mutating the prior closure", () => {
    const definition = createValidPackageSubjectWorldV4().resources.subjectDefinitions[0]!;
    const options = subjectHostInput({ source: "package", definition });
    const first = compileNativeSubjectHostClosureV1(options, builtInSubjectResourceRegistry);
    if (!first.ok) throw new Error(JSON.stringify(first.diagnostics));
    const firstBytes = stringifyCanonicalJson(first);
    definition.visualParts[0]!.localTransform.positionMetersXYZ = [3, 1, -2];
    const second = compileNativeSubjectHostClosureV1(options, builtInSubjectResourceRegistry);
    if (!second.ok) throw new Error(JSON.stringify(second.diagnostics));
    expect(stringifyCanonicalJson(first)).toBe(firstBytes);
    expect(second.worldRuntimeBootstrap.contentHash).not.toBe(first.worldRuntimeBootstrap.contentHash);
    expect(second.registryLock).not.toEqual(first.registryLock);
    expect(second.gameplayBootstrap.contentHash).toBe(first.gameplayBootstrap.contentHash);
    const proxies = [first, second].map((closure) => deriveNativeBlockSubjectVisualReviewProxyV1({
      worldRuntimeBootstrap: closure.worldRuntimeBootstrap,
      worldRuntimeBootstrapRef: closure.worldRuntimeBootstrapRef,
      worldRuntimeBootstrapBytesHash: sha256Bytes(new TextEncoder().encode(stringifyCanonicalJson(closure.worldRuntimeBootstrap))) as Sha256HashV1,
    }, builtInSubjectResourceRegistry));
    expect(proxies[1]!.subjectDefinitionHash).not.toBe(proxies[0]!.subjectDefinitionHash);
    expect(proxies[1]!.subjectRuntimeDescriptorHash).not.toBe(proxies[0]!.subjectRuntimeDescriptorHash);
    expect(proxies[1]!.cuboids).not.toEqual(proxies[0]!.cuboids);
    const { contentHash: _runtimeHash, ...runtimeBody } = first.worldRuntimeBootstrap;
    const wrongLock = createWorldRuntimeBootstrapV1({
      ...runtimeBody,
      runtimeResourceLockEntries: first.worldRuntimeBootstrap.runtimeResourceLockEntries.map((entry) =>
        entry.resourceRef.startsWith("package://subject-definition/") ? { ...entry, contentHash: hash("e") } : entry),
    });
    expect(() => deriveNativeBlockSubjectVisualReviewProxyV1({
      worldRuntimeBootstrap: wrongLock,
      worldRuntimeBootstrapRef: first.worldRuntimeBootstrapRef,
      worldRuntimeBootstrapBytesHash: sha256Bytes(new TextEncoder().encode(stringifyCanonicalJson(wrongLock))) as Sha256HashV1,
    }, builtInSubjectResourceRegistry)).toThrow(/Subject definition Registry closure failed/);
  });

  it.each(["registered", "registered-primitive", "primitive", "rigged", "designed-primitive", "designed-rigged"] as const)(
    "compiles a %s Host Subject closure without the Cloud Ridge world",
    async (kind) => {
      const value = await fixture();
      try {
        const base = input(value);
        const sourceWorld = kind === "rigged" || kind === "designed-rigged"
          ? createValidRiggedPackageSubjectWorldV4()
          : createValidPackageSubjectWorldV4();
        if (kind === "designed-primitive" || kind === "designed-rigged") {
          const composed = compileNativeComposedSubjectDefinitionV1(nativeComposedDesign(kind === "designed-rigged"));
          if (!composed.ok || composed.value === undefined) throw new Error(JSON.stringify(composed.diagnostics));
          sourceWorld.resources.subjectDefinitions = [composed.value];
        }
        const definition = sourceWorld.resources.subjectDefinitions[0]!;
        const selectedSubject = kind === "registered" || kind === "registered-primitive"
          ? { source: "registry" as const, subjectDefinitionRef: kind === "registered"
              ? "worldkit://subject-definition/humanoid.g-bot@2"
              : "worldkit://subject-definition/quadruped.ground-proxy@1" }
          : { source: "package" as const, definition };
        const closureInput = {
          ...subjectHostInput(selectedSubject),
          worldId: base.case.id,
          seed: base.seed,
          resourceBudget: sourceWorld.world.resourceBudget,
        };
        const original = structuredClone(closureInput);
        const { subject: _subject, ...designHostInput } = closureInput;
        const closure = kind === "designed-primitive" || kind === "designed-rigged"
          ? compileNativeSubjectHostClosureFromDesignV1({
            ...designHostInput,
            subjectDesign: { kind: "composed", definition: nativeComposedDesign(kind === "designed-rigged") },
          }, builtInSubjectResourceRegistry)
          : compileNativeSubjectHostClosureV1(closureInput, builtInSubjectResourceRegistry);
        expect(closure.ok).toBe(true);
        if (!closure.ok) throw new Error(JSON.stringify(closure.diagnostics));
        expect(closureInput).toEqual(original);
        expect(compileNativeSubjectHostClosureV1(closureInput, builtInSubjectResourceRegistry)).toEqual(closure);
        const expectedRef = selectedSubject.source === "registry"
          ? selectedSubject.subjectDefinitionRef
          : `package://subject-definition/${definition.id}@${definition.version}`;
        const subject = closure.worldRuntimeBootstrap.subjectRuntimeDescriptors[0]!;
        expect(subject.subjectDefinitionRef).toBe(expectedRef);
        expect(subject.entityId).toBe("requested-subject");
        expect(closure.gameplayBootstrap.entityDescriptors).toEqual([
          expect.objectContaining({ id: subject.entityId, entityDefinitionRef: expectedRef }),
        ]);
        expect(closure.worldRuntimeBootstrap.initialCamera).toEqual({
          ...closureInput.initialCamera,
          cameraRigProfileRef: subject.capabilityAssembly.cameraContext.defaultCameraRigProfileRef,
          targetEntityId: "requested-subject",
        });
        if (selectedSubject.source === "package") {
          const normalized = normalizeAuthoringSpecV4(sourceWorld);
          if (!normalized.ok || normalized.value === undefined) throw new Error(JSON.stringify(normalized.diagnostics));
          const expected = normalized.value.resources.subjectDefinitions.find((row) => row.subjectDefinitionRef === expectedRef)!;
          expect(subject.subjectDefinitionHash).toBe(expected.subjectDefinitionHash);
          expect(subject.visualParts.map((part) => part.id)).toEqual(expected.visualParts.map((part) => part.id));
          expect(subject.collider).toEqual(expected.collider);
          expect(closure.subjectResourceCost).toEqual(expected.resourceCost);
        }
        const proxy = deriveNativeBlockSubjectVisualReviewProxyV1({
          worldRuntimeBootstrap: closure.worldRuntimeBootstrap,
          worldRuntimeBootstrapRef: closure.worldRuntimeBootstrapRef,
          worldRuntimeBootstrapBytesHash: sha256Bytes(new TextEncoder().encode(stringifyCanonicalJson(closure.worldRuntimeBootstrap))) as Sha256HashV1,
        }, builtInSubjectResourceRegistry);
        expect(proxy.subjectDefinitionHash).toBe(subject.subjectDefinitionHash);
        expect(proxy.subjectRuntimeDescriptorHash).toBe(sha256CanonicalJson(subject));
        expect(proxy.worldRuntimeBootstrapContentHash).toBe(closure.worldRuntimeBootstrap.contentHash);
        expect(proxy.cuboids.length).toBeGreaterThan(0);
      } finally {
        await rm(value.root, { recursive: true, force: true });
      }
    },
  );

  it("freezes the same static Collider budget used by Native admission", () => {
    expect({
      maximumStaticColliderCount:
        NATIVE_BLOCK_RECONSTRUCTION_FORMAL_BUDGETS_V1.maximumStaticColliderCount,
      maximumStaticColliderVertexCount:
        NATIVE_BLOCK_RECONSTRUCTION_FORMAL_BUDGETS_V1.maximumStaticColliderVertexCount,
      maximumStaticColliderTriangleCount:
        NATIVE_BLOCK_RECONSTRUCTION_FORMAL_BUDGETS_V1.maximumStaticColliderTriangleCount,
    }).toEqual(BNA2_WHITEBOX_ADMISSION_BUDGET_V1);
  });

  it("resolves the Case-bound Native route through the sole Host policy owner", async () => {
    const value = await fixture();
    const preparedInput = input(value);

    expect(decideNativeBlockReconstructionRouteV1(preparedInput.case, {
      requiredCapabilityRefs: [],
      requestedSourceKind: "babylon-native",
      nativeTrustAdmitted: true,
    })).toEqual(
      value.routeDecision,
    );
  });

  it("returns real Canonical and capability-gap decisions from Host route policy input", async () => {
    const value = await fixture();
    const reconstructionCase = input(value).case;

    expect(decideNativeBlockReconstructionRouteV1(reconstructionCase, {
      requiredCapabilityRefs: [],
      requestedSourceKind: "canonical",
      nativeTrustAdmitted: true,
    }).decision).toMatchObject({ kind: "canonical" });
    expect(decideNativeBlockReconstructionRouteV1(reconstructionCase, {
      requiredCapabilityRefs: ["worldkit://capability/route.nav@1"],
      requestedSourceKind: "babylon-native",
      nativeTrustAdmitted: true,
    }).decision).toEqual({
      kind: "capability-gap",
      unsupportedCapabilityRefs: ["worldkit://capability/route.nav@1"],
      reasonCodes: ["requires-canonical-route"],
    });
  });
  it("consumes the canonical Runtime Contracts Native Scene Profile owner", async () => {
    const source = await readFile(
      new URL("./generation-request.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("BABYLON_NATIVE_BLOCK_PROFILE_REF_V1");
    expect(source).not.toContain("const CURRENT_NATIVE_SCENE_PROFILE_REF");
    expect(source).not.toContain(
      '"worldkit://native-scene-profile/whitebox.blocks@1"',
    );
  });

  it("keeps the committed reconstruction Case and resource descriptors consumable", async () => {
    const caseRoot = path.resolve(
      "artifacts/scenes/cloud-temple-t-gate-native-block",
    );
    const [caseText, profileText] = await Promise.all([
      readFile(path.join(caseRoot, "case.json"), "utf8"),
      readFile(path.join(caseRoot, "evaluation-profile.json"), "utf8"),
    ]);
    const profile = parseWorldReconstructionEvaluationProfileV1(
      JSON.parse(profileText),
    );
    const reconstructionCase = parseWorldReconstructionCaseV1(
      JSON.parse(caseText),
    );
    expect(reconstructionCase.evaluationProfileHash).toBe(
      hashWorldReconstructionEvaluationProfileV1(profile),
    );
    for (const fileName of [
      "native-scene-api.json",
      "native-scene-profile.json",
      "block-profile.json",
    ]) {
      const descriptorText = await readFile(
        path.join(caseRoot, "inputs", fileName),
        "utf8",
      );
      expect(descriptorText).toBe(
        stringifyCanonicalJson(JSON.parse(descriptorText)),
      );
    }
  });

  it("rejects a Case whose required Evidence Profiles do not exactly close the Evaluation Profile", async () => {
    const value = await fixture();
    try {
      const preparedInput = input(value);
      preparedInput.case = parseWorldReconstructionCaseV1({
        ...preparedInput.case,
        requiredEvidenceProfileRefs: preparedInput.case.requiredEvidenceProfileRefs.slice(1),
      });
      await expect(prepareNativeBlockGenerationTaskV1(preparedInput)).rejects.toThrow(
        /evidence profile closure/i,
      );
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects a Case semantic target without a matching Profile threshold before generation", async () => {
    const value = await fixture();
    try {
      const preparedInput = input(value);
      const extraTargetRef = "worldkit://acceptance-target/spire@1";
      const existingTarget = preparedInput.case.expected.semanticSilhouetteTargets[0]!;
      preparedInput.case = parseWorldReconstructionCaseV1({
        ...preparedInput.case,
        acceptanceTargetRefs: [
          ...preparedInput.case.acceptanceTargetRefs,
          extraTargetRef,
        ],
        expected: {
          ...preparedInput.case.expected,
          semanticSilhouetteTargets: [
            ...preparedInput.case.expected.semanticSilhouetteTargets,
            {
              ...existingTarget,
              acceptanceTargetRef: extraTargetRef,
              visualGroupId: "spire",
            },
          ],
        },
      });
      await expect(prepareNativeBlockGenerationTaskV1(preparedInput)).rejects.toThrow(
        /evidence profile closure/i,
      );
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("freezes one canonical native request with three source and two advisory router outputs", async () => {
    const value = await fixture();
    try {
      const prepared = await prepareNativeBlockGenerationTaskV1(input(value));
      expect(prepared.routerArguments.filter((argument) => argument === "--output")).toHaveLength(5);
      expect(prepared.routerArguments).toContain(
        "s3://bucket/worldkit/cloud-temple-t-gate-native-block/initial/attempt-0",
      );
      expect(prepared.routerArguments).toEqual(expect.arrayContaining([
        "--execution-profile", "formal", "--submit-attempts", "1",
        "--timeout-seconds", "1800",
        "--workspace-context-root", "attempts/0/.task",
      ]));
      expect(prepared.routerArguments).not.toContain("--context");
      expect(prepared.routerArguments).toEqual(expect.arrayContaining([
        "entry-whitebox-target::attempts/0/.task/inputs/entry-whitebox-target.png::image::image/png",
        "reference-0::attempts/0/.task/inputs/reference-0.png::image::image/png",
        "world-plan::attempts/0/.task/inputs/world-plan.png::image::image/png",
      ]));
      expect(prepared.generationRequest.referenceInputs.map(({ inputRef }) =>
        inputRef)).toEqual([
        "entry-whitebox-target.png",
        "reference-0.png",
        "world-plan.png",
      ]);
      expect(prepared.generationRequest.contextInputs).toContainEqual({
        inputRef: "inputs/planner-self-check.json",
        contentHash: value.plannerReceiptHash,
      });
      expect(prepared.generationRequest.contextInputs).toContainEqual({
        inputRef: "inputs/visual-identity-palette.json",
        contentHash: value.visualIdentityPaletteHash,
      });
      const frozenPalette = JSON.parse(await readFile(
        path.join(
          prepared.taskWorkspacePath,
          "inputs",
          "visual-identity-palette.json",
        ),
        "utf8",
      )) as { targets: readonly { identityColor: string }[] };
      expect(frozenPalette.targets.map(({ identityColor }) => identityColor))
        .toEqual(BABYLON_NATIVE_VISUAL_IDENTITY_COLORS);
      expect(frozenPalette.targets[2]!.identityColor).toBe("#D9A514");
      expect(frozenPalette.targets[2]!.identityColor).not.toBe("#8E6CCF");
      expect(prepared.routerArguments).toEqual(expect.arrayContaining([
        "attempts/advisory/builder-top-down-comparison.png::attempts/0/advisory/builder-top-down-comparison.png::image/png",
        "attempts/advisory/builder-entry-comparison.png::attempts/0/advisory/builder-entry-comparison.png::image/png",
      ]));
      expect(NATIVE_BLOCK_RECONSTRUCTION_FORMAL_TIMEOUT_SECONDS_V1).toBe(1_800);
      expect(prepared.generationRequest.declaredOutputPaths).toEqual([
        "scene.ts", "native-block-authoring.json", "native-resources.json",
      ]);
      expect(prepared.generationRequest).toMatchObject({
        nativeSceneApiRef: "worldkit://native-scene-api/babylon@1",
        nativeSceneApiHash: API_HASH,
        nativeSceneProfileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
        nativeSceneProfileHash: SCENE_PROFILE_HASH,
        blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
        blockProfileHash: BLOCK_PROFILE_HASH,
      });
      expect(prepared.routerRequestId).toMatch(/^native-block-generation-/);
      expect(prepared.routerArguments[prepared.routerArguments.indexOf("--stage") + 1]).toBe("coding-agent");
      expect(prepared.routerArguments).not.toContain(value.root);
      expect(prepared.attempt.sourceInput.kind).toBe("babylon-native");
      expect(prepared.generationRequest.bootstrapInputHash).toBe(
        sha256Bytes(prepared.bootstrapBytes),
      );
      expect(new TextDecoder().decode(prepared.bootstrapBytes)).not.toMatch(/\n$/);
      expect(JSON.parse(new TextDecoder().decode(prepared.subjectHostContextBytes))).toEqual(prepared.subjectHostContext);
      expect(prepared.subjectHostContext.resources.length).toBeGreaterThan(0);
      expect(prepared.bootstrap).toMatchObject({
        gameplayBootstrapRef: "worldkit://gameplay-bootstrap/cloud-temple-t-gate-native-block.17@1",
        initialControlledEntityId: "cloud-temple-t-gate-native-block-subject",
        spawnMarkerId: "spawn",
        seed: 17,
      });
      expect(prepared.generationRequest.contextInputs.map((entry) => entry.inputRef)).toEqual(
        expect.arrayContaining([
          "inputs/subject-host-context.json",
          "inputs/world-bounds-policy.json",
          "inputs/builder-skill/scripts/render-visual-review.mjs",
        ]),
      );
      expect(prepared.frozenOwnerIdentities).toEqual(
        resolveWorldReconstructionFrozenOwnerIdentitiesV1({
          reconstructionCase: input(value).case,
          evaluationProfile: input(value).profile,
          subjectHostContext: prepared.subjectHostContext,
          worldBoundsPolicy: JSON.parse(new TextDecoder().decode(prepared.worldBoundsPolicyBytes)),
          bootstrap: prepared.bootstrap,
        }),
      );
      expect(() => resolveWorldReconstructionFrozenOwnerIdentitiesV1({
        reconstructionCase: input(value).case,
        evaluationProfile: input(value).profile,
        subjectHostContext: prepared.subjectHostContext,
        worldBoundsPolicy: JSON.parse(new TextDecoder().decode(prepared.worldBoundsPolicyBytes)),
        bootstrap: {
          ...prepared.bootstrap,
          gameplayBootstrapRef: "worldkit://gameplay-bootstrap/changed@1",
        },
      })).toThrowError("World reconstruction frozen owner identity closure failed");
      for (const contextInput of prepared.generationRequest.contextInputs) {
        const bytes = await readFile(path.join(prepared.taskWorkspacePath, contextInput.inputRef));
        expect(sha256Bytes(bytes)).toBe(contextInput.contentHash);
      }
      const attemptRoot = path.join(value.root, "runs", "initial", "attempts", "0");
      const durableRoute = JSON.parse(await readFile(path.join(attemptRoot, "scene-authoring-route-decision.json"), "utf8"));
      const durableRequest = JSON.parse(await readFile(path.join(attemptRoot, "generation-request.json"), "utf8"));
      const durableAttempt = JSON.parse(await readFile(path.join(attemptRoot, "attempt.json"), "utf8"));
      const hostContext = JSON.parse(await readFile(path.join(attemptRoot, "inputs", "subject-host-context.json"), "utf8"));
      expect(sha256CanonicalJson(durableRoute)).toBe(prepared.generationRequest.routeDecisionHash);
      expect(durableRequest).toEqual(prepared.generationRequest);
      expect(durableAttempt).toEqual(prepared.attempt);
      expect(hostContext).toEqual(prepared.subjectHostContext);
      await rm(prepared.taskWorkspacePath, { recursive: true, force: false });
      // Cleanup may remove the disposable task, but not any frozen input needed
      // for an explicit Host replay of this same dispatch.
      for (const frozenInput of [
        ...prepared.generationRequest.contextInputs,
        ...prepared.generationRequest.referenceInputs.map((reference) => ({ ...reference, inputRef: `inputs/${reference.inputRef}` })),
        { inputRef: `inputs/${prepared.generationRequest.sceneBriefRef}`, contentHash: prepared.generationRequest.sceneBriefHash },
        { inputRef: prepared.generationRequest.taskInstructionRef, contentHash: prepared.generationRequest.taskInstructionHash },
        { inputRef: prepared.generationRequest.workspaceContextManifestRef, contentHash: prepared.generationRequest.workspaceContextManifestHash },
      ]) {
        expect(sha256Bytes(await readFile(path.join(attemptRoot, frozenInput.inputRef))))
          .toBe(frozenInput.contentHash);
      }
      expect(JSON.parse(await readFile(path.join(attemptRoot, "generation-dispatch.json"), "utf8")))
        .toEqual({
          kind: "native-block-generation-dispatch", schemaVersion: 1,
          backend: prepared.backend,
          generationRequestHash: prepared.generationRequestHash,
          attemptHash: prepared.attemptHash,
          routerRequestId: prepared.routerRequestId,
          routerTaskPayloadHash: prepared.routerTaskPayloadHash,
          routerArguments: prepared.routerArguments,
          frozenOwnerIdentities: prepared.frozenOwnerIdentities,
        });
      for (const [name, expectedRef, expectedHash] of [
        ["native-scene-api.json", prepared.generationRequest.nativeSceneApiRef, prepared.generationRequest.nativeSceneApiHash],
        ["native-scene-profile.json", prepared.generationRequest.nativeSceneProfileRef, prepared.generationRequest.nativeSceneProfileHash],
        ["block-profile.json", prepared.generationRequest.blockProfileRef, prepared.generationRequest.blockProfileHash],
      ] as const) {
        const durableDescriptorBytes = await readFile(path.join(attemptRoot, "inputs", name));
        expect(durableDescriptorBytes).toEqual(await readFile(path.join(value.inputDirectory, name)));
        const descriptor = JSON.parse(new TextDecoder().decode(durableDescriptorBytes));
        expect(descriptor).toMatchObject({ resourceRef: expectedRef, contentHash: expectedHash });
      }
      expect(await readFile(path.join(
        attemptRoot,
        "inputs/subject-host-context.json",
      ))).toEqual(Buffer.from(prepared.subjectHostContextBytes));
      for (const relativePath of [
        "builder-skill/scripts/render-visual-review.mjs",
        "entry-whitebox-target.png",
        "world-plan.png",
      ]) {
        expect(await readFile(path.join(attemptRoot, "inputs", relativePath)))
          .toEqual(await readFile(path.join(value.inputDirectory, relativePath)));
      }
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("forbids repair context on Attempt 0 and requires a canonical manifest-bound repair instruction on Attempt 1", async () => {
    const value = await fixture();
    try {
      const attempt0 = await prepareNativeBlockGenerationTaskV1(input(value));
      const repairInstruction = createNativeBlockRepairInstructionV1({
        priorAttemptIndex: 0,
        nextAttemptIndex: 1,
        diagnostics: [parseWorldReconstructionDiagnosticV1({
          kind: "world-reconstruction-diagnostic",
          schemaVersion: 1,
          id: "diag.collider-missing",
          code: "WORLD_RECONSTRUCTION_COLLIDER_MISSING",
          dimensionId: "collider",
          acceptanceTargetRef: "worldkit://acceptance-target/gate@1",
          targetRef: "worldkit://acceptance-target/gate@1",
          targetId: "gate-wall",
          metricId: "collider-contribution-presence",
          details: {
            kind: "presence-mismatch",
            expectedValue: "present",
            actualValue: "missing",
            correctionDirection: "add",
          },
          evidenceRefs: ["artifact://run/attempts/0/evidence-set.json"],
          message: "Collider is missing.",
          repairAction: {
            kind: "revise-native-source",
            targetKind: "static-collider",
            targetId: "gate-wall",
            operation: "add",
            instruction: "Register the missing gate-wall static collider contribution.",
          },
        })],
        priorSourceRef: "artifact://run/attempts/0/source",
        priorSourceHash: hash("d"),
        priorEvidence: {
          kind: "evaluation-result",
          resultRef: "artifact://run/attempts/0/evaluation.json",
          resultHash: sha256Bytes(
            new TextEncoder().encode("{}"),
          ) as `sha256:${string}`,
        },
        priorGenerationRequestRef: "artifact://run/attempts/0/generation-request.json",
        priorGenerationRequestHash: attempt0.generationRequestHash,
        frozenOwnerIdentities: attempt0.frozenOwnerIdentities,
      });
      await expect(prepareNativeBlockGenerationTaskV1({
        ...input(value),
        runId: "attempt-zero-reject",
        runDirectoryPath: path.join(value.root, "runs", "attempt-zero-reject"),
        repairInstruction,
      })).rejects.toThrowError("Initial generation attempt must not declare a repair instruction");
      await expect(prepareNativeBlockGenerationTaskV1({
        ...input(value),
        attemptIndex: 1,
        runId: "attempt-one-missing",
        runDirectoryPath: path.join(value.root, "runs", "attempt-one-missing"),
      })).rejects.toThrowError("Repair generation attempt requires one repair instruction");

      const priorAttemptRoot = path.join(value.root, "runs", "initial", "attempts", "0");
      await writePriorRepairContext(priorAttemptRoot, {
        sceneAuthoringAttemptRef: `worldkit://scene-authoring-attempt/${attempt0.attempt.id}@1`,
        sceneAuthoringAttemptHash: attempt0.attemptHash,
        priorSourceRef: repairInstruction.priorSourceRef,
        priorSourceHash: repairInstruction.priorSourceHash,
        evaluationText: "{}",
      });

      const priorEvaluationPath = path.join(priorAttemptRoot, "evaluation.json");
      await writeFile(priorEvaluationPath, '{"forged":true}');
      await expect(prepareNativeBlockGenerationTaskV1({
        ...input(value),
        attemptIndex: 1,
        repairInstruction,
      })).rejects.toThrowError(
        "WORLD_RECONSTRUCTION_REPAIR_IDENTITY_MISMATCH",
      );
      await writeFile(priorEvaluationPath, "{}");

      const priorAttemptResultPath = path.join(priorAttemptRoot, "attempt-result.json");
      const priorAttemptResult = JSON.parse(await readFile(priorAttemptResultPath, "utf8"));
      await writeFile(priorAttemptResultPath, stringifyCanonicalJson({
        ...priorAttemptResult,
        authoredSourceHash: hash("f"),
      }));
      await expect(prepareNativeBlockGenerationTaskV1({
        ...input(value),
        attemptIndex: 1,
        repairInstruction,
      })).rejects.toThrowError(
        "WORLD_RECONSTRUCTION_REPAIR_IDENTITY_MISMATCH",
      );
      await writeFile(priorAttemptResultPath, stringifyCanonicalJson(priorAttemptResult));

      const attempt1 = await prepareNativeBlockGenerationTaskV1({
        ...input(value),
        attemptIndex: 1,
        repairInstruction,
      });
      const repairContext = attempt1.generationRequest.contextInputs.find(
        ({ inputRef }) => inputRef === "context/repair-instruction.json",
      );
      expect(repairContext).toBeDefined();
      const repairBytes = await readFile(path.join(
        attempt1.taskWorkspacePath,
        "context/repair-instruction.json",
      ));
      expect(sha256Bytes(repairBytes)).toBe(repairContext?.contentHash);
      expect(JSON.parse(repairBytes.toString("utf8"))).toEqual(repairInstruction);
      const repairInputRefs = [
        "inputs/attempts/0/source/scene.ts",
        "inputs/attempts/0/source/native-block-authoring.json",
        "inputs/attempts/0/source/native-resources.json",
        "inputs/attempts/0/generation-request.json",
        "inputs/attempts/0/attempt-result.json",
        "inputs/attempts/0/evaluation.json",
        "inputs/attempts/0/capture/opening.png",
        "inputs/attempts/0/capture/world-side.png",
        "inputs/attempts/0/capture/world-top-down.png",
        "inputs/attempts/0/capture/opening-identity-mask.png",
        "inputs/attempts/0/capture/world-side-identity-mask.png",
        "inputs/attempts/0/capture/world-top-down-identity-mask.png",
        "inputs/attempts/0/capture/semantic-view-observation-set.json",
        "inputs/attempts/0/capture/opening-observation.json",
        "inputs/attempts/0/capture/collider-overlay.png",
        "inputs/attempts/0/capture/collider-overlay-observation.json",
        "inputs/attempts/0/capture/spawn-support-observation.json",
        "inputs/attempts/0/capture/scripted-traversal.json",
      ];
      expect(attempt1.generationRequest.contextInputs.map(({ inputRef }) => inputRef)).toEqual(
        expect.arrayContaining(repairInputRefs),
      );
      for (const inputRef of repairInputRefs) {
        const contextEntry = attempt1.generationRequest.contextInputs.find(
          (entry) => entry.inputRef === inputRef,
        );
        expect(contextEntry).toBeDefined();
        const bytes = await readFile(path.join(attempt1.taskWorkspacePath, inputRef));
        expect(sha256Bytes(bytes)).toBe(contextEntry?.contentHash);
      }
      const repairTaskInstruction = await readFile(
        path.join(attempt1.taskWorkspacePath, attempt1.generationRequest.taskInstructionRef),
        "utf8",
      );
      expect(repairTaskInstruction).toContain("inputs/attempts/0/source/scene.ts");
      expect(repairTaskInstruction).toContain("context/repair-instruction.json");
      expect(repairTaskInstruction).toContain("repairAction.instruction");
      expect(repairTaskInstruction).toContain("Do not change the Case, Profile, or acceptance thresholds");
      expect(repairTaskInstruction).toContain("inputs/attempts/0/evaluation.json");
      expect(repairTaskInstruction).toContain(
        "read inputs/attempts/0/evaluation.json and inputs/attempts/0/capture/",
      );
      expect(repairTaskInstruction).toContain(
        "read inputs/attempts/0/rejected-capture/opening-composition-gate-result.json",
      );
      expect(repairTaskInstruction).toContain(
        "Do not reassign an existing Block's visualGroupId",
      );
      expect(repairTaskInstruction).toContain(
        "must produce a visible geometry change in the evidence view",
      );
      expect(repairTaskInstruction).toContain(
        "Group opening-composition diagnostics by targetId before editing",
      );
      expect(repairTaskInstruction).toContain(
        "never stop after fixing only the largest drift row",
      );
      expect(repairTaskInstruction).toContain(
        "a boundary at 0 or 10000 alone does not prove clipping",
      );
      expect(repairTaskInstruction).toContain(
        "Pixel drift uses adjust-geometry, not an assumed resize or move",
      );
      expect(sha256Bytes(new TextEncoder().encode(repairTaskInstruction))).toBe(
        attempt1.generationRequest.taskInstructionHash,
      );
      expect(attempt1.generationRequest.workspaceContextManifestHash).not.toBe(
        attempt0.generationRequest.workspaceContextManifestHash,
      );
      expect(attempt1.routerTaskPayloadHash).not.toBe(attempt0.routerTaskPayloadHash);
      expect(attempt1.frozenOwnerIdentities).toEqual(attempt0.frozenOwnerIdentities);
      expect(attempt1.generationRequest.declaredOutputPaths).toEqual([
        "scene.ts", "native-block-authoring.json", "native-resources.json",
      ]);
      await rm(attempt1.taskWorkspacePath, { recursive: true });
      const durableAttemptRoot = path.dirname(attempt1.taskWorkspacePath);
      for (const frozenInput of attempt1.generationRequest.contextInputs) {
        expect(sha256Bytes(await readFile(path.join(durableAttemptRoot, frozenInput.inputRef))))
          .toBe(frozenInput.contentHash);
      }
      expect(await readFile(path.join(durableAttemptRoot, attempt1.generationRequest.taskInstructionRef), "utf8"))
        .toBe(repairTaskInstruction);
      expect(JSON.parse(await readFile(path.join(durableAttemptRoot, "generation-dispatch.json"), "utf8")))
        .toMatchObject({ routerRequestId: attempt1.routerRequestId, routerTaskPayloadHash: attempt1.routerTaskPayloadHash });
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("freezes rejected identity pixels for Opening repair and rejects a missing mask", async () => {
    const value = await fixture();
    try {
      const runId = "opening-pixel-repair";
      const runDirectoryPath = path.join(value.root, "runs", runId);
      const initial = await prepareNativeBlockGenerationTaskV1({ ...input(value), runId, runDirectoryPath });
      const priorAttemptRoot = path.join(runDirectoryPath, "attempts", "0");
      const priorSourceRef = "artifact://run/attempts/0/source";
      const priorSourceHash = hash("d");
      await writePriorRepairContext(priorAttemptRoot, {
        sceneAuthoringAttemptRef: `worldkit://scene-authoring-attempt/${initial.attempt.id}@1`,
        sceneAuthoringAttemptHash: initial.attemptHash, priorSourceRef, priorSourceHash, evaluationText: "{}",
      });
      const rejectedRoot = path.join(priorAttemptRoot, "rejected-capture");
      await cp(path.join(priorAttemptRoot, "capture"), rejectedRoot, { recursive: true });
      const gate = { kind: "worldkit-opening-composition-host-gate", schemaVersion: 1, status: "failed", diagnostics: [] };
      await writeFile(path.join(rejectedRoot, "opening-composition-gate-result.json"), stringifyCanonicalJson(gate));
      const repairInstruction = createNativeBlockRepairInstructionV1({
        priorAttemptIndex: 0, nextAttemptIndex: 1, priorSourceRef, priorSourceHash,
        diagnostics: [parseWorldReconstructionDiagnosticV1({
          kind: "world-reconstruction-diagnostic", schemaVersion: 1, id: "opening-pixel-drift",
          code: "WORLD_RECONSTRUCTION_OPENING_COMPOSITION_DRIFT", dimensionId: "opening-composition",
          acceptanceTargetRef: "worldkit://acceptance-target/gate@1", targetRef: "worldkit://composition-target/opening@1",
          targetId: "gate-group", metricId: "opening-region-min-x-basis-points",
          details: { kind: "basis-points-threshold", expectedBasisPoints: 100, actualBasisPoints: 500,
            maximumAllowedDriftBasisPoints: 100, exceededByBasisPoints: 300, correctionDirection: "decrease" },
          evidenceRefs: ["artifact://run/attempts/0/rejected-capture/opening-composition-gate-result.json"],
          message: "Opening visible pixels drift from reference.",
          repairAction: { kind: "revise-native-source", targetKind: "composition-target", targetId: "gate-group",
            operation: "adjust-geometry", instruction: "Compare identity and display pixels; preserve holes and occlusion." },
        })],
        priorEvidence: { kind: "opening-composition-gate-result",
          resultRef: "artifact://run/attempts/0/rejected-capture/opening-composition-gate-result.json",
          resultHash: sha256CanonicalJson(gate) as Sha256HashV1 },
        priorGenerationRequestRef: "artifact://run/attempts/0/generation-request.json",
        priorGenerationRequestHash: initial.generationRequestHash, frozenOwnerIdentities: initial.frozenOwnerIdentities,
      });
      const removedPath = path.join(rejectedRoot, "opening-identity-mask.png");
      const maskBytes = await readFile(removedPath);
      await rm(removedPath);
      const nextInput = { ...input(value), runId, runDirectoryPath, attemptIndex: 1 as const, repairInstruction };
      await expect(prepareNativeBlockGenerationTaskV1(nextInput)).rejects.toThrow();
      await writeFile(removedPath, maskBytes);
      const repaired = await prepareNativeBlockGenerationTaskV1(nextInput);
      for (const name of ["opening-identity-mask.png", "world-side-identity-mask.png",
        "world-top-down-identity-mask.png", "semantic-view-observation-set.json"]) {
        const inputRef = `inputs/attempts/0/rejected-capture/${name}`;
        const context = repaired.generationRequest.contextInputs.find((entry) => entry.inputRef === inputRef);
        expect(context).toBeDefined();
        const frozenBytes = await readFile(path.join(repaired.taskWorkspacePath, inputRef));
        expect(frozenBytes).toEqual(await readFile(path.join(rejectedRoot, name)));
        expect(sha256Bytes(frozenBytes)).toBe(context?.contentHash);
      }
    } finally { await rm(value.root, { recursive: true, force: true }); }
  });

  it("freezes Ground Analysis evidence without inventing Capture inputs for Attempt 1", async () => {
    const value = await fixture();
    try {
      const runId = "ground-repair";
      const runDirectoryPath = path.join(value.root, "runs", runId);
      const attempt0 = await prepareNativeBlockGenerationTaskV1({
        ...input(value),
        runId,
        runDirectoryPath,
      });
      const priorSourceRef =
        "artifact://run/attempts/0/source";
      const priorSourceHash = hash("d");
      const priorAttemptRoot = path.join(
        runDirectoryPath,
        "attempts",
        "0",
      );
      await writePriorRepairContext(priorAttemptRoot, {
        sceneAuthoringAttemptRef:
          `worldkit://scene-authoring-attempt/${attempt0.attempt.id}@1`,
        sceneAuthoringAttemptHash: attempt0.attemptHash,
        priorSourceRef,
        priorSourceHash,
        evaluationText: "{}",
      });
      const groundAnalysisValue = {
        kind: "babylon-native-block-ground-analysis-report",
        schemaVersion: 1,
        admissionOutcome: "failed",
        groundAnalysisReportHash: hash("e"),
      };
      const groundAnalysisText =
        `${stringifyCanonicalJson(groundAnalysisValue)}\n`;
      await Promise.all([
        writeFile(
          path.join(priorAttemptRoot, "native-check-result.json"),
          "{}",
        ),
        writeFile(
          path.join(priorAttemptRoot, "logical-ground-model.json"),
          "{}",
        ),
        writeFile(
          path.join(priorAttemptRoot, "ground-analysis-report.json"),
          groundAnalysisText,
        ),
        writeFile(
          path.join(priorAttemptRoot, "ground-analysis-diagnostics.json"),
          "[]",
        ),
      ]);
      const repairInstruction = createNativeBlockRepairInstructionV1({
        priorAttemptIndex: 0,
        nextAttemptIndex: 1,
        diagnostics: [parseWorldReconstructionDiagnosticV1({
          kind: "world-reconstruction-diagnostic",
          schemaVersion: 1,
          id: "ground-analysis:ground-target-standability:reach-junction",
          code: "WORLD_RECONSTRUCTION_REQUIRED_TRAVERSAL_BLOCKED",
          dimensionId: "critical-traversal",
          acceptanceTargetRef:
            "worldkit://acceptance-target/upper-t-junction@1",
          targetRef: "worldkit://acceptance-target/upper-t-junction@1",
          targetId: "reach-junction",
          metricId: "ground-target-standability",
          details: {
            kind: "state-mismatch",
            expectedValue: "standable",
            actualValue: "not-standable",
            correctionDirection: "replace",
          },
          evidenceRefs: [
            "artifact://run/attempts/0/logical-ground-model.json",
          ],
          message: "Required target is not standable.",
          repairAction: {
            kind: "revise-native-source",
            targetKind: "traversal-check",
            targetId: "reach-junction",
            operation: "adjust-traversal",
            instruction: "Extend explicit support Blocks beneath the target.",
          },
        })],
        priorSourceRef,
        priorSourceHash,
        priorEvidence: {
          kind: "ground-analysis-report",
          resultRef:
            "artifact://run/attempts/0/ground-analysis-report.json",
          resultHash: sha256CanonicalJson(
            groundAnalysisValue,
          ) as `sha256:${string}`,
        },
        priorGenerationRequestRef:
          "artifact://run/attempts/0/generation-request.json",
        priorGenerationRequestHash: attempt0.generationRequestHash,
        frozenOwnerIdentities: attempt0.frozenOwnerIdentities,
      });

      const attempt1 = await prepareNativeBlockGenerationTaskV1({
        ...input(value),
        attemptIndex: 1,
        runId,
        runDirectoryPath,
        repairInstruction,
      });
      const inputRefs = attempt1.generationRequest.contextInputs.map(
        ({ inputRef }) => inputRef,
      );
      expect(inputRefs).toEqual(expect.arrayContaining([
        "inputs/attempts/0/native-check-result.json",
        "inputs/attempts/0/logical-ground-model.json",
        "inputs/attempts/0/ground-analysis-report.json",
        "inputs/attempts/0/ground-analysis-diagnostics.json",
      ]));
      expect(inputRefs).not.toContain("inputs/attempts/0/capture/opening.png");
      const repairTaskInstruction = await readFile(
        path.join(
          attempt1.taskWorkspacePath,
          attempt1.generationRequest.taskInstructionRef,
        ),
        "utf8",
      );
      expect(repairTaskInstruction).toContain(
        "For ground-analysis-report, read inputs/attempts/0/ground-analysis-report.json",
      );
      expect(repairTaskInstruction).toContain(
        "Ground Analysis runs before Capture",
      );
      expect(repairTaskInstruction).toContain(
        "preserve every required target's elevation, semantic silhouette, acceptanceTargetRef, fixed pass-check meaning, and the full frozen opening composition",
      );
      expect(repairTaskInstruction).toContain(
        "Do not flatten or lower the destination merely to make it reachable",
      );
      expect(repairTaskInstruction).toContain(
        "continuous face-contact support down to an existing root support",
      );
      expect(repairTaskInstruction).toContain(
        "does not suspend any other frozen Case requirement",
      );
      expect(repairTaskInstruction).toContain(
        "context/case.json.expected.openingComposition even though no prior Capture exists",
      );
      expect(repairTaskInstruction).toContain(
        "Never extend a ridge, cliff, landmark, structure, or background visual group toward Spawn merely to connect support",
      );
      expect(repairTaskInstruction).toContain(
        "Do not trade a Package/Ground gate failure for a predictable Capture/evaluation failure",
      );
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("binds Attempt 3 only to the immediately preceding Attempt 2 Native Check evidence", async () => {
    const value = await fixture();
    try {
      const runId = "native-check-repair-three";
      const runDirectoryPath = path.join(value.root, "runs", runId);
      const initial = await prepareNativeBlockGenerationTaskV1({
        ...input(value),
        runId,
        runDirectoryPath,
      });
      const priorAttemptRoot = path.join(runDirectoryPath, "attempts", "2");
      const priorSourceRef = "artifact://run/attempts/2/source";
      const priorSourceHash = hash("d");
      await writePriorRepairContext(priorAttemptRoot, {
        sceneAuthoringAttemptRef:
          `worldkit://scene-authoring-attempt/${initial.attempt.id}@1`,
        sceneAuthoringAttemptHash: initial.attemptHash,
        priorSourceRef,
        priorSourceHash,
        evaluationText: "{}",
      });
      const nativeCheckText = stringifyCanonicalJson({ outcome: "rejected" });
      await Promise.all([
        writeFile(
          path.join(priorAttemptRoot, "generation-request.json"),
          await readFile(path.join(
            runDirectoryPath,
            "attempts",
            "0",
            "generation-request.json",
          )),
        ),
        writeFile(
          path.join(priorAttemptRoot, "native-check-result.json"),
          nativeCheckText,
        ),
      ]);
      const repairInstruction = createNativeBlockRepairInstructionV1({
        priorAttemptIndex: 2,
        nextAttemptIndex: 3,
        diagnostics: [parseWorldReconstructionDiagnosticV1({
          kind: "world-reconstruction-diagnostic",
          schemaVersion: 1,
          id: "native-check-collider-missing",
          code: "WORLD_RECONSTRUCTION_COLLIDER_MISSING",
          dimensionId: "collider",
          acceptanceTargetRef: "worldkit://acceptance-target/gate@1",
          targetRef: "worldkit://acceptance-target/gate@1",
          targetId: "gate-collider",
          metricId: "collider-contribution-presence",
          details: {
            kind: "presence-mismatch",
            expectedValue: "present",
            actualValue: "missing",
            correctionDirection: "add",
          },
          evidenceRefs: [
            "artifact://run/attempts/2/native-check-result.json",
          ],
          message: "Native Check found a missing Collider contribution.",
          repairAction: {
            kind: "revise-native-source",
            targetKind: "static-collider",
            targetId: "gate-collider",
            operation: "add",
            instruction: "Register the missing gate Collider contribution.",
          },
        })],
        priorSourceRef,
        priorSourceHash,
        priorEvidence: {
          kind: "native-check-result",
          resultRef: "artifact://run/attempts/2/native-check-result.json",
          resultHash: sha256CanonicalJson(
            JSON.parse(nativeCheckText),
          ) as `sha256:${string}`,
        },
        priorGenerationRequestRef:
          "artifact://run/attempts/2/generation-request.json",
        priorGenerationRequestHash: initial.generationRequestHash,
        frozenOwnerIdentities: initial.frozenOwnerIdentities,
      });

      const attempt3 = await prepareNativeBlockGenerationTaskV1({
        ...input(value),
        attemptIndex: 3,
        runId,
        runDirectoryPath,
        repairInstruction,
      });
      const inputRefs = attempt3.generationRequest.contextInputs.map(
        ({ inputRef }) => inputRef,
      );
      expect(inputRefs).toContain(
        "inputs/attempts/2/native-check-result.json",
      );
      expect(inputRefs.some((inputRef) =>
        inputRef.startsWith("inputs/attempts/0/")
      )).toBe(false);
      const instruction = await readFile(path.join(
        attempt3.taskWorkspacePath,
        attempt3.generationRequest.taskInstructionRef,
      ), "utf8");
      expect(instruction).toContain(
        "inputs/attempts/2/native-check-result.json",
      );
      expect(instruction).not.toContain(
        "inputs/attempts/0/native-check-result.json",
      );
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects a Native Route whose canonical decision or Case Scene Brief closure was forged", async () => {
    const value = await fixture();
    try {
      const forgedProfile = parseSceneAuthoringRouteDecisionV1({
        ...value.routeDecision,
        decision: {
          ...value.routeDecision.decision,
          authoringProfileRef: "worldkit://native-authoring-profile/forged@1",
        },
      });
      await expect(prepareNativeBlockGenerationTaskV1({
        ...input(value),
        routeDecision: forgedProfile,
      })).rejects.toThrow(/route decision/i);

      const forgedTrust = parseSceneAuthoringRouteDecisionV1({
        ...value.routeDecision,
        trustProfileRef: "worldkit://trust-profile/attacker-selected@1",
        trustProfileHash: hash("8"),
      });
      await expect(prepareNativeBlockGenerationTaskV1({
        ...input(value),
        routeDecision: forgedTrust,
      })).rejects.toThrow(/route decision/i);

      const mismatchedBrief = decideSceneAuthoringRouteV1({
        id: value.routeDecision.id,
        sceneBriefRef: "other-brief.md",
        sceneBriefHash: hash("9"),
        trustProfileRef: value.routeDecision.trustProfileRef,
        trustProfileHash: value.routeDecision.trustProfileHash,
        requiredCapabilityRefs: value.routeDecision.requiredCapabilityRefs,
        requestedSourceKind: "babylon-native",
        nativeTrustAdmitted: true,
        referenceDrivenDistinctiveSilhouette: true,
      });
      await expect(prepareNativeBlockGenerationTaskV1({
        ...input(value),
        routeDecision: mismatchedBrief,
        runId: "brief-mismatch",
        runDirectoryPath: path.join(value.root, "runs", "brief-mismatch"),
      })).rejects.toThrow(/scene brief/i);
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects a dotted bootstrap identity before whitebox.blocks finalization", async () => {
    const value = await fixture();
    try {
      await expect(prepareNativeBlockGenerationTaskV1({
        ...input(value),
        bootstrapId: "fixture.native",
      })).rejects.toThrow(/stable lowercase identity/);
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("requires strict resolved resource descriptors with content hashes", async () => {
    const value = await fixture();
    try {
      await writeFile(
        path.join(value.inputDirectory, "native-scene-api.json"),
        JSON.stringify({ resourceRef: "worldkit://native-scene-api/babylon@1", resolvedVersion: "1" }),
      );
      await expect(prepareNativeBlockGenerationTaskV1(input(value))).rejects.toThrow(/resolved resource/i);
      await writeFile(
        path.join(value.inputDirectory, "native-scene-api.json"),
        `${resolutionDescriptor("native-scene-api", "worldkit://native-scene-api/babylon@1", API_HASH)}\n`,
      );
      await expect(prepareNativeBlockGenerationTaskV1(input(value))).rejects.toThrow(/canonical bytes/i);
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects a frozen Registry resource whose bytes do not match its lock", async () => {
    const value = await fixture();
    try {
      const requestInput = input(value);
      const context = structuredClone(requestInput.subjectHostContext);
      const forged = { ...context, resources: context.resources.map((resource, index) =>
        index === 0 ? { ...resource, contentHash: hash("0") } : resource) };
      await expect(prepareNativeBlockGenerationTaskV1({
        ...requestInput, subjectHostContext: forged,
      })).rejects.toThrow(/Registry resource hash mismatch/i);
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects symlinked input and output ancestors", async () => {
    const value = await fixture();
    const externalInput = await mkdtemp(path.join(os.tmpdir(), "worldkit-generation-external-input-"));
    const externalOutput = await mkdtemp(path.join(os.tmpdir(), "worldkit-generation-external-output-"));
    try {
      await writeFile(path.join(externalInput, "instruction.md"), "outside\n");
      await symlink(externalInput, path.join(value.inputDirectory, "linked"));
      await expect(prepareNativeBlockGenerationTaskV1({
        ...input(value),
        taskInstructionPath: path.join(value.inputDirectory, "linked", "instruction.md"),
      })).rejects.toThrow(/symbolic link|canonical|outside/i);

      await symlink(externalOutput, path.join(value.root, "linked-runs"));
      await expect(prepareNativeBlockGenerationTaskV1({
        ...input(value),
        runId: "escaped",
        runDirectoryPath: path.join(value.root, "linked-runs", "escaped"),
      })).rejects.toThrow(/symbolic link|canonical|outside/i);
    } finally {
      await Promise.all([
        rm(value.root, { recursive: true, force: true }),
        rm(externalInput, { recursive: true, force: true }),
        rm(externalOutput, { recursive: true, force: true }),
      ]);
    }
  });

  it("publishes each Attempt once and scopes router identity to the run", async () => {
    const value = await fixture();
    try {
      const firstInput = input(value);
      const first = await prepareNativeBlockGenerationTaskV1(firstInput);
      await expect(prepareNativeBlockGenerationTaskV1(firstInput)).rejects.toThrow(/attempt.*exists|fresh/i);
      const second = await prepareNativeBlockGenerationTaskV1({
        ...input(value),
        runId: "second",
        runDirectoryPath: path.join(value.root, "runs", "second"),
      });
      expect(second.routerRequestId).not.toBe(first.routerRequestId);
      expect(first.routerRequestId).toContain("-initial-");
      expect(second.routerRequestId).toContain("-second-");
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("keeps the formal router identity bounded for a valid timestamped run", async () => {
    const value = await fixture();
    try {
      const runId = "run-20260902130320-15359";
      const prepared = await prepareNativeBlockGenerationTaskV1({
        ...input(value),
        runId,
        runDirectoryPath: path.join(value.root, "runs", runId),
      });
      expect(prepared.routerRequestId).toMatch(/^[a-z0-9][a-z0-9-]{2,79}$/);
      expect(prepared.routerArguments).toEqual(expect.arrayContaining([
        "--task-id",
        prepared.routerRequestId,
        "--request-id",
        prepared.routerRequestId,
      ]));
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it.each([
    ["canonical route", async (value: Awaited<ReturnType<typeof fixture>>) => ({ ...input(value), routeDecision: decideSceneAuthoringRouteV1({ id: "canonical", sceneBriefRef: "scene-brief.md", sceneBriefHash: hash("a"), trustProfileRef: "worldkit://trust-profile/trusted-local@1", trustProfileHash: hash("b"), requiredCapabilityRefs: [], requestedSourceKind: "canonical", nativeTrustAdmitted: true, referenceDrivenDistinctiveSilhouette: false }) })],
    ["repair index without its instruction", async (value: Awaited<ReturnType<typeof fixture>>) => ({ ...input(value), attemptIndex: 2 })],
    ["run directory escape", async (value: Awaited<ReturnType<typeof fixture>>) => ({ ...input(value), runDirectoryPath: path.join(value.root, "..", "escape") })],
    ["run identity outside the router dialect", async (value: Awaited<ReturnType<typeof fixture>>) => ({ ...input(value), runId: "invalid.run", runDirectoryPath: path.join(value.root, "runs", "invalid.run") })],
  ])("rejects %s before process preparation", async (_label, mutate) => {
    const value = await fixture();
    try {
      await expect(prepareNativeBlockGenerationTaskV1(await mutate(value))).rejects.toThrow();
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects a cloud output root that is not an absolute S3 URI", async () => {
    const value = await fixture();
    try {
      await expect(prepareNativeBlockGenerationTaskV1({
        ...input(value),
        cloudOutputS3Root: "cloud-temple/output",
      })).rejects.toThrowError(/S3/i);
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects symbolic-link inputs and changed bytes after the Case hash was frozen", async () => {
    const value = await fixture();
    try {
      await rm(path.join(value.inputDirectory, "reference-0.png"));
      await symlink(path.join(value.inputDirectory, "scene-brief.md"), path.join(value.inputDirectory, "reference-0.png"));
      await expect(prepareNativeBlockGenerationTaskV1(input(value))).rejects.toThrow(/symbolic link/i);
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("declares Planner images and uploaded references as semantically named router assets", async () => {
    const value = await fixture();
    try {
      const fixtureInput = input(value);
      const prepared = await prepareNativeBlockGenerationTaskV1(fixtureInput);
      expect(prepared.routerArguments.filter((argument) => argument === "--asset")).toHaveLength(3);
      expect(prepared.routerArguments).toEqual(expect.arrayContaining([
        "entry-whitebox-target::attempts/0/.task/inputs/entry-whitebox-target.png::image::image/png",
        "reference-0::attempts/0/.task/inputs/reference-0.png::image::image/png",
        "world-plan::attempts/0/.task/inputs/world-plan.png::image::image/png",
      ]));
    } finally { await rm(value.root, { recursive: true, force: true }); }
  });

  it.each(["cloud", "local"] as const)("freezes the same WebP bytes and image role for the %s router", async (backend) => {
    const value = await fixture();
    try {
      const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } }).webp().toBuffer();
      await writeFile(path.join(value.inputDirectory, "reference-0.webp"), bytes);
      await rm(path.join(value.inputDirectory, "reference-0.png"));
      const initial = input(value);
      const { cloudOutputS3Root, ...common } = initial;
      const prepared = await prepareNativeBlockGenerationTaskV1({
        ...common,
        backend,
        ...(backend === "cloud" ? { cloudOutputS3Root } : {}),
        case: parseWorldReconstructionCaseV1({
          ...initial.case,
          referenceInputs: initial.case.referenceInputs.map((reference) => reference.inputRef === "reference-0.png"
            ? { inputRef: "reference-0.webp", contentHash: sha256Bytes(bytes), mediaType: "image/webp" }
            : reference),
        }),
      });
      expect(prepared.routerArguments).toContain("reference-0::attempts/0/.task/inputs/reference-0.webp::image::image/webp");
      if (backend === "local") {
        const flag = prepared.routerArguments.indexOf("--failure-evidence-root");
        expect(flag).toBeGreaterThan(-1);
        expect(prepared.routerArguments[flag + 1]).toBe("attempts/0/generation-failure");
      } else {
        expect(prepared.routerArguments).not.toContain("--failure-evidence-root");
      }
      expect(prepared.routerTaskPayloadHash).toBe(sha256CanonicalJson({
        request: prepared.generationRequest, routerRequestId: prepared.routerRequestId,
        routerArguments: prepared.routerArguments,
      }));
      expect(prepared.generationRequest.referenceInputs).toContainEqual({
        inputRef: "reference-0.webp", contentHash: sha256Bytes(bytes), mediaType: "image/webp",
      });
      expect(await readFile(path.join(prepared.taskWorkspacePath, "inputs/reference-0.webp"))).toEqual(bytes);
    } finally { await rm(value.root, { recursive: true, force: true }); }
  });

  it.each([
    "entry-whitebox-target.png",
    "planner-self-check.json",
    "visual-identity-palette.json",
    "world-plan.png",
  ])("rejects a generation request without the required %s Planner input", async (missingPath) => {
    const value = await fixture();
    try {
      const fixtureInput = input(value);
      fixtureInput.case = parseWorldReconstructionCaseV1({
        ...fixtureInput.case,
        referenceInputs: fixtureInput.case.referenceInputs.filter(
          ({ inputRef }) => inputRef !== missingPath,
        ),
      });
      await expect(prepareNativeBlockGenerationTaskV1(fixtureInput)).rejects
        .toThrowError("NATIVE_WORLD_PLANNER_INPUT_CLOSURE_INVALID");
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects stale Planner receipt bytes before creating a generation Attempt", async () => {
    const value = await fixture();
    try {
      const fixtureInput = input(value);
      await writeFile(
        path.join(value.inputDirectory, "planner-self-check.json"),
        "stale-planner-receipt",
      );
      await expect(prepareNativeBlockGenerationTaskV1(fixtureInput)).rejects
        .toThrowError("NATIVE_WORLD_PLANNER_INPUT_CLOSURE_INVALID");
      await expect(lstat(fixtureInput.runDirectoryPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects the Canonical target-3 color from the Native Builder context", async () => {
    const value = await fixture();
    try {
      const fixtureInput = input(value);
      const palettePath = path.join(
        value.inputDirectory,
        "visual-identity-palette.json",
      );
      const palette = JSON.parse(await readFile(palettePath, "utf8")) as {
        targets: { identityColor: string }[];
      };
      palette.targets[2]!.identityColor = "#8E6CCF";
      const forgedPaletteBytes = new TextEncoder().encode(
        JSON.stringify(palette),
      );
      await writeFile(palettePath, forgedPaletteBytes);
      fixtureInput.case = parseWorldReconstructionCaseV1({
        ...fixtureInput.case,
        referenceInputs: fixtureInput.case.referenceInputs.map((reference) =>
          reference.inputRef === "visual-identity-palette.json"
            ? {
              ...reference,
              contentHash: sha256Bytes(forgedPaletteBytes),
            }
            : reference
        ),
      });
      await expect(prepareNativeBlockGenerationTaskV1(fixtureInput)).rejects
        .toThrowError("WORLDKIT_VISUAL_IDENTITY_PALETTE_INVALID");
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });


  it("freezes a compiled Hosted catalog without removing SDK-only humanoid fixtures from the Registry", () => {
    const context = createNativeSubjectHostContextV1("catalog-test", "camera-main");
    const { subjects, rejectedSubjects } = context.authoringCatalog;
    const definitions = builtInSubjectResourceRegistry.listDiscoverableResources({ kind: "subject-definition" });
    expect([...subjects, ...rejectedSubjects].map(({ subjectDefinitionRef }) => subjectDefinitionRef).sort())
      .toEqual(definitions.map(({ resourceRef }) => resourceRef).sort());
    const proxyRef = "worldkit://subject-definition/humanoid.third-person@1";
    expect(subjects.some(({ subjectDefinitionRef }) => subjectDefinitionRef === proxyRef)).toBe(false);
    expect(rejectedSubjects.find(({ subjectDefinitionRef }) => subjectDefinitionRef === proxyRef)?.diagnostics)
      .toMatchObject([{ code: "NATIVE_BLOCK_BUILDER_SUBJECT_NOT_HOSTED_AUTHORING_ADMITTED" }]);
    expect(context.resources.some(({ resourceRef }) => resourceRef === proxyRef)).toBe(true);
    expect(compileNativeSubjectHostClosureV1(subjectHostInput({ source: "registry", subjectDefinitionRef: proxyRef }), builtInSubjectResourceRegistry).ok).toBe(true);
    expect(subjects.some(({ subjectDefinitionRef }) => subjectDefinitionRef === "worldkit://subject-definition/humanoid.g-bot@2")).toBe(true);
    expect(subjects.some(({ subjectDefinitionRef }) => subjectDefinitionRef === "worldkit://subject-definition/quadruped.ground-proxy@1")).toBe(true);
    for (const row of subjects) {
      const compiled = compileNativeSubjectHostClosureV1(subjectHostInput({ source: "registry", subjectDefinitionRef: row.subjectDefinitionRef }), builtInSubjectResourceRegistry);
      if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
      const actual = compiled.worldRuntimeBootstrap.subjectRuntimeDescriptors[0]!;
      expect(row.subjectDefinitionHash).toBe(actual.subjectDefinitionHash);
      expect(row.collider).toEqual(actual.collider);
      expect(row.cameraContext).toEqual(actual.capabilityAssembly.cameraContext);
      expect(row.visualReviewProxy.cuboids.length).toBeGreaterThan(0);
    }
    expect(createNativeSubjectHostContextV1("catalog-test", "camera-main")).toEqual(context);
    const forged = structuredClone(context);
    Object.assign(forged.authoringCatalog.subjects[0]!, { executableMovementModes: ["flight"] });
    expect(() => parseNativeSubjectHostContextV1(forged)).toThrow(/catalog differs from its frozen Registry/);
    const missing = structuredClone(context);
    Object.assign(missing.authoringCatalog, { subjects: [] });
    expect(() => parseNativeSubjectHostContextV1(missing)).toThrow(/catalog differs from its frozen Registry/);
  });

  it("preserves the old registered Subject advisory center without rotating its asset-bound offset", () => {
    // Literal 9e35ab53 agent-authoring-catalog.json G Bot proxy; this is the
    // old software-review approximation, not a new Runtime transform oracle.
    const row = createNativeSubjectAuthoringCatalogV1(builtInSubjectResourceRegistry).subjects
      .find(({ subjectDefinitionRef }) => subjectDefinitionRef === "worldkit://subject-definition/humanoid.g-bot@2")!;
    const proxy = row.visualReviewProxy.cuboids[0]!;
    const minimum = [-0.9025661945343018, -0.0003511549439281225, -0.14895710349082958];
    const maximum = [0.9025658369064331, 1.8088831901550293, 0.17174167931079876];
    for (let axis = 0; axis < 3; axis += 1) {
      expect(proxy.minimumMetersXYZ[axis]).toBeCloseTo(minimum[axis]!, 10);
      expect(proxy.maximumMetersXYZ[axis]).toBeCloseTo(maximum[axis]!, 10);
    }
  });

  it("preserves old registered advisory XYZ rotation and scale without changing the compiled visual transform", () => {
    const resources = structuredClone(builtInSubjectResourceRegistry.listDiscoverableResources().map(({ contentHash: _hash, ...resource }) =>
      resource as SubjectRegistryResourceInputV3));
    const ref = "worldkit://subject-definition/humanoid.g-bot@2";
    const definition = resources.find(resource => resource.kind === "subject-definition" && resource.resourceRef === ref);
    if (definition?.kind !== "subject-definition") throw new Error("G Bot fixture missing");
    const part = definition.visualParts[0]!;
    const transform = { positionMetersXYZ: [1.2, 0.5, -1.1], rotationEulerRadiansXYZ: [0.2, 0.4, -0.3], scaleXYZ: [1.2, 0.8, 0.9] };
    Object.assign(part, { localTransform: transform });
    const registry = createSubjectResourceRegistry(resources);
    const row = createNativeSubjectAuthoringCatalogV1(registry).subjects.find(subject => subject.subjectDefinitionRef === ref)!;
    // Executed 9e35ab53 scripts/lib/agent-authoring-catalog.ts visualProxy on
    // this exact registered definition. Multi-axis rotation is XYZ, not YXZ.
    const minimum = [-0.06026366106754155, 0.22389626699974852, -1.7742169049538743];
    const maximum = [2.460263231914099, 2.2229293611691325, -0.40527697680815344];
    for (let axis = 0; axis < 3; axis += 1) {
      expect(row.visualReviewProxy.cuboids[0]!.minimumMetersXYZ[axis]).toBeCloseTo(minimum[axis]!, 10);
      expect(row.visualReviewProxy.cuboids[0]!.maximumMetersXYZ[axis]).toBeCloseTo(maximum[axis]!, 10);
    }
    const compiled = compileNativeSubjectHostClosureV1(subjectHostInput({ source: "registry", subjectDefinitionRef: ref }), registry);
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
    expect(compiled.worldRuntimeBootstrap.subjectRuntimeDescriptors[0]!.visualParts[0]!.localTransform).toEqual(transform);
  });

  it("isolates catalog cache callers and invalidates it when a dependent Camera Profile changes", () => {
    const baseline = createNativeSubjectAuthoringCatalogV1(builtInSubjectResourceRegistry);
    const caller = createNativeSubjectAuthoringCatalogV1(builtInSubjectResourceRegistry);
    Object.assign(caller.subjects[0]!.cameraContext, { defaultCameraRigProfileRef: "forged" });
    expect(createNativeSubjectAuthoringCatalogV1(builtInSubjectResourceRegistry)).toEqual(baseline);
    const resources = structuredClone(builtInSubjectResourceRegistry.listDiscoverableResources().map(({ contentHash: _hash, ...resource }) =>
      resource as SubjectRegistryResourceInputV3));
    const usedProfile = baseline.subjects.flatMap(({ cameraContext }) => cameraContext.cameraRigProfiles)
      .find(({ parameters }) => typeof parameters.baseFovDegrees === "number");
    const profile = resources.find((resource) => resource.kind === "camera-rig-profile" && resource.resourceRef === usedProfile?.resourceRef);
    if (profile === undefined || profile.kind !== "camera-rig-profile") throw new Error("Camera Profile fixture missing");
    const baseFovDegrees = Number(profile.parameters.baseFovDegrees) + 1;
    Object.assign(profile.parameters, { baseFovDegrees });
    const changed = createNativeSubjectAuthoringCatalogV1(createSubjectResourceRegistry(resources));
    const consumers = changed.subjects.flatMap(({ cameraContext }) => cameraContext.cameraRigProfiles)
      .filter(({ resourceRef }) => resourceRef === profile.resourceRef);
    expect(consumers.length).toBeGreaterThan(0);
    for (const consumer of consumers) expect(consumer.parameters.baseFovDegrees).toBe(baseFovDegrees);
    expect(changed).not.toEqual(baseline);
    expect(createNativeSubjectAuthoringCatalogV1(builtInSubjectResourceRegistry)).toEqual(baseline);
  });

  it.each(["registered", "composed", "rigged"] as const)("compiles output-selected %s from actual frozen Native Request inputs", async (kind) => {
    const value = await fixture();
    try {
      const requestInput = input(value);
      const prepared = await prepareNativeBlockGenerationTaskV1(requestInput);
      const authoring = {
        kind: "native-block-authoring", schemaVersion: 1, entryModulePath: "scene.ts",
        blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1", visualGroups: [],
        groundExploration: { mode: "case-defined" }, openingCamera: prepared.bootstrap.initialCamera,
        controlledSubject: { visualTargetId: "visual-target-1", design: kind === "registered"
          ? { kind: "registered", subjectDefinitionRef: "worldkit://subject-definition/quadruped.ground-proxy@1" }
          : { kind: "composed", definition: nativeComposedDesign(kind === "rigged") } },
      };
      const frozen = JSON.parse(await readFile(path.join(prepared.taskWorkspacePath, "inputs/subject-host-context.json"), "utf8"));
      expect(frozen.authoringCatalog).toEqual(prepared.subjectHostContext.authoringCatalog);
      const closure = resolveNativeSubjectAuthoringClosureV1({ context: frozen, bootstrap: prepared.bootstrap, authoring });
      const descriptor = closure.worldRuntimeBootstrap.subjectRuntimeDescriptors[0]!;
      expect(descriptor.entityId).toBe(prepared.bootstrap.initialControlledEntityId);
      expect(descriptor.subjectDefinitionRef).toBe(kind === "registered"
        ? "worldkit://subject-definition/quadruped.ground-proxy@1"
        : `package://subject-definition/${nativeComposedDesign(kind === "rigged").id}@1`);
      expect(closure.gameplayBootstrap.resourceRef).toBe(prepared.bootstrap.gameplayBootstrapRef);
      expect(closure.executableMovementModes).toEqual(["ground-walk"]);
      expect(checkNativeSubjectHostedSelectionV1(closure, ["ground-walk"])).toEqual([]);
      const requestedModes = ["flight", "ground-walk", "ground-ride", "ground-drive", "water-surface", "underwater", "ground-slide", "custom"] as const;
      expect(checkNativeSubjectHostedSelectionV1(closure, requestedModes)).toMatchObject([{
        code: "NATIVE_BLOCK_BUILDER_SUBJECT_MOVEMENT_UNSATISFIED", instancePath: "/controlledSubject",
        details: { requestedMovementModes: requestedModes,
          executableMovementModes: ["ground-walk"],
          missingMovementModes: requestedModes.filter((mode) => mode !== "ground-walk"),
        },
      }]);
      expect(closure.subjectVisualReviewProxy.subjectDefinitionHash).toBe(descriptor.subjectDefinitionHash);
      expect(closure.subjectVisualReviewProxy.worldRuntimeBootstrapBytesHash).toBe(sha256Bytes(closure.worldRuntimeBootstrapBytes));
      expect(resolveNativeSubjectAuthoringClosureV1({ context: frozen, bootstrap: prepared.bootstrap, authoring })).toEqual(closure);
      expect(() => resolveNativeSubjectAuthoringClosureV1({ context: frozen,
        bootstrap: { ...prepared.bootstrap, gameplayBootstrapRef: "worldkit://gameplay-bootstrap/crosswired@1" }, authoring,
      })).toThrow(/Gameplay resource identity mismatch/);
      expect(() => resolveNativeSubjectAuthoringClosureV1({ context: frozen, bootstrap: prepared.bootstrap,
        authoring: { ...authoring, controlledSubject: { visualTargetId: "visual-target-1", design: {
          kind: "registered", subjectDefinitionRef: "worldkit://subject-definition/missing@1",
        } } },
      })).toThrow(/AUTHORING_REFERENCE_NOT_FOUND/);
      expect(() => resolveNativeSubjectAuthoringClosureV1({ context: frozen, bootstrap: prepared.bootstrap,
        authoring: { ...authoring, controlledSubjects: [authoring.controlledSubject, authoring.controlledSubject] },
      })).toThrow();
      expect(prepared.generationRequest.contextInputs.filter(({ inputRef }) => inputRef === "inputs/subject-host-context.json"))
        .toEqual([{ inputRef: "inputs/subject-host-context.json", contentHash: sha256Bytes(prepared.subjectHostContextBytes) }]);
      expect(prepared.generationRequest.contextInputs.some(({ inputRef }) => /(?:gameplay-bootstrap|world-runtime-bootstrap|subject-visual-review-proxy|host-closure)\.json$/.test(inputRef))).toBe(false);
    } finally { await rm(value.root, { recursive: true, force: true }); }
  });

  it("fails closed when the Host-owned Subject visual proxy cannot close an asset", async () => {
    const runtimePath = path.resolve(
      "apps/playground/public/world-packages/cloud-ridge/runtime/world-runtime-bootstrap.json",
    );
    const runtimeBytes = await readFile(runtimePath);
    const runtime = parseWorldRuntimeBootstrapV1(JSON.parse(
      new TextDecoder().decode(runtimeBytes),
    ));

    expect(() => deriveNativeBlockSubjectVisualReviewProxyV1({
      worldRuntimeBootstrap: {
        ...runtime,
        subjectAssets: [],
      },
      worldRuntimeBootstrapRef:
        "worldkit://world-runtime-bootstrap/cloud-ridge@1",
      worldRuntimeBootstrapBytesHash: sha256Bytes(runtimeBytes) as Sha256HashV1,
    }, builtInSubjectResourceRegistry)).toThrow(/Subject Asset Registry closure failed/);
  });

  it("ignores an untrusted prewritten Bootstrap and changes identity when Host seed changes", async () => {
    const value = await fixture();
    try {
      await writeFile(path.join(value.inputDirectory, "native-scene.bootstrap.json"), JSON.stringify({ seed: 99, initialControlledEntityId: "attacker" }));
      const first = await prepareNativeBlockGenerationTaskV1(input(value));
      const second = await prepareNativeBlockGenerationTaskV1({
        ...input(value),
        runId: "second",
        runDirectoryPath: path.join(value.root, "runs", "second"),
        seed: 18,
      });
      expect(first.bootstrap.seed).toBe(17);
      expect(first.bootstrap.initialControlledEntityId).toBe("cloud-temple-t-gate-native-block-subject");
      expect(first.generationRequestHash).not.toBe(second.generationRequestHash);
      expect(first.generationRequest.bootstrapInputHash).not.toBe(second.generationRequest.bootstrapInputHash);
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });
});
