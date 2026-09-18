import type {HumanoidRenderState,SourceCharacterFrame} from './humanoid/animation';
import { describe, expect, it, vi } from 'vitest';
import { Group, Vector3 } from 'three';
import { Character } from './character';
import type { Character as SourceCharacter } from './humanoid/source-character';
import { createMountedFixture } from './mounted-test-fixture';
import { emptyInput } from './simulation';
import type { WorldEngine } from '../engine';
import { PresentationState } from './presentation';

// Procedural vehicle fixtures do not consume browser creature resources.
vi.mock('@worldkit/preset-content/assets/resources',()=>({definitions:{},resolvePresetResource:()=>{throw new Error('UNEXPECTED_CREATURE_RESOURCE');}}));

// Distinguish the adopted SDK source subtree from later author-owned children.
function instrumentedCharacter() {
  const root=new Group(),bone=new Group();root.add(bone);
  const update=vi.fn((dt:number,_frame:SourceCharacterFrame)=>{bone.position.x+=dt;bone.rotation.y+=dt;});
  const source={root,bones:{pelvis:bone},actions:{},weights:{},motionSources:[],createFactory:()=>undefined,update,dispose:vi.fn()} as unknown as SourceCharacter;
  return {animation:new Character(source),bone,update,source};
}

const engineOf = (world: unknown) => (world as { engine: WorldEngine }).engine;
describe('mounted presentation', () => {
  it('renders an intermediate pose while all observations retain fixed truth, then restores roots', async () => {
    const world = await createMountedFixture();
    try {
      const runtime = world.humanoid!, engine = engineOf(world);
      expect(runtime.enter('horse-1')).toBe(true);
      world.step({}, 31); world.step({ humanoid: { ...emptyInput(), forward: 1 } }, 20);
      const previous = runtime.simulation.controlledActor.vehicle!.position.clone();
      world.step({ humanoid: { ...emptyInput(), forward: 1 } }, 1);
      const current = runtime.simulation.controlledActor.vehicle!.position.clone();
      expect(previous.distanceTo(current)).toBeGreaterThan(0);
      const root = runtime.options.vehicles[0]!.object;
      const before = world.snapshot();
      const render = vi.fn(() => {
        expect(root.position.distanceTo(previous.clone().lerp(current, .5))).toBeLessThan(1e-9);
        expect(world.getEntityState('horse-1').positionWorldMetersXYZ).toEqual(current.toArray());
        expect(engine.snapshot().entities.find(e => e.id === 'horse-1')!.positionMetersXYZ).toEqual(current.toArray());
        const seat=new Vector3(...runtime.simulation.controlledActor.vehicle!.spec.seat).applyQuaternion(root.quaternion).add(root.position);
        expect(runtime.options.character.object.position.distanceTo(seat)).toBeLessThan(1e-9);
        expect(world.getEntityState('person').positionWorldMetersXYZ).toEqual(runtime.logicalPose('person')!.position.toArray());
      });
      Object.defineProperty(engine, 'renderer', { value: { render, dispose:vi.fn() } });
      engine.render(.5); engine.render(.5);
      expect(render).toHaveBeenCalledTimes(2);
      expect(root.position).toEqual(current);
      expect(world.snapshot().simulationTick).toBe(before.simulationTick);
      expect(runtime.simulation.controlledActor.vehicle!.position).toEqual(current);
    } finally { world.dispose(); }
  });
  it('samples copied motion without changing history', async () => {
    const world = await createMountedFixture();
    try {
      const history = new PresentationState(world.humanoid!.simulation);
      const sample = history.sample(.5, 1, 0, 1);
      sample.actors.person!.position.set(100, 100, 100);
      expect(history.sample(.5, 1, 0, 1).actors.person!.position).not.toEqual(new Vector3(100, 100, 100));
    } finally { world.dispose(); }
  });
  it('evaluates generic visuals once per changed sample, restores roots after a visual failure', async () => {
    const world = await createMountedFixture();
    try {
      const runtime = world.humanoid!, engine = engineOf(world), callback = vi.fn();
      runtime.onVisualUpdate(callback);
      world.step({}, 2);
      expect(callback).not.toHaveBeenCalled();
      engine.render(); engine.render();
      expect(callback).toHaveBeenCalledTimes(1);
      const off = runtime.onVisualUpdate(() => { runtime.options.character.object.position.set(99, 99, 99); throw new Error('visual failed'); });
      world.step({}, 1);
      const canonical = runtime.options.character.object.position.clone();
      expect(() => engine.render()).toThrow('visual failed');
      expect(runtime.options.character.object.position).toEqual(canonical);
      expect(world.snapshot().errors.some(error=>error.phase==='WORLD_FRAME_FAILED'&&error.message==='visual failed')).toBe(true);
      off();
    } finally { world.dispose(); }
  });
});

