import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";
import { parseBlockWorldChunkEntityIdV2 } from "@whitebox-world/block-world";
import type { CanonicalSceneObjectV1 } from "@whitebox-world/runtime-contracts";

import {
  blockWorldGroundStripeColorMultiplierV1,
  registerBlockWorldGroundStripeVertexColorsV1,
} from "./block-ground-stripe.js";
import type { WhiteboxMaterials } from "./materials.js";

export const BLOCK_WORLD_AUTO_SMOOTH_HEIGHT_DELTA_METERS_V1 = 1;
const VISUAL_SURFACE_OFFSET_METERS = 0.004;
const EPSILON = 1e-8;

interface WalkableTileV1 {
  readonly index: number;
  readonly entityId: string;
  readonly chunkKey: string;
  readonly materialSemanticClassId: string;
  readonly minimumXMeters: number;
  readonly maximumXMeters: number;
  readonly minimumZMeters: number;
  readonly maximumZMeters: number;
  readonly bottomMeters: number;
  readonly topMeters: number;
}

export interface BlockWalkableSurfaceTopologyV1 {
  readonly chunkKey: string;
  readonly materialSemanticClassId: string;
  readonly sourceEntityIds: readonly string[];
  readonly tileCount: number;
  readonly sharedTopVertexCount: number;
  readonly positionsMetersXYZ: readonly number[];
  readonly triangleIndices: readonly number[];
  readonly groundBoundarySegments: readonly BlockGroundBoundarySegmentV1[];
}

export interface BlockGroundBoundarySegmentV1 {
  readonly startMetersXYZ: readonly [number, number, number];
  readonly endMetersXYZ: readonly [number, number, number];
}

interface WalkableSurfaceTriangleV1 {
  readonly a: readonly [number, number, number];
  readonly b: readonly [number, number, number];
  readonly c: readonly [number, number, number];
  readonly denominator: number;
}

export type BlockWalkableSurfaceHeightSamplerV1 = (
  positionMetersXZ: readonly [number, number],
) => number | undefined;

function baseSemanticClassId(semanticClassId: string): string {
  return semanticClassId.split(".").slice(0, 2).join(".");
}

export function isSmoothableBlockObjectV1(object: CanonicalSceneObjectV1): boolean {
  const base = baseSemanticClassId(object.semanticClassId);
  return parseBlockWorldChunkEntityIdV2(object.entityId) !== undefined &&
    object.primitive.kind === "box" &&
    (base === "block.walkable" || base === "block.cloud-walkable");
}

function logicalBlockVolumes(object: CanonicalSceneObjectV1): readonly Readonly<{
  centerMetersXYZ: readonly [number, number, number];
  sizeMetersXYZ: readonly [number, number, number];
}>[] {
  if (parseBlockWorldChunkEntityIdV2(object.entityId) === undefined ||
      object.primitive.kind !== "box") return [];
  const repeat = object.transform.scaleXYZ;
  if (!repeat.every((value) => Number.isSafeInteger(value) && value > 0) ||
      !object.transform.rotationEulerRadiansXYZ.every((value) => value === 0)) {
    throw new Error(`BLOCK_WORLD_SMOOTH_SURFACE_CLUSTER_INVALID: ${object.entityId}`);
  }
  const baseSize = object.primitive.sizeMetersXYZ;
  const minimumCenter = repeat.map((value, axis) =>
    object.transform.positionMetersXYZ[axis]! - (value - 1) * baseSize[axis]! / 2
  ) as [number, number, number];
  const output = [];
  for (let y = 0; y < repeat[1]; y += 1) {
    for (let z = 0; z < repeat[2]; z += 1) {
      for (let x = 0; x < repeat[0]; x += 1) output.push(Object.freeze({
        centerMetersXYZ: Object.freeze([
          minimumCenter[0] + x * baseSize[0],
          minimumCenter[1] + y * baseSize[1],
          minimumCenter[2] + z * baseSize[2],
        ]) as readonly [number, number, number],
        sizeMetersXYZ: Object.freeze([...baseSize]) as readonly [number, number, number],
      }));
    }
  }
  return Object.freeze(output);
}

