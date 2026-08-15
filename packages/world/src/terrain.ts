import { BufferAttribute, BufferGeometry } from "three";

import type { Vec2Tuple, Vec3Tuple } from "@whitebox-world/contracts";

import { SeededNoise2D, type Seed } from "./random";
import type { FalloffCurve, Shape2D } from "./shapes";

export interface HeightfieldSpec {
  width: number;
  depth: number;
  xSegments: number;
  zSegments: number;
  baseHeight?: number;
  origin?: Vec2Tuple;
}

export interface TerrainNoiseOptions {
  seed: Seed;
  amplitude: number;
  frequency: number;
  octaves?: number;
  lacunarity?: number;
  persistence?: number;
  offset?: Vec2Tuple;
  mode?: "add" | "set";
}

/** A serializable, row-major scalar field that an agent can generate or import. */
export interface ScalarRasterField {
  columns: number;
  rows: number;
  values: readonly number[];
}

export interface RasterWorldBounds {
  center: Vec2Tuple;
  size: Vec2Tuple;
}

/**
 * Projects one global scalar field onto terrain in world space. `set` treats
 * field values as absolute heights; `add` treats them as height deltas. A mask
 * is optional and is sampled in the same world bounds.
 */
export interface TerrainRasterOperation {
  field: ScalarRasterField;
  bounds: RasterWorldBounds;
  mask?: ScalarRasterField;
  mode?: "set" | "add" | "min" | "max";
  strength?: number;
}

export interface ShapedTerrainOperation {
  area: Shape2D;
  falloffWidth?: number;
  curve?: FalloffCurve;
}

export interface TerrainAmountOperation extends ShapedTerrainOperation {
  amount: number;
}

export interface TerrainFlattenOperation extends ShapedTerrainOperation {
  height: number;
  strength?: number;
}

export interface TerrainSmoothOperation {
  iterations?: number;
  strength?: number;
  area?: Shape2D;
  falloffWidth?: number;
  curve?: FalloffCurve;
}

export interface TerrainBasinOperation extends ShapedTerrainOperation {
  waterLevel: number;
  minimumDepth: number;
  shoreWidth: number;
}

export interface HeightfieldGridSpec {
  tileSize: Vec2Tuple;
  tiles: Vec2Tuple;
  segmentsPerTile: Vec2Tuple;
  baseHeight?: number;
  origin?: Vec2Tuple;
}

export interface TerrainSurface {
  readonly width: number;
  readonly depth: number;
  readonly origin: Vec2Tuple;
  readonly vertexCount: number;
  readonly triangleCount: number;
  applyNoise(options: TerrainNoiseOptions): this;
  applyRaster(options: TerrainRasterOperation): this;
  raise(options: TerrainAmountOperation): this;
  lower(options: TerrainAmountOperation): this;
  flatten(options: TerrainFlattenOperation): this;
  carveBasin(options: TerrainBasinOperation): this;
  smooth(options?: TerrainSmoothOperation): this;
  sampleHeight(x: number, z: number): number | undefined;
  clone(): TerrainSurface;
  copyFrom(source: TerrainSurface): this;
  forEachHeightfield(visitor: (heightfield: Heightfield) => void): void;
}

/** Samples the local heightfield gradient and returns its inclination in degrees. */
function sampleTerrainGradient(
  terrain: TerrainSurface,
  x: number,
  z: number,
  sampleDistance = 1,
): readonly [xGradient: number, zGradient: number] | undefined {
  if (!(sampleDistance > 0) || !Number.isFinite(sampleDistance)) {
    throw new RangeError("Terrain slope sampleDistance must be finite and greater than zero.");
  }
  const center = terrain.sampleHeight(x, z);
  if (center === undefined) return undefined;
  const left = terrain.sampleHeight(x - sampleDistance, z);
  const right = terrain.sampleHeight(x + sampleDistance, z);
  const back = terrain.sampleHeight(x, z - sampleDistance);
  const front = terrain.sampleHeight(x, z + sampleDistance);
  const xGradient = left !== undefined && right !== undefined
    ? (right - left) / (sampleDistance * 2)
    : right !== undefined
      ? (right - center) / sampleDistance
      : left !== undefined
        ? (center - left) / sampleDistance
        : undefined;
  const zGradient = back !== undefined && front !== undefined
    ? (front - back) / (sampleDistance * 2)
    : front !== undefined
      ? (front - center) / sampleDistance
      : back !== undefined
        ? (center - back) / sampleDistance
        : undefined;
  return xGradient === undefined || zGradient === undefined
    ? undefined
    : [xGradient, zGradient];
}

