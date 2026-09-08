import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

export type TrainingResourceResolver = (logicalPath: string) => string;
export interface TrainingHorseFrame {
  readonly epoch: number;
  readonly timeSeconds: number;
  /** Integrated stride angle in radians, supplied by the fixed simulation. */
  readonly phase: number;
  readonly speedMetersPerSecond: number;
  readonly gait: string;
}
export interface TrainingSeatAnchor {
  readonly nodeName: string;
  readonly maximumOffsetMeters: number;
  readonly maximumRotationRadians: number;
}
const clipNames = ['Idle', 'Walk', 'Gallop'] as const;
type ClipName = typeof clipNames[number];

function bounds(object: T.Object3D): T.Box3 {
  object.updateWorldMatrix(true, false);
  object.updateMatrixWorld(true);
  object.traverse(node => { if (node instanceof T.SkinnedMesh) node.computeBoundingBox(); });
  return new T.Box3().setFromObject(object);
}
function validateMatrix(matrix: T.Matrix4): void {
  const scale = new T.Vector3().setFromMatrixScale(matrix);
  if (!matrix.elements.every(Number.isFinite) || matrix.determinant() <= 1e-12 || Math.min(scale.x, scale.y, scale.z) <= 0) {
    throw new Error('TRAINING_HORSE_TRANSFORM_INVALID');
  }
}
function validateNode(node: T.Object3D): void {
  if (Math.min(node.scale.x, node.scale.y, node.scale.z) <= 0) throw new Error('TRAINING_HORSE_TRANSFORM_INVALID');
  validateMatrix(node.matrixWorld);
}
function disposeResources(scene: T.Object3D): void {
  const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>(), textures = new Set<T.Texture>();
  scene.traverse(node => {
    if (node instanceof T.SkinnedMesh) node.skeleton.dispose();
    if (node instanceof T.Mesh) {
      geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
    }
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof T.Texture) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) texture.dispose();
  for (const geometry of geometries) geometry.dispose();
}

/** Owns one imported horse and absolute clip sampling. The logical root stays unit-scale. */
export class TrainingHorse {
  readonly root: T.Group = new T.Group();
  readonly content: T.Group = new T.Group();
  private model: T.Object3D | undefined;
  private mixer: T.AnimationMixer | undefined;
  private actions: Map<ClipName, T.AnimationAction> = new Map();
  private bindInverse: Map<T.Object3D, T.Matrix4> = new Map();
  private loading: Promise<void> | undefined;
  private disposed: boolean = false;

