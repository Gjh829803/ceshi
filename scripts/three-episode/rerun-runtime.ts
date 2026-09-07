import {cp,mkdir,readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createCloudClient} from './cloud.mjs';
import {runEpisodeWorkflow} from './workflow.js';
const args=process.argv.slice(2),allowed=new Set(['--checkpoint-s3','--source-manifest','--output-root','--episode-id','--publish-s3']);
for(let i=0;i<args.length;i++){if(args[i]==='--stop-before-seedance')continue;if(!allowed.has(args[i]!)||!args[++i])throw new Error('EPISODE_RUNTIME_RERUN_ARGUMENT_INVALID');}
const get=(key:string)=>{const i=args.indexOf(key);return i<0?undefined:args[i+1]};
const checkpoint=get('--checkpoint-s3'),source=get('--source-manifest'),output=get('--output-root'),episodeId=get('--episode-id'),publishS3Prefix=get('--publish-s3');
if(!args.includes('--stop-before-seedance')||!checkpoint||!source||!output||!episodeId||!publishS3Prefix)throw new Error('EPISODE_RUNTIME_RERUN_ARGUMENT_REQUIRED');
const outputRoot=path.resolve(output),previousRoot=path.join(path.dirname(outputRoot),'previous-runtime');
const cloud=createCloudClient({onProgress:(event:unknown)=>process.stdout.write(JSON.stringify({kind:'episode-cloud-progress',event})+'\n')});
await cloud.hydrateDirectory(checkpoint,previousRoot);
const prior=JSON.parse(await readFile(path.join(previousRoot,'episode.json'),'utf8'));
if(prior.status!=='failed')throw new Error('EPISODE_RUNTIME_RERUN_REQUIRES_FAILED_PREDECESSOR');
try{await readFile(path.join(outputRoot,'episode.json'));throw new Error('EPISODE_RUNTIME_RERUN_REQUIRES_FRESH_STATE');}catch(error:any){if(error.code!=='ENOENT')throw error;}
const tasks=path.join(previousRoot,'visuals/tasks'),target=path.join(outputRoot,'visuals/tasks');await mkdir(target,{recursive:true});let copied=0;
for(const name of await readdir(tasks)){
 if(!/^(opening-anchor|style-image)-[a-f0-9]{24}$/.test(name))continue;
 const record=JSON.parse(await readFile(path.join(tasks,name,'stage.json'),'utf8'));
 if(record.status!=='completed')continue;
 const destination=path.join(target,name);
 if(!record.files?.every((file:any)=>typeof file.path==='string'&&file.path.startsWith(destination+path.sep)))throw new Error('EPISODE_IMAGE_CACHE_REQUIRES_SAME_OUTPUT_ROOT');
 await cp(path.join(tasks,name),destination,{recursive:true,errorOnExist:true,force:false});copied++;
}
process.stdout.write(JSON.stringify({kind:'episode-runtime-rerun',previousWorldBuildHash:prior.worldBuildHash,copiedCompletedImageRecipes:copied,reuseRequiresExactInputAndFileHashes:true})+'\n');
await runEpisodeWorkflow({sourceManifestPath:path.resolve(source),outputRoot,episodeId,publishS3Prefix,stopBeforeSeedance:true});
