import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { Scene } from "@babylonjs/core/scene.js";
import type {
  BabylonNativeHostRandomV1,
  BabylonNativeSceneBuildContextV1,
} from "@whitebox-world/native-babylon";
import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";

interface SceneMaterials {
  readonly foregroundRocks: readonly StandardMaterial[];
  readonly mountainRocks: readonly StandardMaterial[];
  readonly pathStones: readonly StandardMaterial[];
  readonly wood: StandardMaterial;
  readonly roof: StandardMaterial;
  readonly foliage: readonly StandardMaterial[];
  readonly trunk: StandardMaterial;
  readonly cloud: StandardMaterial;
  readonly cloudBright: StandardMaterial;
  readonly waterfall: StandardMaterial;
  readonly sun: StandardMaterial;
  readonly collisionProxy: StandardMaterial;
}

// Preserved c312871 geometry values. These are not stream draws: both
// waterfalls used this index-derived shape, so keeping them out of the shared
// Host stream preserves every later authored random decision exactly.
const LEGACY_WATERFALL_STRAND_HEIGHT_RATIOS = Object.freeze([
  0.820000603601802,
  0.8739563582045957,
  0.9279121128073893,
] as const);

function standardMaterial(
  name: string,
  scene: Scene,
  diffuse: Color3,
  options: Readonly<{
    emissive?: Color3;
    specular?: Color3;
    alpha?: number;
    disableLighting?: boolean;
  }> = {},
): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = diffuse;
  material.specularColor = options.specular ?? new Color3(0.07, 0.08, 0.08);
  material.emissiveColor = options.emissive ?? Color3.Black();
  material.alpha = options.alpha ?? 1;
  material.disableLighting = options.disableLighting ?? false;
  material.backFaceCulling = options.alpha === undefined;
  if (material.alpha < 1) {
    material.needDepthPrePass = true;
    material.disableDepthWrite = true;
  }
  return material;
}

function createMaterials(scene: Scene): SceneMaterials {
  return {
    foregroundRocks: Object.freeze([
      standardMaterial("native.material.rock-wet", scene, new Color3(0.22, 0.25, 0.23)),
      standardMaterial("native.material.rock-slate", scene, new Color3(0.29, 0.32, 0.29)),
      standardMaterial("native.material.rock-moss", scene, new Color3(0.24, 0.31, 0.24)),
    ]),
    mountainRocks: Object.freeze([
      standardMaterial("native.material.crag-charcoal", scene, new Color3(0.15, 0.18, 0.18)),
      standardMaterial("native.material.crag-blue", scene, new Color3(0.20, 0.25, 0.26)),
      standardMaterial("native.material.crag-moss", scene, new Color3(0.19, 0.26, 0.20)),
    ]),
    pathStones: Object.freeze([
      standardMaterial("native.material.stair-dark", scene, new Color3(0.20, 0.22, 0.20)),
      standardMaterial("native.material.stair-mid", scene, new Color3(0.29, 0.30, 0.27)),
      standardMaterial("native.material.stair-light", scene, new Color3(0.35, 0.35, 0.31)),
    ]),
    wood: standardMaterial("native.material.gate-wood", scene, new Color3(0.22, 0.105, 0.045)),
    roof: standardMaterial(
      "native.material.gate-roof",
      scene,
      new Color3(0.085, 0.105, 0.10),
      { specular: new Color3(0.18, 0.20, 0.18) },
    ),
    foliage: Object.freeze([
      standardMaterial("native.material.pine-deep", scene, new Color3(0.035, 0.115, 0.075)),
      standardMaterial("native.material.pine-moss", scene, new Color3(0.075, 0.17, 0.095)),
    ]),
    trunk: standardMaterial("native.material.trunk", scene, new Color3(0.13, 0.075, 0.035)),
    cloud: standardMaterial(
      "native.material.cloud-shadow",
      scene,
      new Color3(0.63, 0.72, 0.75),
      { emissive: new Color3(0.24, 0.28, 0.29), alpha: 0.16, disableLighting: true },
    ),
    cloudBright: standardMaterial(
      "native.material.cloud-sunlit",
      scene,
      new Color3(0.92, 0.94, 0.91),
      { emissive: new Color3(0.36, 0.36, 0.32), alpha: 0.14, disableLighting: true },
    ),
    waterfall: standardMaterial(
      "native.material.waterfall",
      scene,
      new Color3(0.62, 0.78, 0.82),
      { emissive: new Color3(0.18, 0.27, 0.29), alpha: 0.62, disableLighting: true },
    ),
    sun: standardMaterial(
      "native.material.sun",
      scene,
      new Color3(1, 0.86, 0.56),
      { emissive: new Color3(1, 0.66, 0.23), disableLighting: true },
    ),
    collisionProxy: standardMaterial(
      "native.material.collision-proxy",
      scene,
      new Color3(1, 0.08, 0.55),
      { emissive: new Color3(0.5, 0.02, 0.2), alpha: 0.34, disableLighting: true },
    ),
  };
}

