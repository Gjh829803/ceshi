import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {ThreeCreatorTools} from '../../src/tools/tools.js';
import {executeThreeCreatorTool,toolContent} from '../../src/cli/mcp.js';
import {captureTargets,captureObjectViews} from '../../src/browser/capture.js';
import type {WorldObservation} from '@worldkit/three';
import type {Page} from 'playwright';
import {openEpisodeBrowser} from '@worldkit/episode-pipeline/browser';

function fixture(){
 const scene=new THREE.Scene(),player=new THREE.Group(),first=new THREE.Group(),second=new THREE.Group();scene.add(player,first,second);
 return{scene,controlledObject:player,first,second,world:{scene,controlledObject:player,camera:new THREE.PerspectiveCamera(),renderer:{} as THREE.WebGLRenderer,targets:{hero:player,'10':first,'2':second}} as Pick<WorldObservation,'scene'|'controlledObject'|'camera'|'renderer'|'targets'|'captureTargetIds'|'targetRepresentativesById'>};
}
describe('ordered representative capture selection',()=>{
 it('treats prototype-named raw entity IDs as IDs, not inherited representatives',()=>{
  const f=fixture(),world={...f.world,targets:{constructor:f.controlledObject,toString:f.first},captureTargetIds:['constructor','toString'],targetRepresentativesById:{}};
  expect(captureTargets(world)).toEqual([{id:'player',sourceEntityId:'constructor'},{id:'toString',sourceEntityId:'toString'}]);
 });
 it('keeps explicit priority and subject-first completeness, with raw fallback and exact reference deduplication',()=>{
  const f=fixture();expect(captureTargets({...f.world,captureTargetIds:['10','2','10','hero']}).map(x=>x.id)).toEqual(['player','10','2']);
  expect(captureTargets({...f.world,captureTargetIds:[]}).map(x=>x.id)).toEqual(['player']);
  expect(captureTargets(f.world).map(x=>x.id)).toEqual(['player','2','10']);
  f.second.uuid=f.first.uuid;expect(captureTargets({...f.world,captureTargetIds:['10','2']}).map(x=>x.id)).toEqual(['player','10','2']);
  f.first.add(f.second);
  const same={kind:'object' as const,object:f.second};
  expect(captureTargets({...f.world,captureTargetIds:['10','2'],targetRepresentativesById:{'10':same,'2':same}}).map(x=>x.id)).toEqual(['player','10']);
 });
 it('deduplicates exact instance references while retaining different selected instances',()=>{
  const f=fixture(),mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial(),3);f.first.add(mesh);
  const world={...f.world,targets:{hero:f.controlledObject,a:f.first,b:f.first,c:f.first},captureTargetIds:['a','b','c'],targetRepresentativesById:{a:{kind:'instance' as const,object:mesh,instanceIndex:2},b:{kind:'instance' as const,object:mesh,instanceIndex:2},c:{kind:'instance' as const,object:mesh,instanceIndex:0}}};
  expect(captureTargets(world)).toEqual([{id:'player',sourceEntityId:'hero'},{id:'a',sourceEntityId:'a',representative:{kind:'instance',objectUuid:mesh.uuid,instanceIndex:2}},{id:'c',sourceEntityId:'c',representative:{kind:'instance',objectUuid:mesh.uuid,instanceIndex:0}}]);
  mesh.count=2;expect(()=>captureTargets(world)).toThrow('INSTANCE_INVALID');
 });
 it('rejects stale/foreign references, subject limbs and multi-object three-view sheets before touching rendering',()=>{
  const f=fixture(),child=new THREE.Group();f.first.add(child);
  const world={...f.world,captureTargetIds:['10'],targetRepresentativesById:{'10':{kind:'object' as const,object:child}}};
  expect(captureTargets(world)[1]!.representative!.objectUuid).toBe(child.uuid);f.second.add(child);
  expect(()=>captureTargets(world)).toThrow('REPRESENTATIVE_NOT_IN_ENTITY');
  f.scene.remove(f.first);expect(()=>captureTargets({...f.world,captureTargetIds:['10']})).toThrow('TARGET_NOT_IN_SCENE');
  f.controlledObject.add(child);expect(()=>captureTargets({...f.world,captureTargetIds:['hero'],targetRepresentativesById:{hero:{kind:'object',object:child}}})).toThrow('SUBJECT_MUST_BE_COMPLETE');
  expect(()=>captureObjectViews(f.world,'entity-triview',['hero','2'])).toThrow('SINGLE_TARGET_REQUIRED');
 });
});

