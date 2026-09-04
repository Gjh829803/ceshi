import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import path from "node:path";

import { parseSceneBriefV1 } from "@whitebox-world/authoring";
import {
  BLOCK_PRESET_COLORS_V1,
  BLOCK_VISUAL_TARGET_COLORS_V1,
  BLOCK_WHITEBOX_SUBJECT_COLOR_V1,
} from "@whitebox-world/block-world";

export const PLANNER_SELF_CHECK_VERSION = "worldkit-planner-self-check-v4";

const MAXIMUM_CENTER_ERROR_RATIO = 0.015;
const MAXIMUM_ENTRY_ASPECT_ERROR_RATIO = 0.02;
const MINIMUM_WORLD_PLAN_PALETTE_COVERAGE_RATIO = 0.03;
const MINIMUM_ENTRY_PALETTE_COVERAGE_RATIO = 0.02;
const MAXIMUM_PALETTE_RGB_DISTANCE = 56;

interface PlannerSelfCheckDiagnostic {
  readonly code: string;
  readonly message: string;
}

interface DecodedPng {
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  readonly pixels: Buffer;
}

interface PlannerEntryCompositionMeasurement {
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly subjectMaskPixelCount: number;
  readonly subjectCenterXRatio: number;
  readonly subjectCenterErrorRatio: number;
  readonly maximumCenterErrorRatio: number;
}

