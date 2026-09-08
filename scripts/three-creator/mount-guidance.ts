import type {AssetCatalogEntry} from './compiler';
import type {CreatorProfile} from './contracts';
/** Catalog semantics plus frozen Host eligibility; never changes asset permission. */
export function mountUsage(asset:AssetCatalogEntry,profile:CreatorProfile,allowedIds:readonly string[]){
 const metadata=asset.integrationMetadata;if(metadata?.classification!=='ground-mount')return undefined;
 const requiredAssetIds=metadata.requiredAssetIds as string[];
 const missingAssetIds=requiredAssetIds.filter(id=>!allowedIds.includes(id));
 const assetAvailable=allowedIds.includes(asset.id),integrationReady=profile==='three-sdk'&&missingAssetIds.length===0;
 return {assetId:asset.id,...metadata,assetAvailable,missingAssetIds,integrationReady,
  ...(integrationReady?{schemaTopic:'mounted-interaction',exampleTopic:'mounted-interaction'}:{}),
  limitations:[...asset.limitations,...(profile==='three-raw'?['This raw profile has no Training controller; loading model clips alone supplies no mounted gameplay.']:[])],
 };
}