function createRampPrism(
  name: string,
  scene: Scene,
  material: StandardMaterial,
): Mesh {
  const crossSections: Array<Readonly<{
    halfWidthMeters: number;
    yMeters: number;
    zMeters: number;
  }>> = [];
  const slopeSectionCount = 24;
  for (let index = 0; index <= slopeSectionCount; index += 1) {
    const t = index / slopeSectionCount;
    const eased = t * t * (3 - 2 * t);
    crossSections.push({
      halfWidthMeters: 7 - t * 2,
      yMeters: 14 * eased,
      zMeters: 9 - 40 * t,
    });
  }
  crossSections.push(
    { halfWidthMeters: 5, yMeters: 14, zMeters: -37 },
    { halfWidthMeters: 5, yMeters: 14, zMeters: -48 },
  );
  const positions = crossSections.flatMap((section) => [
    -section.halfWidthMeters,
    section.yMeters,
    section.zMeters,
    section.halfWidthMeters,
    section.yMeters,
    section.zMeters,
  ]);
  const indices: number[] = [];
  for (let index = 0; index < crossSections.length - 1; index += 1) {
    const nearLeft = index * 2;
    const nearRight = nearLeft + 1;
    const farLeft = nearLeft + 2;
    const farRight = nearLeft + 3;
    indices.push(
      nearLeft,
      nearRight,
      farRight,
      nearLeft,
      farRight,
      farLeft,
    );
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh, false);
  mesh.material = material;
  return mesh;
}

function createCollisionProxies(
  context: BabylonNativeSceneBuildContextV1,
  materials: SceneMaterials,
): void {
  const foreground = MeshBuilder.CreateBox(
    "collision-foreground-platform",
    { width: 40, height: 3, depth: 29 },
    context.scene,
  );
  foreground.position.set(0, -1.5, 20.5);
  foreground.material = materials.collisionProxy;
  foreground.isVisible = false;
  foreground.visibility = 0;
  foreground.isPickable = false;

  const path = createRampPrism(
    "collision-primary-path",
    context.scene,
    materials.collisionProxy,
  );
  path.isVisible = false;
  path.visibility = 0;
  path.isPickable = false;

  const gatePlatform = MeshBuilder.CreateBox(
    "collision-gate-platform",
    { width: 28, height: 4, depth: 13 },
    context.scene,
  );
  gatePlatform.position.set(0, 11.7, -40.5);
  gatePlatform.material = materials.collisionProxy;
  gatePlatform.isVisible = false;
  gatePlatform.visibility = 0;
  gatePlatform.isPickable = false;

  context.registration.registerStaticCollider({
    id: "foreground-platform",
    mesh: foreground,
    traversalBinding: {
      kind: "static-surface",
      surfaceEntityId: "foreground-platform",
      logicalSubshapeId: "primary",
      traversalSurfaceProfileRef:
        "worldkit://traversal-surface-profile/ground.static@1",
    },
    frictionRatio: 0.92,
  });
  context.registration.registerStaticCollider({
    id: "primary-path",
    mesh: path,
    traversalBinding: {
      kind: "static-surface",
      surfaceEntityId: "primary-path",
      logicalSubshapeId: "primary",
      traversalSurfaceProfileRef:
        "worldkit://traversal-surface-profile/ground.static@1",
    },
    frictionRatio: 0.94,
  });
  context.registration.registerStaticCollider({
    id: "gate-platform",
    mesh: gatePlatform,
    traversalBinding: {
      kind: "static-surface",
      surfaceEntityId: "gate-platform",
      logicalSubshapeId: "primary",
      traversalSurfaceProfileRef:
        "worldkit://traversal-surface-profile/ground.static@1",
    },
    frictionRatio: 0.92,
  });
}

