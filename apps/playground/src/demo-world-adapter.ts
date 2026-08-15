import * as THREE from "three";
import type {
  FeatureInspection,
  FixedInputStep,
  InputAction,
  PlaygroundWorldAdapter,
  WorldSnapshot,
} from "./playground-world.js";

const FIXED_DELTA = 1 / 60;
const TERRAIN_SIZE = 160;
const TERRAIN_SEGMENTS = 128;
const PLAYER_SPAWN = new THREE.Vector3(0, 0, 42);
const LAKE_CENTER = new THREE.Vector2(0, 2);
const LAKE_RADIUS = new THREE.Vector2(25, 18);
const UP = new THREE.Vector3(0, 1, 0);

interface PlayerState {
  position: THREE.Vector3;
  rotationY: number;
  action: "idle" | "walk" | "run";
  grounded: boolean;
}

function terrainHeight(x: number, z: number): number {
  const broad = Math.sin(x * 0.055) * 3.2 + Math.cos(z * 0.044) * 2.8;
  const detail = Math.sin((x + z) * 0.095) * 1.15;
  const radial = Math.hypot(x * 0.015, z * 0.012) * 1.35;
  const nx = (x - LAKE_CENTER.x) / LAKE_RADIUS.x;
  const nz = (z - LAKE_CENTER.y) / LAKE_RADIUS.y;
  const lakeDistance = Math.sqrt(nx * nx + nz * nz);
  const basin = THREE.MathUtils.smoothstep(1 - lakeDistance, 0, 0.78) * 7.2;
  return broad + detail + radial - basin;
}

function whiteMaterial(color = 0xe7e8e3): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.88,
    metalness: 0,
    flatShading: false,
  });
}

function createTerrain(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(
    TERRAIN_SIZE,
    TERRAIN_SIZE,
    TERRAIN_SEGMENTS,
    TERRAIN_SEGMENTS,
  );
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    positions.setY(index, terrainHeight(positions.getX(index), positions.getZ(index)));
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  const terrain = new THREE.Mesh(geometry, whiteMaterial());
  terrain.name = "terrain-main";
  terrain.receiveShadow = true;
  terrain.castShadow = true;
  return terrain;
}

function createLake(): THREE.Mesh {
  const geometry = new THREE.CircleGeometry(1, 96);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({
    color: 0xb9c6c8,
    roughness: 0.42,
    metalness: 0.08,
    transparent: true,
    opacity: 0.82,
  });
  const lake = new THREE.Mesh(geometry, material);
  lake.name = "lake-water-surface";
  lake.position.set(LAKE_CENTER.x, -3.1, LAKE_CENTER.y);
  lake.scale.set(LAKE_RADIUS.x, 1, LAKE_RADIUS.y);
  lake.receiveShadow = true;
  return lake;
}

function createTower(): THREE.Group {
  const tower = new THREE.Group();
  tower.name = "northern-watchtower";
  const material = whiteMaterial(0xd9dad5);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 6.2, 15, 10), material);
  base.position.y = 7.5;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(7, 5.2, 4, 10), material);
  crown.position.y = 17;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(8, 8, 10), material);
  roof.position.y = 23;
  const gate = new THREE.Mesh(new THREE.BoxGeometry(3, 5.5, 1), whiteMaterial(0xbfc2bc));
  gate.position.set(0, 2.75, 5.7);
  for (const mesh of [base, crown, roof, gate]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    tower.add(mesh);
  }
  const x = -40;
  const z = -44;
  tower.position.set(x, terrainHeight(x, z), z);
  return tower;
}