const source=String.raw`import * as THREE from 'three';
const scene=new THREE.Scene();scene.background=new THREE.Color('#29435d');scene.fog=new THREE.Fog('#29435d',20,100);
const camera=new THREE.PerspectiveCamera(50,innerWidth/innerHeight,.1,1000);camera.position.set(0,9,25);camera.lookAt(0,1,0);
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(innerWidth,innerHeight);document.body.append(renderer.domElement);
const player=new THREE.Group();player.position.x=-10;player.add(new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshBasicMaterial({color:0xffcc00})));scene.add(player);
const lamp=new THREE.AmbientLight(0xffffff,1);lamp.layers.set(3);scene.add(lamp);
const ancestor=new THREE.Mesh(new THREE.BoxGeometry(8,8,8),new THREE.MeshBasicMaterial({color:0xff00ff}));scene.add(ancestor);
const unit=new THREE.Group();unit.position.set(1,1,-1);ancestor.add(unit);
const body=new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshBasicMaterial({color:0xff0000}));body.name='selected-body';body.layers.set(4);unit.add(body);
const attachment=new THREE.Mesh(new THREE.BoxGeometry(.8,.7,.8),new THREE.MeshBasicMaterial({color:0x0000ff}));attachment.position.set(.2,1.2,0);attachment.name='selected-attachment';unit.add(attachment);
const attachedLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.7,0,0),new THREE.Vector3(.7,0,0)]),new THREE.LineBasicMaterial({color:0xffffff}));attachedLine.name='selected-line';unit.add(attachedLine);
const hiddenVariant=new THREE.Mesh(new THREE.BoxGeometry(10,10,10),new THREE.MeshBasicMaterial({color:0xff00ff}));hiddenVariant.position.x=100;hiddenVariant.visible=false;unit.add(hiddenVariant);
for(let i=0;i<8;i++){const copy=body.clone();copy.name='other-copy';copy.position.set(i*3+10,0,0);ancestor.add(copy);}
const unrelatedLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-4,1,-1),new THREE.Vector3(5,1,-1)]),new THREE.LineBasicMaterial({color:0xff00ff}));scene.add(unrelatedLine);
const unrelatedPoints=new THREE.Points(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(1,1,-1)]),new THREE.PointsMaterial({color:0xff00ff,size:9}));scene.add(unrelatedPoints);
const unrelatedSprite=new THREE.Sprite(new THREE.SpriteMaterial({color:0xff00ff}));unrelatedSprite.position.set(1,1,-1);unrelatedSprite.scale.set(5,5,5);scene.add(unrelatedSprite);
const parent=new THREE.Group();parent.position.set(14,3,-9);parent.rotation.set(.2,.5,-.1);parent.scale.setScalar(1.2);scene.add(parent);
const geometry=new THREE.BoxGeometry(1,2,3),material=new THREE.MeshBasicMaterial({color:0xffffff});const instances=new THREE.InstancedMesh(geometry,material,3);parent.add(instances);
for(let i=0;i<3;i++){const matrix=new THREE.Matrix4().compose(new THREE.Vector3(i===2?-5:i*20,i===2?2:0,i===2?4:0),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),i===2?.7:0),new THREE.Vector3(1,i===2?2:1,.8));instances.setMatrixAt(i,matrix);instances.setColorAt(i,new THREE.Color([0xff0000,0x0000ff,0x00ff00][i]));}
instances.instanceMatrix.needsUpdate=true;instances.instanceColor.needsUpdate=true;
const targetRepresentativesById={crowd:{kind:'object',object:unit},crystals:{kind:'instance',object:instances,instanceIndex:2}};
const draws=[];scene.traverse(object=>{if(object!==instances&&(object.isMesh||object.isLine||object.isPoints||object.isSprite))object.onBeforeRender=(r,s,c)=>{if(c.isOrthographicCamera)draws.push(object.name||object.uuid);};});
const proxies=[];scene.onAfterRender=(r,s,c)=>{if(!c.isOrthographicCamera)return;const p=scene.children.find(x=>x.name==='capture:crystals');if(p){const color=new THREE.Color();p.getColorAt(0,color);proxies.push({count:p.count,color:color.toArray(),sameGeometry:p.geometry===geometry,sameMaterial:p.material===material});}};
let geometryDisposals=0,materialDisposals=0;geometry.addEventListener('dispose',()=>geometryDisposals++);material.addEventListener('dispose',()=>materialDisposals++);
const render=()=>renderer.render(scene,camera);
window.__WORLDKIT_EVAL__={ready:true,scene,camera,renderer,controlledObject:player,targets:{hero:player,crowd:ancestor,crystals:parent},captureTargetIds:['hero','crowd','crystals'],targetRepresentativesById,startLive(){},stopLive(){},reset:render};
window.captureFixture={scene,camera,renderer,unit,ancestor,body,attachment,instances,geometry,material,draws,proxies,getDisposals:()=>({geometryDisposals,materialDisposals})};render();`;

