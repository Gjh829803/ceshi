import type { BlockPositionMetersXYZV2 } from "./types.js";

export const BLOCK_WORLD_CHUNK_SIZE_METERS_V2 = 32;

export interface BlockWorldChunkCoordinateXZV2 {
  readonly chunkX: number;
  readonly chunkZ: number;
}

function assertChunkCoordinate(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError("Block World chunk coordinates must be safe integers.");
  }
}

function signedToken(value: number): string {
  assertChunkCoordinate(value);
  return `${value < 0 ? "n" : "p"}${Math.abs(value).toString(36)}`;
}

function signedValue(token: string): number | undefined {
  const sign = token[0];
  const magnitude = Number.parseInt(token.slice(1), 36);
  if ((sign !== "p" && sign !== "n") || !Number.isSafeInteger(magnitude)) {
    return undefined;
  }
  const value = sign === "n" ? -magnitude : magnitude;
  return Object.is(value, -0) ? 0 : value;
}

export function blockWorldChunkCoordinateV2(
  positionMetersXYZ: BlockPositionMetersXYZV2,
): BlockWorldChunkCoordinateXZV2 {
  return Object.freeze({
    chunkX: Math.floor(positionMetersXYZ[0] / BLOCK_WORLD_CHUNK_SIZE_METERS_V2),
    chunkZ: Math.floor(positionMetersXYZ[2] / BLOCK_WORLD_CHUNK_SIZE_METERS_V2),
  });
}

export function blockWorldChunkIdV2(
  coordinate: BlockWorldChunkCoordinateXZV2,
): string {
  return `bw-chunk-x-${signedToken(coordinate.chunkX)}-z-${signedToken(coordinate.chunkZ)}`;
}

export function blockWorldChunkClusterEntityIdV2(
  coordinate: BlockWorldChunkCoordinateXZV2,
  clusterIndex: number,
): string {
  if (!Number.isSafeInteger(clusterIndex) || clusterIndex < 0) {
    throw new RangeError("Block World cluster index must be a non-negative safe integer.");
  }
  return `${blockWorldChunkIdV2(coordinate)}-cluster-${clusterIndex.toString(36).padStart(4, "0")}`;
}

const CHUNK_ENTITY_ID =
  /^bw-chunk-x-([pn][0-9a-z]+)-z-([pn][0-9a-z]+)-cluster-([0-9a-z]+)$/;

export function parseBlockWorldChunkEntityIdV2(
  entityId: string,
): (BlockWorldChunkCoordinateXZV2 & Readonly<{ clusterIndex: number }>) | undefined {
  const match = CHUNK_ENTITY_ID.exec(entityId);
  if (match === null) return undefined;
  const chunkX = signedValue(match[1]!);
  const chunkZ = signedValue(match[2]!);
  const clusterIndex = Number.parseInt(match[3]!, 36);
  if (chunkX === undefined || chunkZ === undefined ||
      !Number.isSafeInteger(clusterIndex) || clusterIndex < 0) return undefined;
  return Object.freeze({ chunkX, chunkZ, clusterIndex });
}
