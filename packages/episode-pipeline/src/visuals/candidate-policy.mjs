import path from 'node:path';import{readFile}from'node:fs/promises';
export function createCandidateRejectionGuard({episodeId,outputRoot,cloud,policyUri=process.env.WORLDKIT_HUMAN_REJECTION_POLICY_S3_URI,loadPolicy}){
 let cache={rejections:[]},at=0;
 return async(styleId,anchor)=>{
  if(loadPolicy)cache=await loadPolicy();
  else if(policyUri&&Date.now()-at>15000){const file=path.join(outputRoot,'control/human-rejections.json');await cloud.downloadArtifact(policyUri,file);cache=JSON.parse(await readFile(file,'utf8'));at=Date.now();}
  if(!Array.isArray(cache.rejections))throw Error('EPISODE_REJECTION_POLICY_INVALID');
  return cache.rejections.some(r=>r.caseId===episodeId&&r.styleId===styleId&&r.imageSha256===anchor?.sha256);
 };
}
