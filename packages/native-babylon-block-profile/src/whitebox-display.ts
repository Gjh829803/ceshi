import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import "@babylonjs/core/Meshes/thinInstanceMesh.js";
import { isNil } from "lodash-es";

import {
  failBabylonNativeBlockProfileBuildV1 as fail,
} from "./build-failure.js";
import type { BabylonNativeBlockPaletteRoleV1 } from "./profile.js";

const CODE = "WORLDKIT_NATIVE_BLOCK_WHITEBOX_DISPLAY_INVALID";
const NEUTRAL_RGBA = Object.freeze([1, 1, 1, 1]) as
  readonly [number, number, number, number];

export const BABYLON_NATIVE_BLOCK_WHITEBOX_DISPLAY_V1 = Object.freeze({
  ambientRatio: 0.3,
  emissiveRatio: 0.025,
  specularRatio: 0,
  walkableStripe: Object.freeze({
    forwardAxis: "-Z" as const,
    periodMeters: 6,
    stripeWidthMeters: 2,
    colorMultiplierRgba: Object.freeze([0.78, 0.8, 0.78, 1]) as
      readonly [number, number, number, number],
  }),
});

export interface BabylonNativeBlockWalkableDisplayPlacementV1 {
  readonly blockId: string;
  readonly paletteRole: BabylonNativeBlockPaletteRoleV1;
  readonly centerMetersXYZ: readonly [number, number, number];
}

export interface BabylonNativeBlockWalkableDisplayRegistrationV1 {
  readonly kind: "instance" | "vertex";
  readonly blockIds: readonly string[];
  readonly colorsRgba: Float32Array;
  dispose(): void;
}

export interface BabylonNativeBlockWalkableDisplaySuspensionV1 {
  readonly kind: "instance" | "vertex";
  restore(): void;
}

interface RegisteredBufferV1 {
  readonly kind: "instance" | "vertex";
  readonly colorsRgba: Float32Array;
  readonly priorUseVertexColors: boolean;
  readonly priorHasVertexAlpha: boolean;
}

const registeredByMesh = new WeakMap<Mesh, RegisteredBufferV1>();

function positiveModulo(value: number, period: number): number {
  return ((value % period) + period) % period;
}

function isWalkableRole(role: BabylonNativeBlockPaletteRoleV1): boolean {
  return role === "ground" || role === "route";
}

export function babylonNativeBlockWalkableDisplayColorV1(
  centerMetersXYZ: readonly [number, number, number],
): readonly [number, number, number, number] {
  const { periodMeters, stripeWidthMeters, colorMultiplierRgba } =
    BABYLON_NATIVE_BLOCK_WHITEBOX_DISPLAY_V1.walkableStripe;
  const offsetMeters = positiveModulo(
    centerMetersXYZ[2] + periodMeters / 2,
    periodMeters,
  );
  const halfWidthMeters = stripeWidthMeters / 2;
  return offsetMeters < halfWidthMeters ||
      offsetMeters >= periodMeters - halfWidthMeters
    ? colorMultiplierRgba
    : NEUTRAL_RGBA;
}

function colorsForPlacements(
  placements: readonly BabylonNativeBlockWalkableDisplayPlacementV1[],
): Float32Array {
  return new Float32Array(placements.flatMap((placement) =>
    isWalkableRole(placement.paletteRole)
      ? [...babylonNativeBlockWalkableDisplayColorV1(
          placement.centerMetersXYZ,
        )]
      : [...NEUTRAL_RGBA]));
}