function createRockSlabs(
  scene: Scene,
  materials: SceneMaterials,
  random: BabylonNativeHostRandomV1,
): void {
  const foregroundBase = MeshBuilder.CreateCylinder(
    "foreground-cliff-mass",
    {
      height: 9,
      diameterTop: 38,
      diameterBottom: 45,
      tessellation: 11,
    },
    scene,
  );
  foregroundBase.position.set(0, -5.25, 20);
  foregroundBase.scaling.z = 0.78;
  foregroundBase.material = materials.foregroundRocks[0]!;
  foregroundBase.convertToFlatShadedMesh();

  for (let index = 0; index < 42; index += 1) {
    const angle = random.range(0, Math.PI * 2);
    const radius = Math.sqrt(random.nextRatio()) * 17;
    const x = Math.cos(angle) * radius;
    const z = 20 + Math.sin(angle) * radius * 0.68;
    if (z < 7 && Math.abs(x) < 8) continue;
    const slab = MeshBuilder.CreateBox(
      `foreground-stone-${String(index).padStart(2, "0")}`,
      {
        width: random.range(2.7, 6.5),
        height: random.range(0.16, 0.42),
        depth: random.range(2.4, 5.2),
      },
      scene,
    );
    slab.position.set(x, random.range(-0.28, -0.08), z);
    slab.rotation.y = random.range(-0.45, 0.45);
    slab.rotation.x = random.range(-0.035, 0.035);
    slab.rotation.z = random.range(-0.028, 0.028);
    slab.material = random.pick(materials.foregroundRocks);
  }

  for (let index = 0; index < 29; index += 1) {
    const t = index / 28;
    const z = 8 - 39.5 * t;
    const y = 14 * t * t * (3 - 2 * t);
    const width = 12.6 - t * 3.4;
    const slab = MeshBuilder.CreateBox(
      `ascent-stone-${String(index).padStart(2, "0")}`,
      {
        width: width * random.range(0.86, 1.06),
        height: random.range(0.28, 0.52),
        depth: random.range(1.55, 2.25),
      },
      scene,
    );
    slab.position.set(
      random.range(-0.32, 0.32),
      y - random.range(0.15, 0.25),
      z,
    );
    slab.rotation.y = random.range(-0.065, 0.065);
    slab.rotation.z = random.range(-0.018, 0.018);
    slab.material = random.pick(materials.pathStones);
  }

  const summit = MeshBuilder.CreateCylinder(
    "gate-summit-rock",
    {
      height: 15,
      diameterTop: 27,
      diameterBottom: 35,
      tessellation: 10,
    },
    scene,
  );
  summit.position.set(0, 5, -38);
  summit.scaling.z = 0.66;
  summit.material = materials.mountainRocks[1]!;
  summit.convertToFlatShadedMesh();

  for (let index = 0; index < 18; index += 1) {
    const slab = MeshBuilder.CreateBox(
      `summit-stone-${String(index).padStart(2, "0")}`,
      {
        width: random.range(3.2, 7.2),
        height: random.range(0.16, 0.38),
        depth: random.range(2.4, 5.5),
      },
      scene,
    );
    slab.position.set(
      random.range(-10, 10),
      13.85,
      random.range(-44, -33),
    );
    slab.rotation.y = random.range(-0.5, 0.5);
    slab.material = random.pick(materials.foregroundRocks);
  }
}