describe('actual representative browser captures',()=>{
 it('renders one real instance and complete object attachments, excludes unrelated renderables and restores state on render failure',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'representative-capture-')),service=new ThreeCreatorTools(root,'three-raw');
  try{
   await writeFile(path.join(root,'index.html'),'<html><script type="module" src="./main.js"></script></html>');await writeFile(path.join(root,'main.js'),source);
   await service.preview('opening');const page=(service as unknown as {session:{page:Page}}).session.page;
   const result=await page.evaluate(()=>{
    const w=window as any,f=w.captureFixture,host=w.__THREE_CREATOR_HOST__;
    const state=()=>({children:f.scene.children.map((x:any)=>x.uuid),objects:(()=>{const a:any[]=[];f.scene.traverse((o:any)=>a.push([o.uuid,o.visible,o.layers.mask]));return a;})(),camera:f.camera.matrixWorld.toArray(),projection:f.camera.projectionMatrix.toArray(),size:[f.renderer.domElement.width,f.renderer.domElement.height],background:f.scene.background.getHex(),fog:!!f.scene.fog,material:[f.material.visible,f.material.side],instanceMatrices:Array.from(f.instances.instanceMatrix.array),instanceColors:Array.from(f.instances.instanceColor.array)});
    const before=state();f.draws.length=0;
    const object=host.capture('entity-triview',['crowd']);const objectDraws=[...f.draws];const afterObject=state();f.draws.length=0;
    const instance=host.capture('entity-triview',['crystals']);const proxyEvidence=[...f.proxies];const afterInstance=state();
    const local=new f.camera.matrixWorld.constructor();f.instances.getMatrixAt(2,local);const expectedWorld=f.instances.matrixWorld.clone().multiply(local);
    return{descriptors:host.captureTargets(),before,afterObject,afterInstance,object,objectDraws,instance,proxyEvidence,expectedWorld:expectedWorld.elements,disposals:f.getDisposals()};
   });
   expect(result.descriptors.map((x:any)=>x.id)).toEqual(['player','crowd','crystals']);expect(result.afterObject).toEqual(result.before);expect(result.afterInstance).toEqual(result.before);
   const prototypeSubject=await page.evaluate(()=>{
    const w=window as any,observer=w.__WORLDKIT_EVAL__,host=w.__THREE_CREATOR_HOST__;
    const original={targets:observer.targets,ids:observer.captureTargetIds,representatives:observer.targetRepresentativesById,fronts:observer.targetFrontYawRadiansById};
    try{
     observer.targets={constructor:observer.controlledObject};observer.captureTargetIds=['constructor'];observer.targetRepresentativesById={};observer.targetFrontYawRadiansById={};
     const capture=host.capture('entity-triview',['constructor']);
     return{target:capture.captureTarget,orientationTargetId:capture.orientationTargetId,frontYawRadians:capture.frontYawRadians};
    }finally{observer.targets=original.targets;observer.captureTargetIds=original.ids;observer.targetRepresentativesById=original.representatives;observer.targetFrontYawRadiansById=original.fronts;}
   });
   expect(prototypeSubject).toEqual({target:{id:'player',sourceEntityId:'constructor'},orientationTargetId:'constructor',frontYawRadians:0});
   expect(result.object.bounds.maximumMetersXYZ[0]).toBeLessThan(3);
   expect(new Set(result.objectDraws)).toEqual(new Set(['selected-body','selected-attachment','selected-line']));expect(result.proxyEvidence).toHaveLength(3);
   for(const evidence of result.proxyEvidence)expect(evidence).toEqual({count:1,color:[0,1,0],sameGeometry:true,sameMaterial:true});
   expect(result.disposals).toEqual({geometryDisposals:0,materialDisposals:0});
   const expectedBounds=new THREE.Box3().setFromObject(new THREE.Mesh(new THREE.BoxGeometry(1,2,3)));expectedBounds.applyMatrix4(new THREE.Matrix4().fromArray(result.expectedWorld));
   expect(result.instance.bounds.minimumMetersXYZ).toEqual(expect.arrayContaining(expectedBounds.min.toArray().map(value=>expect.closeTo(value,5))));
   for(const [capture,colors] of [[result.object,['red','blue']],[result.instance,['green']]] as const){
    const image=Buffer.from(capture.image.split(',')[1],'base64');const decoded=await sharp(image).removeAlpha().raw().toBuffer({resolveWithObject:true});expect(decoded.info.width).toBe(1536);expect(decoded.info.height).toBe(640);
    const counts={red:0,blue:0,green:0,magenta:0};for(let i=0;i<decoded.data.length;i+=3){const r=decoded.data[i]!,g=decoded.data[i+1]!,b=decoded.data[i+2]!;if(r>180&&g<60&&b<60)counts.red++;if(b>180&&r<60&&g<60)counts.blue++;if(g>180&&r<60&&b<60)counts.green++;if(r>180&&b>180&&g<60)counts.magenta++;}
    for(const color of colors)expect(counts[color]).toBeGreaterThan(100);expect(counts.magenta).toBe(0);
   }
   const failure=await page.evaluate(()=>{
    const w=window as any,f=w.captureFixture,host=w.__THREE_CREATOR_HOST__,renderer=f.renderer;
    renderer.setPixelRatio(1.5);renderer.setViewport(7,8,600,300);renderer.setScissor(9,10,500,250);renderer.setScissorTest(true);renderer.autoClear=false;renderer.xr.enabled=true;renderer.shadowMap.enabled=true;
    const matrix=f.camera.matrix.clone(),original=renderer.render;let calls=0,error;
    const read=()=>({viewport:renderer.getViewport({copy(v:any){return[v.x,v.y,v.z,v.w];}}),scissor:renderer.getScissor({copy(v:any){return[v.x,v.y,v.z,v.w];}}),pixelRatio:renderer.getPixelRatio(),scissorTest:renderer.getScissorTest(),autoClear:renderer.autoClear,xr:renderer.xr.enabled,shadows:renderer.shadowMap.enabled,children:f.scene.children.map((o:any)=>o.uuid),sourceLayer:f.instances.layers.mask,sourceVisible:f.instances.visible,materialVisible:f.material.visible});
    const before=read();renderer.render=function(s:any,c:any){if(c.isOrthographicCamera&&++calls===2)throw new Error('LOCAL_SECOND_PANEL_FAILURE');return original.call(this,s,c);};
    try{host.capture('entity-triview',['crystals']);}catch(value:any){error=value.message;}finally{renderer.render=original;}
    return{error,before,after:read(),cameraUnchanged:matrix.equals(f.camera.matrix),disposals:f.getDisposals()};
   });
   expect(failure.error).toBe('LOCAL_SECOND_PANEL_FAILURE');expect(failure.after).toEqual(failure.before);expect(failure.cameraUnchanged).toBe(true);expect(failure.disposals).toEqual({geometryDisposals:0,materialDisposals:0});
   const adversarial=await page.evaluate(()=>{
    const w=window as any,f=w.captureFixture,host=w.__THREE_CREATOR_HOST__,renderer=f.renderer;
    const before={children:f.scene.children.map((o:any)=>o.uuid),background:f.scene.background.getHex(),fog:f.scene.fog,layer:f.instances.layers.mask,size:[renderer.domElement.width,renderer.domElement.height],autoClear:renderer.autoClear,xr:renderer.xr.enabled,shadows:renderer.shadowMap.enabled};
    const originalCallback=f.instances.onBeforeRender;f.instances.onBeforeRender=()=>{};let unsupported;
    try{host.capture('entity-triview',['crystals']);}catch(error:any){unsupported=error.message;}finally{f.instances.onBeforeRender=originalCallback;}
    let disposalAttempts=0;const listener=(event:any)=>{if(event.child.name==='capture:crystals')event.child.addEventListener('dispose',()=>{disposalAttempts++;throw new Error('LOCAL_DISPOSE_FAILURE');});};
    f.scene.addEventListener('childadded',listener);const originalRender=renderer.render;let calls=0,primary;
    renderer.render=function(s:any,c:any){if(c.isOrthographicCamera&&++calls===2)throw new Error('LOCAL_PRIMARY_RENDER_FAILURE');return originalRender.call(this,s,c);};
    try{host.capture('entity-triview',['crystals']);}catch(error:any){primary=error.message;}finally{renderer.render=originalRender;f.scene.removeEventListener('childadded',listener);}
    return{unsupported,primary,disposalAttempts,unchanged:before.children.join()===f.scene.children.map((o:any)=>o.uuid).join()&&before.background===f.scene.background.getHex()&&before.fog===f.scene.fog&&before.layer===f.instances.layers.mask&&before.size[0]===renderer.domElement.width&&before.size[1]===renderer.domElement.height&&before.autoClear===renderer.autoClear&&before.xr===renderer.xr.enabled&&before.shadows===renderer.shadowMap.enabled,disposals:f.getDisposals()};
   });
   expect(adversarial.unsupported).toBe('THREE_CAPTURE_INSTANCE_CALLBACK_UNSUPPORTED');expect(adversarial.primary).toBe('LOCAL_PRIMARY_RENDER_FAILURE');expect(adversarial.disposalAttempts).toBe(1);expect(adversarial.unchanged).toBe(true);expect(adversarial.disposals).toEqual({geometryDisposals:0,materialDisposals:0});
  }finally{await service.close();await rm(root,{recursive:true,force:true});}
 },120000);
});

