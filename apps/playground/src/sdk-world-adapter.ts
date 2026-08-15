import type { ActionManifest, MovementIntent, Vec3Tuple } from "@whitebox-world/contracts";
import { World } from "@whitebox-world/core";
import {
  createPhysicsSystem,
  type PhysicsCollider,
  type PhysicsSystem,
} from "@whitebox-world/physics";
import {
  createHumanoidThirdPersonSubjectKit,
  createPlaceholderHumanoidVisual,
  createRapierHumanoidMotorFromWorld,
  loadRiggedWhiteboxVisual,
  type HumanoidThirdPersonSubjectKit,
  type HumanoidVisual,
} from "@whitebox-world/subjects";
import {
  compileOutdoorScene,
  FeatureRegistry,
  isTerrainSurface,
  type CompiledOutdoorScene,
  type FeatureInspection as RegistryFeatureInspection,
  type LandmarkDescriptor,
  type LandmarkPrimitiveDescriptor,
  type OutdoorSceneDefinition,
  type TerrainSurface,
  type WaterSurfaceDescriptor,
} from "@whitebox-world/world";
import * as THREE from "three";
import actionManifestJson from "../../../assets/humanoid/action-manifest.json";
import type {
  FeatureInspection,
  FixedInputStep,
  InputAction,
  PlaygroundWorldAdapter,
  WorldSnapshot,
} from "./playground-world.js";
import { currentScene } from "./scenes/current-scene.js";

const FIXED_DELTA = 1 / 60;
const PLAYER_ID = "player-humanoid";
const WHITE = 0xe7e8e3;

interface LocalRigStatus {
  source: "mixamo-xbot-local" | "placeholder";
  limitations: readonly string[];
}

function whiteMaterial(color = WHITE): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0,
  });
}

function isWaterSurface(value: unknown): value is WaterSurfaceDescriptor {
  return typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "water";
}

function isLandmark(value: unknown): value is LandmarkDescriptor {
  if (typeof value !== "object" || value === null) return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === "primitive" || kind === "compound";
}

function geometryForPrimitive(descriptor: LandmarkPrimitiveDescriptor): THREE.BufferGeometry {
  const size = descriptor.size ?? [1, 1, 1];
  switch (descriptor.primitive) {
    case "box":
      return new THREE.BoxGeometry(size[0], size[1], size[2]);
    case "sphere":
      return new THREE.SphereGeometry(descriptor.radius ?? 1, 20, 14);
    case "cylinder":
      return new THREE.CylinderGeometry(
        descriptor.radius ?? 1,
        descriptor.radius ?? 1,
        descriptor.height ?? 1,
        16,
      );
    case "cone":
      return new THREE.ConeGeometry(descriptor.radius ?? 1, descriptor.height ?? 1, 16);
    case "plane": {
      const geometry = new THREE.PlaneGeometry(size[0], size[2]);
      geometry.rotateX(-Math.PI / 2);
      return geometry;
    }
  }
}

function geometryForWater(descriptor: WaterSurfaceDescriptor): THREE.BufferGeometry {
  if (descriptor.area.kind === "circle" || descriptor.area.kind === "ellipse") {
    const radius =
      descriptor.area.kind === "circle"
        ? ([descriptor.area.radius, descriptor.area.radius] as const)
        : descriptor.area.radius;
    const geometry = new THREE.CircleGeometry(1, 128);
    geometry.rotateX(-Math.PI / 2);
    geometry.scale(radius[0], 1, radius[1]);
    geometry.translate(descriptor.area.center[0], 0, descriptor.area.center[1]);
    return geometry;
  }

  const points = descriptor.area.points;
  const contour = points.map(([x, z]) => new THREE.Vector2(x, z));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  const positions = new Float32Array(points.length * 3);
  const uvs = new Float32Array(points.length * 2);
  const minimumX = Math.min(...points.map(([x]) => x));
  const maximumX = Math.max(...points.map(([x]) => x));
  const minimumZ = Math.min(...points.map(([, z]) => z));
  const maximumZ = Math.max(...points.map(([, z]) => z));
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index] as readonly [number, number];
    positions.set([point[0], 0, point[1]], index * 3);
    uvs.set([
      (point[0] - minimumX) / Math.max(1e-6, maximumX - minimumX),
      (point[1] - minimumZ) / Math.max(1e-6, maximumZ - minimumZ),
    ], index * 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(triangles.flat());
  geometry.computeVertexNormals();
  return geometry;
}