export function sampleTerrainSlopeDegrees(
  terrain: TerrainSurface,
  x: number,
  z: number,
  sampleDistance = 1,
): number | undefined {
  const gradient = sampleTerrainGradient(terrain, x, z, sampleDistance);
  return gradient === undefined
    ? undefined
    : Math.atan(Math.hypot(gradient[0], gradient[1])) * (180 / Math.PI);
}

/** Returns a lighting normal derived from the complete terrain surface. */
export function sampleTerrainNormal(
  terrain: TerrainSurface,
  x: number,
  z: number,
  sampleDistance = 1,
): Vec3Tuple | undefined {
  const gradient = sampleTerrainGradient(terrain, x, z, sampleDistance);
  if (gradient === undefined) return undefined;
  const length = Math.hypot(gradient[0], 1, gradient[1]);
  return [-gradient[0] / length, 1 / length, -gradient[1] / length];
}

export interface HeightfieldGeometryData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) throw new RangeError(`${label} must be a positive integer.`);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function validateScalarRasterField(field: ScalarRasterField): void {
  assertPositiveInteger(field.columns, "raster columns");
  assertPositiveInteger(field.rows, "raster rows");
  if (field.columns < 2 || field.rows < 2) {
    throw new RangeError("Raster fields require at least two columns and two rows.");
  }
  if (field.values.length !== field.columns * field.rows) {
    throw new RangeError(
      `Raster field expected ${field.columns * field.rows} values, received ${field.values.length}.`,
    );
  }
  if (field.values.some((value) => !Number.isFinite(value))) {
    throw new TypeError("Raster field values must all be finite numbers.");
  }
}

/** Builds a compact, deterministic field from an agent-authored sampler. */
export function createScalarRasterField(
  columns: number,
  rows: number,
  sample: (u: number, v: number, column: number, row: number) => number,
): ScalarRasterField {
  const values: number[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      values.push(sample(column / Math.max(1, columns - 1), row / Math.max(1, rows - 1), column, row));
    }
  }
  const field = { columns, rows, values };
  validateScalarRasterField(field);
  return field;
}

function sampleScalarRasterFieldUnchecked(field: ScalarRasterField, u: number, v: number): number {
  const x = clamp01(u) * (field.columns - 1);
  const z = clamp01(v) * (field.rows - 1);
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const x1 = Math.min(field.columns - 1, x0 + 1);
  const z1 = Math.min(field.rows - 1, z0 + 1);
  const tx = x - x0;
  const tz = z - z0;
  const at = (column: number, row: number) => field.values[row * field.columns + column] ?? 0;
  const top = at(x0, z0) * (1 - tx) + at(x1, z0) * tx;
  const bottom = at(x0, z1) * (1 - tx) + at(x1, z1) * tx;
  return top * (1 - tz) + bottom * tz;
}

/** Validates once and returns a fast bilinear sampler for repeated use. */
export function createScalarRasterSampler(
  field: ScalarRasterField,
): (u: number, v: number) => number {
  validateScalarRasterField(field);
  return (u, v) => sampleScalarRasterFieldUnchecked(field, u, v);
}

/** Bilinearly samples a scalar field; u/v are normalized and clamped. */
export function sampleScalarRasterField(field: ScalarRasterField, u: number, v: number): number {
  return createScalarRasterSampler(field)(u, v);
}

