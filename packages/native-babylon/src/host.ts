import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import {
  parseBabylonNativeSceneBootstrapV1,
  type BabylonNativeSceneBootstrapV1,
} from "@whitebox-world/runtime-contracts";

import type { BabylonNativeLockedAssetResolverV1 } from "./assets.js";
import {
  createBabylonNativeStaticColliderContributionV1,
  hashBabylonNativeSceneContributionV1,
  parseBabylonNativeSceneContributionV1,
  parseBabylonNativeTraversalBindingV1,
  type BabylonNativeSceneContributionV1,
  type BabylonNativeStaticColliderContributionV1,
} from "./contribution.js";
import {
  parseNativeSceneCheckResultV1,
  parseNativeSceneDiagnosticV1,
  type NativeSceneCheckResultV1,
  type NativeSceneDiagnosticLocationV1,
  type NativeSceneDiagnosticMeasurementV1,
  type NativeSceneDiagnosticStageV1,
} from "./diagnostics.js";
import {
  defineBabylonNativeScene,
  type BabylonNativeSceneBuildContextV1,
  type BabylonNativeSceneModuleV1,
  type BabylonNativeSpawnMarkerV1,
  type BabylonNativeStaticColliderV1,
  type BabylonNativeTraversalBindingV1,
} from "./module.js";
import type { BabylonNativeHostRandomV1 } from "./random.js";

export type {
  BabylonNativeContributionTraversalBindingV1,
  BabylonNativeSceneContributionV1,
  BabylonNativeSpawnMarkerContributionV1,
  BabylonNativeStaticColliderContributionV1,
} from "./contribution.js";
export {
  hashBabylonNativeSceneContributionV1,
  parseBabylonNativeSceneContributionV1,
} from "./contribution.js";

export interface BabylonNativeSceneAdmissionBudgetV1 {
  readonly maximumStaticColliderCount: number;
  readonly maximumStaticColliderVertexCount: number;
  readonly maximumStaticColliderTriangleCount: number;
}

export interface BuildBabylonNativeSceneCandidateInputV1 {
  readonly scene: Scene;
  readonly bootstrap: BabylonNativeSceneBootstrapV1;
  readonly module: BabylonNativeSceneModuleV1;
  readonly random: BabylonNativeHostRandomV1;
  readonly assets: BabylonNativeLockedAssetResolverV1;
  readonly budget: BabylonNativeSceneAdmissionBudgetV1;
}

export type BuildBabylonNativeSceneCandidateResultV1 =
  | Readonly<{
      outcome: "passed";
      checkResult: NativeSceneCheckResultV1;
      contribution: BabylonNativeSceneContributionV1;
      contributionHash: `sha256:${string}`;
    }>
  | Readonly<{
      outcome: "rejected" | "tool-error";
      checkResult: NativeSceneCheckResultV1;
    }>;

class NativeSceneAdmissionFailure extends Error {
  constructor(
    readonly code: string,
    readonly stage: NativeSceneDiagnosticStageV1,
    readonly location: NativeSceneDiagnosticLocationV1,
    readonly measurement: NativeSceneDiagnosticMeasurementV1,
    message: string,
    readonly repairHint: string,
  ) {
    super(`${code}: ${message}`);
  }
}

function failure(
  code: string,
  message: string,
  repairHint: string,
  options: Readonly<{
    stage?: NativeSceneDiagnosticStageV1;
    location?: NativeSceneDiagnosticLocationV1;
    measurement?: NativeSceneDiagnosticMeasurementV1;
  }> = {},
): NativeSceneAdmissionFailure {
  return new NativeSceneAdmissionFailure(
    code,
    options.stage ?? "contribution-admission",
    options.location ?? Object.freeze({ kind: "none" }),
    options.measurement ?? Object.freeze({ kind: "none" }),
    message,
    repairHint,
  );
}

function registrationLocation(id: string): NativeSceneDiagnosticLocationV1 {
  return Object.freeze({ kind: "registration", registrationId: id });
}

function canonicalIdentity(value: unknown, code: string, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    value.normalize("NFC") !== value
  ) {
    throw failure(code, `${label} must be a canonical non-empty string.`, `Replace ${label} with one stable canonical ID.`);
  }
  return value;
}

function canonicalNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw failure(
      "WORLDKIT_NATIVE_SCENE_NUMERIC_VALUE_INVALID",
      "Native Scene registration contains a non-finite number.",
      "Use finite world-space meters and radians.",
    );
  }
  return Object.is(value, -0) ? 0 : value;
}