function applyTransform(object: THREE.Object3D, descriptor: LandmarkDescriptor): void {
  object.position.set(...descriptor.transform.position);
  object.rotation.set(...descriptor.transform.rotation);
  object.scale.set(...descriptor.transform.scale);
}

function compileLandmark(descriptor: LandmarkDescriptor): THREE.Object3D {
  if (descriptor.kind === "primitive") {
    const mesh = new THREE.Mesh(geometryForPrimitive(descriptor), whiteMaterial(0xd9dad5));
    mesh.name = descriptor.id ?? descriptor.primitive;
    mesh.userData.landmarkDescriptor = descriptor;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    applyTransform(mesh, descriptor);
    return mesh;
  }
  const group = new THREE.Group();
  group.name = descriptor.id ?? "compound-landmark";
  applyTransform(group, descriptor);
  for (const child of descriptor.children) group.add(compileLandmark(child));
  return group;
}

function normalizeHumanoidVisual(visual: HumanoidVisual): void {
  if (visual.status !== "rigged") return;
  visual.root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(visual.root);
  const height = bounds.max.y - bounds.min.y;
  if (!Number.isFinite(height) || height <= 0) return;
  const scale = 1.75 / height;
  visual.root.scale.multiplyScalar(scale);
  visual.root.updateMatrixWorld(true);
  const scaledBounds = new THREE.Box3().setFromObject(visual.root);
  visual.root.position.y -= scaledBounds.min.y;
}

async function loadLocalVisual(): Promise<{ visual: HumanoidVisual; status: LocalRigStatus }> {
  try {
    const visual = await loadRiggedWhiteboxVisual("/local-assets/Xbot.glb");
    normalizeHumanoidVisual(visual);
    return {
      visual,
      status: {
        source: "mixamo-xbot-local",
        limitations: ["Local development asset; redistribution provenance is not yet accepted."],
      },
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      visual: createPlaceholderHumanoidVisual(),
      status: {
        source: "placeholder",
        limitations: [`Local Mixamo-compatible GLB unavailable: ${detail}`],
      },
    };
  }
}

function toPlaygroundInspection(
  registry: FeatureRegistry,
  inspection: RegistryFeatureInspection,
): FeatureInspection {
  return {
    id: inspection.id,
    type: inspection.type,
    version: inspection.version,
    seed: inspection.seed,
    status: inspection.status === "built" ? "ready" : "error",
    parameters: inspection.params as Readonly<Record<string, unknown>>,
    resources: registry.listResources(inspection.id).map((resource) => ({
      id: resource.id,
      kind:
        resource.kind === "terrain" || resource.kind === "landmark"
          ? "mesh"
          : resource.kind === "terrainPatch"
            ? "collider"
            : resource.kind === "custom"
              ? "semantic"
              : resource.kind,
      ...(resource.metrics.vertices > 0 ? { vertices: resource.metrics.vertices } : {}),
    })),
    diagnostics: inspection.diagnostics.map(({ severity, code, message }) => ({
      severity,
      code,
      message,
    })),
  };
}

function addOwnedRenderable(
  world: World,
  id: string,
  object3D: THREE.Object3D,
): void {
  const entity = world.createEntity({ id, object3D });
  entity.own({
    dispose: () => {
      object3D.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      });
    },
  });
}

export class SdkWorldAdapter implements PlaygroundWorldAdapter {
  readonly name: string;
  readonly canvas: HTMLCanvasElement;

  private readonly world: World;
  private readonly physics: PhysicsSystem;
  private readonly registry: FeatureRegistry;
  private readonly subject: HumanoidThirdPersonSubjectKit<unknown>;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new THREE.Clock();
  private readonly listeners = new Set<(snapshot: WorldSnapshot) => void>();
  private readonly pressed = new Set<InputAction>();
  private readonly resizeObserver: ResizeObserver;
  private readonly playerCollider: PhysicsCollider;
  private readonly rigStatus: LocalRigStatus;
  private readonly spawnPosition: Vec3Tuple;
  private readonly spawnFacingRadians: number;
  private readonly spawnCameraPitchRadians: number;
  private readonly spawnCameraDistance: number;
  private readonly waterMaterials = new Set<THREE.ShaderMaterial>();
  private frame = 0;
  private paused = false;
  private disposed = false;
  private dragPointerId: number | null = null;
  private dragLast = new THREE.Vector2();
  private fps = 0;
  private fpsFrames = 0;
  private fpsElapsed = 0;
  private lastAction: WorldSnapshot["player"]["action"] = "idle";

