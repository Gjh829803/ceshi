import {
  constants,
  copyFile,
  lstat,
  mkdir,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { parseSceneBriefV1 } from "@whitebox-world/authoring";
import {
  hashFormalWorldCaptureIntentV1,
  parseFormalWorldCaptureIntentV1,
} from "@whitebox-world/runtime-contracts";
import {
  sha256Bytes,
  stringifyCanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  hashWorldReconstructionEvaluationProfileV1,
  parseWorldReconstructionCaseV1,
  parseWorldReconstructionEvaluationProfileV1,
  type WorldReconstructionDimensionIdV1,
} from "@whitebox-world/validation";
import { parseNativeSceneWorldBoundsPolicyV1 } from "../native-scene/world-bounds-policy.js";
import { isNil, sortBy } from "lodash-es";
import sharp from "sharp";
import {
  nativeWorldReferenceInputRefV1,
  nativeWorldReferenceMediaTypeV1,
  validateNativeWorldReferenceImageV1,
} from "./native-world-reference-media.js";

import { analyzeNativeEntryIdentityImageV4 } from
  "../agents/agent-planner-self-check.js";
import {
  parseVisualIdentityPaletteV1,
  type VisualIdentityPaletteTargetV1,
} from "../scenes/visual-identity-palette.js";

const DIMENSION_IDS = Object.freeze([
  "collider",
  "critical-traversal",
  "deterministic-build",
  "opening-composition",
  "semantic-silhouette",
  "spawn-support",
  "topology",
] as const satisfies readonly WorldReconstructionDimensionIdV1[]);

const EVIDENCE_PROFILE_REF_BY_DIMENSION = Object.freeze({
  collider: "worldkit://evidence-profile/native-block-collider@1",
  "critical-traversal": "worldkit://evidence-profile/native-block-traversal@1",
  "deterministic-build": "worldkit://evidence-profile/native-block-determinism@1",
  "opening-composition": "worldkit://evidence-profile/native-block-opening@1",
  "semantic-silhouette": "worldkit://evidence-profile/native-block-silhouette@1",
  "spawn-support": "worldkit://evidence-profile/native-block-spawn@1",
  topology: "worldkit://evidence-profile/native-block-topology@1",
} as const);

const BASELINE_ENTRY_GROUND = Object.freeze({
  acceptanceTargetRef: "worldkit://acceptance-target/entry-ground@1",
  compositionTargetRef: "worldkit://composition-target/entry-ground@1",
  visualGroupId: "entry-ground-group",
  topologyNodeId: "entry-ground",
  semanticLayerId: "foreground",
  viewRequirements: Object.freeze([
    Object.freeze({ viewId: "opening" as const, mode: "not-required" as const }),
    Object.freeze({ viewId: "world-side" as const, mode: "presence-required" as const }),
    Object.freeze({ viewId: "world-top-down" as const, mode: "presence-required" as const }),
  ]),
});

const BASELINE_REMOTE_GROUND = Object.freeze({
  acceptanceTargetRef: "worldkit://acceptance-target/remote-ground@1",
  compositionTargetRef: "worldkit://composition-target/remote-ground@1",
  visualGroupId: "remote-ground-group",
  topologyNodeId: "remote-ground",
  semanticLayerId: "middle",
  viewRequirements: Object.freeze([
    Object.freeze({ viewId: "opening" as const, mode: "not-required" as const }),
    Object.freeze({ viewId: "world-side" as const, mode: "presence-required" as const }),
    Object.freeze({ viewId: "world-top-down" as const, mode: "presence-required" as const }),
  ]),
});

const NATIVE_PLANNER_SELF_CHECK_VERSION = "worldkit-planner-self-check-v4";
const SHA256_HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const PLANNER_IMAGE_MEASUREMENT_FIELDS = Object.freeze([
  "widthPixels",
  "heightPixels",
  "subjectMaskPixelCount",
  "subjectCenterXRatio",
  "subjectCenterErrorRatio",
  "maximumCenterErrorRatio",
] as const);
const NATIVE_ENTRY_IDENTITY_MEASUREMENT_FIELDS = Object.freeze([
  "widthPixels",
  "heightPixels",
  "aspectRatio",
  "aspectErrorRatio",
  "requiredAspectRatio",
  "maximumAspectErrorRatio",
  "maximumIdentityRgbDistance",
  "minimumIdentitySeparationRgbUnits",
  "ambiguousIdentityPixelCount",
  "candidateIdentityPixelCount",
  "ambiguousIdentityRatio",
  "maximumAmbiguousIdentityRatio",
  "targets",
] as const);
const NATIVE_ENTRY_IDENTITY_TARGET_MEASUREMENT_FIELDS = Object.freeze([
  "visualTargetId",
  "identityColorHex",
  "exclusivelyAdmittedPixelCount",
  "imageCoverageRatio",
  "componentCount",
  "coherentComponentCount",
  "coherentPixelCount",
  "coherentPixelRatio",
  "largestComponentPixelCount",
  "largestComponentImageCoverageRatio",
  "largestComponentBoundingBoxWidthPixels",
  "largestComponentBoundingBoxHeightPixels",
  "largestComponentBoundingBoxWidthRatio",
  "largestComponentBoundingBoxHeightRatio",
  "minimumPixelCount",
  "minimumCoherentComponentPixelCount",
  "minimumCoherentPixelRatio",
  "minimumLargestComponentPixelCount",
  "minimumLargestComponentImageCoverageRatio",
  "minimumLargestComponentBoundingBoxWidthRatio",
  "minimumLargestComponentBoundingBoxHeightRatio",
] as const);
const NATIVE_BLOCK_PALETTE_MEASUREMENTS_FIELDS = Object.freeze([
  "worldPlan",
  "entryWhiteboxTarget",
] as const);
const NATIVE_BLOCK_PALETTE_MEASUREMENT_FIELDS = Object.freeze([
  "widthPixels",
  "heightPixels",
  "aspectRatio",
  "matchedBlockPixelCount",
  "blockPaletteCoverageRatio",
  "traversablePixelCount",
  "interactivePixelCount",
  "blockPixelCountsBySemantic",
  "visualTargetPixelCounts",
] as const);
const NATIVE_BLOCK_PALETTE_SEMANTICS = Object.freeze([
  "walkable",
  "obstacle",
  "interactive-solid",
  "interactive-trigger",
  "water",
  "cloud-walkable",
  "cloud-passable",
  "visual-only",
  "landmark-red",
  "visual-target-2",
  "visual-target-3",
  "visual-target-4",
  "visual-target-5",
  "landmark-pink",
  "visual-target-1-subject",
] as const);

// The Planner gives generic ground no identity mask. Keep its bindings for
// presence/support/traversal, but never compare Host-invented screen bands as
// if they were reference-image truth in the default report-only profile.
const BASELINE_PRESENCE_ONLY_DRIFT_BASIS_POINTS = 10_000;
// Match the historical 0.005% per-target palette presence floor. A smaller or
// disconnected proposal is still a valid Planner success, but it is not a
// reliable pixel baseline and is omitted instead of receiving invented bounds.
const MINIMUM_RELIABLE_BASELINE_TARGET_IMAGE_COVERAGE_RATIO = 0.00005;

function sceneBriefSemanticHash(
  sceneBriefBytes: Uint8Array,
): Sha256HashV1 {
  const brief = parseSceneBriefV1(
    new TextDecoder().decode(sceneBriefBytes),
  );
  if (!brief.ok) {
    throw new TypeError("NATIVE_WORLD_SCENE_BRIEF_INVALID");
  }
  return brief.sceneBriefHash as Sha256HashV1;
}

function isBaselineGroundAcceptanceTargetRef(targetRef: string): boolean {
  return targetRef === BASELINE_ENTRY_GROUND.acceptanceTargetRef ||
    targetRef === BASELINE_REMOTE_GROUND.acceptanceTargetRef;
}

function isBaselineGroundCompositionTargetRef(targetRef: string): boolean {
  return targetRef === BASELINE_ENTRY_GROUND.compositionTargetRef ||
    targetRef === BASELINE_REMOTE_GROUND.compositionTargetRef;
}

interface NativeWorldBaselineVisualTargetV1 {
  readonly acceptanceTargetRef: string;
  readonly compositionTargetRef: string;
  readonly visualGroupId: string;
  readonly topologyNodeId: string;
  readonly semanticLayerId: "foreground" | "middle" | "remote";
  readonly viewRequirements: readonly (
    | Readonly<{
        viewId: "opening" | "world-side" | "world-top-down";
        mode: "not-required" | "presence-required";
      }>
    | Readonly<{
        viewId: "opening" | "world-side" | "world-top-down";
        mode: "reference-projection-required";
        normalizedBounds: Readonly<{
          minXBasisPoints: number;
          minYBasisPoints: number;
          maxXBasisPoints: number;
          maxYBasisPoints: number;
        }>;
        normalizedCenter: Readonly<{
          xBasisPoints: number;
          yBasisPoints: number;
        }>;
        coverageBasisPoints: number;
      }>
  )[];
}

function targetLayerFromCenterY(
  yBasisPoints: number,
): NativeWorldBaselineVisualTargetV1["semanticLayerId"] {
  if (yBasisPoints >= 6500) return "foreground";
  if (yBasisPoints <= 3500) return "remote";
  return "middle";
}

function targetViewRequirements(
  openingProjection?: Readonly<{
    normalizedBounds: Readonly<{
      minXBasisPoints: number;
      minYBasisPoints: number;
      maxXBasisPoints: number;
      maxYBasisPoints: number;
    }>;
    normalizedCenter: Readonly<{
      xBasisPoints: number;
      yBasisPoints: number;
    }>;
    coverageBasisPoints: number;
  }>,
): NativeWorldBaselineVisualTargetV1["viewRequirements"] {
  return Object.freeze([
    Object.freeze(openingProjection === undefined
      ? { viewId: "opening" as const, mode: "not-required" as const }
      : {
          viewId: "opening" as const,
          mode: "reference-projection-required" as const,
          ...openingProjection,
        }),
    Object.freeze({
      viewId: "world-side" as const,
      mode: "presence-required" as const,
    }),
    Object.freeze({
      viewId: "world-top-down" as const,
      mode: "presence-required" as const,
    }),
  ]);
}

async function measurePaletteTargets(
  imagePath: string,
  targets: readonly VisualIdentityPaletteTargetV1[],
): Promise<readonly NativeWorldBaselineVisualTargetV1[]> {
  const { data, info } = await sharp(imagePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const analysis = analyzeNativeEntryIdentityImageV4({
    width: info.width,
    height: info.height,
    channels: info.channels,
    pixels: data,
  }, targets.length);
  const measuredTargets = analysis.measurement.targets;
  if (
    measuredTargets.length !== targets.length ||
    targets.some((target, index) =>
      target.id !== measuredTargets[index]!.visualTargetId ||
      target.identityColor !== measuredTargets[index]!.identityColorHex
    )
  ) {
    throw new TypeError("NATIVE_WORLD_BASELINE_PALETTE_INVALID");
  }
  const landmarkTargets: NativeWorldBaselineVisualTargetV1[] = [];
  for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
    const target = targets[targetIndex]!;
    let minimumX = info.width;
    let minimumY = info.height;
    let maximumX = -1;
    let maximumY = -1;
    let pixelCount = 0;
    const admittedTarget = targetIndex + 1;
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const pixelIndex = y * info.width + x;
        if (analysis.admittedTargetByPixel[pixelIndex] !== admittedTarget) {
          continue;
        }
        minimumX = Math.min(minimumX, x);
        minimumY = Math.min(minimumY, y);
        maximumX = Math.max(maximumX, x);
        maximumY = Math.max(maximumY, y);
        pixelCount += 1;
      }
    }
    if (target.targetKind === "subject") {
      if (pixelCount === 0) {
        throw new TypeError(
          `NATIVE_WORLD_BASELINE_TARGET_MASK_MISSING:${target.id}`,
        );
      }
      continue;
    }
    const minimumReliableComponentPixelCount = Math.max(
      32,
      Math.round(
        info.width * info.height *
          MINIMUM_RELIABLE_BASELINE_TARGET_IMAGE_COVERAGE_RATIO,
      ),
    );
    const measuredTarget = measuredTargets[targetIndex]!;
    if (
      pixelCount === 0 ||
      measuredTarget.largestComponentPixelCount <
        minimumReliableComponentPixelCount
    ) {
      landmarkTargets.push(Object.freeze({
        acceptanceTargetRef: `worldkit://acceptance-target/${target.id}@1`,
        compositionTargetRef: `worldkit://composition-target/${target.id}@1`,
        visualGroupId: `${target.id}-group`,
        topologyNodeId: target.id,
        semanticLayerId: "middle",
        viewRequirements: targetViewRequirements(),
      }));
      continue;
    }
    if (pixelCount !== measuredTarget.exclusivelyAdmittedPixelCount) {
      throw new TypeError(
        "NATIVE_WORLD_BASELINE_PALETTE_INVALID",
      );
    }
    const normalizedBounds = Object.freeze({
      minXBasisPoints: Math.floor(minimumX * 10000 / info.width),
      minYBasisPoints: Math.floor(minimumY * 10000 / info.height),
      maxXBasisPoints: Math.ceil((maximumX + 1) * 10000 / info.width),
      maxYBasisPoints: Math.ceil((maximumY + 1) * 10000 / info.height),
    });
    const normalizedCenter = Object.freeze({
      xBasisPoints: Math.round(
        (normalizedBounds.minXBasisPoints + normalizedBounds.maxXBasisPoints) /
          2,
      ),
      yBasisPoints: Math.round(
        (normalizedBounds.minYBasisPoints + normalizedBounds.maxYBasisPoints) /
          2,
      ),
    });
    landmarkTargets.push(Object.freeze({
      acceptanceTargetRef: `worldkit://acceptance-target/${target.id}@1`,
      compositionTargetRef: `worldkit://composition-target/${target.id}@1`,
      visualGroupId: `${target.id}-group`,
      topologyNodeId: target.id,
      semanticLayerId: targetLayerFromCenterY(normalizedCenter.yBasisPoints),
      viewRequirements: targetViewRequirements({
        normalizedBounds,
        normalizedCenter,
        coverageBasisPoints: Math.max(
          1,
          Math.round(pixelCount * 10000 / (info.width * info.height)),
        ),
      }),
    }));
  }
  return Object.freeze(landmarkTargets);
}