function walkableTiles(objects: readonly CanonicalSceneObjectV1[]): readonly WalkableTileV1[] {
  const occupiedSolidMicroCells = new Set<string>();
  for (const object of objects) {
    if (!object.collisionEnabled) continue;
    for (const volume of logicalBlockVolumes(object)) {
      const minimum = volume.centerMetersXYZ.map((value, axis) =>
        Math.round((value - volume.sizeMetersXYZ[axis]! / 2) * 2));
      const maximum = volume.centerMetersXYZ.map((value, axis) =>
        Math.round((value + volume.sizeMetersXYZ[axis]! / 2) * 2));
      for (let y = minimum[1]!; y < maximum[1]!; y += 1) {
        for (let z = minimum[2]!; z < maximum[2]!; z += 1) {
          for (let x = minimum[0]!; x < maximum[0]!; x += 1) {
            occupiedSolidMicroCells.add(`${x},${y},${z}`);
          }
        }
      }
    }
  }
  const tiles: WalkableTileV1[] = [];
  for (const object of objects) {
    if (!isSmoothableBlockObjectV1(object) || object.primitive.kind !== "box") continue;
    const parsed = parseBlockWorldChunkEntityIdV2(object.entityId)!;
    for (const volume of logicalBlockVolumes(object)) {
      const center = volume.centerMetersXYZ;
      const baseSize = volume.sizeMetersXYZ;
      const minimumX = center[0] - baseSize[0] / 2;
      const minimumZ = center[2] - baseSize[2] / 2;
      const bottomMeters = center[1] - baseSize[1] / 2;
      const topMeters = center[1] + baseSize[1] / 2;
      const exposedMicroCells: Array<readonly [number, number]> = [];
      for (let microZ = Math.round(minimumZ * 2);
        microZ < Math.round((center[2] + baseSize[2] / 2) * 2);
        microZ += 1) {
        for (let microX = Math.round(minimumX * 2);
          microX < Math.round((center[0] + baseSize[0] / 2) * 2);
          microX += 1) {
          const topMicroY = Math.round(topMeters * 2);
          if (occupiedSolidMicroCells.has(`${microX},${topMicroY},${microZ}`)) continue;
          exposedMicroCells.push(Object.freeze([microX, microZ]));
        }
      }
      const expectedMicroCellCount = Math.round(baseSize[0] * 2) *
        Math.round(baseSize[2] * 2);
      if (exposedMicroCells.length === expectedMicroCellCount) {
        tiles.push(Object.freeze({
          index: tiles.length,
          entityId: object.entityId,
          chunkKey: `${parsed.chunkX},${parsed.chunkZ}`,
          materialSemanticClassId: baseSemanticClassId(object.semanticClassId),
          minimumXMeters: minimumX,
          maximumXMeters: center[0] + baseSize[0] / 2,
          minimumZMeters: minimumZ,
          maximumZMeters: center[2] + baseSize[2] / 2,
          bottomMeters,
          topMeters,
        }));
      } else {
        for (const [microX, microZ] of exposedMicroCells) tiles.push(Object.freeze({
            index: tiles.length,
            entityId: object.entityId,
            chunkKey: `${parsed.chunkX},${parsed.chunkZ}`,
            materialSemanticClassId: baseSemanticClassId(object.semanticClassId),
            minimumXMeters: microX / 2,
            maximumXMeters: (microX + 1) / 2,
            minimumZMeters: microZ / 2,
            maximumZMeters: (microZ + 1) / 2,
            bottomMeters,
            topMeters,
        }));
      }
    }
  }
  return Object.freeze(tiles);
}

