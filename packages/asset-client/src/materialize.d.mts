import type { Artifact, AssetManifest, ProjectLock } from '@worldkit/asset-contracts';
import type { RegistryClient } from './registry-client.mjs';
export interface CacheOptions { client?: RegistryClient; cacheRoot: string; offline?: boolean; }
export function readArtifact(artifact: Artifact, options: CacheOptions): Promise<Buffer>;
export function materializeAssets(lock: ProjectLock, options: CacheOptions & { outputRoot?: string }): Promise<{ files: Record<string, string>; manifests: AssetManifest[]; lock: ProjectLock }>;