/**
 * Derives the deliberately small report-only Case that replaces the former
 * model-authored Native Case Mapping stage. The Host freezes evidence policy;
 * the Builder owns actual geometry and exploration intent, not a template route.
 */
export async function deriveNativeWorldBaselineProposalV1(input: Readonly<{
  sceneId: string;
  sceneBriefSemanticHash: Sha256HashV1;
  visualIdentityPalettePath: string;
  entryWhiteboxTargetPath: string;
}>): Promise<unknown> {
  const palette = parseVisualIdentityPaletteV1(
    JSON.parse(await readFile(input.visualIdentityPalettePath, "utf8")),
    {
      sceneSourceKind: "babylon-native",
      sceneId: input.sceneId,
      sceneBriefHash: input.sceneBriefSemanticHash,
    },
  ).targets;
  const landmarkTargets = await measurePaletteTargets(
    input.entryWhiteboxTargetPath,
    palette,
  );
  const visualTargets = sortBy([
    BASELINE_ENTRY_GROUND,
    BASELINE_REMOTE_GROUND,
    ...landmarkTargets,
  ], ({ acceptanceTargetRef }) => acceptanceTargetRef);
  const openingTargets = visualTargets.flatMap((target) => {
    const requirement = target.viewRequirements[0]!;
    return requirement.mode === "reference-projection-required"
      ? [Object.freeze({ target, requirement })]
      : [];
  });
  const targetRefs = sortBy(openingTargets.map(({ target }) =>
    target.compositionTargetRef));
  const semanticLayerIds = sortBy([
    ...new Set(visualTargets.map(({ semanticLayerId }) => semanticLayerId)),
  ]);
  const orderedTargetRefs = sortBy(openingTargets, ({ requirement }) =>
    -requirement.normalizedCenter.yBasisPoints)
    .map(({ target }) => target.compositionTargetRef);
  const entryAcceptanceTargetRef = BASELINE_ENTRY_GROUND.acceptanceTargetRef;
  const remoteAcceptanceTargetRef = BASELINE_REMOTE_GROUND.acceptanceTargetRef;
  const expected = Object.freeze({
    topology: Object.freeze({
      acceptanceTargetRef: remoteAcceptanceTargetRef,
      nodeIds: sortBy(visualTargets.map(({ topologyNodeId }) => topologyNodeId)),
      relations: Object.freeze([]),
      layerIds: Object.freeze(semanticLayerIds),
    }),
    semanticSilhouetteTargets: Object.freeze(visualTargets.map((target) =>
      Object.freeze({
        acceptanceTargetRef: target.acceptanceTargetRef,
        visualGroupId: target.visualGroupId,
        viewRequirements: target.viewRequirements,
      }))),
    openingComposition: Object.freeze({
      acceptanceTargetRef: remoteAcceptanceTargetRef,
      targetRefs: Object.freeze(targetRefs),
      regions: Object.freeze(sortBy(openingTargets.map(({ target, requirement }) => Object.freeze({
        targetRef: target.compositionTargetRef,
        normalizedBounds: requirement.normalizedBounds,
      })), ({ targetRef }) => targetRef)),
      anchors: Object.freeze(sortBy(openingTargets.map(({ target, requirement }) => Object.freeze({
        targetRef: target.compositionTargetRef,
        normalizedCenter: requirement.normalizedCenter,
      })), ({ targetRef }) => targetRef)),
      orderedTargetRefs: Object.freeze(orderedTargetRefs),
    }),
    spawnSupport: Object.freeze({
      acceptanceTargetRef: entryAcceptanceTargetRef,
      spawnMarkerId: "entry-spawn",
      supportColliderId: "collider-entry-ground",
      expectedMedium: "ground" as const,
      expectedPositionXYZMeters: Object.freeze({
        xMeters: 0,
        yMeters: 0,
        zMeters: 0,
      }),
    }),
    colliders: Object.freeze(sortBy([
      Object.freeze({
        acceptanceTargetRef: entryAcceptanceTargetRef,
        contributionId: "collider-entry-ground",
        colliderId: "collider-entry-ground",
        role: "ground" as const,
        requiresOverlay: true,
      }),
      Object.freeze({
        acceptanceTargetRef: remoteAcceptanceTargetRef,
        contributionId: "collider-remote-ground",
        colliderId: "collider-remote-ground",
        role: "ground" as const,
        requiresOverlay: true,
      }),
      ...landmarkTargets.map((target) => {
        const colliderId = `collider-${target.topologyNodeId}-solid`;
        return Object.freeze({
          acceptanceTargetRef: target.acceptanceTargetRef,
          contributionId: colliderId,
          colliderId,
          role: "blocker" as const,
          requiresOverlay: true,
        });
      }),
    ], ({ contributionId }) => contributionId)),
    groundConnectivity: Object.freeze({
      mode: "source-authored" as const,
      requireSingleReachableComponent: true,
      requiredTraversalBands: Object.freeze([]),
    }),
    criticalTraversalChecks: Object.freeze([]),
    deterministicBuild: Object.freeze({
      acceptanceTargetRef: remoteAcceptanceTargetRef,
      requiresCandidateReplay: true as const,
      requiresWorldPackageIdentityAgreement: true as const,
      requiresBuildIdentityAgreement: true as const,
      requiresCaptureIdentityAgreement: true as const,
    }),
  });
  return Object.freeze({
    kind: "native-world-case-proposal",
    schemaVersion: 1,
    sceneId: input.sceneId,
    expected,
    formalCaptureIntent: Object.freeze({
      kind: "formal-world-capture-intent",
      schemaVersion: 1,
      id: `${input.sceneId}.formal-world-capture-intent`,
      captureProfile: Object.freeze({
        widthPixels: 1280,
        heightPixels: 720,
        devicePixelRatio: 1,
      }),
      semanticCaptureTargetBindings: Object.freeze(visualTargets.map((target) =>
        Object.freeze({
          acceptanceTargetRef: target.acceptanceTargetRef,
          compositionTargetRef: target.compositionTargetRef,
          topologyNodeId: target.topologyNodeId,
          semanticLayerId: target.semanticLayerId,
          blockVisualGroupId: target.visualGroupId,
        }))),
      topologyRelations: Object.freeze([]),
      checkpointSpatialCriteria: Object.freeze([]),
    }),
    worldBoundsPolicy: Object.freeze({ mode: "checked-block-layout" }),
  });
}