function cornerKey(xMeters: number, zMeters: number): string {
  return `${Math.round(xMeters * 2)},${Math.round(zMeters * 2)}`;
}

function edgeSegments(tile: WalkableTileV1): readonly Readonly<{
  key: string;
  oppositeKey: string;
  cornerIndexes: readonly [number, number];
}>[] {
  const minimumX = Math.round(tile.minimumXMeters * 2);
  const maximumX = Math.round(tile.maximumXMeters * 2);
  const minimumZ = Math.round(tile.minimumZMeters * 2);
  const maximumZ = Math.round(tile.maximumZMeters * 2);
  const output: Array<Readonly<{
    key: string;
    oppositeKey: string;
    cornerIndexes: readonly [number, number];
  }>> = [];
  for (let z = minimumZ; z < maximumZ; z += 1) {
    output.push({ key: `x:${minimumX}:${z}:min`, oppositeKey: `x:${minimumX}:${z}:max`, cornerIndexes: [3, 0] });
    output.push({ key: `x:${maximumX}:${z}:max`, oppositeKey: `x:${maximumX}:${z}:min`, cornerIndexes: [1, 2] });
  }
  for (let x = minimumX; x < maximumX; x += 1) {
    output.push({ key: `z:${minimumZ}:${x}:min`, oppositeKey: `z:${minimumZ}:${x}:max`, cornerIndexes: [0, 1] });
    output.push({ key: `z:${maximumZ}:${x}:max`, oppositeKey: `z:${maximumZ}:${x}:min`, cornerIndexes: [2, 3] });
  }
  return Object.freeze(output);
}

function addQuad(
  positions: number[],
  indices: number[],
  vertices: readonly (readonly [number, number, number])[],
): void {
  const offset = positions.length / 3;
  for (const vertex of vertices) positions.push(...vertex);
  indices.push(offset, offset + 2, offset + 1, offset, offset + 3, offset + 2);
}

function indexedVertexKey(
  vertex: readonly [number, number, number],
): string {
  return `${vertex[0]}:${vertex[1]}:${vertex[2]}`;
}

function addSharedTopQuad(
  positions: number[],
  indices: number[],
  vertexIndicesByPosition: Map<string, number>,
  vertices: readonly (readonly [number, number, number])[],
): void {
  const vertexIndices = vertices.map((vertex) => {
    const key = indexedVertexKey(vertex);
    const existing = vertexIndicesByPosition.get(key);
    if (existing !== undefined) return existing;
    const created = positions.length / 3;
    positions.push(...vertex);
    vertexIndicesByPosition.set(key, created);
    return created;
  });
  const diagonalZeroTwoDelta = Math.abs(vertices[0]![1] - vertices[2]![1]);
  const diagonalOneThreeDelta = Math.abs(vertices[1]![1] - vertices[3]![1]);
  if (diagonalOneThreeDelta < diagonalZeroTwoDelta) {
    indices.push(
      vertexIndices[0]!,
      vertexIndices[3]!,
      vertexIndices[1]!,
      vertexIndices[1]!,
      vertexIndices[3]!,
      vertexIndices[2]!,
    );
    return;
  }
  indices.push(
    vertexIndices[0]!,
    vertexIndices[2]!,
    vertexIndices[1]!,
    vertexIndices[0]!,
    vertexIndices[3]!,
    vertexIndices[2]!,
  );
}

function edgeSegmentEndpointsMetersXZ(key: string): readonly [
  readonly [number, number],
  readonly [number, number],
] {
  const [axis, lineToken, segmentToken] = key.split(":");
  const line = Number(lineToken) / 2;
  const segment = Number(segmentToken) / 2;
  return axis === "x"
    ? [[line, segment], [line, segment + 0.5]]
    : [[segment, line], [segment + 0.5, line]];
}

