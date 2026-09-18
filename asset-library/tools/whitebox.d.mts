export interface WhiteboxResource {
  path?: string;
  uri: string;
  sourcePath: string;
  sha256: string;
  byteLength: number;
}
export interface WhiteboxAsset extends WhiteboxResource {
  id: string;
  contentVersion: string;
  displayName: string;
  resources?: WhiteboxResource[];
  [key: string]: unknown;
}
export interface WhiteboxCatalog { schemaVersion: 1; assets: WhiteboxAsset[]; }
export function buildWhiteboxCatalog(root?: string, options?: {allVersions?:boolean}): WhiteboxCatalog;
export function syncWhiteboxCatalog(root?: string, check?: boolean): WhiteboxCatalog;
