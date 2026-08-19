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
  ControlBindingReceiptV2,
  ExecutionObjectV3,
  ExecutionPlanV3,
  ExecutionWaterBoundaryV3,
  ExecutionWaterV3,
  FixedInputV1,
  WorldRuntimeSessionV3,
  WorldRuntimeSnapshotV3,
} from "@whitebox-world/runtime-contracts";
import { TRUSTED_DEFAULT_CONTROLLER_ID } from "@whitebox-world/runtime-contracts";

import { createWhiteboxMaterials, type WhiteboxMaterials } from "./materials";
import { enableHavokPhysics, FIXED_TIME_STEP_SECONDS } from "./physics";
import { SubjectController } from "./subject-controller";
import { createSubjectVisual, type SubjectVisual } from "./subject-visual";
import {
  createTerrainMesh,
  sampleExecutionTerrainHeight,
  toBabylonHeightfieldData,
} from "./terrain";

export interface BabylonWorldRuntimeOptions {
  executionPlan: ExecutionPlanV3;
  canvas?: HTMLCanvasElement;
  engineFactory?: () => AbstractEngine;
  autoStartRenderLoop?: boolean;
  /** Required by headless Node hosts because Node cannot fetch file:// WASM URLs. */
  havokWasmBinary?: ArrayBuffer;
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

function configureAtmosphere(scene: Scene, preset: ExecutionPlanV3["atmospherePreset"]): void {
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
  private readonly camera: FreeCamera;
  private readonly renderLoop: () => void;

  private constructor(
    private readonly executionPlan: ExecutionPlanV3,
    private readonly engine: AbstractEngine,
    private readonly scene: Scene,
    subjectControllersByEntityId: ReadonlyMap<string, SubjectController>,
    subjectVisuals: readonly SubjectVisual[],
    camera: FreeCamera,
    ownedHeightfieldShape: PhysicsShapeHeightField,
    aggregates: PhysicsAggregate[],
    autoStartRenderLoop: boolean,
  ) {
    this.controlledEntityId = executionPlan.controlledEntityId;
    this.subjectControllersByEntityId = subjectControllersByEntityId;
    this.subjectVisuals = subjectVisuals;
    this.camera = camera;
    this.ownedHeightfieldShape = ownedHeightfieldShape;
    this.aggregates.push(...aggregates);
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
    const engine = options.engineFactory?.() ?? new Engine(options.canvas!, true, { preserveDrawingBuffer: true, stencil: true });
    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    await enableHavokPhysics(
      scene,
      options.executionPlan.gravityMetersPerSecondSquaredXYZ,
      options.havokWasmBinary,
    );
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
    const aggregates: PhysicsAggregate[] = [
      new PhysicsAggregate(terrainMesh, heightfieldShape, { mass: 0, friction: 0.9, restitution: 0 }, scene),
    ];

    for (const water of options.executionPlan.waters) createWaterMesh(water, materials, scene);
    for (const object of options.executionPlan.objects) {
      const mesh = createObjectMesh(object, materials, scene);
      if (object.collisionEnabled) {
        const shapeType = object.primitive.kind === "box"
          ? PhysicsShapeType.BOX
          : object.primitive.kind === "sphere"
            ? PhysicsShapeType.SPHERE
            : PhysicsShapeType.CYLINDER;
        aggregates.push(new PhysicsAggregate(mesh, shapeType, { mass: 0, friction: 0.75, restitution: 0 }, scene));
      }
    }

    const subjectControllersByEntityId = new Map<string, SubjectController>();
    const subjectVisuals = options.executionPlan.subjects.map((subject) => {
      const visual = createSubjectVisual(subject, materials.subject, scene);
      subjectControllersByEntityId.set(
        subject.entityId,
        new SubjectController(
          subject,
          options.executionPlan.gravityMetersPerSecondSquaredXYZ,
          visual.root,
          scene,
        ),
      );
      return visual;
    });

    const cameraPlan = options.executionPlan.camera;
    const camera = new FreeCamera(cameraPlan.cameraEntityId, Vector3.Zero(), scene);
    camera.fov = (cameraPlan.fovDegrees * Math.PI) / 180;
    camera.minZ = 0.05;
    scene.activeCamera = camera;

    return new BabylonWorldRuntime(
      options.executionPlan,
      engine,
      scene,
      subjectControllersByEntityId,
      subjectVisuals,
      camera,
      heightfieldShape,
      aggregates,
      options.engineFactory === undefined && options.autoStartRenderLoop !== false,
    );
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
        controller.step(
          subject.entityId === this.controlledEntityId ? input.actions : [],
          this.detectMovementMedium(controller),
        );
      }
      physicsEngine._step(FIXED_TIME_STEP_SECONDS);
      this.tick += 1;
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
      subjectStatesByEntityId[subject.entityId] = {
        entityId: subject.entityId,
        subjectDefinitionRef: subject.subjectDefinitionRef,
        subjectDefinitionHash: subject.subjectDefinitionHash,
        positionMetersXYZ: [subjectOrigin.x, subjectOrigin.y, subjectOrigin.z],
        velocityMetersPerSecondXYZ: [velocity.x, velocity.y, velocity.z],
        movementMedium: this.detectMovementMedium(controller),
      };
    }
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
    this.controlledEntityId = this.executionPlan.controlledEntityId;
    this.tick = 0;
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
    this.engine.stopRenderLoop(this.renderLoop);
    for (const controller of this.subjectControllersByEntityId.values()) controller.dispose();
    for (const visual of [...this.subjectVisuals].reverse()) {
      for (const mesh of [...visual.meshes].reverse()) mesh.dispose(false, false);
      visual.root.dispose(false, false);
    }
    for (const aggregate of this.aggregates.reverse()) aggregate.dispose();
    this.ownedHeightfieldShape.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }

  private detectMovementMedium(
    controller: SubjectController,
  ): "ground" | "air" | "water" {
    const subjectOrigin = controller.subjectOrigin;
    for (const water of this.executionPlan.waters) {
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
      this.executionPlan.terrain,
      subjectOrigin.x,
      subjectOrigin.z,
    );
    return subjectOrigin.y <= groundHeight + 0.16 ? "ground" : "air";
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
    const subjectOrigin = this.controllerFor(subject.entityId).subjectOrigin;
    const cameraPlan = this.executionPlan.camera;
    const target = new Vector3(
      subjectOrigin.x,
      subjectOrigin.y + cameraPlan.targetHeightMeters,
      subjectOrigin.z,
    );
    const horizontalDistance = Math.cos(cameraPlan.pitchRadians) * cameraPlan.distanceMeters;
    this.camera.position.set(
      target.x,
      target.y + Math.sin(cameraPlan.pitchRadians) * cameraPlan.distanceMeters,
      target.z + horizontalDistance,
    );
    this.camera.setTarget(target);
  }

  private controllerFor(subjectEntityId: string): SubjectController {
    const controller = this.subjectControllersByEntityId.get(subjectEntityId);
    if (controller === undefined) {
      throw new Error(`WORLDKIT_RUNTIME_SUBJECT_NOT_FOUND: ${subjectEntityId}`);
    }
    return controller;
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error("WORLDKIT_RUNTIME_DISPOSED");
  }
}
