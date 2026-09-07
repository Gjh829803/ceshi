import {createHash} from 'node:crypto';
/** Apply a pinned CPU workflow upgrade after unpacking the immutable capture capsule. */
export function applyStreamingOverlay(job,overlay){
 if(!overlay)return job;
 const names=['report.ts','visuals.mjs','workflow.ts'],allowed=[...names,'candidate-policy.mjs','event-prefetch.mjs','fast-clip-package.mjs'];
 if(!/^\S+@sha256:[a-f0-9]{64}$/.test(overlay.image??'')||(!names.every(n=>overlay.hashes?.[n])||Object.keys(overlay.hashes??{}).some(n=>!allowed.includes(n)))||Object.values(overlay.hashes).some(v=>!(/^[a-f0-9]{64}$/).test(v)))throw Error('EPISODE_STREAMING_OVERLAY_INVALID');
 const spec=job.spec.template.spec;if(spec.containers.some(c=>c.resources?.requests?.['nvidia.com/gpu']))throw Error('EPISODE_STREAMING_OVERLAY_CPU_ONLY');
 if(overlay.policyS3Uri){if(!/^s3:\/\/[a-z0-9.-]+\/.+\.json$/.test(overlay.policyS3Uri))throw Error('EPISODE_POLICY_URI_INVALID');for(const c of spec.containers){c.env??=[];c.env.push({name:'WORLDKIT_HUMAN_REJECTION_POLICY_S3_URI',value:overlay.policyS3Uri});}}
 const code=`import{readFileSync,copyFileSync}from'node:fs';import{createHash}from'node:crypto';const expected=${JSON.stringify(overlay.hashes)};for(const [name,sha]of Object.entries(expected)){const p='/opt/episode-streaming/'+name;if(createHash('sha256').update(readFileSync(p)).digest('hex')!==sha)throw Error('OVERLAY_HASH_MISMATCH');copyFileSync(p,'/episode/scripts/three-episode/'+name);}console.log('Verified streaming overlay installed');`;
 spec.initContainers.push({name:'install-streaming-overlay',image:overlay.image,command:['node','--input-type=module','--eval',code],resources:{requests:{cpu:'100m',memory:'128Mi'},limits:{cpu:'1',memory:'512Mi'}},volumeMounts:[{name:'workspace',mountPath:'/episode'}]});
 job.metadata.annotations['worldkit.seedleap.dev/streaming-overlay-sha256']=createHash('sha256').update(JSON.stringify(overlay)).digest('hex');
 return job;
}
