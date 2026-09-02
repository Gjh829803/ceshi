import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PhysicsAggregate } from
  "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsShapeType } from
  "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import type { PhysicsEngine } from
  "@babylonjs/core/Physics/v2/physicsEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import {
  BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
} from "@whitebox-world/native-babylon-block-profile/host";
import {
  createBabylonNativeStaticColliderContributionV1,
  type BabylonNativeStaticColliderContributionV1,
} from "@whitebox-world/runtime-contracts";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  BABYLON_NATIVE_COLLIDER_RESIDENCY_POLICY_V1,
  createBabylonNativeColliderResidencyV1,
  type BabylonNativeColliderResidencyCameraOwnerV1,
  type BabylonNativeColliderResidencyV1,
} from "./native-collider-residency.js";
import { enableHavokPhysics, FIXED_TIME_STEP_SECONDS } from "./physics.js";

const STATIC_SURFACE = Object.freeze({
  kind: "static-surface" as const,
  surfaceEntityId: "deck-surface",
  logicalSubshapeId: "top",
  traversalSurfaceProfileRef:
    "worldkit://traversal-surface-profile/ground.static@1",
});

let havokWasmBinary: ArrayBuffer;

beforeAll(async () => {
  const wasmPath = createRequire(import.meta.url)
    .resolve("@babylonjs/havok/lib/esm/HavokPhysics.wasm");
  const bytes = await readFile(wasmPath);
  havokWasmBinary = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
});

const cleanups: Array<() => void> = [];

afterEach(() => {
  vi.restoreAllMocks();
  while (cleanups.length > 0) cleanups.pop()!();
});

/** One flat deck ribbon of `quadCount` one-meter quads starting at x = 0. */
function deckCollider(
  quadCount: number,
): BabylonNativeStaticColliderContributionV1 {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let quad = 0; quad < quadCount; quad += 1) {
    const base = positions.length / 3;
    positions.push(
      quad, 0, -1,
      quad + 1, 0, -1,
      quad + 1, 0, 1,
      quad, 0, 1,
    );
    indices.push(base, base + 2, base + 3, base, base + 1, base + 2);
  }
  return createBabylonNativeStaticColliderContributionV1({
    id: "deck",
    runtimeRole: "scene-static-collider",
    worldPositionsMetersXYZ: positions,
    triangleIndices: indices,
    frictionRatio: 0.8,
    restitutionRatio: 0,
    traversalBinding: STATIC_SURFACE,
  });
}

interface CameraOwnerProbeV1
  extends BabylonNativeColliderResidencyCameraOwnerV1 {
  readonly registered: ReadonlySet<string>;
}

function cameraOwnerProbe(): CameraOwnerProbeV1 {
  const registered = new Set<string>();
  return {
    registered,
    registerEntityPhysicsBody(entityId: string, _body: PhysicsBody): void {
      if (registered.has(entityId)) {
        throw new Error(`CAMERA_GEOMETRY_QUERY_ENTITY_DUPLICATE: ${entityId}`);
      }
      registered.add(entityId);
    },
    setEntityQueryEnabled(entityId: string): void {
      if (!registered.has(entityId)) {
        throw new Error(`CAMERA_GEOMETRY_QUERY_ENTITY_UNKNOWN: ${entityId}`);
      }
    },
    unregisterEntityPhysicsBody(entityId: string): void {
      if (!registered.delete(entityId)) {
        throw new Error(`CAMERA_GEOMETRY_QUERY_ENTITY_UNKNOWN: ${entityId}`);
      }
    },
  };
}

interface ResidencyFixtureV1 {
  readonly scene: Scene;
  readonly residency: BabylonNativeColliderResidencyV1;
  readonly cameraOwner: CameraOwnerProbeV1;
  readonly metadataCalls: () => number;
  readonly failMetadataAtCall: (call: number | undefined) => void;
}

