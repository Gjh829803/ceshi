import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Scene } from "@babylonjs/core/scene.js";
import {
  defineBabylonNativeScene,
  type BabylonNativeSceneBuildContextV1,
} from "@whitebox-world/native-babylon";
import { admitBabylonNativeSceneCandidateV1 } from
  "@whitebox-world/native-babylon/host";
import { describe, expect, it } from "vitest";

import { createBabylonNativeBlockProfileCheckResultV1 } from "./check.js";
import { deriveBabylonNativeBlockLayoutV1 } from "./layout.js";
import { settleBabylonNativeBlockProfileV1 } from "./profile-settlement.js";
import type { BabylonNativeBlockSessionRecordV1 } from "./session.js";

type Shape = "full" | "half" | "quarter" | "small" | "step";
type PaletteRole = "ground" | "route" | "structure";
interface FinalizeSelection {
  readonly id: string;
  readonly colliderGeometrySource: Readonly<{
    kind: "block";
    blockId: string;
  }>;
  readonly traversalBinding: Readonly<
    | { kind: "not-traversable" }
    | { kind: "static-surface"; surfaceEntityId: string;
        logicalSubshapeId: string; traversalSurfaceProfileRef: string }
  >;
  readonly exposedEdgePolicy: "none";
  readonly frictionRatio?: number;
  readonly restitutionRatio?: number;
}
interface FinalizedEpoch {
  readonly kind: "babylon-native-block-finalized-epoch";
  readonly schemaVersion: 1;
  readonly colliderInventory: readonly Readonly<{
    colliderId: string; sourceBlockIds: readonly [string]
  }>[];
  readonly profileInventoryHash: `sha256:${string}`;
}
interface Session {
  createBlock(input: Readonly<{ id: string; shape: Shape;
    paletteRole: PaletteRole;
    centerMetersXYZ: readonly [number, number, number];
    rotationQuarterTurnsY?: 0 | 1 | 2 | 3;
    visualGroupId?: string;
    colliderGroupId?: string }>): Mesh;
  finalize(input: Readonly<{ displayGapMeters?: number;
    staticColliders: readonly FinalizeSelection[] }>): FinalizedEpoch;
  dispose(): void;
}
interface SessionModule {
  createBabylonNativeBlockProfileSessionV1(
    context: BabylonNativeSceneBuildContextV1,
    budget: Readonly<{ maximumBlockCount: number }>,
  ): Session;
}
async function loadSession(): Promise<SessionModule> {
  return import(["./", "session.js"].join("")) as Promise<SessionModule>;
}

const STATIC_SURFACE = Object.freeze({
  kind: "static-surface" as const,
  surfaceEntityId: "route-surface",
  logicalSubshapeId: "top",
  traversalSurfaceProfileRef:
    "worldkit://traversal-surface-profile/ground.static@1",
});
const TOPOLOGY_HASH = `sha256:${"a".repeat(64)}` as const;

