/** DESIGN ONLY. Typechecked against public-api.d.ts; not executable SDK evidence. */
import * as THREE from 'three';
import { createWorld, type World, type CommandReceipt } from './public-api.js';

// 1. Ordinary Three scene + known asset; no physics or mixer setup at call sites.
export async function buildBasicWorld(canvas:HTMLCanvasElement):Promise<World> {
 const scene=new THREE.Scene();
 const camera=new THREE.PerspectiveCamera(55,16/9,.05,1000);
 camera.position.set(7,5,10);camera.lookAt(0,1,0);
 scene.add(new THREE.HemisphereLight(0xffffff,0x445533,2));
 const world=await createWorld({scene,camera,canvas});
 const geometry=new THREE.PlaneGeometry(80,80,16,16);
 const material=new THREE.MeshStandardMaterial({color:'#72a267'});
 const ground=new THREE.Mesh(geometry,material);ground.rotation.x=-Math.PI/2;
 world.addEntity({id:'ground',object:ground,role:'terrain'});
 const hero=await world.assets.load('humanoid.g-bot');
 world.addCharacter({id:'hero',asset:hero,name:'旅行者'});
 world.setControlledEntity('hero');
 world.setCameraFollow({distanceMeters:5,activateOnInput:true});
 world.setCaptureTargets(['hero','ground']);
 world.onDispose(()=>{geometry.dispose();material.dispose();});
 await world.start();
 return world;
}

// 2. Custom Three body: explicitly fit the body, not the full decorative tail bounds.
export function registerCustomFox(world:World,fox:THREE.Group,tailVisual:THREE.Object3D):void {
 fox.add(tailVisual);
 world.addCharacter({id:'fox',object:fox,body:{heightMeters:1.2,radiusMeters:.35},
  name:'白狐',tags:['fox','animal'],appearancePrompt:'白色狐狸，尾巴与完整身体共同移动'});
 world.onUpdate(({simulationSeconds})=>{tailVisual.rotation.z=Math.sin(simulationSeconds*3)*.2;});
 world.onReset(()=>{tailVisual.rotation.z=0;});
}

// 3. One parameter feeds both E interaction and a runtime language command.
export function registerGate(world:World,hingedGate:THREE.Group):void {
 world.addEntity({id:'gate',object:hingedGate,role:'obstacle',physics:{kind:'kinematic'}});
 const open=world.defineParameter({
  id:'gate.open',description:'打开北门，让人物通过',writes:[{kind:'entity',entityId:'gate',channels:['rotation']}],
  schema:{type:'boolean'},initialValue:false,
  plan:value=>[{type:'entity.set-rotation',entityId:'gate',
   rotationLocalRadiansXYZ:[0,value?Math.PI/2:0,0],durationSeconds:.35}],
 });
 world.onInteract('gate',()=>({type:'parameter.set',parameterId:open.id,value:!open.value}));
 // Controller can issue the exact same parameter.set command; no parallel isOpen variable.
}

// 4. Prepare a prototype once; repeated transport retries do not create a second crate.
export async function spawnCrate(world:World,crate:THREE.Mesh):Promise<CommandReceipt> {
 await world.registerPrototype({id:'crate',description:'可碰撞木箱',template:{kind:'entity',options:{
  object:crate,role:'obstacle',physics:{kind:'dynamic',shape:'box',massKilograms:2},
 }}});
 const context=world.describe();
 return world.execute({type:'entity.spawn',prototypeId:'crate',entityId:'crate-1',positionWorldMetersXYZ:[2,1,0]},
  {commandId:'example-crate-spawn-001',expectedWorldRevision:context.worldRevision});
}
export async function attachLantern(world:World,lantern:THREE.Object3D):Promise<CommandReceipt> {
 world.addEntity({id:'lantern',object:lantern,role:'decoration'});
 return world.execute({type:'entity.attach',childEntityId:'lantern',parentEntityId:'hero',positionLocalMetersXYZ:[.4,1,0]});
}

