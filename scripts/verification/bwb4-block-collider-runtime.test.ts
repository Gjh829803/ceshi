import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { PhysicsEngine } from "@babylonjs/core/Physics/v2/physicsEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import {
  type BabylonNativeSceneModuleV1,
} from "@whitebox-world/native-babylon";
import { createBabylonNativeBlockColliderRuntimeFixtureModuleV1 } from
  "@whitebox-world/native-babylon-block-profile/testing";
import {
  createBabylonNativeBlockMaterializerMetadataV1,
  takeBabylonNativeBlockCheckedEpochEvidenceV1,
  type BabylonNativeBlockCheckedEpochEvidenceV1,
} from "@whitebox-world/native-babylon-block-profile/host";
import { admitBabylonNativeSceneCandidateV1 } from
  "@whitebox-world/native-babylon/host";
import { BabylonWorldRuntime } from "@whitebox-world/runtime-babylon";
import { bindRuntimeTestPossession } from
  "@whitebox-world/runtime-babylon/testing";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { runtimeWorldConfigurationFromVerifiedWorldPackageV1 } from
  "@whitebox-world/runtime-host";
import {
  createBabylonNativeWorldPackageV1,
  type VerifiedBabylonNativeWorldPackageDirectoryV1,
  verifyWorldPackageDirectoryV1,
} from "@whitebox-world/world-package";
import { createBabylonNativeBlockWorldPackageTestInputV1 } from
  "@whitebox-world/world-package/testing";
import { describe, expect, it } from "vitest";
import { isNil } from "lodash-es";

const require = createRequire(import.meta.url);
const havokWasmBytes = await readFile(
  require.resolve("@babylonjs/havok/lib/esm/HavokPhysics.wasm"),
);
const havokWasmBinary = havokWasmBytes.buffer.slice(
  havokWasmBytes.byteOffset,
  havokWasmBytes.byteOffset + havokWasmBytes.byteLength,
) as ArrayBuffer;

const RESOURCE_BUDGET = Object.freeze({
  maximumVertices: 256,
  maximumTriangles: 128,
  maximumColliders: 10,
});

// Walkable static-surface Colliders publish the continuous top surface, not
// the pre-NBR-65 solid box volume. Shared 0.25 m edges are auto-smoothed, so
// ground-negative-one / quarter-meter-rise share a 0.125 m seam.
const EXPECTED_COLLIDER_BOUNDS_METERS = Object.freeze({
  "collider-elevated-tread": Object.freeze({
    minimum: Object.freeze([-0.5, 0.25, -3.5] as const),
    maximum: Object.freeze([0.5, 0.25, -2.5] as const),
  }),
  "collider-ground-negative-one": Object.freeze({
    minimum: Object.freeze([-0.5, 0, -1.5] as const),
    maximum: Object.freeze([0.5, 0.125, -0.5] as const),
  }),
  "collider-ground-positive-one": Object.freeze({
    minimum: Object.freeze([-0.5, 0, 0.5] as const),
    maximum: Object.freeze([0.5, 0, 1.5] as const),
  }),
  "collider-ground-zero": Object.freeze({
    minimum: Object.freeze([-0.5, 0, -0.5] as const),
    maximum: Object.freeze([0.5, 0, 0.5] as const),
  }),
  "collider-half-meter-blocker": Object.freeze({
    minimum: Object.freeze([-0.5, 0.75, -4.5] as const),
    maximum: Object.freeze([0.5, 0.75, -3.5] as const),
  }),
  "collider-quarter-meter-rise": Object.freeze({
    minimum: Object.freeze([-0.5, 0.125, -2.5] as const),
    maximum: Object.freeze([0.5, 0.25, -1.5] as const),
  }),
} as const);

type PassedCandidateAdmission = Extract<
  Awaited<ReturnType<typeof admitBabylonNativeSceneCandidateV1>>,
  { readonly outcome: "passed" }
>;

function assertColliderAxisAlignedBounds(
  worldPositionsMetersXYZ: readonly number[],
  bounds: Readonly<{
    minimum: readonly [number, number, number];
    maximum: readonly [number, number, number];
  }>,
): void {
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  for (let index = 0; index < worldPositionsMetersXYZ.length; index += 3) {
    xs.push(worldPositionsMetersXYZ[index]!);
    ys.push(worldPositionsMetersXYZ[index + 1]!);
    zs.push(worldPositionsMetersXYZ[index + 2]!);
  }
  expect(Math.min(...xs)).toBeCloseTo(bounds.minimum[0], 5);
  expect(Math.max(...xs)).toBeCloseTo(bounds.maximum[0], 5);
  expect(Math.min(...ys)).toBeCloseTo(bounds.minimum[1], 5);
  expect(Math.max(...ys)).toBeCloseTo(bounds.maximum[1], 5);
  expect(Math.min(...zs)).toBeCloseTo(bounds.minimum[2], 5);
  expect(Math.max(...zs)).toBeCloseTo(bounds.maximum[2], 5);
}