  constructor() {
    this.root.name = 'TrainingHorse';
    this.content.name = 'TrainingHorseContent';
    this.root.add(this.content);
  }
  get loaded(): boolean { return this.model !== undefined && !this.disposed; }
  load(resolve: TrainingResourceResolver): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('TRAINING_HORSE_DISPOSED'));
    if (this.loading) return this.loading;
    this.loading = this.loadOwned(resolve);
    return this.loading;
  }
  private async loadOwned(resolve: TrainingResourceResolver): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(resolve('creatures/horse.glb'));
    if (this.disposed) { disposeResources(gltf.scene); throw new Error('TRAINING_HORSE_DISPOSED'); }
    try {
      const body = gltf.scene.getObjectByName('Body');
      if (!body) throw new Error('TRAINING_HORSE_BODY_MISSING');
      const clips = clipNames.map(name => {
        const source = gltf.animations.find(clip => clip.name === name);
        if (!source) throw new Error(`TRAINING_HORSE_CLIP_MISSING: ${name}`);
        const clip = source.clone();
        for (const track of clip.tracks) if (track.name === 'Body.position') {
          for (let i = 0; i < track.values.length; i += 3) {
            track.values[i] = body.position.x;
            track.values[i + 2] = body.position.z;
          }
        }
        return clip;
      });
      const model = clone(gltf.scene);
      this.model = model;
      const mixer = this.mixer = new T.AnimationMixer(model);
      const union = bounds(model);
      for (const clip of clips) {
        const action = mixer.clipAction(clip);
        this.actions.set(clip.name as ClipName, action);
        action.play();
        for (let i = 0; i <= 64; i++) { mixer.setTime(clip.duration * i / 64); union.union(bounds(model)); }
        action.stop();
      }
      // Quaternion blending can place a hoof outside either endpoint's AABB.
      // Include transition poses before fixing the visual ground baseline.
      for (const pair of [['Idle','Walk'],['Walk','Gallop']] as const) {
        for (const weight of [.25,.5,.75]) {
          mixer.stopAllAction();
          const first = this.actions.get(pair[0])!, second = this.actions.get(pair[1])!;
          first.reset().setEffectiveWeight(1-weight).play();
          second.reset().setEffectiveWeight(weight).play();
          for (let i=0;i<=64;i++) {
            first.time = first.getClip().duration*i/64;
            second.time = second.getClip().duration*i/64;
            mixer.update(0); union.union(bounds(model));
          }
        }
      }
      mixer.stopAllAction();
      union.expandByScalar(.015);
      const size = union.getSize(new T.Vector3()), center = union.getCenter(new T.Vector3());
      const scale = Math.min(1.4 / size.x, 2.3 / size.y, 3.55 / size.z);
      if (union.isEmpty() || !Number.isFinite(scale) || scale <= 0) throw new Error('TRAINING_HORSE_TRANSFORM_INVALID');
      this.content.scale.setScalar(scale);
      model.position.set(-center.x, -union.min.y, -center.z);
      this.content.add(model);
      this.root.updateWorldMatrix(true, true);
      const inverseRoot = this.root.matrixWorld.clone().invert();
      model.traverse(node => {
        validateNode(node);
        const rest = inverseRoot.clone().multiply(node.matrixWorld);
        validateMatrix(rest);
        this.bindInverse.set(node, rest.invert());
      });
      // The clone owns the shared geometry/materials; the unrendered source has
      // a separate skeleton and never participates in playback.
      gltf.scene.traverse(node => { if (node instanceof T.SkinnedMesh) node.skeleton.dispose(); });
    } catch (error) {
      this.mixer?.stopAllAction();
      if (this.model) this.mixer?.uncacheRoot(this.model);
      this.content.clear(); this.model = undefined; this.actions.clear(); this.bindInverse.clear();
      disposeResources(gltf.scene);
      throw error;
    }
  }
  private assertLoaded(): void {
    if (this.disposed) throw new Error('TRAINING_HORSE_DISPOSED');
    if (!this.loaded) throw new Error('TRAINING_HORSE_NOT_LOADED');
  }
  sample(frame: TrainingHorseFrame): void {
    this.assertLoaded();
    if (![frame.epoch, frame.timeSeconds, frame.phase, frame.speedMetersPerSecond].every(Number.isFinite)) throw new Error('TRAINING_HORSE_FRAME_INVALID');
    if (!['graze','walk','trot','gallop'].includes(frame.gait)) throw new Error('TRAINING_HORSE_GAIT_INVALID');
    const speed = Math.abs(frame.speedMetersPerSecond);
    const gallopWeight = frame.gait === 'gallop' ? T.MathUtils.smoothstep(speed, 8, 9) : 0;
    const motionWeight = frame.gait === 'graze' ? 0 : T.MathUtils.smoothstep(speed, .12, 1);
    const weights: Record<ClipName, number> = {
      Idle: 1 - motionWeight,
      Walk: motionWeight * (1 - gallopWeight),
      Gallop: motionWeight * gallopWeight,
    };
    // Reset property bindings before every absolute evaluation. Blend weights
    // depend only on the common fixed sample, never on previous display calls.
    this.mixer!.stopAllAction();
    for (const name of clipNames) {
      if (weights[name] === 0) continue;
      const action = this.actions.get(name)!;
      action.reset().setEffectiveWeight(weights[name]).play();
      const cycles = name === 'Idle' ? frame.timeSeconds / action.getClip().duration : frame.phase / (2 * Math.PI);
      action.time = T.MathUtils.euclideanModulo(cycles, 1) * action.getClip().duration;
    }
    this.mixer!.update(0);
    this.root.updateWorldMatrix(true, true);
    this.root.traverse(validateNode);
  }
  readSeatAnchor(seat: readonly [number, number, number], anchor?: TrainingSeatAnchor): T.Matrix4 {
    this.assertLoaded();
    if (!seat.every(Number.isFinite)) throw new Error('TRAINING_SEAT_ANCHOR_INVALID');
    const fixed = new T.Matrix4().makeTranslation(...seat);
    if (!anchor) return fixed;
    const node = this.model!.getObjectByName(anchor.nodeName);
    if (!node) throw new Error('TRAINING_SEAT_ANCHOR_MISSING');
    if (![anchor.maximumOffsetMeters, anchor.maximumRotationRadians].every(n => Number.isFinite(n) && n >= 0)) throw new Error('TRAINING_SEAT_ANCHOR_INVALID');
    this.root.updateWorldMatrix(true, true);
    this.root.traverse(validateNode);
    const result = this.root.matrixWorld.clone().invert().multiply(node.matrixWorld).multiply(this.bindInverse.get(node)!).multiply(fixed);
    validateMatrix(result);
    const position = new T.Vector3(), rotation = new T.Quaternion(), scale = new T.Vector3();
    result.decompose(position, rotation, scale);
    if (position.distanceTo(new T.Vector3(...seat)) > anchor.maximumOffsetMeters || rotation.angleTo(new T.Quaternion()) > anchor.maximumRotationRadians) throw new Error('TRAINING_SEAT_ANCHOR_OUT_OF_BOUNDS');
    return result;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer?.stopAllAction();
    if (this.model) { this.mixer?.uncacheRoot(this.model); disposeResources(this.model); }
    this.model = undefined; this.mixer = undefined;
    this.actions.clear(); this.bindInverse.clear(); this.content.clear(); this.root.removeFromParent();
  }
}
