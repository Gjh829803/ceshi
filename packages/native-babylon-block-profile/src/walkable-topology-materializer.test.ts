import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import type {
  BabylonNativeSceneRegistrationV1,
  BabylonNativeStaticColliderV1,
} from "@whitebox-world/native-babylon";
import { sha256CanonicalJson, type Sha256HashV1 } from
  "@whitebox-world/protocol";
import { describe, expect, it, vi } from "vitest";

import type {
  BabylonNativeBlockLogicalGroundModelV1,
} from "./logical-ground-model.js";
import {
  buildBabylonNativeBlockWalkableTopologyV1,
} from "./walkable-topology.js";
import {
  materializeBabylonNativeBlockWalkableTopologyV1,
} from "./walkable-topology-materializer.js";

const H = (digit: string) => `sha256:${digit.repeat(64)}` as Sha256HashV1;
const STATIC_SURFACE = Object.freeze({
  kind: "static-surface" as const,
  surfaceEntityId: "ground-surface",
  logicalSubshapeId: "top",
  traversalSurfaceProfileRef:
    "worldkit://traversal-surface-profile/ground.static@1",
});
const POLICY = Object.freeze({
  kind: "babylon-native-block-walkable-topology-policy" as const,
  schemaVersion: 1 as const,
  maximumAutoSmoothHeightDeltaMeters: 0.3,
  visualOverlayOffsetMeters: 0.004,
  maximumLogicalColliderCount: 8,
  maximumColliderVertexCount: 1_000,
  maximumColliderTriangleCount: 2_000,
});

function groundModel(): BabylonNativeBlockLogicalGroundModelV1 {
  const body = Object.freeze({
    kind: "babylon-native-block-logical-ground-model" as const,
    schemaVersion: 1 as const,
    identity: Object.freeze({
      buildEpochId: "topology-materializer-epoch",
      checkedLayoutInventoryHash: H("1"),
      profileInventoryHash: H("2"),
      worldRuntimeBootstrapHash: H("3"),
      traversalCapabilityEnvelopeHash: H("4"),
      caseHash: H("5"),
    }),
    supportedTraversalSurfaceProfileRefs: Object.freeze([
      STATIC_SURFACE.traversalSurfaceProfileRef,
    ]),
    colliderGroups: Object.freeze([
      Object.freeze({
        colliderId: "floor-collider",
        colliderGeometrySource: Object.freeze({
          kind: "block-group" as const,
          colliderGroupId: "floor-source",
        }),
        sourceBlockIds: Object.freeze(["floor-east", "floor-west"]),
        visualGroupIds: Object.freeze(["floor-visual"]),
        traversalBinding: STATIC_SURFACE,
        exposedEdgePolicy: "none" as const,
        frictionRatio: 0.4,
        occupiedMicroCellKeys: Object.freeze(["0,0,0", "1,0,0"]),
      }),
      Object.freeze({
        colliderId: "wall-collider",
        colliderGeometrySource: Object.freeze({
          kind: "block" as const,
          blockId: "wall-block",
        }),
        sourceBlockIds: Object.freeze(["wall-block"]),
        visualGroupIds: Object.freeze(["wall-visual"]),
        traversalBinding: Object.freeze({ kind: "not-traversable" as const }),
        exposedEdgePolicy: "none" as const,
        occupiedMicroCellKeys: Object.freeze(["2,0,0"]),
      }),
    ]),
    solidOccupancyCells: Object.freeze([
      Object.freeze({
        cellKey: "0,0,0",
        colliderId: "floor-collider",
        sourceBlockId: "floor-west",
        colliderGroupId: "floor-source",
        visualGroupId: "floor-visual",
        traversalBinding: STATIC_SURFACE,
      }),
      Object.freeze({
        cellKey: "1,0,0",
        colliderId: "floor-collider",
        sourceBlockId: "floor-east",
        colliderGroupId: "floor-source",
        visualGroupId: "floor-visual",
        traversalBinding: STATIC_SURFACE,
      }),
      Object.freeze({
        cellKey: "2,0,0",
        colliderId: "wall-collider",
        sourceBlockId: "wall-block",
        visualGroupId: "wall-visual",
        traversalBinding: Object.freeze({ kind: "not-traversable" as const }),
      }),
    ]),
    exposedSupportTopCells: Object.freeze([
      Object.freeze({
        topCellKey: "0,1,0",
        sourceOccupiedCellKey: "0,0,0",
        colliderId: "floor-collider",
        sourceBlockId: "floor-west",
        colliderGroupId: "floor-source",
        visualGroupId: "floor-visual",
        traversalBinding: STATIC_SURFACE,
      }),
      Object.freeze({
        topCellKey: "1,1,0",
        sourceOccupiedCellKey: "1,0,0",
        colliderId: "floor-collider",
        sourceBlockId: "floor-east",
        colliderGroupId: "floor-source",
        visualGroupId: "floor-visual",
        traversalBinding: STATIC_SURFACE,
      }),
    ]),
  });
  return Object.freeze({
    ...body,
    logicalGroundModelHash: sha256CanonicalJson(body) as Sha256HashV1,
  });
}

