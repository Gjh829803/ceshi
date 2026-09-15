import * as THREE from 'three';
import {describe,it,expect,vi} from 'vitest';
import {createWorld,type ThreeWorld} from './world';
import {WorldEngine} from './engine';
import type {World} from './contracts';
import type {CameraDocument} from './config/camera/index';
import {createMountedFixture} from './humanoid-runtime/mounted-test-fixture';
import {WorldPresentationContext} from './camera/presentation-context';
const map={id:'camera-integration',name:'Camera',description:'',bounds:{min:[-50,-10,-50],max:[50,50,50]},boxes:[{id:'ground',position:[0,-.5,0],size:[100,1,100]}],water:[],regions:[],spawns:[],playerSpawn:[0,.03,0]} as const;
async function fixture(){return createWorld({navigation:false,assetDefinitions:{},humanoid:{map,character:{instanceId:'person',object:new THREE.Group()},vehicles:[]}});}
function document(targetEntityId='person'):CameraDocument{return {kind:'world-camera',schemaVersion:1,defaultViewId:'third',binding:{targetEntityId},activation:'immediate',input:{cycleViewIds:['third','first','shoulder']},views:{third:{kind:'third-person',overrides:{position:{distanceMeters:4},orientation:{recenter:{enabled:false}}}},first:{kind:'first-person'},shoulder:{kind:'shoulder'}}};}
const engine=(world:ThreeWorld)=>(world as unknown as {engine:WorldEngine}).engine;
describe('single World camera integration',()=>{
 it('shares one capture rewind cut across repeated requests',()=>{
  const samples=new WorldPresentationContext();samples.sample(8,1);
  const cut=samples.sample(8,.2),again=samples.sample(8,.4);
  expect(cut).toEqual({...cut,alpha:1,cut:true});expect(again).toEqual(cut);
  expect(samples.sample(9,.3)).toMatchObject({alpha:.3,cut:false});
 });
 it('uses the same cut for actor presentation and camera, without advancing commits',async()=>{
  const world=await fixture();try{world.setCameraFollow({configuration:document()});world.step({moveZRatio:-1},20);
   const before=world.inspectCamera(),poses:unknown[]=[];
   for(const alpha of [1,.2,.4])engine(world).withPresentation(()=>poses.push([world.camera.position.toArray(),world.humanoid!.options.character.object.position.toArray()]),alpha);
   expect(poses[1]).toEqual(poses[0]);expect(poses[2]).toEqual(poses[0]);expect(world.inspectCamera()).toEqual(before);
  }finally{world.dispose();}
 });
 it('keeps an explicit target independent of the controlled actor and routes all named views',async()=>{
  const world=await fixture();try{
   world.addCharacter({id:'other',object:new THREE.Group(),body:{heightMeters:1.2,radiusMeters:.2}});world.setCameraFollow({configuration:document()});
   world.setControlledEntity('other');world.step({moveZRatio:-1},3);
   expect(world.inspectCamera().current?.resolvedSubjectId).toBe('person');
   for(const id of ['first','shoulder','third']){world.setCameraView(id);world.step({cameraYawRatio:.3});expect(world.inspectCamera().resolved?.viewId).toBe(id);expect(world.camera.position.toArray().every(Number.isFinite)).toBe(true);}
  }finally{world.dispose();}
 });
 it('rejects fixed and display reentry before mutating the committed configuration',async()=>{
  const world=await fixture();try{world.setCameraFollow({configuration:document()});
   const before=world.inspectCamera();const release=world.onUpdate(()=>{expect(()=>world.setCameraFollow({configuration:document()})).toThrow('CAMERA_TRANSACTION_REENTRY');});world.step({});release();
   engine(world).withPresentation(()=>{expect(()=>world.setCameraView('first')).toThrow('CAMERA_TRANSACTION_REENTRY');expect(()=>world.step({})).toThrow();});
   expect(world.inspectCamera().configurationRevision).toBe(before.configurationRevision);
  }finally{world.dispose();}
 });
 it('rebases a same-ID relocation once and keeps revisions monotonic through reset',async()=>{
  const world=await fixture();try{world.setCameraFollow({configuration:document()});world.step({},0);
   const before=world.inspectCamera();expect(world.humanoid!.prepareCharacter([8,.03,0],world.humanoid!.simulation.controlledActor.player.yaw)).toBe(true);
   const relocated=world.inspectCamera();expect(relocated.cameraCommitRevision).toBeGreaterThan(before.cameraCommitRevision);expect(relocated.current!.positionWorldMetersXYZ[0]-before.current!.positionWorldMetersXYZ[0]).toBeCloseTo(8,4);
   world.step({});const stepped=world.inspectCamera();await world.reset();expect(world.inspectCamera().cameraCommitRevision).toBeGreaterThan(stepped.cameraCommitRevision);expect(world.inspectCamera().current?.subjectGeneration).not.toBe(before.current?.subjectGeneration);
  }finally{world.dispose();}
 });
 it('releases a deleted target and does not bind its replacement generation',async()=>{
  const world=await fixture();try{world.addCharacter({id:'other',object:new THREE.Group(),body:{heightMeters:1,radiusMeters:.2}});world.setCameraFollow({configuration:document('other')});
   const before=world.inspectCamera();await world.execute({type:'entity.despawn',entityId:'other'});expect(world.cameraMode).toBe('authored');
   world.addCharacter({id:'other',object:new THREE.Group(),body:{heightMeters:1,radiusMeters:.2}});expect(world.cameraMode).toBe('authored');expect(world.inspectCamera().resolved).toBeUndefined();expect(world.inspectCamera().cameraCommitRevision).toBeGreaterThan(before.cameraCommitRevision);
  }finally{world.dispose();}
 });
 it('admits effective authored FOV through a rigid parent and rejects off-axis projection atomically',async()=>{
  const world=await fixture();try{const camera=world.camera as THREE.PerspectiveCamera,parent=new THREE.Group();world.scene.add(parent);parent.position.set(4,0,1);parent.rotation.y=.3;parent.add(camera);camera.position.set(3,5,8);camera.lookAt(0,1,0);camera.fov=70;camera.zoom=2;camera.updateProjectionMatrix();
   const config:CameraDocument={...document(),activation:'on-input',input:{cycleViewIds:[]},views:{third:{kind:'third-person',overrides:{framing:{kind:'preserve-opening'},zoom:{range:{kind:'unbounded'}}}}}};
   camera.filmOffset=1;const before=world.inspectCamera();expect(()=>world.setCameraFollow({configuration:config})).toThrow('OFF_AXIS');expect(world.inspectCamera()).toEqual(before);camera.filmOffset=0;
   const fov=camera.getEffectiveFOV(),position=camera.getWorldPosition(new THREE.Vector3());world.setCameraFollow({configuration:config});expect(camera.fov).toBeCloseTo(fov);expect(camera.getWorldPosition(new THREE.Vector3()).distanceTo(position)).toBeLessThan(1e-7);expect(world.inspectCamera().document!.views.third).toHaveProperty('opening.fovDegrees',fov);
   parent.scale.x=2;expect(()=>world.setCameraView('third')).toThrow();
  }finally{world.dispose();}
 });
 it('resets a manual mount to the actual actor and supports subsequent dismount views',async()=>{
  const world=await createMountedFixture();try{world.setCameraFollow({configuration:document()});world.step({},0);expect(world.humanoid!.enter('horse-1')).toBe(true);expect(world.inspectCamera().current?.resolvedSubjectId).toBe('horse-1');
   world.setCameraView('first');world.step({},90);expect(world.humanoid!.exit()).toBe(true);expect(world.inspectCamera().current?.resolvedSubjectId).toBe('person');
   await world.reset();expect(world.inspectCamera().current?.resolvedSubjectId).toBe('person');expect(world.inspectCamera().document?.binding.targetEntityId).toBe('person');
  }finally{world.dispose();}
 });
});