it('opens the synchronous SDK presentation before capture measurement and restores on rejection',()=>{
 const f=fixture();let active=false,entered=0;
 const world={...f.world,withPresentation<T>(work:()=>T):T{entered++;active=true;try{return work();}finally{active=false;}}};
 // Invalid multi-target capture rejects before touching renderer state. It still
 // belongs inside the Host transaction, including target measurement/selection.
 const update=f.scene.updateMatrixWorld.bind(f.scene);
 f.scene.updateMatrixWorld=(force?:boolean)=>{expect(active).toBe(true);return update(force);};
 expect(()=>captureObjectViews(world,'entity-triview',['hero','2'])).toThrow('SINGLE_TARGET_REQUIRED');
 expect(entered).toBe(1);expect(active).toBe(false);
});

const currentSdkSource=String.raw`import * as THREE from 'three';
import {createWorld} from '@worldkit/three';
const scene=new THREE.Scene();scene.background=new THREE.Color('#29435d');
const camera=new THREE.PerspectiveCamera(58,960/540,.08,100);
const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true});renderer.setSize(960,540);document.body.append(renderer.domElement);
const player=new THREE.Mesh(new THREE.CapsuleGeometry(.3,1.1),new THREE.MeshBasicMaterial({color:'#ffcc00'}));
const world=await createWorld({scene,camera,renderer,navigation:false,assetDefinitions:{},humanoid:{
 map:{id:'current-preview',name:'Current preview',description:'',bounds:{min:[-20,-5,-20],max:[20,20,20]},boxes:[{id:'ground',position:[0,-.5,0],size:[40,1,40]}],water:[],regions:[],spawns:[],playerSpawn:[0,.03,0]},
 character:{instanceId:'player',object:player},vehicles:[]}});
await world.start();world.stop();world.step({},40);
world.setCameraView('shoulder');
window.currentPreviewWorld=world;`;

