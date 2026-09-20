import type { Artifact, ArtifactLocation, AssetManifest, ManifestRef, RegistryDescriptor, SearchRequest, SearchResponse, CompatibilityRequest, CompatibilityResult, ResourceScopeRequest, ResourceScope, ResolveRequest, ProjectLock } from '@worldkit/asset-contracts';
export interface RegistryClientOptions { registryUrl: string; artifactBaseUrl?: string; fetch?: typeof globalThis.fetch; }
export class RegistryClient {
  constructor(options: RegistryClientOptions);
  descriptor(options?: { snapshotId?: string }): Promise<RegistryDescriptor>;
  searchAssets(request?: SearchRequest): Promise<SearchResponse>;
  describeAsset(assetId: string, options?: { version?: string; snapshotId?: string }): Promise<AssetManifest>;
  checkCompatibility(request: CompatibilityRequest): Promise<CompatibilityResult>;
  resourceScope(request: ResourceScopeRequest): Promise<ResourceScope>;
  resolveAssembly(request: ResolveRequest): Promise<ProjectLock>;
  locateArtifact(artifactId: string): Promise<ArtifactLocation>;
  fetchManifest(ref: ManifestRef, options?: { snapshotId?: string }): Promise<AssetManifest>;
  fetchManifestBytes(ref: ManifestRef, options?: { snapshotId?: string }): Promise<Uint8Array>;
  fetchArtifact(artifact: Artifact): Promise<Uint8Array>;
}
export function sha256(bytes: Uint8Array): Promise<string>;
export function verifyLock(lock: ProjectLock): Promise<ProjectLock>;
export function parseManifest(bytes: Uint8Array, ref: ManifestRef): AssetManifest;