it('keeps other native actors as camera obstacles and excludes only the resolved subject',async()=>{
 const world=await fixture();try{
  const other=new THREE.Group();other.position.set(3,.03,0);world.addCharacter({id:'other',object:other,body:{heightMeters:1.7,radiusMeters:.3}});
  world.setCameraFollow({configuration:document()});
  const subject=engine(world).cameraSubjects.sample(document().binding)!;
  const {humanoidHost}=await import('./humanoid-runtime/host-access');
  const {probe}=humanoidHost(world.humanoid!).cameraGeometry(subject);
  expect(probe([-1,1,0],[1,1,0],.1).colliderEntityId).toBeUndefined();
  const hit=probe([1,1,0],[5,1,0],.1);expect(hit.colliderEntityId).toBe('other');expect(hit.distanceMeters).toBeCloseTo(1.6,3);
 }finally{world.dispose();}
});

it('stops after a postphysics camera failure without replaying input or replacing its last commit',async()=>{
 const world=await fixture();try{
  world.setCameraFollow({configuration:document()});world.step({});
  const before=world.inspectCamera(),tick=world.simulationTick;
  const {humanoidHost}=await import('./humanoid-runtime/host-access');
  const query=vi.spyOn(humanoidHost(world.humanoid!),'cameraGeometry').mockImplementation(()=>{throw new Error('native query unavailable');});
  world.onDispose(()=>query.mockRestore());
  expect(()=>world.step({moveZRatio:-1})).toThrow();
  expect(world.simulationTick).toBe(tick+1);expect(world.isRunning).toBe(false);
  const failed=world.inspectCamera();expect(failed.cameraCommitRevision).toBe(before.cameraCommitRevision);expect(failed.current).toEqual(before.current);expect(failed.failure?.controlBasis).toBeDefined();
  expect(()=>world.step({moveZRatio:-1})).toThrow();expect(world.simulationTick).toBe(tick+1);
 }finally{world.dispose();}
});

it('requires an explicit ordinary eye and transforms it once independently of semantic forward',async()=>{
 const world=await createWorld({navigation:false});try{
  const parent=new THREE.Group(),object=new THREE.Group();parent.position.set(5,2,1);parent.rotation.y=.4;world.scene.add(parent);parent.add(object);object.position.set(1,2,0);object.scale.set(2,1.5,2);
  world.addCharacter({id:'ordinary',object,body:{heightMeters:1,radiusMeters:.2},frontYawRadians:Math.PI,eyePositionLocalMetersXYZ:[.2,1,.1]});
  const config:CameraDocument={...document('ordinary'),defaultViewId:'first'};
  world.setCameraFollow({configuration:config});const expected=new THREE.Vector3(.2,1,.1).applyMatrix4(object.matrixWorld);
  expect(world.camera.getWorldPosition(new THREE.Vector3()).distanceTo(expected)).toBeLessThan(1e-6);
  const missing=new THREE.Group();missing.position.set(-5,2,0);world.addCharacter({id:'missing',object:missing,body:{heightMeters:1,radiusMeters:.2}});
  const before=world.inspectCamera();expect(()=>world.setCameraFollow({configuration:{...config,binding:{targetEntityId:'missing'}}})).toThrow();expect(world.inspectCamera()).toEqual(before);
  expect(()=>world.addCharacter({id:'bad',object:new THREE.Group(),body:{heightMeters:1,radiusMeters:.2},eyePositionLocalMetersXYZ:[NaN,1,0]})).toThrow();
 }finally{world.dispose();}
});

