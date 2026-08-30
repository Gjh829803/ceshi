import { describe, expect, it } from "vitest";

import {
  BLOCK_WORLD_CHUNK_SIZE_METERS_V2,
  blockWorldChunkClusterEntityIdV2,
  blockWorldChunkCoordinateV2,
  parseBlockWorldChunkEntityIdV2,
} from "./chunking.js";

describe("Block World chunk identity", () => {
  it("uses floor partitioning and round-trips signed chunk coordinates", () => {
    expect(BLOCK_WORLD_CHUNK_SIZE_METERS_V2).toBe(32);
    expect(blockWorldChunkCoordinateV2([-0.25, 0, -32.25])).toEqual({
      chunkX: -1,
      chunkZ: -2,
    });
    const entityId = blockWorldChunkClusterEntityIdV2(
      { chunkX: -35, chunkZ: 71 },
      4097,
    );
    expect(parseBlockWorldChunkEntityIdV2(entityId)).toEqual({
      chunkX: -35,
      chunkZ: 71,
      clusterIndex: 4097,
    });
  });

  it("does not classify generic Runtime entity IDs as block chunks", () => {
    expect(parseBlockWorldChunkEntityIdV2("building-main")).toBeUndefined();
  });
});
