import {readLibraryResource} from './library-source.mjs';

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
  return readLibraryResource(repositoryRoot,resource);
}