it('keeps one interaction edge and canonical camera/actors identical at 30, 60 and 120 Hz', async () => {
  const results = [];
  for (const hz of [30, 60, 120]) {
    const world = await createMountedFixture();
    try {
      const engine = engineOf(world), runtime = world.humanoid!, entered = vi.spyOn(runtime.simulation.controlledActor, 'interact');
      for (let frame = 0; frame < hz * 2; frame++) {
        engine.advance(1 / hz, { humanoid: { ...emptyInput(), forward: 1 }, interactPressed: frame === 0, cameraYawRatio: .2 });
        engine.render(hz === 120 && frame % 2 === 0 ? .5 : 1);
      }
      expect(entered).toHaveBeenCalledTimes(1);
      expect(runtime.simulation.controlledActor.vehicle?.spec.id).toBe('horse-1');
      results.push({ tick: world.simulationTick, horse: runtime.simulation.controlledActor.vehicle!.position.toArray(), rider: runtime.simulation.controlledActor.player.position.toArray(), yaw: world.inspectCamera().intent?.yawRadians, collision:world.inspectCamera().diagnostics });
    } finally { world.dispose(); }
  }
  expect(results[1]).toEqual(results[0]);
  expect(results[2]).toEqual(results[0]);
});

it('renders without changing canonical camera orbit, timers, or the following fixed result', async () => {
  const a = await createMountedFixture(), b = await createMountedFixture();
  try {
    for (const world of [a,b]) {world.humanoid!.enter('horse-1');world.step({},31);world.step({humanoid:{...emptyInput(),forward:1},cameraYawRatio:.3},20);}
    const state=a.inspectCamera();
    engineOf(a).render(.4);engineOf(a).render(.4);
    expect(a.inspectCamera()).toEqual(state);
    for (const world of [a,b])world.step({humanoid:{...emptyInput(),forward:1}},1);
    expect(a.humanoid!.camera.position).toEqual(b.humanoid!.camera.position);
    expect(a.inspectCamera().intent?.yawRadians).toBe(b.inspectCamera().intent?.yawRadians);
    expect(a.humanoid!.simulation.controlledActor.vehicle!.position).toEqual(b.humanoid!.simulation.controlledActor.vehicle!.position);
  } finally {a.dispose();b.dispose();}
});

it('preserves authored opening camera through repeated display and fixed steps', async () => {
  const world=await createMountedFixture();
  try {
    const runtime=world.humanoid!;
    runtime.useAuthoredCamera();runtime.camera.position.set(8,12,17);runtime.camera.rotation.set(.2,.4,.1);runtime.camera.fov=71;
    const initial=runtime.camera.clone();
    engineOf(world).render(.2);world.step({},3);engineOf(world).render();engineOf(world).render();
    expect(runtime.camera.position).toEqual(initial.position);expect(runtime.camera.quaternion.toArray()).toEqual(initial.quaternion.toArray());expect(runtime.camera.fov).toBe(71);
  } finally {world.dispose();}
});

