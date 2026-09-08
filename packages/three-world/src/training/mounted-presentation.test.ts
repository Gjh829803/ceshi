import { describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { createMountedFixture } from './mounted-test-fixture';
import { emptyInput } from './simulation';
import type { WorldEngine } from '../engine';
import { PresentationState } from './presentation';

const engineOf = (world: unknown) => (world as { engine: WorldEngine }).engine;
describe('mounted presentation', () => {
  it('renders an intermediate pose while all observations retain fixed truth, then restores roots', async () => {
    const world = await createMountedFixture();
    try {
      const runtime = world.training!, engine = engineOf(world);
      expect(runtime.enter('horse-1')).toBe(true);
      world.step({}, 31); world.step({ training: { ...emptyInput(), forward: 1 } }, 20);
      const previous = runtime.simulation.vehicle!.position.clone();
      world.step({ training: { ...emptyInput(), forward: 1 } }, 1);
      const current = runtime.simulation.vehicle!.position.clone();
      expect(previous.distanceTo(current)).toBeGreaterThan(0);
      const root = runtime.options.vehicles[0]!.object;
      const before = world.snapshot();
      const render = vi.fn(() => {
        expect(root.position.distanceTo(previous.clone().lerp(current, .5))).toBeLessThan(1e-9);
        expect(world.getEntityState('horse-1').positionWorldMetersXYZ).toEqual(current.toArray());
        expect(engine.snapshot().entities.find(e => e.id === 'horse-1')!.positionMetersXYZ).toEqual(current.toArray());
        const seat=new Vector3(...runtime.simulation.vehicle!.spec.seat).applyQuaternion(root.quaternion).add(root.position);
        expect(runtime.options.character.object.position.distanceTo(seat)).toBeLessThan(1e-9);
        expect(world.getEntityState('person').positionWorldMetersXYZ).toEqual(runtime.logicalPose('person')!.position.toArray());
      });
      Object.defineProperty(engine, 'renderer', { value: { render, dispose:vi.fn() } });
      engine.render(.5); engine.render(.5);
      expect(render).toHaveBeenCalledTimes(2);
      expect(root.position).toEqual(current);
      expect(world.snapshot().simulationTick).toBe(before.simulationTick);
      expect(runtime.simulation.vehicle!.position).toEqual(current);
    } finally { world.dispose(); }
  });
  it('samples copied motion without changing history', async () => {
    const world = await createMountedFixture();
    try {
      const history = new PresentationState(world.training!.simulation);
      const sample = history.sample(.5, 1, 0, 1);
      sample.player.position.set(100, 100, 100);
      expect(history.sample(.5, 1, 0, 1).player.position).not.toEqual(new Vector3(100, 100, 100));
    } finally { world.dispose(); }
  });
  it('evaluates generic visuals once per changed sample, restores roots after a visual failure', async () => {
    const world = await createMountedFixture();
    try {
      const runtime = world.training!, engine = engineOf(world), callback = vi.fn();
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
      const engine = engineOf(world), runtime = world.training!, entered = vi.spyOn(runtime.simulation, 'interact');
      for (let frame = 0; frame < hz * 2; frame++) {
        engine.advance(1 / hz, { training: { ...emptyInput(), forward: 1 }, interactPressed: frame === 0, cameraYawRatio: .2 });
        engine.render(hz === 120 && frame % 2 === 0 ? .5 : 1);
      }
      expect(entered).toHaveBeenCalledTimes(1);
      expect(runtime.simulation.vehicle?.spec.id).toBe('horse-1');
      results.push({ tick: world.simulationTick, horse: runtime.simulation.vehicle!.position.toArray(), rider: runtime.simulation.player.position.toArray(), yaw: runtime.followCamera.yaw });
    } finally { world.dispose(); }
  }
  expect(results[1]).toEqual(results[0]);
  expect(results[2]).toEqual(results[0]);
});

it('renders without changing canonical camera orbit, timers, or the following fixed result', async () => {
  const a = await createMountedFixture(), b = await createMountedFixture();
  try {
    for (const world of [a,b]) {world.training!.enter('horse-1');world.step({},31);world.step({training:{...emptyInput(),forward:1},cameraYawRatio:.3},20);}
    const camera=a.training!.followCamera;
    const state={yaw:camera.yaw,pitch:camera.pitch,lastOrbit:camera.lastOrbit,distance:camera.distance,target:camera.target.clone()};
    engineOf(a).render(.4);engineOf(a).render(.4);
    expect({yaw:camera.yaw,pitch:camera.pitch,lastOrbit:camera.lastOrbit,distance:camera.distance,target:camera.target}).toEqual(state);
    for (const world of [a,b])world.step({training:{...emptyInput(),forward:1}},1);
    expect(a.training!.camera.position).toEqual(b.training!.camera.position);
    expect(a.training!.followCamera.yaw).toBe(b.training!.followCamera.yaw);
    expect(a.training!.simulation.vehicle!.position).toEqual(b.training!.simulation.vehicle!.position);
  } finally {a.dispose();b.dispose();}
});

it('preserves authored opening camera through repeated display and fixed steps', async () => {
  const world=await createMountedFixture();
  try {
    const runtime=world.training!;
    runtime.useAuthoredCamera();runtime.camera.position.set(8,12,17);runtime.camera.rotation.set(.2,.4,.1);runtime.camera.fov=71;
    const initial=runtime.camera.clone();
    engineOf(world).render(.2);world.step({},3);engineOf(world).render();engineOf(world).render();
    expect(runtime.camera.position).toEqual(initial.position);expect(runtime.camera.quaternion.toArray()).toEqual(initial.quaternion.toArray());expect(runtime.camera.fov).toBe(71);
  } finally {world.dispose();}
});

it('keeps the fixed character local pose and animation clock across display interpolation', async () => {
  const {Character}=await import('./character');
  const {Group}=await import('three');
  const world=await createMountedFixture();
  try {
    const animation=new Character(),bone=new Group();animation.actor.add(bone);
    world.training!.options.character.object.add(animation.root);
    Object.defineProperty(world.training!.options.character,'animation',{value:animation});
    const update=vi.spyOn(animation,'update').mockImplementation(dt=>{bone.position.x+=dt;bone.rotation.y+=dt;});
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
    const engine=engineOf(world),runtime=world.training!,deltas:number[]=[];
    runtime.onVisualUpdate(dt=>deltas.push(dt));
    engine.advance(.25,{interactPressed:true,training:{...emptyInput(),forward:1}});
    expect(world.simulationTick).toBe(15);expect(runtime.simulation.transition).toBeGreaterThan(0);
    engine.render();const before=runtime.snapshot();engine.stop();engine.render();engine.render();
    expect(runtime.snapshot()).toEqual(before);expect(deltas).toEqual([0]);
    engine.start();engine.advance(.25,{training:{...emptyInput(),forward:1}});engine.stop();engine.render();
    expect(world.simulationTick).toBe(30);expect(deltas.at(-1)).toBeCloseTo(.25);
    for(const phase of ['enter','exit'] as const){
      await world.reset();expect(runtime.enter('horse-1')).toBe(true);
      if(phase==='exit'){world.step({},31);expect(runtime.exit()).toBe(true);}
      expect(runtime.simulation.transitionKind).toBe(phase);
      await world.reset();engine.render(.2);
      expect(runtime.simulation.vehicle).toBeUndefined();expect(runtime.simulation.transition).toBe(0);expect(deltas.at(-1)).toBe(0);
    }
  }finally{world.dispose();}
});

it('preserves the supplied opening transform when authored mode is selected after runtime creation',async()=>{
 const {TrainingRuntime}=await import('./runtime');
 const {PerspectiveCamera}=await import('three');
 const fixture=await createMountedFixture();
 const camera=new PerspectiveCamera(64);camera.position.set(7,9,11);camera.rotation.set(.2,.5,.1);
 const before=camera.clone();
 const runtime=await TrainingRuntime.create(fixture.training!.options,camera);
 try {
  runtime.useAuthoredCamera();
  expect(camera.position).toEqual(before.position);expect(camera.quaternion.toArray()).toEqual(before.quaternion.toArray());expect(camera.fov).toBe(64);
 }finally{runtime.dispose();fixture.dispose();}
});

it('opens exact current capture samples and restores after synchronous callback failures',async()=>{
 const world=await createMountedFixture();
 try {
  const engine=engineOf(world),runtime=world.training!;
  runtime.enter('horse-1');world.step({},31);world.step({training:{...emptyInput(),forward:1}},20);
  engine.render(.5);
  const canonical=runtime.simulation.vehicle!.position.clone();
  engine.withPresentation(()=>{expect(runtime.options.vehicles[0]!.object.position).toEqual(canonical);});
  expect(()=>engine.withPresentation(()=>{runtime.options.vehicles[0]!.object.position.set(100,100,100);throw new Error('capture failure');})).toThrow('capture failure');
  expect(runtime.options.vehicles[0]!.object.position).toEqual(canonical);
 }finally{world.dispose();}
});