function record(value: unknown, fields: readonly string[], code: string) {
  if (isNil(value) || typeof value !== "object" || Array.isArray(value) ||
    Reflect.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(code);
  }
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input);
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) {
    throw new TypeError(code);
  }
  return input;
}

function finiteNumberField(
  input: Record<string, unknown>,
  field: string,
  code: string,
): number {
  const value = input[field];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError(code);
  }
  return value;
}

function nonNegativeIntegerField(
  input: Record<string, unknown>,
  field: string,
  code: string,
): number {
  const value = finiteNumberField(input, field, code);
  if (!Number.isInteger(value)) throw new TypeError(code);
  return value;
}

function parsePassedNativePlannerSelfCheckV4(input: Readonly<{
  value: unknown;
  sceneId: string;
  sceneBriefHash: Sha256HashV1;
  worldPlanHash: Sha256HashV1;
  entryWhiteboxTargetHash: Sha256HashV1;
}>): unknown {
  const code = "NATIVE_WORLD_PLANNER_RECEIPT_INVALID";
  const report = record(input.value, [
    "kind",
    "schemaVersion",
    "validatorVersion",
    "sceneId",
    "sceneSourceKind",
    "status",
    "inputs",
    "imageMeasurements",
    "nativeBlockPaletteMeasurements",
    "nativeEntryIdentityMeasurements",
    "diagnostics",
  ], code);
  if (
    report.kind !== "worldkit-planner-self-check" ||
    report.schemaVersion !== 1 ||
    report.validatorVersion !== NATIVE_PLANNER_SELF_CHECK_VERSION ||
    report.sceneId !== input.sceneId ||
    report.sceneSourceKind !== "babylon-native" ||
    report.status !== "passed"
  ) {
    throw new TypeError(code);
  }
  const inputs = record(report.inputs, [
    "sceneBriefHash",
    "worldPlanHash",
    "entryWhiteboxTargetHash",
  ], code);
  for (const value of Object.values(inputs)) {
    if (typeof value !== "string" || !SHA256_HASH_PATTERN.test(value)) {
      throw new TypeError(code);
    }
  }
  if (
    inputs.sceneBriefHash !== input.sceneBriefHash ||
    inputs.worldPlanHash !== input.worldPlanHash ||
    inputs.entryWhiteboxTargetHash !== input.entryWhiteboxTargetHash
  ) {
    throw new TypeError("NATIVE_WORLD_PLANNER_RECEIPT_INPUT_MISMATCH");
  }
  const image = record(
    report.imageMeasurements,
    PLANNER_IMAGE_MEASUREMENT_FIELDS,
    code,
  );
  const nativeEntry = record(
    report.nativeEntryIdentityMeasurements,
    NATIVE_ENTRY_IDENTITY_MEASUREMENT_FIELDS,
    code,
  );
  const nativePalettes = record(
    report.nativeBlockPaletteMeasurements,
    NATIVE_BLOCK_PALETTE_MEASUREMENTS_FIELDS,
    code,
  );
  const worldPlanPalette = record(
    nativePalettes.worldPlan,
    NATIVE_BLOCK_PALETTE_MEASUREMENT_FIELDS,
    code,
  );
  const entryPalette = record(
    nativePalettes.entryWhiteboxTarget,
    NATIVE_BLOCK_PALETTE_MEASUREMENT_FIELDS,
    code,
  );
  for (const field of PLANNER_IMAGE_MEASUREMENT_FIELDS) {
    if (field.endsWith("Pixels") || field.endsWith("PixelCount")) {
      nonNegativeIntegerField(image, field, code);
    } else {
      finiteNumberField(image, field, code);
    }
  }
  for (const field of NATIVE_ENTRY_IDENTITY_MEASUREMENT_FIELDS) {
    if (field === "targets") continue;
    if (field.endsWith("Pixels") || field.endsWith("PixelCount")) {
      nonNegativeIntegerField(nativeEntry, field, code);
    } else {
      finiteNumberField(nativeEntry, field, code);
    }
  }
  for (const palette of [worldPlanPalette, entryPalette]) {
    for (const field of NATIVE_BLOCK_PALETTE_MEASUREMENT_FIELDS) {
      if (field === "blockPixelCountsBySemantic" ||
        field === "visualTargetPixelCounts") continue;
      if (field.endsWith("Pixels") || field.endsWith("PixelCount")) {
        nonNegativeIntegerField(palette, field, code);
      } else {
        finiteNumberField(palette, field, code);
      }
    }
    const counts = record(
      palette.blockPixelCountsBySemantic,
      NATIVE_BLOCK_PALETTE_SEMANTICS,
      code,
    );
    for (const semantic of NATIVE_BLOCK_PALETTE_SEMANTICS) {
      nonNegativeIntegerField(counts, semantic, code);
    }
    if (!Array.isArray(palette.visualTargetPixelCounts) ||
      palette.visualTargetPixelCounts.length !== 5) {
      throw new TypeError(code);
    }
    for (const count of palette.visualTargetPixelCounts) {
      if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
        throw new TypeError(code);
      }
    }
    const widthPixels = nonNegativeIntegerField(
      palette,
      "widthPixels",
      code,
    );
    const heightPixels = nonNegativeIntegerField(
      palette,
      "heightPixels",
      code,
    );
    const aspectRatio = finiteNumberField(palette, "aspectRatio", code);
    const matchedBlockPixelCount = nonNegativeIntegerField(
      palette,
      "matchedBlockPixelCount",
      code,
    );
    const blockPaletteCoverageRatio = finiteNumberField(
      palette,
      "blockPaletteCoverageRatio",
      code,
    );
    if (
      aspectRatio !== widthPixels / heightPixels ||
      blockPaletteCoverageRatio !== matchedBlockPixelCount /
        (widthPixels * heightPixels)
    ) {
      throw new TypeError(code);
    }
  }
  if (
    image.widthPixels !== nativeEntry.widthPixels ||
    image.heightPixels !== nativeEntry.heightPixels ||
    image.widthPixels !== entryPalette.widthPixels ||
    image.heightPixels !== entryPalette.heightPixels ||
    image.maximumCenterErrorRatio !== 0.015 ||
    nativeEntry.requiredAspectRatio !== 16 / 9 ||
    nativeEntry.maximumAspectErrorRatio !== 0.02 ||
    nativeEntry.maximumIdentityRgbDistance !== 40 ||
    nativeEntry.minimumIdentitySeparationRgbUnits !== 12 ||
    nativeEntry.maximumAmbiguousIdentityRatio !== 0.05
  ) {
    throw new TypeError(code);
  }
  if (!Array.isArray(nativeEntry.targets) || nativeEntry.targets.length === 0) {
    throw new TypeError(code);
  }
  const targetIds = new Set<string>();
  for (const value of nativeEntry.targets) {
    const target = record(
      value,
      NATIVE_ENTRY_IDENTITY_TARGET_MEASUREMENT_FIELDS,
      code,
    );
    if (
      typeof target.visualTargetId !== "string" ||
      !/^visual-target-[1-5]$/.test(target.visualTargetId) ||
      targetIds.has(target.visualTargetId) ||
      typeof target.identityColorHex !== "string" ||
      !/^#[0-9A-F]{6}$/.test(target.identityColorHex)
    ) {
      throw new TypeError(code);
    }
    targetIds.add(target.visualTargetId);
    for (const field of NATIVE_ENTRY_IDENTITY_TARGET_MEASUREMENT_FIELDS) {
      if (field === "visualTargetId" || field === "identityColorHex") continue;
      if (
        field.endsWith("Pixels") || field.endsWith("PixelCount") ||
        field === "componentCount" || field === "coherentComponentCount"
      ) {
        nonNegativeIntegerField(target, field, code);
      } else {
        finiteNumberField(target, field, code);
      }
    }
    if (
      target.minimumCoherentPixelRatio !== 0.75 ||
      target.minimumLargestComponentImageCoverageRatio !== 0.001 ||
      target.minimumLargestComponentBoundingBoxWidthRatio !== 0.02 ||
      target.minimumLargestComponentBoundingBoxHeightRatio !== 0.04
    ) {
      throw new TypeError(code);
    }
  }
  if (!Array.isArray(report.diagnostics) || report.diagnostics.length !== 0) {
    throw new TypeError(code);
  }
  return report;
}

