import type {AssetManifest,RegistryDescriptor,SearchRequest,SearchResponse,CompatibilityRequest,CompatibilityResult,ResolveRequest,ProjectLock,ArtifactLocation,ResourceScopeRequest,ResourceScope} from '../client/contracts/index.mjs';
export class RegistryStore {
 constructor(root:string,options?:{artifactBaseUrl?:string});
 descriptor(options?:{snapshotId?:string;snapshot_id?:string}):RegistryDescriptor;
 searchAssets(request?:SearchRequest):SearchResponse;
 search(request?:SearchRequest):SearchResponse;
 describeAsset(id:string,options?:{version?:string;snapshotId?:string;snapshot_id?:string}):AssetManifest;
 describe(id:string,options?:{version?:string;snapshotId?:string;snapshot_id?:string}):AssetManifest;
 checkCompatibility(request:CompatibilityRequest):CompatibilityResult;
 resolveAssembly(request:ResolveRequest):ProjectLock;
 resolve(request:ResolveRequest):ProjectLock;
 resourceScope(request:ResourceScopeRequest):ResourceScope;
 locateArtifact(artifactId:string,options?:{baseUrl?:string}):ArtifactLocation;
}
