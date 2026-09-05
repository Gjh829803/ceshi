#!/usr/bin/env node
// Native Linux integration doctor: actual required MCP, compilation, WebGL,
// interactive preview and cache reuse, with no Codex/model call and no auth environment.
import {readFile,writeFile,mkdir,mkdtemp,symlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {readRuntimeLock,executionEnvironment,prepareSessionDirectories,THREE_PROFILES,THREE_TOOLS,THREE_TOOL_VERSION,sha256,fileSha256,writeJson} from './three-eval-runtime.mjs';
import {isPassingDelivery} from './three-eval-statistics.mjs';
// Pinned to the existing Creator Host context in scripts/three-creator/tools.ts.
const HOST_VIEWPORT_PIXELS={width:960,height:540};
const options={},argv=process.argv.slice(2);
for(let i=0;i<argv.length;i+=2){if(!['--runtime-lock','--output-root','--profile','--duration-seconds'].includes(argv[i])||!argv[i+1]||options[argv[i]])throw new Error('Invalid doctor argument');options[argv[i]]=argv[i+1];}
if(!options['--runtime-lock']||!options['--output-root'])throw new Error('Use --runtime-lock <installed draft/ready lock> --output-root <new Host doctor directory>');
const lock=await readRuntimeLock(path.resolve(options['--runtime-lock']),{requireReady:false,checkInstalled:true});
const profiles=options['--profile']?[options['--profile']]:THREE_PROFILES;
if(profiles.some(profile=>!THREE_PROFILES.includes(profile)))throw new Error('Invalid profile');
const durationSeconds=Number(options['--duration-seconds']??4);
if(!Number.isFinite(durationSeconds)||durationSeconds<3||durationSeconds>15)throw new Error('Doctor duration must be within [3,15]');
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
   const operation=async(name,args={})=>{let response=await call(name,args);assert(response.value.operationId);const id=response.value.operationId;const deadline=Date.now()+(durationSeconds+180)*1000;do{response=await call('operations_get',{operationId:id,waitSeconds:25});if(response.value.status==='succeeded')return response;if(['failed','cancelled'].includes(response.value.status))throw new Error(JSON.stringify(response.value));}while(Date.now()<deadline);throw new Error('THREE_DOCTOR_OPERATION_TIMEOUT');};
   const environment=(await call('creator_describe_environment')).value;assert.equal(environment.profile,profile);assert.equal(environment.engine,'three@0.185.1');assert.equal(environment.version,THREE_TOOL_VERSION);assert.equal(environment.sdkVersion,profile==='three-sdk'?THREE_TOOL_VERSION:null);assert.equal(environment.browserObservationContract,profile==='three-sdk'?'WorldObservation-v2':'WorldObservation-v1');entry.environment=environment;
   await call('creator_get_authoring_schema');const examples=(await call('creator_get_examples')).value;
   for(const name of ['index.html','main.ts','project.json']){assert.equal(typeof examples.files[name],'string');await writeFile(path.join(workspace,name),examples.files[name]);}
   // Model LWDP's task-root scratch using synthetic files only. This must be
   // excluded before traversal; no real platform account directory is inspected.
   const platformScratch=path.join(workspace,'scratch');await mkdir(platformScratch);
   await writeJson(path.join(platformScratch,'session.json'),{syntheticHostSession:true,revision:1});
   await symlink('session.json',path.join(platformScratch,'helper'));
   const validation=(await operation('world_validate')).value.result;assert.equal(validation.profile,profile);assert.equal(validation.runtimeCacheHit,true);assert.equal(validation.runtimeHash,lock.prebuiltRuntimes[profile].runtimeHash);entry.validation=validation;
   const preview=await operation('world_preview',{view:'opening'});const image=preview.response.content.find(block=>block.type==='image');assert(image&&image.mimeType==='image/png');const bytes=Buffer.from(image.data,'base64');assert.equal(sha256(bytes),preview.value.result.image.sha256);assert(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));entry.opening={path:path.join(workspace,'.host-doctor/opening.png'),sha256:sha256(bytes),widthPixels:bytes.readUInt32BE(16),heightPixels:bytes.readUInt32BE(20)};assert.equal(entry.opening.widthPixels,HOST_VIEWPORT_PIXELS.width,'Host opening must fill the pinned viewport width');assert.equal(entry.opening.heightPixels,HOST_VIEWPORT_PIXELS.height,'Host opening must fill the pinned viewport height');
   // Evidence stays under hidden Host storage so it never changes authored sourceHash.
   await mkdir(path.join(workspace,'.host-doctor'),{recursive:true});await writeFile(path.join(workspace,'.host-doctor/opening.png'),bytes);
   entry.inspection=(await operation('world_inspect')).value.result;
   if(profile==='three-sdk'){
    const initial=entry.inspection.observation.snapshot,entityId=initial.controlledEntityId;assert.equal(initial.schemaVersion,2);assert.equal(initial.isRunning,false);assert.equal(typeof entityId,'string');entry.commandChecks=[];
    for(const isVisible of [false,true]){
     const command=(await operation('world_execute_command',{command:{type:'entity.set-visible',entityId,isVisible}})).value.result;
     assert.equal(command.worldCommandReceipt.status,'applied');assert.equal(typeof command.worldCommandReceipt.commandId,'string');assert(command.worldCommandReceipt.commandId.length>0);assert.equal(command.sourceHash,validation.sourceHash);assert.equal(command.worldBuildHash,validation.worldBuildHash);assert.equal(command.after.isRunning,false);assert.equal(command.after.simulationTick,initial.simulationTick);assert.equal(command.after.entities.find(entity=>entity.id===entityId).isVisibleLocal,isVisible);entry.commandChecks.push(command);
    }
   }
   const before=(await operation('world_preview',{view:'current'})).value.result;
   const moved=await operation('world_preview',{view:'current',input:{keys:['w'],durationSeconds}});
   entry.previewInput=moved.value.result;assert(moved.response.content.some(block=>block.type==='image'));assert.deepEqual(entry.previewInput.pageErrors,[]);assert.deepEqual(entry.previewInput.runtimeErrors,[]);assert.deepEqual(entry.previewInput.blockedNetworkRequests,[]);
   assert(Math.hypot(...entry.previewInput.observation.positionMetersXYZ.map((value,index)=>value-before.observation.positionMetersXYZ[index]))>0.1);
   assert.equal(entry.previewInput.observation.isRunning,false);
   await writeJson(path.join(platformScratch,'session.json'),{syntheticHostSession:true,revision:2});
   const sourceAfterHostMutation=(await operation('world_validate')).value.result;
   assert.equal(sourceAfterHostMutation.sourceHash,validation.sourceHash);assert.equal(sourceAfterHostMutation.worldBuildHash,validation.worldBuildHash);assert.equal(sourceAfterHostMutation.candidateCacheHit,true);
   entry.platformScratchIsolation={syntheticFixture:true,rootSymlinkNotTraversed:true,hostJsonMutationKeepsSourceHash:true,hostJsonMutationKeepsWorldBuildHash:true};
   await operation('world_preview',{view:'opening'});
   await operation('world_capture_triviews');const submitted=(await operation('world_submit')).value.result;assert(isPassingDelivery(submitted,profile));assert.equal(submitted.schemaVersion,2);assert.equal(submitted.validationMode,'interactive-preview');assert.equal(submitted.creatorRuntimeLockHash,lock.runtimeHash);assert.equal(submitted.runtimeHash,lock.prebuiltRuntimes[profile].runtimeHash);assert.equal(submitted.archivePath,path.join(workspace,'creator-delivery.tar.gz'));assert.equal(await fileSha256(submitted.archivePath),submitted.archiveSha256);assert.deepEqual(JSON.parse(await readFile(path.join(workspace,'creator-result.json'),'utf8')),submitted);entry.delivery=submitted;
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