function tileHeightAt(
  tile: WalkableTileV1,
  topVertices: readonly (readonly [number, number, number])[],
  xMeters: number,
  zMeters: number,
): number {
  const u = (xMeters - tile.minimumXMeters) /
    (tile.maximumXMeters - tile.minimumXMeters);
  const v = (zMeters - tile.minimumZMeters) /
    (tile.maximumZMeters - tile.minimumZMeters);
  return topVertices[0]![1] * (1 - u) * (1 - v) +
    topVertices[1]![1] * u * (1 - v) +
    topVertices[2]![1] * u * v +
    topVertices[3]![1] * (1 - u) * v;
}

export function buildBlockWalkableSurfaceTopologiesV1(
  objects: readonly CanonicalSceneObjectV1[],
): readonly BlockWalkableSurfaceTopologyV1[] {
  const tiles = walkableTiles(objects);
  const cornerHeights = new Map<string, number[]>();
  const cornersByTile = new Map<number, readonly (readonly [number, number])[]>();
  for (const tile of tiles) {
    const corners = Object.freeze([
      Object.freeze([tile.minimumXMeters, tile.minimumZMeters]) as readonly [number, number],
      Object.freeze([tile.maximumXMeters, tile.minimumZMeters]) as readonly [number, number],
      Object.freeze([tile.maximumXMeters, tile.maximumZMeters]) as readonly [number, number],
      Object.freeze([tile.minimumXMeters, tile.maximumZMeters]) as readonly [number, number],
    ] as const) as readonly (readonly [number, number])[];
    cornersByTile.set(tile.index, corners);
    for (const [x, z] of corners) {
      const key = cornerKey(x, z);
      const heights = cornerHeights.get(key) ?? [];
      heights.push(tile.topMeters);
      cornerHeights.set(key, heights);
    }
  }
  const smoothedCornerHeight = (tile: WalkableTileV1, cornerIndex: number): number => {
    const [x, z] = cornersByTile.get(tile.index)![cornerIndex]!;
    const heights = cornerHeights.get(cornerKey(x, z)) ?? [tile.topMeters];
    const minimum = Math.min(...heights);
    const maximum = Math.max(...heights);
    if (maximum - minimum > BLOCK_WORLD_AUTO_SMOOTH_HEIGHT_DELTA_METERS_V1 + EPSILON) {
      return tile.topMeters;
    }
    return heights.reduce((sum, value) => sum + value, 0) / heights.length;
  };
  const edgeOwners = new Map<string, WalkableTileV1[]>();
  for (const tile of tiles) for (const edge of edgeSegments(tile)) {
    const owners = edgeOwners.get(edge.key) ?? [];
    owners.push(tile);
    edgeOwners.set(edge.key, owners);
  }
  const grouped = new Map<string, WalkableTileV1[]>();
  for (const tile of tiles) {
    const key = `${tile.chunkKey}\u0000${tile.materialSemanticClassId}`;
    const rows = grouped.get(key) ?? [];
    rows.push(tile);
    grouped.set(key, rows);
  }
  return Object.freeze([...grouped.entries()].sort(([left], [right]) =>
    left.localeCompare(right)).map(([, groupTiles]) => {
    const positions: number[] = [];
    const indices: number[] = [];
    const groundBoundarySegments: BlockGroundBoundarySegmentV1[] = [];
    const topVertexIndicesByPosition = new Map<string, number>();
    for (const tile of groupTiles) {
      const corners = cornersByTile.get(tile.index)!;
      const topVertices = corners.map(([x, z], index) => Object.freeze([
        x,
        smoothedCornerHeight(tile, index),
        z,
      ]) as readonly [number, number, number]);
      addSharedTopQuad(
        positions,
        indices,
        topVertexIndicesByPosition,
        topVertices,
      );
      for (const edge of edgeSegments(tile)) {
        const oppositeOwners = edgeOwners.get(edge.oppositeKey) ?? [];
        const connected = oppositeOwners.some((neighbor) =>
          neighbor.index !== tile.index &&
          Math.abs(neighbor.topMeters - tile.topMeters) <=
            BLOCK_WORLD_AUTO_SMOOTH_HEIGHT_DELTA_METERS_V1 + EPSILON);
        if (connected) continue;
        const [firstXZ, secondXZ] = edgeSegmentEndpointsMetersXZ(edge.key);
        const first = [
          firstXZ[0],
          tileHeightAt(tile, topVertices, firstXZ[0], firstXZ[1]),
          firstXZ[1],
        ] as const;
        const second = [
          secondXZ[0],
          tileHeightAt(tile, topVertices, secondXZ[0], secondXZ[1]),
          secondXZ[1],
        ] as const;
        const hasHigherBlockingNeighbor = oppositeOwners.some((neighbor) =>
          neighbor.index !== tile.index &&
          neighbor.topMeters > tile.topMeters + EPSILON);
        if (!hasHigherBlockingNeighbor) groundBoundarySegments.push(Object.freeze({
          startMetersXYZ: Object.freeze([...first]) as readonly [number, number, number],
          endMetersXYZ: Object.freeze([...second]) as readonly [number, number, number],
        }));
        addQuad(positions, indices, [
          first,
          second,
          [second[0], tile.bottomMeters, second[2]],
          [first[0], tile.bottomMeters, first[2]],
        ]);
      }
    }
    return Object.freeze({
      chunkKey: groupTiles[0]!.chunkKey,
      materialSemanticClassId: groupTiles[0]!.materialSemanticClassId,
      sourceEntityIds: Object.freeze([...new Set(groupTiles.map(({ entityId }) => entityId))].sort()),
      tileCount: groupTiles.length,
      sharedTopVertexCount: topVertexIndicesByPosition.size,
      positionsMetersXYZ: Object.freeze(positions),
      triangleIndices: Object.freeze(indices),
      groundBoundarySegments: Object.freeze(groundBoundarySegments.sort(
        (left, right) =>
          left.startMetersXYZ[0] - right.startMetersXYZ[0] ||
          left.startMetersXYZ[2] - right.startMetersXYZ[2] ||
          left.endMetersXYZ[0] - right.endMetersXYZ[0] ||
          left.endMetersXYZ[2] - right.endMetersXYZ[2] ||
          left.startMetersXYZ[1] - right.startMetersXYZ[1] ||
          left.endMetersXYZ[1] - right.endMetersXYZ[1],
      )),
    });
  }));
}