it('activates pending follow from the actual override and consumes pointer deltas once across substeps',async()=>{
 const world=await fixture();try{
  world.setCameraFollow({configuration:{...document(),activation:'on-input'}});world.step({},0);
  world.humanoid!.setInput({...((await import('./humanoid-runtime/simulation')).emptyInput()),forward:1});world.step({});expect(world.cameraMode).toBe('follow');
  const before=world.inspectCamera().intent!;
  (engine(world) as unknown as {pointerInput:unknown}).pointerInput={yawDeltaRadians:.3,pitchDeltaRadians:.1,distanceDeltaMeters:.5};
  engine(world).advance(2/60,{});const after=world.inspectCamera().intent!;
  expect(after.yawRadians-before.yawRadians).toBeCloseTo(.3,8);expect(after.pitchRadians-before.pitchRadians).toBeCloseTo(.1,8);expect(after.distanceMeters-before.distanceMeters).toBeCloseTo(.5,8);
 }finally{world.dispose();}
});

it('commits an authored relocation without changing its sealed baseline and rejects an invalid candidate',async()=>{
 const world=await fixture();try{world.useAuthoredCamera();world.camera.position.set(3,4,8);world.camera.lookAt(0,1,0);world.step({},0);
  const controller=engine(world).cameraController,before=world.inspectCamera(),frame={lifecycleGeneration:before.current!.lifecycleGeneration,simulationTick:0,aspect:(world.camera as THREE.PerspectiveCamera).aspect};
  expect(()=>controller.commitAuthoredPose({...before.current!,positionWorldMetersXYZ:[NaN,0,0]},frame)).toThrow();expect(world.inspectCamera()).toEqual(before);
  controller.commitAuthoredPose({...before.current!,positionWorldMetersXYZ:[13,4,8]},frame);expect(world.inspectCamera().current!.positionWorldMetersXYZ).toEqual([13,4,8]);
  const revision=world.inspectCamera().cameraCommitRevision;await world.reset();expect(world.inspectCamera().current!.positionWorldMetersXYZ).toEqual(before.current!.positionWorldMetersXYZ);expect(world.inspectCamera().cameraCommitRevision).toBeGreaterThan(revision);
 }finally{world.dispose();}
});

it('corrects the display anchor without cancelling nonzero fixed smoothing or advancing state',async()=>{
 const world=await fixture();try{
  const config:CameraDocument={...document(),defaultViewId:'first',views:{...document().views,first:{kind:'first-person',overrides:{position:{subjectTranslationHalfLifeSeconds:.5,anchorHalfLifeSeconds:.5},constraints:{collision:{enabled:false}}}}}};
  world.setCameraFollow({configuration:config});world.step({moveZRatio:-1},30);
  const before=world.inspectCamera(),current=before.current!,facts=current.subject!,oldEye=new THREE.Vector3(...facts.eyeWorldMetersXYZ!),fixedEye=new THREE.Vector3(...current.positionWorldMetersXYZ);
  expect(fixedEye.distanceTo(oldEye)).toBeGreaterThan(.05);
  const display={...facts,eyeWorldMetersXYZ:oldEye.clone().add(new THREE.Vector3(2,0,0)).toArray()},context={epoch:0,previousTick:before.previous!.simulationTick,currentTick:current.simulationTick,alpha:1,cut:false};
  const controller=engine(world).cameraController,projected=controller.sampleProjection(context,(world.camera as THREE.PerspectiveCamera).aspect,display)!;
  expect(new THREE.Vector3(...projected.positionWorldMetersXYZ).distanceTo(fixedEye.clone().add(new THREE.Vector3(2,0,0)))).toBeLessThan(1e-7);
  expect(controller.sampleProjection(context,(world.camera as THREE.PerspectiveCamera).aspect,display)).toEqual(projected);expect(world.inspectCamera()).toEqual(before);
 }finally{world.dispose();}
});

it('samples a vehicle body around its actual envelope offset rather than an assumed ground origin',async()=>{
 const {SPECS}=await import('@worldkit/preset-content/config');
 const spec=SPECS.find(value=>Math.abs(value.envelope.offset[1]-value.envelope.halfExtents[1])>.01)!;expect(spec).toBeDefined();
 const world=await createWorld({navigation:false,assetDefinitions:{},humanoid:{map,character:{instanceId:'person',object:new THREE.Group()},vehicles:[{instanceId:spec.id,assetId:'fixture',spec:{...structuredClone(spec),spawn:[0,3,0]},object:new THREE.Group()}]}});
 try{const facts=engine(world).cameraSubjects.sample({targetEntityId:spec.id})!;
  expect(facts.body).toEqual({minimumHeightMeters:spec.envelope.offset[1]-spec.envelope.halfExtents[1],maximumHeightMeters:spec.envelope.offset[1]+spec.envelope.halfExtents[1]});
  const {subjectAnchor}=await import('./camera/subject');const center=subjectAnchor(facts,{kind:'body',heightRatio:.5});expect(center.y-facts.positionWorldMetersXYZ[1]).toBeCloseTo(spec.envelope.offset[1]);
 }finally{world.dispose();}
});

it('rejects reset reentry before changing entity generations or camera lifecycle',async()=>{
 const world=await fixture();try{world.setCameraFollow({configuration:document()});world.step({},0);const before=world.snapshot();
  let reset:Promise<void>|undefined;engine(world).withPresentation(()=>{reset=world.reset();});await expect(reset).rejects.toThrow('WORLD_TRANSACTION_REENTRY');expect(world.snapshot()).toEqual(before);
 }finally{world.dispose();}
});

it('rejects public native relocation before changes inside presentation and visual callbacks',async()=>{
 const world=await fixture();try{world.setCameraFollow({configuration:document()});world.step({},1);
  const before=world.snapshot(),camera=world.inspectCamera();
  engine(world).withPresentation(()=>expect(()=>world.humanoid!.prepareCharacter([8,.03,0])).toThrow('WORLD_TRANSACTION_REENTRY'));
  expect(world.snapshot()).toEqual(before);expect(world.inspectCamera()).toEqual(camera);
  world.defineParameter({id:'visual-guard',description:'Visual callback guard',schema:{type:'boolean'},initialValue:true,writes:[{kind:'visual',channelId:'guard'}],effect:()=>expect(()=>world.humanoid!.prepareCharacter([8,.03,0])).toThrow('WORLD_TRANSACTION_REENTRY')});
  expect(world.inspectCamera()).toEqual(camera);
  const release=world.humanoid!.onVisualUpdate(()=>expect(()=>world.humanoid!.prepareCharacter([8,.03,0])).toThrow('WORLD_TRANSACTION_REENTRY'));
  world.step({moveZRatio:-1});engine(world).withPresentation(()=>{});release();
  expect(world.getEntityState('person').positionWorldMetersXYZ[0]).toBeCloseTo(0);
  expect(world.simulationTick).toBe(2);
 }finally{world.dispose();}
});