function fullBlockRecord(
  scene: Scene,
  input: Readonly<{
    id: string;
    centerMetersXYZ: readonly [number, number, number];
    visualGroupId: string;
    colliderGroupId: string;
    paletteRole: "ground" | "structure";
  }>,
): BabylonNativeBlockSessionRecordV1 {
  const mesh = MeshBuilder.CreateBox(input.id, { size: 1 }, scene);
  mesh.position.set(...input.centerMetersXYZ);
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const indices = mesh.getIndices();
  if (positions === null || indices === null) {
    throw new Error("Block settlement fixture requires indexed geometry");
  }
  return Object.freeze({
    input: Object.freeze({
      id: input.id,
      shape: "full" as const,
      paletteRole: input.paletteRole,
      centerMetersXYZ: input.centerMetersXYZ,
      rotationQuarterTurnsY: 0 as const,
      visualGroupId: input.visualGroupId,
      colliderGroupId: input.colliderGroupId,
    }),
    mesh,
    localGeometrySnapshot: Object.freeze({
      positions: Object.freeze(Array.from(positions)),
      indices: Object.freeze(Array.from(indices)),
    }),
  });
}
function frozenSelection(
  id = "route-collider",
  blockId = "route-block",
): FinalizeSelection {
  return Object.freeze({
    id,
    colliderGeometrySource: Object.freeze({ kind: "block", blockId }),
    traversalBinding: STATIC_SURFACE,
    exposedEdgePolicy: "none",
    frictionRatio: 0.8, restitutionRatio: 0 });
}
function bootstrap(id: string) {
  return Object.freeze({
    kind: "babylon-native-scene-bootstrap" as const,
    schemaVersion: 1 as const,
    id,
    sceneModuleRef: `worldkit://native-scene/${id}@1`,
    nativeSceneApiRef: "worldkit://native-scene-api/babylon@1",
    nativeSceneProfileRef:
      "worldkit://native-scene-profile/whitebox.blocks@1",
    gameplayBootstrapRef: `worldkit://gameplay-bootstrap/${id}@1`,
    initialControlledEntityId: "player",
    gravityMetersPerSecondSquaredXYZ: Object.freeze([0, -9.81, 0] as const),
    initialCamera: Object.freeze({ mode: "third-person" as const,
      pitchRadians: 0.2, distanceMeters: 5, fovDegrees: 60,
      targetHeightMeters: 1.2 }),
    seed: 401,
    spawnMarkerId: "player-spawn",
  });
}
async function admit(
  engine: NullEngine,
  scene: Scene,
  id: string,
  maximumColliderCount: number,
  build: (context: BabylonNativeSceneBuildContextV1) => void,
) {
  return admitBabylonNativeSceneCandidateV1({
    candidate: Object.freeze({ engine, scene }),
    hostDerivedStaticColliders: Object.freeze([]),
    bootstrap: bootstrap(id),
    module: defineBabylonNativeScene({
      kind: "babylon-native-scene-module",
      id: `${id}-module`,
      build(context): void {
        build(context);
        context.registration.registerSpawnMarker(Object.freeze({
          id: context.bootstrap.spawnMarkerId,
          positionMetersXYZ: Object.freeze([0, 1, 3] as const),
          facingRadians: 0,
        }));
      },
    }),
    assets: Object.freeze({
      async resolve(): Promise<never> {
        throw new Error("settlement test has no external assets");
      },
    }),
    budget: Object.freeze({
      maximumStaticColliderCount: maximumColliderCount,
      maximumStaticColliderVertexCount: maximumColliderCount * 24,
      maximumStaticColliderTriangleCount: maximumColliderCount * 12,
    }),
  });
}

interface HashVariant {
  readonly reverseCreation?: boolean;
  readonly shape?: Shape;
  readonly paletteRole?: PaletteRole;
  readonly visualGroupId?: string;
  readonly colliderGroupId?: string;
  readonly xMeters?: number;
  readonly displayGapMeters?: number;
  readonly colliderId?: string;
}
async function buildProfileInventoryHash(
  variant: Readonly<HashVariant> = {},
): Promise<`sha256:${string}`> {
  const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();
  const engine = new NullEngine();
  const scene = new Scene(engine);
  let session: Session | undefined;
  let epoch: FinalizedEpoch | undefined;
  try {
    const result = await admit(engine, scene, "hash-test", 1, (context) => {
      session = createBabylonNativeBlockProfileSessionV1(
        context, { maximumBlockCount: 2 });
      const shape = variant.shape ?? "small";
      const definitions = [
        { id: "base-block", shape: "full" as const,
          paletteRole: "ground" as const, visualGroupId: undefined,
          center: [0, 0.5, 0] as const },
        { id: "feature-block", shape,
          paletteRole: variant.paletteRole ?? "route",
          visualGroupId: variant.visualGroupId ?? "feature-group",
          center: shape === "step"
            ? [variant.xMeters ?? 1, 0.125, 0] as const
            : [variant.xMeters ?? 1.25, 0.25,
              shape === "quarter" ? 0 : 0.25] as const },
      ];
      for (const definition of variant.reverseCreation
        ? [...definitions].reverse()
        : definitions) {
        session.createBlock({
          id: definition.id,
          shape: definition.shape,
          paletteRole: definition.paletteRole,
          centerMetersXYZ: definition.center,
          ...(definition.visualGroupId === undefined
            ? {} : { visualGroupId: definition.visualGroupId }),
          ...(definition.id !== "feature-block" ||
              variant.colliderGroupId === undefined
            ? {}
            : { colliderGroupId: variant.colliderGroupId }),
        });
      }
      epoch = session.finalize(Object.freeze({
        displayGapMeters: variant.displayGapMeters ?? 0.04,
        staticColliders: Object.freeze([frozenSelection(
          variant.colliderId ?? "feature-collider", "feature-block")]),
      }));
    });
    if (result.outcome === "rejected") {
      throw new Error(JSON.stringify(result.diagnostics));
    }
    if (epoch === undefined) throw new Error("hash build did not finalize");
    return epoch.profileInventoryHash;
  } finally {
    session?.dispose();
    scene.dispose();
    engine.dispose();
  }
}

