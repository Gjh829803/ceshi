import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";

export interface BabylonNativeSceneSpawnMarkerV1 {
  readonly id: string;
  readonly positionMetersXYZ: readonly [number, number, number];
  readonly facingRadians: number;
}

export interface BabylonNativeStaticCollisionMeshRegistrationV1 {
  readonly id: string;
  readonly mesh: Mesh;
  readonly surfaceKind: "walkable" | "obstacle";
  readonly frictionRatio?: number;
  readonly restitutionRatio?: number;
}

export interface BabylonNativeStaticCollisionMeshV1 {
  readonly id: string;
  /** Module-owned source Mesh retained only for diagnostics and visual debug. */
  readonly sourceMesh: Mesh;
  readonly surfaceKind: "walkable" | "obstacle";
  readonly frictionRatio: number;
  readonly restitutionRatio: number;
  readonly worldPositionsMetersXYZ: readonly number[];
  readonly triangleIndices: readonly number[];
  readonly vertexCount: number;
  readonly triangleCount: number;
}

export interface BabylonNativeSceneBuildContextV1 {
  readonly scene: Scene;
  registerSpawnMarker(input: BabylonNativeSceneSpawnMarkerV1): void;
  registerStaticCollisionMesh(
    input: BabylonNativeStaticCollisionMeshRegistrationV1,
  ): void;
}

export interface BabylonNativeSceneModuleV1 {
  readonly kind: "babylon-native-scene-module";
  readonly id: string;
  build(context: BabylonNativeSceneBuildContextV1): void | Promise<void>;
}

export interface BabylonNativeSceneAdmissionBudgetV1 {
  readonly maximumStaticColliderCount: number;
  readonly maximumStaticColliderVertexCount: number;
  readonly maximumStaticColliderTriangleCount: number;
}

export interface BabylonNativeSceneContributionV1 {
  readonly moduleId: string;
  readonly spawnMarker: BabylonNativeSceneSpawnMarkerV1;
  readonly staticCollisionMeshes: readonly BabylonNativeStaticCollisionMeshV1[];
}

export interface BuildBabylonNativeSceneContributionInputV1 {
  readonly scene: Scene;
  readonly module: BabylonNativeSceneModuleV1;
  readonly budget: BabylonNativeSceneAdmissionBudgetV1;
}

function nativeSceneError(code: string, message: string): Error {
  return new Error(`${code}: ${message}`);
}

function nonEmptyCanonicalId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function finiteVector3(
  value: unknown,
): value is readonly [number, number, number] {
  return Array.isArray(value) &&
    value.length === 3 &&
    value.every((component) =>
      typeof component === "number" && Number.isFinite(component)
    );
}

function boundedRatio(
  value: number | undefined,
  fallback: number,
  label: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < 0 || resolved > 1) {
    throw nativeSceneError(
      "WORLDKIT_NATIVE_SCENE_COLLIDER_MATERIAL_INVALID",
      `${label} must be finite and between zero and one.`,
    );
  }
  return resolved;
}

function assertBudget(
  budget: BabylonNativeSceneAdmissionBudgetV1,
): void {
  if (
    !Number.isSafeInteger(budget.maximumStaticColliderCount) ||
    budget.maximumStaticColliderCount < 0 ||
    !Number.isSafeInteger(budget.maximumStaticColliderVertexCount) ||
    budget.maximumStaticColliderVertexCount < 0 ||
    !Number.isSafeInteger(budget.maximumStaticColliderTriangleCount) ||
    budget.maximumStaticColliderTriangleCount < 0
  ) {
    throw nativeSceneError(
      "WORLDKIT_NATIVE_SCENE_BUDGET_INVALID",
      "Native Scene collider budgets must be non-negative safe integers.",
    );
  }
}

interface ValidatedColliderGeometryV1 {
  readonly worldPositionsMetersXYZ: readonly number[];
  readonly triangleIndices: readonly number[];
  readonly vertexCount: number;
  readonly triangleCount: number;
}