it('rebases directly bound vehicle relocation and dormant views without replacing its generation',async()=>{
 const world=await createMountedFixture();try{
  const config:CameraDocument={...document('horse-1'),transition:{durationSeconds:0},input:{cycleViewIds:[]},views:{third:{kind:'third-person',overrides:{position:{distanceMeters:5,subjectTranslationHalfLifeSeconds:0,anchorHalfLifeSeconds:0,armHalfLifeSeconds:0},constraints:{collision:{enabled:false}}}},dormant:{kind:'third-person',overrides:{position:{distanceMeters:7},constraints:{collision:{enabled:false}}}}}};
  world.setCameraFollow({configuration:config});world.setCameraView('dormant');const dormant=world.inspectCamera().current!;world.setCameraView('third');world.step({},1);const before=world.inspectCamera();
  const spawn=world.humanoid!.options.map.spawns[0]!;expect(world.humanoid!.prepare('horse-1',{...spawn,position:[15,.025,0],yaw:Math.PI/2})).toBe(true);
  const after=world.inspectCamera();expect(after.cameraCommitRevision).toBeGreaterThan(before.cameraCommitRevision);expect(after.current?.subjectGeneration).toBe(before.current?.subjectGeneration);expect(after.current!.subject!.positionWorldMetersXYZ[0]).toBeCloseTo(15);
  world.setCameraView('dormant');const actual=world.inspectCamera().current!,rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2);
  const expected=new THREE.Vector3(...dormant.positionWorldMetersXYZ).sub(new THREE.Vector3(...dormant.subject!.positionWorldMetersXYZ)).applyQuaternion(rotation).add(new THREE.Vector3(...actual.subject!.positionWorldMetersXYZ));
  expect(new THREE.Vector3(...actual.positionWorldMetersXYZ).distanceTo(expected)).toBeLessThan(1e-6);
 }finally{world.dispose();}
});

it('adopts an immediate initial preserve-opening document and rejects an unsafe update atomically',async()=>{
 const world=await createWorld({navigation:false});try{const object=new THREE.Group();object.position.y=1;world.addCharacter({id:'person',object,body:{heightMeters:1,radiusMeters:.2}});const camera=world.camera as THREE.PerspectiveCamera;camera.position.set(0,3,8);camera.lookAt(0,1,0);const pose=camera.clone();
  const config:CameraDocument={kind:'world-camera',schemaVersion:1,defaultViewId:'third',activation:'immediate',binding:{targetEntityId:'person'},views:{third:{kind:'third-person',overrides:{framing:{kind:'preserve-opening'},zoom:{range:{kind:'unbounded'}}}}}};
  world.setCameraFollow({configuration:config});expect(world.cameraMode).toBe('follow');expect(world.simulationTick).toBe(0);expect(world.inspectCamera().document!.views.third).toHaveProperty('opening');expect(camera.position.distanceTo(pose.position)).toBeLessThan(1e-6);
  const before=world.inspectCamera();expect(()=>world.setCameraFollow({configuration:{...config,views:{third:{kind:'third-person',overrides:{framing:{kind:'preserve-opening'},zoom:{range:{kind:'bounded',minimumDistanceMeters:0,maximumDistanceMeters:1}}}}}}})).toThrow();expect(world.inspectCamera()).toEqual(before);
 }finally{world.dispose();}
});

it('reports shoulder consistently through retained native inspection and snapshot',async()=>{
 const world=await fixture();try{world.setCameraFollow({configuration:document()});world.setCameraView('shoulder');expect(world.inspectCamera().resolved?.kind).toBe('shoulder');expect(world.snapshot().camera.viewKind).toBe('shoulder');}finally{world.dispose();}
});

it('retains authorized Engine relocation inside the fixed phase through the private native host',async()=>{
 const world=await fixture();try{world.setCameraFollow({configuration:document()});
  const release=engine(world).onUpdate(()=>{expect(engine(world).execute({type:'entity.set-position',entityId:'person',positionMetersXYZ:[2,.03,0]}).status).toBe('applied');});
  world.step({});release();expect(world.getEntityState('person').positionWorldMetersXYZ[0]).toBeCloseTo(2);
 }finally{world.dispose();}
});


it('aborts only the uncommitted camera input after movement failure and recovers through reset',async()=>{
 const world=await createWorld({navigation:false});let fail=true;
 try{
  world.registerMovement({id:'fallible',version:1,description:'Fallible movement',initialState:null,update:({state})=>{
   if(fail)throw new Error('PROBE_MOVEMENT_FAILURE');
   return {state,velocityWorldMetersPerSecondXYZ:[0,0,0],applyGravity:false};
  }});
  world.addCharacter({id:'actor',object:new THREE.Group(),body:{heightMeters:2,radiusMeters:.3},movement:{kind:'custom',movementId:'fallible'}});
  world.setControlledEntity('actor');world.setCameraFollow({configuration:{...document('actor'),views:{third:{kind:'third-person'}},input:{cycleViewIds:[]}}});world.step({},0);
  const before=world.inspectCamera();expect(()=>world.step({cameraYawRatio:1})).toThrow('PROBE_MOVEMENT_FAILURE');
  expect(world.inspectCamera()).toEqual(before);expect(world.simulationTick).toBe(0);expect(world.isRunning).toBe(false);
  fail=false;await world.reset();world.step({cameraYawRatio:1});
  expect(world.simulationTick).toBe(1);expect(world.inspectCamera().cameraCommitRevision).toBeGreaterThan(before.cameraCommitRevision);
  expect(world.snapshot().errors).toEqual([]);
 }finally{world.dispose();}
});

