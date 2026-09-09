import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ThreeCreatorTools} from './tools.js';
import {executeThreeCreatorTool} from './mcp.js';
import {prepareEpisodeSource} from '../three-episode/source.js';
import {openEpisodeBrowser} from '../three-episode/browser.js';

// Host acceptance for an independently authored workspace, never a copied
// playground or a claim that a cloud generation service has been exercised.
const workspace=path.resolve(process.argv[2]??''),output=path.resolve(process.argv[3]??'');
if(!process.argv[2]||!process.argv[3]||workspace===output)throw new Error('Pass an authored harbor workspace and a separate NEW output directory');
// Fail before the mandatory real-time recording if this host lacks its encoders.
for(const executable of ['ffmpeg','ffprobe'])await promisify(execFile)(executable,['-version']);
await mkdir(output,{recursive:false});const logs=path.join(output,'tool-log');await mkdir(logs);
const service=new ThreeCreatorTools(workspace,'three-sdk');let sequence=0;
const save=async(name:string,value:unknown)=>writeFile(path.join(output,name),JSON.stringify(value,null,2));
async function tool(name:string,args:Record<string,unknown>={}):Promise<any>{
 const request=++sequence;let result:any=await executeThreeCreatorTool(service,name,args);
 if(result.operationId){const id=result.operationId;for(;;){const status:any=await executeThreeCreatorTool(service,'operations_get',{operationId:id,waitSeconds:25});
  console.log(JSON.stringify({tool:name,status:status.status,progress:status.progress}));
  if(status.status==='failed'||status.status==='cancelled')throw new Error(JSON.stringify(status));
  if(status.status==='succeeded'){result=status.result;break;}
 }}
 await writeFile(path.join(logs,`${String(request).padStart(3,'0')}-${name}.json`),JSON.stringify({name,args,result},null,2));return result;
}
async function command(value:Record<string,unknown>){const result=await tool('world_execute_command',{command:value});const receipt=result.worldCommandReceipt;assert(receipt&&receipt.status!=='rejected',JSON.stringify(result));return receipt;}
const neutral={forward:0,steer:0,roll:0,lift:0,pitch:0,strafe:0,boost:false,brake:false,slow:false,jump:false};
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
try{
 await readFile(path.join(workspace,'requirement.md'),'utf8');
 await tool('creator_describe_environment');await tool('creator_get_authoring_schema',{topic:'humanoid'});
 const human=await tool('assets_describe',{assetId:'humanoid.source-101'});assert.equal(human.assets.length,1);
 const configurations=await tool('creator_get_authoring_schema',{topic:'humanoid',sections:['humanoid']});
 assert(configurations.roadVehicleConfigurations?.car||configurations.runtimeDefinitions,'Vehicle configuration/source unavailable');
 // The authored harbor supplies its own car and boat geometry; vehicle model assets are not required.
 await tool('world_validate');
 const initial=await tool('world_inspect');assert.deepEqual(initial.pageErrors,[]);assert.deepEqual(initial.blockedNetworkRequests,[]);
 for(const id of ['person','rover-instance-1','patrol-instance-1'])assert(initial.observation.targets[id]?.bounds,`Model not loaded: ${id}`);
 const action=await command({type:'humanoid.perform-action',request:{requestId:'acceptance-roll',action:'roll'}});assert.equal(action.status,'accepted');
 const completed=await tool('world_get_operation',{worldOperationId:action.operationId,waitSeconds:5});assert.equal(completed.worldOperation.status,'succeeded');
 const subjects=[];
 for(const instanceId of ['rover-instance-1','patrol-instance-1']){
  await command({type:'vehicle.approach',instanceId});await command({type:'vehicle.enter',instanceId});
  const before=await tool('world_inspect',{entityIds:[instanceId]});
  await command({type:'humanoid.set-input',input:{...neutral,forward:1}});await delay(1200);
  await command({type:'humanoid.set-input',input:{...neutral,brake:true}});await delay(2000);
  const after=await tool('world_inspect',{entityIds:[instanceId]});
  const from=before.observation.targets[instanceId].positionMetersXYZ,to=after.observation.targets[instanceId].positionMetersXYZ;
  const distance=Math.hypot(...to.map((n:number,i:number)=>n-from[i]));assert(distance>.1,`${instanceId} did not physically move`);
  for(const mode of [1,2,0])await command({type:'humanoid.set-camera-mode',mode});
  await command({type:'humanoid.set-input',input:null});await command({type:'vehicle.exit'});subjects.push({instanceId,from,to,distanceMeters:distance});
 }
 await save('subject-control.json',{action,subjects});
 const playtest=await tool('world_playtest');assert.equal(playtest.status,'passed');
 await tool('world_capture_triviews');const receipt=await tool('world_submit');await save('creator-receipt.json',receipt);
 await service.close();const unpacked=path.join(output,'unpacked');await mkdir(unpacked);
 await promisify(execFile)('tar',['-xzf',receipt.archivePath,'-C',unpacked]);
 const source=await prepareEpisodeSource({payloadRoot:path.join(unpacked,'payload'),outputRoot:path.join(output,'episode-source'),worldId:'independent-harbor-acceptance'});
 const session=await openEpisodeBrowser({playableRoot:source.playableRoot});
 const consumers=[];
 try{
  for(const [instanceId,position] of [['rover-instance-1',[0,.03,0]],['patrol-instance-1',[200,-1.9,0]]] as const){
   const start={positionWorldMetersXYZ:position,facingYawRadians:Math.PI,humanoid:{vehicleInstanceId:instanceId,mounted:true,cameraMode:0 as const}};
   const probe=await session.probeStart(start);assert(probe.isValid,JSON.stringify(probe));
   const before=await session.prepareSegment(start,{widthPixels:1280,heightPixels:720}),after=await session.advance({humanoid:{...neutral,forward:1}},120);
   const frame=await session.frame('image/png');await writeFile(path.join(output,instanceId+'.png'),Buffer.from(frame.imageDataUrl.split(',')[1]!,'base64'));
   assert.equal(after.humanoid?.mountedInstanceId,instanceId);assert.equal(after.simulationTick-before.simulationTick,120);assert.deepEqual(after.errors,[]);
   const p=after.entities.find(entity=>entity.id===instanceId)!.positionWorldMetersXYZ;
   const distance=Math.hypot(...p.map((n,i)=>n-position[i]!));assert(distance>.1);consumers.push({instanceId,probe,after,distanceMeters:distance});
  }
  assert.deepEqual(session.errors,[]);
 }finally{await session.close();}
 await save('report.json',{kind:'local-agent-authored-requirement-to-delivery',notCloudGenerated:true,worldBuildHash:receipt.worldBuildHash,receipt,subjects,consumers,episodeWorldBuildHash:source.worldBuildHash,providerVideoSubmissionCount:0});
 console.log(JSON.stringify({stage:'complete',output,inputWallSeconds:receipt.inputWallSeconds,worldBuildHash:receipt.worldBuildHash,episodeWorldBuildHash:source.worldBuildHash,subjects}));
}finally{await service.close();}