function canonicalSpawnNumber(value: unknown, id: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw failure(
      "WORLDKIT_NATIVE_SCENE_SPAWN_INVALID",
      `Spawn Marker '${id}' must use finite world-space values.`,
      "Use finite positionMetersXYZ coordinates and facingRadians.",
      { location: registrationLocation(id) },
    );
  }
  return Object.is(value, -0) ? 0 : value;
}

function exactDataObject(
  input: unknown,
  requiredFields: readonly string[],
  optionalFields: readonly string[],
  error: NativeSceneAdmissionFailure,
): Record<string, unknown> {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Reflect.getPrototypeOf(input) !== Object.prototype ||
    Reflect.ownKeys(input).some((key) => typeof key !== "string")
  ) throw error;
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Object.keys(descriptors);
  const allowed = [...requiredFields, ...optionalFields];
  if (
    requiredFields.some((field) => !Object.hasOwn(descriptors, field)) ||
    keys.some((field) => !allowed.includes(field)) ||
    Object.values(descriptors).some((descriptor) =>
      !descriptor.enumerable || !("value" in descriptor)
    )
  ) throw error;
  return Object.fromEntries(
    keys.map((key) => [key, descriptors[key]!.value]),
  );
}

function boundedRatio(
  input: unknown,
  fallback: number,
  id: string,
  label: string,
): number {
  if (input === undefined) return fallback;
  const value = canonicalNumber(input);
  if (value < 0 || value > 1) {
    throw failure(
      "WORLDKIT_NATIVE_SCENE_COLLIDER_MATERIAL_INVALID",
      `${label} for collider '${id}' must be between zero and one.`,
      `Set ${label} to a ratio in the closed range 0..1.`,
      { location: registrationLocation(id) },
    );
  }
  return value;
}

function validateBudget(budget: BabylonNativeSceneAdmissionBudgetV1): void {
  const budgetFailure = failure(
    "WORLDKIT_NATIVE_SCENE_BUDGET_INVALID",
    "Native Scene admission budget must use the closed three-field contract.",
    "Remove unknown budget fields and provide all collider limits.",
    { stage: "capability" },
  );
  const record = exactDataObject(
    budget,
    [
      "maximumStaticColliderCount",
      "maximumStaticColliderVertexCount",
      "maximumStaticColliderTriangleCount",
    ],
    [],
    budgetFailure,
  );
  for (const [field, value] of Object.entries(record)) {
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      throw failure(
        "WORLDKIT_NATIVE_SCENE_BUDGET_INVALID",
        `${field} must be a non-negative safe integer.`,
        "Use the Host-authorized Native Scene admission budget unchanged.",
        { stage: "capability" },
      );
    }
  }
}

function validatedColliderGeometry(
  mesh: Mesh,
  colliderId: string,
): Readonly<{
  worldPositionsMetersXYZ: readonly number[];
  triangleIndices: readonly number[];
  vertexCount: number;
  triangleCount: number;
}> {
  const invalidGeometry = () => failure(
    "WORLDKIT_NATIVE_SCENE_COLLIDER_GEOMETRY_INVALID",
    `Collider '${colliderId}' must contain finite indexed triangles and a finite world transform.`,
    "Use a finite indexed low-detail Mesh owned by the Candidate Scene.",
    { location: registrationLocation(colliderId) },
  );
  try {
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    const indices = mesh.getIndices();
    if (
      positions === null ||
      positions.length < 9 ||
      positions.length % 3 !== 0 ||
      !positions.every(Number.isFinite) ||
      indices === null ||
      indices.length === 0 ||
      indices.length % 3 !== 0
    ) throw invalidGeometry();
    const vertexCount = positions.length / 3;
    if (!indices.every((index) =>
      Number.isSafeInteger(index) && index >= 0 && index < vertexCount
    )) throw invalidGeometry();
    if (
      mesh.hasThinInstances ||
      (mesh.physicsBody !== undefined && mesh.physicsBody !== null)
    ) {
      throw failure(
        "WORLDKIT_NATIVE_SCENE_COLLIDER_PROVIDER_STATE_INVALID",
        `Collider '${colliderId}' cannot carry Thin Instances or a provider-created Physics Body.`,
        "Create one ordinary low-detail Mesh and let the SDK create physics.",
        { location: registrationLocation(colliderId) },
      );
    }
    const worldMatrix = mesh.computeWorldMatrix(true);
    if (!worldMatrix.asArray().every(Number.isFinite)) throw invalidGeometry();
    const local = new Vector3();
    const world = new Vector3();
    const worldPositionsMetersXYZ: number[] = [];
    for (let index = 0; index < positions.length; index += 3) {
      local.set(positions[index]!, positions[index + 1]!, positions[index + 2]!);
      Vector3.TransformCoordinatesToRef(local, worldMatrix, world);
      worldPositionsMetersXYZ.push(
        canonicalNumber(world.x),
        canonicalNumber(world.y),
        canonicalNumber(world.z),
      );
    }
    return Object.freeze({
      worldPositionsMetersXYZ: Object.freeze(worldPositionsMetersXYZ),
      triangleIndices: Object.freeze([...indices]),
      vertexCount,
      triangleCount: indices.length / 3,
    });
  } catch (error) {
    if (error instanceof NativeSceneAdmissionFailure) throw error;
    throw invalidGeometry();
  }
}

