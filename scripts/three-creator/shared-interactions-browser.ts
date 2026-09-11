import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {EpisodeCommand,Vec3,CommandReceipt} from '@worldkit/three';
import {ThreeCreatorTools} from './tools.js';
import {openEpisodeBrowser} from '../three-episode/browser.js';
import {EpisodeActionController} from '../three-episode/action-controller.js';
import type {EpisodeSegmentPlan} from '../three-episode/contracts.js';

const output=path.resolve(process.argv[2]??'.codex-tmp/shared-interactions-browser');
await mkdir(output,{recursive:false});const workspace=path.join(output,'workspace');await mkdir(workspace);
const service=new ThreeCreatorTools(workspace,'three-sdk'),report:Record<string,unknown>={};
const save=()=>writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
const move=(entityId:string,position:Vec3):EpisodeCommand=>({type:'actor.move-to',entityId,targetPositionWorldMetersXYZ:position});
const skill=(actorId:string,action:'pickup'|'putDown'|'sit'|'standUp',requestId:string,targetId?:string,slotId?:string):EpisodeCommand=>({type:'humanoid.perform-action',actorId,request:{requestId,action,...(targetId?{targetId}:{}),...(slotId?{slotId}:{})}});
const start={positionWorldMetersXYZ:[0,.04,0] as const,facingYawRadians:Math.PI},viewport={widthPixels:1280,heightPixels:720};
try{
 const example=await service.examples('multiple-actors');
 for(const [name,source] of Object.entries(example.files))await writeFile(path.join(workspace,name),source);
 const plan={schemaVersion:2,targets:[],steps:[
  {durationSeconds:.6,keysDown:['a']},
  {durationSeconds:.2,keysUp:['a']},
  {durationSeconds:4,commands:[move('npc-left',[-.65,0,6]),move('npc-right',[.65,0,6])]},
  {durationSeconds:4,commands:[skill('npc-left','pickup','creator-grip','parcel','grip')]},
  {durationSeconds:6,commands:[move('npc-left',[-3,0,6])]},
  {durationSeconds:1,commands:[skill('npc-left','putDown','creator-release')]},
  {durationSeconds:3,commands:[move('npc-left',[-.6,0,12.35]),move('npc-right',[2,0,6])]},
  {durationSeconds:4,commands:[move('npc-right',[2,0,12.35])]},
  {durationSeconds:2,commands:[move('npc-right',[.6,0,12.35])]},
  {durationSeconds:2,commands:[skill('npc-left','sit','creator-left-seat','bench','left'),skill('npc-right','sit','creator-right-seat','bench','right')]},
  {durationSeconds:2,commands:[skill('npc-left','standUp','creator-left-stand')]},
  {durationSeconds:.5,commands:[{type:'entity.set-position',entityId:'exit-roof',positionWorldMetersXYZ:[.6,1.58,11.7]}]},
  {durationSeconds:.5,commands:[{type:'entity.set-interactions',entityId:'bench',slots:[]}]},
  {durationSeconds:2,commands:[{type:'entity.set-position',entityId:'exit-roof',positionWorldMetersXYZ:[.6,8,11.7]}]},
 ]};
 await writeFile(path.join(workspace,'episode.json'),JSON.stringify(plan));
 const compiled=await service.validate();report.compiled=compiled;await save();
 report.creator=await service.playtest('shared-interactions');await save();
 assert.equal((report.creator as {status:string}).status,'passed');await service.close();
 const episode=await openEpisodeBrowser({playableRoot:compiled.playableRoot});
 try{
  const records:unknown[]=[];report.episode=records;
  const dispatch=async(command:EpisodeCommand)=>{const receipt=await episode.execute(command);records.push({command,receipt});return receipt;};
  const wait=async(receipt:CommandReceipt)=>{
   assert.notEqual(receipt.status,'rejected',JSON.stringify(receipt));if(receipt.status!=='accepted')return;
   for(let tick=0;tick<600;tick+=6){const status=await episode.operation(receipt.operationId);if(status.status!=='running'&&status.status!=='queued'){assert.equal(status.status,'succeeded',JSON.stringify(status));return;}await episode.advance({},6);}
   assert.fail('Operation did not complete in ten simulated seconds');
  };
  const capture=async(name:string)=>{
   const frame=await episode.frame('image/png');records.push({name,snapshot:frame.snapshot});
   await writeFile(path.join(output,`${name}.png`),Buffer.from(frame.imageDataUrl.split(',')[1]!,'base64'));
   const bench=name.includes('seat'),center:Vec3=bench?[0,.9,12]:name==='placed'?[-3.3,.9,6]:[0,1,6];
   const detail=await episode.observe({view:'current',cameraPositionWorldMetersXYZ:[center[0]+3,2.8,center[2]-3],lookAtWorldMetersXYZ:center});
   assert.equal(detail.snapshot.simulationTick,frame.snapshot.simulationTick);
   await writeFile(path.join(output,`${name}-detail.png`),Buffer.from(detail.imageDataUrl.split(',')[1]!,'base64'));
   return frame.snapshot;
  };
  await episode.prepareSegment(start,viewport);
  const leftMove=await dispatch(move('npc-left',[-.65,0,6])),rightMove=await dispatch(move('npc-right',[.65,0,6]));await wait(leftMove);await wait(rightMove);
  await episode.advance({},30);
  const first=await dispatch(skill('npc-left','pickup','episode-contest-left','parcel','grip'));
  const second=await dispatch(skill('npc-right','pickup','episode-contest-right','parcel','grip'));
  assert.equal(first.status,'accepted',JSON.stringify(first));assert.equal(second.status,'rejected',JSON.stringify(second));
  if(second.status==='rejected')assert.match(second.error.code,/TARGET_UNAVAILABLE/);
  await wait(first);await episode.advance({},120);
  let state=await capture('persistent-hold');
  assert.equal(state.humanoid!.interactionTargets.find(target=>target.id==='parcel')!.claim?.actorId,'npc-left');
  await wait(await dispatch(move('npc-left',[-3,0,6])));
  await wait(await dispatch(skill('npc-left','putDown','episode-release')));
  state=await capture('placed');assert.equal(state.humanoid!.interactionTargets.find(target=>target.id==='parcel')!.claim,null);
  await wait(await dispatch(move('npc-left',[-.6,0,12.35])));await wait(await dispatch(move('npc-right',[2,0,6])));await wait(await dispatch(move('npc-right',[2,0,12.35])));await wait(await dispatch(move('npc-right',[.6,0,12.35])));
  const seatedLeft=await dispatch(skill('npc-left','sit','episode-sit-left','bench','left'));
  const seatedRight=await dispatch(skill('npc-right','sit','episode-sit-right','bench','right'));
  await wait(seatedLeft);await wait(seatedRight);await episode.advance({},120);
  state=await capture('independent-seats');
  assert.deepEqual(state.humanoid!.interactionTargets.filter(target=>target.id==='bench').map(target=>[target.slotId,target.claim?.actorId,target.claim?.state]),[['left','npc-left','occupied'],['right','npc-right','occupied']]);
  await wait(await dispatch(skill('npc-left','standUp','episode-stand-left')));
  state=await capture('one-seat-released');assert.equal(state.humanoid!.interactionTargets.find(target=>target.slotId==='right')!.claim?.actorId,'npc-right');
  await episode.prepareSegment(start,viewport);
  state=await capture('reset');assert.equal(state.humanoid!.interactionTargets.length,3);assert(state.humanoid!.interactionTargets.every(target=>target.claim===null));

  // Exercise the actual Episode goal consumer, including two same-entity slots.
  await episode.prepareSegment({positionWorldMetersXYZ:[.6,.02,12],facingYawRadians:0},viewport);
  const segment:EpisodeSegmentPlan={id:'segment-00',start:{positionWorldMetersXYZ:[.6,.02,12],facingYawRadians:0},waypoints:[{positionWorldMetersXYZ:[.6,.02,12],gait:'walk'}],endBehavior:'stop',purpose:'Use the right authored seat',actionGoals:[
   {id:'right-seat',trigger:{waypointIndex:0,radiusMeters:.6},targetId:'bench',slotId:'right',intent:{kind:'skill',action:'sit'},completion:{kind:'settled',holdSeconds:.2},timeoutSeconds:5},
   {id:'stand',trigger:{waypointIndex:0,radiusMeters:.6},intent:{kind:'skill',action:'standUp'},completion:{kind:'settled',holdSeconds:0},timeoutSeconds:5},
  ]};
  let frame=await episode.frame('image/png');const controller=new EpisodeActionController(segment,episode,frame.snapshot.simulationTick,1/60);
  assert.equal(frame.snapshot.humanoid!.characterCapabilities.find(card=>card.id==='sit')!.slotId,'right');
  for(let tick=0;tick<600&&!controller.timeline.every(entry=>entry.result==='succeeded');tick++){
   const decision=await controller.step(frame.snapshot,frame.camera.controlForwardWorldXYZ,{mode:'action',input:{},waypointIndex:0,positionWorldMetersXYZ:[.6,.02,12]});
   const snapshot=await episode.advance(decision.input,1);await controller.observe(snapshot);frame={...frame,snapshot};
  }
  report.goalTimeline=controller.timeline;controller.assertComplete();await capture('episode-goals-complete');
  assert.deepEqual(episode.errors,[]);report.errors=episode.errors;
 }finally{await episode.close();}
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{await service.close();await save();}
console.log(JSON.stringify({output,failure:report.failure??null}));
