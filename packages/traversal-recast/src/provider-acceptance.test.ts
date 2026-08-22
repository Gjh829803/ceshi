import {
  getNavMeshPositionsAndIndices,
  init,
  NavMeshQuery,
} from "recast-navigation";
import { sha256Bytes } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  destroyRecastTiledOperationResourcesV1,
  generateRetainedTiledNavMeshV1,
  runRecastProviderOperationV1,
} from "./provider-lifecycle.js";
import { mapTraversalCapabilityEnvelopeToRecastTiledConfigV1 } from "./recast-config.js";
import { createRecastTestEnvelopeV1 } from "./test-fixture.test-support.js";

const PLANE_POSITIONS = [
  0, 0, 0,
  0, 0, 4,
  4, 0, 0,
  4, 0, 4,
] as const;
const COUNTER_CLOCKWISE_INDICES = [0, 1, 2, 2, 1, 3] as const;
const REVERSED_INDICES = [0, 2, 1, 2, 3, 1] as const;
const UNPATCHED_RECAST_0431_PLANE_OUTPUT_HASH =
  "sha256:97459be30f32a7a37bcdb92bc655d5b70a0378cd43d930c07cb4c0eae076b374";

function packNavMeshOutputV1(
  positions: readonly number[],
  indices: readonly number[],
): Uint8Array {
  const bytes = new Uint8Array(
    Uint32Array.BYTES_PER_ELEMENT * 2 +
      Float32Array.BYTES_PER_ELEMENT * positions.length +
      Int32Array.BYTES_PER_ELEMENT * indices.length,
  );
  const view = new DataView(bytes.buffer);
  view.setUint32(0, positions.length, true);
  view.setUint32(Uint32Array.BYTES_PER_ELEMENT, indices.length, true);
  let offset = Uint32Array.BYTES_PER_ELEMENT * 2;
  for (const position of positions) {
    view.setFloat32(offset, position, true);
    offset += Float32Array.BYTES_PER_ELEMENT;
  }
  for (const index of indices) {
    view.setInt32(offset, index, true);
    offset += Int32Array.BYTES_PER_ELEMENT;
  }
  return bytes;
}

async function generatePlane(indices: readonly number[]) {
  return runRecastProviderOperationV1(async () => {
    const result = generateRetainedTiledNavMeshV1(
      PLANE_POSITIONS,
      indices,
      mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
        createRecastTestEnvelopeV1(),
      ),
    );
    let query: NavMeshQuery | undefined;
    try {
      if (!result.success) {
        return { success: false as const, positions: [] as number[], indices: [] as number[] };
      }
      query = new NavMeshQuery(result.navMesh);
      const [positions, navIndices] = getNavMeshPositionsAndIndices(result.navMesh);
      return { success: true as const, positions, indices: navIndices };
    } finally {
      destroyRecastTiledOperationResourcesV1(query, result);
    }
  });
}

describe("recast-navigation 0.43.1 provider acceptance", () => {
  it("keeps repeated real provider initialization idempotent", async () => {
    await expect(init()).resolves.toBeUndefined();
    await expect(init()).resolves.toBeUndefined();
  });

  it("retains owned intermediates and destroys query before navmesh", async () => {
    await runRecastProviderOperationV1(async () => {
      const result = generateRetainedTiledNavMeshV1(
        PLANE_POSITIONS,
        COUNTER_CLOCKWISE_INDICES,
        mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
          createRecastTestEnvelopeV1(),
        ),
      );
      expect(result.success).toBe(true);
      expect(result.intermediates.chunkyTriMesh).toBeDefined();
      if (!result.success) return;

      const order: string[] = [];
      const query = new NavMeshQuery(result.navMesh);
      const originalQueryDestroy = query.destroy.bind(query);
      const originalNavMeshDestroy = result.navMesh.destroy.bind(result.navMesh);
      query.destroy = () => {
        order.push("query");
        originalQueryDestroy();
      };
      result.navMesh.destroy = () => {
        order.push("navmesh");
        originalNavMeshDestroy();
      };

      destroyRecastTiledOperationResourcesV1(query, result);
      expect(order).toEqual(["query", "navmesh"]);
    });
  });

  it("continues reverse cleanup and aggregates an earlier destroy failure", async () => {
    await runRecastProviderOperationV1(async () => {
      const result = generateRetainedTiledNavMeshV1(
        PLANE_POSITIONS,
        COUNTER_CLOCKWISE_INDICES,
        mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
          createRecastTestEnvelopeV1(),
        ),
      );
      expect(result.success).toBe(true);
      if (!result.success) return;

      const query = new NavMeshQuery(result.navMesh);
      const originalQueryDestroy = query.destroy.bind(query);
      const originalNavMeshDestroy = result.navMesh.destroy.bind(result.navMesh);
      let navMeshDestroyed = false;
      query.destroy = () => {
        originalQueryDestroy();
        throw new Error("expected-query-destroy-failure");
      };
      result.navMesh.destroy = () => {
        navMeshDestroyed = true;
        originalNavMeshDestroy();
      };

      expect(() => destroyRecastTiledOperationResourcesV1(query, result))
        .toThrow("TRAVERSAL_RECAST_RESOURCE_CLEANUP_FAILED");
      expect(navMeshDestroyed).toBe(true);
    });
  });

  it("builds a Node-compatible Y-up counter-clockwise plane", async () => {
    const result = await generatePlane(COUNTER_CLOCKWISE_INDICES);

    expect(result.success).toBe(true);
    expect(result.positions.length).toBeGreaterThan(0);
    expect(result.indices.length).toBeGreaterThan(0);
  });

  it("locks the unpatched 0.43.1 plane output before lifecycle-only patches", async () => {
    const result = await generatePlane(COUNTER_CLOCKWISE_INDICES);

    expect(result.success).toBe(true);
    expect(sha256Bytes(packNavMeshOutputV1(
      result.positions,
      result.indices,
    ))).toBe(UNPATCHED_RECAST_0431_PLANE_OUTPUT_HASH);
  });

  it("does not accept reversed winding as the same walkable surface", async () => {
    const counterClockwise = await generatePlane(COUNTER_CLOCKWISE_INDICES);
    const reversed = await generatePlane(REVERSED_INDICES);

    expect(counterClockwise.positions.length).toBeGreaterThan(0);
    expect(reversed.positions.length).toBe(0);
  });

  it("supports repeated and concurrent calls through one initialized owner", async () => {
    const results = await Promise.all([
      generatePlane(COUNTER_CLOCKWISE_INDICES),
      generatePlane(COUNTER_CLOCKWISE_INDICES),
    ]);

    expect(results[0]).toEqual(results[1]);
    expect(results[0]?.positions.length).toBeGreaterThan(0);
  });

  it("cleans a throwing operation and permits the next real build", async () => {
    await expect(runRecastProviderOperationV1(async () => {
      const result = generateRetainedTiledNavMeshV1(
        PLANE_POSITIONS,
        COUNTER_CLOCKWISE_INDICES,
        mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
          createRecastTestEnvelopeV1(),
        ),
      );
      try {
        if (!result.success) {
          throw new Error(result.error);
        }
        throw new Error("expected-after-provider-build");
      } finally {
        destroyRecastTiledOperationResourcesV1(undefined, result);
      }
    })).rejects.toThrow("expected-after-provider-build");

    await expect(generatePlane(COUNTER_CLOCKWISE_INDICES)).resolves.toMatchObject({
      success: true,
    });
  });
});
