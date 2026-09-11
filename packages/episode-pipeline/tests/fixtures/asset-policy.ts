import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {assetPolicyHash,createAssetPolicySnapshot} from '@worldkit/creator-host/asset-policy';

/** A complete carried policy for fixtures that select no supplied assets. */
export async function writeFixtureAssetPolicy(playableRoot:string):Promise<string>{
  const bytes=Buffer.from('fixture humanoid'),hash=createHash('sha256').update(bytes).digest('hex');
  const asset={id:'humanoid.fixture',uri:`./assets/subjects/${hash}.glb`,sha256:hash,byteLength:bytes.length,
    recommendedBody:{heightMeters:1.8,radiusMeters:.3},locomotionBindingIds:['locomotion.ground'],
    actions:Object.fromEntries(['idle','walk','run','jump'].map(id=>[id,{clipName:id}]))};
  const snapshot=createAssetPolicySnapshot({schemaVersion:1,allowedAssetIds:[asset.id],defaultHumanoidAssetId:asset.id,allowCustomAssets:true},[asset]);
  await writeFile(path.join(playableRoot,'asset-policy.json'),JSON.stringify(snapshot));
  await writeFile(path.join(playableRoot,'asset-definitions.json'),JSON.stringify({schemaVersion:1,assets:[]}));
  return assetPolicyHash(snapshot);
}