function assertExactIndexedBoxTopology(
  worldPositionsMetersXYZ: readonly number[],
  triangleIndices: readonly number[],
  bounds: Readonly<{
    minimum: readonly [number, number, number];
    maximum: readonly [number, number, number];
  }>,
): void {
  assertColliderAxisAlignedBounds(worldPositionsMetersXYZ, bounds);
  if (worldPositionsMetersXYZ.length !== 8 * 3) return;
  expect(triangleIndices).toHaveLength(12 * 3);

  const corners = Array.from({ length: 8 }, (_, index) =>
    worldPositionsMetersXYZ.slice(index * 3, index * 3 + 3)
  );
  const cornerKeys = new Set(corners.map((corner) => corner.join(",")));
  expect(cornerKeys.size).toBe(8);
  for (let axis = 0; axis < 3; axis += 1) {
    const coordinates = corners.map((corner) => corner[axis]!);
    expect(Math.min(...coordinates)).toBe(bounds.minimum[axis]);
    expect(Math.max(...coordinates)).toBe(bounds.maximum[axis]);
  }
  for (const x of [bounds.minimum[0], bounds.maximum[0]]) {
    for (const y of [bounds.minimum[1], bounds.maximum[1]]) {
      for (const z of [bounds.minimum[2], bounds.maximum[2]]) {
        expect(cornerKeys.has(`${x},${y},${z}`)).toBe(true);
      }
    }
  }

  const boundaryFaces = Object.freeze([
    Object.freeze({
      id: "x-min",
      axis: 0,
      coordinate: bounds.minimum[0],
      outward: Object.freeze([-1, 0, 0] as const),
    }),
    Object.freeze({
      id: "x-max",
      axis: 0,
      coordinate: bounds.maximum[0],
      outward: Object.freeze([1, 0, 0] as const),
    }),
    Object.freeze({
      id: "y-min",
      axis: 1,
      coordinate: bounds.minimum[1],
      outward: Object.freeze([0, -1, 0] as const),
    }),
    Object.freeze({
      id: "y-max",
      axis: 1,
      coordinate: bounds.maximum[1],
      outward: Object.freeze([0, 1, 0] as const),
    }),
    Object.freeze({
      id: "z-min",
      axis: 2,
      coordinate: bounds.minimum[2],
      outward: Object.freeze([0, 0, -1] as const),
    }),
    Object.freeze({
      id: "z-max",
      axis: 2,
      coordinate: bounds.maximum[2],
      outward: Object.freeze([0, 0, 1] as const),
    }),
  ]);
  const triangleKeys = new Set<string>();
  const usedCornerIndices = new Set<number>();
  const triangleCountByFaceId = new Map(
    boundaryFaces.map(({ id }) => [id, 0]),
  );
  const triangleVertexIndicesByFaceId = new Map(
    boundaryFaces.map(({ id }) => [
      id,
      [] as (readonly [number, number, number])[],
    ]),
  );
  for (let offset = 0; offset < triangleIndices.length; offset += 3) {
    const vertexIndices = [
      triangleIndices[offset]!,
      triangleIndices[offset + 1]!,
      triangleIndices[offset + 2]!,
    ] as const;
    for (const vertexIndex of vertexIndices) {
      expect(Number.isInteger(vertexIndex)).toBe(true);
      expect(vertexIndex).toBeGreaterThanOrEqual(0);
      expect(vertexIndex).toBeLessThan(8);
      usedCornerIndices.add(vertexIndex);
    }
    expect(new Set(vertexIndices).size).toBe(3);
    triangleKeys.add([...vertexIndices].sort((left, right) => left - right)
      .join(","));

    const vertices = vertexIndices.map((vertexIndex) =>
      new Vector3(...corners[vertexIndex]! as [number, number, number])
    );
    const edgeA = vertices[1]!.subtract(vertices[0]!);
    const edgeB = vertices[2]!.subtract(vertices[0]!);
    // Installed Babylon 9.23 ComputeNormals and the Runtime surface owner use
    // edgeB x edgeA for this vertex order. A positive dot therefore proves
    // the exact outward winding consumed by both normals and Havok geometry.
    const rawNormal = Vector3.Cross(edgeB, edgeA);
    expect(rawNormal.lengthSquared()).toBeGreaterThan(Number.EPSILON);

    const matchingFaces = boundaryFaces.filter(({ axis, coordinate }) =>
      vertices.every((vertex) => vertex.asArray()[axis] === coordinate)
    );
    expect(matchingFaces).toHaveLength(1);
    const face = matchingFaces[0];
    if (isNil(face)) {
      throw new Error("Indexed Box triangle is not on one boundary face.");
    }
    const faceTriangleCount = triangleCountByFaceId.get(face.id);
    if (isNil(faceTriangleCount)) {
      throw new Error(`Unknown indexed Box boundary face '${face.id}'.`);
    }
    triangleCountByFaceId.set(face.id, faceTriangleCount + 1);
    const faceTriangles = triangleVertexIndicesByFaceId.get(face.id);
    if (isNil(faceTriangles)) {
      throw new Error(`Unknown indexed Box boundary face '${face.id}'.`);
    }
    faceTriangles.push(vertexIndices);
    const outward = new Vector3(...face.outward);
    expect(Vector3.Dot(rawNormal.normalize(), outward)).toBeGreaterThan(
      0.999999,
    );
  }
  expect(triangleKeys.size).toBe(12);
  expect([...usedCornerIndices].sort((left, right) => left - right)).toEqual([
    0, 1, 2, 3, 4, 5, 6, 7,
  ]);
  expect(Object.fromEntries(triangleCountByFaceId)).toEqual({
    "x-min": 2,
    "x-max": 2,
    "y-min": 2,
    "y-max": 2,
    "z-min": 2,
    "z-max": 2,
  });
  for (const [faceId, faceTriangles] of triangleVertexIndicesByFaceId) {
    expect(faceTriangles).toHaveLength(2);
    const first = faceTriangles[0];
    const second = faceTriangles[1];
    if (isNil(first) || isNil(second)) {
      throw new Error(`Indexed Box face '${faceId}' is incomplete.`);
    }
    const faceCornerIndices = new Set([...first, ...second]);
    expect(faceCornerIndices.size).toBe(4);
    const sharedDiagonal = first.filter((vertexIndex) =>
      second.includes(vertexIndex)
    );
    expect(sharedDiagonal).toHaveLength(2);
    const diagonalStart = corners[sharedDiagonal[0]!];
    const diagonalEnd = corners[sharedDiagonal[1]!];
    if (isNil(diagonalStart) || isNil(diagonalEnd)) {
      throw new Error(`Indexed Box face '${faceId}' has an invalid diagonal.`);
    }
    expect(diagonalStart.filter((coordinate, axis) =>
      coordinate !== diagonalEnd[axis]
    )).toHaveLength(2);
  }
}