function createRockSpire(
  name: string,
  scene: Scene,
  materials: SceneMaterials,
  random: BabylonNativeHostRandomV1,
  position: readonly [number, number, number],
  height: number,
  radius: number,
): TransformNode {
  const root = new TransformNode(`${name}.root`, scene);
  root.position.set(...position);
  const segmentCount = 5;
  let accumulatedY = 0;
  let previousRadius = radius;
  for (let index = 0; index < segmentCount; index += 1) {
    const segmentHeight = height * (0.24 - index * 0.012);
    const topRadius = Math.max(radius * 0.11, previousRadius * random.range(0.58, 0.80));
    const mesh = MeshBuilder.CreateCylinder(
      index === 0 ? name : `${name}.segment-${index}`,
      {
        height: segmentHeight,
        diameterBottom: previousRadius * 2,
        diameterTop: topRadius * 2,
        tessellation: 7 + index % 3,
      },
      scene,
    );
    mesh.parent = root;
    mesh.position.set(
      random.range(-radius * 0.11, radius * 0.11),
      accumulatedY + segmentHeight / 2,
      random.range(-radius * 0.08, radius * 0.08),
    );
    mesh.scaling.x = random.range(0.82, 1.14);
    mesh.scaling.z = random.range(0.78, 1.08);
    mesh.rotation.y = random.range(-0.5, 0.5);
    mesh.rotation.z = random.range(-0.05, 0.05);
    mesh.material = random.pick(materials.mountainRocks);
    mesh.convertToFlatShadedMesh();
    accumulatedY += segmentHeight * 0.82;
    previousRadius = topRadius * 1.05;
  }
  return root;
}

function createTree(
  name: string,
  scene: Scene,
  materials: SceneMaterials,
  random: BabylonNativeHostRandomV1,
  position: readonly [number, number, number],
  scale: number,
): TransformNode {
  const root = new TransformNode(`${name}.root`, scene);
  root.position.set(...position);
  root.rotation.y = random.range(-Math.PI, Math.PI);
  const trunk = MeshBuilder.CreateCylinder(
    `${name}.trunk`,
    { height: 3.8 * scale, diameterTop: 0.34 * scale, diameterBottom: 0.58 * scale, tessellation: 7 },
    scene,
  );
  trunk.parent = root;
  trunk.position.y = 1.9 * scale;
  trunk.rotation.z = random.range(-0.08, 0.08);
  trunk.material = materials.trunk;
  for (let tier = 0; tier < 3; tier += 1) {
    const crown = MeshBuilder.CreateSphere(
      `${name}.crown-${tier}`,
      { diameter: (3.6 - tier * 0.45) * scale, segments: 7 },
      scene,
    );
    crown.parent = root;
    crown.position.set(
      random.range(-0.5, 0.5) * scale,
      (3.4 + tier * 0.8) * scale,
      random.range(-0.3, 0.3) * scale,
    );
    crown.scaling.y = 0.28;
    crown.scaling.x = random.range(1.0, 1.35);
    crown.scaling.z = random.range(0.75, 1.15);
    crown.material = materials.foliage[tier % materials.foliage.length]!;
    crown.convertToFlatShadedMesh();
  }
  return root;
}

function createMountainsAndTrees(
  scene: Scene,
  materials: SceneMaterials,
  random: BabylonNativeHostRandomV1,
): void {
  const spires = [
    ["mountain-left-primary", [-34, -9, -16], 47, 12],
    ["mountain-left-far", [-57, -13, -49], 58, 13],
    ["mountain-left-mid", [-49, -12, 12], 37, 10],
    ["mountain-right-primary", [35, -10, -20], 48, 12],
    ["mountain-right-far", [57, -15, -54], 61, 14],
    ["mountain-right-mid", [49, -14, 15], 39, 11],
    ["mountain-center-far", [-16, -13, -72], 44, 9],
    ["mountain-center-right-far", [20, -14, -78], 50, 10],
  ] as const;
  for (const [name, position, height, radius] of spires) {
    createRockSpire(
      name,
      scene,
      materials,
      random,
      position,
      height,
      radius,
    );
  }

  const trees = [
    ["pine-foreground-left", [-15, 0, 12], 1.15],
    ["pine-foreground-right", [16, 0, 11], 1.25],
    ["pine-summit-left", [-9, 14, -38], 0.9],
    ["pine-summit-right", [9, 14, -40], 0.8],
    ["pine-left-cliff", [-31, 13, -14], 1.1],
    ["pine-right-cliff", [34, 14, -19], 1.0],
    ["pine-left-far", [-55, 24, -51], 1.05],
    ["pine-right-far", [57, 26, -55], 1.05],
  ] as const;
  for (const [name, position, scale] of trees) {
    createTree(name, scene, materials, random, position, scale);
  }
}

