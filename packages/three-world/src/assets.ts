import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import {
  AnimationMixer, Group, LoopOnce, LoopRepeat,
  type AnimationAction, type AnimationClip, type BufferGeometry, type Material,
  type Mesh, type Object3D, type Skeleton, type SkinnedMesh, type Texture,
} from 'three';
import { type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import {createModelLoader,resolveLoadTextures,type ModelLoadOptions} from './model-loader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { AssetDefinition, AssetInstance } from './engine-contracts';

type LoadOptions = ModelLoadOptions & {
  baseUri?: string;
  fetchBytes?: (uri: string) => Promise<Uint8Array>;
};
type CacheEntry = { promise: Promise<GLTF>; references: number };
const cache = new Map<string, CacheEntry>();
const cloneFactories = new WeakMap<AssetInstance, () => AssetInstance>();
// WorldAssets wraps EngineAssetInstance, but the owned mixer identity is shared.
const locomotionPlayers = new WeakMap<AnimationMixer, (actionId: 'walk' | 'run') => void>();

/** Internal automatic-gait path; generic and authored action playback stays separate. */
export function playLocomotion(instance: AssetInstance, actionId: 'walk' | 'run'): void {
  const play = locomotionPlayers.get(instance.mixer);
  if (play) play(actionId); else instance.play(actionId);
}

function fail(code: string, id: string): never {
  throw new Error(`${code}: ${id}`);
}

export function validateAssetDefinition(definition: AssetDefinition): void {
  const transform = definition.rootTransform;
  if (!definition.id || !definition.uri ||
      !/^[a-f0-9]{64}$/.test(definition.sha256) ||
      !Number.isSafeInteger(definition.byteLength) || definition.byteLength <= 0 ||
      ![transform.positionMetersXYZ, transform.rotationEulerRadiansXYZ, transform.scaleXYZ]
        .every((tuple) => tuple.length === 3 && tuple.every(Number.isFinite)) ||
      transform.scaleXYZ.some((value) => value <= 0)) {
    fail('ASSET_DEFINITION_INVALID', definition.id);
  }
  const indices = definition.selectedNodeIndices;
  if (indices && (indices.length === 0 || new Set(indices).size !== indices.length ||
      indices.some((index) => !Number.isSafeInteger(index) || index < 0))) {
    fail('ASSET_NODE_SELECTION_INVALID', definition.id);
  }
  for (const [id, action] of Object.entries(definition.actions)) {
    if (!id || !action.clipName || typeof action.loop !== 'boolean' ||
        !Number.isFinite(action.blendSeconds) || action.blendSeconds < 0 ||
        !Number.isFinite(action.timeScale) || action.timeScale <= 0) {
      fail('ASSET_ACTION_DEFINITION_INVALID', definition.id);
    }
  }
}

type OwnedResources = {
  materials: Set<Material>; skeletons: Set<Skeleton>;
  geometries: Set<BufferGeometry>; textures: Set<Texture>;
};
const resourceCleanups = (owned: OwnedResources) => [
  ...[...owned.skeletons].map(value => () => value.dispose()),
  ...[...owned.geometries].map(value => () => value.dispose()),
  ...[...owned.materials].map(value => () => value.dispose()),
  ...[...owned.textures].map(value => () => value.dispose()),
];

function createInstance(
  definition: AssetDefinition, object: Group, visual: Object3D, clips: readonly AnimationClip[],
  key: string, lease: CacheEntry, gltf: GLTF, owned: OwnedResources,
): AssetInstance {
  const mixer = new AnimationMixer(visual);
  let activeAction: AnimationAction | undefined;
  let activeActionId: string | undefined;
  let activeLoop: boolean | undefined;
  let activeAutomaticGait = false;
  const gaitClips = new Map<AnimationClip, AnimationClip>();
  let completed = false;
  let disposed = false;
  const ensureAlive = () => { if (disposed) fail('ASSET_DISPOSED', definition.id); };
  const onFinished = (event: { action: AnimationAction }) => { if (event.action === activeAction) completed = true; };
  mixer.addEventListener('finished', onFinished);
  function playAction(actionId: string, options?: { playback: 'once' | 'loop' }, automaticGait = false) {
    ensureAlive();
    if (!Object.hasOwn(definition.actions, actionId)) fail('ASSET_ACTION_UNAVAILABLE', `${definition.id}/${actionId}`);
    if (options !== undefined && (!options || !['once', 'loop'].includes(options.playback))) fail('ASSET_PLAYBACK_INVALID', definition.id);
    const binding = definition.actions[actionId]!;
    const loop = options ? options.playback === 'loop' : binding.loop;
    const sourceClip = clips.find(candidate => candidate.name === binding.clipName)!;
    automaticGait &&= loop;
    let clip = sourceClip;
    if (automaticGait) {
      let normalized = gaitClips.get(sourceClip);
      if (!normalized) {
        normalized = sourceClip.clone();
        if (normalized.tracks.length && normalized.tracks.every(track => track.times.length > 0)) {
          const start = Math.min(...normalized.tracks.map(track => track.times[0]!));
          // Three holds the first key before its timestamp on every loop. Remove
          // only that shared leading interval from the private automatic clip.
          if (start > 0 && start < normalized.duration) {
            for (const track of normalized.tracks) track.shift(-start);
            normalized.duration -= start;
          }
        }
        gaitClips.set(sourceClip, normalized);
      }
      clip = normalized;
    }
    const next = mixer.clipAction(clip);
    if (next === activeAction && actionId === activeActionId && loop === activeLoop && next.isRunning()) return;
    const phase = automaticGait && activeAutomaticGait && activeAction?.isRunning()
      && activeAction !== next && activeAction.getClip().duration > 0
      ? activeAction.time / activeAction.getClip().duration : undefined;
    next.reset().setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
    if (phase !== undefined) next.time = (phase % 1) * clip.duration;
    next.clampWhenFinished = !loop;
    next.setEffectiveTimeScale(binding.timeScale).setEffectiveWeight(1).play();
    if (activeAction && activeAction !== next) {
      // A clamped one-shot is scheduled, but a stopped action cannot fade in.
      if (binding.blendSeconds > 0 && activeAction.isScheduled()) next.crossFadeFrom(activeAction, binding.blendSeconds, false);
      else activeAction.stop();
    }
    activeAction = next; activeActionId = actionId; activeLoop = loop;
    activeAutomaticGait = automaticGait; completed = false;
  }
  const instance: AssetInstance = {
    object, clips, mixer, actionIds: Object.freeze(Object.keys(definition.actions)),
    get isActionComplete() { return completed; },
    get timeSeconds() { return activeAction?.time ?? 0; },
    get currentActionId() { return activeActionId; },
    get currentClipName() { return activeAction?.getClip().name; },
    play: (actionId, options) => playAction(actionId, options),
    update(deltaSeconds) {
      ensureAlive();
      if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) fail('ASSET_DELTA_INVALID', definition.id);
      mixer.update(deltaSeconds);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      locomotionPlayers.delete(mixer);
      runCleanup([
        () => mixer.removeEventListener('finished', onFinished),
        () => mixer.stopAllAction(), () => mixer.uncacheRoot(visual),
        () => object.removeFromParent(), ...resourceCleanups(owned),
        () => release(key, lease, gltf),
      ]);
    },
  };
  locomotionPlayers.set(mixer, actionId => playAction(actionId, undefined, true));
  cloneFactories.set(instance, () => {
    ensureAlive();
    // Retain the verified GLB before cloning. Disposing the source must not retire
    // immutable geometry/textures that its new sibling still borrows.
    lease.references += 1;
    const nextOwned: OwnedResources = { materials: new Set(), skeletons: new Set(), geometries: new Set(), textures: new Set() };
    try {
      const copied = cloneSkeleton(object) as Group;
      const originalNodes: Object3D[] = [], copiedNodes: Object3D[] = [];
      object.traverse(node => originalNodes.push(node)); copied.traverse(node => copiedNodes.push(node));
      const copiedVisual = copiedNodes[originalNodes.indexOf(visual)];
      if (!copiedVisual) fail('ASSET_ANIMATION_ROOT_MISSING', definition.id);
      const templateGeometries = new Set<BufferGeometry>(), templateTextures = new Set<Texture>();
      for (const scene of gltf.scenes) scene.traverse(node => {
        const mesh = node as Mesh; if (!mesh.isMesh) return;
        templateGeometries.add(mesh.geometry);
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) for (const texture of texturesOf(material)) templateTextures.add(texture);
      });
      const materialCopies = new Map<Material, Material>(), geometryCopies = new Map<BufferGeometry, BufferGeometry>(), textureCopies = new Map<Texture, Texture>();
      const copyMaterial = (source: Material): Material => {
        let material = materialCopies.get(source);
        if (material) return material;
        material = source.clone(); materialCopies.set(source, material); nextOwned.materials.add(material);
        for (const [name, value] of Object.entries(material)) {
          if (!value || typeof value !== 'object' || value.isTexture !== true || templateTextures.has(value)) continue;
          let texture = textureCopies.get(value as Texture);
          if (!texture) { texture = (value as Texture).clone(); textureCopies.set(value as Texture, texture); nextOwned.textures.add(texture); }
          (material as unknown as Record<string, unknown>)[name] = texture;
        }
        return material;
      };
      copied.traverse(node => {
        const mesh = node as Mesh; if (!mesh.isMesh) return;
        if ((mesh as SkinnedMesh).isSkinnedMesh) nextOwned.skeletons.add((mesh as SkinnedMesh).skeleton);
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(copyMaterial) : copyMaterial(mesh.material);
        // Author-added attachments or replaced geometry are outside the GLB lease.
        // Own a copy, so releasing either source cannot invalidate the other.
        if (!templateGeometries.has(mesh.geometry)) {
          let geometry = geometryCopies.get(mesh.geometry);
          if (!geometry) { geometry = mesh.geometry.clone(); geometryCopies.set(mesh.geometry, geometry); nextOwned.geometries.add(geometry); }
          mesh.geometry = geometry;
        }
      });
      return createInstance(definition, copied, copiedVisual, clips.map(clip => clip.clone()), key, lease, gltf, nextOwned);
    } catch (error) {
      try { runCleanup([...resourceCleanups(nextOwned), () => release(key, lease, gltf)]); } catch { /* Preserve clone failure. */ }
      throw error;
    }
  });
  return instance;
}