function nativeColliderChunkPartMeshes(
  scene: Scene,
  logicalColliderId: string,
) {
  const prefix = `worldkit.native-collider.${logicalColliderId}-grid-chunk-`;
  return scene.meshes
    .filter(({ name }) => name.startsWith(prefix))
    .sort((left, right) => left.name < right.name ? -1 : 1);
}

function assertExactBoxContribution(
  collider: PassedCandidateAdmission["contribution"]["staticColliders"][number],
  bounds: Readonly<{
    minimum: readonly [number, number, number];
    maximum: readonly [number, number, number];
  }>,
): void {
  expect(collider.vertexCount).toBeGreaterThanOrEqual(8);
  expect(collider.triangleCount).toBeGreaterThanOrEqual(8);
  assertColliderAxisAlignedBounds(collider.worldPositionsMetersXYZ, bounds);
}

async function auditedAdmission(
  module: BabylonNativeSceneModuleV1,
): Promise<Readonly<{
  admission: PassedCandidateAdmission;
  blockEvidence: BabylonNativeBlockCheckedEpochEvidenceV1;
  candidateColliderMeshes: readonly Mesh[];
  candidateScene: Scene;
  candidateEngine: NullEngine;
}>> {
  const packageInput = createBabylonNativeBlockWorldPackageTestInputV1({
    resourceBudget: RESOURCE_BUDGET,
  });
  const engine = new NullEngine();
  const scene = new Scene(engine);
  let admission: PassedCandidateAdmission | undefined;
  let blockEvidence: readonly BabylonNativeBlockCheckedEpochEvidenceV1[] =
    Object.freeze([]);
  let candidateColliderMeshes: readonly Mesh[] = Object.freeze([]);
  try {
    const result = await admitBabylonNativeSceneCandidateV1({
      candidate: Object.freeze({ engine, scene }),
      hostDerivedStaticColliders: Object.freeze([]),
      bootstrap: packageInput.nativeSceneBootstrap,
      module,
      assets: Object.freeze({
        async resolve(): Promise<never> {
          throw new Error("BWB-4 fixture declares no Native assets.");
        },
      }),
      budget: Object.freeze({
        maximumStaticColliderCount: RESOURCE_BUDGET.maximumColliders,
        maximumStaticColliderVertexCount: RESOURCE_BUDGET.maximumVertices,
        maximumStaticColliderTriangleCount: RESOURCE_BUDGET.maximumTriangles,
      }),
    });
    if (result.outcome !== "passed") {
      throw new Error(JSON.stringify(result.diagnostics));
    }
    admission = result;
    candidateColliderMeshes = Object.freeze(scene.meshes.filter(
      (mesh): mesh is Mesh =>
      mesh instanceof Mesh &&
      mesh.name.startsWith("worldkit-block-topology-collider-"),
    ));
  } finally {
    blockEvidence = takeBabylonNativeBlockCheckedEpochEvidenceV1(scene);
    scene.dispose();
    engine.dispose();
  }
  if (isNil(admission)) {
    throw new Error("BWB-4 fixture admission did not publish a Contribution.");
  }
  if (blockEvidence.length !== 1) {
    throw new Error("BWB-4 fixture admission did not publish one Block evidence record.");
  }
  return Object.freeze({
    admission,
    blockEvidence: blockEvidence[0]!,
    candidateColliderMeshes,
    candidateScene: scene,
    candidateEngine: engine,
  });
}

