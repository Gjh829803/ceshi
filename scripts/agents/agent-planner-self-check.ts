import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { decodePlannerPngV1 } from "./planner-png.js";
import path from "node:path";

import { parseSceneBriefV1 } from "@whitebox-world/authoring";

import { BABYLON_NATIVE_VISUAL_IDENTITY_COLORS } from
  "../scenes/visual-identity-palette.js";

export const PLANNER_SELF_CHECK_VERSION = "worldkit-planner-self-check-v4";

const MAXIMUM_CENTER_ERROR_RATIO = 0.015;
const REQUIRED_ENTRY_ASPECT_RATIO = 16 / 9;
const MAXIMUM_ENTRY_ASPECT_ERROR_RATIO = 0.02;
const MINIMUM_WORLD_PLAN_BLOCK_PALETTE_COVERAGE_RATIO = 0.03;
const MINIMUM_ENTRY_BLOCK_PALETTE_COVERAGE_RATIO = 0.02;
const MINIMUM_VISUAL_TARGET_IMAGE_COVERAGE_RATIO = 0.00005;
const MAXIMUM_BLOCK_PALETTE_RGB_DISTANCE = 56;
// Image generation may add inspection-light shading to an exact identity color.
// Admit a nearby pixel only when the nearest target wins by a stable margin;
// this keeps target masks exclusive even for the close red/pink pair.
const MAXIMUM_IDENTITY_RGB_DISTANCE = 40;
const MINIMUM_IDENTITY_SEPARATION_RGB_UNITS = 12;
const MINIMUM_IDENTITY_IMAGE_COVERAGE_RATIO = 0.00025;
const MINIMUM_COHERENT_COMPONENT_IMAGE_COVERAGE_RATIO = 0.000025;
const MINIMUM_COHERENT_PIXEL_RATIO = 0.75;
// These per-target component thresholds are retained only as advisory Builder
// measurements. Historical ordinary success applied the 0.1% requirement to
// the red controlled Subject, not to every distant or occluded non-subject.
const MINIMUM_LARGEST_COMPONENT_IMAGE_COVERAGE_RATIO = 0.001;
const MINIMUM_LARGEST_COMPONENT_BOUNDING_BOX_WIDTH_RATIO = 0.02;
const MINIMUM_LARGEST_COMPONENT_BOUNDING_BOX_HEIGHT_RATIO = 0.04;
const MAXIMUM_AMBIGUOUS_IDENTITY_RATIO = 0.05;
const MAXIMUM_TERRAIN_IMAGE_DIMENSION_PIXELS = 4096;
// Image2 commonly preserves the requested scalar topology while adding a mild
// scientific-palette cast. The trusted compiler projects every pixel back onto
// the exact signed ramp, so this gate rejects semantic/material color misuse
// rather than requiring already-canonical transport bytes.
const MAXIMUM_MEAN_RAMP_RESIDUAL_RGB_UNITS = 60;
const MAXIMUM_P95_RAMP_RESIDUAL_RGB_UNITS = 90;
const MINIMUM_NON_FLAT_HEIGHT_RATIO_RANGE = 0.05;
const TERRAIN_HEIGHT_INTENT_PROFILE_ID = "signed-diverging-blue-gray-orange@1";
const TERRAIN_RAMP = {
  depression: [32, 64, 208] as const,
  datum: [128, 128, 128] as const,
  elevation: [224, 96, 32] as const,
};

// These image-only Block World colors reproduce the successful historical
// Planner contract without restoring a runtime, compiler, or physics owner.
// The generated PNGs remain untrusted planning proposals.
const NATIVE_PLANNER_BLOCK_COLORS = Object.freeze({
  walkable: "#B7E4C7",
  obstacle: "#5F6368",
  interactiveSolid: "#00B8A9",
  interactiveTrigger: "#B8DE6F",
  water: "#8ECDF4",
  cloudWalkable: "#D8D4F2",
  cloudPassable: "#EEF6FF",
  visualOnly: "#D6D3D1",
  landmarkRed: "#E15759",
  landmarkPink: "#E66AA5",
} as const);

interface PlannerSelfCheckDiagnostic {
  readonly code: string;
  readonly message: string;
}

export interface PlannerDecodedPngV4 {
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  readonly pixels: Buffer;
}

interface PlannerImageMeasurement {
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly subjectMaskPixelCount: number;
  readonly subjectCenterXRatio: number;
  readonly subjectCenterErrorRatio: number;
  readonly maximumCenterErrorRatio: number;
}

export interface NativeEntryIdentityTargetMeasurement {
  readonly visualTargetId: string;
  readonly identityColorHex: string;
  readonly exclusivelyAdmittedPixelCount: number;
  readonly imageCoverageRatio: number;
  readonly componentCount: number;
  readonly coherentComponentCount: number;
  readonly coherentPixelCount: number;
  readonly coherentPixelRatio: number;
  readonly largestComponentPixelCount: number;
  readonly largestComponentImageCoverageRatio: number;
  readonly largestComponentBoundingBoxWidthPixels: number;
  readonly largestComponentBoundingBoxHeightPixels: number;
  readonly largestComponentBoundingBoxWidthRatio: number;
  readonly largestComponentBoundingBoxHeightRatio: number;
  readonly minimumPixelCount: number;
  readonly minimumCoherentComponentPixelCount: number;
  readonly minimumCoherentPixelRatio: number;
  readonly minimumLargestComponentPixelCount: number;
  readonly minimumLargestComponentImageCoverageRatio: number;
  readonly minimumLargestComponentBoundingBoxWidthRatio: number;
  readonly minimumLargestComponentBoundingBoxHeightRatio: number;
}

