import { describe, expect, it } from "vitest";

interface ShapesModule {
  readonly BABYLON_NATIVE_BLOCK_FULL_SIZE_METERS_V1: 1;
  readonly BABYLON_NATIVE_BLOCK_MICRO_GRID_METERS_V1: 0.5;
  readonly BABYLON_NATIVE_BLOCK_CENTER_LATTICE_METERS_V1: 0.25;
  readonly BABYLON_NATIVE_BLOCK_SIZE_METERS_XYZ_BY_SHAPE_V1: Readonly<{
    full: readonly [1, 1, 1];
    half: readonly [1, 0.5, 1];
    quarter: readonly [0.5, 0.5, 1];
    small: readonly [0.5, 0.5, 0.5];
  }>;
  effectiveBabylonNativeBlockSizeMetersXYZV1(
    shape: "full" | "half" | "quarter" | "small",
    rotationQuarterTurnsY: number,
  ): readonly [number, number, number];
  babylonNativeBlockBoundsFromCenterV1(input: Readonly<{
    shape: "full" | "half" | "quarter" | "small";
    centerMetersXYZ: readonly [number, number, number];
    rotationQuarterTurnsY: number;
  }>): Readonly<{
    minimumMetersXYZ: readonly [number, number, number];
    maximumMetersXYZ: readonly [number, number, number];
  }>;
  babylonNativeBlockCenterAlignsToGridV1(input: Readonly<{
    shape: "full" | "half" | "quarter" | "small";
    centerMetersXYZ: readonly [number, number, number];
    rotationQuarterTurnsY: number;
  }>): boolean;
  babylonNativeBlockOccupiedMicroCellKeysV1(input: Readonly<{
    shape: "full" | "half" | "quarter" | "small";
    centerMetersXYZ: readonly [number, number, number];
    rotationQuarterTurnsY: number;
  }>): readonly string[];
  canonicalizeBabylonNativeBlockEvidenceNumberV1(value: number): number;
}

async function loadShapes(): Promise<ShapesModule> {
  const modulePath = ["./", "shapes.js"].join("");
  return import(modulePath) as Promise<ShapesModule>;
}

describe("Babylon Native block shapes", () => {
  it("publishes the four fixed meter shapes and two grid quanta", async () => {
    const shapes = await loadShapes();

    expect(shapes.BABYLON_NATIVE_BLOCK_FULL_SIZE_METERS_V1).toBe(1);
    expect(shapes.BABYLON_NATIVE_BLOCK_MICRO_GRID_METERS_V1).toBe(0.5);
    expect(shapes.BABYLON_NATIVE_BLOCK_CENTER_LATTICE_METERS_V1).toBe(0.25);
    expect(shapes.BABYLON_NATIVE_BLOCK_SIZE_METERS_XYZ_BY_SHAPE_V1).toEqual({
      full: [1, 1, 1],
      half: [1, 0.5, 1],
      quarter: [0.5, 0.5, 1],
      small: [0.5, 0.5, 0.5],
    });
    expect(Object.isFrozen(
      shapes.BABYLON_NATIVE_BLOCK_SIZE_METERS_XYZ_BY_SHAPE_V1,
    )).toBe(true);
    expect(Object.values(
      shapes.BABYLON_NATIVE_BLOCK_SIZE_METERS_XYZ_BY_SHAPE_V1,
    ).every(Object.isFrozen)).toBe(true);
  });

  it("swaps only horizontal dimensions for odd Y quarter turns", async () => {
    const shapes = await loadShapes();

    expect(shapes.effectiveBabylonNativeBlockSizeMetersXYZV1("quarter", 0))
      .toEqual([0.5, 0.5, 1]);
    expect(shapes.effectiveBabylonNativeBlockSizeMetersXYZV1("quarter", 1))
      .toEqual([1, 0.5, 0.5]);
    expect(shapes.effectiveBabylonNativeBlockSizeMetersXYZV1("quarter", 3))
      .toEqual([1, 0.5, 0.5]);
    expect(shapes.effectiveBabylonNativeBlockSizeMetersXYZV1("half", 1))
      .toEqual([1, 0.5, 1]);
  });

  it("requires centers and resulting bounds to align with the profile grids", async () => {
    const shapes = await loadShapes();

    expect(shapes.babylonNativeBlockCenterAlignsToGridV1({
      shape: "full",
      centerMetersXYZ: [0, 0, 0],
      rotationQuarterTurnsY: 0,
    })).toBe(true);
    expect(shapes.babylonNativeBlockCenterAlignsToGridV1({
      shape: "half",
      centerMetersXYZ: [0, 0.25, 0],
      rotationQuarterTurnsY: 0,
    })).toBe(true);
    expect(shapes.babylonNativeBlockCenterAlignsToGridV1({
      shape: "quarter",
      centerMetersXYZ: [0.25, 0.25, 0],
      rotationQuarterTurnsY: 0,
    })).toBe(true);
    expect(shapes.babylonNativeBlockCenterAlignsToGridV1({
      shape: "quarter",
      centerMetersXYZ: [0, 0.25, 0.25],
      rotationQuarterTurnsY: 1,
    })).toBe(true);
    expect(shapes.babylonNativeBlockCenterAlignsToGridV1({
      shape: "full",
      centerMetersXYZ: [0.25, 0, 0],
      rotationQuarterTurnsY: 0,
    })).toBe(false);
  });

  it("derives literal bounds and occupied half-meter cells", async () => {
    const shapes = await loadShapes();

    expect(shapes.babylonNativeBlockBoundsFromCenterV1({
      shape: "quarter",
      centerMetersXYZ: [0.25, 0.25, 0],
      rotationQuarterTurnsY: 0,
    })).toEqual({
      minimumMetersXYZ: [0, 0, -0.5],
      maximumMetersXYZ: [0.5, 0.5, 0.5],
    });
    expect(shapes.babylonNativeBlockOccupiedMicroCellKeysV1({
      shape: "small",
      centerMetersXYZ: [0.25, 0.25, 0.25],
      rotationQuarterTurnsY: 0,
    })).toEqual(["0,0,0"]);
    expect(shapes.babylonNativeBlockOccupiedMicroCellKeysV1({
      shape: "full",
      centerMetersXYZ: [0, 0, 0],
      rotationQuarterTurnsY: 0,
    })).toEqual([
      "-1,-1,-1",
      "0,-1,-1",
      "-1,-1,0",
      "0,-1,0",
      "-1,0,-1",
      "0,0,-1",
      "-1,0,0",
      "0,0,0",
    ]);
  });

  it("canonicalizes signed zero only at evidence publication", async () => {
    const shapes = await loadShapes();

    const value = shapes.canonicalizeBabylonNativeBlockEvidenceNumberV1(-0);
    expect(value).toBe(0);
    expect(Object.is(value, -0)).toBe(false);
    expect(() => shapes.canonicalizeBabylonNativeBlockEvidenceNumberV1(
      Number.NaN,
    )).toThrow(/WORLDKIT_NATIVE_BLOCK_NUMBER_INVALID/);
  });
});
