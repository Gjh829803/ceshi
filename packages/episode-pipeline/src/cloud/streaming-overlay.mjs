import {episodeEntrypointCandidates} from './frozen-entrypoints.mjs';
import {createHash} from 'node:crypto';
/** Apply a pinned CPU workflow upgrade after unpacking the immutable capture capsule. */
export function applyStreamingOverlay(job,overlay){
 if(!overlay)return job;
 const names=['report.ts','visuals.mjs','workflow.ts'],allowed=[...names,'candidate-policy.mjs','event-prefetch.mjs','fast-clip-package.mjs'];
 if(!/^\S+@sha256:[a-f0-9]{64}$/.test(overlay.image??'')||(!names.every(n=>overlay.hashes?.[n])||Object.keys(overlay.hashes??{}).some(n=>!allowed.includes(n)))||Object.values(overlay.hashes).some(v=>!(/^[a-f0-9]{64}$/).test(v)))throw Error('EPISODE_STREAMING_OVERLAY_INVALID');
 const spec=job.spec.template.spec;if(spec.containers.some(c=>c.resources?.requests?.['nvidia.com/gpu']))throw Error('EPISODE_STREAMING_OVERLAY_CPU_ONLY');
 if(overlay.policyS3Uri){if(!/^s3:\/\/[a-z0-9.-]+\/.+\.json$/.test(overlay.policyS3Uri))throw Error('EPISODE_POLICY_URI_INVALID');for(const c of spec.containers){c.env??=[];c.env.push({name:'WORLDKIT_HUMAN_REJECTION_POLICY_S3_URI',value:overlay.policyS3Uri});}}
 const candidates=episodeEntrypointCandidates('workflow').map(file=>'/episode/'+file);
 // Existing overlays were built for scripts/three-episode. Their pinned bytes
 // include relative imports and repository-root calculations for that layout.
 const sourceLayout=overlay.sourceLayout??'legacy';
 if(!['legacy','flat-package','structured-package'].includes(sourceLayout))throw Error('EPISODE_STREAMING_OVERLAY_LAYOUT_INVALID');
 const structuredPaths={'report.ts':'../reporting/report.ts','visuals.mjs':'../visuals/visuals.mjs','workflow.ts':'workflow.ts','candidate-policy.mjs':'../visuals/candidate-policy.mjs','event-prefetch.mjs':'../visuals/event-prefetch.mjs','fast-clip-package.mjs':'../visuals/fast-clip-package.mjs'};
 const code=`import{readFileSync,copyFileSync,existsSync}from'node:fs';import path from'node:path';import{createHash}from'node:crypto';const workflow=${JSON.stringify(candidates)}.find(file=>existsSync(file));if(!workflow)throw Error('EPISODE_FROZEN_ENTRYPOINT_MISSING');const layout=workflow.endsWith('/src/workflow/workflow.ts')?'structured-package':workflow.endsWith('/packages/episode-pipeline/workflow.ts')?'flat-package':'legacy';if(layout!==${JSON.stringify(sourceLayout)}){console.log('Streaming overlay targets a different source layout; retaining archived workflow');process.exit(0);}const destination=path.dirname(workflow),destinations=layout==='structured-package'?${JSON.stringify(structuredPaths)}:null;const expected=${JSON.stringify(overlay.hashes)};for(const [name,sha]of Object.entries(expected)){const p='/opt/episode-streaming/'+name;if(createHash('sha256').update(readFileSync(p)).digest('hex')!==sha)throw Error('OVERLAY_HASH_MISMATCH');}for(const name of Object.keys(expected))copyFileSync('/opt/episode-streaming/'+name,path.join(destination,destinations?.[name]??name));console.log('Verified streaming overlay installed');`;
 spec.initContainers.push({name:'install-streaming-overlay',image:overlay.image,command:['node','--input-type=module','--eval',code],resources:{requests:{cpu:'100m',memory:'128Mi'},limits:{cpu:'1',memory:'512Mi'}},volumeMounts:[{name:'workspace',mountPath:'/episode'}]});
 job.metadata.annotations['worldkit.seedleap.dev/streaming-overlay-sha256']=createHash('sha256').update(JSON.stringify(overlay)).digest('hex');
 return job;
}
