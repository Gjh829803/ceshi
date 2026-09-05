import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import {
  AnimationMixer, Group, LoopOnce, LoopRepeat,
  type AnimationAction, type BufferGeometry, type Material,
  type Mesh, type Object3D, type Skeleton, type SkinnedMesh, type Texture,
} from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { AssetDefinition, AssetInstance } from './contracts';

type LoadOptions = {
  baseUri?: string;
  fetchBytes?: (uri: string) => Promise<Uint8Array>;
};
type CacheEntry = { promise: Promise<GLTF>; references: number };
const cache = new Map<string, CacheEntry>();

function fail(code: string, id: string): never {
  throw new Error(`${code}: ${id}`);
}

function validateDefinition(definition: AssetDefinition): void {
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
  validateDefinition(definition);
  const uri = options.baseUri ? new URL(definition.uri, options.baseUri).href : definition.uri;
  const key = JSON.stringify([uri, definition.sha256, definition.byteLength]);
  let entry = cache.get(key);
  if (!entry) {
    const promise = (async () => {
      const bytes = await (options.fetchBytes ?? fetchAssetBytes)(uri);
      if (bytes.byteLength !== definition.byteLength) fail('ASSET_LENGTH_MISMATCH', definition.id);
      if (bytesToHex(sha256(bytes)) !== definition.sha256) fail('ASSET_HASH_MISMATCH', definition.id);
      checkEmbeddedGlb(bytes, definition.id);
      // Copy to an owned ArrayBuffer, including when fetchBytes returns a Buffer slice.
      return new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
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
    const mixer = new AnimationMixer(visual);
    let activeAction: AnimationAction | undefined;
    let activeActionId: string | undefined;
    let disposed = false;
    const ensureAlive = () => { if (disposed) fail('ASSET_DISPOSED', definition.id); };
    const loaded = gltf;
    return {
      object, clips, mixer,
      get currentActionId() { return activeActionId; },
      get currentClipName() { return activeAction?.getClip().name; },
      play(actionId) {
        ensureAlive();
        if (!Object.hasOwn(definition.actions, actionId)) fail('ASSET_ACTION_UNAVAILABLE', `${definition.id}/${actionId}`);
        const binding = definition.actions[actionId]!;
        const clip = clips.find((candidate) => candidate.name === binding.clipName)!;
        const next = mixer.clipAction(clip);
        // Repeated locomotion selection must not restart the same running clip.
        if (next === activeAction && next.isRunning()) return;
        next.reset().setLoop(binding.loop ? LoopRepeat : LoopOnce, binding.loop ? Infinity : 1);
        next.clampWhenFinished = !binding.loop;
        next.setEffectiveTimeScale(binding.timeScale).setEffectiveWeight(1).play();
        if (activeAction && activeAction !== next) {
          if (binding.blendSeconds > 0) next.crossFadeFrom(activeAction, binding.blendSeconds, false);
          else activeAction.stop();
        }
        activeAction = next;
        activeActionId = actionId;
      },
      update(deltaSeconds) {
        ensureAlive();
        if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) fail('ASSET_DELTA_INVALID', definition.id);
        mixer.update(deltaSeconds);
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        runCleanup([
          () => mixer.stopAllAction(),
          () => mixer.uncacheRoot(visual!),
          () => object.removeFromParent(),
          ...[...ownedSkeletons].map((value) => () => value.dispose()),
          ...[...ownedMaterials].map((value) => () => value.dispose()),
          () => release(key, lease, loaded),
        ]);
      },
    };
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
