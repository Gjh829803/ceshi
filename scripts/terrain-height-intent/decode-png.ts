import { sha256Bytes } from "@whitebox-world/protocol";
import sharp from "sharp";

const MAXIMUM_TERRAIN_INTENT_PIXELS_V0 = 16_777_216;

export interface CanonicalTerrainIntentRgbV0 {
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly rgbBytes: Uint8Array;
  readonly sourcePngHash: `sha256:${string}`;
  readonly canonicalRgbHash: `sha256:${string}`;
}

export async function decodeTerrainIntentPngV0(
  sourcePngBytes: Uint8Array,
): Promise<CanonicalTerrainIntentRgbV0> {
  const decodeOptions = {
    animated: true,
    failOn: "error" as const,
    limitInputPixels: MAXIMUM_TERRAIN_INTENT_PIXELS_V0,
  };
  const metadata = await sharp(sourcePngBytes, decodeOptions).metadata();

  if (metadata.pages !== undefined && metadata.pages !== 1) {
    throw new Error("Terrain height intent must contain exactly one PNG page.");
  }
  if (metadata.format !== "png") {
    throw new Error("Terrain height intent must contain exactly one PNG page.");
  }
  if (metadata.width === undefined || metadata.height === undefined) {
    throw new Error("Terrain height intent PNG dimensions are unavailable.");
  }
  if (metadata.width !== metadata.height) {
    throw new Error("Terrain height intent PNG must be square.");
  }
  if (metadata.hasAlpha) {
    throw new Error("Terrain height intent PNG must not contain an alpha channel.");
  }

  const { data, info } = await sharp(sourcePngBytes, decodeOptions)
    .toColourspace("srgb")
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const expectedByteCount = metadata.width * metadata.height * 3;

  if (
    info.width !== metadata.width ||
    info.height !== metadata.height ||
    info.channels !== 3 ||
    data.byteLength !== expectedByteCount
  ) {
    throw new Error("Terrain height intent PNG did not decode to canonical three-channel sRGB.");
  }

  const rgbBytes = new Uint8Array(data);
  return {
    widthPixels: metadata.width,
    heightPixels: metadata.height,
    rgbBytes,
    sourcePngHash: sha256Bytes(sourcePngBytes) as `sha256:${string}`,
    canonicalRgbHash: sha256Bytes(rgbBytes) as `sha256:${string}`,
  };
}