function verifiedPackage(
  candidate: Awaited<ReturnType<typeof auditedAdmission>>,
  openingCamera = { mode: "third-person" as const, distanceMeters: 5, targetHeightMeters: 1.2, pitchRadians: 0.18, fovDegrees: 56 },
): VerifiedBabylonNativeWorldPackageDirectoryV1 {
  const packageInput = createBabylonNativeBlockWorldPackageTestInputV1({
    resourceBudget: RESOURCE_BUDGET,
    nativeSceneContribution: candidate.admission.contribution,
  });
  const templateMetadata = packageInput.nativeBlockMaterializerMetadata;
  if (isNil(templateMetadata)) {
    throw new Error("BWB-4 fixture requires Block materializer metadata.");
  }
  if (
    candidate.blockEvidence.checkedLayout.checkResult.visualGroups.length !== 0
  ) {
    throw new Error("BWB-4 collider fixture must remain an ungrouped Block layout.");
  }
  const nativeBlockMaterializerMetadata =
    createBabylonNativeBlockMaterializerMetadataV1({
      authoringLayoutBinding: Object.freeze({
        kind: "native-block-authoring-layout-binding",
        groundExploration: { mode: "case-defined" as const },
        openingCamera,
        schemaVersion: 1,
        caseHash: templateMetadata.caseHash,
        authoringManifestHash: templateMetadata.authoringManifestHash,
        checkedLayoutInventoryHash:
          templateMetadata.checkedLayoutInventoryHash,
        contributionHash: candidate.admission.contributionHash,
        visualGroups: Object.freeze([]),
      }),
      checkedLayout: candidate.blockEvidence.checkedLayout,
      colliderInventory: candidate.blockEvidence.colliderInventory,
      profileInventoryHash: candidate.blockEvidence.profileInventoryHash,
      contribution: candidate.admission.contribution,
    });
  const verified = verifyWorldPackageDirectoryV1(
    createBabylonNativeWorldPackageV1(
      {
        ...packageInput,
        nativeBlockMaterializerMetadata,
      },
    ),
  );
  if (verified.kind !== "babylon-native-scene") {
    throw new Error("BWB-4 fixture must verify as one Babylon Native Package.");
  }
  return verified;
}