function validateRasterOperation(options: TerrainRasterOperation): void {
  validateScalarRasterField(options.field);
  if (options.mask !== undefined) validateScalarRasterField(options.mask);
  if (
    options.bounds.center.some((value) => !Number.isFinite(value)) ||
    options.bounds.size.some((value) => !Number.isFinite(value) || value <= 0)
  ) {
    throw new RangeError("Raster world bounds require a finite center and positive size.");
  }
  if (options.strength !== undefined && !Number.isFinite(options.strength)) {
    throw new TypeError("Raster strength must be finite.");
  }
}

function shapeFalloff(value: number, curve: FalloffCurve): number {
  const amount = clamp01(value);
  if (curve === "linear") return amount;
  if (curve === "smooth") return amount * amount * (3 - 2 * amount);
  return amount * amount * amount * (amount * (amount * 6 - 15) + 10);
}

export class Heightfield implements TerrainSurface {
  readonly width: number;
  readonly depth: number;
  readonly xSegments: number;
  readonly zSegments: number;
  readonly origin: Vec2Tuple;
  readonly heights: Float32Array;

  constructor(spec: HeightfieldSpec) {
    if (!(spec.width > 0 && spec.depth > 0)) throw new RangeError("Heightfield size must be greater than zero.");
    assertPositiveInteger(spec.xSegments, "xSegments");
    assertPositiveInteger(spec.zSegments, "zSegments");
    this.width = spec.width;
    this.depth = spec.depth;
    this.xSegments = spec.xSegments;
    this.zSegments = spec.zSegments;
    this.origin = spec.origin ? [...spec.origin] : [0, 0];
    this.heights = new Float32Array((this.xSegments + 1) * (this.zSegments + 1));
    this.heights.fill(spec.baseHeight ?? 0);
  }

  get vertexCount(): number {
    return this.heights.length;
  }

  get triangleCount(): number {
    return this.xSegments * this.zSegments * 2;
  }

  index(xIndex: number, zIndex: number): number {
    if (xIndex < 0 || xIndex > this.xSegments || zIndex < 0 || zIndex > this.zSegments) {
      throw new RangeError(`Heightfield index (${xIndex}, ${zIndex}) is out of range.`);
    }
    return zIndex * (this.xSegments + 1) + xIndex;
  }

  pointAt(xIndex: number, zIndex: number): Vec2Tuple {
    return [
      this.origin[0] - this.width / 2 + (xIndex / this.xSegments) * this.width,
      this.origin[1] - this.depth / 2 + (zIndex / this.zSegments) * this.depth,
    ];
  }

  getHeight(xIndex: number, zIndex: number): number {
    return this.heights[this.index(xIndex, zIndex)] ?? 0;
  }

  setHeight(xIndex: number, zIndex: number, height: number): this {
    this.heights[this.index(xIndex, zIndex)] = height;
    return this;
  }

  clone(): Heightfield {
    const clone = new Heightfield({
      width: this.width,
      depth: this.depth,
      xSegments: this.xSegments,
      zSegments: this.zSegments,
      origin: this.origin,
    });
    clone.heights.set(this.heights);
    return clone;
  }

  copyFrom(source: Heightfield): this {
    if (
      source.width !== this.width ||
      source.depth !== this.depth ||
      source.xSegments !== this.xSegments ||
      source.zSegments !== this.zSegments
    ) {
      throw new Error("Cannot copy a heightfield with different dimensions.");
    }
    this.heights.set(source.heights);
    return this;
  }

  forEachHeightfield(visitor: (heightfield: Heightfield) => void): void {
    visitor(this);
  }

  applyNoise(options: TerrainNoiseOptions): this {
    if (!(options.frequency > 0)) throw new RangeError("Noise frequency must be greater than zero.");
    const noise = new SeededNoise2D(options.seed);
    const offset = options.offset ?? [0, 0];
    for (let zIndex = 0; zIndex <= this.zSegments; zIndex += 1) {
      for (let xIndex = 0; xIndex <= this.xSegments; xIndex += 1) {
        const point = this.pointAt(xIndex, zIndex);
        const sample = noise.fractal(
          (point[0] + offset[0]) * options.frequency,
          (point[1] + offset[1]) * options.frequency,
          options,
        );
        const index = this.index(xIndex, zIndex);
        const value = sample * options.amplitude;
        this.heights[index] = options.mode === "set" ? value : (this.heights[index] ?? 0) + value;
      }
    }
    return this;
  }

