import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup.js";
import type { AssetContainer, InstantiatedEntries } from "@babylonjs/core/assetContainer.js";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton.js";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";
import "@babylonjs/loaders/glTF/2.0/index.js";
import { isEqual, sortBy, uniq, uniqBy } from "lodash-es";

import { sha256Bytes } from "@whitebox-world/protocol";
import type {
  ExecutionSubjectAssetV1,
  SubjectAssetInventoryV1,
} from "@whitebox-world/runtime-contracts";

export interface SubjectAssetResolveRequestV1 {
  subjectAssetRef: string;
  artifactContentHash: string;
  byteLength: number;
  mediaType: "model/gltf-binary";
}

export interface ResolvedSubjectAssetBytesV1 {
  bytes: Uint8Array;
  sourceLabel: string;
}

export interface SubjectAssetResolverV1 {
  resolveSubjectAsset(
    request: SubjectAssetResolveRequestV1,
  ): Promise<ResolvedSubjectAssetBytesV1>;
}

export interface SubjectAssetInstanceV1 {
  rootNodes: readonly TransformNode[];
  meshes: readonly AbstractMesh[];
  skeletons: readonly Skeleton[];
  animationGroups: readonly AnimationGroup[];
  dispose(): void;
}

export interface SubjectAssetLeaseV1 {
  instantiate(subjectEntityId: string): SubjectAssetInstanceV1;
  release(): void;
}

export interface SubjectAssetRuntimeLimitsV1 {
  maxByteLengthBytes: number;
  maxMeshCount: number;
  maxVertexCount: number;
  maxTriangleCount: number;
  maxSkeletonCount: number;
  maxBoneCount: number;
  maxAnimationClipCount: number;
}

export interface SubjectAssetCacheOptionsV1 {
  runtimeLimits?: SubjectAssetRuntimeLimitsV1;
}

const DEFAULT_RUNTIME_LIMITS: SubjectAssetRuntimeLimitsV1 = Object.freeze({
  maxByteLengthBytes: 128 * 1024 * 1024,
  maxMeshCount: 256,
  maxVertexCount: 2_000_000,
  maxTriangleCount: 2_000_000,
  maxSkeletonCount: 8,
  maxBoneCount: 512,
  maxAnimationClipCount: 256,
});

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;

export type SubjectAssetRuntimeErrorCodeV1 =
  | "SUBJECT_ASSET_CACHE_DISPOSED"
  | "SUBJECT_ASSET_ANIMATION_INCOMPATIBLE"
  | "SUBJECT_ASSET_ANIMATION_MISSING"
  | "SUBJECT_ASSET_FORMAT_UNSUPPORTED"
  | "SUBJECT_ASSET_HASH_MISMATCH"
  | "SUBJECT_ASSET_INVENTORY_EXCEEDED"
  | "SUBJECT_ASSET_INVENTORY_MISMATCH"
  | "SUBJECT_ASSET_LEASE_RELEASED"
  | "SUBJECT_ASSET_LENGTH_MISMATCH"
  | "SUBJECT_ASSET_RESOLVE_FAILED"
  | "SUBJECT_ASSET_RESOLVER_REQUIRED"
  | "SUBJECT_ASSET_RIG_INCOMPATIBLE"
  | "SUBJECT_ASSET_ROOT_MOTION_UNSUPPORTED"
  | "SUBJECT_ASSET_SOCKET_BONE_MISSING";

const SUBJECT_ASSET_RUNTIME_ERROR_CODES = new Set<SubjectAssetRuntimeErrorCodeV1>([
  "SUBJECT_ASSET_ANIMATION_INCOMPATIBLE",
  "SUBJECT_ASSET_ANIMATION_MISSING",
  "SUBJECT_ASSET_CACHE_DISPOSED",
  "SUBJECT_ASSET_FORMAT_UNSUPPORTED",
  "SUBJECT_ASSET_HASH_MISMATCH",
  "SUBJECT_ASSET_INVENTORY_EXCEEDED",
  "SUBJECT_ASSET_INVENTORY_MISMATCH",
  "SUBJECT_ASSET_LEASE_RELEASED",
  "SUBJECT_ASSET_LENGTH_MISMATCH",
  "SUBJECT_ASSET_RESOLVE_FAILED",
  "SUBJECT_ASSET_RESOLVER_REQUIRED",
  "SUBJECT_ASSET_RIG_INCOMPATIBLE",
  "SUBJECT_ASSET_ROOT_MOTION_UNSUPPORTED",
  "SUBJECT_ASSET_SOCKET_BONE_MISSING",
]);