it('records rejected and failed SDK actions, continues later inputs, and still fails on browser errors',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'action-recording-feedback-')),service=new ThreeCreatorTools(root,'three-sdk');
 const authored=currentSdkSource.replace('navigation:false','navigation:true').replace('await world.start();world.stop();',`const npc=player.clone();npc.position.set(4,0,0);
world.addCharacter({id:'npc',object:npc,body:{heightMeters:1.7,radiusMeters:.3},movement:{kind:'ground',walkSpeedMetersPerSecond:3,runSpeedMetersPerSecond:4,jumpSpeedMetersPerSecond:4}});
const immobile=player.clone();immobile.position.set(-4,0,0);
world.addCharacter({id:'immobile',object:immobile,body:{heightMeters:1.7,radiusMeters:.3},movement:{kind:'ground',walkSpeedMetersPerSecond:0,runSpeedMetersPerSecond:0,jumpSpeedMetersPerSecond:0}});
await world.start();world.stop();`);
 try{
  await writeFile(path.join(root,'index.html'),'<html><script type="module" src="./main.ts"></script></html>');
  await writeFile(path.join(root,'main.ts'),authored);await writeFile(path.join(root,'project.json'),JSON.stringify({schemaVersion:1,assetIds:[]}));
  await writeFile(path.join(root,'episode.json'),JSON.stringify({schemaVersion:2,targets:[],steps:[
   {keysDown:['KeyW'],commands:[{type:'actor.stop',entityId:'player'},{type:'actor.move-to',entityId:'npc',targetPositionWorldMetersXYZ:[1000,0,1000]},{type:'actor.move-to',entityId:'immobile',targetPositionWorldMetersXYZ:[-8,0,0]}],durationSeconds:4.8},
   {keysUp:['KeyW'],commands:[{type:'humanoid.apply-profile',profile:{character:{speed:4}}}],durationSeconds:.5},
  ]}));
  const report=await service.playtest('action-outcomes',undefined,2);
  expect(report.status,report.failure??'').toBe('passed');expect(report.isCompleteEpisode).toBe(true);expect(report.completedSteps).toBe(2);
  expect(report.semanticStatus).toBe('unreviewed');expect(report.capturedInput).toBe(true);
  expect(report.feedback.actions.dispatchCounts).toEqual({rejected:1,accepted:2,applied:1});
  expect(report.feedback.actions.operationCounts.failed).toBe(2);
  expect(report.hostActionEvents).toEqual(expect.arrayContaining([expect.objectContaining({type:'world-command',worldCommandReceipt:expect.objectContaining({status:'rejected',error:expect.objectContaining({code:'PLAYER_INPUT_OWNS_ACTOR'})})})]));
  expect(report.worldOperations).toEqual(expect.arrayContaining([expect.objectContaining({status:'failed',error:expect.objectContaining({code:'NO_PATH'})}),expect.objectContaining({status:'failed',error:expect.objectContaining({message:'WORLD_ACTOR_BLOCKED'})})]));
  expect(report.lastObservation?.snapshot?.humanoid?.controls.character.speed).toBe(4);
  const recordedTrace=JSON.parse(await readFile(path.join(path.dirname(report.videoPath!),'trace.json'),'utf8'));
  expect(recordedTrace.samples.at(-1).camera).toEqual(report.lastObservation!.snapshot.camera);
  expect(recordedTrace.samples.at(-1).camera).toMatchObject({viewId:'third-person',documentHash:expect.stringMatching(/^[a-f0-9]{64}$/),configurationRevision:expect.any(Number),cameraCommitRevision:expect.any(Number)});
  expect(recordedTrace.samples.at(-1).camera).not.toHaveProperty('resolved');
  expect(report.videoMetadata?.durationSeconds).toBeGreaterThan(2);
  const candidate=await service.compiler.prepare();expect(candidate.runtimeHash).toBe(report.runtimeHash);expect(candidate.worldBuildHash).toBe(report.worldBuildHash);
  const episode=await openEpisodeBrowser({playableRoot:candidate.playableRoot});
  try{
   await episode.prepareSegment({positionWorldMetersXYZ:[0,.03,0],facingYawRadians:0},{widthPixels:640,heightPixels:360});
   const receipt=await episode.execute({type:'actor.move-to',entityId:'immobile',targetPositionWorldMetersXYZ:[-8,0,0]});
   expect(receipt.status).toBe('accepted');if(receipt.status!=='accepted')throw Error('Episode operation not accepted');
   const failed=await episode.advance({},300);expect(failed.errors).toEqual([]);
   expect(await episode.operation(receipt.operationId)).toMatchObject({status:'failed',error:{message:'WORLD_ACTOR_BLOCKED'}});
   const moved=await episode.advance({moveZRatio:-1},30);expect(moved.simulationTick).toBe(failed.simulationTick+30);
   expect(moved.entities.find(e=>e.id==='player')!.positionWorldMetersXYZ).not.toEqual(failed.entities.find(e=>e.id==='player')!.positionWorldMetersXYZ);
   const frame=await episode.frame('image/png');expect(frame.captureSurface).toBe('world-renderer-canvas');expect(frame.imageDataUrl).toMatch(/^data:image\/png;base64,/);
   expect(episode.errors).toEqual([]);
  }finally{await episode.release();await episode.close();}
  await writeFile(path.join(root,'main.ts'),authored+`\naddEventListener('keydown',e=>{if(e.code==='KeyQ')throw new Error('RECORDING_RUNTIME_FAILURE');});`);
  await writeFile(path.join(root,'episode.json'),JSON.stringify({schemaVersion:2,targets:[],steps:[{keysDown:['KeyQ'],durationSeconds:1},{keysUp:['KeyQ'],durationSeconds:.5}]}));
  const crashed=await service.playtest('runtime-error',undefined,2);
  expect(crashed.status).toBe('failed');expect(crashed.pageErrors.join(' ')).toContain('RECORDING_RUNTIME_FAILURE');
 }finally{await service.close();await rm(root,{recursive:true,force:true});}
},60_000);

