import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export interface CatalogResource {
  uri: string;
  sourcePath: string;
  sha256: string;
  byteLength: number;
  /** Stable logical name consumed by asset-specific loaders. */
  path?: string;
}

export function publicCatalogValue(value: unknown): any {
  if (Array.isArray(value)) return value.map(publicCatalogValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'sourcePath').map(([key, child]) => [key, publicCatalogValue(child)]));
  return value;
}

export function catalogResources(asset: CatalogResource & { resources?: CatalogResource[] }): CatalogResource[] {
  const resources = [asset, ...(asset.resources ?? [])];
  const seen = new Map<string, CatalogResource>();
  for (const resource of resources) {
    if (!/^\.\/assets\/(?:subjects|resources)\/[a-f0-9]{64}\.[a-z0-9]+$/.test(resource.uri)
      || !/^[a-f0-9]{64}$/.test(resource.sha256)
      || !resource.uri.includes(`/${resource.sha256}.`)
      || !Number.isSafeInteger(resource.byteLength) || resource.byteLength <= 0) throw new Error('THREE_ASSET_RESOURCE_INVALID');
    const prior = seen.get(resource.uri);
    if (prior && (prior.sha256 !== resource.sha256 || prior.byteLength !== resource.byteLength)) throw new Error('THREE_ASSET_RESOURCE_CONFLICT');
    seen.set(resource.uri, resource);
  }
  return [...seen.values()];
}

export async function readCatalogResource(repositoryRoot: string, resource: CatalogResource): Promise<Buffer> {
  const source = path.resolve(repositoryRoot, resource.sourcePath);
  const relative = path.relative(repositoryRoot, source);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('THREE_ASSET_SOURCE_ESCAPE');
  let cursor = repositoryRoot;
  for (const part of relative.split(path.sep)) {
    cursor = path.join(cursor, part);
    if ((await lstat(cursor)).isSymbolicLink()) throw new Error('THREE_ASSET_SOURCE_ESCAPE');
  }
  if (await realpath(source) !== source) throw new Error('THREE_ASSET_SOURCE_ESCAPE');
  const bytes = await readFile(source);
  if (bytes.length !== resource.byteLength || createHash('sha256').update(bytes).digest('hex') !== resource.sha256) throw new Error('THREE_ASSET_HASH_MISMATCH');
  return bytes;
}
