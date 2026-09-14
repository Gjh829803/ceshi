import * as cameraQueries from './camera-queries';
import {createHumanoidCameraDocument} from '../config/camera/index';
import {describe,it,expect,vi} from 'vitest';
import {Group,PerspectiveCamera,Vector2,Vector3,Quaternion,PCFShadowMap,type WebGLRenderer} from 'three';
import {createWorld} from '../world';
import type {WorldObservation} from '../contracts';
const map={id:'camera',name:'Camera',description:'',bounds:{min:[-50,-10,-50],max:[50,50,50]},boxes:[{id:'ground',position:[0,-.5,0],size:[100,1,100]}],water:[],regions:[],spawns:[],playerSpawn:[0,.03,0]} as const;
const fixture=(renderer?:WebGLRenderer)=>createWorld({camera:new PerspectiveCamera(),...(renderer?{renderer}:{}),navigation:false,assetDefinitions:{},humanoid:{map,character:{instanceId:'person',object:new Group()},vehicles:[]}});
function authored(world:Awaited<ReturnType<typeof fixture>>){world.useAuthoredCamera();const c=world.camera as PerspectiveCamera;c.position.set(11,22,33);c.lookAt(0,0,0);c.fov=41;c.near=.2;c.far=700;c.updateProjectionMatrix();return c.clone();}
function matches(world:Awaited<ReturnType<typeof fixture>>,camera:PerspectiveCamera){expect(world.cameraMode).toBe('authored');expect(world.camera.position.toArray()).toEqual(camera.position.toArray());expect(world.camera.quaternion.angleTo(camera.quaternion)).toBeLessThan(1e-7);expect((world.camera as PerspectiveCamera).fov).toBe(camera.fov);expect(world.camera.projectionMatrix.elements).toEqual(camera.projectionMatrix.elements);}
describe('Humanoid sealed camera lifecycle',()=>{
 it('observes real camera sweeps without changing queries, poses or fixed time',async()=>{
  const setup=()=>createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map:{...map,boxes:[...map.boxes,{id:'wall',position:[0,3,2.5],size:[10,6,.3]}]},character:{instanceId:'person',object:new Group()},vehicles:[]}});
  const observed=await setup(),baseline=await setup();
  try{
   const queries=vi.spyOn(cameraQueries,'probeHumanoidCamera');
   expect(observed.inspectCamera().collisionQueries).toBeUndefined();observed.setCameraCollisionDiagnosticsEnabled(true);
   observed.step({},2);const calls=queries.mock.calls.map(call=>structuredClone(call.slice(1,4)));queries.mockClear();baseline.step({},2);
   expect(observed.snapshot()).toEqual(baseline.snapshot());expect(calls).toEqual(queries.mock.calls.map(call=>structuredClone(call.slice(1,4))));
   const sample=observed.inspectCamera().collisionQueries!.fixed!;expect(sample.probes.length).toBeGreaterThan(0);expect(sample.source).toBe('fixed');
   expect(sample.simulationTick).toBe(observed.simulationTick);
   for(const probe of sample.probes)expect(calls).toContainEqual([probe.from,probe.to,probe.radius]);
   const before=observed.snapshot(),count=queries.mock.calls.length;
   expect(observed.inspectCamera().collisionQueries!.fixed).toEqual(sample);expect(observed.snapshot()).toEqual(before);expect(queries).toHaveBeenCalledTimes(count);
   expect(Object.isFrozen(sample.probes)).toBe(true);
   observed.setCameraCollisionDiagnosticsEnabled(false);expect(observed.inspectCamera().collisionQueries).toBeUndefined();queries.mockRestore();
  }finally{observed.dispose();baseline.dispose();}
 });
 it('reads a dirty camera pose without changing transform caches or ownership',async()=>{
  const w=await fixture();w.setCameraFollow({configuration:createHumanoidCameraDocument('person')});try{
   w.step({},0);w.useAuthoredCamera();
   const c=w.camera,parent=new Group();w.scene.add(parent);parent.add(c);
   parent.position.set(4,5,6);parent.rotation.y=.4;c.position.set(1,2,3);
   const matrix=c.matrix.clone(),worldMatrix=c.matrixWorld.clone(),parentMatrix=parent.matrix.clone(),dirty=c.matrixWorldNeedsUpdate;
   const expected=c.position.clone().applyQuaternion(parent.quaternion).add(parent.position);
   const state=w.humanoid!.cameraSnapshot();
   state.positionWorldMetersXYZ.forEach((value,index)=>expect(value).toBeCloseTo(expected.toArray()[index]!,10));
   expect(c.matrix.equals(matrix)).toBe(true);expect(c.matrixWorld.equals(worldMatrix)).toBe(true);expect(c.matrixWorldNeedsUpdate).toBe(dirty);expect(parent.matrix.equals(parentMatrix)).toBe(true);
   w.onUpdate(()=>{w.snapshot();});expect(()=>w.step({},1)).not.toThrow();
  }finally{w.dispose();}
 });
 it('reports authored world pose without stale follow diagnostics or advancing state',async()=>{
  const w=await fixture();w.setCameraFollow({configuration:createHumanoidCameraDocument('person')});try{
   w.setCameraView('shoulder');w.step({moveZRatio:-1},10);
   const parent=new Group();parent.position.set(4,5,6);parent.rotation.y=.7;w.scene.add(parent);parent.add(w.camera);authored(w);
   const before=w.simulationTick,position=w.camera.getWorldPosition(new Vector3()).toArray(),rotation=w.camera.getWorldQuaternion(new Quaternion()).toArray();
   for(let i=0;i<2;i++){
    const state=w.snapshot().camera;
    expect(state).toMatchObject({mode:'authored',positionWorldMetersXYZ:position,orientationWorldQuaternionXYZW:rotation,desiredPositionWorldMetersXYZ:null});
    for(const key of ['desiredArmDistanceMeters','actualArmDistanceMeters','collisionPhase'])expect(state).not.toHaveProperty(key);
   }
   expect(w.simulationTick).toBe(before);expect(w.camera.getWorldPosition(new Vector3()).toArray()).toEqual(position);
  }finally{w.dispose();}
 });
 it('restores pre-seal authored pose and projection immediately on repeated paused resets',async()=>{
  const w=await fixture();w.setCameraFollow({configuration:createHumanoidCameraDocument('person')});try{const parent=new Group(),attachment=new Group();w.scene.add(parent);parent.position.set(2,0,0);parent.add(w.camera);w.camera.add(attachment);const initial=authored(w);w.step({},0);
   for(let i=0;i<2;i++){w.setCameraFollow({configuration:createHumanoidCameraDocument('person')});w.setCameraView('shoulder');w.step({moveZRatio:-1},30);await w.reset();matches(w,initial);expect(w.camera.parent).toBe(parent);expect(w.camera.children).toEqual([attachment]);expect(w.simulationTick).toBe(0);expect(w.isRunning).toBe(false);const before=w.snapshot();w.snapshot();w.humanoid!.inspectConfiguration();expect(w.snapshot()).toEqual(before);matches(w,initial);}
  }finally{w.dispose();}
 });
 it.each(['first-person','third-person'] as const)('restores configured %s follow despite post-seal authored and temporary shoulder state',async defaultPerspective=>{
  const w=await fixture();w.setCameraFollow({configuration:createHumanoidCameraDocument('person')});try{w.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,defaultViewId:defaultPerspective,binding:{targetEntityId:'person'},activation:'immediate',views:{'third-person':{kind:'third-person',overrides:{lens:{verticalFovDegrees:63}}},'first-person':{kind:'first-person',overrides:{lens:{verticalFovDegrees:63}}},shoulder:{kind:'shoulder'}}}});w.step({},0);
   authored(w);await w.reset();expect(w.cameraMode).toBe('follow');expect(w.snapshot().camera.viewKind).toBe(defaultPerspective);expect((w.camera as PerspectiveCamera).fov).toBe(63);
   w.setCameraView('shoulder');await w.reset();expect(w.snapshot().camera.viewKind).toBe(defaultPerspective);
  }finally{w.dispose();}
 });
 it('seals on start and preserves authored reset after Episode takes and releases the camera',async()=>{
  const win=new EventTarget(),doc=Object.assign(new EventTarget(),{defaultView:win,activeElement:null,body:{},documentElement:{},hidden:false});Object.assign(win,{document:doc});vi.stubGlobal('window',win);vi.stubGlobal('requestAnimationFrame',vi.fn(()=>1));vi.stubGlobal('cancelAnimationFrame',vi.fn());
  const canvas=Object.assign(new EventTarget(),{width:800,height:600,ownerDocument:doc,getAttribute:()=>null,removeAttribute:()=>{},setAttribute:()=>{},style:{getPropertyValue:()=>'',getPropertyPriority:()=>'',setProperty:()=>{},removeProperty:()=>{}},toDataURL:()=> 'data:image/png;base64,dGVzdA=='});let ratio=1;const size=new Vector2(800,600);
  const renderer={shadowMap:{enabled:false,type:PCFShadowMap,needsUpdate:false},domElement:canvas,render:vi.fn(),getSize:(out:Vector2)=>out.copy(size),getPixelRatio:()=>ratio,setPixelRatio:(r:number)=>{ratio=r;},setSize:(x:number,y:number)=>{size.set(x,y);canvas.width=x*ratio;canvas.height=y*ratio;}} as unknown as WebGLRenderer;
  const w=await fixture(renderer);w.setCameraFollow({configuration:createHumanoidCameraDocument('person')});try{w.setCameraView('third-person');const initial=authored(w);await w.start();await w.reset();matches(w,initial);expect(w.isRunning).toBe(true);expect(w.simulationTick).toBe(0);
   const port=(win as unknown as {__WORLDKIT_EVAL__:WorldObservation}).__WORLDKIT_EVAL__.episode!;
   for(const mode of [undefined,2] as const){await port.prepareSegment({positionWorldMetersXYZ:[0,.03,0],facingYawRadians:0,...(mode===undefined?{}:{cameraViewId:'shoulder'})},{widthPixels:640,heightPixels:360});expect(w.cameraMode).toBe(mode===undefined?'authored':'follow');expect(w.snapshot().camera.viewId).toBe(mode===undefined?null:'shoulder');expect(w.isRunning).toBe(false);expect(()=>w.humanoid!.useAuthoredCamera()).toThrow('EPISODE_CAPTURE_OWNS_CLOCK');const before=w.snapshot();const frame=port.frame('image/png');expect(port.frame('image/png')).toEqual(frame);expect(w.snapshot()).toEqual(before);port.advance({moveZRatio:-1},5);port.release();await w.reset();matches(w,initial);expect(w.isRunning).toBe(false);expect(w.simulationTick).toBe(0);}
  }finally{w.dispose();vi.unstubAllGlobals();}
 });
});