function createHumanoidProxy(): THREE.Group {
  const humanoid = new THREE.Group();
  humanoid.name = "humanoid-third-person-preview";
  const material = whiteMaterial(0xf2f2ed);
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.34, 0.36), material);
  hips.position.y = 1.02;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.55, 4, 8), material);
  torso.position.y = 1.48;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), material);
  head.position.y = 2.08;
  const limbGeometry = new THREE.CapsuleGeometry(0.105, 0.62, 3, 6);
  const leftArm = new THREE.Mesh(limbGeometry, material);
  leftArm.position.set(-0.48, 1.48, 0);
  const rightArm = leftArm.clone();
  rightArm.position.x = 0.48;
  const leftLeg = new THREE.Mesh(limbGeometry, material);
  leftLeg.position.set(-0.18, 0.48, 0);
  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.18;
  for (const mesh of [hips, torso, head, leftArm, rightArm, leftLeg, rightLeg]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    humanoid.add(mesh);
  }
  humanoid.userData.limbs = { leftArm, rightArm, leftLeg, rightLeg };
  return humanoid;
}

function isInsideLake(x: number, z: number, margin = 1.4): boolean {
  const nx = (x - LAKE_CENTER.x) / (LAKE_RADIUS.x + margin);
  const nz = (z - LAKE_CENTER.y) / (LAKE_RADIUS.y + margin);
  return nx * nx + nz * nz < 1;
}

export class DemoWorldAdapter implements PlaygroundWorldAdapter {
  readonly name = "three-demo-adapter";
  readonly canvas: HTMLCanvasElement;

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(56, 1, 0.1, 500);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly clock = new THREE.Clock();
  private readonly playerObject = createHumanoidProxy();
  private readonly listeners = new Set<(snapshot: WorldSnapshot) => void>();
  private readonly pressed = new Set<InputAction>();
  private readonly features: readonly FeatureInspection[];
  private readonly resizeObserver: ResizeObserver;
  private player: PlayerState = {
    position: PLAYER_SPAWN.clone(),
    rotationY: Math.PI,
    action: "idle",
    grounded: true,
  };
  private frame = 0;
  private tick = 0;
  private paused = false;
  private disposed = false;
  private accumulator = 0;
  private cameraYaw = 0;
  private cameraPitch = 0.34;
  private cameraDistance = 8.5;
  private dragPointerId: number | null = null;
  private dragLast = new THREE.Vector2();
  private fps = 0;
  private fpsFrames = 0;
  private fpsElapsed = 0;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.canvas = this.renderer.domElement;
    this.canvas.className = "world-canvas";
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(0xcfd5d5);
    this.scene.fog = new THREE.Fog(0xcfd5d5, 95, 205);

    const terrain = createTerrain();
    const lake = createLake();
    const tower = createTower();
    this.scene.add(terrain, lake, tower, this.playerObject);

    const hemi = new THREE.HemisphereLight(0xf8fbff, 0x6d736f, 1.55);
    const sun = new THREE.DirectionalLight(0xfff1cf, 2.6);
    sun.position.set(-34, 50, 22);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 70;
    sun.shadow.camera.bottom = -70;
    this.scene.add(hemi, sun);

    this.features = [
      {
        id: "rolling-grassland",
        type: "official.rolling-terrain",
        version: 1,
        seed: 42,
        status: "ready",
        parameters: { size: [160, 160], hillHeight: 7.5, resolution: 128 },
        resources: [
          {
            id: "terrain-main",
            kind: "mesh",
            vertices: (TERRAIN_SEGMENTS + 1) ** 2,
          },
          { id: "terrain-semantic", kind: "semantic" },
          { id: "terrain-collider-contract", kind: "collider" },
        ],
        diagnostics: [],
      },
      {
        id: "central-lake",
        type: "custom.natural-lake",
        version: 1,
        seed: 42,
        status: "ready",
        parameters: {
          center: [LAKE_CENTER.x, LAKE_CENTER.y],
          radius: [LAKE_RADIUS.x, LAKE_RADIUS.y],
          waterLevel: -3.1,
        },
        resources: [
          { id: "lake-water-surface", kind: "surface", vertices: 98 },
          { id: "lake-semantic", kind: "semantic" },
        ],
        diagnostics: [],
      },
      {
        id: "northern-watchtower",
        type: "official.compound-landmark",
        version: 1,
        status: "ready",
        parameters: { position: [-40, 0, -44], height: 27, collision: true },
        resources: [
          { id: "tower-compound-mesh", kind: "mesh", vertices: 238 },
          { id: "tower-collider-contract", kind: "collider" },
          { id: "tower-semantic", kind: "semantic" },
        ],
        diagnostics: [],
      },
    ];