it('observes the committed unconstrained eye separately from the retracted camera without solving again',async()=>{
 const world=await createWorld({navigation:false});try{
  world.addCharacter({id:'actor',object:new THREE.Group(),body:{heightMeters:2,radiusMeters:.3}});
  const wall=new THREE.Mesh(new THREE.BoxGeometry(4,4,1));wall.position.set(0,1,3.5);world.addEntity({id:'wall',object:wall,role:'obstacle',physics:{kind:'fixed',shape:'box'}});
  world.setCameraFollow({configuration:{...document('actor'),views:{third:{kind:'third-person',overrides:{position:{anchor:{kind:'origin'},anchorOffset:{space:'world',offsetMetersXYZ:[0,1,0]},distanceMeters:8},orientation:{initialPitchRadians:0},constraints:{visibility:'require-line-of-sight'}}}},input:{cycleViewIds:[]}}});
  world.step({},0);const before=world.inspectCamera(),snapshot=world.snapshot().camera;
  expect(snapshot.desiredPositionWorldMetersXYZ).toEqual([0,1,8]);expect(snapshot.positionWorldMetersXYZ[2]).toBeLessThan(3);
  const query=vi.spyOn(engine(world).physics,'castCameraArm').mockImplementation(()=>{throw new Error('Observation must not solve');});
  try{for(let i=0;i<3;i++){expect(world.snapshot().camera).toEqual(snapshot);expect(world.inspectCamera()).toEqual(before);}}finally{query.mockRestore();}
 }finally{world.dispose();}
});


it('exposes real-subject visibility in fixed inspection and stateless World presentation',async()=>{
 const world=await createWorld({navigation:false});try{
  world.registerMovement({id:'lateral',version:1,description:'Lateral movement',initialState:null,update:({state})=>({state,velocityWorldMetersPerSecondXYZ:[240,0,0],applyGravity:false})});
  world.addCharacter({id:'actor',object:new THREE.Group(),body:{heightMeters:2,radiusMeters:.3},movement:{kind:'custom',movementId:'lateral'}});world.setControlledEntity('actor');
  const wall=new THREE.Mesh(new THREE.BoxGeometry(.4,2,4));wall.position.set(2,1.2,4);world.addEntity({id:'side-wall',object:wall,role:'obstacle',physics:{kind:'fixed',shape:'box'}});
  world.setCameraFollow({configuration:{...document('actor'),input:{cycleViewIds:[]},views:{third:{kind:'third-person',overrides:{position:{anchor:{kind:'origin'},anchorOffset:{space:'world',offsetMetersXYZ:[0,1,0]},distanceMeters:8,subjectTranslationHalfLifeSeconds:1},orientation:{initialPitchRadians:0,recenter:{enabled:false}},constraints:{visibility:'require-line-of-sight'}}}}}});
  world.step({});const before=world.inspectCamera();
  expect(world.getEntityState('actor').positionWorldMetersXYZ[0]).toBeCloseTo(4);
  expect(before.diagnostics).toMatchObject({status:'measured',limited:true,visibility:{status:'occluded',colliderEntityId:'side-wall'}});
  const context={epoch:0,previousTick:0,currentTick:1,alpha:1,cut:false};
  const controller=engine(world).cameraController;
  for(let i=0;i<3;i++)expect(controller.sampleProjection(context,1)?.constraintDiagnostics).toMatchObject({status:'measured',limited:true,visibility:{status:'occluded',colliderEntityId:'side-wall'}});
  expect(world.inspectCamera()).toEqual(before);
 }finally{world.dispose();}
});


it.each([false,true])('uses an actual visibility ray above ground for native=%s without expanding the target by camera radius',async(native)=>{
 const world=native?await fixture():await createWorld({navigation:false});
 try{
  if(!native){
   const ground=new THREE.Mesh(new THREE.BoxGeometry(100,1,100));ground.position.y=-.5;world.addEntity({id:'ground',object:ground,role:'terrain',physics:{kind:'fixed',shape:'box'}});
   const actor=new THREE.Group();actor.position.y=.03;world.addCharacter({id:'person',object:actor,body:{heightMeters:1.8,radiusMeters:.3}});
  }
  world.setCameraFollow({configuration:{...document(),input:{cycleViewIds:[]},views:{third:{kind:'third-person',overrides:{position:{anchor:{kind:'origin'},anchorOffset:{space:'world',offsetMetersXYZ:[0,-.03,0]},distanceMeters:8},orientation:{initialPitchRadians:.3,recenter:{enabled:false}},constraints:{visibility:'require-line-of-sight'}}}}}});
  expect(world.inspectCamera().diagnostics).toMatchObject({status:'measured',visibility:{status:'clear',probeRadiusMeters:0}});
  const subject=engine(world).cameraSubjects.sample({targetEntityId:'person'})!;
  const probe=native?(await import('./humanoid-runtime/host-access')).humanoidHost(world.humanoid!).cameraGeometry(subject).probe:(a:readonly [number,number,number],b:readonly [number,number,number],r:number)=>engine(world).physics.castCameraArm(a,b,r,'person');
  const groundOrigin=[0,0,0] as const,eye=[4,2,8] as const;
  expect(probe(eye,groundOrigin,0).distanceMeters).toBeCloseTo(Math.hypot(...eye),5);
  const wall=new THREE.Mesh(new THREE.BoxGeometry(.4,2,4));wall.position.set(2,1.2,4);world.addEntity({id:'visibility-wall',object:wall,role:'obstacle',physics:{kind:'fixed',shape:'box'}});
  expect(probe(eye,groundOrigin,0)).toMatchObject({colliderEntityId:'visibility-wall'});
  expect(probe(eye,groundOrigin,0).distanceMeters).toBeGreaterThan(3);
  expect(probe([2,1.2,4],groundOrigin,0)).toMatchObject({colliderEntityId:'visibility-wall',startedOverlapping:true});
 }finally{world.dispose();}
});

