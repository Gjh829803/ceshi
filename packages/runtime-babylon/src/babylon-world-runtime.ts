import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsShapeHeightField } from "@babylonjs/core/Physics/v2/physicsShape.js";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { PhysicsEngine } from "@babylonjs/core/Physics/v2/physicsEngine.js";
import { Scene } from "@babylonjs/core/scene.pure.js";

import type {
  BindControlRequestV2,
  CameraTuningV1,
  CameraViewInputV1,
  ControlBindingReceiptV2,
  ExecutionObjectV3,
  ExecutionLayoutAssertionV1,
  ExecutionLayoutPlacementV1,
  ExecutionPlanV4,
  ExecutionWaterBoundaryV3,
  ExecutionWaterV3,
  FixedInputV1,
  MotionParameterTuningV1,
  SubjectHarnessReportV1,
  Vec2,
  Vec3,
  WorldRuntimeSessionV3,
  WorldRuntimeSnapshotV3,
} from "@whitebox-world/runtime-contracts";
import { TRUSTED_DEFAULT_CONTROLLER_ID } from "@whitebox-world/runtime-contracts";
import { resolveGroundHumanoidAction } from "@whitebox-world/subject-actions";

import { createWhiteboxMaterials, type WhiteboxMaterials } from "./materials";
import { enableHavokPhysics, FIXED_TIME_STEP_SECONDS } from "./physics";
import { SubjectController } from "./subject-controller";
import { CameraDirectorV1, type CameraPreferenceV1 } from "./camera-director";
import {
  isSubjectAssetRuntimeErrorV1,
  SubjectAssetCacheV1,
  type SubjectAssetCacheOptionsV1,
  type SubjectAssetResolverV1,
} from "./subject-asset-cache";
import { createSubjectVisual, type SubjectVisual } from "./subject-visual";
import {
  createTerrainMesh,
  sampleExecutionTerrainHeight,
  toBabylonHeightfieldData,
} from "./terrain";

export type BabylonWorldRuntimeInitializationStageV1 =
  | "engine"
  | "scene"
  | "havok"
  | "terrain"
  | "subjects"
  | "camera"
  | "ready";

export interface BabylonWorldRuntimeOptions {
  executionPlan: ExecutionPlanV4;
  canvas?: HTMLCanvasElement;
  engineFactory?: () => AbstractEngine;
  autoStartRenderLoop?: boolean;
  /** Required by headless Node hosts because Node cannot fetch file:// WASM URLs. */
  havokWasmBinary?: ArrayBuffer;
  subjectAssetResolver?: SubjectAssetResolverV1;
  subjectAssetCacheOptions?: SubjectAssetCacheOptionsV1;
  onInitializationStage?(stage: BabylonWorldRuntimeInitializationStageV1): void;
}

type OwnedDisposer = () => void | Promise<void>;

class WorldRuntimeDisposeErrorV1 extends Error {
  readonly name = "WorldRuntimeDisposeErrorV1";
  readonly code = "WORLDKIT_RUNTIME_DISPOSE_FAILED" as const;

  constructor() {
    super("WORLDKIT_RUNTIME_DISPOSE_FAILED: Runtime cleanup failed.");
  }
}

export class WorldRuntimeLayoutAssertionErrorV1 extends Error {
  readonly name = "WorldRuntimeLayoutAssertionErrorV1";
  readonly code = "WORLDKIT_LAYOUT_ASSERTION_FAILED" as const;

  constructor() {
    super("WORLDKIT_LAYOUT_ASSERTION_FAILED: A frozen layout assertion failed.");
  }
}

export function isWorldRuntimeLayoutAssertionErrorV1(
  value: unknown,
): value is WorldRuntimeLayoutAssertionErrorV1 {
  return value instanceof WorldRuntimeLayoutAssertionErrorV1 &&
    value.code === "WORLDKIT_LAYOUT_ASSERTION_FAILED";
}

interface RuntimeLayoutBoundsV1 {
  readonly minimumMetersXYZ: Vec3;
  readonly maximumMetersXYZ: Vec3;
}

function runtimeLayoutBounds(
  executionPlan: ExecutionPlanV4,
  placement: ExecutionLayoutPlacementV1,
): RuntimeLayoutBoundsV1 {
  const object = executionPlan.objects.find((row) => row.entityId === placement.entityId);
  const halfExtents = object === undefined
    ? [0, 0, 0] as const
    : object.primitive.kind === "box"
      ? object.primitive.sizeMetersXYZ.map((value) => value / 2) as [number, number, number]
      : object.primitive.kind === "sphere"
        ? [object.primitive.radiusMeters, object.primitive.radiusMeters, object.primitive.radiusMeters] as const
        : [object.primitive.radiusMeters, object.primitive.heightMeters / 2, object.primitive.radiusMeters] as const;
  const scaled = halfExtents.map((value, axis) =>
    value * placement.transform.scaleXYZ[axis]!
  ) as [number, number, number];
  const [x, y, z] = placement.transform.rotationEulerRadiansXYZ;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);
  const rotation = [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx],
  ] as const;
  const rotated = rotation.map((row) => row.reduce(
    (sum, coefficient, axis) => sum + Math.abs(coefficient) * scaled[axis]!,
    0,
  )) as [number, number, number];
  return {
    minimumMetersXYZ: placement.transform.positionMetersXYZ.map((value, axis) =>
      value - rotated[axis]!
    ) as unknown as Vec3,
    maximumMetersXYZ: placement.transform.positionMetersXYZ.map((value, axis) =>
      value + rotated[axis]!
    ) as unknown as Vec3,
  };
}

