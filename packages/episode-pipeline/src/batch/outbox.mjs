import {createHash,randomUUID} from 'node:crypto';
import {mkdir, readFile, readdir, writeFile,link,rm} from 'node:fs/promises';
import path from 'node:path';

/** Immutable delivery events. The consumer/unique cloud Job owns execution state. */
export async function enqueueDeliveredWorld({outboxRoot, worldBuildHash, profileHash, sourceManifestPath, sourceManifestSha256, episodeId}) {
  for (const value of [worldBuildHash, profileHash, sourceManifestSha256]) if (!/^[a-f0-9]{64}$/.test(value ?? '')) throw new Error('EPISODE_DELIVERY_IDENTITY_INVALID');
  if (!/^[a-z0-9][a-z0-9-]{2,119}$/.test(episodeId ?? '') || typeof sourceManifestPath !== 'string') throw new Error('EPISODE_DELIVERY_INVALID');
  const id = createHash('sha256').update(`${worldBuildHash}:${profileHash}`).digest('hex');
  const event = {kind:'three-episode-delivery-event',schemaVersion:1,id,worldBuildHash,profileHash,sourceManifestPath,sourceManifestSha256,episodeId,stopBeforeSeedance:true,createdAt:new Date().toISOString()};
  await mkdir(outboxRoot,{recursive:true}); const filename=path.join(outboxRoot,`${id}.json`);
  const temporary=path.join(outboxRoot,`.${id}-${randomUUID()}.part`);
  await writeFile(temporary,JSON.stringify(event,null,2)+'\n',{flag:'wx'});
  try { await link(temporary,filename); return {created:true,event}; }
  catch(error) { if(error.code!=='EEXIST')throw error; const prior=JSON.parse(await readFile(filename,'utf8')); if(prior.worldBuildHash!==worldBuildHash||prior.profileHash!==profileHash||prior.stopBeforeSeedance!==true)throw new Error('EPISODE_OUTBOX_IDENTITY_CONFLICT'); return {created:false,event:prior}; }
  finally {await rm(temporary,{force:true});}
}
export async function readDeliveryEvents(outboxRoot) {
  let names; try {names=await readdir(outboxRoot);}catch(error){if(error.code==='ENOENT')return [];throw error;}
  return Promise.all(names.filter(name=>/^[a-f0-9]{64}\.json$/.test(name)).sort().map(async name=>JSON.parse(await readFile(path.join(outboxRoot,name),'utf8'))));
}
