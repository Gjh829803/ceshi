import { PNG } from "pngjs";
import { sortBy } from "lodash-es";
import { sha256Bytes } from "@whitebox-world/protocol";
import type { FormalWorldCaptureViewRecordV1 } from "@whitebox-world/runtime-contracts";
import type { WorldReconstructionVisiblePixelProjectionV1 } from "@whitebox-world/validation";
import { measureIdentityMaskProjectionsV1 } from "../scenes/identity-mask-projection.js";

/** The sole visual region/anchor join; structural depth/order is not changed. */
export function projectOpeningCompositionPixelsV1(input: Readonly<{
  bindings: readonly Readonly<{ acceptanceTargetRef: string; compositionTargetRef: string }>[];
  projections: ReadonlyMap<string, WorldReconstructionVisiblePixelProjectionV1>;
}>) {
  const visible = sortBy(input.bindings.flatMap((binding) => {
    const projection = input.projections.get(binding.acceptanceTargetRef);
    if (projection === undefined) throw new TypeError("WORLD_RECONSTRUCTION_IDENTITY_MASK_INVALID: missing opening target");
    return projection.outcome === "visible" ? [{ ...binding, projection }] : [];
  }), "compositionTargetRef");
  return Object.freeze({
    regions: Object.freeze(visible.map(({ compositionTargetRef: targetRef, projection }) => ({ targetRef, normalizedBounds: projection.normalizedBounds }))),
    anchors: Object.freeze(visible.map(({ compositionTargetRef: targetRef, projection }) => ({ targetRef, normalizedCenter: projection.normalizedCenter }))),
  });
}

/** Decode only the exact receipt-bound image. Zero is background/unclassified. */
export function measureFormalIdentityMaskV1(input: Readonly<{
  pngBytes: Uint8Array;
  view: Pick<FormalWorldCaptureViewRecordV1, "identityMaskPngContentHash"> & Readonly<{
    request: Pick<FormalWorldCaptureViewRecordV1["request"], "widthPixels" | "heightPixels">;
  }>;
  targets: readonly Readonly<{ acceptanceTargetRef: string; identityColor: string }>[];
}>) {
  const invalid = () => new TypeError("WORLD_RECONSTRUCTION_IDENTITY_MASK_INVALID");
  if (sha256Bytes(input.pngBytes) !== input.view.identityMaskPngContentHash) throw invalid();
  const bytes = Buffer.from(input.pngBytes);
  // Check bound dimensions before the decoder allocates the pixel buffer.
  if (bytes.length < 33 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    bytes.readUInt32BE(8) !== 13 || bytes.toString("ascii", 12, 16) !== "IHDR" ||
    bytes.readUInt32BE(16) !== input.view.request.widthPixels ||
    bytes.readUInt32BE(20) !== input.view.request.heightPixels) throw invalid();
  let decoded: ReturnType<typeof PNG.sync.read>;
  try { decoded = PNG.sync.read(bytes, { checkCRC: true }); } catch { throw invalid(); }
  const labelByColor = new Map<number, number>();
  const refs = new Set<string>();
  for (const [index, target] of input.targets.entries()) {
    if (!/^#[0-9A-F]{6}$/.test(target.identityColor) || refs.has(target.acceptanceTargetRef)) throw invalid();
    const color = Number.parseInt(target.identityColor.slice(1), 16);
    if (color === 0 || labelByColor.has(color) || index >= 255) throw invalid();
    refs.add(target.acceptanceTargetRef);
    labelByColor.set(color, index + 1);
  }
  const labels = new Uint8Array(decoded.width * decoded.height);
  for (let index = 0; index < labels.length; index += 1) {
    const offset = index * 4;
    if (decoded.data[offset + 3]! < 128) continue;
    const color = decoded.data[offset]! * 65536 + decoded.data[offset + 1]! * 256 + decoded.data[offset + 2]!;
    labels[index] = labelByColor.get(color) ?? 0;
  }
  const projections = measureIdentityMaskProjectionsV1({ widthPixels: decoded.width,
    heightPixels: decoded.height, targetCount: input.targets.length, admittedTargetByPixel: labels });
  return new Map(input.targets.map((target, index) => {
    const projection = projections[index]!;
    const { pixelCount: _pixelCount, ...visiblePixelProjection } = projection;
    return [target.acceptanceTargetRef, visiblePixelProjection] as const;
  }));
}