function createGate(
  scene: Scene,
  materials: SceneMaterials,
): void {
  const gateRoot = new TransformNode("celestial-gate.root", scene);
  gateRoot.position.set(0, 14, -39);

  for (const x of [-6.2, 6.2]) {
    const pillar = MeshBuilder.CreateCylinder(
      `gate-pillar-${x < 0 ? "left" : "right"}`,
      { height: 10.8, diameterTop: 1.15, diameterBottom: 1.55, tessellation: 10 },
      scene,
    );
    pillar.parent = gateRoot;
    pillar.position.set(x, 5.4, 0);
    pillar.material = materials.wood;

    const stoneFoot = MeshBuilder.CreateBox(
      `gate-pillar-foot-${x < 0 ? "left" : "right"}`,
      { width: 2.5, height: 1.1, depth: 2.5 },
      scene,
    );
    stoneFoot.parent = gateRoot;
    stoneFoot.position.set(x, 0.55, 0);
    stoneFoot.material = materials.pathStones[1]!;
  }

  const mainBeam = MeshBuilder.CreateBox(
    "gate-main-beam",
    { width: 18.5, height: 1.35, depth: 1.7 },
    scene,
  );
  mainBeam.parent = gateRoot;
  mainBeam.position.y = 10.2;
  mainBeam.material = materials.wood;

  const upperBeam = MeshBuilder.CreateBox(
    "gate-upper-beam",
    { width: 12.5, height: 1.0, depth: 1.4 },
    scene,
  );
  upperBeam.parent = gateRoot;
  upperBeam.position.y = 13.1;
  upperBeam.material = materials.wood;

  for (const x of [-4.7, 4.7]) {
    const upperPillar = MeshBuilder.CreateBox(
      `gate-upper-pillar-${x < 0 ? "left" : "right"}`,
      { width: 0.85, height: 3.3, depth: 0.85 },
      scene,
    );
    upperPillar.parent = gateRoot;
    upperPillar.position.set(x, 11.9, 0);
    upperPillar.material = materials.wood;
  }

  const roofTiers = [
    ["gate-roof-lower", 10.95, 22.0, 2.8, 0.5],
    ["gate-roof-upper", 13.75, 16.0, 2.4, 0.45],
    ["gate-roof-ridge", 14.55, 9.5, 0.8, 0.65],
  ] as const;
  for (const [name, y, width, depth, height] of roofTiers) {
    const roof = MeshBuilder.CreateBox(
      name,
      { width, height, depth },
      scene,
    );
    roof.parent = gateRoot;
    roof.position.y = y;
    roof.material = materials.roof;
  }

  for (const x of [-10.4, 10.4, -7.5, 7.5]) {
    const tip = MeshBuilder.CreateCylinder(
      `gate-eave-tip-${String(x).replace("-", "left-")}`,
      { height: 1.8, diameterBottom: 0.7, diameterTop: 0.08, tessellation: 6 },
      scene,
    );
    tip.parent = gateRoot;
    tip.position.set(x, x > 0 ? 11.8 : 11.8, 0);
    tip.rotation.z = x < 0 ? -0.7 : 0.7;
    tip.material = materials.roof;
  }

  const plaque = MeshBuilder.CreateBox(
    "gate-plaque",
    { width: 4.2, height: 1.4, depth: 0.25 },
    scene,
  );
  plaque.parent = gateRoot;
  plaque.position.set(0, 8.4, 0.92);
  plaque.material = materials.roof;
}

function createCloudBank(
  name: string,
  scene: Scene,
  materials: SceneMaterials,
  random: BabylonNativeHostRandomV1,
  center: readonly [number, number, number],
  extent: readonly [number, number, number],
  count: number,
): void {
  for (let index = 0; index < count; index += 1) {
    const cloud = MeshBuilder.CreateSphere(
      index === 0 ? name : `${name}.${String(index).padStart(2, "0")}`,
      { diameter: 1, segments: 6 },
      scene,
    );
    cloud.position.set(
      center[0] + random.range(-extent[0], extent[0]),
      center[1] + random.range(-extent[1], extent[1]),
      center[2] + random.range(-extent[2], extent[2]),
    );
    cloud.scaling.set(
      random.range(6, 13),
      random.range(1.3, 3.5),
      random.range(4, 9),
    );
    cloud.material = index % 3 === 0
      ? materials.cloudBright
      : materials.cloud;
    cloud.isPickable = false;
  }
}

