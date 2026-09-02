import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import path from "node:path";

import { parseSceneBriefV1 } from "@whitebox-world/authoring";

export const PLANNER_SELF_CHECK_VERSION = "worldkit-planner-self-check-v3";

const MAXIMUM_CENTER_ERROR_RATIO = 0.015;
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

interface PlannerImageMeasurement {
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly subjectMaskPixelCount: number;
  readonly subjectCenterXRatio: number;
  readonly subjectCenterErrorRatio: number;
  readonly maximumCenterErrorRatio: number;
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

function centerMeasurement(bytes: Buffer): PlannerImageMeasurement {
  const image = decodePng(bytes);
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
  const image = decodePng(bytes);
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
  const diagnostics = [...sceneBriefDiagnostics(briefSource)];
  let imageMeasurements: PlannerImageMeasurement | null = null;
  try {
    decodePng(worldPlanBytes);
    imageMeasurements = centerMeasurement(entryBytes);
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
    const report = { ...baseReport, diagnostics } as const;
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