async function readClosedPlannerInput(
  inputRoot: string,
  relativePath: string,
): Promise<Uint8Array> {
  if (
    path.isAbsolute(relativePath) ||
    relativePath === "" ||
    relativePath === "." ||
    relativePath === ".." ||
    relativePath.includes("/") ||
    relativePath.includes("\\")
  ) {
    throw new TypeError("NATIVE_WORLD_PLANNER_INPUT_CLOSURE_INVALID");
  }
  const root = path.resolve(inputRoot);
  const filePath = path.join(root, relativePath);
  const realRoot = await realpath(root);
  let metadata;
  try {
    metadata = await lstat(filePath);
  } catch {
    throw new TypeError("NATIVE_WORLD_PLANNER_INPUT_CLOSURE_INVALID");
  }
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    await realpath(filePath) !== path.join(realRoot, relativePath)
  ) {
    throw new TypeError("NATIVE_WORLD_PLANNER_INPUT_CLOSURE_INVALID");
  }
  return readFile(filePath);
}

export const NATIVE_WORLD_PLANNER_REFERENCE_INPUTS_V1 = Object.freeze([
  { inputRef: "entry-whitebox-target.png", mediaType: "image/png" },
  { inputRef: "planner-self-check.json", mediaType: "application/json" },
  { inputRef: "visual-identity-palette.json", mediaType: "application/json" },
  { inputRef: "world-plan.png", mediaType: "image/png" },
] as const);