function topology() {
  return buildBabylonNativeBlockWalkableTopologyV1({
    groundModel: groundModel(),
    policy: POLICY,
  });
}

function context(
  scene: Scene,
  registration: BabylonNativeSceneRegistrationV1,
) {
  return Object.freeze({
    scene,
    bootstrap: Object.freeze({ id: "topology-materializer-epoch" }),
    registration,
  }) as never;
}

describe("Babylon Native Block walkable topology materializer", () => {
  it("creates and registers collision proxies plus identity-bound overlays", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
      const registered: BabylonNativeStaticColliderV1[] = [];
      const materialized = materializeBabylonNativeBlockWalkableTopologyV1({
        context: context(scene, Object.freeze({
          registerSpawnMarker(): void {},
          registerStaticCollider(
            collider: Readonly<BabylonNativeStaticColliderV1>,
          ): void {
            registered.push(collider);
          },
        })),
        topology: topology(),
      });

      expect(registered.map(({ id }) => id)).toEqual([
        "floor-collider",
        "wall-collider",
      ]);
      expect(materialized.collisionMeshes).toHaveLength(2);
      expect(materialized.walkableOverlays).toHaveLength(1);
      expect(materialized.colliderInventory).toEqual([
        expect.objectContaining({
          colliderId: "floor-collider",
          sourceBlockIds: ["floor-east", "floor-west"],
          proxyKind: "continuous-walkable-surface",
          frictionRatio: 0.4,
          topologyHash: materialized.topology.topologyHash,
        }),
        expect.objectContaining({
          colliderId: "wall-collider",
          sourceBlockIds: ["wall-block"],
          proxyKind: "exact-solid-union",
          topologyHash: materialized.topology.topologyHash,
        }),
      ]);
      const overlay = materialized.walkableOverlays[0]!;
      expect(overlay.sourceBlockIds).toEqual(["floor-east", "floor-west"]);
      expect(overlay.visualGroupIds).toEqual(["floor-visual"]);
      expect(overlay.mesh.isVisible).toBe(true);
      expect(overlay.mesh.isPickable).toBe(false);
      const overlayNormals = overlay.mesh.getVerticesData(
        VertexBuffer.NormalKind,
      );
      expect(overlayNormals).not.toBeNull();
      expect(Array.from({ length: overlayNormals!.length / 3 },
        (_unused, index) => overlayNormals![index * 3 + 1]))
        .toEqual(expect.arrayContaining([expect.any(Number)]));
      expect(overlayNormals!.filter((_value, index) => index % 3 === 1)
        .every((normalY) => normalY > 0.99)).toBe(true);
      expect(registered[0]!.mesh.isVisible).toBe(false);
      expect(registered[0]!.mesh.getIndices()).toEqual(
        materialized.topology.walkableGeometries[0]!.triangleIndices,
      );

      materialized.dispose();
      materialized.dispose();
      expect(scene.meshes).toEqual([]);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  it("allocates every Mesh before registration and rolls back on registration failure", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
      let registrationCount = 0;
      expect(() => materializeBabylonNativeBlockWalkableTopologyV1({
        context: context(scene, Object.freeze({
          registerSpawnMarker(): void {},
          registerStaticCollider(): void {
            registrationCount += 1;
            if (registrationCount === 2) throw new Error("registration failed");
          },
        })),
        topology: topology(),
      })).toThrow("registration failed");
      expect(registrationCount).toBe(2);
      expect(scene.meshes).toEqual([]);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  it("continues reverse cleanup after one Mesh dispose throws", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
      const materialized = materializeBabylonNativeBlockWalkableTopologyV1({
        context: context(scene, Object.freeze({
          registerSpawnMarker(): void {},
          registerStaticCollider(): void {},
        })),
        topology: topology(),
      });
      const first = materialized.collisionMeshes[0]!;
      const last = materialized.walkableOverlays[0]!.mesh;
      const firstDispose = vi.spyOn(first, "dispose");
      vi.spyOn(last, "dispose").mockImplementationOnce(() => {
        throw new Error("overlay cleanup failed");
      });

      expect(() => materialized.dispose()).toThrow("overlay cleanup failed");
      expect(firstDispose).toHaveBeenCalledOnce();
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});