export function createBlockWalkableSurfaceHeightSamplerV1(
  topologies: readonly BlockWalkableSurfaceTopologyV1[],
): BlockWalkableSurfaceHeightSamplerV1 {
  const trianglesByMicroCell = new Map<string, WalkableSurfaceTriangleV1[]>();
  for (const topology of topologies) {
    const position = (index: number): readonly [number, number, number] => [
      topology.positionsMetersXYZ[index * 3]!,
      topology.positionsMetersXYZ[index * 3 + 1]!,
      topology.positionsMetersXYZ[index * 3 + 2]!,
    ];
    for (let index = 0; index < topology.triangleIndices.length; index += 3) {
      const a = position(topology.triangleIndices[index]!);
      const b = position(topology.triangleIndices[index + 1]!);
      const c = position(topology.triangleIndices[index + 2]!);
      const upwardProjectedArea =
        (b[2] - a[2]) * (c[0] - a[0]) -
        (b[0] - a[0]) * (c[2] - a[2]);
      if (upwardProjectedArea <= EPSILON) continue;
      const denominator =
        (b[2] - c[2]) * (a[0] - c[0]) +
        (c[0] - b[0]) * (a[2] - c[2]);
      if (Math.abs(denominator) <= EPSILON) continue;
      const triangle = Object.freeze({ a, b, c, denominator });
      const minimumMicroX = Math.floor(Math.min(a[0], b[0], c[0]) * 2);
      const maximumMicroX = Math.floor(Math.max(a[0], b[0], c[0]) * 2);
      const minimumMicroZ = Math.floor(Math.min(a[2], b[2], c[2]) * 2);
      const maximumMicroZ = Math.floor(Math.max(a[2], b[2], c[2]) * 2);
      for (let microZ = minimumMicroZ; microZ <= maximumMicroZ; microZ += 1) {
        for (let microX = minimumMicroX; microX <= maximumMicroX; microX += 1) {
          const key = `${microX},${microZ}`;
          const rows = trianglesByMicroCell.get(key) ?? [];
          rows.push(triangle);
          trianglesByMicroCell.set(key, rows);
        }
      }
    }
  }
  return ([xMeters, zMeters]) => {
    const candidates = trianglesByMicroCell.get(
      `${Math.floor(xMeters * 2)},${Math.floor(zMeters * 2)}`,
    ) ?? [];
    let highest: number | undefined;
    for (const { a, b, c, denominator } of candidates) {
      const weightA = (
        (b[2] - c[2]) * (xMeters - c[0]) +
        (c[0] - b[0]) * (zMeters - c[2])
      ) / denominator;
      const weightB = (
        (c[2] - a[2]) * (xMeters - c[0]) +
        (a[0] - c[0]) * (zMeters - c[2])
      ) / denominator;
      const weightC = 1 - weightA - weightB;
      if (weightA < -EPSILON || weightB < -EPSILON || weightC < -EPSILON) {
        continue;
      }
      const heightMeters =
        weightA * a[1] + weightB * b[1] + weightC * c[1];
      highest = highest === undefined
        ? heightMeters
        : Math.max(highest, heightMeters);
    }
    return highest;
  };
}