describe("Babylon Native block Profile settlement", () => {
  it("finalizes one Host-settled epoch with styled visuals and independent no-gap proxies", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();
    const engine = new NullEngine();
    const scene = new Scene(engine);
    let session: Session | undefined;
    let epoch: FinalizedEpoch | undefined;
    let repeated: FinalizedEpoch | undefined;
    let mismatch: unknown;
    try {
      const admission = await admit(engine, scene, "block-finalize-test", 1,
        (context) => {
          session = createBabylonNativeBlockProfileSessionV1(
            context, { maximumBlockCount: 2 });
          session.createBlock({ id: "route-block", shape: "full",
            paletteRole: "route", visualGroupId: "route-group",
            centerMetersXYZ: [0, 0.5, 0] });
          session.createBlock({ id: "structure-block", shape: "small",
            paletteRole: "structure", visualGroupId: "structure-group",
            centerMetersXYZ: [1.25, 0.25, 0.25] });
          epoch = session.finalize(Object.freeze({ displayGapMeters: 0.04,
            staticColliders: Object.freeze([frozenSelection()]) }));
          repeated = session.finalize(Object.freeze({ displayGapMeters: 0.04,
            staticColliders: Object.freeze([frozenSelection()]) }));
          try {
            session.finalize(Object.freeze({ displayGapMeters: 0.03,
              staticColliders: Object.freeze([frozenSelection()]) }));
          } catch (error) { mismatch = error; }
        });
      if (admission.outcome === "rejected") {
        throw new Error(JSON.stringify(admission.diagnostics));
      }
      if (admission.outcome !== "passed" || epoch === undefined) {
        throw new Error("settlement admission did not pass");
      }
      expect(repeated).toBe(epoch);
      expect(mismatch).toMatchObject({ message: expect.stringMatching(
        /WORLDKIT_NATIVE_BLOCK_FINALIZE_INPUT_MISMATCH/) });
      expect(Object.isFrozen(epoch)).toBe(true);
      expect(Object.isFrozen(epoch.colliderInventory)).toBe(true);
      expect(epoch.profileInventoryHash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(admission.contribution.profileSettlement).toMatchObject({
        kind: "host-snapshot", targetCount: 2,
        profileInventoryHash: epoch.profileInventoryHash,
      });
      expect(admission.contribution.staticColliders[0]!.id)
        .toBe("route-collider");
      const route = scene.getMeshById("route-block")!;
      const structure = scene.getMeshById("structure-block")!;
      const proxy = scene.getMeshByName(
        "worldkit-block-collider-block-finalize-test-route-collider")!;
      expect(proxy).not.toBe(route);
      expect(proxy.isVisible).toBe(false);
      proxy.computeWorldMatrix(true);
      expect(proxy.getBoundingInfo().boundingBox.minimumWorld.asArray())
        .toEqual([-0.5, 0, -0.5]);
      expect(proxy.getBoundingInfo().boundingBox.maximumWorld.asArray())
        .toEqual([0.5, 1, 0.5]);
      expect(route.scaling.asArray()).toEqual([0.96, 0.96, 0.96]);
      expect(structure.scaling.asArray()).toEqual([0.92, 0.92, 0.92]);
    } finally {
      session?.dispose();
      scene.dispose();
      engine.dispose();
    }
  });

  it("rejects explicit null/undefined, extras, duplicates, and missing joins before proxy allocation", async () => {
    const { createBabylonNativeBlockProfileSessionV1 } = await loadSession();
    const invalidInputs = [
      {},
      { displayGapMeters: null, staticColliders: [] },
      { displayGapMeters: undefined, staticColliders: [] },
      { staticColliders: [{ ...frozenSelection(), frictionRatio: null }] },
      { staticColliders: [{ ...frozenSelection(), restitutionRatio: undefined }] },
      { staticColliders: [{ ...frozenSelection(), legacy: true }] },
      { staticColliders: [frozenSelection(), frozenSelection("other-collider")] },
      { staticColliders: [frozenSelection("same-id"),
        frozenSelection("same-id", "other-block")] },
      { staticColliders: [frozenSelection("missing-collider", "missing-block")] },
    ];
    for (const [index, invalidInput] of invalidInputs.entries()) {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      let session: Session | undefined;
      let finalizeError: unknown;
      try {
        await admit(engine, scene, `invalid-input-${index}`, 1, (context) => {
          session = createBabylonNativeBlockProfileSessionV1(
            context, { maximumBlockCount: 1 });
          session.createBlock({ id: "route-block", shape: "full",
            paletteRole: "route", centerMetersXYZ: [0, 0.5, 0] });
          try { session.finalize(invalidInput as never); }
          catch (error) { finalizeError = error; }
        });
        expect(finalizeError).toMatchObject({ message: expect.stringMatching(
          /WORLDKIT_NATIVE_BLOCK_(?:FINALIZE_INPUT|COLLIDER)/) });
        expect(scene.meshes.some(({ name }) =>
          name.startsWith("worldkit-block-collider-"))).toBe(false);
      } finally {
        session?.dispose();
        scene.dispose();
        engine.dispose();
      }
    }
  });

  it("settles one multi-Block walkable Collider through its identity-bound overlay", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
      let profileInventoryHash: `sha256:${string}` | undefined;
      const admission = await admit(
        engine,
        scene,
        "topology-settlement-test",
        2,
        (context) => {
          const records = Object.freeze([
            fullBlockRecord(scene, {
              id: "floor-east",
              centerMetersXYZ: [0, 0.5, 0],
              visualGroupId: "floor-visual",
              colliderGroupId: "floor-source",
              paletteRole: "ground",
            }),
            fullBlockRecord(scene, {
              id: "floor-west",
              centerMetersXYZ: [-1, 0.5, 0],
              visualGroupId: "floor-visual",
              colliderGroupId: "floor-source",
              paletteRole: "ground",
            }),
            fullBlockRecord(scene, {
              id: "wall-block",
              centerMetersXYZ: [1, 0.5, 0],
              visualGroupId: "wall-visual",
              colliderGroupId: "wall-source",
              paletteRole: "structure",
            }),
          ]);
          const layout = deriveBabylonNativeBlockLayoutV1(scene, records);
          const checkResult = createBabylonNativeBlockProfileCheckResultV1(
            "topology-settlement-test",
            records,
            layout,
          );
          expect(checkResult.outcome).toBe("passed");
          const checkedLayout = Object.freeze({
            kind: "babylon-native-block-checked-layout" as const,
            schemaVersion: 1 as const,
            layout,
            checkResult,
            records,
          });
          const floorProxy = MeshBuilder.CreateBox(
            "floor-proxy",
            { width: 2, height: 0.1, depth: 1 },
            scene,
          );
          floorProxy.isVisible = false;
          const wallProxy = MeshBuilder.CreateBox(
            "wall-proxy",
            { size: 1 },
            scene,
          );
          wallProxy.isVisible = false;
          context.registration.registerStaticCollider(Object.freeze({
            id: "floor-collider",
            mesh: floorProxy,
            traversalBinding: STATIC_SURFACE,
          }));
          context.registration.registerStaticCollider(Object.freeze({
            id: "wall-collider",
            mesh: wallProxy,
            traversalBinding: Object.freeze({
              kind: "not-traversable" as const,
            }),
          }));
          const overlay = MeshBuilder.CreateBox(
            "floor-overlay",
            { width: 2, height: 0.01, depth: 1 },
            scene,
          );
          overlay.position.set(-0.5, 1.005, 0);
          profileInventoryHash = settleBabylonNativeBlockProfileV1({
            context,
            checkedLayout,
            displayGapMeters: 0.04,
            colliderInventory: Object.freeze([
              Object.freeze({
                colliderId: "floor-collider",
                sourceBlockIds: Object.freeze([
                  "floor-east",
                  "floor-west",
                ] as const),
                visualGroupIds: Object.freeze(["floor-visual"]),
                proxyKind: "continuous-walkable-surface" as const,
                traversalBinding: STATIC_SURFACE,
                exposedEdgePolicy: "none" as const,
                minimumMetersXYZ: Object.freeze([-1.5, 1, -0.5] as const),
                maximumMetersXYZ: Object.freeze([0.5, 1, 0.5] as const),
                vertexCount: 4,
                triangleCount: 2,
                topologyHash: TOPOLOGY_HASH,
              }),
              Object.freeze({
                colliderId: "wall-collider",
                sourceBlockIds: Object.freeze(["wall-block"] as const),
                visualGroupIds: Object.freeze(["wall-visual"]),
                proxyKind: "exact-solid-union" as const,
                traversalBinding: Object.freeze({
                  kind: "not-traversable" as const,
                }),
                exposedEdgePolicy: "none" as const,
                minimumMetersXYZ: Object.freeze([0.5, 0, -0.5] as const),
                maximumMetersXYZ: Object.freeze([1.5, 1, 0.5] as const),
                vertexCount: 8,
                triangleCount: 12,
                topologyHash: TOPOLOGY_HASH,
              }),
            ]),
            walkableOverlays: Object.freeze([Object.freeze({
              logicalColliderId: "floor-collider",
              sourceBlockIds: Object.freeze([
                "floor-east",
                "floor-west",
              ] as const),
              visualGroupIds: Object.freeze(["floor-visual"]),
              topologyHash: TOPOLOGY_HASH,
              mesh: overlay,
            })]),
          });
        },
      );
      if (admission.outcome === "rejected") {
        throw new Error(JSON.stringify(admission.diagnostics));
      }
      expect(profileInventoryHash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(admission.contribution.profileSettlement).toMatchObject({
        kind: "host-snapshot",
        targetCount: 4,
        profileInventoryHash,
      });
      expect(admission.contribution.staticColliders.map(({ id }) => id))
        .toEqual(["floor-collider", "wall-collider"]);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  it("hashes canonical shape, palette, group, transform, gap, and Collider joins", async () => {
    const baseline = await buildProfileInventoryHash();
    expect(await buildProfileInventoryHash({ reverseCreation: true }))
      .toBe(baseline);
    for (const variant of [
      { shape: "quarter" as const },
      { shape: "step" as const },
      { paletteRole: "structure" as const },
      { visualGroupId: "changed-group" },
      { colliderGroupId: "changed-collider-group" },
      { xMeters: 1.75 },
      { displayGapMeters: 0.03 },
      { colliderId: "changed-collider" },
    ]) {
      expect(await buildProfileInventoryHash(variant)).not.toBe(baseline);
    }
  });
});