  static async create(
    sceneDefinition: OutdoorSceneDefinition = currentScene,
  ): Promise<SdkWorldAdapter> {
    const scene = compileOutdoorScene(sceneDefinition);
    const physics = await createPhysicsSystem({ gravity: [0, -24, 0] });
    const visual = await loadLocalVisual();
    return new SdkWorldAdapter(scene, physics, visual);
  }

  private constructor(
    scene: CompiledOutdoorScene,
    physics: PhysicsSystem,
    visualResult: { visual: HumanoidVisual; status: LocalRigStatus },
  ) {
    this.physics = physics;
    this.registry = scene.registry;
    this.rigStatus = visualResult.status;
    this.name = `sdk-runtime/${scene.definition.id}/${visualResult.status.source}`;
    this.world = new World({ fixedDeltaSeconds: FIXED_DELTA, scheduler: null });
    this.camera = new THREE.PerspectiveCamera(56, 1, 0.1, 1_200);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.canvas = this.renderer.domElement;
    this.canvas.className = "world-canvas";
    this.canvas.tabIndex = 0;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.applyAtmosphere(scene);
    this.compileTrackedResources();

    this.spawnPosition = scene.spawn.position;
    this.spawnFacingRadians = scene.spawn.facingRadians;
    this.spawnCameraPitchRadians = scene.spawn.camera.pitchRadians;
    this.spawnCameraDistance = scene.spawn.camera.distance;
    const body = this.physics.createRigidBody(undefined, {
      type: "kinematicPosition",
      sync: "none",
      position: this.spawnPosition,
      lockRotations: true,
    });
    this.playerCollider = body.createCollider({
      shape: { type: "capsule", halfHeight: 0.55, radius: 0.35 },
      friction: 0,
    });
    const motor = createRapierHumanoidMotorFromWorld(
      this.physics.rawWorld,
      body.raw,
      this.playerCollider.raw,
      { initialGrounded: false },
    );
    const actionManifest = actionManifestJson as unknown as ActionManifest;
    this.subject = createHumanoidThirdPersonSubjectKit({
      id: PLAYER_ID,
      camera: this.camera,
      motor,
      visual: visualResult.visual,
      ...(visualResult.visual.status === "rigged" ? { actionManifest } : {}),
      cameraOptions: {
        distance: this.spawnCameraDistance,
        minDistance: 1.8,
        maxDistance: 8,
        targetOffset: [0, 0.85, 0],
        pitch: this.spawnCameraPitchRadians,
        yaw: this.spawnFacingRadians,
        collision: {
          resolve: ({ origin, desired, radius }) => {
            const delta = desired.clone().sub(origin);
            const length = delta.length();
            if (length <= 0) return desired;
            const hit = this.physics.raycast({
              origin: origin.toArray() as unknown as Vec3Tuple,
              direction: delta.normalize().toArray() as unknown as Vec3Tuple,
              maxDistance: length,
              excludeCollider: this.playerCollider,
            });
            if (hit === null) return desired;
            const distance = Math.max(0.5, hit.distance - radius);
            return origin.clone().add(delta.multiplyScalar(distance));
          },
        },
      },
    });
    this.subject.visual.root.position.y -= 0.9;
    this.world.createEntity({ id: PLAYER_ID, object3D: this.subject.root });
    this.world.registerSystem(this.subject, { order: -100 });
    this.world.registerSystem(this.physics, { order: 0 });
    this.subject.reset(this.spawnPosition, {
      facingRadians: this.spawnFacingRadians,
      grounded: false,
    });
    this.subject.cameraRig.update(0);

    const hemi = new THREE.HemisphereLight(0xf8fbff, 0x6d736f, 1.55);
    const sun = new THREE.DirectionalLight(0xfff1cf, 2.6);
    sun.position.set(...(scene.atmosphere.sunDirection ?? [-34, 50, 22]));
    sun.intensity = scene.atmosphere.sunIntensity ?? 2.6;
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 70;
    sun.shadow.camera.bottom = -70;
    this.world.scene.add(hemi, sun);

    this.world.start();
    this.bindInput();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.renderer.setAnimationLoop(() => this.animate());
  }

  mount(container: HTMLElement): void {
    container.append(this.canvas);
    this.resizeObserver.observe(container);
    this.resize();
    this.canvas.focus();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.clock.getDelta();
    this.emit();
  }