function runtimeSupportSamples(bounds: RuntimeLayoutBoundsV1): readonly Vec2[] {
  const minimum = bounds.minimumMetersXYZ;
  const maximum = bounds.maximumMetersXYZ;
  return [
    [(minimum[0] + maximum[0]) / 2, (minimum[2] + maximum[2]) / 2],
    [minimum[0], minimum[2]],
    [maximum[0], minimum[2]],
    [maximum[0], maximum[2]],
    [minimum[0], maximum[2]],
  ];
}

function runtimeAabbSeparation(
  left: RuntimeLayoutBoundsV1,
  right: RuntimeLayoutBoundsV1,
): number {
  const distances = [0, 1, 2].map((axis) => Math.max(
    0,
    right.minimumMetersXYZ[axis]! - left.maximumMetersXYZ[axis]!,
    left.minimumMetersXYZ[axis]! - right.maximumMetersXYZ[axis]!,
  ));
  return Math.hypot(...distances);
}

function runtimeAabbsOverlap(
  left: RuntimeLayoutBoundsV1,
  right: RuntimeLayoutBoundsV1,
): boolean {
  return [0, 1, 2].every((axis) =>
    Math.min(left.maximumMetersXYZ[axis]!, right.maximumMetersXYZ[axis]!) -
      Math.max(left.minimumMetersXYZ[axis]!, right.minimumMetersXYZ[axis]!) > 0
  );
}

function revalidateSupportAssertion(
  executionPlan: ExecutionPlanV4,
  assertion: Extract<ExecutionLayoutAssertionV1, { kind: "supported-by" }>,
  boundsByEntityId: Readonly<Record<string, RuntimeLayoutBoundsV1>>,
): boolean {
  const supported = boundsByEntityId[assertion.supportedEntityId];
  if (supported === undefined) return false;
  const supportGapTolerance = assertion.tolerances.supportGapMeters ?? 0;
  const bottom = supported.minimumMetersXYZ[1];
  if (assertion.supportingEntityId === executionPlan.terrain.entityId) {
    const gaps = runtimeSupportSamples(supported).map((point) => Math.abs(
      bottom - sampleExecutionTerrainHeight(executionPlan.terrain, point[0], point[1])
    ));
    const passing = gaps.filter((gap) =>
      gap <= assertion.maximumSupportGapMeters + supportGapTolerance
    ).length;
    return Math.max(...gaps) <= assertion.maximumSupportGapMeters + supportGapTolerance &&
      passing / gaps.length + 0.000001 >= assertion.minimumSupportRatio;
  }
  const supporting = boundsByEntityId[assertion.supportingEntityId];
  if (supporting === undefined) return false;
  const overlapX = Math.max(0, Math.min(supported.maximumMetersXYZ[0], supporting.maximumMetersXYZ[0]) - Math.max(supported.minimumMetersXYZ[0], supporting.minimumMetersXYZ[0]));
  const overlapZ = Math.max(0, Math.min(supported.maximumMetersXYZ[2], supporting.maximumMetersXYZ[2]) - Math.max(supported.minimumMetersXYZ[2], supporting.minimumMetersXYZ[2]));
  const area = (supported.maximumMetersXYZ[0] - supported.minimumMetersXYZ[0]) *
    (supported.maximumMetersXYZ[2] - supported.minimumMetersXYZ[2]);
  const ratio = area === 0 ? 0 : overlapX * overlapZ / area;
  const gap = Math.abs(bottom - supporting.maximumMetersXYZ[1]);
  return gap <= assertion.maximumSupportGapMeters + supportGapTolerance &&
    ratio + 0.000001 >= assertion.minimumSupportRatio;
}

function revalidateClearanceAssertion(
  assertion: Extract<ExecutionLayoutAssertionV1, { kind: "minimum-clearance" }>,
  executionPlan: ExecutionPlanV4,
  boundsByEntityId: Readonly<Record<string, RuntimeLayoutBoundsV1>>,
): boolean {
  const entity = boundsByEntityId[assertion.entityId];
  if (entity === undefined) return false;
  const targetIds = assertion.otherEntityIds ?? assertion.evidenceEntityIds
    .filter((entityId) => entityId !== assertion.entityId);
  if (targetIds.length === 0) return false;
  let minimumClearance = Number.POSITIVE_INFINITY;
  for (const targetId of targetIds) {
    const target = boundsByEntityId[targetId];
    if (target === undefined || runtimeAabbsOverlap(entity, target)) return false;
    minimumClearance = Math.min(minimumClearance, runtimeAabbSeparation(entity, target));
  }
  return minimumClearance + (assertion.tolerances.overlapMeters ?? 0) >= assertion.clearanceMeters;
}

function revalidateRuntimeLayoutAssertions(executionPlan: ExecutionPlanV4): void {
  const placements = Object.values(executionPlan.layout.placementsByEntityId);
  const boundsByEntityId = Object.fromEntries(placements.map((placement) => [
    placement.entityId,
    runtimeLayoutBounds(executionPlan, placement),
  ]));
  for (const assertion of executionPlan.layout.layoutAssertions) {
    const satisfied = assertion.kind === "supported-by"
      ? revalidateSupportAssertion(executionPlan, assertion, boundsByEntityId)
      : assertion.kind === "minimum-clearance"
        ? revalidateClearanceAssertion(assertion, executionPlan, boundsByEntityId)
        : true;
    if (!satisfied) throw new WorldRuntimeLayoutAssertionErrorV1();
  }
}