async function createFixture(input: Readonly<{
  quadCount?: number;
  colliders?: readonly BabylonNativeStaticColliderContributionV1[];
  failMetadataOnCall?: number;
  withPhysics?: boolean;
}> = {}): Promise<ResidencyFixtureV1> {
  const engine = new NullEngine({
    renderWidth: 64,
    renderHeight: 64,
    textureSize: 64,
    deterministicLockstep: true,
    lockstepMaxSteps: 4,
  });
  const scene = new Scene(engine);
  cleanups.push(() => {
    scene.dispose();
    engine.dispose();
  });
  if (input.withPhysics !== false) {
    await enableHavokPhysics(scene, [0, -9.81, 0], havokWasmBinary);
  }
  const cameraOwner = cameraOwnerProbe();
  let metadataCalls = 0;
  let failMetadataOnCall = input.failMetadataOnCall;
  const residency = createBabylonNativeColliderResidencyV1({
    scene,
    chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
    colliders: input.colliders ?? [deckCollider(input.quadCount ?? 200)],
    sourceBlockIdByColliderId: new Map([["deck", "deck-block"]]),
    cameraGeometryQuery: cameraOwner,
    applyColliderMetadata: (): void => {
      metadataCalls += 1;
      if (metadataCalls === failMetadataOnCall) {
        throw new Error("NATIVE_COLLIDER_METADATA_FAILURE");
      }
    },
  });
  cleanups.push(() => {
    try {
      residency.dispose();
    } catch {
      // A test may already have proven the throwing cleanup path.
    }
  });
  return {
    scene,
    residency,
    cameraOwner,
    metadataCalls: () => metadataCalls,
    failMetadataAtCall(call: number | undefined): void {
      failMetadataOnCall = call;
    },
  };
}

function colliderMeshNames(scene: Scene): readonly string[] {
  return scene.meshes.map(({ name }) => name)
    .filter((name) => name.startsWith("worldkit.native-collider."))
    .sort();
}

function chunkIndexOf(partId: string): number {
  const match = /grid-chunk-x(n|p)(\d+)-z/.exec(partId);
  if (match === null) throw new Error(`unparsable part id ${partId}`);
  return Number(match[2]) * (match[1] === "n" ? -1 : 1);
}

