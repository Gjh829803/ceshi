import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { afterAll, expect, it, vi } from 'vitest';
import * as horseModule from './public';

const parsed: Awaited<ReturnType<GLTFLoader['parseAsync']>>[] = [];
function resolveFixtureResource(path: string): string {
  if (path !== 'creatures/horse.glb') throw new Error('UNEXPECTED_FIXTURE_RESOURCE');
  return new URL('../../../../assets/three-creator/training/creatures/horse.glb', import.meta.url).href;
}
const transport = vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(async url => {
  const bytes = await readFile(fileURLToPath(url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  parsed.push(gltf);
  return gltf;
});
afterAll(() => transport.mockRestore());
const createHorse = () => {
  expect(horseModule).toHaveProperty('TrainingHorse');
  return new horseModule.TrainingHorse();
};
const frame = (phase=0,gait='graze',epoch=1) => ({ epoch, phase, gait, timeSeconds:phase, speedMetersPerSecond:gait==='gallop'?12:4 });

it('loads the actual source skeleton and rejects a declared missing saddle', async () => {
  const horse = createHorse();
  try {
    await horse.load(resolveFixtureResource);
    expect(parsed.at(-1)!.animations.map(clip => clip.name)).toEqual(expect.arrayContaining(['Idle','Walk','Gallop']));
    expect(horse.content.getObjectByName('Body')).toBeDefined();
    horse.sample(frame());
    expect(() => horse.readSeatAnchor([0,1.65,0], {nodeName:'missing-saddle', maximumOffsetMeters:.2, maximumRotationRadians:.2})).toThrow('TRAINING_SEAT_ANCHOR_MISSING');
  } finally { horse.dispose(); }
});

it('seeks real clips independently of sampling order and preserves source tracks', async () => {
  const horse=createHorse(), other=createHorse();
  try {
    await horse.load(resolveFixtureResource); await other.load(resolveFixtureResource);
    const source=parsed.at(-2)!;
    const tracks=source.animations.map(c=>c.tracks.map(t=>Array.from(t.values)));
    horse.root.position.set(3,4,5); horse.root.rotation.y=Math.PI/2;
    horse.sample(frame(1.2,'gallop'));
    const anchor={nodeName:'Body',maximumOffsetMeters:.145579,maximumRotationRadians:.122951};
    const first=horse.readSeatAnchor([0,1.65,0],anchor).elements;
    horse.sample(frame(.4,'walk',2)); horse.sample(frame(1.2,'gallop'));
    expect(horse.readSeatAnchor([0,1.65,0],anchor).elements).toEqual(first);
    expect(horse.root.position.toArray()).toEqual([3,4,5]);
    expect(horse.root.scale.toArray()).toEqual([1,1,1]);
    expect(source.animations.map(c=>c.tracks.map(t=>Array.from(t.values)))).toEqual(tracks);
    expect(other.content.getObjectByName('Body')).not.toBe(horse.content.getObjectByName('Body'));
  } finally {horse.dispose();other.dispose();}
});

it('aligns actual Source101 pelvis at yaw +/-90 without moving the logical root', async () => {
  const { Character } = await import('./character');
  const fetchTransport=vi.spyOn(globalThis,'fetch').mockImplementation(async input => new Response(await readFile(fileURLToPath(String(input)))));
  const rider=new Character(), horse=createHorse();
  try {
    await rider.load(path=>new URL(`../../../../assets/three-creator/training/${path}`,import.meta.url).href);
    await horse.load(resolveFixtureResource);
    rider.update(0,'Idle',0,true,true);
    for (const yaw of [-Math.PI/2, Math.PI/2]) {
      horse.root.position.set(3,0,2);horse.root.rotation.y=yaw;
      horse.sample(frame(1.1,'gallop'));
      const local=horse.readSeatAnchor([0,1.65,0],{nodeName:'Body',maximumOffsetMeters:.145579,maximumRotationRadians:.122951});
      const desired=horse.root.matrixWorld.clone().multiply(local);
      rider.root.position.copy(new T.Vector3(0,1.65,0).applyMatrix4(horse.root.matrixWorld));rider.root.rotation.y=yaw;
      const before=rider.root.matrix.clone();rider.root.updateMatrix();before.copy(rider.root.matrix);
      expect(rider).toHaveProperty('alignMountedPelvis');
      rider.alignMountedPelvis(desired);
      expect(rider.hip!.getWorldPosition(new T.Vector3()).distanceTo(new T.Vector3().setFromMatrixPosition(desired))).toBeLessThan(1e-9);
      expect(rider.root.matrix.elements).toEqual(before.elements);
    }
    rider.update(0,'Idle',0,false,false);
    expect(rider.actor.quaternion.toArray()).toEqual([0,0,0,1]);
  } finally {rider.dispose();horse.dispose();fetchTransport.mockRestore();}
}, 30000);

it('runtime validates and owns the horse, sampling before callbacks and restoring fixed bones', async () => {
  const { TrainingRuntime }=await import('./runtime');
  const { trainingHost }=await import('./host-access');
  const { createMountedFixture }=await import('./mounted-test-fixture');
  const fixture=await createMountedFixture();
  const options=fixture.training!.options;
  fixture.dispose();
  const horse=createHorse();
  const vehicle={...options.vehicles[0]!,object:horse.root,visual:horse};
  await expect(TrainingRuntime.create({...options,vehicles:[vehicle]},new T.PerspectiveCamera())).rejects.toThrow('TRAINING_HORSE_INSTANCE_INVALID');
  await horse.load(resolveFixtureResource);
  horse.root.scale.setScalar(2);
  await expect(TrainingRuntime.create({...options,vehicles:[vehicle]},new T.PerspectiveCamera())).rejects.toThrow('TRAINING_HORSE_INSTANCE_INVALID');
  horse.root.scale.setScalar(1);
  const duplicateResult = await TrainingRuntime.create({...options,vehicles:[vehicle,{...vehicle,instanceId:'horse-copy'}]},new T.PerspectiveCamera()).then(()=>'accepted',error=>String(error));
  expect(duplicateResult).toContain('TRAINING_HORSE_INSTANCE_INVALID');
  const runtime=await TrainingRuntime.create({...options,vehicles:[vehicle]},new T.PerspectiveCamera());
  try {
    const sample=vi.spyOn(horse,'sample');
    runtime.onVisualUpdate(()=>expect(sample).toHaveBeenCalled());
    const body=horse.content.getObjectByName('Body')!;
    const before=body.matrixWorld.elements.slice();
    const restore=trainingHost(runtime).present(.5,0);
    restore();
    expect(body.matrixWorld.elements).toEqual(before);
  } finally {runtime.dispose();}
  expect(horse.loaded).toBe(false);
});

it('calibrates all real horse clips with actual Source101 rider geometry at 64 intervals', async () => {
  const { Character }=await import('./character');
  const fetchTransport=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>new Response(await readFile(fileURLToPath(String(input)))));
  const rider=new Character(),horse=createHorse();
  const measure=(object:T.Object3D)=>{
    object.updateMatrixWorld(true);
    object.traverse(node=>{if(node instanceof T.SkinnedMesh)node.computeBoundingBox();});
    return new T.Box3().setFromObject(object);
  };
  try {
    await rider.load(path=>new URL(`../../../../assets/three-creator/training/${path}`,import.meta.url).href);
    await horse.load(resolveFixtureResource);
    const limits={nodeName:'Body',maximumOffsetMeters:.145579,maximumRotationRadians:.122951};
    const report=[];
    for (const [gait,clip,speed] of [['graze','Idle',0],['walk','Walk',4],['gallop','Gallop',12],['walk','Walk',.56],['gallop','Gallop',8.25],['gallop','Gallop',8.5],['gallop','Gallop',8.75]] as const) {
      const duration=parsed.at(-1)!.animations.find(c=>c.name===clip)!.duration;
      const occupied=new T.Box3();let offset=0,angle=0,pelvisError=0;
      for(let i=0;i<=64;i++) {
        horse.sample({...frame(2*Math.PI*i/64,gait),timeSeconds:duration*i/64,speedMetersPerSecond:speed});
        const animated=horse.readSeatAnchor([0,1.65,0],limits);
        offset=Math.max(offset,new T.Vector3().setFromMatrixPosition(animated).distanceTo(new T.Vector3(0,1.65,0)));
        angle=Math.max(angle,new T.Quaternion().setFromRotationMatrix(animated).angleTo(new T.Quaternion()));
        for (const declaration of [undefined,limits]) {
          const anchor=horse.readSeatAnchor([0,1.65,0],declaration);
          rider.root.position.set(0,1.65,0);
          rider.update(0,'Idle',0,true,true);
          rider.alignMountedPelvis(anchor);
          pelvisError=Math.max(pelvisError,rider.hip!.getWorldPosition(new T.Vector3()).distanceTo(new T.Vector3().setFromMatrixPosition(anchor)));
          expect(rider.root.position.toArray()).toEqual([0,1.65,0]);
          const riderBounds=measure(rider.root),horseBounds=measure(horse.root);
          occupied.union(riderBounds);occupied.union(horseBounds);
        }
      }
      expect(pelvisError).toBeLessThan(1e-9);
      expect(occupied.min.x).toBeGreaterThanOrEqual(-.8);
      expect(occupied.max.x).toBeLessThanOrEqual(.8);
      expect(occupied.min.z).toBeGreaterThanOrEqual(-1.9);
      expect(occupied.max.z).toBeLessThanOrEqual(1.9);
      expect(occupied.min.y).toBeGreaterThanOrEqual(0);
      expect(occupied.max.y).toBeLessThanOrEqual(3.3);
      report.push({clip,speedMetersPerSecond:speed,maximumSeatOffsetMeters:offset,maximumSeatRotationRadians:angle,maximumPelvisErrorMeters:pelvisError,bounds:{min:occupied.min.toArray(),max:occupied.max.toArray()}});
    }
    console.log('HORSE_CALIBRATION',JSON.stringify({intervals:64,scale:horse.content.scale.x,limits,clips:report}));
  } finally {rider.dispose();horse.dispose();fetchTransport.mockRestore();}
},30000);

it('rejects load/dispose races and invalid anchor transforms without reusing old data', async () => {
  const horse=createHorse();
  const load=horse.load(resolveFixtureResource);horse.dispose();
  await expect(load).rejects.toThrow('TRAINING_HORSE_DISPOSED');
  await expect(horse.load(resolveFixtureResource)).rejects.toThrow('TRAINING_HORSE_DISPOSED');
  const live=createHorse();
  try {
    await live.load(resolveFixtureResource);live.sample(frame(1,'gallop'));
    expect(()=>live.readSeatAnchor([0,1.65,0],{nodeName:'Body',maximumOffsetMeters:0,maximumRotationRadians:0})).toThrow('TRAINING_SEAT_ANCHOR_OUT_OF_BOUNDS');
    live.content.getObjectByName('Body')!.scale.x=-1;
    expect(()=>live.readSeatAnchor([0,1.65,0],{nodeName:'Body',maximumOffsetMeters:1,maximumRotationRadians:1})).toThrow('TRAINING_HORSE_TRANSFORM_INVALID');
  } finally {live.dispose();}
});

it('uses the real horse sample and Source101 pelvis in a mounted display transaction',async()=>{
  const { Character }=await import('./character');
  const { TrainingRuntime }=await import('./runtime');
  const { trainingHost }=await import('./host-access');
  const { createMountedFixture }=await import('./mounted-test-fixture');
  const fetchTransport=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>new Response(await readFile(fileURLToPath(String(input)))));
  const rider=new Character(),horse=createHorse();
  const fixture=await createMountedFixture();const options=fixture.training!.options;fixture.dispose();
  let runtime:import('./runtime').TrainingRuntime|undefined;
  try {
    await rider.load(path=>new URL(`../../../../assets/three-creator/training/${path}`,import.meta.url).href);
    await horse.load(resolveFixtureResource);
    const seatAnchor={nodeName:'Body',maximumOffsetMeters:.145579,maximumRotationRadians:.122951};
    runtime=await TrainingRuntime.create({...options,character:{instanceId:'person',object:rider.root,animation:rider},vehicles:[{...options.vehicles[0]!,object:horse.root,visual:horse,seatAnchor}]},new T.PerspectiveCamera());
    for(const yaw of [-Math.PI/2,Math.PI/2]) {
      runtime.prepareEpisodeStart({positionWorldMetersXYZ:[0,.025,0],facingYawRadians:yaw-Math.PI,training:{vehicleInstanceId:'horse-1',mounted:true}});
      for(let i=0;i<3;i++)runtime.advance({moveZRatio:-1},1/60);
      const logical=runtime.simulation.player.position.clone();
      horse.root.updateMatrixWorld(true);const canonicalBody=horse.content.getObjectByName('Body')!.matrixWorld.elements.slice();
      for(let n=0;n<2;n++) {
        const restore=trainingHost(runtime).present(.5,3);
        const anchor=horse.root.matrixWorld.clone().multiply(horse.readSeatAnchor([0,1.65,0],seatAnchor));
        expect(rider.hip!.getWorldPosition(new T.Vector3()).distanceTo(new T.Vector3().setFromMatrixPosition(anchor))).toBeLessThan(1e-9);
        expect(runtime.simulation.player.position).toEqual(logical);
        restore();horse.root.updateMatrixWorld(true);
        expect(horse.content.getObjectByName('Body')!.matrixWorld.elements).toEqual(canonicalBody);
      }
    }
  }finally{runtime?.dispose();rider.dispose();horse.dispose();fetchTransport.mockRestore();}
},30000);

