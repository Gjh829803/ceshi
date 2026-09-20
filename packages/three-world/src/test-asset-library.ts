// Test fixtures resolve SDK logical IDs through the library's generated adapter.
// Keep this helper out of runtime entrypoints and independent of Creator Host.
import catalog from '../../../asset-library/dist/whitebox/asset-catalog.json';

type FixtureResource = {path?: string; sourcePath: string; sha256: string; byteLength: number};
const resources = new Map<string, FixtureResource>();
for (const asset of catalog.assets) {
  for (const resource of [asset, ...('resources' in asset ? asset.resources ?? [] : [])] as FixtureResource[]) {
    if (!resource.path) continue;
    const existing = resources.get(resource.path);
    if (existing && (existing.sha256 !== resource.sha256 || existing.byteLength !== resource.byteLength)) {
      throw new Error(`TEST_ASSET_RESOURCE_CONFLICT: ${resource.path}`);
    }
    if (!resource.sourcePath.startsWith('asset-library/')) throw new Error(`TEST_ASSET_SOURCE_INVALID: ${resource.path}`);
    resources.set(resource.path, resource);
  }
}

export function testAssetResourceSourcePath(logical: string): string {
  const resource = resources.get(logical);
  if (!resource) throw new Error(`TEST_ASSET_RESOURCE_UNDECLARED: ${logical}`);
  return resource.sourcePath;
}

export function testAssetResourceUrl(logical: string): string {
  return new URL('../../../' + testAssetResourceSourcePath(logical), import.meta.url).href;
}
