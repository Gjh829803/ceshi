import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {ThreeCreatorTools} from './tools.js';
import {captureTargets,captureObjectViews} from '../../apps/three-creator-playground/capture.js';
import type {WorldObservation} from '@worldkit/three';
import type {Page} from 'playwright';

function fixture(){
 const scene=new THREE.Scene(),player=new THREE.Group(),first=new THREE.Group(),second=new THREE.Group();scene.add(player,first,second);
 return{scene,player,first,second,world:{scene,player,camera:new THREE.PerspectiveCamera(),renderer:{} as THREE.WebGLRenderer,targets:{hero:player,'10':first,'2':second}} as Pick<WorldObservation,'scene'|'player'|'camera'|'renderer'|'targets'|'captureTargetIds'|'targetRepresentativesById'>};
}
describe('ordered representative capture selection',()=>{
 it('treats prototype-named raw entity IDs as IDs, not inherited representatives',()=>{
  const f=fixture(),world={...f.world,targets:{constructor:f.player,toString:f.first},captureTargetIds:['constructor','toString'],targetRepresentativesById:{}};
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
  const world={...f.world,targets:{hero:f.player,a:f.first,b:f.first,c:f.first},captureTargetIds:['a','b','c'],targetRepresentativesById:{a:{kind:'instance' as const,object:mesh,instanceIndex:2},b:{kind:'instance' as const,object:mesh,instanceIndex:2},c:{kind:'instance' as const,object:mesh,instanceIndex:0}}};
  expect(captureTargets(world)).toEqual([{id:'player',sourceEntityId:'hero'},{id:'a',sourceEntityId:'a',representative:{kind:'instance',objectUuid:mesh.uuid,instanceIndex:2}},{id:'c',sourceEntityId:'c',representative:{kind:'instance',objectUuid:mesh.uuid,instanceIndex:0}}]);
  mesh.count=2;expect(()=>captureTargets(world)).toThrow('INSTANCE_INVALID');
 });
 it('rejects stale/foreign references, subject limbs and multi-object three-view sheets before touching rendering',()=>{
  const f=fixture(),child=new THREE.Group();f.first.add(child);
  const world={...f.world,captureTargetIds:['10'],targetRepresentativesById:{'10':{kind:'object' as const,object:child}}};
  expect(captureTargets(world)[1]!.representative!.objectUuid).toBe(child.uuid);f.second.add(child);
  expect(()=>captureTargets(world)).toThrow('REPRESENTATIVE_NOT_IN_ENTITY');
  f.scene.remove(f.first);expect(()=>captureTargets({...f.world,captureTargetIds:['10']})).toThrow('TARGET_NOT_IN_SCENE');
  f.player.add(child);expect(()=>captureTargets({...f.world,captureTargetIds:['hero'],targetRepresentativesById:{hero:{kind:'object',object:child}}})).toThrow('SUBJECT_MUST_BE_COMPLETE');
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
window.__WORLDKIT_EVAL__={ready:true,scene,camera,renderer,player,targets:{hero:player,crowd:ancestor,crystals:parent},captureTargetIds:['hero','crowd','crystals'],targetRepresentativesById,startLive(){},stopLive(){},reset:render};
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
     observer.targets={constructor:observer.player};observer.captureTargetIds=['constructor'];observer.targetRepresentativesById={};observer.targetFrontYawRadiansById={};
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
