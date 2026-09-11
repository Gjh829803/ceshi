import {createHash} from 'node:crypto';
/** Explicit non-secret CPU attempt routing; never changes the frozen GPU capsule. */
export function applyCpuRouting(job,routing){
 if(!routing)return job;
 for(const key of ['codexAccountIds','imageAccountIds'])if(!Array.isArray(routing[key])||!routing[key].length||routing[key].length>10||new Set(routing[key]).size!==routing[key].length||routing[key].some(id=>!/^[a-zA-Z0-9_-]{1,128}$/.test(id)))throw Error('EPISODE_CPU_ROUTING_INVALID');
 const selected={codexAccountIds:routing.codexAccountIds,imageAccountIds:routing.imageAccountIds};
 const hash=createHash('sha256').update(JSON.stringify(selected)).digest('hex');
 const container=job.spec.template.spec.containers[0],args=container.args.slice(1);
 if(container.args[0]!=='--run'||!args.includes('--stop-before-seedance'))throw Error('EPISODE_CPU_ROUTING_HOST_INVALID');
 const code=`import {readFileSync,writeFileSync} from 'node:fs';import {spawn} from 'node:child_process';const file='.codex-tmp/three-episode-runtime.json';const config=JSON.parse(readFileSync(file,'utf8'));Object.assign(config,${JSON.stringify(selected)});writeFileSync(file,JSON.stringify(config));console.log(JSON.stringify({kind:'episode-cpu-routing',sha256:${JSON.stringify(hash)}}));const child=spawn(process.execPath,${JSON.stringify(args)},{stdio:'inherit',env:process.env});process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve(code??1));});`;
 container.args=['--run','--input-type=module','--eval',code,'--','--stop-before-seedance'];
 job.metadata.annotations['worldkit.seedleap.dev/cpu-routing-sha256']=hash;return job;
}