it('expires the prepared movement basis before post-tick consumers read the committed view',async()=>{
 const world=await createWorld({navigation:false});try{
  world.addCharacter({id:'person',object:new THREE.Group(),body:{heightMeters:1.8,radiusMeters:.3}});world.setControlledEntity('person');
  const base=document();const overrides={position:{armHalfLifeSeconds:0},orientation:{referenceFrame:'subject-up' as const,initialPitchRadians:0,recenter:{enabled:false}},constraints:{collision:{enabled:false}}};
  const config:CameraDocument={...base,views:{...base.views,third:{kind:'third-person',overrides}}};
  world.setCameraFollow({configuration:config});
  const afterTick:THREE.Vector3[]=[];engine(world).onAfterUpdate(()=>afterTick.push(new THREE.Vector3(...engine(world).controlForwardWorldXYZ())));
  world.step({moveXRatio:1});
  const actual=new THREE.Vector3(0,0,-1).applyQuaternion(new THREE.Quaternion(...world.inspectCamera().current!.quaternionWorldXYZW));actual.y=0;actual.normalize();
  expect(actual.distanceTo(new THREE.Vector3(1,0,0))).toBeLessThan(1e-7);
  expect(afterTick[0]!.distanceTo(actual)).toBeLessThan(1e-7);
  expect(new THREE.Vector3(...engine(world).controlForwardWorldXYZ()).distanceTo(actual)).toBeLessThan(1e-7);
  world.stop();expect(new THREE.Vector3(...engine(world).controlForwardWorldXYZ()).distanceTo(actual)).toBeLessThan(1e-7);
 }finally{world.dispose();}
});
it('keeps the camera horizontal heading when looking vertically instead of snapping movement to world north',async()=>{
 const world=await createWorld({navigation:false});try{
  world.useAuthoredCamera();
  const expected=new THREE.Vector3(-Math.sin(1.1),0,-Math.cos(1.1));
  for(const pitch of [Math.PI/2-.02,Math.PI/2-1e-8,Math.PI/2]){
   world.camera.quaternion.setFromEuler(new THREE.Euler(-pitch,1.1,0,'YXZ'));
   expect(new THREE.Vector3(...engine(world).controlForwardWorldXYZ()).distanceTo(expected)).toBeLessThan(1e-7);
  }
 }finally{world.dispose();}
});

it.each((['shoulder','first-person'] as const).flatMap(kind=>['horse-1','person'].map(targetEntityId=>({kind,targetEntityId}))))('samples vehicle seat and fallback eye from the same displayed pose for $kind / $targetEntityId',async ({kind,targetEntityId})=>{
 const world=await createMountedFixture({initialMountId:'horse-1'});try{
  const binding={targetEntityId,mountTarget:'actor' as const};
  const view=kind==='shoulder'?{kind,overrides:{position:{anchor:{kind:'seat' as const},subjectTranslationHalfLifeSeconds:0,anchorHalfLifeSeconds:0,armHalfLifeSeconds:0},constraints:{collision:{enabled:false}}}}:{kind,overrides:{constraints:{collision:{enabled:false}}}};
  world.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,defaultViewId:'view',activation:'immediate',binding,views:{view}}});
  world.step({moveZRatio:-1},60);
  const vehicle=world.humanoid!.simulation.vehicles[0]!;
  const object=world.humanoid!.options.vehicles[0]!.object;
  const fixed=engine(world).cameraSubjects.sample(binding)!;
  const before=world.inspectCamera();
  for(const alpha of [0,.5,1])engine(world).withPresentation(()=>{
   const rotation=object.getWorldQuaternion(new THREE.Quaternion());
   const expectedSeat=new THREE.Vector3(...vehicle.spec.seat).applyQuaternion(rotation).add(object.getWorldPosition(new THREE.Vector3()));
   const expectedEye=expectedSeat.clone().add(new THREE.Vector3(0,vehicle.spec.characterPose==='stand'?1.55:.72,.08).applyQuaternion(rotation));
   const display=engine(world).cameraSubjects.sample(binding,true)!;
   expect(new THREE.Vector3(...display.seatWorldMetersXYZ!).distanceTo(expectedSeat)).toBeLessThan(1e-7);
   expect(new THREE.Vector3(...display.eyeWorldMetersXYZ!).distanceTo(expectedEye)).toBeLessThan(1e-7);
  },alpha);
  expect(engine(world).cameraSubjects.sample(binding)).toEqual(fixed);expect(world.inspectCamera()).toEqual(before);
 }finally{world.dispose();}
});

it('fades only followed geometry for a close world view and restores shared materials after each draw',async()=>{
 const world=await createWorld({navigation:false});
 const material=new THREE.MeshBasicMaterial({color:0x6699aa}), geometry=new THREE.BoxGeometry(.6,1.8,.4);
 material.onBeforeCompile=()=>{};material.customProgramCacheKey=()=>"test-subject-color";
 const person=new THREE.Mesh(geometry,material),other=new THREE.Mesh(geometry,material);other.position.x=4;
 try{
  world.addCharacter({id:'person',object:person,body:{heightMeters:1.8,radiusMeters:.3}});world.addEntity({id:'other',object:other,role:'decoration'});world.setControlledEntity('person');
  world.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,activation:'immediate',defaultViewId:'third',binding:{targetEntityId:'person'},views:{third:{kind:'third-person',overrides:{subjectFade:{enabled:true},position:{distanceMeters:.7},orientation:{initialPitchRadians:0,recenter:{enabled:false}},constraints:{collision:{enabled:false}}}}}}});
  engine(world).withPresentation(()=>{
   expect(person.material).not.toBe(material);expect(person.material.opacity).toBeGreaterThan(0);expect(person.material.opacity).toBeLessThan(1);
   expect(person.material.onBeforeCompile).toBe(material.onBeforeCompile);expect(person.material.customProgramCacheKey).toBe(material.customProgramCacheKey);
   expect(other.material).toBe(material);expect(material.opacity).toBe(1);
  });
  expect(person.material).toBe(material);expect(person.visible).toBe(true);
  engine(world).withPresentation(()=>expect(person.material).toBe(material),1,'object');
  expect(()=>engine(world).withPresentation(()=>{throw new Error('draw failure');})).toThrow('draw failure');
  expect(person.material).toBe(material);expect(material.transparent).toBe(false);expect(person.visible).toBe(true);
 }finally{world.dispose();geometry.dispose();material.dispose();}
});