describe("NBR-65F bounded Native Chunk physics residency", () => {
  it("activates the Spawn ring before readiness without resident far Chunks",
    async () => {
      const { residency, scene } = await createFixture();
      expect(residency.metrics()).toMatchObject({
        logicalColliderCount: 1,
        activePartCount: 0,
        updateCount: 0,
      });
      expect(colliderMeshNames(scene)).toEqual([]);

      residency.update([[0, 0, 0]]);
      const metrics = residency.metrics();
      expect(metrics.partCount).toBe(51);
      expect(metrics.activePartCount).toBeGreaterThan(0);
      expect(metrics.activePartCount).toBeLessThan(metrics.partCount);
      expect(metrics.peakActivePartCount).toBe(metrics.activePartCount);
      expect(colliderMeshNames(scene)).toHaveLength(metrics.activePartCount);
      const chunkIndexes = residency.activeHandles()
        .map(({ chunkPartId }) => chunkIndexOf(chunkPartId));
      expect(Math.min(...chunkIndexes)).toBe(0);
      expect(Math.max(...chunkIndexes) * 4).toBeLessThanOrEqual(
        BABYLON_NATIVE_COLLIDER_RESIDENCY_POLICY_V1.activationRadiusMeters,
      );
    });

  it("keeps the resident ring the union of every active Subject", async () => {
    const { residency } = await createFixture();
    residency.update([[0, 0, 0]]);
    const spawnOnly = new Set(
      residency.activeHandles().map(({ chunkPartId }) => chunkPartId),
    );

    residency.update([[0, 0, 0], [160, 0, 0]]);
    const union = residency.activeHandles()
      .map(({ chunkPartId }) => chunkPartId);
    for (const partId of spawnOnly) expect(union).toContain(partId);
    const unionIndexes = union.map(chunkIndexOf).sort((a, b) => a - b);
    // Two separated Subjects keep two bounded rings, never the whole world.
    expect(residency.metrics().activePartCount)
      .toBeLessThan(residency.metrics().partCount);
    const gaps = unionIndexes.filter((value, index) =>
      index > 0 && value - unionIndexes[index - 1]! > 1);
    expect(gaps).toHaveLength(1);
    expect(Math.max(...unionIndexes) * 4).toBeGreaterThan(160);
  });

  it("releases only outside the hysteresis ring and never thrashes", async () => {
    const { residency } = await createFixture();
    residency.update([[0, 0, 0]]);
    const initial = residency.metrics();

    // A step of one Chunk must not release a part that is still inside the
    // release ring, so a Subject on a seam cannot destroy its own support.
    expect(residency.update([[4, 0, 0]])).toBe(true);
    expect(residency.metrics().releaseCount).toBe(0);
    expect(residency.metrics().activePartCount)
      .toBeGreaterThanOrEqual(initial.activePartCount);

    expect(residency.update([[160, 0, 0]])).toBe(true);
    expect(residency.metrics().releaseCount).toBeGreaterThan(0);
    const farIndexes = residency.activeHandles()
      .map(({ chunkPartId }) => chunkIndexOf(chunkPartId));
    expect(Math.min(...farIndexes) * 4).toBeGreaterThan(
      160 - BABYLON_NATIVE_COLLIDER_RESIDENCY_POLICY_V1.releaseRadiusMeters,
    );
    expect(residency.update([[160, 0, 0]])).toBe(false);
  });

  it("carries a real Havok body across every Chunk seam without a gap",
    async () => {
      const { residency, scene } = await createFixture({ quadCount: 40 });
      residency.update([[2, 0, 0]]);
      const physicsEngine = scene.getPhysicsEngine() as PhysicsEngine | null;
      if (physicsEngine === null) throw new Error("Havok engine missing");

      const probe = MeshBuilder.CreateSphere(
        "seam-probe",
        { diameter: 0.5, segments: 8 },
        scene,
      );
      probe.position.set(2, 0.4, 0);
      const probeAggregate = new PhysicsAggregate(
        probe,
        PhysicsShapeType.SPHERE,
        { mass: 1, friction: 0.1, restitution: 0 },
        scene,
      );
      cleanups.push(() => {
        probeAggregate.dispose();
        probe.dispose();
      });

      let lowestY = Number.POSITIVE_INFINITY;
      const crossedSeams = new Set<number>();
      for (let tick = 0; tick < 240; tick += 1) {
        const position = probe.position;
        residency.update([[position.x, position.y, position.z]]);
        probeAggregate.body.setLinearVelocity(new Vector3(
          6,
          probeAggregate.body.getLinearVelocity().y,
          0,
        ));
        physicsEngine._step(FIXED_TIME_STEP_SECONDS);
        const after = probe.position;
        lowestY = Math.min(lowestY, after.y);
        for (const seam of [3.5, 7.5, 11.5, 15.5, 19.5]) {
          if (after.x > seam) crossedSeams.add(seam);
        }
      }
      expect(crossedSeams.size).toBeGreaterThanOrEqual(4);
      // The deck top is y = 0 and the probe radius is 0.25 m. Falling through
      // one Chunk seam would immediately drop the sphere far below that.
      expect(lowestY).toBeGreaterThan(0.15);
      expect(probe.position.y).toBeGreaterThan(0.15);
    }, 30_000);

  it("never culls visuals and never touches a visible Mesh", async () => {
    const { residency, scene } = await createFixture();
    const farVisual = MeshBuilder.CreateBox("far-visual", { size: 1 }, scene);
    farVisual.position.set(180, 0.5, 0);
    cleanups.push(() => farVisual.dispose());

    residency.update([[0, 0, 0]]);
    residency.update([[0, 0, 0], [4, 0, 0]]);
    expect(farVisual.isVisible).toBe(true);
    expect(farVisual.isEnabled()).toBe(true);
    expect(farVisual.isDisposed()).toBe(false);
    for (const handle of residency.activeHandles()) {
      expect(handle.mesh.isVisible).toBe(false);
      expect(handle.mesh.isPickable).toBe(false);
    }
  });

  it("fails closed and unwinds a partially activated ring", async () => {
    const { residency, scene, cameraOwner } = await createFixture({
      quadCount: 40,
      failMetadataOnCall: 3,
    });
    expect(() => residency.update([[0, 0, 0]]))
      .toThrow(/NATIVE_COLLIDER_METADATA_FAILURE/);
    expect(residency.metrics().activePartCount).toBe(0);
    expect(residency.activeHandles()).toEqual([]);
    expect(colliderMeshNames(scene)).toEqual([]);
    expect([...cameraOwner.registered]).toEqual([]);
  });

  it("keeps the previously published ring when a replacement activation fails",
    async () => {
      const fixture = await createFixture({ quadCount: 200 });
      fixture.residency.update([[0, 0, 0]]);
      const priorPartIds = fixture.residency.activeHandles()
        .map(({ chunkPartId }) => chunkPartId);
      const priorMeshNames = colliderMeshNames(fixture.scene);
      fixture.failMetadataAtCall(fixture.metadataCalls() + 3);

      expect(() => fixture.residency.update([[160, 0, 0]]))
        .toThrow(/NATIVE_COLLIDER_METADATA_FAILURE/);
      expect(fixture.residency.activeHandles()
        .map(({ chunkPartId }) => chunkPartId)).toEqual(priorPartIds);
      expect(colliderMeshNames(fixture.scene)).toEqual(priorMeshNames);
    });

  it("keeps one logical Collider identity across every Chunk part", async () => {
    const { residency } = await createFixture({ quadCount: 40 });
    residency.update([[0, 0, 0]]);
    const handles = residency.activeHandles();
    expect(handles.length).toBeGreaterThan(1);
    expect(new Set(handles.map(({ colliderId }) => colliderId)))
      .toEqual(new Set(["deck"]));
    expect(new Set(handles.map(({ colliderSubshapeId }) => colliderSubshapeId)))
      .toHaveProperty("size", 1);
    expect(new Set(handles.map(({ chunkPartId }) => chunkPartId)).size)
      .toBe(handles.length);
    expect(new Set(handles.map(({ physicsBodyId }) => physicsBodyId)).size)
      .toBe(handles.length);
    for (const handle of handles) {
      expect(handle.sourceBlockId).toBe("deck-block");
      expect(handle.chunkPartId).toContain("deck-grid-chunk-");
    }
  });

  it("reverses every resident resource once and survives a throwing dispose",
    async () => {
      const { residency, scene } = await createFixture({ quadCount: 40 });
      residency.update([[0, 0, 0]]);
      const handles = residency.activeHandles();
      expect(handles.length).toBeGreaterThan(1);
      const failing = handles[0]!;
      const nativeDispose = failing.aggregate.dispose.bind(failing.aggregate);
      vi.spyOn(failing.aggregate, "dispose").mockImplementation(() => {
        nativeDispose();
        throw new Error("HAVOK_PROVIDER_PRIVATE_DISPOSE_FAILURE");
      });

      expect(() => residency.dispose())
        .toThrow(/HAVOK_PROVIDER_PRIVATE_DISPOSE_FAILURE/);
      expect(colliderMeshNames(scene)).toEqual([]);
      for (const handle of handles) {
        expect(handle.mesh.isDisposed()).toBe(true);
        expect(handle.body.isDisposed).toBe(true);
      }
      residency.dispose();
      expect(() => residency.update([[0, 0, 0]]))
        .toThrow(/WORLDKIT_NATIVE_COLLIDER_RESIDENCY_INVALID/);
    });

  it("keeps two concurrent residency rings isolated", async () => {
    const first = await createFixture({ quadCount: 40 });
    const second = await createFixture({ quadCount: 40 });
    first.residency.update([[0, 0, 0]]);
    second.residency.update([[0, 0, 0]]);
    const secondNames = colliderMeshNames(second.scene);
    expect(secondNames).not.toHaveLength(0);

    first.residency.dispose();
    expect(colliderMeshNames(first.scene)).toEqual([]);
    expect(colliderMeshNames(second.scene)).toEqual(secondNames);
    expect(second.residency.metrics().activePartCount)
      .toBe(secondNames.length);
  });

  it("rejects a forged residency policy or empty Subject union", async () => {
    const { residency } = await createFixture({ quadCount: 8 });
    expect(() => residency.update([]))
      .toThrow(/WORLDKIT_NATIVE_COLLIDER_RESIDENCY_INVALID/);
    expect(() => residency.update([[Number.NaN, 0, 0]]))
      .toThrow(/WORLDKIT_NATIVE_COLLIDER_RESIDENCY_INVALID/);
    const { scene, cameraOwner } = await createFixture({
      quadCount: 8,
      withPhysics: false,
    });
    expect(() => createBabylonNativeColliderResidencyV1({
      scene,
      chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
      colliders: [deckCollider(8)],
      sourceBlockIdByColliderId: new Map(),
      cameraGeometryQuery: cameraOwner,
      policy: Object.freeze({
        ...BABYLON_NATIVE_COLLIDER_RESIDENCY_POLICY_V1,
        releaseRadiusMeters: 1,
      }),
      applyColliderMetadata: (): void => {},
    })).toThrow(/WORLDKIT_NATIVE_COLLIDER_RESIDENCY_INVALID/);
  });
});
