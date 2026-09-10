import type {AssetCatalogEntry} from './compiler';
import type {CreatorProfile} from './contracts';
/** Catalog semantics plus frozen Host eligibility; never changes asset permission. */
export function mountUsage(asset:AssetCatalogEntry,profile:CreatorProfile,allowedIds:readonly string[],workspaceRuntime=false){
 const metadata=asset.integrationMetadata;if(metadata?.classification!=='ground-mount')return undefined;
 const requiredAssetIds=metadata.requiredAssetIds as string[];
 const missingAssetIds=requiredAssetIds.filter(id=>!allowedIds.includes(id));
 const assetAvailable=allowedIds.includes(asset.id),integrationReady=profile==='three-sdk'&&missingAssetIds.length===0&&!workspaceRuntime;
 return {assetId:asset.id,...metadata,assetAvailable,missingAssetIds,integrationReady,
  runtimeAuthority:workspaceRuntime?'workspace-sdk-source':'host-sdk-baseline',
  ...(workspaceRuntime?{integrationStatus:'unverified-workspace-runtime',runtimeDefinitionsTool:{tool:'creator_get_authoring_schema',arguments:{topic:'mounted-interaction',sections:['humanoid']}}}:{}),
  ...(integrationReady?{schemaTopic:'mounted-interaction',exampleTopic:'mounted-interaction'}:{}),
  limitations:[...asset.limitations,...(profile==='three-raw'?['This raw profile has no Player controller; loading model clips alone supplies no mounted gameplay.']:[])],
 };
}