  applyRaster(options: TerrainRasterOperation): this {
    validateRasterOperation(options);
    const minimumX = options.bounds.center[0] - options.bounds.size[0] / 2;
    const minimumZ = options.bounds.center[1] - options.bounds.size[1] / 2;
    const strength = clamp01(options.strength ?? 1);
    const sampleField = createScalarRasterSampler(options.field);
    const sampleMask = options.mask === undefined
      ? undefined
      : createScalarRasterSampler(options.mask);
    for (let zIndex = 0; zIndex <= this.zSegments; zIndex += 1) {
      for (let xIndex = 0; xIndex <= this.xSegments; xIndex += 1) {
        const [x, z] = this.pointAt(xIndex, zIndex);
        const u = (x - minimumX) / options.bounds.size[0];
        const v = (z - minimumZ) / options.bounds.size[1];
        if (u < 0 || u > 1 || v < 0 || v > 1) continue;
        const sampled = sampleField(u, v);
        const mask = sampleMask === undefined ? 1 : clamp01(sampleMask(u, v));
        const influence = strength * mask;
        if (influence <= 0) continue;
        const index = this.index(xIndex, zIndex);
        const current = this.heights[index] ?? 0;
        const target = options.mode === "add"
          ? current + sampled
          : options.mode === "min"
            ? Math.min(current, sampled)
            : options.mode === "max"
              ? Math.max(current, sampled)
              : sampled;
        this.heights[index] = current + (target - current) * influence;
      }
    }
    return this;
  }

  private applyShaped(
    options: ShapedTerrainOperation,
    update: (height: number, influence: number) => number,
  ): this {
    for (let zIndex = 0; zIndex <= this.zSegments; zIndex += 1) {
      for (let xIndex = 0; xIndex <= this.xSegments; xIndex += 1) {
        const influence = options.area.influence(
          this.pointAt(xIndex, zIndex),
          options.falloffWidth ?? 0,
          options.curve ?? "smooth",
        );
        if (influence <= 0) continue;
        const index = this.index(xIndex, zIndex);
        this.heights[index] = update(this.heights[index] ?? 0, influence);
      }
    }
    return this;
  }

  raise(options: TerrainAmountOperation): this {
    if (options.amount < 0) throw new RangeError("Raise amount cannot be negative.");
    return this.applyShaped(options, (height, influence) => height + options.amount * influence);
  }

  lower(options: TerrainAmountOperation): this {
    if (options.amount < 0) throw new RangeError("Lower amount cannot be negative.");
    return this.applyShaped(options, (height, influence) => height - options.amount * influence);
  }

  flatten(options: TerrainFlattenOperation): this {
    const strength = clamp01(options.strength ?? 1);
    return this.applyShaped(options, (height, influence) => {
      const amount = strength * influence;
      return height + (options.height - height) * amount;
    });
  }

  carveBasin(options: TerrainBasinOperation): this {
    if (!(options.minimumDepth > 0)) {
      throw new RangeError("Basin minimumDepth must be greater than zero.");
    }
    if (options.shoreWidth < 0) {
      throw new RangeError("Basin shoreWidth cannot be negative.");
    }
    for (let zIndex = 0; zIndex <= this.zSegments; zIndex += 1) {
      for (let xIndex = 0; xIndex <= this.xSegments; xIndex += 1) {
        const distance = options.area.signedDistance(this.pointAt(xIndex, zIndex));
        if (distance > options.shoreWidth) continue;
        const index = this.index(xIndex, zIndex);
        const currentHeight = this.heights[index] ?? 0;
        if (distance <= 0) {
          const depthAmount =
            options.shoreWidth === 0
              ? 1
              : shapeFalloff(-distance / options.shoreWidth, options.curve ?? "smoother");
          this.heights[index] =
            options.waterLevel - options.minimumDepth * depthAmount;
          continue;
        }

        // Pull the surrounding terrain down/up toward the water line as a
        // separate outer bank. Without this band, a lake cut into noisy
        // terrain can create a vertical wall exactly at the water boundary.
        if (options.shoreWidth > 0) {
          const bankInfluence = shapeFalloff(
            1 - distance / options.shoreWidth,
            options.curve ?? "smoother",
          );
          this.heights[index] =
            currentHeight + (options.waterLevel - currentHeight) * bankInfluence;
        }
      }
    }
    return this;
  }