export async function validateNativeWorldPlannerInputClosureV1(
  input: Readonly<{
    reconstructionCase: unknown;
    inputDirectoryPath: string;
  }>,
): Promise<void> {
  const reconstructionCase = parseWorldReconstructionCaseV1(
    input.reconstructionCase,
  );
  if (reconstructionCase.sceneBriefRef !== "scene-brief.md") {
    throw new TypeError("NATIVE_WORLD_PLANNER_INPUT_CLOSURE_INVALID");
  }
  const jsonRows = reconstructionCase.referenceInputs.filter(
    ({ mediaType }) => mediaType === "application/json",
  );
  const rows = NATIVE_WORLD_PLANNER_REFERENCE_INPUTS_V1.map(({ inputRef, mediaType }) => {
    const matches = reconstructionCase.referenceInputs.filter((row) =>
      row.inputRef === inputRef && row.mediaType === mediaType
    );
    if (matches.length !== 1) {
      throw new TypeError("NATIVE_WORLD_PLANNER_INPUT_CLOSURE_INVALID");
    }
    return matches[0]!;
  });
  if (
    jsonRows.length !== 2 ||
    jsonRows[0]!.inputRef !== "planner-self-check.json" ||
    jsonRows[1]!.inputRef !== "visual-identity-palette.json"
  ) {
    throw new TypeError("NATIVE_WORLD_PLANNER_INPUT_CLOSURE_INVALID");
  }
  const [
    sceneBriefBytes,
    entryBytes,
    plannerReceiptBytes,
    visualIdentityPaletteBytes,
    worldPlanBytes,
  ] =
    await Promise.all([
      readClosedPlannerInput(
        input.inputDirectoryPath,
        reconstructionCase.sceneBriefRef,
      ),
      readClosedPlannerInput(input.inputDirectoryPath, rows[0]!.inputRef),
      readClosedPlannerInput(input.inputDirectoryPath, rows[1]!.inputRef),
      readClosedPlannerInput(input.inputDirectoryPath, rows[2]!.inputRef),
      readClosedPlannerInput(input.inputDirectoryPath, rows[3]!.inputRef),
    ]);
  if (
    sha256Bytes(sceneBriefBytes) !== reconstructionCase.sceneBriefHash ||
    sha256Bytes(entryBytes) !== rows[0]!.contentHash ||
    sha256Bytes(plannerReceiptBytes) !== rows[1]!.contentHash ||
    sha256Bytes(visualIdentityPaletteBytes) !== rows[2]!.contentHash ||
    sha256Bytes(worldPlanBytes) !== rows[3]!.contentHash
  ) {
    throw new TypeError("NATIVE_WORLD_PLANNER_INPUT_CLOSURE_INVALID");
  }
  let plannerReceiptValue: unknown;
  try {
    plannerReceiptValue = JSON.parse(
      new TextDecoder().decode(plannerReceiptBytes),
    );
  } catch {
    throw new TypeError("NATIVE_WORLD_PLANNER_RECEIPT_INVALID");
  }
  let visualIdentityPaletteValue: unknown;
  try {
    visualIdentityPaletteValue = JSON.parse(
      new TextDecoder().decode(visualIdentityPaletteBytes),
    );
  } catch {
    throw new TypeError("NATIVE_WORLD_BASELINE_PALETTE_INVALID");
  }
  parseVisualIdentityPaletteV1(
    visualIdentityPaletteValue,
    {
      sceneSourceKind: "babylon-native",
      sceneId: reconstructionCase.id,
      sceneBriefHash: sceneBriefSemanticHash(sceneBriefBytes),
    },
  );
  parsePassedNativePlannerSelfCheckV4({
    value: plannerReceiptValue,
    sceneId: reconstructionCase.id,
    sceneBriefHash: reconstructionCase.sceneBriefHash,
    worldPlanHash: rows[3]!.contentHash,
    entryWhiteboxTargetHash: rows[0]!.contentHash,
  });
}

function parseNativeWorldCaseWorldBoundsPolicyV1(value: unknown) {
  try {
    return parseNativeSceneWorldBoundsPolicyV1(value);
  } catch (error) {
    const receivedFields = isNil(value) || typeof value !== "object" ||
        Array.isArray(value) || Reflect.getPrototypeOf(value) !== Object.prototype
      ? "<non-record>"
      : sortBy(Object.keys(value as Record<string, unknown>)).join(", ") ||
        "<none>";
    throw new TypeError(
      "NATIVE_WORLD_CASE_WORLD_BOUNDS_POLICY_INVALID: expected " +
        "mode checked-block-layout or fixed with WorldPackage worldBounds; received " +
        receivedFields,
      { cause: error },
    );
  }
}

