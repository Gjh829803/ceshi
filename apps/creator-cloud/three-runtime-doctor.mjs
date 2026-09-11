#!/usr/bin/env node
// Native Linux integration doctor: actual required MCP, compilation, WebGL,
// interactive preview and cache reuse, with no Codex/model call and no auth environment.
import {readFile,writeFile,mkdir,mkdtemp,symlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readRuntimeLock,executionEnvironment,prepareSessionDirectories,THREE_PROFILES,THREE_TOOLS,THREE_TOOL_VERSION,sha256,fileSha256,writeJson} from './three-eval-runtime.mjs';
// Pinned to the existing Creator Host context in packages/creator-host/src/tools/tools.ts.
const HOST_VIEWPORT_PIXELS={width:960,height:540};
export function createDoctorBrowserPlan(durationSeconds=4) {
 if(!Number.isFinite(durationSeconds)||durationSeconds<3||durationSeconds>15)throw new Error('Doctor duration must be within [3,15]');
 return {
  preview:{view:'opening'},playtest:{framesPerSecond:3},debugPlaytest:{durationSeconds:durationSeconds/2,framesPerSecond:3},triviews:{},submit:{},
  episode:{schemaVersion:1,steps:[{keysDown:['w'],durationSeconds:durationSeconds-.5},{keysUp:['w'],durationSeconds:.5}],targets:[]},
 };
}
export function createDoctorDeliveryGate({truncated,complete,playtest,validation}) {
 assert.equal(truncated.status,'failed');assert.match(truncated.error,/THREE_SUBMIT_PLAYTEST_REQUIRED/);
 assert.equal(playtest.status,'passed');assert.equal(playtest.executionMode,'full-episode');assert.equal(playtest.isCompleteEpisode,true);assert.equal(playtest.capturedInput,true);
 assert.equal(complete.status,'succeeded');const delivery=complete.result;
 assert.equal(delivery.kind,'three-creator-delivery');assert.equal(delivery.technicalStatus,'passed');
 for(const field of ['sourceHash','worldBuildHash','runtimeHash']){assert.equal(playtest[field],validation[field]);assert.equal(delivery[field],validation[field]);}
 assert.equal(delivery.episodeHash,playtest.episodeHash);
 for(const field of ['actualWallSeconds','inputWallSeconds','activePlaySeconds']){assert(Number.isFinite(playtest[field])&&playtest[field]>0);assert.equal(delivery[field],playtest[field]);}
 assert(Number.isFinite(playtest.videoMetadata?.durationSeconds)&&playtest.videoMetadata.durationSeconds>0);assert.equal(delivery.videoMetadata?.durationSeconds,playtest.videoMetadata.durationSeconds);
 assert(/^[a-f0-9]{64}$/.test(delivery.archiveSha256));assert(Number.isSafeInteger(delivery.archiveByteLength)&&delivery.archiveByteLength>0);
 return {status:'passed',technicalDeliveryVerified:true,
  truncatedEpisode:{status:'rejected',operationId:truncated.id,error:truncated.error},
  completeEpisode:{status:'delivered',operationId:complete.id,sourceHash:delivery.sourceHash,worldBuildHash:delivery.worldBuildHash,episodeHash:delivery.episodeHash,activePlaySeconds:delivery.activePlaySeconds,inputWallSeconds:delivery.inputWallSeconds,videoDurationSeconds:delivery.videoMetadata.durationSeconds,archiveSha256:delivery.archiveSha256,archiveByteLength:delivery.archiveByteLength}};
}
export function createDoctorCommands(entityId) {
 return {
  supported:[{type:'humanoid.set-camera-mode',mode:1},{type:'humanoid.set-camera-mode',mode:0}],
  forbidden:{type:'actor.move-to',entityId,targetPositionWorldMetersXYZ:[99,0,99]},
 };
}
/** Host-only runnable fixture; Agent snippets contain caller-supplied bindings. */
export async function loadDoctorFixture(toolkitRoot,profile,nodeBinary,env) {
 if(!THREE_PROFILES.includes(profile))throw new Error('Invalid profile');
 const program=`import {RAW_EXAMPLE,SDK_EXAMPLE} from './packages/creator-host/src/discovery/examples.ts';
 const profile=${JSON.stringify(profile)};
 process.stdout.write(JSON.stringify({
  'index.html':'<!doctype html><script type="module" src="./main.ts"></script>',
  'main.ts':profile==='three-raw'?RAW_EXAMPLE:SDK_EXAMPLE,
  'project.json':JSON.stringify({schemaVersion:1,assetIds:profile==='three-sdk'?['humanoid.uefn-mannequin']:[]})
 }));`;
 const {stdout}=await promisify(execFile)(nodeBinary,['--import',path.join(toolkitRoot,'node_modules/tsx/dist/loader.mjs'),'--input-type=module','-e',program],{cwd:toolkitRoot,env,timeout:30000,maxBuffer:1024*1024});
 return JSON.parse(stdout);
}
async function main() {
const options={},argv=process.argv.slice(2);
for(let i=0;i<argv.length;i+=2){if(!['--runtime-lock','--output-root','--profile','--duration-seconds'].includes(argv[i])||!argv[i+1]||options[argv[i]])throw new Error('Invalid doctor argument');options[argv[i]]=argv[i+1];}
if(!options['--runtime-lock']||!options['--output-root'])throw new Error('Use --runtime-lock <installed draft/ready lock> --output-root <new Host doctor directory>');
const lock=await readRuntimeLock(path.resolve(options['--runtime-lock']),{requireReady:false,checkInstalled:true});
const profiles=options['--profile']?[options['--profile']]:THREE_PROFILES;
if(profiles.some(profile=>!THREE_PROFILES.includes(profile)))throw new Error('Invalid profile');
const durationSeconds=Number(options['--duration-seconds']??4);
const browserPlan=createDoctorBrowserPlan(durationSeconds);
const outputRoot=path.resolve(options['--output-root']);
if(outputRoot===lock.toolkitRoot||outputRoot.startsWith(lock.toolkitRoot+path.sep))throw new Error('Doctor workspace must be external to SDK');
await mkdir(outputRoot,{recursive:true});
const {Client}=await import(pathToFileURL(path.join(lock.toolkitRoot,'node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js')).href);
const {StdioClientTransport}=await import(pathToFileURL(path.join(lock.toolkitRoot,'node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js')).href);
const report={kind:'three-creator-installed-runtime-doctor',schemaVersion:1,status:'running',startedAt:new Date().toISOString(),runtimeLockHash:lock.runtimeHash,modelCalls:0,authenticationEnvironmentPassed:false,preRunInstalledClosure:'passed',profiles:[]};
try{
 for(const profile of profiles){
  const workspace=await mkdtemp(path.join(outputRoot,profile+'-')),env=executionEnvironment(lock,workspace,{profile});await prepareSessionDirectories(env, lock);
  const entry={profile,workspace,status:'running',toolResponses:[]};report.profiles.push(entry);
  const bridge=path.join(path.dirname(fileURLToPath(import.meta.url)),'three-eval-mcp-bridge.mjs');
  const transport=new StdioClientTransport({command:lock.nodeBinary,args:[bridge,'--runtime-lock',lock.runtimeLockPath,'--workspace',workspace,'--profile',profile,'--doctor-draft-lock'],cwd:lock.toolkitRoot,env,stderr:'pipe'});
  const client=new Client({name:'three-host-no-model-doctor',version:'1.0.0'});let stderr='';
  try{
   await client.connect(transport);transport.stderr?.on('data',bytes=>{stderr=(stderr+bytes.toString()).slice(-32000);});
   const listed=await client.listTools();assert.deepEqual(listed.tools.map(t=>t.name).sort(),[...THREE_TOOLS].sort());entry.requiredMcpToolCount=listed.tools.length;
   const call=async(name,args={})=>{const response=await client.callTool({name,arguments:args},undefined,{timeout:90000});entry.toolResponses.push({name,response});if(response.isError)throw new Error(JSON.stringify(response));const text=response.content.find(block=>block.type==='text')?.text;assert(text);return {value:JSON.parse(text),response};};
   const operation=async(name,args={},expectedFailure)=>{let response=await call(name,args);assert(response.value.operationId);const id=response.value.operationId;const deadline=Date.now()+(durationSeconds+180)*1000;do{response=await call('operations_get',{operationId:id,waitSeconds:25});if(response.value.status==='succeeded'){assert.equal(expectedFailure,undefined,'Doctor expected the truncated episode submission to be rejected');return response;}if(response.value.status==='failed'&&expectedFailure){assert.match(response.value.error,new RegExp(expectedFailure));return response;}if(['failed','cancelled'].includes(response.value.status))throw new Error(JSON.stringify(response.value));}while(Date.now()<deadline);throw new Error('THREE_DOCTOR_OPERATION_TIMEOUT');};
   const environment=(await call('creator_describe_environment')).value;assert.equal(environment.profile,profile);assert.equal(environment.engine,'three@0.185.1');assert.equal(environment.version,THREE_TOOL_VERSION);assert.equal(environment.sdkVersion,profile==='three-sdk'?THREE_TOOL_VERSION:null);assert.equal(environment.browserObservationContract,profile==='three-sdk'?'WorldObservation-v2':'WorldObservation-v1');entry.environment=environment;
   await call('creator_get_authoring_schema');const binding=(await call('creator_get_examples')).value;
   assert.equal(binding.exampleKind,'binding-snippet');assert.equal(binding.requiresAuthoredScene,true);assert.equal(typeof binding.files['main.ts'],'string');
   const fixture=await loadDoctorFixture(lock.toolkitRoot,profile,lock.nodeBinary,env);
   for(const name of ['index.html','main.ts','project.json']){assert.equal(typeof fixture[name],'string');await writeFile(path.join(workspace,name),fixture[name]);}
   await writeJson(path.join(workspace,'episode.json'),browserPlan.episode);
   // Model LWDP's task-root scratch using synthetic files only. This must be
   // excluded before traversal; no real platform account directory is inspected.
   const platformScratch=path.join(workspace,'scratch');await mkdir(platformScratch);
   await writeJson(path.join(platformScratch,'session.json'),{syntheticHostSession:true,revision:1});
   await symlink('session.json',path.join(platformScratch,'helper'));
   const validation=(await operation('world_validate')).value.result;assert.equal(validation.profile,profile);assert.equal(validation.runtimeCacheHit,true);assert.equal(validation.runtimeHash,lock.prebuiltRuntimes[profile].runtimeHash);entry.validation=validation;
   const preview=await operation('world_preview',browserPlan.preview);const image=preview.response.content.find(block=>block.type==='image');assert(image&&image.mimeType==='image/png');const bytes=Buffer.from(image.data,'base64');assert.equal(sha256(bytes),preview.value.result.image.sha256);assert(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));entry.opening={path:path.join(workspace,'.host-doctor/opening.png'),sha256:sha256(bytes),widthPixels:bytes.readUInt32BE(16),heightPixels:bytes.readUInt32BE(20)};assert.equal(entry.opening.widthPixels,HOST_VIEWPORT_PIXELS.width,'Host opening must fill the pinned viewport width');assert.equal(entry.opening.heightPixels,HOST_VIEWPORT_PIXELS.height,'Host opening must fill the pinned viewport height');
   // Evidence stays under hidden Host storage so it never changes authored sourceHash.
   await mkdir(path.join(workspace,'.host-doctor'),{recursive:true});await writeFile(path.join(workspace,'.host-doctor/opening.png'),bytes);
   entry.inspection=(await operation('world_inspect')).value.result;
   if(profile==='three-sdk'){
    const initial=entry.inspection.observation.snapshot,entityId=initial.controlledEntityId;assert.equal(initial.schemaVersion,2);assert.equal(initial.isRunning,false);assert.equal(typeof entityId,'string');entry.commandChecks=[];
    const requests=createDoctorCommands(entityId);
    for(const request of requests.supported){
     const command=(await operation('world_execute_command',{command:request})).value.result;
     assert.equal(command.worldCommandReceipt.status,'applied');assert.equal(typeof command.worldCommandReceipt.commandId,'string');assert(command.worldCommandReceipt.commandId.length>0);assert.equal(command.sourceHash,validation.sourceHash);assert.equal(command.worldBuildHash,validation.worldBuildHash);assert.equal(command.after.isRunning,false);assert.equal(command.after.simulationTick,initial.simulationTick);assert.notEqual(command.before.humanoid.cameraMode,request.mode);assert.equal(command.after.humanoid.cameraMode,request.mode);entry.commandChecks.push(command);
    }
    const forbidden=(await operation('world_execute_command',{command:requests.forbidden})).value.result;
    assert.equal(forbidden.worldCommandReceipt.status,'rejected');assert.equal(forbidden.worldCommandReceipt.error.code,'PLAYER_INPUT_OWNS_ACTOR');assert.equal(forbidden.sourceHash,validation.sourceHash);assert.equal(forbidden.worldBuildHash,validation.worldBuildHash);assert.equal(forbidden.after.isRunning,false);assert.equal(forbidden.after.simulationTick,initial.simulationTick);assert.deepEqual(forbidden.after.entities.find(entity=>entity.id===entityId).positionWorldMetersXYZ,forbidden.before.entities.find(entity=>entity.id===entityId).positionWorldMetersXYZ);entry.commandChecks.push(forbidden);
   }
   entry.debugPlaytest=(await operation('world_playtest',browserPlan.debugPlaytest)).value.result;
   assert.equal(entry.debugPlaytest.status,'passed');assert.equal(entry.debugPlaytest.executionMode,'debug');assert.equal(entry.debugPlaytest.isCompleteEpisode,false);assert.equal(entry.debugPlaytest.capturedInput,true);
   assert.deepEqual(entry.debugPlaytest.pageErrors,[]);assert.deepEqual(entry.debugPlaytest.runtimeErrors,[]);assert.deepEqual(entry.debugPlaytest.blockedNetworkRequests,[]);
   assert(entry.debugPlaytest.travelledMeters>0.1);assert(entry.debugPlaytest.inputWallSeconds>=browserPlan.debugPlaytest.durationSeconds-.05);assert(entry.debugPlaytest.activePlaySeconds>=browserPlan.debugPlaytest.durationSeconds-.05);assert(entry.debugPlaytest.videoMetadata.durationSeconds>0);assert(entry.debugPlaytest.videoMetadata.frameCount>0);
   assert.equal(entry.debugPlaytest.sourceHash,validation.sourceHash);assert.equal(entry.debugPlaytest.worldBuildHash,validation.worldBuildHash);assert.equal(entry.debugPlaytest.runtimeHash,validation.runtimeHash);
   await writeJson(path.join(platformScratch,'session.json'),{syntheticHostSession:true,revision:2});
   const sourceAfterHostMutation=(await operation('world_validate')).value.result;
   assert.equal(sourceAfterHostMutation.sourceHash,validation.sourceHash);assert.equal(sourceAfterHostMutation.worldBuildHash,validation.worldBuildHash);assert.equal(sourceAfterHostMutation.candidateCacheHit,true);
   entry.platformScratchIsolation={syntheticFixture:true,rootSymlinkNotTraversed:true,hostJsonMutationKeepsSourceHash:true,hostJsonMutationKeepsWorldBuildHash:true};
   await operation('world_preview',browserPlan.preview);
   entry.captures=(await operation('world_capture_triviews',browserPlan.triviews)).value.result;assert.deepEqual(entry.captures.pageErrors,[]);assert(entry.captures.images.length>=3);assert(entry.captures.images.some(image=>image.view==='top-down'));assert.equal(entry.captures.worldBuildHash,validation.worldBuildHash);
   const rejected=(await operation('world_submit',browserPlan.submit,'THREE_SUBMIT_PLAYTEST_REQUIRED')).value;
   entry.playtest=(await operation('world_playtest',browserPlan.playtest)).value.result;
   assert.equal(entry.playtest.status,'passed');assert.equal(entry.playtest.executionMode,'full-episode');assert.equal(entry.playtest.isCompleteEpisode,true);assert.equal(entry.playtest.capturedInput,true);
   assert.deepEqual(entry.playtest.pageErrors,[]);assert.deepEqual(entry.playtest.runtimeErrors,[]);assert.deepEqual(entry.playtest.blockedNetworkRequests,[]);
   assert(entry.playtest.travelledMeters>0.1);assert(entry.playtest.inputWallSeconds>=durationSeconds-.05);assert(entry.playtest.activePlaySeconds>=durationSeconds-.05);assert(entry.playtest.videoMetadata.frameCount>0);
   entry.captures=(await operation('world_capture_triviews',browserPlan.triviews)).value.result;assert.deepEqual(entry.captures.pageErrors,[]);assert(entry.captures.images.length>=3);assert(entry.captures.images.some(image=>image.view==='top-down'));assert.equal(entry.captures.worldBuildHash,validation.worldBuildHash);
   const complete=(await operation('world_submit',browserPlan.submit)).value;
   assert.equal(await fileSha256(complete.result.archivePath),complete.result.archiveSha256);
   entry.deliveryGate=createDoctorDeliveryGate({truncated:rejected,complete,playtest:entry.playtest,validation});
   entry.status='passed';
  }catch(error){entry.status='failed';entry.error=error.stack??String(error);throw error;}
  finally{await client.close().catch(()=>{});await writeFile(path.join(workspace,'.host-doctor-stderr.log'),stderr);await writeJson(path.join(workspace,'.host-doctor-evidence.json'),entry);delete entry.toolResponses;}
 }
 report.status='passed';
}catch(error){report.status='failed';report.error=error.stack??String(error);process.exitCode=1;}
finally{
 try{await readRuntimeLock(lock.runtimeLockPath,{requireReady:false,checkInstalled:true});report.postRunInstalledClosure='passed';}
 catch(error){report.postRunInstalledClosure='failed';report.postRunInstalledClosureError=error.stack??String(error);report.status='failed';process.exitCode=1;}
 report.finishedAt=new Date().toISOString();await writeJson(path.join(outputRoot,'runtime-doctor.json'),report);console.log(JSON.stringify({status:report.status,modelCalls:0,report:path.join(outputRoot,'runtime-doctor.json'),error:report.error??report.postRunInstalledClosureError}));
}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