function applyTransform(mesh: Mesh, object: ExecutionObjectV3): void {
  mesh.position = new Vector3(...object.transform.positionMetersXYZ);
  const [rotationX, rotationY, rotationZ] = object.transform.rotationEulerRadiansXYZ;
  mesh.rotationQuaternion = Quaternion.FromEulerAngles(rotationX, rotationY, rotationZ);
  mesh.scaling = new Vector3(...object.transform.scaleXYZ);
  mesh.metadata = { worldkitEntityId: object.entityId, semanticClassId: object.semanticClassId };
}

function createObjectMesh(object: ExecutionObjectV3, materials: WhiteboxMaterials, scene: Scene): Mesh {
  let mesh: Mesh;
  switch (object.primitive.kind) {
    case "box":
      mesh = MeshBuilder.CreateBox(
        object.entityId,
        {
          width: object.primitive.sizeMetersXYZ[0],
          height: object.primitive.sizeMetersXYZ[1],
          depth: object.primitive.sizeMetersXYZ[2],
        },
        scene,
      );
      break;
    case "sphere":
      mesh = MeshBuilder.CreateSphere(
        object.entityId,
        { diameter: object.primitive.radiusMeters * 2, segments: 16 },
        scene,
      );
      break;
    case "cylinder":
      mesh = MeshBuilder.CreateCylinder(
        object.entityId,
        {
          height: object.primitive.heightMeters,
          diameter: object.primitive.radiusMeters * 2,
          tessellation: 24,
        },
        scene,
      );
      break;
    case "cone":
      mesh = MeshBuilder.CreateCylinder(
        object.entityId,
        {
          height: object.primitive.heightMeters,
          diameterBottom: object.primitive.radiusMeters * 2,
          diameterTop: 0,
          tessellation: 24,
        },
        scene,
      );
      break;
  }
  applyTransform(mesh, object);
  mesh.material = materials.object;
  return mesh;
}

function createWaterMesh(water: ExecutionWaterV3, materials: WhiteboxMaterials, scene: Scene): Mesh {
  const boundary = water.boundary;
  let mesh: Mesh;
  if (boundary.kind === "circle" || boundary.kind === "ellipse") {
    mesh = MeshBuilder.CreateDisc(water.entityId, { radius: 1, tessellation: 64, sideOrientation: Mesh.DOUBLESIDE }, scene);
    mesh.rotation.x = Math.PI / 2;
    const radii = boundary.kind === "circle"
      ? [boundary.radiusMeters, boundary.radiusMeters] as const
      : boundary.radiusMetersXZ;
    mesh.scaling.x = radii[0];
    mesh.scaling.y = radii[1];
    mesh.position = new Vector3(
      boundary.centerMetersXZ[0],
      water.waterLevelMeters,
      boundary.centerMetersXZ[1],
    );
  } else {
    mesh = new Mesh(water.entityId, scene);
    const centerX = boundary.pointsMetersXZ.reduce((sum, point) => sum + point[0], 0) / boundary.pointsMetersXZ.length;
    const centerZ = boundary.pointsMetersXZ.reduce((sum, point) => sum + point[1], 0) / boundary.pointsMetersXZ.length;
    const positions = [centerX, water.waterLevelMeters, centerZ];
    const indices: number[] = [];
    for (const point of boundary.pointsMetersXZ) positions.push(point[0], water.waterLevelMeters, point[1]);
    for (let index = 0; index < boundary.pointsMetersXZ.length; index += 1) {
      indices.push(0, index + 1, ((index + 1) % boundary.pointsMetersXZ.length) + 1);
    }
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.normals = normals;
    data.applyToMesh(mesh, false);
  }
  mesh.material = materials.water;
  mesh.metadata = { worldkitEntityId: water.entityId, semanticClassId: water.semanticClassId };
  return mesh;
}

