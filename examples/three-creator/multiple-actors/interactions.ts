import * as THREE from 'three';
import type {ThreeWorld,TaskScope,WorldCommand,Vec3,InteractionSlot} from '@worldkit/three';

/** Ordinary authored objects bind reusable actions; no extra physics or animation loop. */
export function addInteractionDemo(world:ThreeWorld):HTMLElement{
 const material=new THREE.MeshStandardMaterial({color:'#dddddd'}),accent=new THREE.MeshStandardMaterial({color:'#d99d43'});
 const geometries:THREE.BufferGeometry[]=[];
 function box(size:Vec3,position:Vec3,colored=false){
  const geometry=new THREE.BoxGeometry(...size);geometries.push(geometry);
  const mesh=new THREE.Mesh(geometry,colored?accent:material);mesh.position.set(...position);return mesh;
 }
 for(const [id,size,position] of [
  ['pickup-table',[1.8,.849,.68],[0,.4245,6.65]],
  ['place-table',[.68,.849,1.8],[-3.65,.4245,6]],
 ] as const){
  world.addEntity({id,object:box(size,position),role:'obstacle',physics:{kind:'dynamic',shape:'box',massKilograms:24}});
 }
 // The geometry is offset from its root. A local grip must not become the body origin.
 const parcel=new THREE.Group();parcel.add(box([.13,.13,.13],[.3,0,0],true));parcel.position.set(-.249,.914,6.363);
 world.addEntity({id:'parcel',object:parcel,role:'obstacle',physics:{kind:'dynamic',shape:'box',massKilograms:.3,lockRotations:true},interactions:[
  {slotId:'grip',label:'Parcel',kind:'pickup',capacity:1,positionLocalMetersXYZ:[.3,0,0],
   approachLocalMetersXYZ:[.249,-.894,-.363],rotationLocalRadiansXYZ:[0,0,0]},
 ]});
 const bench=new THREE.Group();bench.position.z=12;
 bench.add(box([1.9,.1,.38],[0,.41,-.49]));
 for(const x of [-.8,.8])bench.add(box([.1,.36,.3],[x,.18,-.49]));
 const slots:InteractionSlot[]=[-.6,.6].map((x,index)=>({slotId:index?'right':'left',label:index?'Right seat':'Left seat',kind:'seat',capacity:1,
  positionLocalMetersXYZ:[x,.46,-.49],approachLocalMetersXYZ:[x,.02,0],rotationLocalRadiansXYZ:[0,0,0]}));
 world.addEntity({id:'bench',object:bench,role:'obstacle',physics:{kind:'fixed'},interactions:slots});
 world.addEntity({id:'exit-roof',object:box([1.1,.16,1.8],[.6,8,11.7]),role:'obstacle',physics:{kind:'kinematic'}});

 const panel=document.createElement('div'),result=document.createElement('pre'),pending=new Set<string>();
 result.style.cssText='max-width:520px;max-height:180px;overflow:auto;white-space:pre-wrap';
 let run=0;
 function track(operationId:string){
  pending.add(operationId);
  void world.operations.wait(operationId).then(()=>pending.delete(operationId),()=>pending.delete(operationId));
 }
 async function execute(scope:TaskScope,command:WorldCommand){
  const receipt=await scope.execute(command);result.textContent=JSON.stringify(receipt,null,2);
  if(receipt.status==='rejected')throw new Error(`${receipt.error.code}: ${receipt.error.message}`);
  if(receipt.status==='accepted'){
   track(receipt.operationId);
   const final=await world.operations.wait(receipt.operationId,{signal:scope.signal});
   if(final.status!=='succeeded')throw new Error(JSON.stringify(final));
  }
  return receipt;
 }
 const npcIds=['npc-left','npc-right'] as const;
 function button(label:string,task:(scope:TaskScope)=>Promise<unknown>){
  const button=document.createElement('button');button.textContent=label;
  button.onclick=()=>{void world.runTask(task).catch(error=>{result.textContent=String(error);});};panel.append(button);
 }
 const move=(scope:TaskScope,id:string,position:Vec3)=>execute(scope,{type:'actor.move-to',entityId:id,targetPositionWorldMetersXYZ:position});
 const skill=(scope:TaskScope,id:string,action:'pickup'|'putDown'|'sit'|'standUp',targetId?:string,slotId?:string)=>execute(scope,
  {type:'humanoid.perform-action',actorId:id,request:{requestId:`demo-${++run}`,action,...(targetId?{targetId}:{}),...(slotId?{slotId}:{})}});
 button('NPC 接近物品',async scope=>{await Promise.all(npcIds.map((id,index)=>move(scope,id,[index ? .65 : -.65,0,6])));});
 button('同时争用物品',async scope=>{
  // Dispatch both before waiting. Each actor receives its actual receipt, including rejection.
  const receipts=[];for(const id of npcIds)receipts.push(await scope.execute({type:'humanoid.perform-action',actorId:id,
   request:{requestId:`contest-${++run}`,action:'pickup',targetId:'parcel',slotId:'grip'}}));
  for(const receipt of receipts)if(receipt.status==='accepted')track(receipt.operationId);
  result.textContent=JSON.stringify(receipts,null,2);
 });
 button('搬运并放下',async scope=>{
  const id=npcIds.find(id=>world.humanoid!.snapshot(id).character.carrying==='parcel');if(!id)throw new Error('先完成拾取');
  await move(scope,id,[-3,0,6]);await skill(scope,id,'putDown');
 });
 button('分别就座',async scope=>{
  await Promise.all(npcIds.map(async(id,index)=>{
   // Movable tables remain real obstacles; route around their occupied volume.
   if(index){await move(scope,id,[2,0,6]);await move(scope,id,[2,0,12.35]);}
   await move(scope,id,[index ? .6 : -.6,0,12.35]);await skill(scope,id,'sit','bench',index?'right':'left');
  }));
 });
 button('起身',async scope=>{await Promise.all(npcIds.map(id=>skill(scope,id,'standUp')));});
 button('切换低顶',scope=>execute(scope,{type:'entity.set-position',entityId:'exit-roof',positionWorldMetersXYZ:[.6,world.getEntityState('exit-roof').positionWorldMetersXYZ[1]>2?1.58:8,11.7]}));
 button('解除座位绑定',scope=>execute(scope,{type:'entity.set-interactions',entityId:'bench',slots:[]}));
 button('删除物品',scope=>execute(scope,{type:'entity.despawn',entityId:'parcel'}));
 const cancel=document.createElement('button');cancel.textContent='取消活动操作';cancel.onclick=()=>{for(const id of pending)world.operations.cancel(id);pending.clear();};panel.append(cancel,result);
 world.onReset(()=>{pending.clear();result.textContent='已恢复场地及交互绑定';});
 world.onDispose(()=>{for(const geometry of geometries)geometry.dispose();material.dispose();accent.dispose();});
 return panel;
}