it('captures the runtime playable footprint despite a giant sky and tall world bounds, without advancing or changing the primary view',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'top-down-sdk-')),service=new ThreeCreatorTools(root,'three-sdk');
 const extra=String.raw`
 const ground=new THREE.Mesh(new THREE.BoxGeometry(40,1,40),new THREE.MeshBasicMaterial({color:0xffffff}));ground.position.y=-.5;scene.add(ground);
 const landmark=new THREE.Mesh(new THREE.BoxGeometry(6,3,6),new THREE.MeshBasicMaterial({color:0xff0000}));landmark.position.set(12,1.5,12);scene.add(landmark);
 const sky=new THREE.Mesh(new THREE.SphereGeometry(100000,12,8),new THREE.MeshBasicMaterial({color:0x29435d,side:THREE.BackSide}));scene.add(sky);
 const distant=new THREE.Mesh(new THREE.BoxGeometry(500,500,500),new THREE.MeshBasicMaterial({color:0x0000ff}));distant.position.set(10000,0,10000);scene.add(distant);
 scene.fog=new THREE.Fog(0x29435d,20,100);
 window.overviewFixture={world,ground,landmark,sky,distant};
 `;
 try{
  await writeFile(path.join(root,'index.html'),'<html><script type="module" src="./main.ts"></script></html>');
  await writeFile(path.join(root,'main.ts'),currentSdkSource.replace('max:[20,20,20]','max:[20,5000,20]')+extra);
  await writeFile(path.join(root,'project.json'),JSON.stringify({schemaVersion:1,assetIds:[]}));
  await service.inspect({sections:['snapshot']});const page=(service as unknown as {session:{page:Page}}).session.page;
  const result=await page.evaluate(()=>{
   const f=(window as any).overviewFixture,world=f.world,host=(window as any).__THREE_CREATOR_HOST__,renderer=world.renderer;
   const state=()=>{world.camera.updateMatrixWorld(true);return{snapshot:world.snapshot(),camera:world.camera.matrixWorld.toArray(),projection:world.camera.projectionMatrix.toArray(),
    viewport:renderer.getViewport({copy(v:any){return[v.x,v.y,v.z,v.w];}}),scissor:renderer.getScissor({copy(v:any){return[v.x,v.y,v.z,v.w];}}),
    ratio:renderer.getPixelRatio(),size:[renderer.domElement.width,renderer.domElement.height],scissorTest:renderer.getScissorTest(),
    autoClear:renderer.autoClear,xr:renderer.xr.enabled,shadows:renderer.shadowMap.enabled,fog:world.scene.fog,
    objects:world.scene.children.map((o:any)=>[o.uuid,o.visible,o.layers.mask])};};
   world.render();const before=state(),capture=host.capture('top-down'),after=state();
   const render=renderer.render;let error;
   renderer.render=function(scene:any,camera:any){if(camera.isOrthographicCamera)throw Error('OVERVIEW_RENDER_FAILURE');return render.call(this,scene,camera);};
   try{host.capture('top-down');}catch(e:any){error=e.message;}finally{renderer.render=render;}
   return{capture,before,after,afterFailure:state(),error};
  });
  expect(result.capture).toMatchObject({view:'top-down',boundsSource:'episode-world-bounds',bounds:{minimumMetersXYZ:[-20,-5,-20],maximumMetersXYZ:[20,5000,20]},entityIds:[],panelOrder:['top-down']});
  expect(result.after).toEqual(result.before);expect(result.error).toBe('OVERVIEW_RENDER_FAILURE');
  expect(result.afterFailure.snapshot.errors).toEqual([expect.objectContaining({code:'OVERVIEW_RENDER_FAILURE'})]);
  expect({...result.afterFailure,snapshot:{...result.afterFailure.snapshot,errors:[]}}).toEqual(result.before);
  expect(result.before.snapshot.simulationTick).toBe(40);expect(result.before.snapshot.isRunning).toBe(false);
  const decoded=await sharp(Buffer.from(result.capture.image.split(',')[1],'base64')).removeAlpha().raw().toBuffer({resolveWithObject:true});
  expect([decoded.info.width,decoded.info.height]).toEqual([960,720]);
  let white=0,red=0;for(let i=0;i<decoded.data.length;i+=3){const r=decoded.data[i]!,g=decoded.data[i+1]!,b=decoded.data[i+2]!;if(r>230&&g>230&&b>230)white++;if(r>200&&g<50&&b<50)red++;}
  expect(white).toBeGreaterThan(200000);expect(red).toBeGreaterThan(3000);
 }finally{await service.close();await rm(root,{recursive:true,force:true});}
},120000);