  isPaused(): boolean {
    return this.paused;
  }

  reset(): void {
    this.pressed.clear();
    this.subject.reset(this.spawnPosition, {
      facingRadians: this.spawnFacingRadians,
      grounded: false,
    });
    this.subject.cameraRig.setOrbit(this.spawnFacingRadians, this.spawnCameraPitchRadians);
    this.subject.cameraRig.setDistance(this.spawnCameraDistance);
    this.subject.cameraRig.update(0);
    this.lastAction = "idle";
    this.clock.getDelta();
    this.render();
    this.emit();
  }

  render(): void {
    this.renderer.render(this.world.scene, this.camera);
    this.frame += 1;
  }

  async runFixedInput(steps: readonly FixedInputStep[]): Promise<WorldSnapshot> {
    const wasPaused = this.paused;
    this.paused = true;
    this.pressed.clear();
    for (const step of steps) {
      const actions = new Set(step.actions);
      for (let tick = 0; tick < Math.max(0, Math.floor(step.ticks)); tick += 1) {
        this.applyActions(actions, FIXED_DELTA);
        this.world.advance(FIXED_DELTA);
      }
    }
    this.subject.setMovementIntent({ forward: 0, right: 0, run: false, jump: false });
    this.world.advance(FIXED_DELTA);
    this.paused = wasPaused;
    this.render();
    this.emit();
    return this.snapshot();
  }

  captureScreenshot(): string {
    this.render();
    return this.canvas.toDataURL("image/png");
  }

  inspectFeatures(): readonly FeatureInspection[] {
    const features = this.registry.list().map((feature) =>
      toPlaygroundInspection(this.registry, feature),
    );
    if (this.rigStatus.limitations.length > 0) {
      features.push({
        id: "humanoid-rig-status",
        type: "runtime.humanoid-asset",
        version: 1,
        status: this.rigStatus.source === "placeholder" ? "error" : "ready",
        parameters: { source: this.rigStatus.source },
        resources: [],
        diagnostics: this.rigStatus.limitations.map((message) => ({
          severity: "warning",
          code: "HUMANOID_ASSET_LIMITATION",
          message,
        })),
      });
    }
    return features;
  }

  snapshot(): WorldSnapshot {
    const position = this.subject.root.position;
    const orbit = this.subject.cameraRig.orbit;
    return {
      adapter: this.name,
      frame: this.frame,
      tick: this.world.tick,
      paused: this.paused,
      player: {
        entityId: PLAYER_ID,
        action: this.subject.actionStateMachine?.currentState ?? this.lastAction,
        grounded: this.lastAction !== "jump",
        position: [position.x, position.y, position.z],
        rotationY: this.subject.root.rotation.y,
      },
      camera: {
        position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
        yaw: orbit.yaw,
        pitch: orbit.pitch,
        distance: orbit.distance,
      },
      features: this.inspectFeatures(),
      performance: {
        fps: this.fps,
        triangles: this.renderer.info.render.triangles,
        drawCalls: this.renderer.info.render.calls,
      },
    };
  }

