import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import path from "node:path";

import { parseSceneBriefV1 } from "@whitebox-world/authoring";

export const PLANNER_SELF_CHECK_VERSION = "worldkit-planner-self-check-v2";

const MAXIMUM_CENTER_ERROR_RATIO = 0.015;

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
  const diagnostics = sceneBriefDiagnostics(briefBytes.toString("utf8"));
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