it('previews the current SDK shoulder through MCP without resetting paused ticks, and keeps opening reset semantics',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'current-preview-sdk-')),service=new ThreeCreatorTools(root,'three-sdk');
 try{
  await writeFile(path.join(root,'index.html'),'<html><script type="module" src="./main.ts"></script></html>');
  await writeFile(path.join(root,'main.ts'),currentSdkSource);await writeFile(path.join(root,'project.json'),JSON.stringify({schemaVersion:1,assetIds:[]}));
  await service.inspect({sections:['snapshot']});const page=(service as unknown as {session:{page:Page}}).session.page;
  const baseline=await page.evaluate(()=>{
   const observer=window.__WORLDKIT_EVAL__!;
   return observer.withPresentation!(()=>({snapshot:observer.snapshot!(),configuration:observer.capabilities!({entityIds:[]}).humanoid!.configuration,cameraInspection:observer.inspectCamera!()}));
  }),before=baseline.snapshot;
  expect(before.camera.viewKind).toBe('shoulder');expect(before.simulationTick).toBe(40);expect(before.isRunning).toBe(false);
  expect(baseline.cameraInspection.resolved?.kind).toBe('shoulder');
  const started=await executeThreeCreatorTool(service,'world_preview',{view:'current'}) as {operationId:string};
  const operation=await service.getOperation(started.operationId,25);expect(operation.status,operation.error).toBe('succeeded');
  const current=operation.result!;
  expect(current.view).toBe('current');
  expect(current.cameraObservation).toEqual({camera:baseline.cameraInspection,cameraAvailability:{status:'available'}});
  expect(await page.evaluate(()=>window.__WORLDKIT_EVAL__!.snapshot!())).toEqual(before);
  const candidate=await service.validate();expect(current).toMatchObject({sourceHash:candidate.sourceHash,worldBuildHash:candidate.worldBuildHash,runtimeHash:candidate.runtimeHash,runtimeSourceHash:candidate.runtimeSourceHash});
  const content=await toolContent(service,operation);expect(content.some(item=>item.type==='image')).toBe(true);
  expect((await sharp(await readFile(current.image.path)).metadata()).width).toBe(960);
  const optional=await page.evaluate(()=>{
   const host=window.__THREE_CREATOR_HOST__!,observer=window.__WORLDKIT_EVAL__!,original=observer.inspectCamera!;
   let queries=0;observer.inspectCamera=()=>{queries++;return original();};
   try{
    const present=host.capture('current') as any;host.capture('opening');host.read();
    const onDemandQueries=queries;
    observer.inspectCamera=()=>{throw new Error('optional camera unavailable');};
    const degraded=host.capture('current') as any;
    delete observer.inspectCamera;const unavailable=host.capture('current') as any;
    return {camera:present.cameraObservation.camera,onDemandQueries,degraded:degraded.cameraObservation,image:degraded.image,unavailable:unavailable.cameraObservation};
   }finally{observer.inspectCamera=original;}
  });
  expect(optional.camera).toEqual(baseline.cameraInspection);expect(optional.onDemandQueries).toBe(1);
  expect(optional.degraded).toEqual({camera:null,cameraAvailability:{status:'unavailable',reason:'inspection-failed'}});expect(optional.image).toMatch(/^data:image\/png;base64,/);
  expect(optional.unavailable).toEqual({camera:null,cameraAvailability:{status:'unavailable',reason:'observer-method-missing'}});
  const inherited=await page.evaluate(()=>{
   const world=(window as any).currentPreviewWorld;
   world.useAuthoredCamera();world.camera.fov=43;world.camera.updateProjectionMatrix();
   const edit=world.beginCameraEdit(),document={...world.inspectCamera().document,activation:'on-input',defaultViewId:'third-person',views:{...world.inspectCamera().document.views,'third-person':{kind:'third-person',overrides:{framing:{kind:'preserve-opening'},lens:{nearMeters:world.camera.near,farMeters:world.camera.far}}}}};
   const position=world.camera.position.clone(),direction=world.camera.getWorldDirection(position.clone());
   const draft=edit.createOpeningDraft(document,{viewId:'third-person',opening:{positionWorldMetersXYZ:position.toArray(),lookAtWorldMetersXYZ:position.clone().add(direction).toArray(),fovDegrees:43}});
   edit.applyDraft(draft,world.inspectCamera().configurationRevision);edit.dispose();
   const before=world.snapshot(),capture=window.__THREE_CREATOR_HOST__!.capture('current') as any;
   return {observation:capture.cameraObservation,settingsApplied:Object.hasOwn(world.humanoid.inspectConfiguration().effective,'camera'),
    fov:world.camera.fov,before,after:world.snapshot()};
  });
  expect(inherited.settingsApplied).toBe(false);expect(inherited.fov).toBe(43);
  expect(inherited.observation).toMatchObject({camera:{mode:'follow-pending'},cameraAvailability:{status:'available'}});
  expect(inherited.after).toEqual(inherited.before);
  await service.preview('opening');const reset=await page.evaluate(()=>window.__WORLDKIT_EVAL__!.snapshot!());
  expect(reset.camera.viewKind).toBe('third-person');expect(reset.simulationTick).toBe(0);expect(reset.isRunning).toBe(false);
 }finally{await service.close();await rm(root,{recursive:true,force:true});}
},60000);

