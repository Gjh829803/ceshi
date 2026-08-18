import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import { Engine } from "@babylonjs/core/Engines/engine.pure.js";
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
  ExecutionObjectV1,
  ExecutionPlanV1,
  ExecutionWaterBoundaryV1,
  ExecutionWaterV1,
  FixedInputV1,
  WorldRuntimeSession,
  WorldRuntimeSnapshotV1,
} from "@whitebox-world/runtime-contracts";

import { createWhiteboxMaterials, type WhiteboxMaterials } from "./materials";
import { enableHavokPhysics, FIXED_TIME_STEP_SECONDS } from "./physics";
import { SubjectController } from "./subject-controller";
import {
  createTerrainMesh,
  sampleExecutionTerrainHeight,
  toBabylonHeightfieldData,
} from "./terrain";

export interface BabylonWorldRuntimeOptions {
  executionPlan: ExecutionPlanV1;
  canvas?: HTMLCanvasElement;
  engineFactory?: () => AbstractEngine;
  autoStartRenderLoop?: boolean;
  /** Required by headless Node hosts because Node cannot fetch file:// WASM URLs. */
  havokWasmBinary?: ArrayBuffer;
}

function applyTransform(mesh: Mesh, object: ExecutionObjectV1): void {
  mesh.position = new Vector3(...object.transform.positionMeters);
  const [rotationX, rotationY, rotationZ] = object.transform.rotationEulerRadiansXYZ;
  mesh.rotationQuaternion = Quaternion.FromEulerAngles(rotationX, rotationY, rotationZ);
  mesh.scaling = new Vector3(...object.transform.scaleXYZ);
  mesh.metadata = { worldkitEntityId: object.entityId, semanticClassId: object.semanticClassId };
}