it('keeps the fixed character local pose and animation clock across display interpolation', async () => {
  const {animation,bone,update}=instrumentedCharacter(),world=await createMountedFixture({animation});update.mockClear();
  try {
    world.step({},2);const current=bone.position.x;
    engineOf(world).withPresentation(()=>expect(bone.position.x).toBeCloseTo(current-1/120),.5);
    expect(bone.position.x).toBe(current);expect(update).toHaveBeenCalledTimes(2);
    engineOf(world).render(.5);expect(update).toHaveBeenCalledTimes(2);
    world.step({},1);expect(bone.position.x).toBeCloseTo(current+1/60);
  }finally{world.dispose();}
});

it('handles catch-up, pause/resume and history cuts without advancing repeated visuals', async () => {
  const world=await createMountedFixture();
  try {
    const engine=engineOf(world),runtime=world.humanoid!,deltas:number[]=[];
    runtime.onVisualUpdate(dt=>deltas.push(dt));
    engine.advance(.25,{interactPressed:true,humanoid:{...emptyInput(),forward:1}});
    expect(world.simulationTick).toBe(15);expect(runtime.simulation.controlledActor.transition).toBeGreaterThan(0);
    engine.render();const before=runtime.snapshot();engine.stop();engine.render();engine.render();
    expect(runtime.snapshot()).toEqual(before);expect(deltas).toEqual([0]);
    engine.start();engine.advance(.25,{humanoid:{...emptyInput(),forward:1}});engine.stop();engine.render();
    expect(world.simulationTick).toBe(30);expect(deltas.at(-1)).toBeCloseTo(.25);
    for(const phase of ['enter','exit'] as const){
      await world.reset();expect(runtime.enter('horse-1')).toBe(true);
      if(phase==='exit'){world.step({},31);expect(runtime.exit()).toBe(true);}
      expect(runtime.simulation.controlledActor.transitionKind).toBe(phase);
      await world.reset();engine.render(.2);
      expect(runtime.simulation.controlledActor.vehicle).toBeUndefined();expect(runtime.simulation.controlledActor.transition).toBe(0);expect(deltas.at(-1)).toBe(0);
    }
  }finally{world.dispose();}
});

it('preserves the supplied opening transform when authored mode is selected after runtime creation',async()=>{
 const {createWorld}=await import('../world');
 const {PerspectiveCamera}=await import('three');
 const fixture=await createMountedFixture();
 const camera=new PerspectiveCamera(64);camera.position.set(7,9,11);camera.rotation.set(.2,.5,.1);
 const before=camera.clone();
 const world=await createWorld({camera,assetDefinitions:{},navigation:false,humanoid:fixture.humanoid!.options}),runtime=world.humanoid!;
 try {
  runtime.useAuthoredCamera();
  expect(camera.position).toEqual(before.position);expect(camera.quaternion.toArray()).toEqual(before.quaternion.toArray());expect(camera.fov).toBe(64);
 }finally{world.dispose();fixture.dispose();}
});

it('opens exact current capture samples and restores after synchronous callback failures',async()=>{
 const world=await createMountedFixture();
 try {
  const engine=engineOf(world),runtime=world.humanoid!;
  runtime.enter('horse-1');world.step({},31);world.step({humanoid:{...emptyInput(),forward:1}},20);
  engine.render(.5);
  const canonical=runtime.simulation.controlledActor.vehicle!.position.clone();
  engine.withPresentation(()=>{expect(runtime.options.vehicles[0]!.object.position).toEqual(canonical);});
  expect(()=>engine.withPresentation(()=>{runtime.options.vehicles[0]!.object.position.set(100,100,100);throw new Error('capture failure');})).toThrow('capture failure');
  expect(runtime.options.vehicles[0]!.object.position).toEqual(canonical);
 }finally{world.dispose();}
});