interface NativeEntryIdentityComponentMeasurement {
  readonly pixelCount: number;
  readonly boundingBoxWidthPixels: number;
  readonly boundingBoxHeightPixels: number;
}

interface NativePlannerBlockPaletteEntry {
  readonly semantic: string;
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly isBlock: boolean;
  readonly isTraversable: boolean;
  readonly isInteractive: boolean;
  readonly maximumRgbDistance: number;
  readonly visualTargetIndex?: number;
}

export interface NativePlannerBlockPaletteMeasurement {
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly aspectRatio: number;
  readonly matchedBlockPixelCount: number;
  readonly blockPaletteCoverageRatio: number;
  readonly traversablePixelCount: number;
  readonly interactivePixelCount: number;
  readonly blockPixelCountsBySemantic: Readonly<Record<string, number>>;
  readonly visualTargetPixelCounts: readonly number[];
}

export interface NativeEntryIdentityMeasurement {
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly aspectRatio: number;
  readonly aspectErrorRatio: number;
  readonly requiredAspectRatio: number;
  readonly maximumAspectErrorRatio: number;
  readonly maximumIdentityRgbDistance: number;
  readonly minimumIdentitySeparationRgbUnits: number;
  readonly ambiguousIdentityPixelCount: number;
  readonly candidateIdentityPixelCount: number;
  readonly ambiguousIdentityRatio: number;
  readonly maximumAmbiguousIdentityRatio: number;
  readonly targets: readonly NativeEntryIdentityTargetMeasurement[];
}

export interface NativeEntryIdentityAnalysis {
  readonly measurement: NativeEntryIdentityMeasurement;
  readonly admittedTargetByPixel: Uint8Array;
}

interface TerrainIntentMeasurement {
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly profileId: typeof TERRAIN_HEIGHT_INTENT_PROFILE_ID;
  readonly minimumHeightRatio: number;
  readonly medianHeightRatio: number;
  readonly maximumHeightRatio: number;
  readonly meanRampResidualRgbUnits: number;
  readonly p95RampResidualRgbUnits: number;
}

type PlannerSceneSourceKind = "canonical" | "babylon-native";

interface PlannerSelfCheckBaseOptions {
  readonly sceneId: string;
  readonly briefPath: string;
  readonly worldPlanPath: string;
  readonly entryPath: string;
  readonly reportPath: string;
}

interface CanonicalPlannerSelfCheckOptions extends PlannerSelfCheckBaseOptions {
  readonly sceneSourceKind: "canonical";
  readonly terrainPromptPath: string;
  readonly terrainIntentPath: string;
}

interface NativePlannerSelfCheckOptions extends PlannerSelfCheckBaseOptions {
  readonly sceneSourceKind: "babylon-native";
}

type PlannerSelfCheckOptions =
  | CanonicalPlannerSelfCheckOptions
  | NativePlannerSelfCheckOptions;

