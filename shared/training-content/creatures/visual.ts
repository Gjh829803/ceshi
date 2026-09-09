import * as T from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { VehicleSpec } from '../config';
import { CREATURE_ASSETS, type CreatureModelKind } from './manifest';
import { resolveTrainingResource } from '../assets/resources';

export interface CreatureRenderFrame {
  position: T.Vector3;
  rotation: T.Quaternion;
  speed: number;
  steering: number;
  grounded: boolean;
  time: number;
  gait: string;
  phase: number;
  flying: boolean;
  leadPosition?: T.Vector3|undefined;
  leadYaw?: number|undefined;
}
export interface CreatureSourceStatus {
  state: 'placeholder' | 'loading' | 'imported' | 'fallback';
  kind: CreatureModelKind;
  url: string;
  message?: string;
  clip?: string;
}
export interface CreatureVisual {
  content: T.Group;
  seat: T.Group;
  sourceStatus: CreatureSourceStatus;
  update(frame: CreatureRenderFrame, dt: number): void;
  load(): Promise<void>;
  dispose(): void;
}
interface ProceduralRig { root: T.Group; animate(frame: CreatureRenderFrame): void }
interface PreparedSource { scene: T.Group; clips: T.AnimationClip[]; bounds: T.Box3 }
const sourceCache = new Map<CreatureModelKind, Promise<PreparedSource>>();
const UP = new T.Vector3(0, 1, 0);