interface PlannerBlockPaletteMeasurement {
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

interface PlannerImageMeasurements {
  readonly worldPlan: PlannerBlockPaletteMeasurement | null;
  readonly entryWhiteboxTarget: (PlannerBlockPaletteMeasurement & {
    readonly composition: PlannerEntryCompositionMeasurement;
  }) | null;
}

interface PaletteEntry {
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

function rgbFromHex(value: string): readonly [number, number, number] {
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

function paletteEntry(input: {
  readonly semantic: string;
  readonly color: string;
  readonly isBlock: boolean;
  readonly isTraversable?: boolean;
  readonly isInteractive?: boolean;
  readonly maximumRgbDistance?: number;
  readonly visualTargetIndex?: number;
}): PaletteEntry {
  const [red, green, blue] = rgbFromHex(input.color);
  return {
    semantic: input.semantic,
    red,
    green,
    blue,
    isBlock: input.isBlock,
    isTraversable: input.isTraversable ?? false,
    isInteractive: input.isInteractive ?? false,
    maximumRgbDistance: input.maximumRgbDistance ?? MAXIMUM_PALETTE_RGB_DISTANCE,
    ...(input.visualTargetIndex === undefined
      ? {}
      : { visualTargetIndex: input.visualTargetIndex }),
  };
}

const BLOCK_WHITEBOX_PALETTE = Object.freeze([
  paletteEntry({ semantic: "walkable", color: BLOCK_PRESET_COLORS_V1.walkable, isBlock: true, isTraversable: true }),
  paletteEntry({ semantic: "walkable-ice", color: BLOCK_PRESET_COLORS_V1.walkableIce, isBlock: true, isTraversable: true }),
  paletteEntry({ semantic: "walkable-mud", color: BLOCK_PRESET_COLORS_V1.walkableMud, isBlock: true, isTraversable: true }),
  paletteEntry({ semantic: "obstacle", color: BLOCK_PRESET_COLORS_V1.obstacle, isBlock: true }),
  paletteEntry({ semantic: "interactive-solid", color: BLOCK_PRESET_COLORS_V1.interactiveSolid, isBlock: true, isInteractive: true }),
  paletteEntry({ semantic: "interactive-trigger", color: BLOCK_PRESET_COLORS_V1.interactiveTrigger, isBlock: true, isInteractive: true }),
  paletteEntry({ semantic: "water", color: BLOCK_PRESET_COLORS_V1.water, isBlock: true }),
  paletteEntry({ semantic: "cloud-walkable", color: BLOCK_PRESET_COLORS_V1.cloudWalkable, isBlock: true, isTraversable: true }),
  paletteEntry({ semantic: "cloud-passable", color: BLOCK_PRESET_COLORS_V1.cloudPassable, isBlock: true, maximumRgbDistance: 16 }),
  paletteEntry({ semantic: "visual-only", color: BLOCK_PRESET_COLORS_V1.visualOnly, isBlock: true }),
  paletteEntry({ semantic: "landmark-red", color: BLOCK_PRESET_COLORS_V1.landmarkRed, isBlock: true }),
  paletteEntry({ semantic: "visual-target-2", color: BLOCK_VISUAL_TARGET_COLORS_V1[1], isBlock: true, visualTargetIndex: 1 }),
  paletteEntry({ semantic: "visual-target-3", color: BLOCK_VISUAL_TARGET_COLORS_V1[2], isBlock: true, visualTargetIndex: 2 }),
  paletteEntry({ semantic: "visual-target-4", color: BLOCK_VISUAL_TARGET_COLORS_V1[3], isBlock: true, visualTargetIndex: 3 }),
  paletteEntry({ semantic: "visual-target-5", color: BLOCK_VISUAL_TARGET_COLORS_V1[4], isBlock: true, visualTargetIndex: 4 }),
  paletteEntry({ semantic: "landmark-pink", color: BLOCK_PRESET_COLORS_V1.landmarkPink, isBlock: true }),
  paletteEntry({ semantic: "visual-target-1-subject", color: BLOCK_WHITEBOX_SUBJECT_COLOR_V1, isBlock: false, visualTargetIndex: 0 }),
] as const);

function option(arguments_: readonly string[], name: string): string {
  const index = arguments_.indexOf(name);
  const value = index < 0 ? undefined : arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function contentHash(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function paeth(left: number, above: number, upperLeft: number): number {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
    ? left
    : aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function decodePng(bytes: Buffer): DecodedPng {
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("Image must be PNG.");
  }
  let offset = 8;
  let width: number | undefined;
  let height: number | undefined;
  let channels: number | undefined;
  const compressed: Buffer[] = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      const colorType = data[9];
      if (bitDepth !== 8 || data[12] !== 0 || (colorType !== 2 && colorType !== 6)) {
        throw new Error(
          "Planner self-check supports non-interlaced 8-bit RGB/RGBA PNG files.",
        );
      }
      channels = colorType === 6 ? 4 : 3;
    } else if (type === "IDAT") {
      compressed.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  if (
    width === undefined ||
    height === undefined ||
    channels === undefined ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    compressed.length === 0
  ) {
    throw new Error("PNG structure is incomplete.");
  }
  const scanlines = inflateSync(Buffer.concat(compressed));
  const stride = width * channels;
  if (scanlines.length !== (stride + 1) * height) {
    throw new Error("PNG scanline size is invalid.");
  }
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = scanlines[y * (stride + 1)]!;
    for (let x = 0; x < stride; x += 1) {
      const raw = scanlines[y * (stride + 1) + 1 + x]!;
      const left = x >= channels ? pixels[y * stride + x - channels]! : 0;
      const above = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const upperLeft = y > 0 && x >= channels
        ? pixels[(y - 1) * stride + x - channels]!
        : 0;
      const reconstructed = filter === 0 ? raw
        : filter === 1 ? raw + left
        : filter === 2 ? raw + above
        : filter === 3 ? raw + Math.floor((left + above) / 2)
        : filter === 4 ? raw + paeth(left, above, upperLeft)
        : Number.NaN;
      if (!Number.isFinite(reconstructed)) {
        throw new Error(`Unsupported PNG filter ${filter}.`);
      }
      pixels[y * stride + x] = reconstructed & 0xff;
    }
  }
  return { width, height, channels, pixels };
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

function centerMeasurement(image: DecodedPng): PlannerEntryCompositionMeasurement {
  let xTotal = 0;
  let count = 0;
  for (let index = 0; index < image.width * image.height; index += 1) {
    const offset = index * image.channels;
    const color = rgbHueSaturation(
      image.pixels[offset]!,
      image.pixels[offset + 1]!,
      image.pixels[offset + 2]!,
    );
    const hueDistance = Math.min(color.hue, 360 - color.hue);
    if (
      hueDistance <= 12 &&
      color.saturation >= 0.3 &&
      color.brightness >= 0.2
    ) {
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
      `Primary-subject red silhouette is missing or too small (${count} pixels).`,
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

function blockPaletteMeasurement(image: DecodedPng): PlannerBlockPaletteMeasurement {
  const counts = Object.fromEntries(
    BLOCK_WHITEBOX_PALETTE.map(({ semantic }) => [semantic, 0]),
  ) as Record<string, number>;
  const visualTargetPixelCounts = BLOCK_VISUAL_TARGET_COLORS_V1.map(() => 0);
  let matchedBlockPixelCount = 0;
  let traversablePixelCount = 0;
  let interactivePixelCount = 0;
  for (let index = 0; index < image.width * image.height; index += 1) {
    const offset = index * image.channels;
    const red = image.pixels[offset]!;
    const green = image.pixels[offset + 1]!;
    const blue = image.pixels[offset + 2]!;
    let best: PaletteEntry | undefined;
    let bestDistanceSquared = Number.POSITIVE_INFINITY;
    for (const candidate of BLOCK_WHITEBOX_PALETTE) {
      const distanceSquared =
        (red - candidate.red) ** 2 +
        (green - candidate.green) ** 2 +
        (blue - candidate.blue) ** 2;
      if (distanceSquared < bestDistanceSquared) {
        best = candidate;
        bestDistanceSquared = distanceSquared;
      }
    }
    if (best === undefined || bestDistanceSquared > best.maximumRgbDistance ** 2) continue;
    counts[best.semantic] = (counts[best.semantic] ?? 0) + 1;
    if (best.isBlock) matchedBlockPixelCount += 1;
    if (best.isTraversable) traversablePixelCount += 1;
    if (best.isInteractive) interactivePixelCount += 1;
    if (best.visualTargetIndex !== undefined) {
      visualTargetPixelCounts[best.visualTargetIndex] =
        (visualTargetPixelCounts[best.visualTargetIndex] ?? 0) + 1;
    }
  }
  const totalPixels = image.width * image.height;
  return {
    widthPixels: image.width,
    heightPixels: image.height,
    aspectRatio: image.width / image.height,
    matchedBlockPixelCount,
    blockPaletteCoverageRatio: matchedBlockPixelCount / totalPixels,
    traversablePixelCount,
    interactivePixelCount,
    blockPixelCountsBySemantic: counts,
    visualTargetPixelCounts,
  };
}

function validateBlockPalette(options: {
  readonly label: "WORLD_PLAN" | "ENTRY_WHITEBOX_TARGET";
  readonly measurement: PlannerBlockPaletteMeasurement;
  readonly minimumCoverageRatio: number;
  readonly movementModes: readonly string[] | undefined;
  readonly requiredVisualTargetCount: number;
  readonly requireAllVisualTargets: boolean;
}): PlannerSelfCheckDiagnostic[] {
  const diagnostics: PlannerSelfCheckDiagnostic[] = [];
  if (options.measurement.blockPaletteCoverageRatio < options.minimumCoverageRatio) {
    diagnostics.push({
      code: `${options.label}_BLOCK_PALETTE_COVERAGE_LOW`,
      message: `${options.label} matches Block World colors on only ${options.measurement.blockPaletteCoverageRatio.toFixed(4)} of pixels; required at least ${options.minimumCoverageRatio.toFixed(4)}. Regenerate it as a discrete-cube block-whitebox render using the fixed palette.`,
    });
  }
  const hasGroundMovement = options.movementModes?.some((mode) =>
    mode.startsWith("ground-")) === true;
  const supportPixelCount = hasGroundMovement
    ? (options.measurement.blockPixelCountsBySemantic.walkable ?? 0) +
      (options.measurement.blockPixelCountsBySemantic["cloud-walkable"] ?? 0)
    : undefined;
  if (supportPixelCount !== undefined && supportPixelCount === 0) {
    diagnostics.push({
      code: `${options.label}_TRAVERSABLE_COLOR_MISSING`,
      message: `${options.label} does not contain a ground-traversable or cloud-support color even though the Scene Brief declares ground movement. Flight, swimming, and water-surface domains are never represented as route overlays.`,
    });
  }
  const requiredTargetIndexes = options.requireAllVisualTargets
    ? Array.from({ length: options.requiredVisualTargetCount }, (_, index) => index)
    : [0];
  const minimumTargetPixels = Math.max(
    32,
    Math.round(options.measurement.widthPixels * options.measurement.heightPixels * 0.00005),
  );
  for (const targetIndex of requiredTargetIndexes) {
    const pixelCount = options.measurement.visualTargetPixelCounts[targetIndex] ?? 0;
    if (pixelCount < minimumTargetPixels) {
      diagnostics.push({
        code: `${options.label}_VISUAL_TARGET_COLOR_MISSING`,
        message: `${options.label} is missing visual-target-${targetIndex + 1} in its fixed color ${BLOCK_VISUAL_TARGET_COLORS_V1[targetIndex]} (${pixelCount}/${minimumTargetPixels} pixels).`,
      });
    }
  }
  return diagnostics;
}

function sceneBriefDiagnostics(source: string): PlannerSelfCheckDiagnostic[] {
  const result = parseSceneBriefV1(source);
  if (result.ok) return [];
  return result.diagnostics.map((message) => ({
    code: message.split(":", 1)[0] || "SCENE_BRIEF_INVALID",
    message,
  }));
}

export async function runPlannerSelfCheck(options: {
  readonly sceneId: string;
  readonly briefPath: string;
  readonly worldPlanPath: string;
  readonly entryPath: string;
  readonly reportPath: string;
}): Promise<{
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
  const diagnostics = sceneBriefDiagnostics(briefSource);
  let worldPlanMeasurement: PlannerBlockPaletteMeasurement | null = null;
  let entryMeasurement: PlannerImageMeasurements["entryWhiteboxTarget"] = null;
  try {
    const image = decodePng(worldPlanBytes);
    worldPlanMeasurement = blockPaletteMeasurement(image);
    diagnostics.push(...validateBlockPalette({
      label: "WORLD_PLAN",
      measurement: worldPlanMeasurement,
      minimumCoverageRatio: MINIMUM_WORLD_PLAN_PALETTE_COVERAGE_RATIO,
      movementModes: brief.ok
        ? brief.value.movementModes.map(({ mode }) => mode)
        : undefined,
      requiredVisualTargetCount: brief.ok ? brief.value.visualTargets.length : 1,
      requireAllVisualTargets: true,
    }));
  } catch (error) {
    diagnostics.push({
      code: "WORLD_PLAN_IMAGE_INVALID",
      message: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    const image = decodePng(entryBytes);
    const palette = blockPaletteMeasurement(image);
    const composition = centerMeasurement(image);
    entryMeasurement = { ...palette, composition };
    diagnostics.push(...validateBlockPalette({
      label: "ENTRY_WHITEBOX_TARGET",
      measurement: palette,
      minimumCoverageRatio: MINIMUM_ENTRY_PALETTE_COVERAGE_RATIO,
      movementModes: brief.ok
        ? brief.value.movementModes.map(({ mode }) => mode)
        : undefined,
      requiredVisualTargetCount: brief.ok ? brief.value.visualTargets.length : 1,
      requireAllVisualTargets: false,
    }));
    const aspectErrorRatio = Math.abs(palette.aspectRatio - 16 / 9) / (16 / 9);
    if (aspectErrorRatio > MAXIMUM_ENTRY_ASPECT_ERROR_RATIO) {
      diagnostics.push({
        code: "ENTRY_WHITEBOX_TARGET_ASPECT_RATIO_INVALID",
        message: `Entry target aspect ratio is ${palette.aspectRatio.toFixed(4)}; required 16:9 within ${(MAXIMUM_ENTRY_ASPECT_ERROR_RATIO * 100).toFixed(1)}%.`,
      });
    }
    if (
      composition.subjectCenterErrorRatio > MAXIMUM_CENTER_ERROR_RATIO
    ) {
      diagnostics.push({
        code: "ENTRY_SUBJECT_NOT_CENTERED",
        message: `Primary Subject center is x=${composition.subjectCenterXRatio.toFixed(4)}; required 0.5000±${MAXIMUM_CENTER_ERROR_RATIO.toFixed(4)}.`,
      });
    }
  } catch (error) {
    diagnostics.push({
      code: "ENTRY_WHITEBOX_TARGET_IMAGE_INVALID",
      message: error instanceof Error ? error.message : String(error),
    });
  }
  const imageMeasurements: PlannerImageMeasurements = {
    worldPlan: worldPlanMeasurement,
    entryWhiteboxTarget: entryMeasurement,
  };
  const report = {
    kind: "worldkit-planner-self-check",
    schemaVersion: 1,
    validatorVersion: PLANNER_SELF_CHECK_VERSION,
    sceneId: options.sceneId,
    status: diagnostics.length === 0 ? "passed" : "failed",
    inputs: {
      sceneBriefHash: contentHash(briefBytes),
      worldPlanHash: contentHash(worldPlanBytes),
      entryWhiteboxTargetHash: contentHash(entryBytes),
    },
    imageMeasurements,
    diagnostics,
  } as const;
  await writeFile(options.reportPath, `${JSON.stringify(report)}\n`, "utf8");
  return { status: report.status, diagnostics };
}

export async function main(
  arguments_: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const result = await runPlannerSelfCheck({
    sceneId: option(arguments_, "--scene-id"),
    briefPath: path.resolve(option(arguments_, "--brief")),
    worldPlanPath: path.resolve(option(arguments_, "--world-plan")),
    entryPath: path.resolve(option(arguments_, "--entry")),
    reportPath: path.resolve(option(arguments_, "--report")),
  });
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