export class SubjectAssetRuntimeErrorV1 extends Error {
  readonly name = "SubjectAssetRuntimeErrorV1";
  readonly subjectAssetRef?: string;
  readonly artifactContentHash?: string;

  constructor(
    readonly code: SubjectAssetRuntimeErrorCodeV1,
    context?: {
      subjectAssetRef?: string;
      artifactContentHash?: string;
    },
  ) {
    super(`${code}: Subject Asset runtime contract failed.`);
    if (context?.subjectAssetRef !== undefined) {
      this.subjectAssetRef = context.subjectAssetRef;
    }
    if (context?.artifactContentHash !== undefined) {
      this.artifactContentHash = context.artifactContentHash;
    }
  }
}

export function isSubjectAssetRuntimeErrorV1(
  value: unknown,
): value is SubjectAssetRuntimeErrorV1 {
  return (
    value instanceof SubjectAssetRuntimeErrorV1 &&
    SUBJECT_ASSET_RUNTIME_ERROR_CODES.has(value.code)
  );
}

interface CacheEntryV1 {
  key: string;
  descriptor: ExecutionSubjectAssetV1;
  inventory: SubjectAssetInventoryV1;
  container: AssetContainer;
  refCount: number;
}

interface PendingEntryV1 {
  descriptor: ExecutionSubjectAssetV1;
  promise: Promise<CacheEntryV1>;
}

function assetDiagnostic(
  code: SubjectAssetRuntimeErrorCodeV1,
  asset: ExecutionSubjectAssetV1,
): SubjectAssetRuntimeErrorV1 {
  return new SubjectAssetRuntimeErrorV1(code, {
    subjectAssetRef: asset.subjectAssetRef,
    artifactContentHash: asset.artifactContentHash,
  });
}

function copyDescriptor(asset: ExecutionSubjectAssetV1): ExecutionSubjectAssetV1 {
  return {
    ...asset,
    inventory: {
      ...asset.inventory,
      animationClipNames: [...asset.inventory.animationClipNames],
    },
  };
}

function validateConfiguredLimits(
  configured: SubjectAssetRuntimeLimitsV1 | undefined,
): SubjectAssetRuntimeLimitsV1 {
  if (configured === undefined) return { ...DEFAULT_RUNTIME_LIMITS };
  if (configured === null || typeof configured !== "object" || Array.isArray(configured)) {
    throw new RangeError("Subject Asset runtime limits must be an object.");
  }
  for (const key of Object.keys(DEFAULT_RUNTIME_LIMITS) as Array<
    keyof SubjectAssetRuntimeLimitsV1
  >) {
    const value = configured[key];
    if (
      !Number.isFinite(value) ||
      !Number.isInteger(value) ||
      value <= 0 ||
      value > DEFAULT_RUNTIME_LIMITS[key]
    ) {
      throw new RangeError(
        `Subject Asset runtime limit '${key}' must be a finite positive integer no greater than ${DEFAULT_RUNTIME_LIMITS[key]}.`,
      );
    }
  }
  return { ...configured };
}

function validateDescriptorFormat(asset: ExecutionSubjectAssetV1): void {
  if (asset.mediaType !== "model/gltf-binary" || asset.format !== "glb") {
    throw assetDiagnostic("SUBJECT_ASSET_FORMAT_UNSUPPORTED", asset);
  }
}

function inventoryValues(inventory: SubjectAssetInventoryV1): readonly number[] {
  return [
    inventory.meshCount,
    inventory.vertexCount,
    inventory.triangleCount,
    inventory.skeletonCount,
    inventory.boneCount,
    inventory.animationClipNames.length,
  ];
}