async function createRuntime(input: Readonly<{
  openingCamera?: Parameters<typeof verifiedPackage>[1];
  packageModule?: BabylonNativeSceneModuleV1;
  runtimeModule?: BabylonNativeSceneModuleV1;
  engineFactory?: () => NullEngine;
  onInitializationStage?: (stage: string) => void;
}> = {}): Promise<Readonly<{
  runtime: BabylonWorldRuntime;
  verified: VerifiedBabylonNativeWorldPackageDirectoryV1;
}>> {
  const packageModule = isNil(input.packageModule)
    ? createBabylonNativeBlockColliderRuntimeFixtureModuleV1()
    : input.packageModule;
  const runtimeModule = isNil(input.runtimeModule)
    ? packageModule
    : input.runtimeModule;
  const packageAdmission = await auditedAdmission(packageModule);
  const verified = verifiedPackage(packageAdmission, input.openingCamera);
  const configuration = runtimeWorldConfigurationFromVerifiedWorldPackageV1(
    verified,
  );
  if (configuration.sceneSource.kind !== "babylon-native-scene") {
    throw new Error("BWB-4 fixture must select the Babylon Native Scene Source.");
  }
  const runtimeSessionId = "runtime.bwb4-block-collider";
  const runtime = await BabylonWorldRuntime.create({
    sceneSource: {
      kind: "babylon-native-scene",
      descriptor: Object.freeze({
        runtimeSessionId,
        worldSessionId: "world-session.bwb4-block-collider",
        worldBuildIdentity: configuration.worldBuildIdentity,
        gameplayBootstrap: configuration.gameplayBootstrap,
        worldRuntimeBootstrap: configuration.worldRuntimeBootstrap,
        sceneSource: configuration.sceneSource,
      }),
      verifiedWorldPackage: verified,
      moduleLoader: Object.freeze({ load: async () => runtimeModule }),
    },
    worldRuntimeBootstrap: verified.worldRuntimeBootstrap,
    gameplayBootstrap: verified.gameplayBootstrap,
    runtimeSessionId,
    havokWasmBinary,
    engineFactory: isNil(input.engineFactory) ? (() => new NullEngine({
      renderWidth: 64,
      renderHeight: 64,
      textureSize: 64,
      deterministicLockstep: true,
      lockstepMaxSteps: 4,
    })) : input.engineFactory,
    ...(isNil(input.onInitializationStage)
      ? {}
      : { onInitializationStage: input.onInitializationStage }),
  });
  await bindRuntimeTestPossession(
    runtime,
    verified.worldRuntimeBootstrap.initialControlledEntityId,
  );
  return Object.freeze({ runtime, verified });
}