it('accepts current through the actual CLI and captures raw pixels without calling lifecycle or requiring SDK diagnostics',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'current-preview-cli-'));
 try{
  await writeFile(path.join(root,'index.html'),'<html><script type="module" src="./main.js"></script></html>');
  await writeFile(path.join(root,'main.js'),source.replace('startLive(){},stopLive(){},reset:render',"startLive(){throw new Error('CURRENT_STARTED_WORLD');},stopLive(){throw new Error('CURRENT_STOPPED_WORLD');},reset(){throw new Error('CURRENT_RESET_WORLD');}"));
  const child=spawn(process.execPath,['--import','tsx','packages/creator-host/src/cli/cli.ts','--workspace',root,'--profile','three-raw','--tool','world_preview','--arguments',JSON.stringify({view:'current'})],{stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',value=>{stdout+=value;});child.stderr.on('data',value=>{stderr+=value;});
  try{
   const code=await new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
   expect(code,stderr||stdout).toBe(0);const operation=JSON.parse(stdout);expect(operation.status).toBe('succeeded');
   const result=operation.result;expect(result.view).toBe('current');
   expect(result.cameraObservation).toEqual({camera:null,cameraAvailability:{status:'unavailable',reason:'observer-method-missing'}});
   expect(result.sourceHash).toMatch(/^[a-f0-9]{64}$/);expect(result.runtimeHash).toMatch(/^[a-f0-9]{64}$/);
   expect((await sharp(await readFile(result.image.path)).metadata()).width).toBe(960);
  }finally{child.kill('SIGTERM');}
 }finally{await rm(root,{recursive:true,force:true});}
},60000);