function validateExpectedLimits(
  asset: ExecutionSubjectAssetV1,
  limits: SubjectAssetRuntimeLimitsV1,
): void {
  const inventory = asset.inventory;
  if (
    !Number.isFinite(asset.byteLength) ||
    !Number.isInteger(asset.byteLength) ||
    asset.byteLength < 0 ||
    inventoryValues(inventory).some(
      (value) => !Number.isFinite(value) || !Number.isInteger(value) || value < 0,
    )
  ) {
    throw assetDiagnostic("SUBJECT_ASSET_INVENTORY_MISMATCH", asset);
  }
  if (
    asset.byteLength > limits.maxByteLengthBytes ||
    inventory.meshCount > limits.maxMeshCount ||
    inventory.vertexCount > limits.maxVertexCount ||
    inventory.triangleCount > limits.maxTriangleCount ||
    inventory.skeletonCount > limits.maxSkeletonCount ||
    inventory.boneCount > limits.maxBoneCount ||
    inventory.animationClipNames.length > limits.maxAnimationClipCount
  ) {
    throw assetDiagnostic("SUBJECT_ASSET_INVENTORY_EXCEEDED", asset);
  }
}

function validateActualLimits(
  asset: ExecutionSubjectAssetV1,
  inventory: SubjectAssetInventoryV1,
  limits: SubjectAssetRuntimeLimitsV1,
): void {
  if (
    inventory.meshCount > limits.maxMeshCount ||
    inventory.vertexCount > limits.maxVertexCount ||
    inventory.triangleCount > limits.maxTriangleCount ||
    inventory.skeletonCount > limits.maxSkeletonCount ||
    inventory.boneCount > limits.maxBoneCount ||
    inventory.animationClipNames.length > limits.maxAnimationClipCount
  ) {
    throw assetDiagnostic("SUBJECT_ASSET_INVENTORY_EXCEEDED", asset);
  }
}

function normalizedInventory(inventory: SubjectAssetInventoryV1): SubjectAssetInventoryV1 {
  return {
    ...inventory,
    animationClipNames: sortBy(inventory.animationClipNames),
  };
}

function validateExactInventory(
  asset: ExecutionSubjectAssetV1,
  actual: SubjectAssetInventoryV1,
): void {
  if (!isEqual(normalizedInventory(asset.inventory), normalizedInventory(actual))) {
    throw assetDiagnostic("SUBJECT_ASSET_INVENTORY_MISMATCH", asset);
  }
}

function validateDescriptorConsistency(
  requested: ExecutionSubjectAssetV1,
  frozen: ExecutionSubjectAssetV1,
  actual?: SubjectAssetInventoryV1,
): void {
  if (requested.byteLength !== frozen.byteLength) {
    throw assetDiagnostic("SUBJECT_ASSET_LENGTH_MISMATCH", requested);
  }
  if (!isEqual(normalizedInventory(requested.inventory), normalizedInventory(frozen.inventory))) {
    throw assetDiagnostic("SUBJECT_ASSET_INVENTORY_MISMATCH", requested);
  }
  if (actual !== undefined) validateExactInventory(requested, actual);
}

function parseSelfContainedGlbJson(
  bytes: Uint8Array,
  asset: ExecutionSubjectAssetV1,
): Record<string, unknown> {
  const unsupported = (): never => {
    throw assetDiagnostic("SUBJECT_ASSET_FORMAT_UNSUPPORTED", asset);
  };
  if (bytes.byteLength < 12) unsupported();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint32(0, true) !== GLB_MAGIC ||
    view.getUint32(4, true) !== GLB_VERSION ||
    view.getUint32(8, true) !== bytes.byteLength
  ) {
    unsupported();
  }

  let cursor = 12;
  let json: Record<string, unknown> | undefined;
  let chunkIndex = 0;
  while (cursor < bytes.byteLength) {
    if (cursor + 8 > bytes.byteLength) unsupported();
    const chunkLength = view.getUint32(cursor, true);
    const chunkType = view.getUint32(cursor + 4, true);
    if (chunkLength % 4 !== 0 || cursor + 8 + chunkLength > bytes.byteLength) {
      unsupported();
    }
    if (chunkType === GLB_JSON_CHUNK_TYPE) {
      if (chunkIndex !== 0 || json !== undefined || chunkLength === 0) unsupported();
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(
          bytes.subarray(cursor + 8, cursor + 8 + chunkLength),
        );
        const parsed = JSON.parse(text) as unknown;
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          unsupported();
        }
        json = parsed as Record<string, unknown>;
      } catch {
        unsupported();
      }
    }
    cursor += 8 + chunkLength;
    chunkIndex += 1;
  }
  if (cursor !== bytes.byteLength || json === undefined) unsupported();
  const glbJson = json as Record<string, unknown>;

  for (const collectionName of ["buffers", "images"] as const) {
    const collection = glbJson[collectionName];
    if (collection === undefined) continue;
    if (!Array.isArray(collection)) unsupported();
    for (const item of collection as unknown[]) {
      if (item === null || typeof item !== "object" || Array.isArray(item)) unsupported();
      if (Object.hasOwn(item as Record<string, unknown>, "uri")) unsupported();
    }
  }
  const meshes = glbJson.meshes;
  if (meshes !== undefined) {
    if (!Array.isArray(meshes)) unsupported();
    for (const mesh of meshes as unknown[]) {
      if (mesh === null || typeof mesh !== "object" || Array.isArray(mesh)) unsupported();
      const primitives = (mesh as Record<string, unknown>).primitives;
      if (!Array.isArray(primitives)) unsupported();
      for (const primitive of primitives as unknown[]) {
        if (
          primitive === null ||
          typeof primitive !== "object" ||
          Array.isArray(primitive)
        ) {
          unsupported();
        }
        const record = primitive as Record<string, unknown>;
        if (
          !Number.isInteger(record.indices) ||
          (record.mode !== undefined && record.mode !== 4)
        ) {
          unsupported();
        }
      }
    }
  }
  return glbJson;
}