const surface = (color: string, roughness = .8) => new T.MeshStandardMaterial({ color, roughness, metalness: .03 });
function mesh(parent: T.Object3D, geometry: T.BufferGeometry, material: T.Material, position: readonly number[] = [0, 0, 0]) {
  const part = new T.Mesh(geometry, material);
  part.position.set(position[0]!, position[1]!, position[2]!);
  part.castShadow = part.receiveShadow = true;
  parent.add(part);
  return part;
}
function ellipsoid(parent: T.Object3D, mat: T.Material, p: readonly number[], s: readonly number[]) {
  const part = mesh(parent, new T.SphereGeometry(1, 12, 8), mat, p);
  part.scale.set(s[0]!, s[1]!, s[2]!);
  return part;
}
function block(parent: T.Object3D, mat: T.Material, p: readonly number[], s: readonly number[]) {
  return mesh(parent, new T.BoxGeometry(s[0]!, s[1]!, s[2]!), mat, p);
}
function link(parent: T.Object3D, mat: T.Material, a: T.Vector3, b: T.Vector3, radius: number) {
  const part = mesh(parent, new T.CylinderGeometry(radius, radius, 1, 8), mat);
  poseLink(part, a, b);
  return part;
}
function poseLink(part: T.Mesh, a: T.Vector3, b: T.Vector3) {
  const direction = b.clone().sub(a);
  part.position.copy(a).add(b).multiplyScalar(.5);
  part.scale.y = Math.max(.001, direction.length());
  part.quaternion.setFromUnitVectors(UP, direction.normalize());
}
function disposeProcedural(root: T.Object3D) {
  const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>();
  root.traverse(node => {
    if (!(node instanceof T.Mesh)) return;
    geometries.add(node.geometry);
    for (const mat of Array.isArray(node.material) ? node.material : [node.material]) materials.add(mat);
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(mat => mat.dispose());
}

function makeHorse(): ProceduralRig {
  const root = new T.Group(); root.name = 'procedural-horse';
  const body = surface('#9b5731'), muzzle = surface('#693e2d'), mane = surface('#342b27'), hoof = surface('#2b2928');
  ellipsoid(root, body, [0, 1.27, -.08], [.44, .36, .94]);
  ellipsoid(root, body, [0, 1.24, -.66], [.42, .4, .42]);
  link(root, body, new T.Vector3(0, 1.35, .55), new T.Vector3(0, 1.99, 1), .27);
  ellipsoid(root, body, [0, 1.99, 1.15], [.23, .25, .36]);
  ellipsoid(root, muzzle, [0, 1.86, 1.45], [.2, .17, .2]);
  for (const x of [-.14, .14]) {
    const ear = mesh(root, new T.ConeGeometry(.105, .33, 5), body, [x, 2.25, 1.04]); ear.rotation.z = -x;
    ellipsoid(root, hoof, [x * 1.54, 2.045, 1.24], [.028, .038, .038]);
  }
  link(root, mane, new T.Vector3(0, 1.55, .42), new T.Vector3(0, 2.13, .87), .115);
  const tail = new T.Group(); tail.position.set(0, 1.42, -.94); root.add(tail);
  link(tail, mane, new T.Vector3(), new T.Vector3(0, -.55, -.62), .105);
  const legs: { hip: T.Group; knee: T.Group; index: number }[] = [];
  for (const z of [.58, -.65]) for (const x of [-.31, .31]) {
    const hip = new T.Group(); hip.position.set(x, 1.11, z); root.add(hip);
    hip.name = `horse-leg-${legs.length}`;
    link(hip, body, new T.Vector3(), new T.Vector3(0, -.49, 0), .105);
    const knee = new T.Group(); knee.position.y = -.49; hip.add(knee);
    link(knee, body, new T.Vector3(), new T.Vector3(0, -.45, 0), .066);
    block(knee, hoof, [0, -.5, .045], [.17, .18, .24]);
    legs.push({ hip, knee, index: legs.length });
  }
  return { root, animate(frame) {
    const moving = Math.min(1, Math.abs(frame.speed) / 1.2);
    const gallop = frame.gait === 'gallop';
    const offsets = gallop ? [0, .35, Math.PI, Math.PI + .35] : frame.gait === 'trot' ? [0, Math.PI, Math.PI, 0] : [0, Math.PI, Math.PI * 1.5, Math.PI * .5];
    for (const { hip, knee, index } of legs) {
      const stride = Math.sin(frame.phase + offsets[index]!);
      hip.rotation.x = stride * (gallop ? .53 : .37) * moving;
      knee.rotation.x = Math.max(0, -stride) * .64 * moving;
    }
    tail.rotation.z = Math.sin(frame.time * 1.8) * .13;
    tail.rotation.x = Math.sin(frame.phase) * moving * .12;
  } };
}

function makeDragon(): ProceduralRig {
  const root = new T.Group(); root.name = 'procedural-dragon';
  const skin = surface('#527d62'), ridge = surface('#304d42'), horn = surface('#d2c69a');
  const membrane = surface('#b5995c'); membrane.side = T.DoubleSide;
  ellipsoid(root, skin, [0, 1.55, -.25], [.78, .52, 1.6]);
  ellipsoid(root, skin, [0, 1.92, 1.45], [.49, .6, .71]);
  ellipsoid(root, skin, [0, 2.16, 2.27], [.47, .4, .65]);
  ellipsoid(root, skin, [0, 1.99, 2.82], [.4, .2, .51]);
  for (const x of [-.33, .33]) {
    const spike = mesh(root, new T.ConeGeometry(.14, .78, 5), horn, [x, 2.62, 2.05]); spike.rotation.x = -.52; spike.rotation.z = -x * .6;
    ellipsoid(root, surface('#edc851'), [x * 1.34, 2.27, 2.48], [.065, .08, .09]);
  }
  const tail = new T.Group(); tail.position.set(0, 1.55, -1.55); root.add(tail);
  link(tail, skin, new T.Vector3(), new T.Vector3(0, -.22, -1.42), .21);
  link(tail, ridge, new T.Vector3(0, -.22, -1.42), new T.Vector3(0, .08, -2.55), .095);
  for (const z of [-1.1, -.55, 0, .55, 1.1]) mesh(root, new T.ConeGeometry(.17, .44, 4), ridge, [0, 2.08, z]);
  const legs: T.Group[] = [];
  for (const z of [-.95, .83]) for (const x of [-.59, .59]) {
    const leg = new T.Group(); leg.position.set(x, 1.25, z); root.add(leg);
    link(leg, skin, new T.Vector3(), new T.Vector3(x * .26, -.51, -.12), .2);
    link(leg, skin, new T.Vector3(x * .26, -.51, -.12), new T.Vector3(x * .35, -1.01, .18), .12);
    block(leg, ridge, [x * .35, -1.11, .32], [.32, .2, .55]);
    for (const toe of [-.1, .1]) ellipsoid(leg, horn, [x * .35 + toe, -1.11, .61], [.06, .055, .13]);
    legs.push(leg);
  }
  const wings: { shoulder: T.Group; tip: T.Group; side: number }[] = [];
  for (const side of [-1, 1]) {
    const shoulder = new T.Group(); shoulder.position.set(side * .57, 1.99, .3); root.add(shoulder);
    shoulder.name = side < 0 ? 'dragon-wing-left' : 'dragon-wing-right';
    const tip = new T.Group(); shoulder.add(tip);
    const points = [[0, 0, .6], [side * 1.7, .18, 1.02], [side * 4.35, -.06, .25], [side * 3.26, -.13, -.67], [side * 2.73, -.1, -1.53], [side * 1.48, -.08, -1.07], [0, 0, -.62]];
    const vertices: number[] = [];
    for (let n = 1; n < points.length - 1; n++) vertices.push(...points[0]!, ...points[n]!, ...points[n + 1]!);
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); geo.computeVertexNormals();
    mesh(tip, geo, membrane);
    for (const index of [1, 2, 4, 5]) link(tip, ridge, new T.Vector3(...points[0] as [number, number, number]), new T.Vector3(...points[index] as [number, number, number]), .06);
    wings.push({ shoulder, tip, side });
  }
  return { root, animate(frame) {
    for (const { shoulder, tip, side } of wings) {
      // The full envelope also includes the upstroke; no simulation/camera bob.
      shoulder.rotation.z = side * (frame.flying ? .17 + Math.sin(frame.phase) * .38 : .17);
      tip.rotation.y = side * Math.sin(frame.phase - .35) * (frame.flying ? .07 : .015);
    }
    legs.forEach((leg, index) => { leg.rotation.x = frame.flying ? -.32 : Math.sin(frame.phase + (index % 2) * Math.PI) * Math.min(.27, Math.abs(frame.speed) * .04); });
    tail.rotation.y = Math.sin(frame.phase * .5) * .09;
  } };
}

/** Remove only horizontal root travel; keep authored vertical strides and every joint track. */
function inPlaceClip(clip: T.AnimationClip, scene: T.Group, kind: CreatureModelKind) {
  const clean = clip.clone(), bone = scene.getObjectByName(CREATURE_ASSETS[kind].rootMotionBone);
  if (!bone) return clean;
  for (const track of clean.tracks) if (track.name === `${bone.name}.position`) {
    for (let n = 0; n < track.values.length; n += 3) { track.values[n] = bone.position.x; track.values[n + 2] = bone.position.z; }
  }
  return clean;
}
function measuredBounds(scene: T.Group) {
  scene.updateMatrixWorld(true);
  scene.traverse(node => { if (node instanceof T.SkinnedMesh) node.computeBoundingBox(); });
  return new T.Box3().setFromObject(scene);
}
function prepareSource(gltf: GLTF, kind: CreatureModelKind): PreparedSource {
  const needed = new Set(Object.values(CREATURE_ASSETS[kind].clips));
  const clips = gltf.animations.filter(clip => needed.has(clip.name)).map(clip => inPlaceClip(clip, gltf.scene, kind));
  for (const name of needed) if (!clips.some(clip => clip.name === name)) throw new Error(`Missing animation: ${name}`);
  let skinCount = 0;
  gltf.scene.traverse(node => { if (node instanceof T.SkinnedMesh) skinCount++; });
  if (!skinCount) throw new Error('Asset has no skinned mesh');
  const probe = cloneSkeleton(gltf.scene) as T.Group;
  const bounds = measuredBounds(probe), mixer = new T.AnimationMixer(probe);
  for (const clip of clips) {
    const action = mixer.clipAction(clip).play();
    // Shared source work is done once. The extra margin covers between-sample extrema.
    for (let n = 0; n <= 32; n++) { mixer.setTime(clip.duration * n / 32); bounds.union(measuredBounds(probe)); }
    action.stop();
  }
  mixer.stopAllAction(); mixer.uncacheRoot(probe);
  if (bounds.isEmpty() || !Number.isFinite(bounds.min.length() + bounds.max.length())) throw new Error('Asset has invalid bounds');
  bounds.expandByScalar(.015);
  return { scene: gltf.scene, clips, bounds };
}
function getSource(kind: CreatureModelKind) {
  let source = sourceCache.get(kind);
  if (!source) {
    source = new GLTFLoader().loadAsync(resolveTrainingResource(CREATURE_ASSETS[kind].url)).then(gltf => prepareSource(gltf, kind));
    sourceCache.set(kind, source);
    void source.catch(() => { sourceCache.delete(kind); });
  }
  return source;
}

export function buildCreatureVisual(spec: VehicleSpec): CreatureVisual {
  const archetype: string = spec.archetype;
  const kind: CreatureModelKind = archetype === 'dragon' ? 'dragon' : 'horse';
  const carriage = archetype === 'carriage';
  const definition = CREATURE_ASSETS[kind];
  const content = new T.Group(), seat = new T.Group(), animal = new T.Group(), motion = new T.Group();
  content.name = `${spec.id}-creature-content`; seat.name = 'rider-seat';
  seat.position.set(...spec.seat); content.add(seat);
  animal.name = kind; animal.userData.collisionPart = kind;
  if (carriage) animal.position.z = 4.8;
  content.add(animal); animal.add(motion);
  const procedural = kind === 'horse' ? makeHorse() : makeDragon(); motion.add(procedural.root);
  const sourceStatus: CreatureSourceStatus = { state: 'placeholder', kind, url: definition.url };
  content.userData.creatureSource = sourceStatus;
  const saddle = new T.Group(); saddle.name = 'saddle'; animal.add(saddle);
  const leather = surface('#49352c'), blanket = surface(kind === 'horse' ? '#446b77' : '#b96336');
  const saddleY = kind === 'horse' ? 1.65 : 2.1, saddleZ = kind === 'horse' ? 0 : .4;
  block(saddle, blanket, [0, saddleY - .095, saddleZ], [kind === 'horse' ? .71 : 1.02, .09, .79]);
  block(saddle, leather, [0, saddleY - .03, saddleZ], [.48, .09, .6]);
  const wheelSpins: T.Group[] = [], bars: { mesh: T.Mesh; start: T.Vector3; side: number }[] = [];
  if (carriage) {
    const cart = new T.Group(); cart.name = 'cart'; cart.userData.collisionPart = 'cart'; content.add(cart);
    const wood = surface('#926438'), woodLight = surface('#bd8d54'), iron = surface('#383c3d', .55);
    for (let n = 0; n < 6; n++) block(cart, n % 2 ? wood : woodLight, [0, .72, -1.25 + n * .47], [1.94, .16, .44]);
    for (const side of [-1, 1]) {
      for (const y of [1.01, 1.28]) block(cart, wood, [side * .97, y, -.15], [.13, .23, 2.78]);
      for (const z of [-1.44, 1.18]) block(cart, iron, [side * .98, 1.06, z], [.085, .82, .08]);
    }
    for (const y of [1.01, 1.28]) block(cart, woodLight, [0, y, -1.5], [1.98, .23, .12]);
    block(cart, leather, [0, 1.38, .55], [1.61, .14, .65]);
    block(cart, wood, [0, 1.68, .2], [1.7, .53, .12]);
    for (const x of [-1.12, 1.12]) for (const z of [-1.03, 1.03]) {
      const spin = new T.Group(); spin.name = 'cart-wheel-spin'; spin.position.set(x, .56, z); cart.add(spin); wheelSpins.push(spin);
      const rim = mesh(spin, new T.TorusGeometry(.5, .055, 8, 20), iron); rim.rotation.y = Math.PI / 2;
      const hub = mesh(spin, new T.CylinderGeometry(.105, .105, .22, 10), wood); hub.rotation.z = Math.PI / 2;
      for (let n = 0; n < 8; n++) { const a = n * Math.PI / 4; link(spin, woodLight, new T.Vector3(), new T.Vector3(0, Math.cos(a) * .5, Math.sin(a) * .5), .037); }
    }
    const hitch = new T.Group(); hitch.name = 'drawbars'; hitch.userData.collisionPart = 'hitch'; hitch.userData.collision = 'none'; hitch.userData.renderOnly = true; content.add(hitch);
    for (const side of [-1, 1]) {
      const start = new T.Vector3(side * .69, .83, 1.38);
      const bar = link(hitch, wood, start, new T.Vector3(side * .47, 1.06, 4.05), .055);
      bar.userData.collision = 'none'; bar.userData.renderOnly = true;
      bars.push({ mesh: bar, start, side });
    }
  }
  let disposed = false, loadPromise: Promise<void> | undefined;
  let mixer: T.AnimationMixer | undefined, model: T.Group | undefined, active: T.AnimationAction | undefined;
  const actions = new Map<string, T.AnimationAction>();
  let lastPosition: T.Vector3 | undefined;
  const inverse = new T.Quaternion(), leadRotation = new T.Quaternion(), temp = new T.Vector3(), forward = new T.Vector3();
  function update(frame: CreatureRenderFrame, dt: number) {
    if (disposed) return;
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(dt, .1)) : 0;
    const pace = Math.min(1, Math.abs(frame.speed) / 3);
    const bob = kind === 'horse' ? (1 - Math.cos(frame.phase * 2)) * .013 * pace : 0;
    motion.position.y = bob; saddle.position.y = bob * .5;
    seat.position.set(...spec.seat); if (!carriage) seat.position.y += bob * .5;
    if (sourceStatus.state !== 'imported') procedural.animate(frame);
    if (mixer) {
      const semantic = definition.clips[frame.gait] ?? definition.clips[kind === 'horse' ? 'graze' : 'rest']!;
      const next = actions.get(semantic);
      if (next && next !== active) { active?.fadeOut(.2); next.reset().setEffectiveWeight(1).fadeIn(.2).play(); active = next; }
      const rate = kind === 'horse' ? frame.gait === 'gallop' ? T.MathUtils.clamp(Math.abs(frame.speed) / 9, .8, 1.55) : frame.gait === 'trot' ? 1.8 : frame.gait === 'walk' ? T.MathUtils.clamp(Math.abs(frame.speed) / 2.4, .6, 1.55) : 1 : frame.flying ? frame.gait === 'glide' ? .55 : T.MathUtils.clamp(Math.abs(frame.speed) / 12, .75, 1.4) : 0;
      active?.setEffectiveTimeScale(rate); mixer.update(step); sourceStatus.clip = semantic;
    }
    if (carriage) {
      inverse.copy(frame.rotation).invert();
      if (frame.leadPosition) animal.position.copy(frame.leadPosition).sub(frame.position).applyQuaternion(inverse);
      else animal.position.set(0, 0, 4.8);
      if (frame.leadYaw !== undefined) { leadRotation.setFromAxisAngle(UP, frame.leadYaw); animal.quaternion.copy(inverse).multiply(leadRotation); }
      else animal.quaternion.identity();
      for (const bar of bars) { temp.set(bar.side * .47, 1.06, -.75).applyQuaternion(animal.quaternion).add(animal.position); poseLink(bar.mesh, bar.start, temp); }
      if (lastPosition && step > 0 && frame.grounded) {
        temp.copy(frame.position).sub(lastPosition);
        // Teleports rebase the wheel history; forward projection ignores lateral skids.
        if (temp.lengthSq() < 9) { const distance = temp.dot(forward.set(0, 0, 1).applyQuaternion(frame.rotation)); for (const wheel of wheelSpins) wheel.rotation.x += distance / .555; }
      }
      if (!lastPosition) lastPosition = new T.Vector3();
      lastPosition.copy(frame.position);
    }
  }
  function load() {
    if (loadPromise || disposed) return loadPromise ?? Promise.resolve();
    sourceStatus.state = 'loading';
    loadPromise = getSource(kind).then(source => {
      if (disposed) return;
      model = cloneSkeleton(source.scene) as T.Group; model.name = `${kind}-imported-model`;
      const size = source.bounds.getSize(new T.Vector3()), target = new T.Vector3(...definition.targetSize);
      const scale = target.divide(size);
      if (definition.uniformScale) scale.setScalar(Math.min(scale.x, scale.y, scale.z));
      const center = source.bounds.getCenter(new T.Vector3());
      const normalization = new T.Group(); normalization.name = 'asset-normalization'; normalization.scale.copy(scale); normalization.rotation.y = definition.yaw;
      normalization.position.set(...definition.offset);
      model.position.set(-center.x, -source.bounds.min.y, -center.z);
      normalization.add(model); motion.add(normalization);
      content.updateMatrixWorld(true);
      model.traverse(node => { if (node instanceof T.Mesh) { node.castShadow = node.receiveShadow = true; node.frustumCulled = false; } });
      mixer = new T.AnimationMixer(model);
      for (const clip of source.clips) actions.set(clip.name, mixer.clipAction(clip));
      procedural.root.removeFromParent(); disposeProcedural(procedural.root);
      sourceStatus.state = 'imported'; sourceStatus.message = `Quaternius CC0 · ${source.clips.length} mapped skeletal clips`;
    }).catch(error => { if (!disposed) { sourceStatus.state = 'fallback'; sourceStatus.message = error instanceof Error ? error.message : 'Asset load failed'; } throw error; });
    return loadPromise;
  }
  return { content, seat, sourceStatus, update, load, dispose() {
    if (disposed) return; disposed = true;
    mixer?.stopAllAction(); if (model) { mixer?.uncacheRoot(model); model.removeFromParent(); }
    // Imported meshes share the source cache's geometry/materials. Only owned
    // procedural parts are disposed here; one horse must not break the other.
    disposeProcedural(content); content.clear(); actions.clear();
  } };
}