async function writeCanonicalExclusive(filePath: string, value: unknown) {
  await writeFile(filePath, stringifyCanonicalJson(value), {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

export interface PreparedNativeWorldCaseV1 {
  readonly casePath: string;
  readonly evaluationProfilePath: string;
  readonly formalCaptureIntentPath: string;
}

export interface FrozenNativeWorldReferenceInputV1 {
  readonly inputRef: string;
  readonly contentHash: Sha256HashV1;
  readonly mediaType: "image/png" | "image/jpeg" | "image/webp";
  readonly bytes: Uint8Array;
}

export async function prepareNativeWorldCaseV1(input: Readonly<{
  repositoryRoot: string;
  sceneId: string;
  proposalPath: string;
  sceneBriefPath: string;
  uploadedReferenceInputs: readonly FrozenNativeWorldReferenceInputV1[];
  planningImagePaths: Readonly<{
    worldPlanPath: string;
    entryWhiteboxTargetPath: string;
  }>;
  visualIdentityPalettePath: string;
  plannerSelfCheckPath: string;
  outputCaseRoot: string;
}>): Promise<PreparedNativeWorldCaseV1> {
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(input.sceneId)) {
    throw new TypeError("NATIVE_WORLD_CASE_SCENE_ID_INVALID");
  }
  const proposal = record(
    JSON.parse(await readFile(input.proposalPath, "utf8")),
    ["kind", "schemaVersion", "sceneId", "expected", "formalCaptureIntent", "worldBoundsPolicy"],
    "NATIVE_WORLD_CASE_PROPOSAL_INVALID",
  );
  if (proposal.kind !== "native-world-case-proposal" ||
    proposal.schemaVersion !== 1 || proposal.sceneId !== input.sceneId) {
    throw new TypeError("NATIVE_WORLD_CASE_PROPOSAL_INVALID");
  }
  const formalCaptureIntent = parseFormalWorldCaptureIntentV1(
    proposal.formalCaptureIntent,
  );
  if (formalCaptureIntent.id !==
    `${input.sceneId}.formal-world-capture-intent`) {
    throw new TypeError("NATIVE_WORLD_CAPTURE_INTENT_IDENTITY_INVALID");
  }
  const worldBoundsPolicy = parseNativeWorldCaseWorldBoundsPolicyV1(proposal.worldBoundsPolicy);
  const briefBytes = await readFile(input.sceneBriefPath);
  const sceneBriefHash = sha256Bytes(briefBytes) as Sha256HashV1;
  const sceneBriefIdentityHash = sceneBriefSemanticHash(briefBytes);
  const visualIdentityPaletteBytes = await readFile(
    input.visualIdentityPalettePath,
  );
  let visualIdentityPaletteValue: unknown;
  try {
    visualIdentityPaletteValue = JSON.parse(
      visualIdentityPaletteBytes.toString("utf8"),
    );
  } catch {
    throw new TypeError("NATIVE_WORLD_BASELINE_PALETTE_INVALID");
  }
  parseVisualIdentityPaletteV1(
    visualIdentityPaletteValue,
    {
      sceneSourceKind: "babylon-native",
      sceneId: input.sceneId,
      sceneBriefHash: sceneBriefIdentityHash,
    },
  );

  const acceptanceTargetRefs = sortBy([...new Set([
    (proposal.expected as { topology?: { acceptanceTargetRef?: unknown } })
      .topology?.acceptanceTargetRef,
    ...((proposal.expected as { semanticSilhouetteTargets?: unknown[] })
      .semanticSilhouetteTargets ?? []).map((value) =>
        (value as { acceptanceTargetRef?: unknown }).acceptanceTargetRef
      ),
    (proposal.expected as { openingComposition?: { acceptanceTargetRef?: unknown } })
      .openingComposition?.acceptanceTargetRef,
    (proposal.expected as { spawnSupport?: { acceptanceTargetRef?: unknown } })
      .spawnSupport?.acceptanceTargetRef,
    ...((proposal.expected as { colliders?: unknown[] }).colliders ?? []).map(
      (value) => (value as { acceptanceTargetRef?: unknown }).acceptanceTargetRef,
    ),
    ...((proposal.expected as { criticalTraversalChecks?: unknown[] })
      .criticalTraversalChecks ?? []).map((value) =>
        (value as { acceptanceTargetRef?: unknown }).acceptanceTargetRef
      ),
    ...((proposal.expected as {
      groundConnectivity?: {
        requiredTraversalBands?: unknown[];
      };
    }).groundConnectivity?.requiredTraversalBands ?? []).map((value) =>
      (value as { acceptanceTargetRef?: unknown }).acceptanceTargetRef
    ),
    (proposal.expected as { deterministicBuild?: { acceptanceTargetRef?: unknown } })
      .deterministicBuild?.acceptanceTargetRef,
  ].filter((value): value is string => typeof value === "string"))]);

  const silhouetteTargets = (proposal.expected as {
    semanticSilhouetteTargets?: readonly Readonly<{
      acceptanceTargetRef: string;
    }>[];
  }).semanticSilhouetteTargets ?? [];
  const opening = (proposal.expected as {
    openingComposition?: Readonly<{
      regions: readonly Readonly<{ targetRef: string }>[];
      anchors: readonly Readonly<{ targetRef: string }>[];
    }>;
  }).openingComposition;
  if (silhouetteTargets.length === 0 || opening === undefined) {
    throw new TypeError("NATIVE_WORLD_CASE_PROPOSAL_INVALID");
  }
  const evaluationProfile = parseWorldReconstructionEvaluationProfileV1({
    kind: "world-reconstruction-evaluation-profile",
    schemaVersion: 1,
    id: `${input.sceneId}-profile`,
    dimensionIds: DIMENSION_IDS,
    qualityGateMode: "report-only",
    maximumRepairAttemptCount: 3,
    builderSelfRepairAttemptCount: 3,
    thresholds: {
      semanticSilhouetteTargets: silhouetteTargets.map(({ acceptanceTargetRef }) => ({
        acceptanceTargetRef,
        maximumBoundsDriftBasisPoints:
          isBaselineGroundAcceptanceTargetRef(acceptanceTargetRef)
            ? BASELINE_PRESENCE_ONLY_DRIFT_BASIS_POINTS
            : 1600,
        maximumCenterDriftBasisPoints:
          isBaselineGroundAcceptanceTargetRef(acceptanceTargetRef)
            ? BASELINE_PRESENCE_ONLY_DRIFT_BASIS_POINTS
            : 1000,
        maximumCoverageDriftBasisPoints:
          isBaselineGroundAcceptanceTargetRef(acceptanceTargetRef)
            ? BASELINE_PRESENCE_ONLY_DRIFT_BASIS_POINTS
            : 1800,
      })),
      openingComposition: {
        regions: opening.regions.map(({ targetRef }) => ({
          targetRef,
          maximumDriftBasisPoints:
            isBaselineGroundCompositionTargetRef(targetRef)
              ? BASELINE_PRESENCE_ONLY_DRIFT_BASIS_POINTS
              : 1600,
        })),
        anchors: opening.anchors.map(({ targetRef }) => ({
          targetRef,
          maximumDriftBasisPoints:
            isBaselineGroundCompositionTargetRef(targetRef)
              ? BASELINE_PRESENCE_ONLY_DRIFT_BASIS_POINTS
              : 1000,
        })),
      },
      spawnSupport: {
        maximumPositionDriftMillimeters: 250,
        maximumSupportGapMillimeters: 50,
      },
    },
    requiredEvidenceByDimension: DIMENSION_IDS.map((dimensionId) => ({
      dimensionId,
      evidenceProfileRefs: [EVIDENCE_PROFILE_REF_BY_DIMENSION[dimensionId]],
    })),
  });
  const uploadedReferenceInputs = await Promise.all(input.uploadedReferenceInputs.map(
    async (reference, index) => {
      if (
        reference.mediaType !== "image/png" &&
        reference.mediaType !== "image/jpeg" && reference.mediaType !== "image/webp"
      ) {
        throw new TypeError("NATIVE_WORLD_REFERENCE_INPUT_IDENTITY_MISMATCH");
      }
      const expectedInputRef = nativeWorldReferenceInputRefV1(index, reference.mediaType);
      if (
        !(reference.bytes instanceof Uint8Array) ||
        reference.inputRef !== expectedInputRef ||
        sha256Bytes(reference.bytes) !== reference.contentHash
      ) {
        throw new TypeError("NATIVE_WORLD_REFERENCE_INPUT_IDENTITY_MISMATCH");
      }
      const bytes = new Uint8Array(reference.bytes);
      await validateNativeWorldReferenceImageV1(bytes, reference.mediaType);
      return Object.freeze({
        bytes,
        row: Object.freeze({
          inputRef: reference.inputRef,
          contentHash: reference.contentHash,
          mediaType: reference.mediaType,
        }),
      });
    },
  ));
  const planningReferenceInputs = await Promise.all([{
    sourcePath: input.planningImagePaths.entryWhiteboxTargetPath,
    inputRef: "entry-whitebox-target.png",
  }, {
    sourcePath: input.planningImagePaths.worldPlanPath,
    inputRef: "world-plan.png",
  }].map(async ({ sourcePath, inputRef }) => {
    if (nativeWorldReferenceMediaTypeV1(sourcePath) !== "image/png") {
      throw new TypeError("NATIVE_WORLD_PLANNING_IMAGE_MEDIA_TYPE_INVALID");
    }
    const bytes = await readFile(sourcePath);
    return Object.freeze({
      bytes,
      row: Object.freeze({
        inputRef,
        contentHash: sha256Bytes(bytes) as Sha256HashV1,
        mediaType: "image/png" as const,
      }),
    });
  }));
  const plannerSelfCheckBytes = await readFile(input.plannerSelfCheckPath);
  let plannerSelfCheckValue: unknown;
  try {
    plannerSelfCheckValue = JSON.parse(plannerSelfCheckBytes.toString("utf8"));
  } catch {
    throw new TypeError("NATIVE_WORLD_PLANNER_RECEIPT_INVALID");
  }
  parsePassedNativePlannerSelfCheckV4({
    value: plannerSelfCheckValue,
    sceneId: input.sceneId,
    sceneBriefHash,
    worldPlanHash: planningReferenceInputs.find(
      ({ row }) => row.inputRef === "world-plan.png",
    )!.row.contentHash,
    entryWhiteboxTargetHash: planningReferenceInputs.find(
      ({ row }) => row.inputRef === "entry-whitebox-target.png",
    )!.row.contentHash,
  });
  const plannerSelfCheckInput = Object.freeze({
    bytes: plannerSelfCheckBytes,
    row: Object.freeze({
      inputRef: "planner-self-check.json",
      contentHash: sha256Bytes(plannerSelfCheckBytes) as Sha256HashV1,
      mediaType: "application/json" as const,
    }),
  });
  const visualIdentityPaletteInput = Object.freeze({
    bytes: visualIdentityPaletteBytes,
    row: Object.freeze({
      inputRef: "visual-identity-palette.json",
      contentHash: sha256Bytes(visualIdentityPaletteBytes) as Sha256HashV1,
      mediaType: "application/json" as const,
    }),
  });
  const referenceInputs = sortBy(
    [
      ...uploadedReferenceInputs,
      ...planningReferenceInputs,
      plannerSelfCheckInput,
      visualIdentityPaletteInput,
    ],
    ({ row }) => row.inputRef,
  );
  const requiredEvidenceProfileRefs = sortBy(
    Object.values(EVIDENCE_PROFILE_REF_BY_DIMENSION),
  );
  const reconstructionCase = parseWorldReconstructionCaseV1({
    kind: "world-reconstruction-case",
    schemaVersion: 1,
    id: input.sceneId,
    sceneBriefRef: "scene-brief.md",
    sceneBriefHash,
    referenceInputs: referenceInputs.map(({ row }) => row),
    evaluationProfileRef: "evaluation-profile.json",
    evaluationProfileHash:
      hashWorldReconstructionEvaluationProfileV1(evaluationProfile),
    formalCaptureIntentRef: "inputs/formal-world-capture-intent.json",
    formalCaptureIntentHash: hashFormalWorldCaptureIntentV1(formalCaptureIntent),
    acceptanceTargetRefs,
    requiredEvidenceProfileRefs,
    expected: proposal.expected,
  });
  const mismatchedColliderIdentity = reconstructionCase.expected.colliders.find(
    ({ contributionId, colliderId }) => contributionId !== colliderId,
  );
  if (!isNil(mismatchedColliderIdentity)) {
    throw new TypeError(
      "NATIVE_WORLD_CASE_COLLIDER_IDENTITY_INVALID: Babylon Native static " +
        "Collider contributionId must equal colliderId; received " +
        `${mismatchedColliderIdentity.contributionId} and ` +
        mismatchedColliderIdentity.colliderId,
    );
  }

  const inputRoot = path.join(input.outputCaseRoot, "inputs");
  const skillRoot = path.join(inputRoot, "builder-skill");
  await Promise.all([
    mkdir(path.join(skillRoot, "references"), { recursive: true, mode: 0o700 }),
    mkdir(path.join(skillRoot, "scripts"), { recursive: true, mode: 0o700 }),
  ]);
  const casePath = path.join(input.outputCaseRoot, "case.json");
  const evaluationProfilePath = path.join(
    input.outputCaseRoot,
    "evaluation-profile.json",
  );
  const formalCaptureIntentPath = path.join(
    inputRoot,
    "formal-world-capture-intent.json",
  );
  const frozenInputFixtureRoot = path.join(
    input.repositoryRoot,
    "artifacts/scenes/cloud-temple-t-gate-native-block/inputs",
  );
  await Promise.all([
    writeCanonicalExclusive(casePath, reconstructionCase),
    writeCanonicalExclusive(evaluationProfilePath, evaluationProfile),
    writeCanonicalExclusive(formalCaptureIntentPath, formalCaptureIntent),
    writeCanonicalExclusive(path.join(inputRoot, "world-bounds-policy.json"), worldBoundsPolicy),
    writeFile(path.join(inputRoot, "scene-brief.md"), briefBytes, { flag: "wx" }),
    writeFile(
      path.join(input.outputCaseRoot, "planner-self-check.json"),
      plannerSelfCheckBytes,
      { flag: "wx", mode: 0o600 },
    ),
    writeFile(path.join(inputRoot, "task-instruction.md"), [
      "# Native Block generation request",
      "",
      "Read inputs/builder-skill/SKILL.md and its required inputs/builder-skill/references/native-block-output-contract.md completely before authoring. Use this frozen Skill copy as the complete Builder guide; do not search the parent checkout for another Skill.",
      "Build the complete playable world described by the frozen Scene Brief, visual-identity-palette.json, uploaded references, world-plan.png, entry-whitebox-target.png, and Host Bootstrap.",
      "Before detail, follow the Skill construction-and-budget inventory: allocate the actual Request budget across complete floor/support, terrain, landmarks and real connecting courses; do not reuse a remembered 2,000-Block cap or sacrifice major geography for ornament.",
      "The generic Case entry/remote checks are evidence anchors, not the world design. Preserve all significant reference/Brief formations, actual bridge and staircase courses, elevation changes, negative space and meaningful side/rear/remote continuation in both visual comparisons.",
      "Write exactly scene.ts, native-block-authoring.json, and native-resources.json as the Native Source, plus the two Host-declared advisory comparison PNGs under attempts/advisory/; write no other outputs.",
      "Write required openingCamera numeric intent in native-block-authoring.json using exactly mode: third-person, distanceMeters, targetHeightMeters, pitchRadians and fovDegrees. Start from the frozen Bootstrap values, tune in this same visual-feedback task within the selected Subject's third-person Profile ranges, and regenerate both comparisons after any edit. Never edit the frozen Bootstrap/WRT, select resource refs or create a Camera; Host alone admits the data and binds its Package identity.",
      "Run the frozen Builder self-check and visual-review renderer, actually open both comparison PNGs, and keep structural and visual repairs inside the one shared three-cycle Builder budget.",
      "Before finishing, run: node inputs/builder-skill/scripts/self-check.mjs --workspace . --case context/case.json --scene-brief inputs/scene-brief.md --visual-identity-palette inputs/visual-identity-palette.json",
      "After each passing structural check, run: node inputs/builder-skill/scripts/render-visual-review.mjs --workspace . --top-down-output attempts/advisory/builder-top-down-comparison.png --entry-output attempts/advisory/builder-entry-comparison.png",
      "Open both resulting PNGs with the image-viewing tool. Planner intent is on the left and current source projection on the right. Compare full-world geography, spawn, route bends and rises, landmarks and elevation in the top-down view; compare centered rear framing, landmark position/front/scale, depth order, stair/bridge rise, thickness and occlusion in the entry view. Target presence alone is not spatial alignment.",
      "If a comparison is materially wrong and repair budget remains, repair only the three Native Source files, rerun the structural check, regenerate both comparisons, and open both fresh images again. Fix the largest geographic mismatch before ornament: complete landmark position and front/course, footprint and scale, then depth order and occlusion.",
      "Use at most the frozen builderSelfRepairAttemptCount combined type/structural/visual source-repair cycles; never allocate another counter or external repair task. Finish after a fresh structural check passes and both latest comparisons have been visually reviewed. Rendering success or PNG hashes do not prove visual review, and the comparison is not an automatic similarity gate. Do not withhold otherwise valid declared outputs solely because visual differences remain when the shared budget is exhausted; disclose remaining differences in the normal final response without claiming perfect alignment or writing another report file.",
      "Derive advisory pixels only from scene.ts and frozen inputs; never author a review manifest or second geometry list.",
      "Implement every Case visual group and every explicit required Collider contribution exactly once.",
      "For every non-Subject target in visual-identity-palette.json, implement its one Case visual group and copy that target's exact semanticClassId and Native identityColor. A not-required Opening view does not authorize deleting the group or inventing Opening bounds.",
      "Never reconstruct the controlled Subject, rider, mount, avatar, character, or body parts as Native Block geometry; RuntimeHost creates the SDK Subject separately.",
      "Keep the Spawn supported. For case-defined ground policy preserve every fixed-input pass or block check without adding undeclared input; source-authored ground policy follows the Brief's actual course, not a generic strict diagnostic template.",
      "Read groundConnectivity.mode. For source-authored, declare required groundExploration middle/remote stand anchors and honest spawn-to-middle/Brief-required bands in native-block-authoring.json; Host Ground consumes these, not the generic fixed-input diagnostic course. For case-defined, write groundExploration: { mode: 'case-defined' } and preserve the frozen metric bands. Keep all intended explicitly contributed ground Spawn-reachable. Do not invent geometry for a source-authored Case's fixed-input diagnostic template.",
      "Do not create Runtime, physics, camera, input, timers, gameplay entities, Package, Capture, Receipt, or thresholds.",
      "Do not alter any frozen input. Formal Capture Intent remains Host-only.",
      "",
    ].join("\n"), { encoding: "utf8", flag: "wx" }),
    ...["native-scene-api.json", "native-scene-profile.json", "block-profile.json"]
      .map((fileName) => copyFile(
        path.join(frozenInputFixtureRoot, fileName),
        path.join(inputRoot, fileName),
        constants.COPYFILE_EXCL,
      )),
    copyFile(
      path.join(input.repositoryRoot, ".codex/skills/worldkit-native-block-builder/SKILL.md"),
      path.join(skillRoot, "SKILL.md"),
      constants.COPYFILE_EXCL,
    ),
    copyFile(
      path.join(input.repositoryRoot, ".codex/skills/worldkit-native-block-builder/references/native-block-output-contract.md"),
      path.join(skillRoot, "references/native-block-output-contract.md"),
      constants.COPYFILE_EXCL,
    ),
    copyFile(
      path.join(input.repositoryRoot, ".codex/skills/worldkit-native-block-builder/scripts/self-check.mjs"),
      path.join(skillRoot, "scripts/self-check.mjs"),
      constants.COPYFILE_EXCL,
    ),
    copyFile(
      path.join(input.repositoryRoot, ".codex/skills/worldkit-native-block-builder/scripts/render-visual-review.mjs"),
      path.join(skillRoot, "scripts/render-visual-review.mjs"),
      constants.COPYFILE_EXCL,
    ),
    ...referenceInputs.map(({ bytes, row }) => writeFile(
      path.join(inputRoot, row.inputRef),
      bytes,
      { flag: "wx", mode: 0o600 },
    )),
  ]);
  return Object.freeze({
    casePath,
    evaluationProfilePath,
    formalCaptureIntentPath,
  });
}