function validateForbiddenContainerContent(
  container: AssetContainer,
  asset: ExecutionSubjectAssetV1,
): void {
  const hasForbiddenTopLevel =
    container.cameras.length > 0 ||
    container.lights.length > 0 ||
    (container.sounds !== null && container.sounds.length > 0) ||
    container.actionManagers.length > 0;
  const hasMeshAction = container.meshes.some((mesh) => mesh.actionManager !== null);
  const hasNodeBehavior = container.getNodes().some((node) => node.behaviors.length > 0);
  if (hasForbiddenTopLevel || hasMeshAction || hasNodeBehavior) {
    throw assetDiagnostic("SUBJECT_ASSET_FORMAT_UNSUPPORTED", asset);
  }
}

function inspectContainerInventory(
  container: AssetContainer,
  asset: ExecutionSubjectAssetV1,
): SubjectAssetInventoryV1 {
  validateForbiddenContainerContent(container, asset);
  const renderableMeshes = container.meshes.filter(
    (mesh): mesh is Mesh => mesh instanceof Mesh && mesh.geometry !== null,
  );
  const geometries = uniqBy(
    renderableMeshes.map((mesh) => mesh.geometry!),
    (geometry) => geometry.uniqueId,
  );
  let vertexCount = 0;
  let triangleCount = 0;
  for (const geometry of geometries) {
    const indices = geometry.getIndices();
    if (indices === null || indices.length % 3 !== 0) {
      throw assetDiagnostic("SUBJECT_ASSET_FORMAT_UNSUPPORTED", asset);
    }
    vertexCount += geometry.getTotalVertices();
    triangleCount += indices.length / 3;
  }
  const clipNames = container.animationGroups.map((group) => group.name);
  if (uniq(clipNames).length !== clipNames.length) {
    throw assetDiagnostic("SUBJECT_ASSET_INVENTORY_MISMATCH", asset);
  }
  return {
    meshCount: renderableMeshes.length,
    vertexCount,
    triangleCount,
    skeletonCount: container.skeletons.length,
    boneCount: container.skeletons.reduce((sum, skeleton) => sum + skeleton.bones.length, 0),
    animationClipNames: sortBy(clipNames),
  };
}

class SubjectAssetInstance implements SubjectAssetInstanceV1 {
  private disposed = false;

  constructor(
    private readonly nativeEntries: InstantiatedEntries,
    readonly rootNodes: readonly TransformNode[],
    readonly meshes: readonly AbstractMesh[],
    readonly skeletons: readonly Skeleton[],
    readonly animationGroups: readonly AnimationGroup[],
    private readonly onDispose: (instance: SubjectAssetInstance) => void,
  ) {}

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.nativeEntries.dispose();
    this.onDispose(this);
  }
}

class SubjectAssetLease implements SubjectAssetLeaseV1 {
  private active = true;
  private readonly liveInstances = new Set<SubjectAssetInstance>();

  constructor(
    private readonly entry: CacheEntryV1,
    private readonly isCacheClosed: () => boolean,
    private readonly onRelease: (lease: SubjectAssetLease, entry: CacheEntryV1) => void,
  ) {}