  smooth(options: TerrainSmoothOperation = {}): this {
    const iterations = Math.max(1, Math.floor(options.iterations ?? 1));
    const strength = clamp01(options.strength ?? 1);
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const previous = this.heights.slice();
      for (let zIndex = 0; zIndex <= this.zSegments; zIndex += 1) {
        for (let xIndex = 0; xIndex <= this.xSegments; xIndex += 1) {
          const influence = options.area
            ? options.area.influence(
                this.pointAt(xIndex, zIndex),
                options.falloffWidth ?? 0,
                options.curve ?? "smooth",
              )
            : 1;
          if (influence <= 0) continue;
          let total = 0;
          let count = 0;
          for (let dz = -1; dz <= 1; dz += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              const sampleX = xIndex + dx;
              const sampleZ = zIndex + dz;
              if (sampleX < 0 || sampleX > this.xSegments || sampleZ < 0 || sampleZ > this.zSegments) continue;
              total += previous[this.index(sampleX, sampleZ)] ?? 0;
              count += 1;
            }
          }
          const index = this.index(xIndex, zIndex);
          const current = previous[index] ?? 0;
          this.heights[index] = current + (total / count - current) * strength * influence;
        }
      }
    }
    return this;
  }

  sampleHeight(x: number, z: number): number | undefined {
    const localX = ((x - this.origin[0] + this.width / 2) / this.width) * this.xSegments;
    const localZ = ((z - this.origin[1] + this.depth / 2) / this.depth) * this.zSegments;
    if (localX < 0 || localX > this.xSegments || localZ < 0 || localZ > this.zSegments) return undefined;
    const x0 = Math.floor(localX);
    const z0 = Math.floor(localZ);
    const x1 = Math.min(this.xSegments, x0 + 1);
    const z1 = Math.min(this.zSegments, z0 + 1);
    const tx = localX - x0;
    const tz = localZ - z0;
    const top = this.getHeight(x0, z0) * (1 - tx) + this.getHeight(x1, z0) * tx;
    const bottom = this.getHeight(x0, z1) * (1 - tx) + this.getHeight(x1, z1) * tx;
    return top * (1 - tz) + bottom * tz;
  }

  toGeometryData(normalSource: TerrainSurface = this): HeightfieldGeometryData {
    const positions = new Float32Array(this.vertexCount * 3);
    const normals = new Float32Array(this.vertexCount * 3);
    const uvs = new Float32Array(this.vertexCount * 2);
    const indices = new Uint32Array(this.triangleCount * 3);
    let vertexOffset = 0;
    let uvOffset = 0;
    const normalSampleDistance = Math.min(
      this.width / this.xSegments,
      this.depth / this.zSegments,
    );

    for (let zIndex = 0; zIndex <= this.zSegments; zIndex += 1) {
      for (let xIndex = 0; xIndex <= this.xSegments; xIndex += 1) {
        const point = this.pointAt(xIndex, zIndex);
        positions[vertexOffset] = point[0];
        positions[vertexOffset + 1] = this.getHeight(xIndex, zIndex);
        positions[vertexOffset + 2] = point[1];
        const normal = sampleTerrainNormal(
          normalSource,
          point[0],
          point[1],
          normalSampleDistance,
        ) ?? [0, 1, 0];
        normals[vertexOffset] = normal[0];
        normals[vertexOffset + 1] = normal[1];
        normals[vertexOffset + 2] = normal[2];
        vertexOffset += 3;
        uvs[uvOffset] = xIndex / this.xSegments;
        uvs[uvOffset + 1] = zIndex / this.zSegments;
        uvOffset += 2;
      }
    }

    let indexOffset = 0;
    for (let zIndex = 0; zIndex < this.zSegments; zIndex += 1) {
      for (let xIndex = 0; xIndex < this.xSegments; xIndex += 1) {
        const topLeft = this.index(xIndex, zIndex);
        const topRight = this.index(xIndex + 1, zIndex);
        const bottomLeft = this.index(xIndex, zIndex + 1);
        const bottomRight = this.index(xIndex + 1, zIndex + 1);
        indices.set([topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight], indexOffset);
        indexOffset += 6;
      }
    }

    return { positions, normals, uvs, indices };
  }

  toBufferGeometry(normalSource: TerrainSurface = this): BufferGeometry {
    const data = this.toGeometryData(normalSource);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(data.positions, 3));
    geometry.setAttribute("normal", new BufferAttribute(data.normals, 3));
    geometry.setAttribute("uv", new BufferAttribute(data.uvs, 2));
    geometry.setIndex(new BufferAttribute(data.indices, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

/** A deterministic grid of independently renderable/collidable heightfield tiles. */
export class HeightfieldGrid implements TerrainSurface {
  readonly tileSize: Vec2Tuple;
  readonly tileCounts: Vec2Tuple;
  readonly segmentsPerTile: Vec2Tuple;
  readonly origin: Vec2Tuple;
  readonly tiles: readonly Heightfield[];
  readonly width: number;
  readonly depth: number;

  constructor(spec: HeightfieldGridSpec) {
    if (!(spec.tileSize[0] > 0 && spec.tileSize[1] > 0)) {
      throw new RangeError("HeightfieldGrid tileSize must be positive.");
    }
    for (const [value, label] of [
      [spec.tiles[0], "tiles.x"],
      [spec.tiles[1], "tiles.z"],
      [spec.segmentsPerTile[0], "segmentsPerTile.x"],
      [spec.segmentsPerTile[1], "segmentsPerTile.z"],
    ] as const) {
      assertPositiveInteger(value, label);
    }
    this.tileSize = [...spec.tileSize];
    this.tileCounts = [...spec.tiles];
    this.segmentsPerTile = [...spec.segmentsPerTile];
    this.origin = spec.origin ? [...spec.origin] : [0, 0];
    this.width = this.tileSize[0] * this.tileCounts[0];
    this.depth = this.tileSize[1] * this.tileCounts[1];
    const tiles: Heightfield[] = [];
    for (let z = 0; z < this.tileCounts[1]; z += 1) {
      for (let x = 0; x < this.tileCounts[0]; x += 1) {
        tiles.push(
          new Heightfield({
            width: this.tileSize[0],
            depth: this.tileSize[1],
            xSegments: this.segmentsPerTile[0],
            zSegments: this.segmentsPerTile[1],
            ...(spec.baseHeight === undefined ? {} : { baseHeight: spec.baseHeight }),
            origin: [
              this.origin[0] - this.width / 2 + (x + 0.5) * this.tileSize[0],
              this.origin[1] - this.depth / 2 + (z + 0.5) * this.tileSize[1],
            ],
          }),
        );
      }
    }
    this.tiles = tiles;
  }

  get vertexCount(): number {
    return this.tiles.reduce((total, tile) => total + tile.vertexCount, 0);
  }

  get triangleCount(): number {
    return this.tiles.reduce((total, tile) => total + tile.triangleCount, 0);
  }

  clone(): HeightfieldGrid {
    const clone = new HeightfieldGrid({
      tileSize: this.tileSize,
      tiles: this.tileCounts,
      segmentsPerTile: this.segmentsPerTile,
      origin: this.origin,
    });
    return clone.copyFrom(this);
  }

  copyFrom(source: TerrainSurface): this {
    if (!(source instanceof HeightfieldGrid)) {
      throw new TypeError("HeightfieldGrid can only copy from another HeightfieldGrid.");
    }
    if (
      source.tiles.length !== this.tiles.length ||
      source.width !== this.width ||
      source.depth !== this.depth ||
      source.segmentsPerTile[0] !== this.segmentsPerTile[0] ||
      source.segmentsPerTile[1] !== this.segmentsPerTile[1]
    ) {
      throw new Error("Cannot copy a heightfield grid with different dimensions.");
    }
    for (let index = 0; index < this.tiles.length; index += 1) {
      this.tiles[index]?.copyFrom(source.tiles[index] as Heightfield);
    }
    return this;
  }

  forEachHeightfield(visitor: (heightfield: Heightfield) => void): void {
    for (const tile of this.tiles) visitor(tile);
  }

  applyNoise(options: TerrainNoiseOptions): this {
    for (const tile of this.tiles) tile.applyNoise(options);
    return this;
  }

  applyRaster(options: TerrainRasterOperation): this {
    // Every tile samples the same world-space field, so shared vertices receive
    // bit-identical heights and cannot open visible seams.
    for (const tile of this.tiles) tile.applyRaster(options);
    return this;
  }

  raise(options: TerrainAmountOperation): this {
    for (const tile of this.tiles) tile.raise(options);
    return this;
  }

  lower(options: TerrainAmountOperation): this {
    for (const tile of this.tiles) tile.lower(options);
    return this;
  }

  flatten(options: TerrainFlattenOperation): this {
    for (const tile of this.tiles) tile.flatten(options);
    return this;
  }

  carveBasin(options: TerrainBasinOperation): this {
    for (const tile of this.tiles) tile.carveBasin(options);
    return this;
  }

  smooth(options: TerrainSmoothOperation = {}): this {
    for (const tile of this.tiles) tile.smooth(options);
    this.synchronizeSharedEdges();
    return this;
  }

  private synchronizeSharedEdges(): void {
    const [tileCountX, tileCountZ] = this.tileCounts;
    const [segmentsX, segmentsZ] = this.segmentsPerTile;
    for (let tileZ = 0; tileZ < tileCountZ; tileZ += 1) {
      for (let tileX = 0; tileX < tileCountX - 1; tileX += 1) {
        const left = this.tiles[tileZ * tileCountX + tileX];
        const right = this.tiles[tileZ * tileCountX + tileX + 1];
        if (left === undefined || right === undefined) continue;
        for (let zIndex = 0; zIndex <= segmentsZ; zIndex += 1) {
          const height = (left.getHeight(segmentsX, zIndex) + right.getHeight(0, zIndex)) / 2;
          left.setHeight(segmentsX, zIndex, height);
          right.setHeight(0, zIndex, height);
        }
      }
    }
    for (let tileZ = 0; tileZ < tileCountZ - 1; tileZ += 1) {
      for (let tileX = 0; tileX < tileCountX; tileX += 1) {
        const back = this.tiles[tileZ * tileCountX + tileX];
        const front = this.tiles[(tileZ + 1) * tileCountX + tileX];
        if (back === undefined || front === undefined) continue;
        for (let xIndex = 0; xIndex <= segmentsX; xIndex += 1) {
          const height = (back.getHeight(xIndex, segmentsZ) + front.getHeight(xIndex, 0)) / 2;
          back.setHeight(xIndex, segmentsZ, height);
          front.setHeight(xIndex, 0, height);
        }
      }
    }
  }

  sampleHeight(x: number, z: number): number | undefined {
    const minimumX = this.origin[0] - this.width / 2;
    const minimumZ = this.origin[1] - this.depth / 2;
    const localX = x - minimumX;
    const localZ = z - minimumZ;
    if (localX < 0 || localX > this.width || localZ < 0 || localZ > this.depth) {
      return undefined;
    }
    const tileX = Math.min(
      this.tileCounts[0] - 1,
      Math.floor(localX / this.tileSize[0]),
    );
    const tileZ = Math.min(
      this.tileCounts[1] - 1,
      Math.floor(localZ / this.tileSize[1]),
    );
    return this.tiles[tileZ * this.tileCounts[0] + tileX]?.sampleHeight(x, z);
  }
}

export function isTerrainSurface(value: unknown): value is TerrainSurface {
  return value instanceof Heightfield || value instanceof HeightfieldGrid;
}
