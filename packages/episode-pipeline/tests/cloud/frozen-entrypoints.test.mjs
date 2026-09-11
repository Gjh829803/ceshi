import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {episodeNodeArguments} from '../../src/cloud/frozen-entrypoints.mjs';
import {threeEpisodeHostJob} from '../../src/cloud/cloud-host.mjs';

const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const layouts={flatPackage:{batch:'packages/episode-pipeline/batch-cli.mjs',workflow:'packages/episode-pipeline/workflow.ts',host:'packages/episode-pipeline/cloud-host.mjs'},current:{batch:'packages/episode-pipeline/src/cli/batch-cli.mjs',workflow:'packages/episode-pipeline/src/workflow/workflow.ts',host:'packages/episode-pipeline/src/cloud/cloud-host.mjs'},legacy:{batch:'scripts/three-episode/batch-cli.mjs',workflow:'scripts/three-episode/workflow.ts',host:'scripts/cloud/three-episode-host.mjs'}};
function fixture(t,layout){
 const root=realpathSync(mkdtempSync(path.join(tmpdir(),'episode-frozen-layout-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 writeFileSync(path.join(root,'package.json'),JSON.stringify({type:'module'}));
 symlinkSync(path.join(repository,'node_modules'),path.join(root,'node_modules'));
 for(const [entry,file] of Object.entries(layouts[layout])){
  const target=path.join(root,file);mkdirSync(path.dirname(target),{recursive:true});
  writeFileSync(target,entry==='host'?`import {spawnSync} from 'node:child_process'; const child=spawnSync(process.execPath,process.argv.slice(3),{stdio:'inherit'});process.exitCode=child.status;`:`${entry==='workflow'?'const typedValue: number = 1;':''}console.log(JSON.stringify({layout:${JSON.stringify(layout)},args:process.argv.slice(2),entry:process.argv[1]}));`);
 }
 return root;
}
for(const layout of Object.keys(layouts)){
 for(const entry of ['batch','workflow'])test(`executes ${entry} from the ${layout} immutable layout with original arguments`,t=>{
  const root=fixture(t,layout),args=['--source-manifest','inputs/source.json','--stop-before-seedance'];
  const result=spawnSync(process.execPath,episodeNodeArguments(entry,args),{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);const value=JSON.parse(result.stdout);assert.equal(value.layout,layout);assert.deepEqual(value.args,args);assert.equal(value.entry,path.join(root,layouts[layout][entry]));
 });
 test(`CPU continuation uses the ${layout} archived host and workflow without changing pinned identity`,t=>{
  const root=fixture(t,layout),image=`registry/worker@sha256:${'a'.repeat(64)}`,sourceArchiveSha256='b'.repeat(64);
  const job=threeEpisodeHostJob({jobId:'episode-frozen',image,sourceArchiveS3Uri:'s3://bucket/frozen.tar.gz',sourceArchiveSha256,runArgs:episodeNodeArguments('workflow',['--stop-before-seedance'])});
  const container=job.spec.template.spec.containers[0];assert.equal(container.image,image);
  assert(job.spec.template.spec.initContainers[0].command.includes(sourceArchiveSha256));
  const hydration=job.spec.template.spec.initContainers[0].command[2];
  const check=hydration.slice(hydration.lastIndexOf('&&')+2).replaceAll('/episode/',root+'/');
  const admitted=spawnSync('sh',['-c',check],{cwd:root,encoding:'utf8'});assert.equal(admitted.status,0,admitted.stderr);
  const result=spawnSync(process.execPath,[...container.command.slice(1),...container.args],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).layout,layout);
 });
}
test('unknown frozen layout fails before executing an entrypoint',t=>{
 const root=mkdtempSync(path.join(tmpdir(),'episode-unknown-layout-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const result=spawnSync(process.execPath,episodeNodeArguments('batch',['worker']),{cwd:root,encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/EPISODE_FROZEN_ENTRYPOINT_MISSING/);assert.equal(result.stdout,'');
});

for(const layout of Object.keys(layouts))for(const overlayLayout of Object.keys(layouts))test(`executes ${layout} archive with ${overlayLayout} streaming overlay without mixing source layouts`,async t=>{
 const {applyStreamingOverlay}=await import('../../src/cloud/streaming-overlay.mjs');
 const {createHash}=await import('node:crypto');
 const {readFileSync}=await import('node:fs');
 const root=fixture(t,layout),overlayRoot=path.join(root,'overlay');mkdirSync(overlayRoot);
 writeFileSync(path.join(root,'source-identity.json'),JSON.stringify({identity:'frozen-source'}));
 const names=['report.ts','visuals.mjs','workflow.ts','candidate-policy.mjs','event-prefetch.mjs','fast-clip-package.mjs'],hashes={};
 const target=name=>layout==='current'?path.join(root,'packages/episode-pipeline/src',name==='workflow.ts'?'workflow':name==='report.ts'?'reporting':'visuals',name):path.join(root,path.dirname(layouts[layout].workflow),name);
 for(const name of names)mkdirSync(path.dirname(target(name)),{recursive:true});
 const structured=overlayLayout==='current';
 const modules={
  'report.ts':readFileSync(path.join(repository,'packages/episode-pipeline/src/reporting/report.ts'),'utf8'),
  'candidate-policy.mjs':readFileSync(path.join(repository,'packages/episode-pipeline/src/visuals/candidate-policy.mjs'),'utf8'),
  'visuals.mjs':`import {createCandidateRejectionGuard} from './candidate-policy.mjs';export const rejected=await createCandidateRejectionGuard({loadPolicy:async()=>({rejections:[{caseId:'case',styleId:'style',imageSha256:'anchor'}]}),episodeId:'case'})('style',{sha256:'anchor'});`,
  'workflow.ts':`import {renderEpisodeReport} from '${structured?'../reporting/report.js':'./report.js'}';import {rejected} from '${structured?'../visuals/visuals.mjs':'./visuals.mjs'}';import {readFileSync} from 'node:fs';const identity=JSON.parse(readFileSync(new URL('${structured?'../../../../':'../../'}source-identity.json',import.meta.url),'utf8')).identity;console.log(JSON.stringify({overlay:true,rejected,report:typeof renderEpisodeReport,identity}));`,
  'event-prefetch.mjs':'export const fixture=true;',
  'fast-clip-package.mjs':'export const fixture=true;',
 };
 for(const name of names){const bytes=modules[name];writeFileSync(path.join(overlayRoot,name),bytes);hashes[name]=createHash('sha256').update(bytes).digest('hex');}
 const job={metadata:{annotations:{}},spec:{template:{spec:{containers:[{resources:{requests:{cpu:'1'}}}],initContainers:[]}}}};
 const sourceLayout=overlayLayout==='current'?'structured-package':overlayLayout==='flatPackage'?'flat-package':undefined;
 applyStreamingOverlay(job,{image:`registry/overlay@sha256:${'c'.repeat(64)}`,hashes,...(sourceLayout?{sourceLayout}:{})});
 const command=job.spec.template.spec.initContainers[0].command;
 const code=command.at(-1).replaceAll('/episode/',root+'/').replaceAll('/opt/episode-streaming/',overlayRoot+'/');
 const result=spawnSync(process.execPath,[...command.slice(1,-1),code],{cwd:root,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 const execution=spawnSync(process.execPath,episodeNodeArguments('workflow',[]),{cwd:root,encoding:'utf8'});
 assert.equal(execution.status,0,execution.stderr);
 if(layout===overlayLayout){
  for(const name of names)assert.equal(readFileSync(target(name),'utf8'),readFileSync(path.join(overlayRoot,name),'utf8'));
  assert.deepEqual(JSON.parse(execution.stdout),{overlay:true,rejected:true,report:'function',identity:'frozen-source'});
 }else{
  assert.match(result.stdout,/retaining archived workflow/);
  assert.equal(JSON.parse(execution.stdout).layout,layout);
 }
});