function option(arguments_: readonly string[], name: string): string {
  const index = arguments_.indexOf(name);
  const value = index < 0 ? undefined : arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function sceneSourceKindOption(arguments_: readonly string[]): PlannerSceneSourceKind {
  const value = option(arguments_, "--scene-source");
  if (value !== "canonical" && value !== "babylon-native") {
    throw new Error("--scene-source must be canonical or babylon-native.");
  }
  return value;
}

function rejectOption(arguments_: readonly string[], name: string): void {
  if (arguments_.includes(name)) {
    throw new Error(`${name} is not accepted for Babylon Native Planner output.`);
  }
}

function contentHash(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}


function rgbHueSaturation(red: number, green: number, blue: number) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta > 0) {
    if (maximum === r) hue = 60 * (((g - b) / delta) % 6);
    else if (maximum === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  if (hue < 0) hue += 360;
  return {
    hue,
    saturation: maximum === 0 ? 0 : delta / maximum,
    brightness: maximum,
  };
}

function centerMeasurement(
  image: PlannerDecodedPngV4,
  admittedTargetByPixel?: Uint8Array,
): PlannerImageMeasurement {
  let xTotal = 0;
  let count = 0;
  for (let index = 0; index < image.width * image.height; index += 1) {
    let isSubjectPixel = admittedTargetByPixel?.[index] === 1;
    if (admittedTargetByPixel === undefined) {
      const offset = index * image.channels;
      const color = rgbHueSaturation(
        image.pixels[offset]!,
        image.pixels[offset + 1]!,
        image.pixels[offset + 2]!,
      );
      const hueDistance = Math.min(color.hue, 360 - color.hue);
      isSubjectPixel =
        hueDistance <= 12 &&
        color.saturation >= 0.3 &&
        color.brightness >= 0.2;
    }
    if (isSubjectPixel) {
      xTotal += index % image.width;
      count += 1;
    }
  }
  const minimumPixels = Math.max(
    64,
    Math.round(image.width * image.height * 0.001),
  );
  if (count < minimumPixels) {
    throw new Error(
      `Primary-subject red mask is missing or too small (${count} pixels).`,
    );
  }
  const centerXRatio = (xTotal / count + 0.5) / image.width;
  return {
    widthPixels: image.width,
    heightPixels: image.height,
    subjectMaskPixelCount: count,
    subjectCenterXRatio: centerXRatio,
    subjectCenterErrorRatio: Math.abs(centerXRatio - 0.5),
    maximumCenterErrorRatio: MAXIMUM_CENTER_ERROR_RATIO,
  };
}

function rgbFromHex(value: string): readonly [number, number, number] {
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

function nativePlannerPaletteEntry(input: Readonly<{
  semantic: string;
  color: string;
  isBlock: boolean;
  isTraversable?: boolean;
  isInteractive?: boolean;
  maximumRgbDistance?: number;
  visualTargetIndex?: number;
}>): NativePlannerBlockPaletteEntry {
  const [red, green, blue] = rgbFromHex(input.color);
  return Object.freeze({
    semantic: input.semantic,
    red,
    green,
    blue,
    isBlock: input.isBlock,
    isTraversable: input.isTraversable ?? false,
    isInteractive: input.isInteractive ?? false,
    maximumRgbDistance:
      input.maximumRgbDistance ?? MAXIMUM_BLOCK_PALETTE_RGB_DISTANCE,
    ...(input.visualTargetIndex === undefined
      ? {}
      : { visualTargetIndex: input.visualTargetIndex }),
  });
}

const NATIVE_PLANNER_BLOCK_PALETTE = Object.freeze([
  nativePlannerPaletteEntry({ semantic: "walkable", color: NATIVE_PLANNER_BLOCK_COLORS.walkable, isBlock: true, isTraversable: true }),
  nativePlannerPaletteEntry({ semantic: "obstacle", color: NATIVE_PLANNER_BLOCK_COLORS.obstacle, isBlock: true }),
  nativePlannerPaletteEntry({ semantic: "interactive-solid", color: NATIVE_PLANNER_BLOCK_COLORS.interactiveSolid, isBlock: true, isInteractive: true }),
  nativePlannerPaletteEntry({ semantic: "interactive-trigger", color: NATIVE_PLANNER_BLOCK_COLORS.interactiveTrigger, isBlock: true, isInteractive: true }),
  nativePlannerPaletteEntry({ semantic: "water", color: NATIVE_PLANNER_BLOCK_COLORS.water, isBlock: true }),
  nativePlannerPaletteEntry({ semantic: "cloud-walkable", color: NATIVE_PLANNER_BLOCK_COLORS.cloudWalkable, isBlock: true, isTraversable: true }),
  nativePlannerPaletteEntry({ semantic: "cloud-passable", color: NATIVE_PLANNER_BLOCK_COLORS.cloudPassable, isBlock: true, maximumRgbDistance: 16 }),
  nativePlannerPaletteEntry({ semantic: "visual-only", color: NATIVE_PLANNER_BLOCK_COLORS.visualOnly, isBlock: true }),
  nativePlannerPaletteEntry({ semantic: "landmark-red", color: NATIVE_PLANNER_BLOCK_COLORS.landmarkRed, isBlock: true }),
  ...BABYLON_NATIVE_VISUAL_IDENTITY_COLORS.slice(1).map((color, index) =>
    nativePlannerPaletteEntry({
      semantic: `visual-target-${index + 2}`,
      color,
      isBlock: true,
      visualTargetIndex: index + 1,
    })
  ),
  nativePlannerPaletteEntry({ semantic: "landmark-pink", color: NATIVE_PLANNER_BLOCK_COLORS.landmarkPink, isBlock: true }),
  nativePlannerPaletteEntry({ semantic: "visual-target-1-subject", color: BABYLON_NATIVE_VISUAL_IDENTITY_COLORS[0], isBlock: false, visualTargetIndex: 0 }),
] as const);

function nativePlannerBlockPaletteMeasurement(
  image: PlannerDecodedPngV4,
): NativePlannerBlockPaletteMeasurement {
  const blockPixelCountsBySemantic = Object.fromEntries(
    NATIVE_PLANNER_BLOCK_PALETTE.map(({ semantic }) => [semantic, 0]),
  ) as Record<string, number>;
  const visualTargetPixelCounts = BABYLON_NATIVE_VISUAL_IDENTITY_COLORS.map(() => 0);
  let matchedBlockPixelCount = 0;
  let traversablePixelCount = 0;
  let interactivePixelCount = 0;
  for (let index = 0; index < image.width * image.height; index += 1) {
    const offset = index * image.channels;
    if (image.channels === 4 && image.pixels[offset + 3]! < 128) continue;
    const red = image.pixels[offset]!;
    const green = image.pixels[offset + 1]!;
    const blue = image.pixels[offset + 2]!;
    let best: NativePlannerBlockPaletteEntry | undefined;
    let bestDistanceSquared = Number.POSITIVE_INFINITY;
    for (const candidate of NATIVE_PLANNER_BLOCK_PALETTE) {
      const distanceSquared =
        (red - candidate.red) ** 2 +
        (green - candidate.green) ** 2 +
        (blue - candidate.blue) ** 2;
      if (distanceSquared < bestDistanceSquared) {
        best = candidate;
        bestDistanceSquared = distanceSquared;
      }
    }
    if (
      best === undefined ||
      bestDistanceSquared > best.maximumRgbDistance ** 2
    ) {
      continue;
    }
    blockPixelCountsBySemantic[best.semantic] =
      (blockPixelCountsBySemantic[best.semantic] ?? 0) + 1;
    if (best.isBlock) matchedBlockPixelCount += 1;
    if (best.isTraversable) traversablePixelCount += 1;
    if (best.isInteractive) interactivePixelCount += 1;
    if (best.visualTargetIndex !== undefined) {
      visualTargetPixelCounts[best.visualTargetIndex] =
        (visualTargetPixelCounts[best.visualTargetIndex] ?? 0) + 1;
    }
  }
  const totalPixels = image.width * image.height;
  return Object.freeze({
    widthPixels: image.width,
    heightPixels: image.height,
    aspectRatio: image.width / image.height,
    matchedBlockPixelCount,
    blockPaletteCoverageRatio: matchedBlockPixelCount / totalPixels,
    traversablePixelCount,
    interactivePixelCount,
    blockPixelCountsBySemantic: Object.freeze(blockPixelCountsBySemantic),
    visualTargetPixelCounts: Object.freeze(visualTargetPixelCounts),
  });
}

function nativePlannerBlockPaletteDiagnostics(input: Readonly<{
  label: "WORLD_PLAN" | "ENTRY_WHITEBOX_TARGET";
  measurement: NativePlannerBlockPaletteMeasurement;
  minimumCoverageRatio: number;
  movementMode: string | undefined;
  requiredVisualTargetCount: number;
  requireAllVisualTargets: boolean;
}>): PlannerSelfCheckDiagnostic[] {
  const diagnostics: PlannerSelfCheckDiagnostic[] = [];
  if (input.measurement.blockPaletteCoverageRatio < input.minimumCoverageRatio) {
    diagnostics.push({
      code: `${input.label}_BLOCK_PALETTE_COVERAGE_LOW`,
      message: `${input.label} matches Block World colors on only ${input.measurement.blockPaletteCoverageRatio.toFixed(4)} of pixels; required at least ${input.minimumCoverageRatio.toFixed(4)}. Regenerate it as a discrete-cube block-whitebox render using the fixed palette.`,
    });
  }
  if (
    input.movementMode?.startsWith("ground-") === true &&
    input.measurement.traversablePixelCount === 0
  ) {
    diagnostics.push({
      code: `${input.label}_TRAVERSABLE_COLOR_MISSING`,
      message: `${input.label} does not contain a ground-traversable or cloud-support color even though the Scene Brief declares ground movement.`,
    });
  }
  const targetIndexes = input.requireAllVisualTargets
    ? Array.from(
      { length: input.requiredVisualTargetCount },
      (_, index) => index,
    )
    : [0];
  const minimumTargetPixels = Math.max(
    32,
    Math.round(
      input.measurement.widthPixels * input.measurement.heightPixels *
        MINIMUM_VISUAL_TARGET_IMAGE_COVERAGE_RATIO,
    ),
  );
  for (const targetIndex of targetIndexes) {
    const pixelCount =
      input.measurement.visualTargetPixelCounts[targetIndex] ?? 0;
    if (pixelCount < minimumTargetPixels) {
      diagnostics.push({
        code: `${input.label}_VISUAL_TARGET_COLOR_MISSING`,
        message: `${input.label} is missing visual-target-${targetIndex + 1} in its fixed Native color ${BABYLON_NATIVE_VISUAL_IDENTITY_COLORS[targetIndex]} (${pixelCount}/${minimumTargetPixels} pixels).`,
      });
    }
  }
  return diagnostics;
}

function connectedComponentsByTarget(
  image: PlannerDecodedPngV4,
  admittedTargetByPixel: Uint8Array,
  targetCount: number,
): readonly (readonly NativeEntryIdentityComponentMeasurement[])[] {
  const pixelCount = image.width * image.height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const componentsByTarget = Array.from(
    { length: targetCount },
    (): NativeEntryIdentityComponentMeasurement[] => [],
  );
  for (let start = 0; start < pixelCount; start += 1) {
    const admittedTarget = admittedTargetByPixel[start]!;
    if (visited[start] !== 0 || admittedTarget === 0) {
      continue;
    }
    let queueStart = 0;
    let queueEnd = 1;
    let size = 0;
    let minimumX = image.width;
    let minimumY = image.height;
    let maximumX = -1;
    let maximumY = -1;
    queue[0] = start;
    visited[start] = 1;
    while (queueStart < queueEnd) {
      const current = queue[queueStart++]!;
      size += 1;
      const currentX = current % image.width;
      const currentY = Math.floor(current / image.width);
      minimumX = Math.min(minimumX, currentX);
      minimumY = Math.min(minimumY, currentY);
      maximumX = Math.max(maximumX, currentX);
      maximumY = Math.max(maximumY, currentY);
      for (let y = Math.max(0, currentY - 1); y <= Math.min(image.height - 1, currentY + 1); y += 1) {
        for (let x = Math.max(0, currentX - 1); x <= Math.min(image.width - 1, currentX + 1); x += 1) {
          const neighbor = y * image.width + x;
          if (
            visited[neighbor] === 0 &&
            admittedTargetByPixel[neighbor] === admittedTarget
          ) {
            visited[neighbor] = 1;
            queue[queueEnd++] = neighbor;
          }
        }
      }
    }
    componentsByTarget[admittedTarget - 1]!.push({
      pixelCount: size,
      boundingBoxWidthPixels: maximumX - minimumX + 1,
      boundingBoxHeightPixels: maximumY - minimumY + 1,
    });
  }
  return componentsByTarget.map((components) =>
    components.sort((left, right) => right.pixelCount - left.pixelCount)
  );
}

export function analyzeNativeEntryIdentityImageV4(
  image: PlannerDecodedPngV4,
  requiredTargetCount: number,
): NativeEntryIdentityAnalysis {
  const colors = BABYLON_NATIVE_VISUAL_IDENTITY_COLORS
    .slice(0, requiredTargetCount)
    .map(rgbFromHex);
  const pixelCount = image.width * image.height;
  const admittedTargetByPixel = new Uint8Array(pixelCount);
  let ambiguousIdentityPixelCount = 0;
  let candidateIdentityPixelCount = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * image.channels;
    if (image.channels === 4 && image.pixels[offset + 3]! < 128) continue;
    const red = image.pixels[offset]!;
    const green = image.pixels[offset + 1]!;
    const blue = image.pixels[offset + 2]!;
    let bestTargetIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    let runnerUpDistance = Number.POSITIVE_INFINITY;
    for (let targetIndex = 0; targetIndex < colors.length; targetIndex += 1) {
      const color = colors[targetIndex]!;
      const distance = Math.hypot(
        red - color[0],
        green - color[1],
        blue - color[2],
      );
      if (distance < bestDistance) {
        runnerUpDistance = bestDistance;
        bestDistance = distance;
        bestTargetIndex = targetIndex;
      } else if (distance < runnerUpDistance) {
        runnerUpDistance = distance;
      }
    }
    if (bestTargetIndex < 0 || bestDistance > MAXIMUM_IDENTITY_RGB_DISTANCE) {
      continue;
    }
    candidateIdentityPixelCount += 1;
    if (
      runnerUpDistance - bestDistance < MINIMUM_IDENTITY_SEPARATION_RGB_UNITS
    ) {
      ambiguousIdentityPixelCount += 1;
      continue;
    }
    admittedTargetByPixel[index] = bestTargetIndex + 1;
  }

  const minimumPixelCount = Math.max(
    64,
    Math.round(pixelCount * MINIMUM_IDENTITY_IMAGE_COVERAGE_RATIO),
  );
  const minimumCoherentComponentPixelCount = Math.max(
    16,
    Math.round(pixelCount * MINIMUM_COHERENT_COMPONENT_IMAGE_COVERAGE_RATIO),
  );
  const minimumLargestComponentPixelCount = Math.max(
    32,
    Math.ceil(pixelCount * MINIMUM_LARGEST_COMPONENT_IMAGE_COVERAGE_RATIO),
  );
  const componentsByTarget = connectedComponentsByTarget(
    image,
    admittedTargetByPixel,
    requiredTargetCount,
  );
  const targets = colors.map((_, targetIndex): NativeEntryIdentityTargetMeasurement => {
    const admittedTarget = targetIndex + 1;
    const components = componentsByTarget[targetIndex]!;
    const exclusivelyAdmittedPixelCount = components.reduce(
      (sum, component) => sum + component.pixelCount,
      0,
    );
    const coherentComponents = components.filter(
      ({ pixelCount: componentPixelCount }) =>
        componentPixelCount >= minimumCoherentComponentPixelCount,
    );
    const coherentPixelCount = coherentComponents.reduce(
      (sum, component) => sum + component.pixelCount,
      0,
    );
    const largestComponent = components[0];
    const largestComponentPixelCount = largestComponent?.pixelCount ?? 0;
    const largestComponentBoundingBoxWidthPixels =
      largestComponent?.boundingBoxWidthPixels ?? 0;
    const largestComponentBoundingBoxHeightPixels =
      largestComponent?.boundingBoxHeightPixels ?? 0;
    return {
      visualTargetId: `visual-target-${admittedTarget}`,
      identityColorHex: BABYLON_NATIVE_VISUAL_IDENTITY_COLORS[targetIndex]!,
      exclusivelyAdmittedPixelCount,
      imageCoverageRatio: exclusivelyAdmittedPixelCount / pixelCount,
      componentCount: components.length,
      coherentComponentCount: coherentComponents.length,
      coherentPixelCount,
      coherentPixelRatio: exclusivelyAdmittedPixelCount === 0
        ? 0
        : coherentPixelCount / exclusivelyAdmittedPixelCount,
      largestComponentPixelCount,
      largestComponentImageCoverageRatio:
        largestComponentPixelCount / pixelCount,
      largestComponentBoundingBoxWidthPixels,
      largestComponentBoundingBoxHeightPixels,
      largestComponentBoundingBoxWidthRatio:
        largestComponentBoundingBoxWidthPixels / image.width,
      largestComponentBoundingBoxHeightRatio:
        largestComponentBoundingBoxHeightPixels / image.height,
      minimumPixelCount,
      minimumCoherentComponentPixelCount,
      minimumCoherentPixelRatio: MINIMUM_COHERENT_PIXEL_RATIO,
      minimumLargestComponentPixelCount,
      minimumLargestComponentImageCoverageRatio:
        MINIMUM_LARGEST_COMPONENT_IMAGE_COVERAGE_RATIO,
      minimumLargestComponentBoundingBoxWidthRatio:
        MINIMUM_LARGEST_COMPONENT_BOUNDING_BOX_WIDTH_RATIO,
      minimumLargestComponentBoundingBoxHeightRatio:
        MINIMUM_LARGEST_COMPONENT_BOUNDING_BOX_HEIGHT_RATIO,
    };
  });
  const aspectRatio = image.width / image.height;
  const ambiguousIdentityRatio = candidateIdentityPixelCount === 0
    ? 0
    : ambiguousIdentityPixelCount / candidateIdentityPixelCount;
  return {
    admittedTargetByPixel,
    measurement: {
      widthPixels: image.width,
      heightPixels: image.height,
      aspectRatio,
      aspectErrorRatio: Math.abs(aspectRatio - REQUIRED_ENTRY_ASPECT_RATIO) /
        REQUIRED_ENTRY_ASPECT_RATIO,
      requiredAspectRatio: REQUIRED_ENTRY_ASPECT_RATIO,
      maximumAspectErrorRatio: MAXIMUM_ENTRY_ASPECT_ERROR_RATIO,
      maximumIdentityRgbDistance: MAXIMUM_IDENTITY_RGB_DISTANCE,
      minimumIdentitySeparationRgbUnits: MINIMUM_IDENTITY_SEPARATION_RGB_UNITS,
      ambiguousIdentityPixelCount,
      candidateIdentityPixelCount,
      ambiguousIdentityRatio,
      maximumAmbiguousIdentityRatio: MAXIMUM_AMBIGUOUS_IDENTITY_RATIO,
      targets,
    },
  };
}

function nativeEntryIdentityDiagnostics(
  measurement: NativeEntryIdentityMeasurement,
): PlannerSelfCheckDiagnostic[] {
  const diagnostics: PlannerSelfCheckDiagnostic[] = [];
  if (measurement.aspectErrorRatio > MAXIMUM_ENTRY_ASPECT_ERROR_RATIO) {
    diagnostics.push({
      code: "ENTRY_WHITEBOX_TARGET_ASPECT_RATIO_INVALID",
      message: `Entry target aspect ratio is ${measurement.aspectRatio.toFixed(4)}; Formal opening requires 16:9 within ${(MAXIMUM_ENTRY_ASPECT_ERROR_RATIO * 100).toFixed(1)}%.`,
    });
  }
  // Target scale, coherence, and color ambiguity remain measured for Builder
  // feedback. Historical production never rejected an otherwise valid entry
  // because a non-subject target was distant, occluded, repeated, or absent.
  return diagnostics;
}

function segmentProjection(
  rgb: readonly [number, number, number],
  start: readonly [number, number, number],
  end: readonly [number, number, number],
  startHeightRatio: number,
) {
  const delta = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
  const lengthSquared = delta.reduce((sum, value) => sum + value * value, 0);
  const unclamped = (
    (rgb[0] - start[0]) * delta[0]! +
    (rgb[1] - start[1]) * delta[1]! +
    (rgb[2] - start[2]) * delta[2]!
  ) / lengthSquared;
  const ratio = Math.max(0, Math.min(1, unclamped));
  return {
    heightRatio: startHeightRatio + ratio,
    residual: Math.hypot(
      rgb[0] - (start[0] + ratio * delta[0]!),
      rgb[1] - (start[1] + ratio * delta[1]!),
      rgb[2] - (start[2] + ratio * delta[2]!),
    ),
  };
}

function nearestRank(sorted: readonly number[], ratio: number): number {
  return sorted[Math.max(0, Math.ceil(ratio * sorted.length) - 1)]!;
}

function terrainIntentMeasurement(bytes: Buffer): TerrainIntentMeasurement {
  const image = decodePlannerPngV1(bytes);
  if (image.width !== image.height) {
    throw new Error("Height Intent PNG must be square.");
  }
  if (image.width > MAXIMUM_TERRAIN_IMAGE_DIMENSION_PIXELS) {
    throw new Error(
      `Height Intent PNG dimensions must not exceed ${MAXIMUM_TERRAIN_IMAGE_DIMENSION_PIXELS}px.`,
    );
  }
  const ratios: number[] = [];
  const residuals: number[] = [];
  for (let index = 0; index < image.width * image.height; index += 1) {
    const offset = index * image.channels;
    if (image.channels === 4 && image.pixels[offset + 3] !== 255) {
      throw new Error("Height Intent PNG must be fully opaque.");
    }
    const rgb = [
      image.pixels[offset]!,
      image.pixels[offset + 1]!,
      image.pixels[offset + 2]!,
    ] as const;
    const low = segmentProjection(
      rgb,
      TERRAIN_RAMP.depression,
      TERRAIN_RAMP.datum,
      -1,
    );
    const high = segmentProjection(
      rgb,
      TERRAIN_RAMP.datum,
      TERRAIN_RAMP.elevation,
      0,
    );
    const projected = high.residual < low.residual ? high : low;
    ratios.push(projected.heightRatio);
    residuals.push(projected.residual);
  }
  ratios.sort((left, right) => left - right);
  residuals.sort((left, right) => left - right);
  return {
    widthPixels: image.width,
    heightPixels: image.height,
    profileId: TERRAIN_HEIGHT_INTENT_PROFILE_ID,
    minimumHeightRatio: ratios[0]!,
    medianHeightRatio: nearestRank(ratios, 0.5),
    maximumHeightRatio: ratios[ratios.length - 1]!,
    meanRampResidualRgbUnits:
      residuals.reduce((sum, value) => sum + value, 0) / residuals.length,
    p95RampResidualRgbUnits: nearestRank(residuals, 0.95),
  };
}

function terrainPromptDiagnostics(source: string): PlannerSelfCheckDiagnostic[] {
  const requirements = [
    ["TERRAIN_PROMPT_REFERENCE_ROLES", /reference roles/i],
    ["TERRAIN_PROMPT_BASE_TERRAIN", /base terrain/i],
    ["TERRAIN_PROMPT_DEPRESSIONS", /depressions/i],
    ["TERRAIN_PROMPT_STATIC_EXCLUSIONS", /static landmark and structure exclusions/i],
    ["TERRAIN_PROMPT_ENTRY_CONNECTIVITY", /entry and connectivity/i],
    ["TERRAIN_PROMPT_ORIENTATION", /orientation/i],
    ["TERRAIN_PROMPT_ENCODING_PROFILE", /signed-diverging-blue-gray-orange@1/i],
  ] as const;
  return requirements.flatMap(([code, pattern]) => pattern.test(source)
    ? []
    : [{ code, message: `Height Intent prompt is missing ${pattern.source}.` }]);
}

function sceneBriefDiagnostics(source: string): PlannerSelfCheckDiagnostic[] {
  const result = parseSceneBriefV1(source);
  if (result.ok) return [];
  return result.diagnostics.map((message) => ({
    code: message.split(":", 1)[0] || "SCENE_BRIEF_INVALID",
    message,
  }));
}

export async function runPlannerSelfCheck(options: PlannerSelfCheckOptions): Promise<{
  readonly status: "passed" | "failed";
  readonly diagnostics: readonly PlannerSelfCheckDiagnostic[];
}> {
  const [briefBytes, worldPlanBytes, entryBytes] = await Promise.all([
    readFile(options.briefPath),
    readFile(options.worldPlanPath),
    readFile(options.entryPath),
  ]);
  const briefSource = briefBytes.toString("utf8");
  const brief = parseSceneBriefV1(briefSource);
  const diagnostics = [...sceneBriefDiagnostics(briefSource)];
  let imageMeasurements: PlannerImageMeasurement | null = null;
  let nativeEntryIdentityMeasurements: NativeEntryIdentityMeasurement | null = null;
  let nativeBlockPaletteMeasurements: Readonly<{
    worldPlan: NativePlannerBlockPaletteMeasurement;
    entryWhiteboxTarget: NativePlannerBlockPaletteMeasurement;
  }> | null = null;
  try {
    const worldPlanImage = decodePlannerPngV1(worldPlanBytes);
    const entryImage = decodePlannerPngV1(entryBytes);
    const nativeEntryAnalysis = options.sceneSourceKind === "babylon-native"
      ? analyzeNativeEntryIdentityImageV4(
        entryImage,
        brief.ok ? brief.value.visualTargets.length : 1,
      )
      : undefined;
    if (nativeEntryAnalysis !== undefined) {
      nativeEntryIdentityMeasurements = nativeEntryAnalysis.measurement;
      const worldPlanPalette = nativePlannerBlockPaletteMeasurement(
        worldPlanImage,
      );
      const entryPalette = nativePlannerBlockPaletteMeasurement(entryImage);
      nativeBlockPaletteMeasurements = Object.freeze({
        worldPlan: worldPlanPalette,
        entryWhiteboxTarget: entryPalette,
      });
      const movementMode = brief.ok ? brief.value.movement.mode : undefined;
      const requiredVisualTargetCount = brief.ok
        ? brief.value.visualTargets.length
        : 1;
      diagnostics.push(
        ...nativePlannerBlockPaletteDiagnostics({
          label: "WORLD_PLAN",
          measurement: worldPlanPalette,
          minimumCoverageRatio:
            MINIMUM_WORLD_PLAN_BLOCK_PALETTE_COVERAGE_RATIO,
          movementMode,
          requiredVisualTargetCount,
          requireAllVisualTargets: true,
        }),
        ...nativePlannerBlockPaletteDiagnostics({
          label: "ENTRY_WHITEBOX_TARGET",
          measurement: entryPalette,
          minimumCoverageRatio: MINIMUM_ENTRY_BLOCK_PALETTE_COVERAGE_RATIO,
          movementMode,
          requiredVisualTargetCount,
          requireAllVisualTargets: false,
        }),
        ...nativeEntryIdentityDiagnostics(nativeEntryIdentityMeasurements),
      );
    }
    // Keep the historical red-silhouette admission for the only hard entry
    // identity gate. The exclusive target masks above are advisory metrics.
    imageMeasurements = centerMeasurement(entryImage);
    if (
      imageMeasurements.subjectCenterErrorRatio > MAXIMUM_CENTER_ERROR_RATIO
    ) {
      diagnostics.push({
        code: "ENTRY_SUBJECT_NOT_CENTERED",
        message: `Primary Subject center is x=${imageMeasurements.subjectCenterXRatio.toFixed(4)}; required 0.5000±${MAXIMUM_CENTER_ERROR_RATIO.toFixed(4)}.`,
      });
    }
  } catch (error) {
    diagnostics.push({
      code: "PLANNER_IMAGE_INVALID",
      message: error instanceof Error ? error.message : String(error),
    });
  }
  const baseReport = {
    kind: "worldkit-planner-self-check",
    schemaVersion: 1,
    validatorVersion: PLANNER_SELF_CHECK_VERSION,
    sceneId: options.sceneId,
    sceneSourceKind: options.sceneSourceKind,
    status: diagnostics.length === 0 ? "passed" : "failed",
    inputs: {
      sceneBriefHash: contentHash(briefBytes),
      worldPlanHash: contentHash(worldPlanBytes),
      entryWhiteboxTargetHash: contentHash(entryBytes),
    },
    imageMeasurements,
  } as const;
  if (options.sceneSourceKind === "babylon-native") {
    const report = {
      ...baseReport,
      nativeBlockPaletteMeasurements,
      nativeEntryIdentityMeasurements,
      diagnostics,
    } as const;
    await writeFile(options.reportPath, `${JSON.stringify(report)}\n`, "utf8");
    return { status: report.status, diagnostics };
  }

  const [terrainPromptBytes, terrainIntentBytes] = await Promise.all([
    readFile(options.terrainPromptPath),
    readFile(options.terrainIntentPath),
  ]);
  diagnostics.push(
    ...terrainPromptDiagnostics(terrainPromptBytes.toString("utf8")),
  );
  let terrainIntentMeasurements: TerrainIntentMeasurement | null = null;
  try {
    terrainIntentMeasurements = terrainIntentMeasurement(terrainIntentBytes);
    const ratioRange = terrainIntentMeasurements.maximumHeightRatio -
      terrainIntentMeasurements.minimumHeightRatio;
    if (
      ratioRange < MINIMUM_NON_FLAT_HEIGHT_RATIO_RANGE &&
      !/(?:flat terrain|flat ground|平地)/i.test(briefSource)
    ) {
      diagnostics.push({
        code: "TERRAIN_INTENT_NEAR_CONSTANT",
        message: `Height Intent signed ratio range ${ratioRange.toFixed(4)} is below ${MINIMUM_NON_FLAT_HEIGHT_RATIO_RANGE.toFixed(4)}.`,
      });
    }
    if (
      terrainIntentMeasurements.meanRampResidualRgbUnits >
        MAXIMUM_MEAN_RAMP_RESIDUAL_RGB_UNITS ||
      terrainIntentMeasurements.p95RampResidualRgbUnits >
        MAXIMUM_P95_RAMP_RESIDUAL_RGB_UNITS
    ) {
      diagnostics.push({
        code: "TERRAIN_INTENT_COLOR_RESIDUAL_EXCEEDED",
        message: "Height Intent colors exceed the signed transport ramp residual limits.",
      });
    }
  } catch (error) {
    diagnostics.push({
      code: "TERRAIN_INTENT_IMAGE_INVALID",
      message: error instanceof Error ? error.message : String(error),
    });
  }
  const report = {
    ...baseReport,
    status: diagnostics.length === 0 ? "passed" : "failed",
    inputs: {
      ...baseReport.inputs,
      terrainHeightIntentPromptHash: contentHash(terrainPromptBytes),
      terrainHeightIntentPngHash: contentHash(terrainIntentBytes),
    },
    terrainIntentMeasurements,
    diagnostics,
  } as const;
  await writeFile(options.reportPath, `${JSON.stringify(report)}\n`, "utf8");
  return { status: report.status, diagnostics };
}

export async function main(
  arguments_: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const sceneSourceKind = sceneSourceKindOption(arguments_);
  const baseOptions = {
    sceneSourceKind,
    sceneId: option(arguments_, "--scene-id"),
    briefPath: path.resolve(option(arguments_, "--brief")),
    worldPlanPath: path.resolve(option(arguments_, "--world-plan")),
    entryPath: path.resolve(option(arguments_, "--entry")),
    reportPath: path.resolve(option(arguments_, "--report")),
  } as const;
  const result = sceneSourceKind === "canonical"
    ? await runPlannerSelfCheck({
      ...baseOptions,
      sceneSourceKind,
      terrainPromptPath: path.resolve(option(arguments_, "--terrain-prompt")),
      terrainIntentPath: path.resolve(option(arguments_, "--terrain-intent")),
    })
    : await (async () => {
      rejectOption(arguments_, "--terrain-prompt");
      rejectOption(arguments_, "--terrain-intent");
      return runPlannerSelfCheck({ ...baseOptions, sceneSourceKind });
    })();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status !== "passed") process.exitCode = 2;
}

const entryPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
