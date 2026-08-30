import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import "@babylonjs/core/Meshes/thinInstanceMesh.js";

const NEUTRAL_INSTANCE_COLOR_RGBA = Object.freeze([1, 1, 1, 1]) as
  readonly [number, number, number, number];

export const BLOCK_WORLD_GROUND_STRIPE_DISPLAY_V1 = Object.freeze({
  forwardAxis: "-Z" as const,
  periodMeters: 6,
  stripeWidthMeters: 2,
  // Clear-day diffuse light adds to roughly 1.26 before exposure. Keeping the
  // stripe near 0.8 preserves an off-white result instead of clipping both
  // bands to identical pure white.
  stripeColorMultiplierRgba: Object.freeze([0.78, 0.8, 0.78, 1]) as
    readonly [number, number, number, number],
});

export interface BlockWorldGroundStripeBufferV1 {
  readonly kind: "instance" | "vertex";
  readonly colorsRgba: Float32Array;
}

const groundStripeBufferByMesh = new WeakMap<
  Mesh,
  BlockWorldGroundStripeBufferV1
>();

function positiveModulo(value: number, period: number): number {
  return ((value % period) + period) % period;
}

export function blockWorldGroundStripeColorMultiplierV1(
  positionMetersXYZ: readonly [number, number, number],
): readonly [number, number, number, number] {
  const { periodMeters, stripeWidthMeters, stripeColorMultiplierRgba } =
    BLOCK_WORLD_GROUND_STRIPE_DISPLAY_V1;
  // Keep the origin neutral and place the first crosswise band half a period
  // ahead on canonical -Z, where a third-person opening can actually see it.
  const offsetMeters = positiveModulo(
    positionMetersXYZ[2] + periodMeters / 2,
    periodMeters,
  );
  const halfWidthMeters = stripeWidthMeters / 2;
  return offsetMeters < halfWidthMeters ||
      offsetMeters >= periodMeters - halfWidthMeters
    ? stripeColorMultiplierRgba
    : NEUTRAL_INSTANCE_COLOR_RGBA;
}

export function registerBlockWorldGroundStripeInstanceColorsV1(
  mesh: Mesh,
  colorsRgba: Float32Array,
): void {
  mesh.thinInstanceSetBuffer(VertexBuffer.ColorKind, colorsRgba, 4, true);
  groundStripeBufferByMesh.set(mesh, Object.freeze({
    kind: "instance",
    colorsRgba,
  }));
}

export function registerBlockWorldGroundStripeVertexColorsV1(
  mesh: Mesh,
  colorsRgba: Float32Array,
): void {
  mesh.setVerticesData(VertexBuffer.ColorKind, colorsRgba, false, 4);
  groundStripeBufferByMesh.set(mesh, Object.freeze({
    kind: "vertex",
    colorsRgba,
  }));
}

export function suspendBlockWorldGroundStripeColorsV1(
  mesh: AbstractMesh,
): BlockWorldGroundStripeBufferV1 | undefined {
  if (!(mesh instanceof Mesh)) return undefined;
  const buffer = groundStripeBufferByMesh.get(mesh);
  if (buffer === undefined) return undefined;
  const colorKind = buffer.kind === "instance"
    ? VertexBuffer.ColorInstanceKind
    : VertexBuffer.ColorKind;
  if (!mesh.isVerticesDataPresent(colorKind)) return undefined;
  if (buffer.kind === "instance") {
    mesh.thinInstanceSetBuffer(VertexBuffer.ColorKind, null);
  } else {
    mesh.removeVerticesData(VertexBuffer.ColorKind);
  }
  return buffer;
}

export function restoreBlockWorldGroundStripeColorsV1(
  mesh: AbstractMesh,
  buffer: BlockWorldGroundStripeBufferV1,
): void {
  if (!(mesh instanceof Mesh) || mesh.isDisposed()) return;
  if (buffer.kind === "instance") {
    mesh.thinInstanceSetBuffer(VertexBuffer.ColorKind, buffer.colorsRgba, 4, true);
  } else {
    mesh.setVerticesData(VertexBuffer.ColorKind, buffer.colorsRgba, false, 4);
  }
}