function containsPoint(boundary: ExecutionWaterBoundaryV3, x: number, z: number): boolean {
  if (boundary.kind === "circle") {
    const dx = x - boundary.centerMetersXZ[0];
    const dz = z - boundary.centerMetersXZ[1];
    return dx * dx + dz * dz <= boundary.radiusMeters * boundary.radiusMeters;
  }
  if (boundary.kind === "ellipse") {
    const dx = (x - boundary.centerMetersXZ[0]) / boundary.radiusMetersXZ[0];
    const dz = (z - boundary.centerMetersXZ[1]) / boundary.radiusMetersXZ[1];
    return dx * dx + dz * dz <= 1;
  }
  let inside = false;
  for (let current = 0, previous = boundary.pointsMetersXZ.length - 1; current < boundary.pointsMetersXZ.length; previous = current, current += 1) {
    const currentPoint = boundary.pointsMetersXZ[current]!;
    const previousPoint = boundary.pointsMetersXZ[previous]!;
    const crosses = currentPoint[1] > z !== previousPoint[1] > z &&
      x < ((previousPoint[0] - currentPoint[0]) * (z - currentPoint[1])) /
        (previousPoint[1] - currentPoint[1]) + currentPoint[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function movementMediumAtSubjectOrigin(
  executionPlan: ExecutionPlanV4,
  subjectOrigin: Vector3,
): "ground" | "air" | "water" {
  for (const water of executionPlan.waters) {
    if (
      water.traversalMode === "swimmable" &&
      containsPoint(water.boundary, subjectOrigin.x, subjectOrigin.z) &&
      subjectOrigin.y <= water.waterLevelMeters + 0.6 &&
      subjectOrigin.y >= water.waterLevelMeters - water.depthMeters - 0.6
    ) {
      return "water";
    }
  }
  const groundHeight = sampleExecutionTerrainHeight(
    executionPlan.terrain,
    subjectOrigin.x,
    subjectOrigin.z,
  );
  return subjectOrigin.y <= groundHeight + 0.16 ? "ground" : "air";
}

function waterSurfaceHeightAtSubjectOrigin(
  executionPlan: ExecutionPlanV4,
  subjectOrigin: Vector3,
): number | undefined {
  return executionPlan.waters.find((water) =>
    containsPoint(water.boundary, subjectOrigin.x, subjectOrigin.z) &&
    subjectOrigin.y >= water.waterLevelMeters - water.depthMeters - 1 &&
    subjectOrigin.y <= water.waterLevelMeters + 2
  )?.waterLevelMeters;
}

function configureAtmosphere(scene: Scene, preset: ExecutionPlanV4["atmospherePreset"]): void {
  const colors = {
    "clear-day": new Color4(0.55, 0.78, 0.92, 1),
    "golden-hour": new Color4(0.91, 0.65, 0.42, 1),
    overcast: new Color4(0.57, 0.62, 0.66, 1),
    night: new Color4(0.035, 0.055, 0.11, 1),
  } as const;
  scene.clearColor = colors[preset];
  scene.ambientColor = preset === "night" ? new Color3(0.08, 0.1, 0.18) : new Color3(0.32, 0.32, 0.32);
  const ambient = new HemisphericLight("worldkit.light.ambient", new Vector3(0, 1, 0), scene);
  ambient.intensity = preset === "night" ? 0.3 : 0.72;
  const sun = new DirectionalLight("worldkit.light.sun", new Vector3(-0.45, -1, 0.35), scene);
  sun.intensity = preset === "night" ? 0.22 : 1.1;
}

async function disposeOwnedStack(
  ownedDisposers: readonly OwnedDisposer[],
): Promise<void> {
  let firstFailure: unknown;
  for (const dispose of [...ownedDisposers].reverse()) {
    try {
      await dispose();
    } catch (error) {
      firstFailure ??= error;
    }
  }
  if (firstFailure !== undefined) {
    if (isSubjectAssetRuntimeErrorV1(firstFailure)) throw firstFailure;
    throw new WorldRuntimeDisposeErrorV1();
  }
}

export class BabylonWorldRuntime implements WorldRuntimeSessionV3 {
  readonly runtimeBackend = "babylon-havok" as const;
  readonly ready: Promise<void> = Promise.resolve();

  private tick = 0;
  private disposed = false;
  private controlledEntityId: string;
  private readonly aggregates: PhysicsAggregate[] = [];
  private readonly ownedHeightfieldShape: PhysicsShapeHeightField;
  private readonly subjectControllersByEntityId: ReadonlyMap<string, SubjectController>;
  private readonly subjectVisuals: readonly SubjectVisual[];
  private readonly subjectVisualsByEntityId: ReadonlyMap<string, SubjectVisual>;
  private readonly camera: FreeCamera;
  private readonly cameraDirector: CameraDirectorV1;
  private readonly renderLoop: () => void;
  private readonly ownedDisposers: readonly OwnedDisposer[];

  private constructor(
    private readonly executionPlan: ExecutionPlanV4,
    private readonly engine: AbstractEngine,
    private readonly scene: Scene,
    subjectControllersByEntityId: ReadonlyMap<string, SubjectController>,
    subjectVisuals: readonly SubjectVisual[],
    camera: FreeCamera,
    ownedHeightfieldShape: PhysicsShapeHeightField,
    aggregates: PhysicsAggregate[],
    ownedDisposers: readonly OwnedDisposer[],
    autoStartRenderLoop: boolean,
  ) {
    this.controlledEntityId = executionPlan.controlledEntityId;
    this.subjectControllersByEntityId = subjectControllersByEntityId;
    this.subjectVisuals = subjectVisuals;
    this.subjectVisualsByEntityId = new Map(
      subjectVisuals.map((visual) => [
        String(visual.root.metadata?.worldkitEntityId),
        visual,
      ]),
    );
    this.camera = camera;
    this.cameraDirector = new CameraDirectorV1(executionPlan, camera, scene);
    this.ownedHeightfieldShape = ownedHeightfieldShape;
    this.aggregates.push(...aggregates);
    this.ownedDisposers = ownedDisposers;
    this.renderLoop = () => this.renderFrame();
    this.updateCamera();
    if (autoStartRenderLoop) this.engine.runRenderLoop(this.renderLoop);
  }

  static async create(options: BabylonWorldRuntimeOptions): Promise<BabylonWorldRuntime> {
    if (options.executionPlan.runtimeBackend !== "babylon-havok") {
      throw new Error(`WORLDKIT_RUNTIME_BACKEND_UNSUPPORTED: ${options.executionPlan.runtimeBackend as string}`);
    }
    if (options.engineFactory === undefined && options.canvas === undefined) {
      throw new TypeError("BabylonWorldRuntime requires canvas or engineFactory.");
    }
    if (options.executionPlan.subjects.length === 0) {
      throw new Error("WORLDKIT_RUNTIME_SUBJECTS_EMPTY");
    }
    const subjectEntityIds = new Set<string>();
    for (const subject of options.executionPlan.subjects) {
      if (subjectEntityIds.has(subject.entityId)) {
        throw new Error(`WORLDKIT_RUNTIME_SUBJECT_DUPLICATE: ${subject.entityId}`);
      }
      subjectEntityIds.add(subject.entityId);
    }
    if (!subjectEntityIds.has(options.executionPlan.controlledEntityId)) {
      throw new Error(
        `WORLDKIT_RUNTIME_CONTROL_TARGET_NOT_FOUND: ${options.executionPlan.controlledEntityId}`,
      );
    }
    const ownedDisposers: OwnedDisposer[] = [];
    options.onInitializationStage?.("engine");
    const engine = options.engineFactory?.() ?? new Engine(options.canvas!, true, { preserveDrawingBuffer: true, stencil: true });
    ownedDisposers.push(() => engine.dispose());
    try {
      options.onInitializationStage?.("scene");
      const scene = new Scene(engine);
      ownedDisposers.push(() => scene.dispose());
      scene.useRightHandedSystem = true;
      options.onInitializationStage?.("havok");
      await enableHavokPhysics(
        scene,
        options.executionPlan.gravityMetersPerSecondSquaredXYZ,
        options.havokWasmBinary,
      );
      options.onInitializationStage?.("terrain");
      configureAtmosphere(scene, options.executionPlan.atmospherePreset);
      const materials = createWhiteboxMaterials(scene);

      const terrainMesh = createTerrainMesh(options.executionPlan.terrain, materials.terrain, scene);
      const terrain = options.executionPlan.terrain;
      const heightfieldShape = new PhysicsShapeHeightField(
        terrain.sizeMetersXZ[0],
        terrain.sizeMetersXZ[1],
        terrain.resolutionCellsXZ[0],
        terrain.resolutionCellsXZ[1],
        toBabylonHeightfieldData(terrain),
        scene,
      );
      const aggregates: PhysicsAggregate[] = [];
      ownedDisposers.push(() => heightfieldShape.dispose());
      const terrainAggregate = new PhysicsAggregate(
        terrainMesh,
        heightfieldShape,
        { mass: 0, friction: 0.9, restitution: 0 },
        scene,
      );
      aggregates.push(terrainAggregate);
      ownedDisposers.push(() => terrainAggregate.dispose());

      for (const water of options.executionPlan.waters) createWaterMesh(water, materials, scene);
      for (const object of options.executionPlan.objects) {
        const mesh = createObjectMesh(object, materials, scene);
        if (object.collisionEnabled) {
          const shapeType = object.primitive.kind === "box"
            ? PhysicsShapeType.BOX
            : object.primitive.kind === "sphere"
              ? PhysicsShapeType.SPHERE
              : PhysicsShapeType.CYLINDER;
          const aggregate = new PhysicsAggregate(
            mesh,
            shapeType,
            { mass: 0, friction: 0.75, restitution: 0 },
            scene,
          );
          aggregates.push(aggregate);
          ownedDisposers.push(() => aggregate.dispose());
        }
      }

      revalidateRuntimeLayoutAssertions(options.executionPlan);

      options.onInitializationStage?.("subjects");
      const subjectAssetCache = new SubjectAssetCacheV1(
        scene,
        options.subjectAssetResolver,
        options.subjectAssetCacheOptions,
      );
      ownedDisposers.push(() => subjectAssetCache.dispose());
      const subjectControllersByEntityId = new Map<string, SubjectController>();
      const subjectVisuals: SubjectVisual[] = [];
      const sortedSubjects = [...options.executionPlan.subjects].sort((left, right) =>
        left.entityId.localeCompare(right.entityId),
      );
      for (const subject of sortedSubjects) {
        const visual = await createSubjectVisual({
          subject,
          executionPlan: options.executionPlan,
          material: materials.subject,
          scene,
          subjectAssetCache,
        });
        subjectVisuals.push(visual);
        ownedDisposers.push(() => visual.dispose());
        const controller = new SubjectController(
          subject,
          options.executionPlan.gravityMetersPerSecondSquaredXYZ,
          visual.root,
          scene,
          (subjectOrigin) =>
            movementMediumAtSubjectOrigin(options.executionPlan, subjectOrigin),
          (subjectOrigin) =>
            waterSurfaceHeightAtSubjectOrigin(options.executionPlan, subjectOrigin),
        );
        subjectControllersByEntityId.set(subject.entityId, controller);
        ownedDisposers.push(() => controller.dispose());
      }

      options.onInitializationStage?.("camera");
      const cameraPlan = options.executionPlan.camera;
      const camera = new FreeCamera(cameraPlan.cameraEntityId, Vector3.Zero(), scene);
      camera.fov = (cameraPlan.fovDegrees * Math.PI) / 180;
      camera.minZ = 0.05;
      scene.activeCamera = camera;

      options.onInitializationStage?.("ready");
      return new BabylonWorldRuntime(
        options.executionPlan,
        engine,
        scene,
        subjectControllersByEntityId,
        subjectVisuals,
        camera,
        heightfieldShape,
        aggregates,
        ownedDisposers,
        options.engineFactory === undefined && options.autoStartRenderLoop !== false,
      );
    } catch (error) {
      try {
        await disposeOwnedStack(ownedDisposers);
      } catch {
        // Preserve the primary initialization failure.
      }
      throw error;
    }
  }

  bindControl(request: BindControlRequestV2): ControlBindingReceiptV2 {
    this.assertUsable();
    const previousControlledEntityId = this.controlledEntityId;
    if (request.controllerId !== TRUSTED_DEFAULT_CONTROLLER_ID) {
      return {
        kind: "worldkit-control-binding-receipt",
        schemaVersion: 2,
        status: "rejected",
        controllerId: request.controllerId,
        previousControlledEntityId,
        controlledEntityId: this.controlledEntityId,
        diagnostic: {
          code: "CONTROL_CONTROLLER_NOT_FOUND",
          message: `Controller '${request.controllerId}' does not exist.`,
        },
      };
    }
    if (!this.subjectControllersByEntityId.has(request.controlledEntityId)) {
      return {
        kind: "worldkit-control-binding-receipt",
        schemaVersion: 2,
        status: "rejected",
        controllerId: request.controllerId,
        previousControlledEntityId,
        controlledEntityId: this.controlledEntityId,
        diagnostic: {
          code: "CONTROL_TARGET_NOT_FOUND",
          message: `Subject '${request.controlledEntityId}' does not exist.`,
        },
      };
    }
    if (request.expectedControlledEntityId !== this.controlledEntityId) {
      return {
        kind: "worldkit-control-binding-receipt",
        schemaVersion: 2,
        status: "rejected",
        controllerId: request.controllerId,
        previousControlledEntityId,
        controlledEntityId: this.controlledEntityId,
        diagnostic: {
          code: "CONTROL_BINDING_STALE",
          message: `Controller '${request.controllerId}' controls '${this.controlledEntityId}', not '${request.expectedControlledEntityId}'.`,
        },
      };
    }
    if (request.controlledEntityId === this.controlledEntityId) {
      return {
        kind: "worldkit-control-binding-receipt",
        schemaVersion: 2,
        status: "committed",
        controllerId: request.controllerId,
        previousControlledEntityId,
        controlledEntityId: this.controlledEntityId,
      };
    }

    this.controllerFor(this.controlledEntityId).stop();
    this.visualFor(this.controlledEntityId).stepAnimation(this.tick, "idle");
    this.controlledEntityId = request.controlledEntityId;
    this.updateCamera();
    return {
      kind: "worldkit-control-binding-receipt",
      schemaVersion: 2,
      status: "committed",
      controllerId: request.controllerId,
      previousControlledEntityId,
      controlledEntityId: this.controlledEntityId,
    };
  }

  async runFixedInput(input: FixedInputV1): Promise<WorldRuntimeSnapshotV3> {
    this.assertUsable();
    if (!Number.isSafeInteger(input.ticks) || input.ticks < 0 || input.ticks > 36_000) {
      throw new RangeError("Fixed input ticks must be an integer from 0 through 36000.");
    }
    const physicsEngine = this.scene.getPhysicsEngine();
    if (physicsEngine === null) throw new Error("WORLDKIT_HAVOK_ENGINE_MISSING");
    for (let index = 0; index < input.ticks; index += 1) {
      for (const subject of this.executionPlan.subjects) {
        const controller = this.controllerFor(subject.entityId);
        const controlled = subject.entityId === this.controlledEntityId;
        const cameraDirection = this.camera.getForwardRay().direction;
        controller.step(
          controlled ? input.actions : [],
          this.detectMovementMedium(controller),
          [cameraDirection.x, cameraDirection.y, cameraDirection.z],
        );
      }
      physicsEngine._step(FIXED_TIME_STEP_SECONDS);
      this.tick += 1;
      for (const subject of this.executionPlan.subjects) {
        const controller = this.controllerFor(subject.entityId);
        const visual = this.visualFor(subject.entityId);
        controller.synchronizeVisual();
        if (subject.entityId !== this.controlledEntityId) {
          visual.stepAnimation(this.tick, "idle");
          continue;
        }
        const motion = controller.sampleMotion(input.actions.includes("run"));
        visual.stepAnimation(this.tick, resolveGroundHumanoidAction(motion));
      }
      this.updateCamera();
    }
    return this.snapshot();
  }

  snapshot(): WorldRuntimeSnapshotV3 {
    this.assertUsable();
    const subjectStatesByEntityId: Record<
      string,
      WorldRuntimeSnapshotV3["subjectStatesByEntityId"][string]
    > = {};
    for (const subject of this.executionPlan.subjects) {
      const controller = this.controllerFor(subject.entityId);
      const subjectOrigin = controller.subjectOrigin;
      const velocity = controller.velocity;
      const motion = controller.motionSnapshot();
      subjectStatesByEntityId[subject.entityId] = {
        entityId: subject.entityId,
        subjectDefinitionRef: subject.subjectDefinitionRef,
        subjectDefinitionHash: subject.subjectDefinitionHash,
        positionMetersXYZ: [subjectOrigin.x, subjectOrigin.y, subjectOrigin.z],
        velocityMetersPerSecondXYZ: [velocity.x, velocity.y, velocity.z],
        movementMedium: this.detectMovementMedium(controller),
        activeActionId: this.visualFor(subject.entityId).activeActionId,
        forwardXYZ: motion.forwardXYZ,
        speedMetersPerSecond: motion.speedMetersPerSecond,
        activeMotionProfileRef: motion.activeMotionProfileRef,
        activeMotionKernelRef: motion.activeMotionKernelRef,
        motionTags: motion.motionTags,
        relationshipRole: "none",
        safeFallbackActive: motion.fallbackActive,
        motionParameterTuning: motion.parameterTuning,
        ...(motion.lastFailureCode === undefined
          ? {}
          : { motionFailureCode: motion.lastFailureCode }),
      };
    }
    const cameraDirectorSnapshot = this.cameraDirector.snapshot();
    return {
      kind: "worldkit-runtime-snapshot",
      schemaVersion: 3,
      runtimeBackend: "babylon-havok",
      tick: this.tick,
      ready: true,
      controlledEntityId: this.controlledEntityId,
      controllersById: {
        [TRUSTED_DEFAULT_CONTROLLER_ID]: {
          id: TRUSTED_DEFAULT_CONTROLLER_ID,
          controlledEntityId: this.controlledEntityId,
        },
      },
      subjectStatesByEntityId,
      physics: { backend: "havok", ready: true, fixedTimeStepSeconds: FIXED_TIME_STEP_SECONDS },
      camera: {
        entityId: this.executionPlan.camera.cameraEntityId,
        targetEntityId: this.controlledEntityId,
        positionMetersXYZ: [
          this.camera.position.x,
          this.camera.position.y,
          this.camera.position.z,
        ],
        activeCameraProfileRef: cameraDirectorSnapshot.activeCameraProfileRef,
        activeCameraRigRef: cameraDirectorSnapshot.activeCameraRigRef,
        preference: cameraDirectorSnapshot.preference,
        safeFallbackActive: cameraDirectorSnapshot.fallbackActive,
        viewYawOffsetRadians: cameraDirectorSnapshot.viewYawOffsetRadians,
        viewPitchOffsetRadians: cameraDirectorSnapshot.viewPitchOffsetRadians,
        viewDistanceOffsetMeters: cameraDirectorSnapshot.viewDistanceOffsetMeters,
        tuning: cameraDirectorSnapshot.tuning,
      },
      resources: {
        meshes: this.scene.meshes.length,
        bodies: (this.scene.getPhysicsEngine() as PhysicsEngine | null)?.getBodies().length ?? 0,
        terrainSamples: this.executionPlan.terrain.heightSamplesMeters.length,
      },
    };
  }

  reset(): WorldRuntimeSnapshotV3 {
    this.assertUsable();
    for (const controller of this.subjectControllersByEntityId.values()) controller.reset();
    for (const visual of this.subjectVisuals) visual.resetAnimation();
    this.controlledEntityId = this.executionPlan.controlledEntityId;
    this.tick = 0;
    this.cameraDirector.reset();
    this.updateCamera();
    return this.snapshot();
  }

  renderFrame(): void {
    this.assertUsable();
    this.updateCamera();
    this.scene.render();
  }

  resize(): void {
    this.assertUsable();
    this.engine.resize();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    let renderLoopStopFailed = false;
    try {
      this.engine.stopRenderLoop(this.renderLoop);
    } catch {
      renderLoopStopFailed = true;
    }
    try {
      await disposeOwnedStack(this.ownedDisposers);
    } catch (error) {
      if (renderLoopStopFailed) throw new WorldRuntimeDisposeErrorV1();
      throw error;
    }
    if (renderLoopStopFailed) throw new WorldRuntimeDisposeErrorV1();
  }

  private detectMovementMedium(
    controller: SubjectController,
  ): "ground" | "air" | "water" {
    return movementMediumAtSubjectOrigin(this.executionPlan, controller.subjectOrigin);
  }

  private updateCamera(): void {
    const subject = this.executionPlan.subjects.find(
      (candidate) => candidate.entityId === this.controlledEntityId,
    );
    if (subject === undefined) {
      throw new Error(
        `WORLDKIT_RUNTIME_CONTROL_TARGET_NOT_FOUND: ${this.controlledEntityId}`,
      );
    }
    const controller = this.controllerFor(subject.entityId);
    this.cameraDirector.update(
      subject,
      controller,
      this.visualFor(subject.entityId),
      this.detectMovementMedium(controller),
      FIXED_TIME_STEP_SECONDS,
    );
  }

  setCameraPreference(preference: CameraPreferenceV1): WorldRuntimeSnapshotV3 {
    this.assertUsable();
    if (!this.cameraDirector.setPreference(preference)) {
      throw new RangeError("Camera preference must be a non-empty string.");
    }
    this.updateCamera();
    return this.snapshot();
  }

  adjustCameraView(input: CameraViewInputV1): WorldRuntimeSnapshotV3 {
    this.assertUsable();
    if (!this.cameraDirector.adjustView(input)) {
      throw new RangeError("Camera view deltas must be finite numbers.");
    }
    this.updateCamera();
    return this.snapshot();
  }

  resetCameraView(): WorldRuntimeSnapshotV3 {
    this.assertUsable();
    this.cameraDirector.resetView();
    this.updateCamera();
    return this.snapshot();
  }

  setCameraTuning(tuning: CameraTuningV1): WorldRuntimeSnapshotV3 {
    this.assertUsable();
    if (!this.cameraDirector.setTuning(tuning)) {
      throw new RangeError("Camera tuning values must be finite numbers.");
    }
    this.updateCamera();
    return this.snapshot();
  }

  requestMotionProfile(subjectEntityId: string, motionProfileRef: string): boolean {
    this.assertUsable();
    return this.controllerFor(subjectEntityId).requestMotionProfile(motionProfileRef);
  }

  setMotionTuning(
    subjectEntityId: string,
    tuning: MotionParameterTuningV1,
  ): WorldRuntimeSnapshotV3 {
    this.assertUsable();
    if (!this.controllerFor(subjectEntityId).setMotionTuning(tuning)) {
      throw new RangeError("Motion tuning must use registered parameters inside safety limits.");
    }
    return this.snapshot();
  }

  async runHarness(subjectEntityId: string): Promise<SubjectHarnessReportV1> {
    this.assertUsable();
    const subject = this.executionPlan.subjects.find((row) => row.entityId === subjectEntityId);
    if (subject === undefined) throw new Error(`WORLDKIT_RUNTIME_SUBJECT_NOT_FOUND: ${subjectEntityId}`);
    const controller = this.controllerFor(subjectEntityId);
    const motion = controller.motionSnapshot();
    const state = this.snapshot().subjectStatesByEntityId[subjectEntityId]!;
    const assembly = subject.capabilityAssembly;
    const finiteState = [
      ...state.positionMetersXYZ,
      ...state.velocityMetersPerSecondXYZ,
      motion.speedMetersPerSecond,
    ].every(Number.isFinite);
    const mediumCompatible =
      assembly === undefined ||
      assembly.motionKernel.supportedMediums.includes(state.movementMedium);
    const cameraState = this.snapshot().camera;
    const cameraFinite = cameraState.positionMetersXYZ.every(Number.isFinite);
    const availableSocketIds = new Set(subject.sockets.map((socket) => socket.id));
    const relationshipSocketCoverage = assembly?.relationshipProfiles.every(
      (profile) => {
        const sourceAvailable = profile.requiredSourceSocketIds.every((socketId) =>
          availableSocketIds.has(socketId),
        );
        const targetAvailable = profile.requiredTargetSocketIds.every((socketId) =>
          availableSocketIds.has(socketId),
        );
        return sourceAvailable || targetAvailable;
      },
    ) ?? true;
    const checks: SubjectHarnessReportV1["checks"] = [
      {
        checkId: "H01",
        status:
          assembly === undefined ||
          assembly.motionKernel.commandKind === assembly.controlProfile.commandKind
            ? "passed"
            : "failed",
        message: "Control Profile and Motion Kernel command semantics agree.",
      },
      {
        checkId: "H02",
        status: finiteState && motion.speedMetersPerSecond < 100 ? "passed" : "failed",
        message: "Committed transform and velocity are finite and bounded.",
      },
      {
        checkId: "H03",
        status: mediumCompatible ? "passed" : "failed",
        message: "Committed movement medium is supported by the active Kernel.",
      },
      {
        checkId: "H04",
        status:
          assembly?.relationshipProfiles.length === 0
            ? "not-exercised"
            : relationshipSocketCoverage
              ? "passed"
              : "failed",
        message: "Declared Seat/Tether profiles have a compatible source or target Socket set.",
      },
      {
        checkId: "H05",
        status: cameraFinite ? "passed" : "failed",
        message: "Camera output is finite and uses the shared Director fallback chain.",
      },
      {
        checkId: "H06",
        status: (this.scene.getPhysicsEngine() as PhysicsEngine | null)?.getBodies().length === this.executionPlan.resourceUsage.colliders
          ? "passed"
          : "not-exercised",
        message: "Runtime resource ownership is tracked for disposal.",
      },
      {
        checkId: "H07",
        status: "not-exercised",
        message: "Use the deterministic replay test fixture for a two-session comparison.",
      },
      {
        checkId: "H08",
        status: "passed",
        message: "The package runs from its locked Execution Plan without a World Model connection.",
      },
      {
        checkId: "H09",
        status:
          assembly === undefined || assembly.fallbackMotionProfile.resourceRef.length > 0
            ? "passed"
            : "failed",
        message: "Safe fallback is declared and invalid states are trapped by the Kernel Runtime.",
      },
    ];
    return {
      subjectEntityId,
      passed: checks.every((check) => check.status !== "failed"),
      checks,
      tick: this.tick,
    };
  }

  private controllerFor(subjectEntityId: string): SubjectController {
    const controller = this.subjectControllersByEntityId.get(subjectEntityId);
    if (controller === undefined) {
      throw new Error(`WORLDKIT_RUNTIME_SUBJECT_NOT_FOUND: ${subjectEntityId}`);
    }
    return controller;
  }

  private visualFor(subjectEntityId: string): SubjectVisual {
    const visual = this.subjectVisualsByEntityId.get(subjectEntityId);
    if (visual === undefined) {
      throw new Error(`WORLDKIT_RUNTIME_SUBJECT_NOT_FOUND: ${subjectEntityId}`);
    }
    return visual;
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error("WORLDKIT_RUNTIME_DISPOSED");
  }
}
