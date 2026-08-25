import {
  Detour,
  FloatArray,
  QueryFilter,
  Raw,
  UnsignedCharArray,
} from "recast-navigation";
import { describe, expect, it } from "vitest";

import {
  destroyRecastTiledOperationResourcesV1,
  generateRetainedTiledNavMeshV1,
  runRecastProviderOperationV1,
} from "./provider-lifecycle.js";
import * as queryProviderModule from "./query-provider.js";
import { mapTraversalCapabilityEnvelopeToRecastTiledConfigV1 } from "./recast-config.js";
import { createRecastTestEnvelopeV1 } from "./test-fixture.test-support.js";

const PLANE_POSITIONS = [
  0, 0, 0,
  0, 0, 4,
  4, 0, 0,
  4, 0, 4,
] as const;
const PLANE_INDICES = [0, 1, 2, 2, 1, 3] as const;

type QueryProviderModule = Readonly<{
  createRecastQueryProviderV1?: (
    navMesh: unknown,
  ) => unknown;
  destroyRecastQueryProviderV1?: (receipt: unknown) => void;
  findNearestRecastPolygonV1?: (
    receipt: unknown,
    input: Readonly<{
      positionMetersXYZ: readonly [number, number, number];
      halfExtentsMetersXYZ: readonly [number, number, number];
    }>,
  ) => unknown;
  findNearestRecastPolygonAmongRefsV1?: (
    receipt: unknown,
    input: Readonly<{
      positionMetersXYZ: readonly [number, number, number];
      halfExtentsMetersXYZ: readonly [number, number, number];
      polygonRefs: readonly number[];
    }>,
  ) => unknown;
  findStraightRecastPathV1?: (
    receipt: unknown,
    input: Readonly<{
      startPositionMetersXYZ: readonly [number, number, number];
      destinationPositionMetersXYZ: readonly [number, number, number];
      polygonRefs: readonly number[];
      stableMaximumPointCount: number;
    }>,
  ) => unknown;
}>;

type TestNearestResult = Readonly<{
  kind: string;
  polygonRef?: number;
  positionMetersXYZ?: readonly [number, number, number];
}>;

async function withPlaneQuery(
  operation: (
    module: Required<QueryProviderModule>,
    receipt: unknown,
  ) => void,
): Promise<void> {
  await runRecastProviderOperationV1(async () => {
    const result = generateRetainedTiledNavMeshV1(
      PLANE_POSITIONS,
      PLANE_INDICES,
      mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
        createRecastTestEnvelopeV1(),
      ),
    );
    let queryReceipt: unknown;
    try {
      expect(result.success).toBe(true);
      if (!result.success) return;
      const module = queryProviderModule as QueryProviderModule;
      expect(typeof module.createRecastQueryProviderV1).toBe("function");
      expect(typeof module.destroyRecastQueryProviderV1).toBe("function");
      expect(typeof module.findNearestRecastPolygonV1).toBe("function");
      expect(typeof module.findNearestRecastPolygonAmongRefsV1).toBe("function");
      expect(typeof module.findStraightRecastPathV1).toBe("function");
      if (
        module.createRecastQueryProviderV1 === undefined ||
        module.destroyRecastQueryProviderV1 === undefined ||
        module.findNearestRecastPolygonV1 === undefined ||
        module.findNearestRecastPolygonAmongRefsV1 === undefined ||
        module.findStraightRecastPathV1 === undefined
      ) return;
      const completeModule = module as Required<QueryProviderModule>;
      queryReceipt = completeModule.createRecastQueryProviderV1(result.navMesh);
      operation(completeModule, queryReceipt);
      completeModule.destroyRecastQueryProviderV1(queryReceipt);
      queryReceipt = undefined;
    } finally {
      if (queryReceipt !== undefined) {
        const destroy = (queryProviderModule as QueryProviderModule)
          .destroyRecastQueryProviderV1;
        destroy?.(queryReceipt);
      }
      destroyRecastTiledOperationResourcesV1(undefined, result);
    }
  });
}