it('rejects mirrored local transforms even when their determinant is positive',async()=>{
  const horse=createHorse();
  try {
    await horse.load(resolveFixtureResource);
    horse.content.scale.set(-1,-1,1);
    expect(()=>horse.sample(frame())).toThrow('TRAINING_HORSE_TRANSFORM_INVALID');
  }finally{horse.dispose();}
});

it('blends Walk to Gallop from fixed speed with no sample history',async()=>{
  const horse=createHorse();
  const locals=()=>{const values:number[]=[];horse.content.traverse(n=>values.push(...n.position.toArray(),...n.quaternion.toArray()));return values;};
  try{
    await horse.load(resolveFixtureResource);
    horse.sample({...frame(1,'walk'),speedMetersPerSecond:8});const walk=locals();
    horse.sample({...frame(1,'gallop'),speedMetersPerSecond:8});expect(locals()).toEqual(walk);
    horse.sample({...frame(1,'gallop'),speedMetersPerSecond:9});const gallop=locals();
    horse.sample({...frame(1,'gallop'),speedMetersPerSecond:8.5});const blend=locals();
    expect(blend).not.toEqual(walk);expect(blend).not.toEqual(gallop);
    horse.sample(frame(4,'graze',4));horse.sample({...frame(1,'gallop'),speedMetersPerSecond:8.5});expect(locals()).toEqual(blend);
  }finally{horse.dispose();}
});

