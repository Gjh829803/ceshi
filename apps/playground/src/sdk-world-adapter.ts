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
  createScalarRasterSampler,
  deriveWorldPlanArtifacts,
  FeatureRegistry,
  isTerrainSemanticLayerDescriptor,
  isTerrainSurface,
  type CompiledOutdoorScene,
  type DerivedWorldPlanArtifacts,
  type FeatureInspection as RegistryFeatureInspection,
  type LandmarkDescriptor,
  type LandmarkPrimitiveDescriptor,
  type OutdoorSceneDefinition,
  type OpeningCompositionGuide,
  type OutdoorWorldSpec,
  type TerrainSurface,
  type TerrainSemanticLayerDescriptor,
  type VisualPrototypeSpec,
  type WaterSurfaceDescriptor,
} from "@whitebox-world/world";
import * as THREE from "three";
import actionManifestJson from "../../../assets/humanoid/action-manifest.json";
import type {
  FeatureInspection,
  FixedInputStep,
  InputAction,
  OpeningCompositionReport,
  PlanningViewKind,
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

function whiteMaterial(color = WHITE, vertexColors = false): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    vertexColors,
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

function compileLandmark(descriptor: LandmarkDescriptor, color = 0xd9dad5): THREE.Object3D {
  if (descriptor.kind === "primitive") {
    const mesh = new THREE.Mesh(geometryForPrimitive(descriptor), whiteMaterial(color));
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
  for (const child of descriptor.children) group.add(compileLandmark(child, color));
  return group;
}

interface RuntimeTerrainLayer {
  descriptor: TerrainSemanticLayerDescriptor;
  sample: (u: number, v: number) => number;
  color: THREE.Color;
}

function tintObject(root: THREE.Object3D, color: string): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const tinted = materials.map((material) => {
      const clone = material.clone();
      if ("color" in clone && clone.color instanceof THREE.Color) clone.color.set(color);
      return clone;
    });
    object.material = Array.isArray(object.material) ? tinted : tinted[0] as THREE.Material;
  });
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
  private readonly worldSpec: OutdoorWorldSpec | null;
  private readonly planArtifacts: DerivedWorldPlanArtifacts | null;
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
  private readonly renderObjectsByBinding = new Map<string, THREE.Object3D[]>();
  private compositionCache: { dataUrl: string; report: OpeningCompositionReport } | null = null;
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
    this.worldSpec = scene.worldSpec ?? null;
    this.planArtifacts = scene.worldSpec === undefined ? null : deriveWorldPlanArtifacts(scene);
    this.rigStatus = visualResult.status;
    this.name = `sdk-runtime/${scene.definition.id}/${visualResult.status.source}`;
    this.world = new World({ fixedDeltaSeconds: FIXED_DELTA, scheduler: null });
    this.camera = new THREE.PerspectiveCamera(scene.spawn.camera.fovDegrees, 1, 0.1, 5_000);
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
        targetOffset: [0, scene.spawn.camera.targetHeight, 0],
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
    const playerColor = this.colorForBinding("runtime-entity", "player");
    if (playerColor !== undefined) tintObject(this.subject.root, playerColor);
    this.renderObjectsByBinding.set("runtime-entity:player", [this.subject.root]);

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
    this.compositionCache = null;
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
    this.compositionCache = null;
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

  captureCompositionMask(): string {
    return this.renderCompositionAnalysis()?.dataUrl ?? "";
  }

  analyzeOpeningComposition(): OpeningCompositionReport | null {
    return this.renderCompositionAnalysis()?.report ?? null;
  }

  async exportOpeningFrame(report?: OpeningCompositionReport): Promise<string> {
    if (this.worldSpec === null) throw new Error("WorldSpec is unavailable.");
    this.reset();
    const resolvedReport = report ?? this.analyzeOpeningComposition();
    if (resolvedReport === null) throw new Error("Opening composition guide is unavailable.");
    const response = await fetch("/__whitebox/write-opening-frame", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sceneId: this.worldSpec.id,
        dataUrl: this.captureOpeningFrameDataUrl(),
        report: resolvedReport,
      }),
    });
    if (!response.ok) throw new Error(`Failed to export opening frame: ${await response.text()}`);
    return (await response.json() as { path: string }).path;
  }

  private captureOpeningFrameDataUrl(): string {
    const guide = this.worldSpec?.entry.composition.guide;
    const aspect = guide?.aspectRatio ?? 16 / 9;
    const width = 1_280;
    const height = Math.round(width / aspect);
    const target = new THREE.WebGLRenderTarget(width, height, { depthBuffer: true });
    target.texture.colorSpace = THREE.SRGBColorSpace;
    const previousTarget = this.renderer.getRenderTarget();
    const previousAspect = this.camera.aspect;
    try {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.world.scene, this.camera);
      const pixels = new Uint8Array(width * height * 4);
      this.renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
      const flipped = new Uint8ClampedArray(pixels.length);
      for (let y = 0; y < height; y += 1) {
        const sourceOffset = (height - 1 - y) * width * 4;
        flipped.set(pixels.subarray(sourceOffset, sourceOffset + width * 4), y * width * 4);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("2D canvas is unavailable for opening-frame export.");
      context.putImageData(new ImageData(flipped, width, height), 0, 0);
      return canvas.toDataURL("image/png");
    } finally {
      this.renderer.setRenderTarget(previousTarget);
      this.camera.aspect = previousAspect;
      this.camera.updateProjectionMatrix();
      target.dispose();
      this.renderer.render(this.world.scene, this.camera);
    }
  }

  getWorldSpec(): OutdoorWorldSpec | null {
    return this.worldSpec;
  }

  getPlanArtifacts(): DerivedWorldPlanArtifacts | null {
    return this.planArtifacts;
  }

  capturePlanningView(kind: PlanningViewKind): string {
    if (this.worldSpec === null || this.planArtifacts === null) {
      throw new Error("This legacy scene has no WorldSpec planning artifacts.");
    }
    if (kind === "opening-shot") {
      this.reset();
      return this.canvas.toDataURL("image/png");
    }
    if (kind === "height-slope-plan") return this.captureHeightSlopePlan();
    return this.captureTopDownPlan();
  }

  getVisualPrototypes(): readonly VisualPrototypeSpec[] {
    return this.worldSpec?.entityCatalog.prototypes ?? [];
  }

  captureWhiteboxTriview(prototypeId: string): string {
    if (this.worldSpec === null) throw new Error("WorldSpec is unavailable.");
    const prototype = this.worldSpec.entityCatalog.prototypes.find((item) => item.id === prototypeId);
    if (prototype === undefined) throw new Error(`Unknown visual prototype ${prototypeId}.`);
    const instance = this.worldSpec.entityCatalog.instances.find(
      (item) => item.prototypeId === prototypeId,
    );
    if (instance === undefined) throw new Error(`Prototype ${prototypeId} has no bound instance.`);
    const key = `${instance.binding.kind}:${instance.binding.id}`;
    const targets = this.renderObjectsByBinding.get(key);
    if (targets === undefined || targets.length === 0) {
      throw new Error(`Prototype ${prototypeId} binding ${key} has no runtime renderable.`);
    }
    return this.captureTriview(targets, prototype.instanceColor);
  }

  async exportWhiteboxTriviews(): Promise<readonly string[]> {
    if (this.worldSpec === null) throw new Error("WorldSpec is unavailable.");
    const outputPaths: string[] = [];
    for (const prototype of this.worldSpec.entityCatalog.prototypes) {
      const response = await fetch("/__whitebox/write-triview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sceneId: this.worldSpec.id,
          prototypeId: prototype.id,
          dataUrl: this.captureWhiteboxTriview(prototype.id),
        }),
      });
      if (!response.ok) throw new Error(`Failed to export ${prototype.id}: ${await response.text()}`);
      const payload = await response.json() as { path: string };
      outputPaths.push(payload.path);
    }
    return outputPaths;
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
    const resources = this.registry.listResources();
    const layersByTerrain = new Map<string, RuntimeTerrainLayer[]>();
    for (const resource of resources) {
      if (resource.kind !== "semantic" || !isTerrainSemanticLayerDescriptor(resource.value)) continue;
      const descriptor = resource.value;
      const layers = layersByTerrain.get(descriptor.targetResourceId) ?? [];
      layers.push({
        descriptor,
        sample: createScalarRasterSampler(descriptor.field),
        color: new THREE.Color(descriptor.color),
      });
      layersByTerrain.set(descriptor.targetResourceId, layers);
    }
    for (const layers of layersByTerrain.values()) {
      layers.sort((left, right) => left.descriptor.priority - right.descriptor.priority);
    }

    for (const resource of resources) {
      let renderables: readonly THREE.Object3D[] = [];
      if (resource.kind === "terrain" && isTerrainSurface(resource.value)) {
        renderables = this.addTerrain(resource.value, resource.id, layersByTerrain.get(resource.id) ?? []);
      } else if (resource.kind === "surface" && isWaterSurface(resource.value)) {
        renderables = [this.addLake(resource.value, resource.id)];
      } else if (resource.kind === "landmark" && isLandmark(resource.value)) {
        renderables = [this.addLandmark(
          resource.value,
          resource.id,
          this.colorForBinding("feature", resource.ownerFeatureId),
        )];
      }
      if (renderables.length > 0) {
        const key = `feature:${resource.ownerFeatureId}`;
        const existing = this.renderObjectsByBinding.get(key) ?? [];
        existing.push(...renderables);
        this.renderObjectsByBinding.set(key, existing);
      }
    }
  }

  private renderCompositionAnalysis(): {
    dataUrl: string;
    report: OpeningCompositionReport;
  } | null {
    const guide = this.worldSpec?.entry.composition.guide;
    if (guide === undefined) return null;
    // A cached result is deterministic until reset or runtime input changes;
    // composition tooling explicitly calls reset before final acceptance.
    if (this.compositionCache !== null) return this.compositionCache;
    const [width, height] = guide.resolution;
    const target = new THREE.WebGLRenderTarget(width, height, {
      depthBuffer: true,
      stencilBuffer: false,
    });
    target.texture.colorSpace = THREE.SRGBColorSpace;
    const previousTarget = this.renderer.getRenderTarget();
    const previousBackground = this.world.scene.background;
    const previousFog = this.world.scene.fog;
    const previousAspect = this.camera.aspect;
    const replacements: Array<[THREE.Mesh, THREE.Material | THREE.Material[]]> = [];
    const temporaryMaterials: THREE.Material[] = [];
    try {
      this.world.scene.fog = null;
      const skyRegion = guide.regions.find((region) => region.semantic.includes("sky"));
      this.world.scene.background = new THREE.Color(skyRegion?.color ?? "#CFD5D5");
      this.world.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        replacements.push([object, object.material]);
        const original = Array.isArray(object.material) ? object.material[0] : object.material;
        const isWater = original instanceof THREE.ShaderMaterial && this.waterMaterials.has(original);
        const material = isWater
          ? new THREE.MeshBasicMaterial({
              color: object.userData.compositionColor as number | undefined ?? 0x378fbe,
              side: THREE.DoubleSide,
            })
          : object.geometry.hasAttribute("color")
            ? new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide })
            : new THREE.MeshBasicMaterial({
                color: original !== undefined && "color" in original && original.color instanceof THREE.Color
                  ? original.color
                  : new THREE.Color(WHITE),
                side: THREE.DoubleSide,
              });
        temporaryMaterials.push(material);
        object.material = material;
      });
      this.camera.aspect = guide.aspectRatio;
      this.camera.updateProjectionMatrix();
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.world.scene, this.camera);
      const pixels = new Uint8Array(width * height * 4);
      this.renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
      const flipped = new Uint8ClampedArray(pixels.length);
      for (let y = 0; y < height; y += 1) {
        const sourceOffset = (height - 1 - y) * width * 4;
        flipped.set(pixels.subarray(sourceOffset, sourceOffset + width * 4), y * width * 4);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("2D canvas is unavailable for composition analysis.");
      context.putImageData(new ImageData(flipped, width, height), 0, 0);
      const report = this.compareComposition(guide, flipped, width, height);
      this.compositionCache = { dataUrl: canvas.toDataURL("image/png"), report };
      return this.compositionCache;
    } finally {
      this.renderer.setRenderTarget(previousTarget);
      this.camera.aspect = previousAspect;
      this.camera.updateProjectionMatrix();
      this.world.scene.background = previousBackground;
      this.world.scene.fog = previousFog;
      for (const [mesh, material] of replacements) mesh.material = material;
      for (const material of temporaryMaterials) material.dispose();
      target.dispose();
      this.renderer.render(this.world.scene, this.camera);
    }
  }

  private compareComposition(
    guide: OpeningCompositionGuide,
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
  ): OpeningCompositionReport {
    const parseColor = (value: string): readonly [number, number, number] => {
      const hex = Number.parseInt(value.slice(1), 16);
      return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
    };
    const insidePolygon = (
      point: readonly [number, number],
      polygon: readonly (readonly [number, number])[],
    ) => {
      let inside = false;
      for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
        const a = polygon[current] as readonly [number, number];
        const b = polygon[previous] as readonly [number, number];
        if (
          (a[1] > point[1]) !== (b[1] > point[1]) &&
          point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
        ) inside = !inside;
      }
      return inside;
    };
    const regionMetrics = guide.regions.map((region) => {
      const color = parseColor(region.color);
      let intersection = 0;
      let union = 0;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const offset = (y * width + x) * 4;
          const desired = insidePolygon([(x + 0.5) / width, (y + 0.5) / height], region.polygon);
          const distance = Math.hypot(
            (pixels[offset] ?? 0) - color[0],
            (pixels[offset + 1] ?? 0) - color[1],
            (pixels[offset + 2] ?? 0) - color[2],
          );
          const observed = distance <= 38;
          if (desired && observed) intersection += 1;
          if (desired || observed) union += 1;
        }
      }
      const iou = union === 0 ? 0 : intersection / union;
      return { id: region.id, iou, minimumIou: region.minimumIou, pass: iou >= region.minimumIou };
    });
    const anchorMetrics = guide.anchors.map((anchor) => {
      const targets = this.renderObjectsByBinding.get(`${anchor.binding.kind}:${anchor.binding.id}`) ?? [];
      const bounds = new THREE.Box3();
      for (const object of targets) {
        object.updateWorldMatrix(true, true);
        bounds.expandByObject(object, true);
      }
      let observedCenter: readonly [number, number] | null = null;
      let observedSize: readonly [number, number] | null = null;
      if (!bounds.isEmpty()) {
        const points = [
          [bounds.min.x, bounds.min.y, bounds.min.z], [bounds.max.x, bounds.min.y, bounds.min.z],
          [bounds.min.x, bounds.max.y, bounds.min.z], [bounds.max.x, bounds.max.y, bounds.min.z],
          [bounds.min.x, bounds.min.y, bounds.max.z], [bounds.max.x, bounds.min.y, bounds.max.z],
          [bounds.min.x, bounds.max.y, bounds.max.z], [bounds.max.x, bounds.max.y, bounds.max.z],
        ].map((point) => new THREE.Vector3(...point as [number, number, number]).project(this.camera));
        const minimumX = Math.min(...points.map((point) => point.x));
        const maximumX = Math.max(...points.map((point) => point.x));
        const minimumY = Math.min(...points.map((point) => point.y));
        const maximumY = Math.max(...points.map((point) => point.y));
        observedCenter = [(minimumX + maximumX + 2) / 4, (2 - minimumY - maximumY) / 4];
        observedSize = [(maximumX - minimumX) / 2, (maximumY - minimumY) / 2];
      }
      const centerError = observedCenter === null
        ? Number.POSITIVE_INFINITY
        : Math.hypot(observedCenter[0] - anchor.center[0], observedCenter[1] - anchor.center[1]);
      const sizeError = anchor.size === undefined || observedSize === null
        ? 0
        : Math.hypot(observedSize[0] - anchor.size[0], observedSize[1] - anchor.size[1]) * 0.5;
      const error = centerError + sizeError;
      return {
        id: anchor.id,
        expectedCenter: anchor.center,
        observedCenter,
        ...(anchor.size === undefined ? {} : { expectedSize: anchor.size }),
        observedSize,
        error,
        tolerance: anchor.tolerance,
        pass: error <= anchor.tolerance,
      };
    });
    const scores = [
      ...regionMetrics.map((metric) => Math.min(1, metric.iou / Math.max(1e-6, metric.minimumIou))),
      ...anchorMetrics.map((metric) => Math.max(0, 1 - metric.error / metric.tolerance)),
    ];
    const score = scores.reduce((sum, value) => sum + value, 0) / Math.max(1, scores.length);
    return {
      score,
      minimumScore: guide.minimumScore,
      pass: score >= guide.minimumScore &&
        regionMetrics.every((metric) => metric.pass) &&
        anchorMetrics.every((metric) => metric.pass),
      regions: regionMetrics,
      anchors: anchorMetrics,
    };
  }

  private colorForBinding(kind: "feature" | "runtime-entity", id: string): string | undefined {
    if (this.worldSpec === null) return undefined;
    const instance = this.worldSpec.entityCatalog.instances.find(
      (item) => item.binding.kind === kind && item.binding.id === id,
    );
    if (instance === undefined) return undefined;
    return this.worldSpec.entityCatalog.prototypes.find(
      (item) => item.id === instance.prototypeId,
    )?.instanceColor;
  }

  private captureTopDownPlan(): string {
    if (this.worldSpec === null) throw new Error("WorldSpec is unavailable.");
    const bounds = this.worldSpec.bounds;
    const pixelWidth = Math.max(1, this.canvas.width);
    const pixelHeight = Math.max(1, this.canvas.height);
    const viewportAspect = pixelWidth / pixelHeight;
    const worldAspect = bounds.size[0] / bounds.size[1];
    const halfWidth = worldAspect > viewportAspect
      ? bounds.size[0] / 2
      : (bounds.size[1] * viewportAspect) / 2;
    const halfHeight = worldAspect > viewportAspect
      ? bounds.size[0] / viewportAspect / 2
      : bounds.size[1] / 2;
    const camera = new THREE.OrthographicCamera(
      -halfWidth,
      halfWidth,
      halfHeight,
      -halfHeight,
      0.1,
      Math.max(2_000, bounds.size[0] + bounds.size[1]),
    );
    camera.position.set(
      bounds.center[0],
      bounds.heightRange[1] + Math.max(bounds.size[0], bounds.size[1]),
      bounds.center[1],
    );
    camera.up.set(0, 0, -1);
    camera.lookAt(bounds.center[0], 0, bounds.center[1]);
    camera.updateProjectionMatrix();
    this.renderer.render(this.world.scene, camera);
    const result = this.canvas.toDataURL("image/png");
    this.renderer.render(this.world.scene, this.camera);
    return result;
  }

  private captureHeightSlopePlan(): string {
    if (this.planArtifacts === null) throw new Error("Planning artifacts are unavailable.");
    const artifact = this.planArtifacts.heightSlope;
    const canvas = document.createElement("canvas");
    canvas.width = artifact.grid.columns;
    canvas.height = artifact.grid.rows;
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("2D canvas is unavailable.");
    const image = context.createImageData(canvas.width, canvas.height);
    const heightRange = Math.max(
      1e-6,
      artifact.stats.maximumHeight - artifact.stats.minimumHeight,
    );
    for (let index = 0; index < artifact.grid.heights.length; index += 1) {
      const height = artifact.grid.heights[index];
      const slope = artifact.grid.slopesDegrees[index];
      const offset = index * 4;
      if (height == null || slope == null) {
        image.data.set([20, 24, 28, 255], offset);
        continue;
      }
      const elevation = (height - artifact.stats.minimumHeight) / heightRange;
      const brightness = 0.65 + elevation * 0.35;
      const base = slope <= 35
        ? [66, 145, 82]
        : slope <= 42
          ? [222, 174, 61]
          : [204, 68, 62];
      image.data[offset] = Math.round((base[0] ?? 0) * brightness);
      image.data[offset + 1] = Math.round((base[1] ?? 0) * brightness);
      image.data[offset + 2] = Math.round((base[2] ?? 0) * brightness);
      image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL("image/png");
  }

  private captureTriview(targets: readonly THREE.Object3D[], instanceColor: string): string {
    const targetMeshes = new Set<THREE.Mesh>();
    const bounds = new THREE.Box3();
    for (const target of targets) {
      target.updateWorldMatrix(true, true);
      bounds.expandByObject(target, true);
      target.traverse((object) => {
        if (object instanceof THREE.Mesh) targetMeshes.add(object);
      });
    }
    if (bounds.isEmpty() || targetMeshes.size === 0) {
      throw new Error("Whitebox tri-view target has no visible mesh bounds.");
    }

    const visibility = new Map<THREE.Mesh, boolean>();
    const materials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const identityMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(instanceColor) });
    this.world.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      visibility.set(object, object.visible);
      object.visible = targetMeshes.has(object);
      if (targetMeshes.has(object)) {
        materials.set(object, object.material);
        object.material = identityMaterial;
      }
    });

    const previousBackground = this.world.scene.background;
    const previousFog = this.world.scene.fog;
    // WebGLRenderer viewport/scissor coordinates use logical renderer size;
    // canvas.width/height are drawing-buffer pixels and include pixel ratio.
    const rendererSize = this.renderer.getSize(new THREE.Vector2());
    const width = Math.max(3, Math.floor(rendererSize.x));
    const height = Math.max(1, Math.floor(rendererSize.y));
    const panelWidth = Math.floor(width / 3);
    const panelAspect = panelWidth / height;
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const distance = Math.max(size.x, size.y, size.z, 1) * 3;
    const views = [
      { direction: new THREE.Vector3(0, 0, -1), horizontalSize: size.x },
      { direction: new THREE.Vector3(1, 0, 0), horizontalSize: size.z },
      { direction: new THREE.Vector3(0, 0, 1), horizontalSize: size.x },
    ];

    try {
      this.world.scene.background = new THREE.Color(0xf1f1ed);
      this.world.scene.fog = null;
      this.renderer.setScissorTest(true);
      this.renderer.clear();
      for (let index = 0; index < views.length; index += 1) {
        const view = views[index];
        if (view === undefined) continue;
        const halfHeight = Math.max(
          size.y * 0.58,
          (view.horizontalSize * 0.58) / Math.max(panelAspect, 0.01),
          0.5,
        );
        const halfWidth = halfHeight * panelAspect;
        const camera = new THREE.OrthographicCamera(
          -halfWidth,
          halfWidth,
          halfHeight,
          -halfHeight,
          0.01,
          distance * 4,
        );
        camera.position.copy(center).addScaledVector(view.direction, distance);
        camera.up.set(0, 1, 0);
        camera.lookAt(center);
        camera.updateProjectionMatrix();
        const x = index * panelWidth;
        const currentWidth = index === 2 ? width - x : panelWidth;
        this.renderer.setViewport(x, 0, currentWidth, height);
        this.renderer.setScissor(x, 0, currentWidth, height);
        this.renderer.render(this.world.scene, camera);
      }
      return this.canvas.toDataURL("image/png");
    } finally {
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, width, height);
      this.world.scene.background = previousBackground;
      this.world.scene.fog = previousFog;
      for (const [mesh, material] of materials) mesh.material = material;
      for (const [mesh, wasVisible] of visibility) mesh.visible = wasVisible;
      identityMaterial.dispose();
      this.renderer.render(this.world.scene, this.camera);
    }
  }

  private addTerrain(
    terrain: TerrainSurface,
    resourceId: string,
    semanticLayers: readonly RuntimeTerrainLayer[],
  ): readonly THREE.Object3D[] {
    const renderables: THREE.Object3D[] = [];
    let tileIndex = 0;
    terrain.forEachHeightfield((heightfield) => {
      const id = `${resourceId}:tile:${tileIndex}`;
      tileIndex += 1;
      // Derive edge normals from the complete surface, not from one tile, so
      // adjacent meshes receive identical lighting along their shared border.
      const geometry = heightfield.toBufferGeometry(terrain);
      if (semanticLayers.length > 0) {
        const positions = geometry.getAttribute("position");
        const colors = new Float32Array(positions.count * 3);
        const base = new THREE.Color(WHITE);
        for (let vertex = 0; vertex < positions.count; vertex += 1) {
          const x = positions.getX(vertex);
          const z = positions.getZ(vertex);
          const color = base.clone();
          for (const layer of semanticLayers) {
            const minimumX = layer.descriptor.bounds.center[0] - layer.descriptor.bounds.size[0] / 2;
            const minimumZ = layer.descriptor.bounds.center[1] - layer.descriptor.bounds.size[1] / 2;
            const u = (x - minimumX) / layer.descriptor.bounds.size[0];
            const v = (z - minimumZ) / layer.descriptor.bounds.size[1];
            if (u < 0 || u > 1 || v < 0 || v > 1) continue;
            color.lerp(layer.color, Math.max(0, Math.min(1, layer.sample(u, v))));
          }
          colors.set([color.r, color.g, color.b], vertex * 3);
        }
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      }
      const mesh = new THREE.Mesh(geometry, whiteMaterial(WHITE, semanticLayers.length > 0));
      mesh.name = id;
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      addOwnedRenderable(this.world, id, mesh);
      renderables.push(mesh);
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
    return renderables;
  }

  private addLake(descriptor: WaterSurfaceDescriptor, resourceId: string): THREE.Object3D {
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
    water.userData.compositionColor = descriptor.style.deepColor;
    water.position.y = descriptor.elevation;
    water.receiveShadow = true;
    addOwnedRenderable(this.world, resourceId, water);
    return water;
  }

  private addLandmark(
    descriptor: LandmarkDescriptor,
    resourceId: string,
    instanceColor?: string,
  ): THREE.Object3D {
    const landmark = compileLandmark(
      descriptor,
      instanceColor === undefined ? 0xd9dad5 : new THREE.Color(instanceColor).getHex(),
    );
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
    return landmark;
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
