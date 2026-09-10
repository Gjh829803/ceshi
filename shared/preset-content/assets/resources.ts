/** Public, relocatable resource closure emitted and verified by the Creator compiler. */
const response = await fetch(new URL('./asset-definitions.json', document.baseURI));
if (!response.ok) throw new Error(`ASSET_CATALOG_LOAD_FAILED: ${response.status}`);
const catalog = await response.json();
export const definitions = Object.fromEntries(catalog.assets.map((asset: { id:string }) => [asset.id,asset]));
const resources = new Map<string,string>();
for (const asset of catalog.assets) for (const resource of asset.resources ?? []) {
  const previous=resources.get(resource.path);
  if(previous && previous!==resource.uri) throw new Error(`ASSET_RESOURCE_CONFLICT: ${resource.path}`);
  resources.set(resource.path,resource.uri);
}
export function resolvePresetResource(logicalPath:string):string {
  const normalized=logicalPath.replace(/^\/?assets\//,'');
  const uri=resources.get(normalized);
  if(!uri)throw new Error(`ASSET_RESOURCE_MISSING: ${normalized}`);
  return new URL(uri,document.baseURI).href;
}