function createWaterfall(
  name: string,
  scene: Scene,
  material: StandardMaterial,
  position: readonly [number, number, number],
  width: number,
  height: number,
  yawRadians: number,
): void {
  const fall = MeshBuilder.CreatePlane(
    name,
    { width, height, sideOrientation: Mesh.DOUBLESIDE },
    scene,
  );
  fall.position.set(...position);
  fall.rotation.y = yawRadians;
  fall.material = material;
  fall.isPickable = false;

  for (let ribbon = 0; ribbon < 3; ribbon += 1) {
    const strand = MeshBuilder.CreatePlane(
      `${name}.strand-${ribbon}`,
      {
        width: width * 0.16,
        height: height * LEGACY_WATERFALL_STRAND_HEIGHT_RATIOS[ribbon]!,
        sideOrientation: Mesh.DOUBLESIDE,
      },
      scene,
    );
    strand.position.copyFrom(fall.position);
    strand.position.x += (ribbon - 1) * width * 0.26;
    strand.position.z += 0.03 * ribbon;
    strand.rotation.y = yawRadians;
    strand.material = material;
    strand.isPickable = false;
  }
}

function createAtmosphere(
  scene: Scene,
  materials: SceneMaterials,
  random: BabylonNativeHostRandomV1,
): void {
  scene.clearColor.copyFrom(new Color4(0.42, 0.55, 0.61, 1));
  scene.ambientColor.copyFrom(new Color3(0.26, 0.30, 0.30));

  const ambient = new HemisphericLight(
    "native-light-sky",
    new Vector3(0.1, 1, 0.15),
    scene,
  );
  ambient.intensity = 0.96;
  ambient.diffuse = new Color3(0.68, 0.76, 0.77);
  ambient.groundColor = new Color3(0.08, 0.105, 0.10);

  const sunLight = new DirectionalLight(
    "native-light-sun",
    new Vector3(-0.46, -0.82, 0.32),
    scene,
  );
  sunLight.position.set(45, 60, -85);
  sunLight.intensity = 2.15;
  sunLight.diffuse = new Color3(1, 0.83, 0.62);

  const sunGlow = new PointLight(
    "native-light-sun-glow",
    new Vector3(48, 48, -90),
    scene,
  );
  sunGlow.diffuse = new Color3(1, 0.62, 0.32);
  sunGlow.intensity = 28;
  sunGlow.range = 120;

  const cameraFill = new DirectionalLight(
    "native-light-camera-fill",
    new Vector3(0.08, -0.42, -1),
    scene,
  );
  cameraFill.intensity = 0.72;
  cameraFill.diffuse = new Color3(0.56, 0.67, 0.64);

  const sun = MeshBuilder.CreateSphere(
    "sun-disc",
    { diameter: 7, segments: 12 },
    scene,
  );
  sun.position.set(48, 48, -92);
  sun.material = materials.sun;
  sun.isPickable = false;

  createCloudBank(
    "cloud-bank-left",
    scene,
    materials,
    random,
    [-30, 3, -14],
    [24, 4, 35],
    24,
  );
  createCloudBank(
    "cloud-bank-right",
    scene,
    materials,
    random,
    [31, 4, -17],
    [25, 4, 38],
    25,
  );
  createCloudBank(
    "cloud-bank-distant",
    scene,
    materials,
    random,
    [0, 18, -92],
    [54, 8, 24],
    19,
  );

  createWaterfall(
    "waterfall-right-primary",
    scene,
    materials.waterfall,
    [35.5, 8.5, -14.5],
    3.4,
    22,
    -0.18,
  );
  createWaterfall(
    "waterfall-left-secondary",
    scene,
    materials.waterfall,
    [-33.5, 6, -14],
    2.3,
    17,
    0.22,
  );
}

export default defineBabylonNativeScene({
  kind: "babylon-native-scene-module",
  id: "cloud-ridge-native-spike",
  build(context: BabylonNativeSceneBuildContextV1): void {
    const scene = context.scene;
    const random = context.random;
    const materials = createMaterials(scene);

    createAtmosphere(scene, materials, random);
    createMountainsAndTrees(scene, materials, random);
    createRockSlabs(scene, materials, random);
    createGate(scene, materials);
    createCollisionProxies(context, materials);

    context.registration.registerSpawnMarker({
      id: "player-spawn",
      positionMetersXYZ: [0, 0, 18],
      facingRadians: 0,
    });
  },
});