  instantiate(subjectEntityId: string): SubjectAssetInstanceV1 {
    if (!this.active || this.isCacheClosed()) {
      throw assetDiagnostic("SUBJECT_ASSET_LEASE_RELEASED", this.entry.descriptor);
    }
    let nativeEntries: InstantiatedEntries;
    try {
      nativeEntries = this.entry.container.instantiateModelsToScene(
        (sourceName) => `${subjectEntityId}.${sourceName}`,
        false,
        { doNotInstantiate: true },
      );
    } catch {
      throw assetDiagnostic("SUBJECT_ASSET_FORMAT_UNSUPPORTED", this.entry.descriptor);
    }
    try {
      const rootNodes = nativeEntries.rootNodes.map((node) => {
        if (!(node instanceof TransformNode)) {
          throw assetDiagnostic("SUBJECT_ASSET_FORMAT_UNSUPPORTED", this.entry.descriptor);
        }
        return node;
      });
      const traversedMeshes = rootNodes.flatMap((root) => [
        ...(root instanceof AbstractMesh ? [root] : []),
        ...root.getChildMeshes(false),
      ]);
      const meshes = uniqBy(traversedMeshes, (mesh) => mesh.uniqueId);
      const skeletons = [...nativeEntries.skeletons];
      const animationGroups = [...nativeEntries.animationGroups];
      for (let index = 0; index < animationGroups.length; index += 1) {
        const sourceName = this.entry.container.animationGroups[index]?.name;
        if (sourceName !== undefined) animationGroups[index]!.name = sourceName;
      }
      const instance = new SubjectAssetInstance(
        nativeEntries,
        rootNodes,
        meshes,
        skeletons,
        animationGroups,
        (disposed) => this.liveInstances.delete(disposed),
      );
      this.liveInstances.add(instance);
      return instance;
    } catch (error) {
      try {
        nativeEntries.dispose();
      } catch {
        // Preserve the closed runtime failure below rather than leaking provider disposal text.
      }
      if (isSubjectAssetRuntimeErrorV1(error)) throw error;
      throw assetDiagnostic("SUBJECT_ASSET_FORMAT_UNSUPPORTED", this.entry.descriptor);
    }
  }

  release(): void {
    if (!this.active) return;
    this.active = false;
    for (const instance of [...this.liveInstances]) instance.dispose();
    this.onRelease(this, this.entry);
  }

  invalidateFromCache(): void {
    this.release();
  }
}

export class SubjectAssetCacheV1 {
  private readonly runtimeLimits: SubjectAssetRuntimeLimitsV1;
  private readonly entriesByKey = new Map<string, CacheEntryV1>();
  private readonly pendingByKey = new Map<string, PendingEntryV1>();
  private readonly leases = new Set<SubjectAssetLease>();
  private readonly disposedContainers = new WeakSet<AssetContainer>();
  private closed = false;
  private disposePromise: Promise<void> | undefined;

  constructor(
    private readonly scene: Scene,
    private readonly resolver?: SubjectAssetResolverV1,
    options?: SubjectAssetCacheOptionsV1,
  ) {
    this.runtimeLimits = validateConfiguredLimits(options?.runtimeLimits);
  }

  async acquire(asset: ExecutionSubjectAssetV1): Promise<SubjectAssetLeaseV1> {
    if (this.closed) throw assetDiagnostic("SUBJECT_ASSET_CACHE_DISPOSED", asset);
    validateDescriptorFormat(asset);
    validateExpectedLimits(asset, this.runtimeLimits);
    const key = `${asset.subjectAssetRef}\n${asset.artifactContentHash}`;

    let entry = this.entriesByKey.get(key);
    if (entry !== undefined) {
      validateDescriptorConsistency(asset, entry.descriptor, entry.inventory);
    } else {
      let pending = this.pendingByKey.get(key);
      if (pending !== undefined) {
        validateDescriptorConsistency(asset, pending.descriptor);
      } else {
        if (this.resolver === undefined) {
          throw assetDiagnostic("SUBJECT_ASSET_RESOLVER_REQUIRED", asset);
        }
        const descriptor = copyDescriptor(asset);
        const promise = this.loadEntry(key, descriptor);
        pending = { descriptor, promise };
        this.pendingByKey.set(key, pending);
        void promise
          .finally(() => {
            if (this.pendingByKey.get(key)?.promise === promise) {
              this.pendingByKey.delete(key);
            }
          })
          .catch(() => undefined);
      }
      try {
        entry = await pending.promise;
      } catch (error) {
        if (this.closed) throw assetDiagnostic("SUBJECT_ASSET_CACHE_DISPOSED", asset);
        throw error;
      }
      if (this.closed) throw assetDiagnostic("SUBJECT_ASSET_CACHE_DISPOSED", asset);
      validateDescriptorConsistency(asset, entry.descriptor, entry.inventory);
    }

    if (this.closed) throw assetDiagnostic("SUBJECT_ASSET_CACHE_DISPOSED", asset);
    entry.refCount += 1;
    const lease = new SubjectAssetLease(
      entry,
      () => this.closed,
      (releasedLease, releasedEntry) => {
        if (!this.leases.delete(releasedLease)) return;
        releasedEntry.refCount = Math.max(0, releasedEntry.refCount - 1);
      },
    );
    this.leases.add(lease);
    return lease;
  }

