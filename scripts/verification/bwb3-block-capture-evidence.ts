import { createHash } from "node:crypto";

import sharp from "sharp";

export type BabylonNativeBlockRenderedCaptureViewIdV1 =
  | "opening"
  | "top-down"
  | "side";

export interface BabylonNativeBlockRenderedCaptureEvidenceV1 {
  readonly kind: "babylon-native-block-rendered-capture-evidence";
  readonly schemaVersion: 1;
  readonly views: readonly Readonly<{
    readonly viewId: BabylonNativeBlockRenderedCaptureViewIdV1;
    readonly contentHash: `sha256:${string}`;
    readonly widthPixels: number;
    readonly heightPixels: number;
    readonly distinctColorCount: number;
    readonly dominantColorRatio: number;
  }>[];
}

const VIEW_IDS = Object.freeze([
  "opening",
  "top-down",
  "side",
] as const satisfies readonly BabylonNativeBlockRenderedCaptureViewIdV1[]);

function fail(message: string): never {
  throw new TypeError(`WORLDKIT_BWB3_RENDERED_CAPTURE_INVALID: ${message}`);
}

export async function inspectBabylonNativeBlockRenderedCapturesV1(
  captures: readonly Readonly<{
    readonly viewId: BabylonNativeBlockRenderedCaptureViewIdV1;
    readonly pngBytes: Uint8Array;
  }>[],
): Promise<BabylonNativeBlockRenderedCaptureEvidenceV1> {
  if (
    captures.length !== VIEW_IDS.length ||
    captures.some(({ viewId }, index) => viewId !== VIEW_IDS[index])
  ) {
    return fail("captures must contain Opening, Top and Side exactly once");
  }
  const views = await Promise.all(captures.map(async ({ viewId, pngBytes }) => {
    const { data, info } = await sharp(pngBytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (
      info.width < 64 ||
      info.height < 64 ||
      info.channels !== 4 ||
      data.length !== info.width * info.height * info.channels
    ) {
      return fail(`'${viewId}' must be one non-trivial RGBA PNG`);
    }
    const countByColor = new Map<number, number>();
    for (let offset = 0; offset < data.length; offset += 4) {
      const color = (
        data[offset]! * 0x1_00_00_00 +
        data[offset + 1]! * 0x1_00_00 +
        data[offset + 2]! * 0x1_00 +
        data[offset + 3]!
      );
      countByColor.set(color, (countByColor.get(color) ?? 0) + 1);
    }
    const pixelCount = info.width * info.height;
    const dominantPixelCount = Math.max(...countByColor.values());
    const dominantColorRatio = dominantPixelCount / pixelCount;
    if (countByColor.size < 2 || dominantColorRatio >= 0.99) {
      return fail(`'${viewId}' is visually empty or dominated by one flat color`);
    }
    return Object.freeze({
      viewId,
      contentHash: `sha256:${createHash("sha256").update(pngBytes).digest("hex")}` as const,
      widthPixels: info.width,
      heightPixels: info.height,
      distinctColorCount: countByColor.size,
      dominantColorRatio,
    });
  }));
  if (new Set(views.map(({ contentHash }) => contentHash)).size !== views.length) {
    return fail("Opening, Top and Side must be distinct rendered views");
  }
  return Object.freeze({
    kind: "babylon-native-block-rendered-capture-evidence",
    schemaVersion: 1,
    views: Object.freeze(views),
  });
}