it('rejects unsafe speed FOV atomically and runs the admitted envelope at full speed',async()=>{
 const world=await fixture();try{
  world.setCameraFollow({configuration:document()}); const before=world.inspectCamera();
  const config={...document(),views:{...document().views,third:{kind:'third-person',overrides:{lens:{verticalFovDegrees:170},
   effects:{speedFov:{enabled:true,maximumOffsetDegrees:20,fullEffectSpeedMetersPerSecond:.1,halfLifeSeconds:0}}}}}} satisfies CameraDocument;
  expect(()=>world.setCameraFollow({configuration:config})).toThrow(/effective base FOV/);
  expect(world.inspectCamera()).toEqual(before);
  config.views.third.overrides!.effects!.speedFov!.maximumOffsetDegrees=9;
  world.setCameraFollow({configuration:config}); world.step({moveZRatio:-1},30);
  expect(world.inspectCamera().current!.lens.verticalFovDegrees).toBeCloseTo(179);
  expect(world.snapshot().errors).toEqual([]);
  const tick=world.simulationTick;world.step({},2);expect(world.simulationTick).toBe(tick+2);
 }finally{world.dispose();}
});
it('checks the effective adopted opening before installing speed FOV',async()=>{
 const world=await fixture();try{
  const camera=world.camera as THREE.PerspectiveCamera;camera.fov=170;camera.updateProjectionMatrix();
  const config={...document(),input:{cycleViewIds:[]},views:{third:{kind:'third-person',overrides:{
   framing:{kind:'preserve-opening'},effects:{speedFov:{enabled:true,maximumOffsetDegrees:20}},
  }}}} satisfies CameraDocument;
  const before=world.inspectCamera();expect(()=>world.setCameraFollow({configuration:config})).toThrow(/effective base FOV/);
  expect(world.inspectCamera()).toEqual(before);expect(camera.fov).toBe(170);
 }finally{world.dispose();}
});
it('keeps valid speed FOV after a hot edit with a smaller effect envelope',async()=>{
 const world=await fixture();try{
  const config={...document(),views:{...document().views,third:{kind:'third-person',overrides:{lens:{verticalFovDegrees:70},
   effects:{speedFov:{enabled:true as boolean,maximumOffsetDegrees:20,fullEffectSpeedMetersPerSecond:.1,halfLifeSeconds:.1}}}}}} satisfies CameraDocument;
  world.setCameraFollow({configuration:config});world.step({moveZRatio:-1},90);
  expect(world.inspectCamera().current!.lens.verticalFovDegrees).toBeGreaterThan(89);
  config.views.third.overrides!.lens!.verticalFovDegrees=170;
  config.views.third.overrides!.effects!.speedFov!.maximumOffsetDegrees=5;
  expect(()=>world.setCameraFollow({configuration:config})).not.toThrow();
  world.step({moveZRatio:-1},30);
  expect(world.inspectCamera().current!.lens.verticalFovDegrees).toBeLessThanOrEqual(175);
  expect(world.snapshot().errors).toEqual([]);
  const edit=world.beginCameraEdit();
  config.views.third.overrides!.lens!.verticalFovDegrees=179;
  config.views.third.overrides.effects.speedFov={...config.views.third.overrides.effects.speedFov,enabled:false,maximumOffsetDegrees:20};
  expect(()=>edit.applyDraft(config,world.inspectCamera().configurationRevision)).not.toThrow();
  expect(world.inspectCamera().current!.lens.verticalFovDegrees).toBe(179);
  world.step({moveZRatio:-1},2);edit.cancel();world.step({moveZRatio:-1},2);
  expect(world.inspectCamera().current!.lens.verticalFovDegrees).toBeLessThan(180);
  expect(world.snapshot().errors).toEqual([]);
 }finally{world.dispose();}
});

it('notifies render observers after restoring subject presentation without another simulation step',async()=>{
 const world=await createWorld({navigation:false});
 const geometry=new THREE.BoxGeometry(.6,1.8,.4),material=new THREE.MeshBasicMaterial(),person=new THREE.Mesh(geometry,material);
 try{
  world.addCharacter({id:'person',object:person,body:{heightMeters:1.8,radiusMeters:.3}});
  world.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,activation:'immediate',defaultViewId:'third',binding:{targetEntityId:'person'},views:{third:{kind:'third-person',overrides:{subjectFade:{enabled:true},position:{distanceMeters:.7},constraints:{collision:{enabled:false}}}}}}});
  const order:string[]=[];
  Object.defineProperty(engine(world),'renderer',{value:{render(){expect(person.material).not.toBe(material);order.push('source');},dispose(){}}});
  const publicWorld:World=world;
  publicWorld.setCameraCollisionDiagnosticsEnabled(true);
  const release=publicWorld.onRender(()=>{expect(person.material).toBe(material);expect(person.visible).toBe(true);order.push('observer');});
  const tick=world.simulationTick,revision=world.inspectCamera().cameraCommitRevision;
  engine(world).render(.5);expect(order).toEqual(['source','observer']);
  expect(world.simulationTick).toBe(tick);expect(world.inspectCamera().cameraCommitRevision).toBe(revision);
  release();engine(world).render(1);expect(order).toEqual(['source','observer','source']);
 }finally{world.dispose();geometry.dispose();material.dispose();}
});