    this.player.position.y = terrainHeight(this.player.position.x, this.player.position.z);
    this.syncPlayerObject(0);
    this.updateCamera(true);
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
    this.player = {
      position: PLAYER_SPAWN.clone(),
      rotationY: Math.PI,
      action: "idle",
      grounded: true,
    };
    this.player.position.y = terrainHeight(this.player.position.x, this.player.position.z);
    this.cameraYaw = 0;
    this.cameraPitch = 0.34;
    this.cameraDistance = 8.5;
    this.tick = 0;
    this.accumulator = 0;
    this.pressed.clear();
    this.syncPlayerObject(0);
    this.updateCamera(true);
    this.render();
    this.emit();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
    this.frame += 1;
  }

  async runFixedInput(steps: readonly FixedInputStep[]): Promise<WorldSnapshot> {
    const wasPaused = this.paused;
    this.paused = true;
    this.pressed.clear();
    for (const step of steps) {
      const ticks = Math.max(0, Math.floor(step.ticks));
      const actions = new Set(step.actions);
      for (let tick = 0; tick < ticks; tick += 1) {
        this.fixedUpdate(actions, FIXED_DELTA);
      }
    }
    this.pressed.clear();
    this.player.action = "idle";
    this.syncPlayerObject(0);
    this.updateCamera(true);
    this.render();
    this.paused = wasPaused;
    this.emit();
    return this.snapshot();
  }

  captureScreenshot(): string {
    this.render();
    return this.canvas.toDataURL("image/png");
  }

  inspectFeatures(): readonly FeatureInspection[] {
    return this.features;
  }

  snapshot(): WorldSnapshot {
    const position = this.player.position;
    return {
      adapter: this.name,
      frame: this.frame,
      tick: this.tick,
      paused: this.paused,
      player: {
        entityId: "player-humanoid",
        action: this.player.action,
        grounded: this.player.grounded,
        position: [position.x, position.y, position.z],
        rotationY: this.player.rotationY,
      },
      camera: {
        position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
        yaw: this.cameraYaw,
        pitch: this.cameraPitch,
        distance: this.cameraDistance,
      },
      features: this.features,
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
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });
    this.renderer.dispose();
  }

  private animate(): void {
    if (this.disposed) return;
    const delta = Math.min(this.clock.getDelta(), 0.1);
    this.fpsElapsed += delta;
    this.fpsFrames += 1;
    if (this.fpsElapsed >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsElapsed);
      this.fpsFrames = 0;
      this.fpsElapsed = 0;
    }

    if (!this.paused) {
      this.accumulator += delta;
      while (this.accumulator >= FIXED_DELTA) {
        this.fixedUpdate(this.pressed, FIXED_DELTA);
        this.accumulator -= FIXED_DELTA;
      }
    }
    this.updateCamera(false);
    this.render();
    if (this.frame % 10 === 0) this.emit();
  }

  private fixedUpdate(actions: ReadonlySet<InputAction>, delta: number): void {
    if (actions.has("cameraLeft")) this.cameraYaw += delta * 1.35;
    if (actions.has("cameraRight")) this.cameraYaw -= delta * 1.35;
    if (actions.has("cameraUp")) {
      this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch + delta * 1.35, 0.08, 1.05);
    }
    if (actions.has("cameraDown")) {
      this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch - delta * 1.35, 0.08, 1.05);
    }

    const forwardAmount = Number(actions.has("forward")) - Number(actions.has("backward"));
    const rightAmount = Number(actions.has("right")) - Number(actions.has("left"));
    const input = new THREE.Vector2(rightAmount, forwardAmount);
    const moving = input.lengthSq() > 0;
    const running = moving && actions.has("run");
    this.player.action = moving ? (running ? "run" : "walk") : "idle";

    if (moving) {
      input.normalize();
      const cameraForward = new THREE.Vector3(
        -Math.sin(this.cameraYaw),
        0,
        -Math.cos(this.cameraYaw),
      );
      const cameraRight = new THREE.Vector3().crossVectors(cameraForward, UP).negate();
      const velocity = cameraForward
        .multiplyScalar(input.y)
        .add(cameraRight.multiplyScalar(input.x))
        .normalize()
        .multiplyScalar(running ? 8.2 : 4.2);
      const candidate = this.player.position.clone().addScaledVector(velocity, delta);
      candidate.x = THREE.MathUtils.clamp(candidate.x, -76, 76);
      candidate.z = THREE.MathUtils.clamp(candidate.z, -76, 76);

      const towerDistance = Math.hypot(candidate.x + 40, candidate.z + 44);
      if (!isInsideLake(candidate.x, candidate.z) && towerDistance > 6.5) {
        this.player.position.copy(candidate);
      }
      this.player.rotationY = Math.atan2(velocity.x, velocity.z);
    }

    this.player.position.y = terrainHeight(this.player.position.x, this.player.position.z);
    this.player.grounded = true;
    this.tick += 1;
    this.syncPlayerObject(moving ? this.tick * (running ? 0.24 : 0.14) : 0);
  }

  private syncPlayerObject(gaitPhase: number): void {
    this.playerObject.position.copy(this.player.position);
    this.playerObject.rotation.y = this.player.rotationY;
    const limbs = this.playerObject.userData.limbs as {
      leftArm: THREE.Object3D;
      rightArm: THREE.Object3D;
      leftLeg: THREE.Object3D;
      rightLeg: THREE.Object3D;
    };
    const swing = this.player.action === "idle" ? 0 : Math.sin(gaitPhase) * 0.55;
    limbs.leftArm.rotation.x = swing;
    limbs.rightArm.rotation.x = -swing;
    limbs.leftLeg.rotation.x = -swing;
    limbs.rightLeg.rotation.x = swing;
  }

  private updateCamera(immediate: boolean): void {
    const target = this.player.position.clone().add(new THREE.Vector3(0, 1.45, 0));
    const horizontal = Math.cos(this.cameraPitch) * this.cameraDistance;
    const desired = new THREE.Vector3(
      target.x + Math.sin(this.cameraYaw) * horizontal,
      target.y + Math.sin(this.cameraPitch) * this.cameraDistance,
      target.z + Math.cos(this.cameraYaw) * horizontal,
    );
    const minimumY = terrainHeight(desired.x, desired.z) + 0.45;
    desired.y = Math.max(desired.y, minimumY);
    this.camera.position.lerp(desired, immediate ? 1 : 0.14);
    this.camera.lookAt(target);
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
    if (event.repeat) return;
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
    const dx = event.clientX - this.dragLast.x;
    const dy = event.clientY - this.dragLast.y;
    this.dragLast.set(event.clientX, event.clientY);
    this.cameraYaw -= dx * 0.006;
    this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch + dy * 0.004, 0.08, 1.05);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId === this.dragPointerId) this.dragPointerId = null;
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.cameraDistance = THREE.MathUtils.clamp(
      this.cameraDistance + event.deltaY * 0.008,
      4.5,
      14,
    );
  };

  private readonly onBlur = (): void => {
    this.pressed.clear();
  };

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
      case "KeyW":
        return "forward";
      case "KeyS":
        return "backward";
      case "KeyA":
        return "left";
      case "KeyD":
        return "right";
      case "ShiftLeft":
      case "ShiftRight":
        return "run";
      case "ArrowLeft":
        return "cameraLeft";
      case "ArrowRight":
        return "cameraRight";
      case "ArrowUp":
        return "cameraUp";
      case "ArrowDown":
        return "cameraDown";
      default:
        return null;
    }
  }
}