it('keeps character and camera at the common cut sample after exact capture then same-tick rewind',async()=>{
 const {animation,bone,update}=instrumentedCharacter(),world=await createMountedFixture({animation});update.mockClear();
 try {
  const runtime=world.humanoid!,engine=engineOf(world);
  runtime.enter('horse-1');world.step({},31);world.step({humanoid:{...emptyInput(),forward:1}},20);
  engine.render(1);
  const canonical={horse:runtime.options.vehicles[0]!.object.position.clone(),bone:bone.position.x,camera:runtime.camera.position.clone()};
  const frames:number[]=[];
  for(const alpha of [.25,.5])engine.withPresentation(()=>{
   frames.push(bone.position.x);
   expect(runtime.options.vehicles[0]!.object.position).toEqual(canonical.horse);
   expect(bone.position.x).toBe(canonical.bone);
   expect(runtime.camera.position).toEqual(canonical.camera);
  },alpha);
  expect(frames).toEqual([canonical.bone,canonical.bone]);expect(update).toHaveBeenCalledTimes(52);
  world.step({humanoid:{...emptyInput(),forward:1}},1);
  engine.withPresentation(()=>expect(bone.position.x).toBeCloseTo(canonical.bone+1/120),.5);
  expect(update).toHaveBeenCalledTimes(53);
 }finally{world.dispose();}
});

it('retains a permitted author child local transform on a repeated Character sample',async()=>{
 const {animation}=instrumentedCharacter(),world=await createMountedFixture({animation});
 try {
  const runtime=world.humanoid!,engine=engineOf(world),authorChild=new Group();
  animation.actor.add(authorChild);
  world.step({},2);
  let evaluated=false;
  const visual=vi.fn((dt:number)=>{
   authorChild.position.x=evaluated?authorChild.position.x+dt:7;
   authorChild.rotation.y=.4;evaluated=true;
  });runtime.onVisualUpdate(visual);
  const captured:number[][]=[];
  for(let frame=0;frame<2;frame++)engine.withPresentation(()=>captured.push([authorChild.position.x,authorChild.rotation.y]));
  expect(captured).toEqual([[7,.4],[7,.4]]);expect(visual).toHaveBeenCalledTimes(1);
  world.step({},1);engine.render();
  expect(authorChild.position.x).toBeCloseTo(7+1/60);expect(visual).toHaveBeenCalledTimes(2);
 }finally{world.dispose();}
});

it('starts fresh owned pose history when a source is asynchronously adopted',async()=>{
 const {Character:Source}=await import('./humanoid/source-character');
 const {source,bone}=instrumentedCharacter(),animation=new Character();
 const authorChild=new Group();animation.actor.add(authorChild);
 animation.actor.position.x=3;animation.capturePresentationPose();
 const load=vi.spyOn(Source,'load').mockResolvedValue(source);
 try {
  await animation.load();
  animation.update(1/60,{
   position:new Vector3(),facing:new Vector3(0,0,1),motionSerial:0,traversal:null,completedMotion:null,
   speed:0,vertical:0,grounded:true,animationGrounded:true,stance:'stand',swimming:false,swimStyle:'freestyle',
   animationEvent:null,surface:null,skills:null,
  });animation.capturePresentationPose();
  const canonicalBone=bone.position.x;
  authorChild.position.x=7;
  animation.applyPresentationPose(.5);
  expect(animation.actor.position.x).toBe(0);
  expect(bone.position.x).toBe(canonicalBone);
  expect(authorChild.position.x).toBe(7);
  animation.applyPresentationPose(1);expect(authorChild.position.x).toBe(7);
 }finally{load.mockRestore();animation.dispose();}
});

it('passes wearable run-up speed to locomotion and suppresses it after leaving the ground',()=>{
 const {animation,update,source}=instrumentedCharacter();
 source.smoothing=true;
 const smoothingDuringUpdate:boolean[]=[];update.mockImplementation(()=>{smoothingDuringUpdate.push(source.smoothing);});
 const pose:HumanoidRenderState={position:new Vector3(),facing:new Vector3(0,0,1),motionSerial:0,traversal:null,completedMotion:null,speed:6,vertical:0,grounded:true,animationGrounded:true,stance:'stand',swimming:false,swimStyle:'breaststroke',animationEvent:null,surface:null,skills:null,mounted:'wingsuit-ready'};
 for(const speed of [0,2,6]){
  animation.update(1/60,{...pose,speed});
  expect(update.mock.calls.at(-1)![1]!.speed).toBe(speed);
  expect(update.mock.calls.at(-1)![1]!.skills).toBeNull();
  expect(smoothingDuringUpdate.at(-1)).toBe(true);
 }
 animation.update(1/60,{...pose,speed:0});expect(update.mock.calls.at(-1)![1]!.speed).toBe(0);
 animation.update(1/60,{...pose,mounted:'wingsuit'});expect(update.mock.calls.at(-1)![1]!.speed).toBe(0);
 animation.update(1/60,{...pose,mounted:'drive'});expect(update.mock.calls.at(-1)![1]!.speed).toBe(0);
 expect(smoothingDuringUpdate.at(-1)).toBe(false);
 animation.update(1/60,pose);expect(update.mock.calls.at(-1)![1]!.speed).toBe(6);
 expect(update.mock.calls.at(-1)![1]!.skills).toBeNull();
 expect(smoothingDuringUpdate.at(-1)).toBe(true);
 expect(source.smoothing).toBe(true);
});