  subscribe(listener: (snapshot: WorldSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.unbindInput();
    this.world.dispose();
    this.waterMaterials.clear();
    this.renderer.dispose();
  }

  private applyAtmosphere(scene: CompiledOutdoorScene): void {
    const presets = {
      "clear-day": { sky: 0xcfd5d5, fog: 0xcfd5d5 },
      "golden-hour": { sky: 0xd9c8b3, fog: 0xd8cab9 },
      overcast: { sky: 0xb8c0c2, fog: 0xb8c0c2 },
      night: { sky: 0x222b3b, fog: 0x283142 },
    } as const;
    const preset = presets[scene.atmosphere.preset ?? "clear-day"];
    const skyColor = scene.atmosphere.skyColor ?? preset.sky;
    const fogColor = scene.atmosphere.fogColor ?? preset.fog;
    this.world.scene.background = new THREE.Color(skyColor);
    this.world.scene.fog = new THREE.Fog(
      fogColor,
      scene.atmosphere.fogNear ?? 260,
      scene.atmosphere.fogFar ?? 900,
    );
  }

  private compileTrackedResources(): void {
    for (const resource of this.registry.listResources()) {
      if (resource.kind === "terrain" && isTerrainSurface(resource.value)) {
        this.addTerrain(resource.value, resource.id);
      } else if (resource.kind === "surface" && isWaterSurface(resource.value)) {
        this.addLake(resource.value, resource.id);
      } else if (resource.kind === "landmark" && isLandmark(resource.value)) {
        this.addLandmark(resource.value, resource.id);
      }
    }
  }

  private addTerrain(terrain: TerrainSurface, resourceId: string): void {
    let tileIndex = 0;
    terrain.forEachHeightfield((heightfield) => {
      const id = `${resourceId}:tile:${tileIndex}`;
      tileIndex += 1;
      // Derive edge normals from the complete surface, not from one tile, so
      // adjacent meshes receive identical lighting along their shared border.
      const geometry = heightfield.toBufferGeometry(terrain);
      const mesh = new THREE.Mesh(geometry, whiteMaterial());
      mesh.name = id;
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      addOwnedRenderable(this.world, id, mesh);
      const body = this.physics.createRigidBody(undefined, {
        type: "fixed",
        sync: "none",
        position: [heightfield.origin[0], 0, heightfield.origin[1]],
      });
      body.createCollider({
        shape: {
          type: "heightfield",
          rows: heightfield.zSegments,
          columns: heightfield.xSegments,
          heights: heightfield.heights,
          scale: [heightfield.width, 1, heightfield.depth],
        },
        friction: 0.8,
      });
    });
  }

  private addLake(descriptor: WaterSurfaceDescriptor, resourceId: string): void {
    const geometry = geometryForWater(descriptor);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDeepColor: { value: new THREE.Color(descriptor.style.deepColor) },
        uShallowColor: { value: new THREE.Color(descriptor.style.shallowColor) },
        uOpacity: { value: descriptor.style.opacity },
        uWaveAmplitude: { value: descriptor.style.waveAmplitude },
        uWaveFrequency: { value: descriptor.style.waveFrequency },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uWaveAmplitude;
        uniform float uWaveFrequency;
        varying vec2 vUv;
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        void main() {
          vUv = uv;
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          float waveA = sin((worldPosition.x + uTime * 2.1) * uWaveFrequency);
          float waveB = cos((worldPosition.z - uTime * 1.6) * uWaveFrequency * 1.37);
          worldPosition.y += (waveA + waveB) * uWaveAmplitude;
          vWorldPosition = worldPosition.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uDeepColor;
        uniform vec3 uShallowColor;
        uniform float uOpacity;
        varying vec2 vUv;
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        void main() {
          float shore = smoothstep(0.34, 0.5, length(vUv - vec2(0.5)));
          vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
          float fresnel = pow(1.0 - max(dot(normalize(vWorldNormal), viewDirection), 0.0), 2.2);
          vec3 color = mix(uDeepColor, uShallowColor, shore * 0.82 + fresnel * 0.18);
          gl_FragColor = vec4(color, uOpacity * (0.82 + fresnel * 0.18));
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.waterMaterials.add(material);
    const water = new THREE.Mesh(geometry, material);
    water.name = resourceId;
    water.position.y = descriptor.elevation;
    water.receiveShadow = true;
    addOwnedRenderable(this.world, resourceId, water);
  }

  private addLandmark(descriptor: LandmarkDescriptor, resourceId: string): void {
    const landmark = compileLandmark(descriptor);
    landmark.updateMatrixWorld(true);
    addOwnedRenderable(this.world, resourceId, landmark);
    landmark.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return;
      const primitive = object.userData.landmarkDescriptor as
        | LandmarkPrimitiveDescriptor
        | undefined;
      if (primitive === undefined || !primitive.collision) return;
      const position = object.getWorldPosition(new THREE.Vector3());
      const rotation = object.getWorldQuaternion(new THREE.Quaternion());
      const scale = object.getWorldScale(new THREE.Vector3());
      scale.set(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
      const body = this.physics.createRigidBody(undefined, {
        type: "fixed",
        sync: "none",
        position: position.toArray() as unknown as Vec3Tuple,
        rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
      });
      const size = primitive.size ?? [1, 1, 1];
      switch (primitive.primitive) {
        case "box":
          body.createCollider({
            shape: {
              type: "box",
              halfExtents: [
                Math.max(0.01, (size[0] * scale.x) / 2),
                Math.max(0.01, (size[1] * scale.y) / 2),
                Math.max(0.01, (size[2] * scale.z) / 2),
              ],
            },
          });
          break;
        case "sphere":
          body.createCollider({
            shape: {
              type: "sphere",
              radius: (primitive.radius ?? 1) * Math.max(scale.x, scale.y, scale.z),
            },
          });
          break;
        case "cylinder":
          body.createCollider({
            shape: {
              type: "cylinder",
              halfHeight: ((primitive.height ?? 1) * scale.y) / 2,
              radius: (primitive.radius ?? 1) * Math.max(scale.x, scale.z),
            },
          });
          break;
        case "cone":
          body.createCollider({
            shape: {
              type: "cone",
              halfHeight: ((primitive.height ?? 1) * scale.y) / 2,
              radius: (primitive.radius ?? 1) * Math.max(scale.x, scale.z),
            },
          });
          break;
        case "plane":
          body.createCollider({
            shape: {
              type: "box",
              halfExtents: [
                Math.max(0.01, (size[0] * scale.x) / 2),
                0.05,
                Math.max(0.01, (size[2] * scale.z) / 2),
              ],
            },
          });
          break;
      }
    });
  }

  private animate(): void {
    if (this.disposed) return;
    const delta = Math.min(this.clock.getDelta(), 0.1);
    this.fpsElapsed += delta;
    this.fpsFrames += 1;
    for (const material of this.waterMaterials) {
      const time = material.uniforms.uTime;
      if (time !== undefined) time.value = this.clock.elapsedTime;
    }
    if (this.fpsElapsed >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsElapsed);
      this.fpsFrames = 0;
      this.fpsElapsed = 0;
    }
    if (!this.paused) {
      this.applyActions(this.pressed, delta);
      this.world.advance(delta);
    }
    this.render();
    if (this.frame % 10 === 0) this.emit();
  }

  private applyActions(actions: ReadonlySet<InputAction>, deltaSeconds: number): void {
    if (actions.has("cameraLeft")) this.subject.cameraRig.rotate(-deltaSeconds * 260, 0);
    if (actions.has("cameraRight")) this.subject.cameraRig.rotate(deltaSeconds * 260, 0);
    // Arrow semantics describe where the player looks, not where the orbiting
    // camera body moves: looking up lowers the camera's orbit pitch.
    if (actions.has("cameraUp")) this.subject.cameraRig.rotate(0, deltaSeconds * 260);
    if (actions.has("cameraDown")) this.subject.cameraRig.rotate(0, -deltaSeconds * 260);
    const intent: MovementIntent = {
      forward: Number(actions.has("forward")) - Number(actions.has("backward")),
      right: Number(actions.has("right")) - Number(actions.has("left")),
      run: actions.has("run"),
      jump: actions.has("jump"),
    };
    this.subject.setMovementIntent(intent);
    const moving = intent.forward !== 0 || intent.right !== 0;
    this.lastAction = intent.jump ? "jump" : moving ? (intent.run ? "run" : "walk") : "idle";
  }

  private resize(): void {
    const parent = this.canvas.parentElement;
    if (parent === null) return;
    const width = Math.max(1, parent.clientWidth);
    const height = Math.max(1, parent.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const action = this.keyAction(event.code);
    if (action !== null) {
      event.preventDefault();
      this.pressed.add(action);
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    const action = this.keyAction(event.code);
    if (action !== null) this.pressed.delete(action);
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.dragPointerId = event.pointerId;
    this.dragLast.set(event.clientX, event.clientY);
    this.canvas.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.dragPointerId) return;
    this.subject.cameraRig.rotate(
      event.clientX - this.dragLast.x,
      event.clientY - this.dragLast.y,
    );
    this.dragLast.set(event.clientX, event.clientY);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId === this.dragPointerId) this.dragPointerId = null;
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const orbit = this.subject.cameraRig.orbit;
    this.subject.cameraRig.setDistance(orbit.distance + event.deltaY * 0.008);
  };

  private readonly onBlur = (): void => this.pressed.clear();

  private bindInput(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  private unbindInput(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
  }

  private keyAction(code: string): InputAction | null {
    switch (code) {
      case "KeyW": return "forward";
      case "KeyS": return "backward";
      case "KeyA": return "left";
      case "KeyD": return "right";
      case "ShiftLeft":
      case "ShiftRight": return "run";
      case "Space": return "jump";
      case "ArrowLeft": return "cameraLeft";
      case "ArrowRight": return "cameraRight";
      case "ArrowUp": return "cameraUp";
      case "ArrowDown": return "cameraDown";
      default: return null;
    }
  }
}