  dispose(): Promise<void> {
    if (this.disposePromise !== undefined) return this.disposePromise;
    this.closed = true;
    for (const lease of [...this.leases]) lease.invalidateFromCache();
    const pendingPromises = [...this.pendingByKey.values()].map((entry) => entry.promise);
    this.disposePromise = (async () => {
      await Promise.allSettled(pendingPromises);
      const entries = sortBy([...this.entriesByKey.values()], (entry) => entry.key).reverse();
      let firstDisposalError: unknown;
      for (const entry of entries) {
        try {
          this.disposeContainerOnce(entry.container);
        } catch (error) {
          firstDisposalError ??= error;
        }
      }
      this.entriesByKey.clear();
      this.pendingByKey.clear();
      if (firstDisposalError !== undefined) throw firstDisposalError;
    })();
    return this.disposePromise;
  }

  private async loadEntry(
    key: string,
    asset: ExecutionSubjectAssetV1,
  ): Promise<CacheEntryV1> {
    let resolved: ResolvedSubjectAssetBytesV1;
    try {
      const result = await this.resolver!.resolveSubjectAsset({
        subjectAssetRef: asset.subjectAssetRef,
        artifactContentHash: asset.artifactContentHash,
        byteLength: asset.byteLength,
        mediaType: asset.mediaType,
      });
      if (
        result === null ||
        typeof result !== "object" ||
        !(result.bytes instanceof Uint8Array) ||
        typeof result.sourceLabel !== "string"
      ) {
        throw assetDiagnostic("SUBJECT_ASSET_RESOLVE_FAILED", asset);
      }
      resolved = result;
    } catch {
      throw assetDiagnostic("SUBJECT_ASSET_RESOLVE_FAILED", asset);
    }
    const bytes = resolved.bytes;
    if (bytes.byteLength !== asset.byteLength) {
      throw assetDiagnostic("SUBJECT_ASSET_LENGTH_MISMATCH", asset);
    }
    if (sha256Bytes(bytes) !== asset.artifactContentHash) {
      throw assetDiagnostic("SUBJECT_ASSET_HASH_MISMATCH", asset);
    }
    parseSelfContainedGlbJson(bytes, asset);
    if (this.closed) throw assetDiagnostic("SUBJECT_ASSET_CACHE_DISPOSED", asset);

    let container: AssetContainer;
    try {
      const loaderBytes =
        bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
          ? bytes
          : bytes.slice();
      container = await LoadAssetContainerAsync(loaderBytes, this.scene, {
        pluginExtension: ".glb",
      });
    } catch {
      throw assetDiagnostic("SUBJECT_ASSET_FORMAT_UNSUPPORTED", asset);
    }
    try {
      const inventory = inspectContainerInventory(container, asset);
      validateActualLimits(asset, inventory, this.runtimeLimits);
      validateExactInventory(asset, inventory);
      if (this.closed) throw assetDiagnostic("SUBJECT_ASSET_CACHE_DISPOSED", asset);
      const entry: CacheEntryV1 = {
        key,
        descriptor: asset,
        inventory,
        container,
        refCount: 0,
      };
      this.entriesByKey.set(key, entry);
      return entry;
    } catch (error) {
      this.disposeContainerOnce(container);
      throw error;
    }
  }

  private disposeContainerOnce(container: AssetContainer): void {
    if (this.disposedContainers.has(container)) return;
    this.disposedContainers.add(container);
    container.dispose();
  }
}