function createObjectMesh(object: ExecutionObjectV1, materials: WhiteboxMaterials, scene: Scene): Mesh {
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

function createWaterMesh(water: ExecutionWaterV1, materials: WhiteboxMaterials, scene: Scene): Mesh {
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
    mesh.position = new Vector3(boundary.centerXZ[0], water.waterLevelMeters, boundary.centerXZ[1]);
  } else {
    mesh = new Mesh(water.entityId, scene);
    const centerX = boundary.pointsXZ.reduce((sum, point) => sum + point[0], 0) / boundary.pointsXZ.length;
    const centerZ = boundary.pointsXZ.reduce((sum, point) => sum + point[1], 0) / boundary.pointsXZ.length;
    const positions = [centerX, water.waterLevelMeters, centerZ];
    const indices: number[] = [];
    for (const point of boundary.pointsXZ) positions.push(point[0], water.waterLevelMeters, point[1]);
    for (let index = 0; index < boundary.pointsXZ.length; index += 1) {
      indices.push(0, index + 1, ((index + 1) % boundary.pointsXZ.length) + 1);
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

function containsPoint(boundary: ExecutionWaterBoundaryV1, x: number, z: number): boolean {
  if (boundary.kind === "circle") {
    const dx = x - boundary.centerXZ[0];
    const dz = z - boundary.centerXZ[1];
    return dx * dx + dz * dz <= boundary.radiusMeters * boundary.radiusMeters;
  }
  if (boundary.kind === "ellipse") {
    const dx = (x - boundary.centerXZ[0]) / boundary.radiusMetersXZ[0];
    const dz = (z - boundary.centerXZ[1]) / boundary.radiusMetersXZ[1];
    return dx * dx + dz * dz <= 1;
  }
  let inside = false;
  for (let current = 0, previous = boundary.pointsXZ.length - 1; current < boundary.pointsXZ.length; previous = current, current += 1) {
    const currentPoint = boundary.pointsXZ[current]!;
    const previousPoint = boundary.pointsXZ[previous]!;
    const crosses = currentPoint[1] > z !== previousPoint[1] > z &&
      x < ((previousPoint[0] - currentPoint[0]) * (z - currentPoint[1])) /
        (previousPoint[1] - currentPoint[1]) + currentPoint[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function configureAtmosphere(scene: Scene, preset: ExecutionPlanV1["atmospherePreset"]): void {
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

export class BabylonWorldRuntime implements WorldRuntimeSession {
  readonly runtimeBackend = "babylon-havok" as const;
  readonly ready: Promise<void> = Promise.resolve();

  private tick = 0;
  private disposed = false;
  private readonly aggregates: PhysicsAggregate[] = [];
  private readonly ownedHeightfieldShape: PhysicsShapeHeightField;
  private readonly subjectController: SubjectController;
  private readonly camera: FreeCamera;
  private readonly renderLoop: () => void;

  private constructor(
    private readonly executionPlan: ExecutionPlanV1,
    private readonly engine: AbstractEngine,
    private readonly scene: Scene,
    subjectController: SubjectController,
    camera: FreeCamera,
    ownedHeightfieldShape: PhysicsShapeHeightField,
    aggregates: PhysicsAggregate[],
    autoStartRenderLoop: boolean,
  ) {
    this.subjectController = subjectController;
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
      terrain.sizeXZ[0],
      terrain.sizeXZ[1],
      terrain.resolutionXZ[0],
      terrain.resolutionXZ[1],
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

    const subject = options.executionPlan.subject;
    const subjectMesh = MeshBuilder.CreateCapsule(
      subject.entityId,
      { height: subject.capsule.heightMeters, radius: subject.capsule.radiusMeters, tessellation: 16 },
      scene,
    );
    subjectMesh.material = materials.subject;
    subjectMesh.metadata = { worldkitEntityId: subject.entityId, semanticClassId: "subject.player" };
    const subjectController = new SubjectController(options.executionPlan, subjectMesh, scene);

    const cameraPlan = options.executionPlan.camera;
    const camera = new FreeCamera(cameraPlan.cameraEntityId, Vector3.Zero(), scene);
    camera.fov = (cameraPlan.fovDegrees * Math.PI) / 180;
    camera.minZ = 0.05;
    scene.activeCamera = camera;

    return new BabylonWorldRuntime(
      options.executionPlan,
      engine,
      scene,
      subjectController,
      camera,
      heightfieldShape,
      aggregates,
      options.engineFactory === undefined && options.autoStartRenderLoop !== false,
    );
  }

  async runFixedInput(input: FixedInputV1): Promise<WorldRuntimeSnapshotV1> {
    this.assertUsable();
    if (!Number.isSafeInteger(input.ticks) || input.ticks < 0 || input.ticks > 36_000) {
      throw new RangeError("Fixed input ticks must be an integer from 0 through 36000.");
    }
    const physicsEngine = this.scene.getPhysicsEngine();
    if (physicsEngine === null) throw new Error("WORLDKIT_HAVOK_ENGINE_MISSING");
    for (let index = 0; index < input.ticks; index += 1) {
      this.subjectController.step(input.actions, this.detectMovementMedium());
      physicsEngine._step(FIXED_TIME_STEP_SECONDS);
      this.tick += 1;
      this.updateCamera();
    }
    return this.snapshot();
  }

  snapshot(): WorldRuntimeSnapshotV1 {
    this.assertUsable();
    const position = this.subjectController.position;
    const velocity = this.subjectController.velocity;
    return {
      kind: "worldkit-runtime-snapshot",
      schemaVersion: 1,
      runtimeBackend: "babylon-havok",
      tick: this.tick,
      ready: true,
      physics: { backend: "havok", ready: true, fixedTimeStepSeconds: FIXED_TIME_STEP_SECONDS },
      subject: {
        entityId: this.executionPlan.subject.entityId,
        positionMeters: [position.x, position.y, position.z],
        velocityMetersPerSecond: [velocity.x, velocity.y, velocity.z],
        movementMedium: this.detectMovementMedium(),
      },
      camera: {
        entityId: this.executionPlan.camera.cameraEntityId,
        targetEntityId: this.executionPlan.camera.targetEntityId,
        positionMeters: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      },
      resources: {
        meshes: this.scene.meshes.length,
        bodies: (this.scene.getPhysicsEngine() as PhysicsEngine | null)?.getBodies().length ?? 0,
        terrainSamples: this.executionPlan.terrain.heightSamplesMeters.length,
      },
    };
  }

  renderFrame(): void {
    this.assertUsable();
    this.updateCamera();
    this.scene.render();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.engine.stopRenderLoop(this.renderLoop);
    this.subjectController.dispose();
    for (const aggregate of this.aggregates.reverse()) aggregate.dispose();
    this.ownedHeightfieldShape.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }

  private detectMovementMedium(): "ground" | "air" | "water" {
    const position = this.subjectController.position;
    const footHeight = position.y - this.executionPlan.subject.capsule.heightMeters / 2;
    for (const water of this.executionPlan.waters) {
      if (
        water.traversalMode === "swimmable" &&
        containsPoint(water.boundary, position.x, position.z) &&
        footHeight <= water.waterLevelMeters + 0.6 &&
        footHeight >= water.waterLevelMeters - water.depthMeters - 0.6
      ) {
        return "water";
      }
    }
    const groundHeight = sampleExecutionTerrainHeight(this.executionPlan.terrain, position.x, position.z);
    return footHeight <= groundHeight + 0.16 ? "ground" : "air";
  }

  private updateCamera(): void {
    const subjectPosition = this.subjectController.position;
    const cameraPlan = this.executionPlan.camera;
    const target = new Vector3(
      subjectPosition.x,
      subjectPosition.y - this.executionPlan.subject.capsule.heightMeters / 2 + cameraPlan.targetHeightMeters,
      subjectPosition.z,
    );
    const horizontalDistance = Math.cos(cameraPlan.pitchRadians) * cameraPlan.distanceMeters;
    this.camera.position.set(
      target.x,
      target.y + Math.sin(cameraPlan.pitchRadians) * cameraPlan.distanceMeters,
      target.z + horizontalDistance,
    );
    this.camera.setTarget(target);
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error("WORLDKIT_RUNTIME_DISPOSED");
  }
}