it('fits the kart seat anchor without straightening the driver knees or piercing the floor',async()=>{
 const {readFile}=await import('node:fs/promises'),{fileURLToPath}=await import('node:url');
 const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 const {parseFixtureGlb}=await import('./textured-glb-fixture');
 const {SkinnedMesh,PerspectiveCamera,Mesh,Raycaster}=await import('three');
 const {createWorld}=await import('../world');
 const {SPECS}=await import('@worldkit/preset-content/config');
 const {getMap}=await import('@worldkit/preset-content/environment/maps');
 const loader=vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async url=>parseFixtureGlb(await readFile(fileURLToPath(url))));
 const transport=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>new Response(await readFile(fileURLToPath(String(input)))));
 const rider=new Character();let world:Awaited<ReturnType<typeof createWorld>>|undefined;
 try{
  await rider.load(p=>new URL(`../../../../assets/three-creator/presets/${p}`,import.meta.url).href);
  const spec=structuredClone(SPECS.find(s=>s.id==='kart')!);
  const {buildVehicle}=await import('@worldkit/preset-content/models');
  vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>({beginPath(){},roundRect(){},fill(){},fillText(){}})})});
  let vehicle:Group;
  try{vehicle=buildVehicle(spec).root;}finally{vi.unstubAllGlobals();}
  const cushion=vehicle.getObjectByName('seat-cushion') as InstanceType<typeof Mesh>;
  const seatSurface=new Mesh(cushion.geometry,cushion.material);seatSurface.position.copy(cushion.position);seatSurface.updateMatrixWorld(true);
  const seatRay=new Raycaster(),seatGaps=[Infinity,Infinity];
  world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map:getMap('campus'),character:{instanceId:'person',object:rider.root,animation:rider},vehicles:[{instanceId:spec.id,assetId:spec.id,spec,object:vehicle}]}});
  world.humanoid!.simulation.controlledActor.commitMountedStart(0);
  const point=new Vector3(),engine=engineOf(world);
  const check=()=>{
   let lowest=Infinity,footrestClearance=Infinity,vertices=0,seatClearance=Infinity;
   seatGaps.fill(Infinity);
   rider.root.updateWorldMatrix(true,true);vehicle.updateWorldMatrix(true,false);
   rider.root.traverse(node=>{if(node instanceof SkinnedMesh){node.skeleton.update();for(let i=0;i<node.geometry.getAttribute('position').count;i++){
    node.getVertexPosition(i,point).applyMatrix4(node.matrixWorld);vehicle.worldToLocal(point);
    lowest=Math.min(lowest,point.y);vertices++;
    seatRay.set(new Vector3(point.x,2,point.z),new Vector3(0,-1,0));
    const contact=seatRay.intersectObject(seatSurface,false)[0];
    if(contact){
     const gap=point.y-contact.point.y;seatClearance=Math.min(seatClearance,gap);
     if(Math.abs(point.x)>.05&&point.z>-.27&&point.z<-.07){const side=point.x<0?0:1;seatGaps[side]=Math.min(seatGaps[side]!,gap);}
    }
    if(Math.abs(point.x)<.33&&point.z>.40&&point.z<1.09){
     footrestClearance=Math.min(footrestClearance,point.y-(.30+.075/Math.cos(.14)-(point.z-.75)*Math.tan(.14)));
    }
   }}});
   expect(vertices).toBeGreaterThan(100);expect(lowest).toBeGreaterThan(.21);
   expect(seatClearance).toBeGreaterThan(-.003);
   for(const gap of seatGaps)expect(gap).toBeLessThan(.01);
   // Bent legs can stay behind the raised footrest; any overlap must clear it.
   expect(footrestClearance).toBeGreaterThan(.005);
   expect(vehicle.worldToLocal(rider.hip!.getWorldPosition(point)).distanceTo(new Vector3(...spec.seat))).toBeLessThan(1e-6);
   for(const side of ['l','r']){
    const thigh=rider.actor.getObjectByName(`thigh_${side}`)!.getWorldPosition(new Vector3());
    const knee=rider.actor.getObjectByName(`calf_${side}`)!.getWorldPosition(new Vector3());
    const ankle=rider.actor.getObjectByName(`foot_${side}`)!.getWorldPosition(new Vector3());
    expect(knee.clone().sub(thigh).normalize().dot(ankle.sub(knee).normalize())).toBeLessThan(.35);
   }
  };
  for(const frames of [1,30,60]){
   world.step({humanoid:{...emptyInput(),forward:1,steer:.4}},frames);
   for(const alpha of [0,.5,1])engine.withPresentation(check,alpha,'object');
  }
 }finally{world?.dispose();if(!world)rider.dispose();loader.mockRestore();transport.mockRestore();}
});

