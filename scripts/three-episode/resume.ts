import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createCloudClient} from './cloud.mjs';
import {runEpisodeWorkflow} from './workflow.js';

const args=process.argv.slice(2),allowed=new Set(['--checkpoint-s3','--source-manifest','--output-root','--publish-s3']);
for(let i=0;i<args.length;i++){if(args[i]==='--stop-before-seedance')continue;if(!allowed.has(args[i]!)||!args[++i])throw new Error('EPISODE_RESUME_ARGUMENT_INVALID');}
const get=(flag:string)=>{const index=args.indexOf(flag);return index<0?undefined:args[index+1];};
if(!args.includes('--stop-before-seedance'))throw new Error('EPISODE_REQUIRES_PRE_SEEDANCE_STOP');
const checkpoint=get('--checkpoint-s3'),sourceManifest=get('--source-manifest'),output=get('--output-root'),publishS3Prefix=get('--publish-s3');
if(!checkpoint||!sourceManifest||!output||!publishS3Prefix)throw new Error('EPISODE_RESUME_ARGUMENT_REQUIRED');
const cloud=createCloudClient({onProgress:(event:unknown)=>process.stdout.write(JSON.stringify({kind:'episode-cloud-progress',event})+'\n')});
await cloud.hydrateDirectory(checkpoint,path.resolve(output));
const prior=JSON.parse(await readFile(path.join(output,'episode.json'),'utf8'));
if(prior.status!=='failed'&&!String(prior.status).startsWith('paused-'))throw new Error('EPISODE_RESUME_REQUIRES_STOPPED_ATTEMPT');
const planRelative=path.relative(path.resolve(output),prior.planPath??'');
if(!planRelative||planRelative.startsWith('..')||path.isAbsolute(planRelative))throw new Error('EPISODE_RESUME_REQUIRES_SAME_OUTPUT_ROOT');
await runEpisodeWorkflow({sourceManifestPath:path.resolve(sourceManifest),outputRoot:path.resolve(output),episodeId:prior.episodeId,cloud,publishS3Prefix,stopBeforeSeedance:true});