it('consumes measured movement direction through the public World and preserves it at rest',async()=>{
 const world=await createWorld({navigation:false,assetDefinitions:{}});
 let velocity:readonly [number,number,number]=[3,0,0];
 try{
  world.registerMovement({id:'camera-motion',version:1,description:'Independent world-space test motion',initialState:null,
    update:()=>({state:null,applyGravity:false,velocityWorldMetersPerSecondXYZ:velocity})});
  const object=new THREE.Group();object.position.y=3;
  world.addCharacter({id:'actor',object,body:{heightMeters:1.8,radiusMeters:.3},movement:{kind:'custom',movementId:'camera-motion'}});
  world.setControlledEntity('actor');
  const configuration:CameraDocument={kind:'world-camera',schemaVersion:1,activation:'immediate',defaultViewId:'follow',binding:{targetEntityId:'actor'},views:{follow:{kind:'third-person',overrides:{position:{anchor:{kind:'origin'}},orientation:{recenter:{enabled:true,delaySeconds:0,minimumSpeedMetersPerSecond:.1,yawHalfLifeSeconds:0,yawTarget:{kind:'movement-direction'}}}}}}};
  world.setCameraFollow({configuration});world.step({},3);
  expect(world.inspectCamera().intent!.yawRadians).toBeCloseTo(-Math.PI/2,8);
  expect(world.inspectCamera().current!.subject!.velocityWorldMetersPerSecondXYZ).toEqual([3,0,0]);
  velocity=[0,3,0];world.step({},3);expect(world.inspectCamera().intent!.yawRadians).toBeCloseTo(-Math.PI/2,8);
  velocity=[-3,0,0];world.step({},3);expect(world.inspectCamera().intent!.yawRadians).toBeCloseTo(Math.PI/2,8);
  expect(world.snapshot().errors).toEqual([]);
 }finally{world.dispose();}
});

it('includes native partial-occlusion rays in fixed and displayed camera probe measurements',async()=>{
 const world=await createWorld({navigation:false,assetDefinitions:{},humanoid:{map:{...map,boxes:[...map.boxes,{id:'pole',position:[0,2,-2],size:[.1,4,.2]}]},character:{instanceId:'person',object:new THREE.Group()},vehicles:[]}});
 try{
  world.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,activation:'immediate',defaultViewId:'third',binding:{targetEntityId:'person'},views:{third:{kind:'third-person',overrides:{position:{anchor:{kind:'body',heightRatio:.65},distanceMeters:8,armHalfLifeSeconds:0},orientation:{initialPitchRadians:0,recenter:{enabled:false}},constraints:{visibility:'preserve-framing'}}}}}});
  const {humanoidHost}=await import('./humanoid-runtime/host-access');
  const host=humanoidHost(world.humanoid!),nativeGeometry=host.cameraGeometry.bind(host);
  const radii:number[]=[];
  const geometry=vi.spyOn(host,'cameraGeometry').mockImplementation(subject=>{
   const native=nativeGeometry(subject);
   return {...native,probe:(from,to,radius)=>{radii.push(radius);return native.probe(from,to,radius);}};
  });
  world.onDispose(()=>geometry.mockRestore());
  world.setCameraCollisionDiagnosticsEnabled(true);world.setCameraPerformanceDiagnosticsEnabled(true);
  world.step({});
  const fixed=world.inspectCamera();
  expect(radii.filter(radius=>radius===0).length).toBeGreaterThan(0);
  expect(fixed.performance!.stages.fixed!.queryCount).toBe(radii.length);
  expect(fixed.collisionQueries!.fixed!.probes).toHaveLength(radii.length);
  radii.length=0;
  const physics=world.humanoid!.environment.borrowPhysics().world;
  const rays=vi.spyOn(physics,'castRayAndGetNormal');world.onDispose(()=>rays.mockRestore());
  const capture=()=>[world.camera.position.toArray(),world.camera.quaternion.toArray()];
  const pose=engine(world).withPresentation(capture,1);
  const displayed=world.inspectCamera();
  expect(rays).toHaveBeenCalled();
  expect(radii.filter(radius=>radius===0)).toHaveLength(rays.mock.calls.length);
  expect(displayed.performance!.stages.presentation!.queryCount).toBe(radii.length);
  expect(displayed.collisionQueries!.presentation!.probes).toHaveLength(radii.length);
  expect(displayed.current).toEqual(fixed.current);
  world.setCameraPerformanceDiagnosticsEnabled(false);
  expect(engine(world).withPresentation(capture,1)).toEqual(pose);
  expect(world.inspectCamera().current).toEqual(fixed.current);
 }finally{world.dispose();}
});

it('keeps an authored world bearing through a tilted ordinary subject in the World camera',async()=>{
 const world=await createWorld({navigation:false,assetDefinitions:{}});
 try{
  const object=new THREE.Group();object.rotation.set(.6,.2,.7);
  world.addEntity({id:'subject',object,role:'decoration'});
  const configuration:CameraDocument={
   kind:'world-camera',schemaVersion:1,activation:'immediate',defaultViewId:'follow',binding:{targetEntityId:'subject'},
   views:{follow:{kind:'third-person',overrides:{
    position:{anchor:{kind:'origin'},armHalfLifeSeconds:0},
    orientation:{referenceFrame:'subject-up',initialPitchRadians:.2,recenter:{enabled:true,minimumSpeedMetersPerSecond:0,delaySeconds:0,yawHalfLifeSeconds:0,yawTarget:{kind:'world-forward',yawRadians:0}}},
    constraints:{collision:{enabled:false}},
   }}},
  };
  world.setCameraFollow({configuration});
  world.step({},2);
  const direction=()=>world.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
  expect(direction().distanceTo(new THREE.Vector3(0,0,-1))).toBeLessThan(1e-8);
  expect(engine(world).withPresentation(direction,1).distanceTo(new THREE.Vector3(0,0,-1))).toBeLessThan(1e-8);
  expect(world.snapshot().errors).toEqual([]);
 }finally{world.dispose();}
});
