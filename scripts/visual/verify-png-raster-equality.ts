import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { decodePngRgbaV1 } from "../lib/png-raster.js";

const CHANNELS = ["red", "green", "blue", "alpha"] as const;

export type PngRasterComparisonV1 =
  | {
      readonly equal: true;
      readonly widthPixels: number;
      readonly heightPixels: number;
      readonly comparedPixelCount: number;
    }
  | {
      readonly equal: false;
      readonly reason: "dimension-mismatch";
      readonly expectedWidthPixels: number;
      readonly expectedHeightPixels: number;
      readonly actualWidthPixels: number;
      readonly actualHeightPixels: number;
    }
  | {
      readonly equal: false;
      readonly reason: "pixel-mismatch";
      readonly widthPixels: number;
      readonly heightPixels: number;
      readonly firstMismatch: {
        readonly x: number;
        readonly y: number;
        readonly channel: (typeof CHANNELS)[number];
        readonly expected: number;
        readonly actual: number;
      };
    };

export function comparePngRasterBytesV1(
  expectedBytes: Uint8Array,
  actualBytes: Uint8Array,
): PngRasterComparisonV1 {
  const expected = decodePngRgbaV1(expectedBytes);
  const actual = decodePngRgbaV1(actualBytes);
  if (expected.width !== actual.width || expected.height !== actual.height) {
    return {
      equal: false,
      reason: "dimension-mismatch",
      expectedWidthPixels: expected.width,
      expectedHeightPixels: expected.height,
      actualWidthPixels: actual.width,
      actualHeightPixels: actual.height,
    };
  }
  for (let offset = 0; offset < expected.pixels.length; offset += 1) {
    if (expected.pixels[offset] === actual.pixels[offset]) continue;
    const pixelIndex = Math.floor(offset / 4);
    return {
      equal: false,
      reason: "pixel-mismatch",
      widthPixels: expected.width,
      heightPixels: expected.height,
      firstMismatch: {
        x: pixelIndex % expected.width,
        y: Math.floor(pixelIndex / expected.width),
        channel: CHANNELS[offset % 4]!,
        expected: expected.pixels[offset]!,
        actual: actual.pixels[offset]!,
      },
    };
  }
  return {
    equal: true,
    widthPixels: expected.width,
    heightPixels: expected.height,
    comparedPixelCount: expected.width * expected.height,
  };
}

function option(arguments_: readonly string[], name: string): string {
  const index = arguments_.indexOf(name);
  const value = index < 0 ? undefined : arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

export async function verifyPngRasterFilesV1(options: {
  readonly expectedPath: string;
  readonly actualPath: string;
}): Promise<PngRasterComparisonV1> {
  const [expectedBytes, actualBytes] = await Promise.all([
    readFile(options.expectedPath),
    readFile(options.actualPath),
  ]);
  return comparePngRasterBytesV1(expectedBytes, actualBytes);
}

export async function main(
  arguments_: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const comparison = await verifyPngRasterFilesV1({
    expectedPath: option(arguments_, "--expected"),
    actualPath: option(arguments_, "--actual"),
  });
  process.stdout.write(`${JSON.stringify(comparison)}\n`);
  if (!comparison.equal) process.exitCode = 2;
}

const entryPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