function register(
  mesh: Mesh,
  kind: "instance" | "vertex",
  colorsRgba: Float32Array,
  blockIds: readonly string[],
): BabylonNativeBlockWalkableDisplayRegistrationV1 {
  if (
    mesh.isDisposed() ||
    !isNil(registeredByMesh.get(mesh)) ||
    blockIds.length === 0 ||
    new Set(blockIds).size !== blockIds.length ||
    colorsRgba.length === 0 ||
    colorsRgba.length % 4 !== 0
  ) {
    return fail(CODE, "walkable display registration is not one fresh closed buffer");
  }
  const buffer: RegisteredBufferV1 = Object.freeze({
    kind,
    colorsRgba,
    priorUseVertexColors: mesh.useVertexColors,
    priorHasVertexAlpha: mesh.hasVertexAlpha,
  });
  if (kind === "instance") {
    mesh.thinInstanceSetBuffer(VertexBuffer.ColorKind, colorsRgba, 4, true);
  } else {
    mesh.setVerticesData(VertexBuffer.ColorKind, colorsRgba, false, 4);
  }
  mesh.useVertexColors = true;
  mesh.hasVertexAlpha = false;
  registeredByMesh.set(mesh, buffer);
  let isDisposed = false;
  return Object.freeze({
    kind,
    blockIds: Object.freeze([...blockIds]),
    colorsRgba,
    dispose(): void {
      if (isDisposed) return;
      isDisposed = true;
      if (registeredByMesh.get(mesh) !== buffer) {
        return fail(CODE, "walkable display registration identity drifted");
      }
      if (!mesh.isDisposed()) {
        if (kind === "instance") {
          mesh.thinInstanceSetBuffer(VertexBuffer.ColorKind, null);
        } else {
          mesh.removeVerticesData(VertexBuffer.ColorKind);
        }
        mesh.useVertexColors = buffer.priorUseVertexColors;
        mesh.hasVertexAlpha = buffer.priorHasVertexAlpha;
      }
      registeredByMesh.delete(mesh);
    },
  });
}

export function registerBabylonNativeBlockWalkableInstanceDisplayV1(
  mesh: Mesh,
  placements: readonly BabylonNativeBlockWalkableDisplayPlacementV1[],
): BabylonNativeBlockWalkableDisplayRegistrationV1 {
  if (mesh.thinInstanceCount !== placements.length) {
    return fail(CODE, "one walkable instance color is required per batch Block");
  }
  return register(
    mesh,
    "instance",
    colorsForPlacements(placements),
    placements.map(({ blockId }) => blockId),
  );
}

export function registerBabylonNativeBlockWalkableVertexDisplayV1(
  mesh: Mesh,
  placement: BabylonNativeBlockWalkableDisplayPlacementV1,
): BabylonNativeBlockWalkableDisplayRegistrationV1 | undefined {
  if (!isWalkableRole(placement.paletteRole)) return undefined;
  const vertexCount = mesh.getTotalVertices();
  if (vertexCount <= 0) {
    return fail(CODE, "one independent walkable Block requires vertex geometry");
  }
  const color = babylonNativeBlockWalkableDisplayColorV1(
    placement.centerMetersXYZ,
  );
  return register(
    mesh,
    "vertex",
    new Float32Array(Array.from({ length: vertexCount }, () => [...color]).flat()),
    [placement.blockId],
  );
}

export function suspendBabylonNativeBlockWalkableDisplayV1(
  mesh: Mesh,
): BabylonNativeBlockWalkableDisplaySuspensionV1 | undefined {
  const buffer = registeredByMesh.get(mesh);
  if (isNil(buffer) || mesh.isDisposed()) return undefined;
  const colorKind = buffer.kind === "instance"
    ? VertexBuffer.ColorInstanceKind
    : VertexBuffer.ColorKind;
  if (!mesh.isVerticesDataPresent(colorKind)) {
    return fail(CODE, "registered walkable display buffer is missing");
  }
  if (buffer.kind === "instance") {
    mesh.thinInstanceSetBuffer(VertexBuffer.ColorKind, null);
  } else {
    mesh.removeVerticesData(VertexBuffer.ColorKind);
  }
  let isRestored = false;
  return Object.freeze({
    kind: buffer.kind,
    restore(): void {
      if (isRestored || mesh.isDisposed()) return;
      isRestored = true;
      if (registeredByMesh.get(mesh) !== buffer) {
        return fail(CODE, "walkable display suspension identity drifted");
      }
      if (buffer.kind === "instance") {
        mesh.thinInstanceSetBuffer(
          VertexBuffer.ColorKind,
          buffer.colorsRgba,
          4,
          true,
        );
      } else {
        mesh.setVerticesData(VertexBuffer.ColorKind, buffer.colorsRgba, false, 4);
      }
    },
  });
}