function rejectedResult(
  bootstrap: BabylonNativeSceneBootstrapV1,
  problem: NativeSceneAdmissionFailure,
): BuildBabylonNativeSceneCandidateResultV1 {
  const diagnostic = parseNativeSceneDiagnosticV1({
    kind: "native-scene-diagnostic",
    schemaVersion: 1,
    id: `${bootstrap.id}.${problem.code.toLowerCase()}`,
    severity: "error",
    stage: problem.stage,
    code: problem.code,
    location: problem.location,
    measurement: problem.measurement,
    message: problem.message.slice(problem.code.length + 2),
    repairHint: problem.repairHint,
  });
  return Object.freeze({
    outcome: "rejected",
    checkResult: parseNativeSceneCheckResultV1({
      kind: "native-scene-check-result",
      schemaVersion: 1,
      id: `${bootstrap.id}.native-scene-check`,
      checkedInput: {
        kind: "native-scene-module",
        sceneModuleRef: bootstrap.sceneModuleRef,
      },
      outcome: "rejected",
      diagnostics: [diagnostic],
    }),
  });
}

function invalidBootstrapResult(): BuildBabylonNativeSceneCandidateResultV1 {
  const diagnostic = parseNativeSceneDiagnosticV1({
    kind: "native-scene-diagnostic",
    schemaVersion: 1,
    id: "unresolved-native-world.bootstrap-invalid",
    severity: "error",
    stage: "bootstrap",
    code: "WORLDKIT_NATIVE_SCENE_BOOTSTRAP_INVALID",
    location: { kind: "bootstrap", instancePath: "" },
    measurement: { kind: "none" },
    message: "Native Scene Bootstrap failed its exact parser.",
    repairHint: "Repair the Bootstrap before invoking the Native Host.",
  });
  return Object.freeze({
    outcome: "rejected",
    checkResult: parseNativeSceneCheckResultV1({
      kind: "native-scene-check-result",
      schemaVersion: 1,
      id: "unresolved-native-world.native-scene-check",
      checkedInput: { kind: "unresolved-world" },
      outcome: "rejected",
      diagnostics: [diagnostic],
    }),
  });
}

interface RetainedColliderV1 {
  readonly mesh: Mesh;
  readonly bindingSource: unknown;
  readonly frozen: BabylonNativeStaticColliderContributionV1;
}