/** Internal clone preserves authored instance edits, with independent mutable resources. */
export function cloneAsset(instance: AssetInstance): AssetInstance {
  const factory = cloneFactories.get(instance);
  if (!factory) fail('ASSET_INSTANCE_UNKNOWN', instance?.object?.name ?? 'unknown');
  return factory();
}

async function fetchAssetBytes(uri: string): Promise<Uint8Array> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`ASSET_FETCH_FAILED: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

// A verified GLB must not subsequently load unverified external buffers or textures.
function checkEmbeddedGlb(bytes: Uint8Array, id: string): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 20 || view.getUint32(0, true) !== 0x46546c67 ||
      view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length ||
      view.getUint32(16, true) !== 0x4e4f534a ||
      view.getUint32(12, true) > bytes.length - 20) {
    fail('ASSET_GLB_INVALID', id);
  }
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true)))) as {
    buffers?: { uri?: string }[]; images?: { uri?: string }[];
  };
  if ([...(json.buffers ?? []), ...(json.images ?? [])]
    .some(({ uri }) => uri !== undefined && !uri.startsWith('data:'))) {
    fail('ASSET_EXTERNAL_RESOURCE_UNSUPPORTED', id);
  }
}

function texturesOf(material: Material): Texture[] {
  return Object.values(material).filter((value): value is Texture =>
    value !== null && typeof value === 'object' && value.isTexture === true);
}

function disposeTemplate(gltf: GLTF): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const skeletons = new Set<Skeleton>();
  for (const scene of gltf.scenes) scene.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material);
      for (const texture of texturesOf(material)) textures.add(texture);
    }
    if ((mesh as SkinnedMesh).isSkinnedMesh) skeletons.add((mesh as SkinnedMesh).skeleton);
  });
  runCleanup([
    ...[...skeletons].map((value) => () => value.dispose()),
    ...[...geometries].map((value) => () => value.dispose()),
    ...[...materials].map((value) => () => value.dispose()),
    ...[...textures].map((value) => () => value.dispose()),
  ]);
}

// A throwing dispose listener must not prevent the remaining owned resources releasing.
function runCleanup(cleanups: (() => void)[]): void {
  let firstError: unknown;
  for (const cleanup of cleanups) {
    try { cleanup(); } catch (error) { firstError ??= error; }
  }
  if (firstError) throw firstError;
}

function release(key: string, entry: CacheEntry, gltf?: GLTF): void {
  entry.references -= 1;
  if (entry.references !== 0) return;
  if (cache.get(key) === entry) cache.delete(key);
  if (gltf) disposeTemplate(gltf);
}

function selectNodes(gltf: GLTF, clone: Object3D, definition: AssetDefinition): void {
  const indices = definition.selectedNodeIndices;
  if (!indices) return;
  const wanted = new Set(indices);
  const selected = new Set<Object3D>();
  const sourceObjects: Object3D[] = [];
  const clonedObjects: Object3D[] = [];
  gltf.scene.traverse((object) => sourceObjects.push(object));
  clone.traverse((object) => clonedObjects.push(object));
  sourceObjects.forEach((source, index) => {
    const nodeIndex = gltf.parser.associations.get(source)?.nodes;
    if (nodeIndex !== undefined && wanted.has(nodeIndex)) {
      selected.add(clonedObjects[index]!);
      wanted.delete(nodeIndex);
    }
  });
  if (wanted.size) fail('ASSET_NODE_NOT_FOUND', definition.id);
  const prune = (object: Object3D): boolean => {
    if (selected.has(object)) return true;
    for (const child of [...object.children]) if (!prune(child)) object.remove(child);
    return object.children.length > 0;
  };
  prune(clone);
}

/**
 * Loads hash-locked, self-contained GLB bytes. Geometry and textures are immutable
 * shared resources; each instance owns its skeleton, mixer and cloned materials,
 * so changing mesh.material.color is isolated. Do not dispose borrowed geometry or
 * textures directly: dispose the AssetInstance when the entity is removed.
 */
export async function loadAsset(definition: AssetDefinition, options: LoadOptions = {}): Promise<AssetInstance> {
  validateAssetDefinition(definition);
  const loadTextures=resolveLoadTextures(options);
  const uri = options.baseUri ? new URL(definition.uri, options.baseUri).href : definition.uri;
  const key = JSON.stringify([uri, definition.sha256, definition.byteLength, loadTextures]);
  let entry = cache.get(key);
  if (!entry) {
    const promise = (async () => {
      const bytes = await (options.fetchBytes ?? fetchAssetBytes)(uri);
      if (bytes.byteLength !== definition.byteLength) fail('ASSET_LENGTH_MISMATCH', definition.id);
      if (bytesToHex(sha256(bytes)) !== definition.sha256) fail('ASSET_HASH_MISMATCH', definition.id);
      checkEmbeddedGlb(bytes, definition.id);
      // Copy to an owned ArrayBuffer, including when fetchBytes returns a Buffer slice.
      return createModelLoader({loadTextures}).parseAsync(Uint8Array.from(bytes).buffer, '');
    })();
    entry = { promise, references: 0 };
    cache.set(key, entry);
  }
  entry.references += 1;
  const lease = entry;
  let gltf: GLTF | undefined;
  let visual: Object3D | undefined;
  const ownedMaterials = new Set<Material>();
  const ownedSkeletons = new Set<Skeleton>();
  try {
    gltf = await lease.promise;
    for (const action of Object.values(definition.actions)) {
      if (gltf.animations.filter((clip) => clip.name === action.clipName).length !== 1) {
        fail('ASSET_CLIP_NOT_FOUND', definition.id);
      }
    }
    if (definition.selectedNodeIndices) gltf.scene.traverse((object) => {
      if ((object as SkinnedMesh).isSkinnedMesh) fail('ASSET_SKINNED_NODE_SELECTION_UNSUPPORTED', definition.id);
    });
    visual = cloneSkeleton(gltf.scene);
    visual.traverse((object) => {
      if ((object as SkinnedMesh).isSkinnedMesh) ownedSkeletons.add((object as SkinnedMesh).skeleton);
    });
    selectNodes(gltf, visual, definition);
    const materialClones = new Map<Material, Material>();
    const cloneMaterial = (source: Material): Material => {
      let material = materialClones.get(source);
      if (!material) {
        material = source.clone();
        materialClones.set(source, material);
        ownedMaterials.add(material);
      }
      return material;
    };
    visual.traverse((object) => {
      const mesh = object as Mesh;
      if (mesh.isMesh) mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(cloneMaterial) : cloneMaterial(mesh.material);
    });
    const object = new Group();
    object.name = definition.id;
    // Keep entity placement separate from the correction applied to source visuals.
    const correction = new Group();
    correction.position.fromArray(definition.rootTransform.positionMetersXYZ);
    correction.rotation.set(...definition.rootTransform.rotationEulerRadiansXYZ);
    correction.scale.fromArray(definition.rootTransform.scaleXYZ);
    correction.add(visual);
    object.add(correction);
    const clips = gltf.animations.map((clip) => clip.clone());
    return createInstance(definition, object, visual, clips, key, lease, gltf, {
      materials: ownedMaterials, skeletons: ownedSkeletons, geometries: new Set(), textures: new Set(),
    });
  } catch (error) {
    try {
      runCleanup([
        ...[...ownedSkeletons].map((value) => () => value.dispose()),
        ...[...ownedMaterials].map((value) => () => value.dispose()),
        () => release(key, lease, gltf),
      ]);
    } catch { /* Preserve the original construction failure. */ }
    throw error;
  }
}
