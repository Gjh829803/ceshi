export interface LibraryResource {sourcePath:string;sha256:string;byteLength:number;uri:string;path?:string}
export type LibraryCatalogEntry=Record<string,any>&LibraryResource&{id:string;resources?:LibraryResource[]};
export function assetLibraryRoot(repositoryRoot:string):string;
export function assetLibraryUrl():string|null;
import type {ProjectLock,ResolveRequest} from '@worldkit/asset-contracts';
export interface LibraryOptions {assetIds?:string[];policySnapshotPath?:string|undefined;policyAssetIds?:string[]}
export function assetRegistryUrl():string|null;
export function prepareAssetLibrary(repositoryRoot:string,options?:LibraryOptions):Promise<LibraryCatalogEntry[]>;
export function readLibraryCatalog(repositoryRoot:string,options?:LibraryOptions):Promise<LibraryCatalogEntry[]>;
export function readLibraryCatalogSync(repositoryRoot:string):LibraryCatalogEntry[];
export function readLibraryResource(repositoryRoot:string,resource:LibraryResource):Promise<Buffer>;
export function readLibraryDeniedHashes(repositoryRoot:string,allowedIds:string[]):string[];
export function resolveLibrarySelection(repositoryRoot:string,ids:string[],options?:{runtimeDigest?:string;overridesDigest?:string;allowedAssetIds?:string[];runtimeId?:string;runtimeVersion?:string;authorRuntime?:boolean}):Promise<{manifest:ResolveRequest;lock:ProjectLock}|null>;
export function materializeLibrarySelection(repositoryRoot:string,lock:ProjectLock,options?:{outputRoot?:string;offline?:boolean}):Promise<{files:Record<string,string>;manifests:import('@worldkit/asset-contracts').AssetManifest[];lock:ProjectLock}>;