it('checks off-grid and source-key anchors beyond the 64-point geometry census',async()=>{
  const horse=createHorse();
  try {
    await horse.load(resolveFixtureResource);
    const gltf=parsed.at(-1)!;
    const results=[];
    let rejectedOldLimit=false;
    for(const [gait,name,speed] of [['graze','Idle',0],['walk','Walk',4],['gallop','Gallop',12],['gallop','Gallop',8.25],['gallop','Gallop',8.5],['gallop','Gallop',8.75]] as const){
      const clip=gltf.animations.find(c=>c.name===name)!;
      const phases=new Set(Array.from({length:8193},(_,i)=>i/8192));
      for(const track of clip.tracks)for(const time of track.times)phases.add(time/clip.duration);
      let offset=0,angle=0;
      for(const phase of phases){
        horse.sample({...frame(phase*2*Math.PI,gait),timeSeconds:phase*clip.duration,speedMetersPerSecond:speed});
        const anchor=horse.readSeatAnchor([0,1.65,0],{nodeName:'Body',maximumOffsetMeters:.145579,maximumRotationRadians:.122951});
        offset=Math.max(offset,new T.Vector3().setFromMatrixPosition(anchor).distanceTo(new T.Vector3(0,1.65,0)));
        const q=new T.Quaternion(),p=new T.Vector3(),s=new T.Vector3();anchor.decompose(p,q,s);
        angle=Math.max(angle,q.angleTo(new T.Quaternion()));
        if(!rejectedOldLimit && (offset>.144996 || angle>.121723)){
          expect(()=>horse.readSeatAnchor([0,1.65,0],{nodeName:'Body',maximumOffsetMeters:.144996,maximumRotationRadians:.121723})).toThrow('TRAINING_SEAT_ANCHOR_OUT_OF_BOUNDS');
          rejectedOldLimit=true;
        }
      }
      results.push({name,speed,samples:phases.size,maximumOffsetMeters:offset,maximumRotationRadians:angle});
      expect(offset).toBeLessThanOrEqual(.145579);expect(angle).toBeLessThanOrEqual(.122951);
    }
    expect(rejectedOldLimit).toBe(true);
    console.log('HORSE_DENSE_CALIBRATION',JSON.stringify({scale:horse.content.scale.x,results}));
  }finally{horse.dispose();}
},60000);