it('places wearable ground shoes at the support in fixed and interpolated presentation',async()=>{
 const {readFile}=await import('node:fs/promises'),{fileURLToPath}=await import('node:url');
 const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 const {parseFixtureGlb}=await import('./textured-glb-fixture');
 const {SkinnedMesh,PerspectiveCamera}=await import('three');
 const {createWorld}=await import('../world');
 const {SPECS}=await import('@worldkit/preset-content/config');
 const {getMap}=await import('@worldkit/preset-content/environment/maps');
 const loader=vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async url=>parseFixtureGlb(await readFile(fileURLToPath(url))));
 const transport=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>new Response(await readFile(fileURLToPath(String(input)))));
 const rider=new Character();let world:Awaited<ReturnType<typeof createWorld>>|undefined;
 try{
  await rider.load(p=>new URL(`../../../../assets/three-creator/presets/${p}`,import.meta.url).href);
  const map=getMap('campus'),spec=structuredClone(SPECS.find(s=>s.id==='wingsuit')!);
  world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map,character:{instanceId:'person',object:rider.root,animation:rider},vehicles:[{instanceId:spec.id,assetId:spec.id,spec,object:new Group()}]}});
  const runtime=world.humanoid!,actor=runtime.simulation.controlledActor,v=runtime.simulation.vehicles[0]!;
  actor.commitMountedStart(0);world.step({},60);
  const engine=engineOf(world),point=new Vector3();
  const soleHeight=()=>{let low=Infinity;rider.root.updateWorldMatrix(true,true);rider.root.traverse(n=>{if(n instanceof SkinnedMesh){n.skeleton.update();for(let i=0;i<n.geometry.getAttribute('position').count;i++){n.getVertexPosition(i,point).applyMatrix4(n.matrixWorld);low=Math.min(low,point.y);}}});return low;};
  expect(v.grounded).toBe(true);
  const floor=runtime.environment.support(v.position,2,.1)!.height;
  expect(soleHeight()-floor).toBeGreaterThan(-.04);expect(soleHeight()-floor).toBeLessThan(.08);
  for(const frames of [30,10,10]){
   world.step({humanoid:{...emptyInput(),forward:1,boost:true}},frames);
   expect(v.grounded).toBe(true);
   for(const alpha of [0,.5,1])engine.withPresentation(()=>{
    expect(rider.root.position.distanceTo(runtime.options.vehicles[0]!.object.position)).toBeLessThan(1e-6);
    // 跑步允许真实腾空相位，但不能叠加一米座位高度。
    expect(soleHeight()-floor).toBeGreaterThan(-.08);expect(soleHeight()-floor).toBeLessThan(.4);
   },alpha);
  }
  expect(rider.sourceCharacter!.weights.run).toBeGreaterThan(.5);
  // 离地后恢复原飞行挂点；不改装备飞行物理或骨架比例。
  v.grounded=false;v.position.y+=10;
  // Ordinary jumps still use the walking attachment; only the committed flight handoff uses the seat.
  expect(runtime.logicalPose(actor.id)!.position.distanceTo(v.position)).toBeLessThan(1e-6);
  v.motion.aircraft!.wearable!.groundLocomotion=false;
  const expected=v.position.clone().add(new Vector3(...spec.seat).applyQuaternion(v.rotation));
  expect(runtime.logicalPose(actor.id)!.position.distanceTo(expected)).toBeLessThan(1e-6);
 }finally{world?.dispose();if(!world)rider.dispose();loader.mockRestore();transport.mockRestore();}
});