describe("raw Recast query provider", () => {
  it("checks raw initialization status and unwinds Query plus Filter", async () => {
    await runRecastProviderOperationV1(async () => {
      const result = generateRetainedTiledNavMeshV1(
        PLANE_POSITIONS,
        PLANE_INDICES,
        mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
          createRecastTestEnvelopeV1(),
        ),
      );
      try {
        expect(result.success).toBe(true);
        if (!result.success || Raw.Module === undefined) return;
        const module = queryProviderModule as Required<QueryProviderModule>;
        const order: string[] = [];
        const queryPrototype = Raw.Module.NavMeshQuery.prototype;
        const originalInit = queryPrototype.init;
        const originalNativeDestroy = queryPrototype.destroy;
        const originalRawDestroy = Raw.destroy;
        queryPrototype.init = () => Detour.DT_FAILURE;
        queryPrototype.destroy = function destroyFailedQuery() {
          order.push("raw-query-native");
          return originalNativeDestroy.call(this);
        };
        Raw.destroy = ((resource: unknown) => {
          if (resource instanceof Raw.Module!.NavMeshQuery) {
            order.push("raw-query-wrapper");
          } else if (resource instanceof Raw.Module!.dtQueryFilter) {
            order.push("query-filter");
          }
          originalRawDestroy(resource as never);
        }) as typeof Raw.destroy;
        try {
          expect(() => module.createRecastQueryProviderV1(result.navMesh))
            .toThrow("TRAVERSAL_RECAST_QUERY_INITIALIZATION_FAILED");
        } finally {
          Raw.destroy = originalRawDestroy;
          queryPrototype.destroy = originalNativeDestroy;
          queryPrototype.init = originalInit;
        }
        expect(order).toEqual([
          "raw-query-native",
          "raw-query-wrapper",
          "query-filter",
        ]);
      } finally {
        destroyRecastTiledOperationResourcesV1(undefined, result);
      }
    });
  });

  it("releases the explicit Filter when raw Query construction throws", async () => {
    await runRecastProviderOperationV1(async () => {
      const result = generateRetainedTiledNavMeshV1(
        PLANE_POSITIONS,
        PLANE_INDICES,
        mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
          createRecastTestEnvelopeV1(),
        ),
      );
      try {
        expect(result.success).toBe(true);
        if (!result.success || Raw.Module === undefined) return;
        const module = queryProviderModule as Required<QueryProviderModule>;
        const rawModule = Raw.Module;
        const originalQueryConstructor = rawModule.NavMeshQuery;
        const originalRawDestroy = Raw.destroy;
        const releases: string[] = [];
        rawModule.NavMeshQuery = function ThrowingNavMeshQuery() {
          throw new Error("expected-query-construction-throw");
        } as unknown as typeof rawModule.NavMeshQuery;
        Raw.destroy = ((resource: unknown) => {
          if (resource instanceof rawModule.dtQueryFilter) releases.push("query-filter");
          originalRawDestroy(resource as never);
        }) as typeof Raw.destroy;
        try {
          expect(() => module.createRecastQueryProviderV1(result.navMesh))
            .toThrow("expected-query-construction-throw");
        } finally {
          Raw.destroy = originalRawDestroy;
          rawModule.NavMeshQuery = originalQueryConstructor;
        }
        expect(releases).toEqual(["query-filter"]);
      } finally {
        destroyRecastTiledOperationResourcesV1(undefined, result);
      }
    });
  });

  it("releases a partially configured Filter when its flag setter throws", async () => {
    await runRecastProviderOperationV1(async () => {
      const result = generateRetainedTiledNavMeshV1(
        PLANE_POSITIONS,
        PLANE_INDICES,
        mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
          createRecastTestEnvelopeV1(),
        ),
      );
      try {
        expect(result.success).toBe(true);
        if (!result.success || Raw.Module === undefined) return;
        const module = queryProviderModule as Required<QueryProviderModule>;
        const includeFlags = Object.getOwnPropertyDescriptor(
          QueryFilter.prototype,
          "includeFlags",
        );
        if (includeFlags?.set === undefined) {
          throw new Error("expected QueryFilter includeFlags setter");
        }
        const originalRawDestroy = Raw.destroy;
        const releases: string[] = [];
        Object.defineProperty(QueryFilter.prototype, "includeFlags", {
          ...includeFlags,
          set: () => {
            throw new Error("expected-filter-configuration-throw");
          },
        });
        Raw.destroy = ((resource: unknown) => {
          if (resource instanceof Raw.Module!.dtQueryFilter) releases.push("query-filter");
          originalRawDestroy(resource as never);
        }) as typeof Raw.destroy;
        try {
          expect(() => module.createRecastQueryProviderV1(result.navMesh))
            .toThrow("expected-filter-configuration-throw");
        } finally {
          Raw.destroy = originalRawDestroy;
          Object.defineProperty(QueryFilter.prototype, "includeFlags", includeFlags);
        }
        expect(releases).toEqual(["query-filter"]);
      } finally {
        destroyRecastTiledOperationResourcesV1(undefined, result);
      }
    });
  });

  it("pins raw Query capacity independently from the SDK A-star search budget", async () => {
    await runRecastProviderOperationV1(async () => {
      const result = generateRetainedTiledNavMeshV1(
        PLANE_POSITIONS,
        PLANE_INDICES,
        mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
          createRecastTestEnvelopeV1(),
        ),
      );
      try {
        expect(result.success).toBe(true);
        if (!result.success || Raw.Module === undefined) return;
        const module = queryProviderModule as Required<QueryProviderModule>;
        const queryPrototype = Raw.Module.NavMeshQuery.prototype;
        const originalInit = queryPrototype.init;
        const receivedMaximumNodes: number[] = [];
        queryPrototype.init = function initWithEvidence(navMesh, maximumNodes) {
          receivedMaximumNodes.push(maximumNodes);
          return originalInit.call(this, navMesh, maximumNodes);
        };
        let receipt: unknown;
        try {
          receipt = module.createRecastQueryProviderV1(result.navMesh);
          module.destroyRecastQueryProviderV1(receipt);
          receipt = undefined;
        } finally {
          if (receipt !== undefined) module.destroyRecastQueryProviderV1(receipt);
          queryPrototype.init = originalInit;
        }
        expect(receivedMaximumNodes).toEqual([64]);
      } finally {
        destroyRecastTiledOperationResourcesV1(undefined, result);
      }
    });
  });

  it("returns only plain nearest-polygon evidence and checks zero-Ref misses first", async () => {
    await withPlaneQuery((module, receipt) => {
      expect(module.findNearestRecastPolygonV1(receipt, {
        positionMetersXYZ: [1, 0.2, 1],
        halfExtentsMetersXYZ: [0.5, 1, 0.5],
      })).toMatchObject({
        kind: "complete",
        positionMetersXYZ: [1, 0.10000000149011612, 1],
      });
      expect(module.findNearestRecastPolygonV1(receipt, {
        positionMetersXYZ: [1_000, 1_000, 1_000],
        halfExtentsMetersXYZ: [0.01, 0.01, 0.01],
      })).toEqual({ kind: "miss" });
    });
  });

  it("selects the same closest allowed polygon regardless of Ref order", async () => {
    await withPlaneQuery((module, receipt) => {
      if (Raw.Module === undefined) throw new Error("expected initialized Raw module");
      const queryPrototype = Raw.Module.NavMeshQuery.prototype;
      const originalClosestPointOnPoly = queryPrototype.closestPointOnPoly;
      queryPrototype.closestPointOnPoly = function closestAllowed(
        polygonRef,
        _position,
        closestPoint,
        isOverPolygon,
      ) {
        closestPoint.x = polygonRef === 3 ? 1 : 2;
        closestPoint.y = 0;
        closestPoint.z = 0;
        isOverPolygon.value = true;
        return Detour.DT_SUCCESS;
      };
      try {
        const forward = module.findNearestRecastPolygonAmongRefsV1(receipt, {
          positionMetersXYZ: [0, 0, 0],
          halfExtentsMetersXYZ: [3, 1, 1],
          polygonRefs: [3, 9],
        });
        const reversed = module.findNearestRecastPolygonAmongRefsV1(receipt, {
          positionMetersXYZ: [0, 0, 0],
          halfExtentsMetersXYZ: [3, 1, 1],
          polygonRefs: [9, 3],
        });
        expect(reversed).toEqual(forward);
        expect(forward).toMatchObject({
          kind: "complete",
          polygonRef: 3,
          positionMetersXYZ: [1, 0, 0],
        });
        expect(() => module.findNearestRecastPolygonAmongRefsV1(receipt, {
          positionMetersXYZ: [0, 0, 0],
          halfExtentsMetersXYZ: [3, 1, 1],
          polygonRefs: [0x1_0000_0000],
        })).toThrow("positive unsigned 32-bit integers");
      } finally {
        queryPrototype.closestPointOnPoly = originalClosestPointOnPoly;
      }
    });
  });

  it("uses a private sentinel so a complete exact-fit straight path succeeds", async () => {
    await withPlaneQuery((module, receipt) => {
      const nearest = module.findNearestRecastPolygonV1(receipt, {
        positionMetersXYZ: [1, 0.2, 1],
        halfExtentsMetersXYZ: [0.5, 1, 0.5],
      }) as { kind: string; polygonRef?: number; positionMetersXYZ?: readonly [number, number, number] };
      const destination = module.findNearestRecastPolygonV1(receipt, {
        positionMetersXYZ: [3, 0.2, 3],
        halfExtentsMetersXYZ: [0.5, 1, 0.5],
      }) as { kind: string; polygonRef?: number; positionMetersXYZ?: readonly [number, number, number] };
      expect(nearest.kind).toBe("complete");
      expect(destination.kind).toBe("complete");
      if (
        nearest.polygonRef === undefined || nearest.positionMetersXYZ === undefined ||
        destination.polygonRef === undefined || destination.positionMetersXYZ === undefined
      ) return;
      expect(module.findStraightRecastPathV1(receipt, {
        startPositionMetersXYZ: nearest.positionMetersXYZ,
        destinationPositionMetersXYZ: destination.positionMetersXYZ,
        polygonRefs: [nearest.polygonRef],
        stableMaximumPointCount: 2,
      })).toEqual({
        kind: "complete",
        points: [
          {
            positionMetersXYZ: [1, 0.10000000149011612, 1],
            flags: 1,
            polygonRef: nearest.polygonRef,
          },
          {
            positionMetersXYZ: [3, 0.10000000149011612, 3],
            flags: 2,
            polygonRef: 0,
          },
        ],
      });
    });
  });

  it("reports stable straight-path capacity without exposing the private sentinel", async () => {
    await withPlaneQuery((module, receipt) => {
      const nearest = module.findNearestRecastPolygonV1(receipt, {
        positionMetersXYZ: [1, 0.2, 1],
        halfExtentsMetersXYZ: [0.5, 1, 0.5],
      }) as TestNearestResult;
      const destination = module.findNearestRecastPolygonV1(receipt, {
        positionMetersXYZ: [3, 0.2, 3],
        halfExtentsMetersXYZ: [0.5, 1, 0.5],
      }) as TestNearestResult;
      if (
        nearest.kind !== "complete" || destination.kind !== "complete" ||
        nearest.polygonRef === undefined || nearest.positionMetersXYZ === undefined ||
        destination.positionMetersXYZ === undefined
      ) {
        throw new Error("expected queryable plane endpoints");
      }

      expect(module.findStraightRecastPathV1(receipt, {
        startPositionMetersXYZ: nearest.positionMetersXYZ,
        destinationPositionMetersXYZ: destination.positionMetersXYZ,
        polygonRefs: [nearest.polygonRef],
        stableMaximumPointCount: 1,
      })).toEqual({
        kind: "capacity-exceeded",
        maximumAllowedCount: 1,
        minimumRequiredCount: 2,
      });
    });
  });

  it("rejects polygon Refs that cannot round-trip through the raw unsigned-int ABI", async () => {
    await withPlaneQuery((module, receipt) => {
      expect(() => module.findStraightRecastPathV1(receipt, {
        startPositionMetersXYZ: [1, 0.1, 1],
        destinationPositionMetersXYZ: [3, 0.1, 3],
        polygonRefs: [0x1_0000_0000],
        stableMaximumPointCount: 2,
      })).toThrow(/polygonRefs.*unsigned 32-bit integers/);
    });
  });

  it("rejects a provider straight path without terminal completion evidence", async () => {
    await withPlaneQuery((module, receipt) => {
      const nearest = module.findNearestRecastPolygonV1(receipt, {
        positionMetersXYZ: [1, 0.2, 1],
        halfExtentsMetersXYZ: [0.5, 1, 0.5],
      }) as TestNearestResult;
      const destination = module.findNearestRecastPolygonV1(receipt, {
        positionMetersXYZ: [3, 0.2, 3],
        halfExtentsMetersXYZ: [0.5, 1, 0.5],
      }) as TestNearestResult;
      if (
        nearest.kind !== "complete" || destination.kind !== "complete" ||
        nearest.polygonRef === undefined || nearest.positionMetersXYZ === undefined ||
        destination.positionMetersXYZ === undefined
      ) {
        throw new Error("expected queryable plane endpoints");
      }
      const startPositionMetersXYZ = nearest.positionMetersXYZ;
      const destinationPositionMetersXYZ = destination.positionMetersXYZ;
      const polygonRef = nearest.polygonRef;
      const originalGet = UnsignedCharArray.prototype.get;
      UnsignedCharArray.prototype.get = () => 0;
      try {
        expect(() => module.findStraightRecastPathV1(receipt, {
          startPositionMetersXYZ,
          destinationPositionMetersXYZ,
          polygonRefs: [polygonRef],
          stableMaximumPointCount: 2,
        })).toThrow(/lacks terminal evidence/);
      } finally {
        UnsignedCharArray.prototype.get = originalGet;
      }
    });
  });

  it("releases raw Query native state, wrapper, and explicit Filter exactly once in order", async () => {
    await withPlaneQuery((module, receipt) => {
      if (Raw.Module === undefined) throw new Error("expected initialized Raw module");
      const order: string[] = [];
      const queryPrototype = Raw.Module.NavMeshQuery.prototype;
      const originalNativeDestroy = queryPrototype.destroy;
      const originalRawDestroy = Raw.destroy;
      queryPrototype.destroy = function destroyNativeQuery() {
        order.push("raw-query-native");
        return originalNativeDestroy.call(this);
      };
      Raw.destroy = ((resource: unknown) => {
        if (resource instanceof Raw.Module!.NavMeshQuery) {
          order.push("raw-query-wrapper");
        } else if (resource instanceof Raw.Module!.dtQueryFilter) {
          order.push("query-filter");
        }
        originalRawDestroy(resource as never);
      }) as typeof Raw.destroy;
      try {
        module.destroyRecastQueryProviderV1(receipt);
        module.destroyRecastQueryProviderV1(receipt);
      } finally {
        Raw.destroy = originalRawDestroy;
        queryPrototype.destroy = originalNativeDestroy;
      }
      expect(order).toEqual([
        "raw-query-native",
        "raw-query-wrapper",
        "query-filter",
      ]);
    });
  });

  it("totally unwinds nearest-poly owners when the raw call throws", async () => {
    await withPlaneQuery((module, receipt) => {
      if (Raw.Module === undefined) throw new Error("expected initialized Raw module");
      const releases: string[] = [];
      const queryPrototype = Raw.Module.NavMeshQuery.prototype;
      const originalFindNearestPoly = queryPrototype.findNearestPoly;
      const originalRawDestroy = Raw.destroy;
      queryPrototype.findNearestPoly = () => {
        throw new Error("expected-raw-nearest-throw");
      };
      Raw.destroy = ((resource: unknown) => {
        if (resource instanceof Raw.Module!.BoolRef) releases.push("BoolRef");
        if (resource instanceof Raw.Module!.Vec3) releases.push("Vec3");
        if (resource instanceof Raw.Module!.UnsignedIntRef) {
          releases.push("UnsignedIntRef");
        }
        originalRawDestroy(resource as never);
      }) as typeof Raw.destroy;
      try {
        expect(() => module.findNearestRecastPolygonV1(receipt, {
          positionMetersXYZ: [1, 0.2, 1],
          halfExtentsMetersXYZ: [0.5, 1, 0.5],
        })).toThrow("expected-raw-nearest-throw");
      } finally {
        Raw.destroy = originalRawDestroy;
        queryPrototype.findNearestPoly = originalFindNearestPoly;
      }
      expect(releases).toEqual(["BoolRef", "Vec3", "UnsignedIntRef"]);
    });
  });

  it("unwinds earlier nearest-poly owners when a later owner construction throws", async () => {
    await withPlaneQuery((module, receipt) => {
      if (Raw.Module === undefined) throw new Error("expected initialized Raw module");
      const rawModule = Raw.Module;
      const rawApi = Raw as typeof Raw & { Vec3: typeof Raw.Vec3 };
      const originalVec3Constructor = rawApi.Vec3;
      const originalRawDestroy = Raw.destroy;
      const releases: string[] = [];
      rawApi.Vec3 = function ThrowingVec3() {
        throw new Error("expected-vec3-construction-throw");
      } as unknown as typeof rawApi.Vec3;
      Raw.destroy = ((resource: unknown) => {
        if (resource instanceof rawModule.UnsignedIntRef) {
          releases.push("UnsignedIntRef");
        }
        originalRawDestroy(resource as never);
      }) as typeof Raw.destroy;
      try {
        expect(() => module.findNearestRecastPolygonV1(receipt, {
          positionMetersXYZ: [1, 0.2, 1],
          halfExtentsMetersXYZ: [0.5, 1, 0.5],
        })).toThrow("expected-vec3-construction-throw");
      } finally {
        Raw.destroy = originalRawDestroy;
        rawApi.Vec3 = originalVec3Constructor;
      }
      expect(releases).toEqual(["UnsignedIntRef"]);
    });
  });

  it("preserves an undefined raw throw while still unwinding nearest owners", async () => {
    await withPlaneQuery((module, receipt) => {
      if (Raw.Module === undefined) throw new Error("expected initialized Raw module");
      const queryPrototype = Raw.Module.NavMeshQuery.prototype;
      const originalFindNearestPoly = queryPrototype.findNearestPoly;
      queryPrototype.findNearestPoly = () => {
        throw undefined;
      };
      let didThrow = false;
      let caught: unknown = "not-thrown";
      try {
        module.findNearestRecastPolygonV1(receipt, {
          positionMetersXYZ: [1, 0.2, 1],
          halfExtentsMetersXYZ: [0.5, 1, 0.5],
        });
      } catch (error) {
        didThrow = true;
        caught = error;
      } finally {
        queryPrototype.findNearestPoly = originalFindNearestPoly;
      }
      expect(didThrow).toBe(true);
      expect(caught).toBeUndefined();
    });
  });

  it("totally unwinds straight-path arrays when the raw call throws", async () => {
    await withPlaneQuery((module, receipt) => {
      if (Raw.Module === undefined) throw new Error("expected initialized Raw module");
      const releases: string[] = [];
      const queryPrototype = Raw.Module.NavMeshQuery.prototype;
      const originalFindStraightPath = queryPrototype.findStraightPath;
      const originalRawDestroy = Raw.destroy;
      queryPrototype.findStraightPath = () => {
        throw new Error("expected-raw-straight-throw");
      };
      Raw.destroy = ((resource: unknown) => {
        const name = (resource as { readonly __class__?: { readonly name?: string } })
          .__class__?.name;
        if (
          name === "IntRef" || name === "UnsignedIntArray" ||
          name === "UnsignedCharArray" || name === "FloatArray"
        ) releases.push(name);
        originalRawDestroy(resource as never);
      }) as typeof Raw.destroy;
      try {
        expect(() => module.findStraightRecastPathV1(receipt, {
          startPositionMetersXYZ: [1, 0.1, 1],
          destinationPositionMetersXYZ: [3, 0.1, 3],
          polygonRefs: [4194304],
          stableMaximumPointCount: 2,
        })).toThrow("expected-raw-straight-throw");
      } finally {
        Raw.destroy = originalRawDestroy;
        queryPrototype.findStraightPath = originalFindStraightPath;
      }
      expect(releases).toEqual([
        "IntRef",
        "UnsignedIntArray",
        "UnsignedCharArray",
        "FloatArray",
        "UnsignedIntArray",
      ]);
    });
  });

  it("totally unwinds straight-path owners when an array resize throws", async () => {
    await withPlaneQuery((module, receipt) => {
      const originalResize = FloatArray.prototype.resize;
      const originalRawDestroy = Raw.destroy;
      const releases: string[] = [];
      FloatArray.prototype.resize = () => {
        throw new Error("expected-straight-resize-throw");
      };
      Raw.destroy = ((resource: unknown) => {
        const name = (resource as { readonly __class__?: { readonly name?: string } })
          .__class__?.name;
        if (
          name === "IntRef" || name === "UnsignedIntArray" ||
          name === "UnsignedCharArray" || name === "FloatArray"
        ) releases.push(name);
        originalRawDestroy(resource as never);
      }) as typeof Raw.destroy;
      try {
        expect(() => module.findStraightRecastPathV1(receipt, {
          startPositionMetersXYZ: [1, 0.1, 1],
          destinationPositionMetersXYZ: [3, 0.1, 3],
          polygonRefs: [4194304],
          stableMaximumPointCount: 2,
        })).toThrow("expected-straight-resize-throw");
      } finally {
        Raw.destroy = originalRawDestroy;
        FloatArray.prototype.resize = originalResize;
      }
      expect(releases).toEqual([
        "IntRef",
        "UnsignedIntArray",
        "UnsignedCharArray",
        "FloatArray",
        "UnsignedIntArray",
      ]);
    });
  });
});
