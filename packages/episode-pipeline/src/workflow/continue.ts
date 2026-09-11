import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadEpisodeSource} from '../source/source.js';
import {canonicalHash,PRE_SEEDANCE_PROFILE,validateEpisodePlan} from '../contracts.js';
import {createCloudClient} from '../cloud/cloud.mjs';
import {runEpisodeWorkflow} from './workflow.js';

const args=process.argv.slice(2), allowed=new Set(['--source-manifest','--route-plan','--route-evidence','--prior-source-manifest','--output-root','--episode-id','--publish-s3','--checkpoint-s3']);
for(let i=0;i<args.length;i++){if(args[i]==='--stop-before-seedance')continue;if(!allowed.has(args[i]!)||!args[++i])throw Error('EPISODE_CONTINUE_ARGUMENT_INVALID');}
const value=(key:string)=>{const i=args.indexOf(key);if(i<0)throw Error(`EPISODE_CONTINUE_ARGUMENT_REQUIRED: ${key}`);return args[i+1]!};
if(!args.includes('--stop-before-seedance'))throw Error('EPISODE_REQUIRES_PRE_SEEDANCE_STOP');
const sourceManifestPath=path.resolve(value('--source-manifest')),outputRoot=path.resolve(value('--output-root')),episodeId=value('--episode-id');
const source=await loadEpisodeSource(sourceManifestPath), priorBytes=await readFile(value('--prior-source-manifest')),priorSource=JSON.parse(priorBytes.toString());
const planPath=path.resolve(value('--route-plan')), plan=validateEpisodePlan(JSON.parse(await readFile(planPath,'utf8')),{worldBuildHash:source.worldBuildHash}),evidence=JSON.parse(await readFile(value('--route-evidence'),'utf8'));
if(evidence.status!=='submitted'||evidence.planHash!==canonicalHash(plan)||evidence.sourceManifestSha256!==createHash('sha256').update(priorBytes).digest('hex')||!evidence.calls?.some((c:any)=>c.tool==='episode_submit_plan'&&c.status==='succeeded'))throw Error('EPISODE_CONTINUE_ROUTE_RECEIPT_INVALID');
for(const key of ['worldBuildHash','sourceHash','runtimeHash'] as const)if(source[key]!==evidence[key]||source[key]!==priorSource[key])throw Error('EPISODE_CONTINUE_WORLD_CHANGED');
if(canonicalHash(source.playableFiles)!==canonicalHash(priorSource.playableFiles)||canonicalHash(source.sourceFiles)!==canonicalHash(priorSource.sourceFiles))throw Error('EPISODE_CONTINUE_FILES_CHANGED');
await mkdir(outputRoot,{recursive:true});
const statePath=path.join(outputRoot,'episode.json');
const checkpointIndex=args.indexOf('--checkpoint-s3');
if(checkpointIndex>=0){
 try{await readFile(statePath);throw Error('EPISODE_CONTINUE_CHECKPOINT_REQUIRES_FRESH_OUTPUT');}catch(error:any){if(error.code!=='ENOENT')throw error;}
 await createCloudClient().hydrateDirectory(args[checkpointIndex+1]!,outputRoot);
 const stopped=JSON.parse(await readFile(statePath,'utf8'));
 if(stopped.status!=='failed'&&!String(stopped.status).startsWith('paused-'))throw Error('EPISODE_CONTINUE_CHECKPOINT_REQUIRES_STOPPED_RUN');
}

try{await readFile(statePath);}catch(error:any){
 if(error.code!=='ENOENT')throw error;
 await writeFile(statePath,JSON.stringify({kind:'three-episode-run',schemaVersion:1,episodeId,worldId:source.worldId,worldBuildHash:source.worldBuildHash,sourceWorldBuildHash:source.sourceWorldBuildHash,runtimeHash:source.runtimeHash,profile:PRE_SEEDANCE_PROFILE,status:'paused-before-capture',stage:'planned',createdAt:new Date().toISOString(),planPath,planHash:canonicalHash(plan),segments:[],providerVideoSubmissionCount:0,planRepairsBySegment:{},continuedRouteEvidenceSha256:createHash('sha256').update(await readFile(value('--route-evidence'))).digest('hex')},null,2));
}
await runEpisodeWorkflow({sourceManifestPath,outputRoot,episodeId,publishS3Prefix:value('--publish-s3'),stopBeforeSeedance:true});
