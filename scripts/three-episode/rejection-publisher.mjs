import path from 'node:path';import{writeFile,rename}from'node:fs/promises';import{execFile}from'node:child_process';import{promisify}from'node:util';
const execute=promisify(execFile);
export function createRejectionPublisher(root,s3Uri){
 if(!s3Uri)return()=>{};
 if(!/^s3:\/\/[a-z0-9.-]+\/.+\.json$/.test(s3Uri))throw Error('REVIEW_POLICY_URI_INVALID');
 let chain=Promise.resolve();const file=path.join(root,'human-ten/rejected-candidates.json');
 return state=>{const policy={kind:'three-episode-human-rejection-policy',schemaVersion:1,authority:'user',revision:state.history.length,rejections:Object.values(state.reviews).filter(r=>r.verdict==='needs-work').map(({caseId,styleId,imageSha256,updatedAt})=>({caseId,styleId,imageSha256,updatedAt}))};
  chain=chain.then(async()=>{await writeFile(file+'.part',JSON.stringify(policy));await rename(file+'.part',file);await execute('aws',['s3','cp','--only-show-errors',file,s3Uri,'--region','us-east-2'],{timeout:20000});await writeFile(file+'.sync.json',JSON.stringify({status:'synced',revision:policy.revision,at:new Date().toISOString()}));}).catch(async e=>{await writeFile(file+'.sync.json',JSON.stringify({status:'pending',revision:policy.revision,error:e.message}));});
 };
}