export function createBlockWalkableSurfaceMeshesV1(
  topologies: readonly BlockWalkableSurfaceTopologyV1[],
  materials: WhiteboxMaterials,
  scene: Scene,
): readonly Mesh[] {
  return Object.freeze(topologies.map((topology, index) => {
    const positions = [...topology.positionsMetersXYZ];
    for (let offset = 1; offset < positions.length; offset += 3) {
      positions[offset] = positions[offset]! + VISUAL_SURFACE_OFFSET_METERS;
    }
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, topology.triangleIndices, normals);
    for (let normalIndex = 0; normalIndex < normals.length; normalIndex += 1) {
      normals[normalIndex] = -normals[normalIndex]!;
    }
    const mesh = new Mesh(`worldkit.block-walkable-surface.${index.toString(36)}`, scene);
    const data = new VertexData();
    data.positions = positions;
    data.indices = [...topology.triangleIndices];
    data.normals = normals;
    data.applyToMesh(mesh, false);
    if (topology.materialSemanticClassId === "block.walkable") {
      const colorBuffer = new Float32Array(positions.length / 3 * 4);
      for (let offset = 0; offset < positions.length; offset += 3) {
        colorBuffer.set(blockWorldGroundStripeColorMultiplierV1([
          positions[offset]!,
          positions[offset + 1]!,
          positions[offset + 2]!,
        ]), offset / 3 * 4);
      }
      registerBlockWorldGroundStripeVertexColorsV1(mesh, colorBuffer);
    }
    mesh.overrideMaterialSideOrientation = Mesh.DOUBLESIDE;
    const material = materials.blockBySemanticClassId.get(topology.materialSemanticClassId) ??
      materials.terrain;
    material.backFaceCulling = false;
    material.twoSidedLighting = true;
    mesh.material = material;
    mesh.metadata = {
      worldkitEntityId: topology.sourceEntityIds[0],
      worldkitEntityIds: topology.sourceEntityIds,
      blockWorldSmoothSurfaceChunkKey: topology.chunkKey,
      blockWorldSmoothSurfaceTileCount: topology.tileCount,
    };
    return mesh;
  }));
}