function validatedColliderGeometry(
  mesh: Mesh,
  colliderId: string,
): ValidatedColliderGeometryV1 {
  const invalidGeometry = (): Error => nativeSceneError(
    "WORLDKIT_NATIVE_SCENE_COLLIDER_GEOMETRY_INVALID",
    `Native Scene collider '${colliderId}' must contain finite indexed triangles and a finite world transform.`,
  );
  try {
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    const indices = mesh.getIndices();
    if (
      positions === null ||
      positions.length === 0 ||
      positions.length % 3 !== 0 ||
      !positions.every(Number.isFinite) ||
      indices === null ||
      indices.length === 0 ||
      indices.length % 3 !== 0
    ) {
      throw invalidGeometry();
    }
    const vertexCount = positions.length / 3;
    if (!indices.every((index) =>
      Number.isSafeInteger(index) && index >= 0 && index < vertexCount
    )) {
      throw invalidGeometry();
    }
    if (mesh.hasThinInstances || mesh.physicsBody !== undefined) {
      throw nativeSceneError(
        "WORLDKIT_NATIVE_SCENE_COLLIDER_PROVIDER_STATE_INVALID",
        `Native Scene collider '${colliderId}' cannot carry thin instances or a pre-existing Physics Body.`,
      );
    }
    const worldMatrix = mesh.computeWorldMatrix(true);
    const worldMatrixValues = worldMatrix.asArray();
    if (!worldMatrixValues.every(Number.isFinite)) throw invalidGeometry();
    const worldPositionsMetersXYZ: number[] = [];
    const localPosition = new Vector3();
    const worldPosition = new Vector3();
    for (let index = 0; index < positions.length; index += 3) {
      localPosition.set(
        positions[index]!,
        positions[index + 1]!,
        positions[index + 2]!,
      );
      Vector3.TransformCoordinatesToRef(
        localPosition,
        worldMatrix,
        worldPosition,
      );
      if (
        !Number.isFinite(worldPosition.x) ||
        !Number.isFinite(worldPosition.y) ||
        !Number.isFinite(worldPosition.z)
      ) {
        throw invalidGeometry();
      }
      worldPositionsMetersXYZ.push(
        worldPosition.x,
        worldPosition.y,
        worldPosition.z,
      );
    }
    return Object.freeze({
      worldPositionsMetersXYZ: Object.freeze(worldPositionsMetersXYZ),
      triangleIndices: Object.freeze([...indices]),
      vertexCount,
      triangleCount: indices.length / 3,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith(
        "WORLDKIT_NATIVE_SCENE_COLLIDER_PROVIDER_STATE_INVALID:",
      )
    ) {
      throw error;
    }
    throw invalidGeometry();
  }
}

export async function buildBabylonNativeSceneContributionV1(
  input: BuildBabylonNativeSceneContributionInputV1,
): Promise<BabylonNativeSceneContributionV1> {
  assertBudget(input.budget);
  if (
    input.module.kind !== "babylon-native-scene-module" ||
    !nonEmptyCanonicalId(input.module.id) ||
    typeof input.module.build !== "function"
  ) {
    throw nativeSceneError(
      "WORLDKIT_NATIVE_SCENE_MODULE_INVALID",
      "Native Scene Module must have a canonical ID and build function.",
    );
  }

  let acceptingRegistrations = true;
  let spawnMarker: BabylonNativeSceneSpawnMarkerV1 | undefined;
  let firstRegistrationFailure: unknown;
  let moduleFailure: unknown;
  let totalVertexCount = 0;
  let totalTriangleCount = 0;
  const colliderIds = new Set<string>();
  const staticCollisionMeshes: BabylonNativeStaticCollisionMeshV1[] = [];

  const retainFailure = (error: unknown): never => {
    firstRegistrationFailure ??= error;
    throw error;
  };
  const assertRegistrationOpen = (): void => {
    if (!acceptingRegistrations) {
      retainFailure(nativeSceneError(
        "WORLDKIT_NATIVE_SCENE_REGISTRATION_CLOSED",
        "Native Scene registration is only available while build() is active.",
      ));
    }
  };

  const context: BabylonNativeSceneBuildContextV1 = Object.freeze({
    scene: input.scene,
    registerSpawnMarker: (candidate: BabylonNativeSceneSpawnMarkerV1): void => {
      assertRegistrationOpen();
      if (spawnMarker !== undefined) {
        retainFailure(nativeSceneError(
          "WORLDKIT_NATIVE_SCENE_SPAWN_DUPLICATE",
          "Native Scene Module may register exactly one Spawn Marker.",
        ));
      }
      if (
        !nonEmptyCanonicalId(candidate.id) ||
        !finiteVector3(candidate.positionMetersXYZ) ||
        !Number.isFinite(candidate.facingRadians)
      ) {
        retainFailure(nativeSceneError(
          "WORLDKIT_NATIVE_SCENE_SPAWN_INVALID",
          "Native Scene Spawn Marker must use a canonical ID and finite values.",
        ));
      }
      spawnMarker = Object.freeze({
        id: candidate.id,
        positionMetersXYZ: Object.freeze([
          ...candidate.positionMetersXYZ,
        ]) as readonly [number, number, number],
        facingRadians: candidate.facingRadians,
      });
    },
    registerStaticCollisionMesh: (
      candidate: BabylonNativeStaticCollisionMeshRegistrationV1,
    ): void => {
      assertRegistrationOpen();
      if (!nonEmptyCanonicalId(candidate.id)) {
        retainFailure(nativeSceneError(
          "WORLDKIT_NATIVE_SCENE_COLLIDER_ID_INVALID",
          "Native Scene collider ID must be a non-empty canonical string.",
        ));
      }
      if (colliderIds.has(candidate.id)) {
        retainFailure(nativeSceneError(
          "WORLDKIT_NATIVE_SCENE_COLLIDER_ID_DUPLICATE",
          `Native Scene collider ID '${candidate.id}' is duplicated.`,
        ));
      }
      if (!(candidate.mesh instanceof Mesh)) {
        retainFailure(nativeSceneError(
          "WORLDKIT_NATIVE_SCENE_COLLIDER_MESH_INVALID",
          `Native Scene collider '${candidate.id}' must be a Babylon Mesh.`,
        ));
      }
      if (candidate.mesh.isDisposed()) {
        retainFailure(nativeSceneError(
          "WORLDKIT_NATIVE_SCENE_COLLIDER_DISPOSED",
          `Native Scene collider '${candidate.id}' is already disposed.`,
        ));
      }
      if (candidate.mesh.getScene() !== input.scene) {
        retainFailure(nativeSceneError(
          "WORLDKIT_NATIVE_SCENE_COLLIDER_SCENE_MISMATCH",
          `Native Scene collider '${candidate.id}' belongs to another Scene.`,
        ));
      }
      if (
        candidate.surfaceKind !== "walkable" &&
        candidate.surfaceKind !== "obstacle"
      ) {
        retainFailure(nativeSceneError(
          "WORLDKIT_NATIVE_SCENE_COLLIDER_SURFACE_KIND_INVALID",
          `Native Scene collider '${candidate.id}' has an unsupported surface kind.`,
        ));
      }
      const retainValidated = <T>(operation: () => T): T => {
        try {
          return operation();
        } catch (error) {
          return retainFailure(error);
        }
      };
      const geometry = retainValidated(() =>
        validatedColliderGeometry(candidate.mesh, candidate.id),
      );
      if (
        staticCollisionMeshes.length + 1 >
          input.budget.maximumStaticColliderCount
      ) {
        retainFailure(nativeSceneError(
          "WORLDKIT_NATIVE_SCENE_COLLIDER_COUNT_EXCEEDED",
          "Native Scene collider count exceeds its admission budget.",
        ));
      }
      if (
        totalVertexCount + geometry.vertexCount >
          input.budget.maximumStaticColliderVertexCount
      ) {
        retainFailure(nativeSceneError(
          "WORLDKIT_NATIVE_SCENE_COLLIDER_VERTICES_EXCEEDED",
          "Native Scene collider vertex count exceeds its admission budget.",
        ));
      }
      if (
        totalTriangleCount + geometry.triangleCount >
          input.budget.maximumStaticColliderTriangleCount
      ) {
        retainFailure(nativeSceneError(
          "WORLDKIT_NATIVE_SCENE_COLLIDER_TRIANGLES_EXCEEDED",
          "Native Scene collider triangle count exceeds its admission budget.",
        ));
      }
      const { frictionRatio, restitutionRatio } = retainValidated(() => ({
        frictionRatio: boundedRatio(
          candidate.frictionRatio,
          0.75,
          "frictionRatio",
        ),
        restitutionRatio: boundedRatio(
          candidate.restitutionRatio,
          0,
          "restitutionRatio",
        ),
      }));
      colliderIds.add(candidate.id);
      totalVertexCount += geometry.vertexCount;
      totalTriangleCount += geometry.triangleCount;
      staticCollisionMeshes.push(Object.freeze({
        id: candidate.id,
        sourceMesh: candidate.mesh,
        surfaceKind: candidate.surfaceKind,
        frictionRatio,
        restitutionRatio,
        ...geometry,
      }));
    },
  });

  try {
    await input.module.build(context);
  } catch (error) {
    moduleFailure = error;
  } finally {
    acceptingRegistrations = false;
  }
  if (firstRegistrationFailure !== undefined) throw firstRegistrationFailure;
  if (moduleFailure !== undefined) {
    throw nativeSceneError(
      "WORLDKIT_NATIVE_SCENE_MODULE_BUILD_FAILED",
      "Native Scene Module build failed.",
    );
  }
  if (spawnMarker === undefined) {
    throw nativeSceneError(
      "WORLDKIT_NATIVE_SCENE_SPAWN_REQUIRED",
      "Native Scene Module must register exactly one Spawn Marker.",
    );
  }
  let finalizedVertexCount = 0;
  let finalizedTriangleCount = 0;
  const finalizedCollisionMeshes = staticCollisionMeshes.map((collider) => {
    if (collider.sourceMesh.isDisposed()) {
      throw nativeSceneError(
        "WORLDKIT_NATIVE_SCENE_COLLIDER_DISPOSED",
        `Native Scene collider '${collider.id}' was disposed before build completed.`,
      );
    }
    if (collider.sourceMesh.getScene() !== input.scene) {
      throw nativeSceneError(
        "WORLDKIT_NATIVE_SCENE_COLLIDER_SCENE_MISMATCH",
        `Native Scene collider '${collider.id}' no longer belongs to the Host Scene.`,
      );
    }
    const geometry = validatedColliderGeometry(
      collider.sourceMesh,
      collider.id,
    );
    finalizedVertexCount += geometry.vertexCount;
    finalizedTriangleCount += geometry.triangleCount;
    if (
      finalizedVertexCount > input.budget.maximumStaticColliderVertexCount
    ) {
      throw nativeSceneError(
        "WORLDKIT_NATIVE_SCENE_COLLIDER_VERTICES_EXCEEDED",
        "Native Scene collider vertex count exceeds its admission budget after build.",
      );
    }
    if (
      finalizedTriangleCount >
        input.budget.maximumStaticColliderTriangleCount
    ) {
      throw nativeSceneError(
        "WORLDKIT_NATIVE_SCENE_COLLIDER_TRIANGLES_EXCEEDED",
        "Native Scene collider triangle count exceeds its admission budget after build.",
      );
    }
    return Object.freeze({
      ...collider,
      ...geometry,
    });
  });
  return Object.freeze({
    moduleId: input.module.id,
    spawnMarker,
    staticCollisionMeshes: Object.freeze(finalizedCollisionMeshes),
  });
}