// 5. Task acceptance and arrival are intentionally different results.
export async function sendGuideToTower(world:World,target:readonly[number,number,number]):Promise<string> {
 const receipt=await world.execute({type:'actor.move-to',entityId:'guide',targetPositionWorldMetersXYZ:target});
 if(receipt.status==='rejected')return `${receipt.error.code}: ${receipt.error.message}`;
 if(receipt.status==='applied')return '命令已提交';
 const operation=world.operations.get(receipt.operationId);
 return operation.status==='succeeded'&&operation.outcome==='reached'?'已经到达':`任务状态：${operation.status}`;
}
export async function pausePatrol(world:World):Promise<void> {
 world.setAutonomy('guide',{kind:'patrol',waypointPositionsWorldMetersXYZ:[[0,0,0],[4,0,-6]]});
 await world.execute({type:'actor.stop',entityId:'guide'}); // Remains stopped until a new task or explicit resume.
 await world.execute({type:'actor.resume-autonomy',entityId:'guide'});
}

// 6. Only call an actually exposed capability; missing movement is not fabricated.
export function inspectGuideCapabilities(world:World):string {
 const description=world.describe({entityIds:['guide']});
 const guide=description.entities.find(entity=>entity.state.id==='guide');
 const move=guide?.commands.find(command=>command.type==='actor.move-to');
 if(!move?.isAvailable)return move?.unavailableReason?.message??'这个对象当前不支持寻路移动';
 return JSON.stringify(move.schema);
}

// 7. Custom action arguments are inferred from the registered schema, not cast from any.
export function registerOpenGateAction(world:World):void {
 world.registerAction({id:'gate.set-open',description:'控制北门开关',writes:[{kind:'parameter',parameterId:'gate.open'}],
  inputSchema:{type:'object',properties:{open:{type:'boolean'}},required:['open'],additionalProperties:false},
  plan:args=>[{type:'parameter.set',parameterId:'gate.open',value:args.open}],
 });
}

// 8. SDK-scoped async creation is cancelled/invalidated by reset or world disposal.
export async function addGuideLater(world:World):Promise<void> {
 await world.runTask(async scope=>{
  const asset=await scope.assets.load('humanoid.g-bot');
  scope.addCharacter({id:'guide',asset,name:'向导'});
 });
}

// 9. Explicitly hand camera ownership to a cutscene, then return it to following.
export function beginAuthoredCamera(world:World):void {
 const camera=world.useAuthoredCamera();
 camera.position.set(10,8,5);camera.lookAt(0,1,0);
 // An authored onUpdate checks world.cameraMode before continuing to write camera.
}
export function resumeFollowCamera(world:World):void {
 world.setCameraFollow({transitionSeconds:.4});
}

// 10. Private gameplay state resets through SDK and is not a public control parameter.
export function scoreCounter(world:World):void {
 const score=world.state.define('score',0);
 score.set(score.value+1);
}

export function structuredPrivateState(world:World):void {
 const progress=world.state.define('progress',{score:0,stage:'start'});
 progress.set({score:1,stage:'later'});
 const active=world.state.define('active',false);active.set(true);
 const title=world.state.define('title','开始');title.set('完成');
}

// 11. Wait for completion without frame polling; reset/dispose finish with cancellation.
export async function waitForGuide(world:World,target:readonly[number,number,number],signal:AbortSignal):Promise<string> {
 const receipt=await world.execute({type:'actor.move-to',entityId:'guide',targetPositionWorldMetersXYZ:target});
 if(receipt.status==='rejected')return receipt.error.message;
 if(receipt.status==='applied')return '已提交';
 const result=await world.operations.wait(receipt.operationId,{signal});
 return result.status==='succeeded'&&result.outcome==='reached'?'已经到达':result.error?.message??result.status;
}