describe("BWB-4 Block Profile Collider Runtime", () => {
  it("consumes non-default opening Camera from the verified Block Package without mutating Bootstrap", async () => {
    const openingCamera = { mode: "third-person" as const, distanceMeters: 5.5,
      targetHeightMeters: 1.1, pitchRadians: 0.12, fovDegrees: 54 };
    const { runtime, verified } = await createRuntime({ openingCamera });
    const before = JSON.stringify(verified.bootstrap);
    try {
      const initial = runtime.snapshot();
      const controlledEntityId = verified.worldRuntimeBootstrap.initialControlledEntityId;
      // Possession is staged here; pose evidence begins at its committed Tick.
      expect(initial.camera.desiredTargetPositionMetersXYZ).toBeUndefined();
      const snapshot = await runtime.runFixedInput({ actions: [], ticks: 1 });
      expect(snapshot.camera.resolvedParameters).toMatchObject({ distanceMeters: 5.5,
        targetHeightMeters: 1.1, pitchRadians: 0.12, baseFovDegrees: 54 });
      // This primitive runtime fixture has no preferred Camera Socket; verify
      // the numeric target height reaches the actual desired pose as well.
      expect(snapshot.camera.selectedTargetSocketId).toBeUndefined();
      const subject = snapshot.subjectStatesByEntityId[
        verified.worldRuntimeBootstrap.initialControlledEntityId
      ]!;
      expect(snapshot.camera.desiredTargetPositionMetersXYZ![1] -
        subject.positionMetersXYZ[1]).toBeCloseTo(openingCamera.targetHeightMeters);
      expect(JSON.stringify(verified.bootstrap)).toBe(before);
      expect(verified.bootstrap.initialCamera).not.toEqual(openingCamera);
      runtime.reset();
      await bindRuntimeTestPossession(runtime, controlledEntityId);
      expect(runtime.snapshot().camera.desiredTargetPositionMetersXYZ).toBeUndefined();
      const replay = await runtime.runFixedInput({ actions: [], ticks: 1 });
      expect(replay.camera).toEqual(snapshot.camera);
    } finally { await runtime.dispose(); }
  });

  it("replays identical Contributions, hashes, and verified Packages from two disposed Candidates", async () => {
    const first = await auditedAdmission(
      createBabylonNativeBlockColliderRuntimeFixtureModuleV1(),
    );
    const second = await auditedAdmission(
      createBabylonNativeBlockColliderRuntimeFixtureModuleV1(),
    );
    expect(second.admission.contribution).toEqual(
      first.admission.contribution,
    );
    expect(second.admission.contributionHash).toBe(
      first.admission.contributionHash,
    );
    expect(first.admission.contribution.profileSettlement).toMatchObject({
      kind: "host-snapshot",
      profileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
      // 6 Block meshes plus 6 walkable-overlay settlement targets.
      targetCount: 12,
    });
    const expectedColliderIds = Object.keys(
      EXPECTED_COLLIDER_BOUNDS_METERS,
    ).sort();
    expect(first.admission.contribution.staticColliders.map(({ id }) => id))
      .toEqual(expectedColliderIds);
    for (const collider of first.admission.contribution.staticColliders) {
      const bounds = EXPECTED_COLLIDER_BOUNDS_METERS[
        collider.id as keyof typeof EXPECTED_COLLIDER_BOUNDS_METERS
      ];
      if (isNil(bounds)) {
        throw new Error(`Unexpected BWB-4 Collider '${collider.id}'.`);
      }
      assertExactBoxContribution(collider, bounds);
    }
    for (const candidate of [first, second]) {
      expect(candidate.candidateColliderMeshes).toHaveLength(6);
      expect(candidate.candidateColliderMeshes.every((mesh) =>
        mesh.isDisposed()
      )).toBe(true);
      expect(candidate.candidateScene.isDisposed).toBe(true);
      expect(candidate.candidateEngine.isDisposed).toBe(true);
    }

    const firstPackage = verifiedPackage(first);
    const secondPackage = verifiedPackage(second);
    expect(secondPackage.receipt.worldPackageRootHash).toBe(
      firstPackage.receipt.worldPackageRootHash,
    );
    expect(secondPackage.receipt.worldBuildIdentity).toEqual(
      firstPackage.receipt.worldBuildIdentity,
    );
    expect(secondPackage.receipt.worldBuildIdentityHash).toBe(
      firstPackage.receipt.worldBuildIdentityHash,
    );
    expect(firstPackage.nativeSceneContribution).toEqual(
      first.admission.contribution,
    );
    expect(secondPackage.nativeSceneContribution).toEqual(
      second.admission.contribution,
    );
  });

  it("rejects settled visual drift before Havok, camera, or subjects", async () => {
    const initializationStages: string[] = [];
    let candidateEngine: NullEngine | undefined;
    await expect(createRuntime({
      packageModule:
        createBabylonNativeBlockColliderRuntimeFixtureModuleV1(),
      runtimeModule:
        createBabylonNativeBlockColliderRuntimeFixtureModuleV1({
          paletteRole: "structure",
        }),
      engineFactory: () => {
        candidateEngine = new NullEngine({
          renderWidth: 64,
          renderHeight: 64,
          textureSize: 64,
          deterministicLockstep: true,
          lockstepMaxSteps: 4,
        });
        return candidateEngine;
      },
      onInitializationStage: (stage) => initializationStages.push(stage),
    })).rejects.toThrow(
      "WORLDKIT_NATIVE_SCENE_RUNTIME_CONTRIBUTION_MISMATCH",
    );
    expect(initializationStages).toEqual(["engine", "scene", "native-scene"]);
    expect(candidateEngine?.isDisposed).toBe(true);
  });

  it("passes 0.25m, blocks 0.5m, resets exactly, and loses support at the ledge", async () => {
    const { runtime, verified } = await createRuntime();
    const internals = runtime as unknown as {
      scene: Scene;
      engine: NullEngine;
    };
    const controlledEntityId =
      verified.worldRuntimeBootstrap.initialControlledEntityId;
    const controlledDescriptor =
      verified.worldRuntimeBootstrap.subjectRuntimeDescriptors.find(
        ({ entityId }) => entityId === controlledEntityId,
      );
    if (isNil(controlledDescriptor)) {
      throw new Error("Verified WorldRuntimeBootstrap is missing its controlled Subject.");
    }
    const elevatedContribution =
      verified.nativeSceneContribution.staticColliders.find(
        ({ id }) => id === "collider-elevated-tread",
      );
    if (
      isNil(elevatedContribution) ||
      elevatedContribution.traversalBinding.kind !== "static-surface"
    ) {
      throw new Error(
        "Verified Contribution is missing the elevated static surface.",
      );
    }
    const blockerContribution = verified.nativeSceneContribution.staticColliders
      .find(({ id }) => id === "collider-half-meter-blocker");
    if (isNil(blockerContribution)) {
      throw new Error("Verified Contribution is missing the half-meter blocker.");
    }
    const blockerNearFaceMetersZ = Math.max(
      ...blockerContribution.worldPositionsMetersXYZ.filter(
        (_, index) => index % 3 === 2,
      ),
    );
    const blockerCenterLimitMetersZ = blockerNearFaceMetersZ +
      controlledDescriptor.collider.radiusMeters;
    const spawnCollisionMesh = nativeColliderChunkPartMeshes(
      internals.scene,
      "collider-ground-zero",
    )[0];
    const collisionMeshes = internals.scene.meshes.filter(({ name }) =>
      name.startsWith("worldkit.native-collider."));
    const runSegmentedTraversal = async () => {
      const supported = await runtime.runFixedInput({ actions: [], ticks: 5 });
      const crossedRiser = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 65,
      });
      const elevatedTread = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 30,
      });
      const blocked = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 85,
      });
      return Object.freeze({
        supported,
        crossedRiser,
        elevatedTread,
        blocked,
      });
    };
    try {
      expect(controlledDescriptor.collider.maxStepHeightMeters).toBe(0.3);
      expect(collisionMeshes).toHaveLength(6);
      expect(Object.keys(EXPECTED_COLLIDER_BOUNDS_METERS).sort().map((id) => {
        const parts = nativeColliderChunkPartMeshes(internals.scene, id);
        expect(parts).toHaveLength(1);
        return parts[0]!.name;
      })).toEqual(collisionMeshes.map(({ name }) => name).sort());
      for (const mesh of collisionMeshes) {
        const colliderId = mesh.metadata?.worldkitEntityId as unknown;
        if (typeof colliderId !== "string") {
          throw new Error("Runtime collider Mesh is missing its verified ID.");
        }
        const bounds = EXPECTED_COLLIDER_BOUNDS_METERS[
          colliderId as keyof typeof EXPECTED_COLLIDER_BOUNDS_METERS
        ];
        if (isNil(bounds)) {
          throw new Error(`Unexpected Runtime collider '${colliderId}'.`);
        }
        const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
        const indices = mesh.getIndices();
        if (isNil(positions) || isNil(indices)) {
          throw new Error(`Runtime collider '${colliderId}' lost indexed geometry.`);
        }
        assertColliderAxisAlignedBounds([...positions], bounds);
        expect(indices.length).toBeGreaterThanOrEqual(24);
      }
      expect(spawnCollisionMesh?.metadata).toMatchObject({
        worldkitEntityId: "collider-ground-zero",
        colliderSubshapeId: expect.stringMatching(/^collider-subshape:[a-f0-9]{64}$/),
        worldkitNativeColliderRuntimeRole: "scene-static-collider",
        worldkitNativeTraversalKind: "static-surface",
        worldkitSurfaceEntityId: "surface-ground-zero",
        worldkitLogicalSubshapeId: "top",
        worldkitTraversalSurfaceId: expect.stringMatching(/^traversal-surface:/),
        worldkitTraversalSurfaceProfileRef:
          "worldkit://traversal-surface-profile/ground.static@1",
      });
      const physicsEngine = internals.scene.getPhysicsEngine();
      if (isNil(physicsEngine) || !(physicsEngine instanceof PhysicsEngine)) {
        throw new Error("BWB-4 Runtime did not initialize installed Havok.");
      }
      const elevatedSupportHits = physicsEngine.raycastMulti(
        new Vector3(0, 2, -3),
        new Vector3(0, -1, -3),
      );
      expect(elevatedSupportHits).toHaveLength(1);
      const elevatedSupport = elevatedSupportHits[0];
      if (isNil(elevatedSupport)) {
        throw new Error("Elevated tread must have exactly one Havok ray hit.");
      }
      expect(elevatedSupport.hasHit).toBe(true);
      expect(elevatedSupport.hitPointWorld.y).toBeCloseTo(0.25, 5);
      expect(elevatedSupport.hitNormalWorld.y).toBeGreaterThan(0.99);
      expect(elevatedSupport.body?.transformNode.metadata).toEqual({
        worldkitEntityId: elevatedContribution.id,
        colliderSubshapeId: elevatedContribution.colliderSubshapeId,
        worldkitNativeColliderRuntimeRole: "scene-static-collider",
        worldkitNativeTraversalKind:
          elevatedContribution.traversalBinding.kind,
        worldkitSurfaceEntityId:
          elevatedContribution.traversalBinding.surfaceEntityId,
        worldkitLogicalSubshapeId:
          elevatedContribution.traversalBinding.logicalSubshapeId,
        worldkitTraversalSurfaceId:
          elevatedContribution.traversalBinding.traversalSurfaceId,
        worldkitTraversalSurfaceProfileRef:
          elevatedContribution.traversalBinding.traversalSurfaceProfileRef,
      });

      const firstTraversal = await runSegmentedTraversal();
      expect(firstTraversal.supported.subjectStatesByEntityId[controlledEntityId])
        .toMatchObject({
        positionMetersXYZ: [0, 0, 0],
        movementMedium: "ground",
      });
      const crossedRiser = firstTraversal.crossedRiser
        .subjectStatesByEntityId[controlledEntityId]!;
      expect(crossedRiser.positionMetersXYZ[2]).toBeLessThan(-1.5);
      expect(crossedRiser.positionMetersXYZ[2]).toBeGreaterThan(-2.5);
      expect(crossedRiser.positionMetersXYZ[1]).toBeGreaterThan(0.24);
      expect(crossedRiser.positionMetersXYZ[1]).toBeLessThanOrEqual(
        controlledDescriptor.collider.maxStepHeightMeters + 0.01,
      );
      expect(crossedRiser.movementMedium).toBe("ground");
      const elevatedTread = firstTraversal.elevatedTread
        .subjectStatesByEntityId[controlledEntityId]!;
      expect(elevatedTread.positionMetersXYZ[2]).toBeLessThan(-2.5);
      expect(elevatedTread.positionMetersXYZ[2]).toBeGreaterThan(-3.5);
      expect(elevatedTread.positionMetersXYZ[1]).toBeGreaterThanOrEqual(0.25);
      expect(elevatedTread.positionMetersXYZ[1]).toBeLessThanOrEqual(0.31);
      expect(elevatedTread.movementMedium).toBe("ground");
      const blockedSubject = firstTraversal.blocked
        .subjectStatesByEntityId[controlledEntityId]!;
      expect(blockedSubject.positionMetersXYZ[2])
        .toBeGreaterThanOrEqual(blockerCenterLimitMetersZ - 0.02);
      expect(blockedSubject.positionMetersXYZ[2])
        .toBeLessThanOrEqual(blockerCenterLimitMetersZ + 0.08);
      expect(blockedSubject.positionMetersXYZ[1]).toBeGreaterThanOrEqual(0.25);
      expect(blockedSubject.positionMetersXYZ[1]).toBeLessThanOrEqual(0.31);
      expect(blockedSubject.movementMedium).toBe("ground");
      const committedHash = sha256CanonicalJson(firstTraversal.blocked);

      runtime.reset();
      await bindRuntimeTestPossession(runtime, controlledEntityId);
      const replayedTraversal = await runSegmentedTraversal();
      expect(replayedTraversal).toEqual(firstTraversal);
      expect(replayedTraversal.blocked).toEqual(firstTraversal.blocked);
      expect(sha256CanonicalJson(replayedTraversal.blocked)).toBe(
        committedHash,
      );

      runtime.reset();
      await bindRuntimeTestPossession(runtime, controlledEntityId);
      const reproducedElevated = await runtime.runFixedInput({
        actions: [],
        ticks: 5,
      });
      expect(reproducedElevated).toEqual(firstTraversal.supported);
      const reproducedRiser = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 65,
      });
      expect(reproducedRiser).toEqual(firstTraversal.crossedRiser);
      const reproducedTread = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 30,
      });
      expect(reproducedTread).toEqual(firstTraversal.elevatedTread);
      const departed = await runtime.runFixedInput({
        actions: ["move-right"],
        ticks: 180,
      });
      expect(departed.subjectStatesByEntityId[controlledEntityId]!
        .positionMetersXYZ[0])
        .toBeGreaterThan(0.5);
      expect(departed.subjectStatesByEntityId[controlledEntityId]!
        .positionMetersXYZ[1])
        .toBeLessThan(-0.25);
      expect(departed.subjectStatesByEntityId[controlledEntityId]!
        .movementMedium).toBe("air");
    } finally {
      await runtime.dispose();
    }
    expect(spawnCollisionMesh?.isDisposed()).toBe(true);
    expect(collisionMeshes.every((mesh) => mesh.isDisposed())).toBe(true);
    expect(internals.scene.isDisposed).toBe(true);
    expect(internals.engine.isDisposed).toBe(true);
  }, 30_000);
});