it('keeps the actual paraglider rider above the floor while steering through touchdown and automatic dismount',async()=>{
 const {readFile}=await import('node:fs/promises'),{fileURLToPath}=await import('node:url');
 const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 const {parseFixtureGlb}=await import('./textured-glb-fixture');
 const {SkinnedMesh,PerspectiveCamera}=await import('three');
 const {createWorld}=await import('../world');
 const {SPECS}=await import('@worldkit/preset-content/config');
 const {getMap}=await import('@worldkit/preset-content/environment/maps');
 const loader=vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async url=>parseFixtureGlb(await readFile(fileURLToPath(url))));
 const transport=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>new Response(await readFile(fileURLToPath(String(input)))));
 try{for(const steer of [-1,1]){
  const rider=new Character();let world:Awaited<ReturnType<typeof createWorld>>|undefined;
  try{
   await rider.load(p=>new URL(`../../../../assets/three-creator/presets/${p}`,import.meta.url).href);
   const spec={...SPECS.find(s=>s.id==='paraglider')!,spawn:[0,25,0] as [number,number,number],yaw:0};
   const map={...getMap('aircraft-training'),spawns:[{id:'canopy-descent',name:'Canopy descent',vehicleId:spec.id,position:spec.spawn,yaw:0,regionId:'airfield'}]};
   world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map,character:{instanceId:'person',object:rider.root,animation:rider},vehicles:[{instanceId:spec.id,assetId:spec.id,spec,object:new Group()}]}});
   const runtime=world.humanoid!,actor=runtime.simulation.controlledActor,v=runtime.simulation.vehicles[0]!;
   v.grounded=false;v.velocity.set(0,-2,8);actor.commitMountedStart(0);
   const point=new Vector3(),engine=engineOf(world);let touched=false,samples=0,minHeight=Infinity;
   for(let n=0;n<1800&&actor.vehicle;n++){
    world.step({humanoid:{...emptyInput(),steer:touched||v.position.y<6?steer:0}});
    if(v.grounded)touched=true;
    if(touched)for(const alpha of [0,.5,1])engine.withPresentation(()=>{
     let low=Infinity;rider.root.updateWorldMatrix(true,true);
     rider.root.traverse(mesh=>{if(mesh instanceof SkinnedMesh){mesh.skeleton.update();for(let i=0;i<mesh.geometry.getAttribute('position').count;i++){mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld);low=Math.min(low,point.y);}}});
     minHeight=Math.min(minHeight,low);samples++;
     expect(new Vector3(0,1,0).applyQuaternion(rider.root.quaternion).y).toBeGreaterThan(.85);
    },alpha);
   }
   expect(samples).toBeGreaterThan(60);expect(minHeight,`steer=${steer}, lowest rider vertex`).toBeGreaterThan(-.12);
   expect(actor.vehicle,actor.message).toBeUndefined();world.step({},60);
   expect(actor.controller.grounded).toBe(true);expect(actor.controller.position.y).toBeGreaterThan(-.04);
  }finally{world?.dispose();if(!world)rider.dispose();}
 }}finally{loader.mockRestore();transport.mockRestore();}
},15000);