export async function buildBabylonNativeSceneCandidateV1(
  input: BuildBabylonNativeSceneCandidateInputV1,
): Promise<BuildBabylonNativeSceneCandidateResultV1> {
  let bootstrap: BabylonNativeSceneBootstrapV1;
  try {
    bootstrap = parseBabylonNativeSceneBootstrapV1(input.bootstrap);
  } catch {
    return invalidBootstrapResult();
  }

  try {
    validateBudget(input.budget);
    const module = defineBabylonNativeScene(input.module);
    let acceptingRegistrations = true;
    let spawnMarker: BabylonNativeSceneContributionV1["spawnMarker"] | undefined;
    let firstRegistrationFailure: NativeSceneAdmissionFailure | undefined;
    let moduleFailure: unknown;
    let totalVertexCount = 0;
    let totalTriangleCount = 0;
    const registrationIds = new Set<string>();
    const retainedColliders: RetainedColliderV1[] = [];

    const retainFailure = (problem: NativeSceneAdmissionFailure): never => {
      firstRegistrationFailure ??= problem;
      throw problem;
    };
    const assertOpen = (): void => {
      if (!acceptingRegistrations) {
        throw failure(
          "WORLDKIT_NATIVE_SCENE_REGISTRATION_CLOSED",
          "Native Scene registration is available only while build() is active.",
          "Register Spawn and static Collider intent synchronously within build().",
          { stage: "build" },
        );
      }
    };

    const registration: BabylonNativeSceneBuildContextV1["registration"] =
      Object.freeze({
        registerSpawnMarker(candidate: Readonly<BabylonNativeSpawnMarkerV1>) {
          assertOpen();
          try {
            const record = exactDataObject(
              candidate,
              ["id", "positionMetersXYZ", "facingRadians"],
              [],
              failure(
                "WORLDKIT_NATIVE_SCENE_SPAWN_INVALID",
                "Spawn Marker must use the closed finite registration contract.",
                "Provide id, positionMetersXYZ, and facingRadians only.",
              ),
            );
            if (spawnMarker !== undefined) {
              throw failure(
                "WORLDKIT_NATIVE_SCENE_SPAWN_DUPLICATE",
                "Native Scene Module may register exactly one Spawn Marker.",
                "Keep one registerSpawnMarker() call.",
              );
            }
            const id = canonicalIdentity(
              record.id,
              "WORLDKIT_NATIVE_SCENE_SPAWN_INVALID",
              "Spawn Marker id",
            );
            if (
              !Array.isArray(record.positionMetersXYZ) ||
              record.positionMetersXYZ.length !== 3
            ) {
              throw failure(
                "WORLDKIT_NATIVE_SCENE_SPAWN_INVALID",
                "Spawn Marker positionMetersXYZ must contain three finite numbers.",
                "Provide [x, y, z] in world-space meters.",
                { location: registrationLocation(id) },
              );
            }
            if (registrationIds.has(id)) {
              throw failure(
                "WORLDKIT_NATIVE_SCENE_SPAWN_DUPLICATE",
                `Registration id '${id}' is duplicated.`,
                "Use one stable unique ID per registration.",
                { location: registrationLocation(id) },
              );
            }
            const positionMetersXYZ = Object.freeze([
              canonicalSpawnNumber(record.positionMetersXYZ[0], id),
              canonicalSpawnNumber(record.positionMetersXYZ[1], id),
              canonicalSpawnNumber(record.positionMetersXYZ[2], id),
            ] as const);
            spawnMarker = Object.freeze({
              id,
              positionMetersXYZ,
              facingRadians: canonicalSpawnNumber(record.facingRadians, id),
            });
            registrationIds.add(id);
          } catch (error) {
            return retainFailure(
              error instanceof NativeSceneAdmissionFailure
                ? error
                : failure(
                    "WORLDKIT_NATIVE_SCENE_SPAWN_INVALID",
                    "Spawn Marker registration is invalid.",
                    "Use the closed Spawn Marker contract with finite values.",
                  ),
            );
          }
        },
        registerStaticCollider(candidate: Readonly<BabylonNativeStaticColliderV1>) {
          assertOpen();
          try {
            const record = exactDataObject(
              candidate,
              ["id", "mesh", "traversalBinding"],
              ["frictionRatio", "restitutionRatio"],
              failure(
                "WORLDKIT_NATIVE_SCENE_COLLIDER_REGISTRATION_INVALID",
                "Static Collider must use the closed registration contract.",
                "Provide id, mesh, traversalBinding, and optional material ratios only.",
              ),
            );
            const id = canonicalIdentity(
              record.id,
              "WORLDKIT_NATIVE_SCENE_COLLIDER_ID_INVALID",
              "Collider id",
            );
            if (registrationIds.has(id)) {
              throw failure(
                "WORLDKIT_NATIVE_SCENE_COLLIDER_ID_DUPLICATE",
                `Collider id '${id}' is duplicated.`,
                "Use one stable unique ID per Collider registration.",
                { location: registrationLocation(id) },
              );
            }
            if (!(record.mesh instanceof Mesh)) {
              throw failure(
                "WORLDKIT_NATIVE_SCENE_COLLIDER_MESH_INVALID",
                `Collider '${id}' must reference a Babylon Mesh.`,
                "Register one ordinary Mesh created in the Candidate Scene.",
                { location: registrationLocation(id) },
              );
            }
            const mesh = record.mesh;
            if (mesh.isDisposed()) {
              throw failure(
                "WORLDKIT_NATIVE_SCENE_COLLIDER_DISPOSED",
                `Collider '${id}' is already disposed.`,
                "Keep the registered proxy alive until build() settles.",
                { location: registrationLocation(id) },
              );
            }
            if (mesh.getScene() !== input.scene) {
              throw failure(
                "WORLDKIT_NATIVE_SCENE_COLLIDER_SCENE_MISMATCH",
                `Collider '${id}' belongs to another Scene.`,
                "Create every registered proxy in context.scene.",
                { location: registrationLocation(id) },
              );
            }
            let binding: BabylonNativeTraversalBindingV1;
            try {
              binding = parseBabylonNativeTraversalBindingV1(
                record.traversalBinding,
              );
            } catch {
              throw failure(
                "WORLDKIT_NATIVE_SCENE_TRAVERSAL_BINDING_INVALID",
                `Collider '${id}' has an invalid traversal binding.`,
                "Use either not-traversable or the complete static-surface binding.",
                { location: registrationLocation(id) },
              );
            }
            const geometry = validatedColliderGeometry(mesh, id);
            const actualCount = retainedColliders.length + 1;
            if (actualCount > input.budget.maximumStaticColliderCount) {
              throw failure(
                "WORLDKIT_NATIVE_SCENE_COLLIDER_COUNT_EXCEEDED",
                "Static Collider count exceeds the authorized budget.",
                "Reduce the number of registered low-detail proxies.",
                {
                  location: registrationLocation(id),
                  measurement: Object.freeze({
                    kind: "count",
                    actualCount,
                    maximumCount: input.budget.maximumStaticColliderCount,
                  }),
                },
              );
            }
            if (
              totalVertexCount + geometry.vertexCount >
                input.budget.maximumStaticColliderVertexCount
            ) {
              throw failure(
                "WORLDKIT_NATIVE_SCENE_COLLIDER_VERTICES_EXCEEDED",
                "Static Collider vertices exceed the authorized budget.",
                "Simplify the collision proxy geometry.",
                {
                  location: registrationLocation(id),
                  measurement: Object.freeze({
                    kind: "count",
                    actualCount: totalVertexCount + geometry.vertexCount,
                    maximumCount: input.budget.maximumStaticColliderVertexCount,
                  }),
                },
              );
            }
            if (
              totalTriangleCount + geometry.triangleCount >
                input.budget.maximumStaticColliderTriangleCount
            ) {
              throw failure(
                "WORLDKIT_NATIVE_SCENE_COLLIDER_TRIANGLES_EXCEEDED",
                "Static Collider triangles exceed the authorized budget.",
                "Simplify the collision proxy geometry.",
                {
                  location: registrationLocation(id),
                  measurement: Object.freeze({
                    kind: "count",
                    actualCount: totalTriangleCount + geometry.triangleCount,
                    maximumCount: input.budget.maximumStaticColliderTriangleCount,
                  }),
                },
              );
            }
            const frozen = createBabylonNativeStaticColliderContributionV1({
              id,
              worldPositionsMetersXYZ: geometry.worldPositionsMetersXYZ,
              triangleIndices: geometry.triangleIndices,
              frictionRatio: boundedRatio(record.frictionRatio, 0.75, id, "frictionRatio"),
              restitutionRatio: boundedRatio(record.restitutionRatio, 0, id, "restitutionRatio"),
              traversalBinding: binding,
            });
            registrationIds.add(id);
            totalVertexCount += geometry.vertexCount;
            totalTriangleCount += geometry.triangleCount;
            retainedColliders.push(Object.freeze({
              mesh,
              bindingSource: record.traversalBinding,
              frozen,
            }));
          } catch (error) {
            return retainFailure(
              error instanceof NativeSceneAdmissionFailure
                ? error
                : failure(
                    "WORLDKIT_NATIVE_SCENE_COLLIDER_REGISTRATION_INVALID",
                    "Static Collider registration is invalid.",
                    "Use the closed Collider registration contract.",
                  ),
            );
          }
        },
      });

    const context: BabylonNativeSceneBuildContextV1 = Object.freeze({
      scene: input.scene,
      bootstrap,
      random: input.random,
      assets: input.assets,
      registration,
    });
    try {
      await module.build(context);
    } catch (error) {
      moduleFailure = error;
    } finally {
      acceptingRegistrations = false;
    }
    if (firstRegistrationFailure !== undefined) throw firstRegistrationFailure;
    if (moduleFailure !== undefined) {
      throw failure(
        "WORLDKIT_NATIVE_SCENE_MODULE_BUILD_FAILED",
        "Native Scene Module build() failed.",
        "Repair the Module exception; raw provider errors are not public diagnostics.",
        { stage: "build" },
      );
    }
    if (spawnMarker === undefined) {
      throw failure(
        "WORLDKIT_NATIVE_SCENE_SPAWN_REQUIRED",
        "Native Scene Module must register exactly one Spawn Marker.",
        "Register the Bootstrap-bound Spawn Marker during build().",
      );
    }
    if (spawnMarker.id !== bootstrap.spawnMarkerId) {
      throw failure(
        "WORLDKIT_NATIVE_SCENE_SPAWN_MARKER_MISMATCH",
        "Registered Spawn Marker does not match bootstrap.spawnMarkerId.",
        "Use the exact Spawn Marker ID frozen in the Bootstrap.",
        { location: registrationLocation(spawnMarker.id) },
      );
    }

    for (const retained of retainedColliders) {
      if (retained.mesh.isDisposed()) {
        throw failure(
          "WORLDKIT_NATIVE_SCENE_COLLIDER_DISPOSED",
          `Collider '${retained.frozen.id}' was disposed before build() settled.`,
          "Keep registered proxies alive through Contribution admission.",
          { location: registrationLocation(retained.frozen.id) },
        );
      }
      if (retained.mesh.getScene() !== input.scene) {
        throw failure(
          "WORLDKIT_NATIVE_SCENE_COLLIDER_SCENE_MISMATCH",
          `Collider '${retained.frozen.id}' no longer belongs to the Candidate Scene.`,
          "Do not move registered proxies between Scenes.",
          { location: registrationLocation(retained.frozen.id) },
        );
      }
      let finalBinding: BabylonNativeTraversalBindingV1;
      try {
        finalBinding = parseBabylonNativeTraversalBindingV1(retained.bindingSource);
      } catch {
        throw failure(
          "WORLDKIT_NATIVE_SCENE_COLLIDER_DRIFT",
          `Collider '${retained.frozen.id}' traversal binding changed during build().`,
          "Do not mutate a Collider or its binding after registration.",
          { location: registrationLocation(retained.frozen.id) },
        );
      }
      const finalGeometry = validatedColliderGeometry(
        retained.mesh,
        retained.frozen.id,
      );
      const finalContribution = createBabylonNativeStaticColliderContributionV1({
        id: retained.frozen.id,
        worldPositionsMetersXYZ: finalGeometry.worldPositionsMetersXYZ,
        triangleIndices: finalGeometry.triangleIndices,
        frictionRatio: retained.frozen.frictionRatio,
        restitutionRatio: retained.frozen.restitutionRatio,
        traversalBinding: finalBinding,
      });
      if (
        finalContribution.geometryHash !== retained.frozen.geometryHash ||
        finalContribution.colliderSubshapeId !== retained.frozen.colliderSubshapeId
      ) {
        throw failure(
          "WORLDKIT_NATIVE_SCENE_COLLIDER_DRIFT",
          `Collider '${retained.frozen.id}' geometry or traversal binding changed during build().`,
          "Complete transforms and binding setup before registration.",
          { location: registrationLocation(retained.frozen.id) },
        );
      }
    }

    const contribution = parseBabylonNativeSceneContributionV1({
      kind: "babylon-native-scene-contribution",
      schemaVersion: 1,
      sceneModuleRef: bootstrap.sceneModuleRef,
      sceneModuleId: module.id,
      spawnMarker,
      staticColliders: [...retainedColliders]
        .map(({ frozen }) => frozen)
        .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    });
    const contributionHash = hashBabylonNativeSceneContributionV1(contribution);
    const checkResult = parseNativeSceneCheckResultV1({
      kind: "native-scene-check-result",
      schemaVersion: 1,
      id: `${bootstrap.id}.native-scene-check`,
      checkedInput: {
        kind: "native-scene-module",
        sceneModuleRef: bootstrap.sceneModuleRef,
      },
      outcome: "passed",
      diagnostics: [],
    });
    return Object.freeze({
      outcome: "passed",
      checkResult,
      contribution,
      contributionHash,
    });
  } catch (error) {
    return rejectedResult(
      bootstrap,
      error instanceof NativeSceneAdmissionFailure
        ? error
        : failure(
            "WORLDKIT_NATIVE_SCENE_CONTRIBUTION_ADMISSION_FAILED",
            "Native Scene Contribution admission failed.",
            "Repair the registered Spawn and Collider intent.",
          ),
    );
  }
}
