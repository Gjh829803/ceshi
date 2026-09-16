import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createWorld} from './engine';

// Drive the real world through browser callbacks, including callbacks delivered
// after cancellation. No physics, animation or camera implementation is mocked.
function frames() {
  let sequence = 0;
  const pending = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = ++sequence; pending.set(id, callback); return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => pending.delete(id));
  return {
    pending,
    fire(time: number) {
      const entry = pending.entries().next().value;
      if (!entry) throw new Error('No scheduled frame');
      pending.delete(entry[0]); entry[1](time);
    },
  };
}
async function fixture() {
  const world = await createWorld({navigation:false});
  const ground = new THREE.Mesh(new THREE.BoxGeometry(40, 1, 40)); ground.position.y = -.5;
  world.addEntity({id:'ground',object:ground,physics:{kind:'fixed'}});
  world.addCharacter({id:'actor',object:new THREE.Group()});
  world.setControlledEntity('actor');
  return world;
}
afterEach(() => vi.unstubAllGlobals());

describe('World lifecycle compatibility', () => {
  it('starts once and rejects cancelled frame callbacks after a restart', async () => {
    const clock = frames(), world = await fixture();
    try {
      world.start(); world.start(); expect(clock.pending.size).toBe(1);
      clock.fire(1000); clock.fire(1020); expect(world.simulationTick).toBe(1);
      const stale = [...clock.pending.values()][0]!;
      world.keyboard.keyDown('KeyW'); world.stop();
      expect(clock.pending.size).toBe(0); expect(world.keyboard.enabled).toBe(false);
      world.start(); const count = clock.pending.size;
      stale(2000); expect(clock.pending.size).toBe(count); expect(world.simulationTick).toBe(1);
      clock.fire(5000); expect(world.simulationTick).toBe(1);
      expect(world.keyboard.sample().moveZRatio).toBe(0);
      clock.fire(5020); expect(world.simulationTick).toBe(2);
    } finally {world.dispose();}
  });
  it('keeps manual stepping and rendering available while stopped', async () => {
    const clock = frames(), world = await fixture();
    try {
      world.start(); clock.fire(1000); world.stop();
      world.step({moveZRatio:-1},3); const before = world.snapshot();
      world.render(); world.render(.5);
      expect(world.snapshot()).toEqual(before); expect(world.simulationTick).toBe(3);
      expect(world.isRunning).toBe(false); expect(clock.pending.size).toBe(0);
    } finally {world.dispose();}
  });
  it.each([false,true])('resets state and held input while preserving running=%s', async running => {
    const clock = frames(), world = await fixture();
    try {
      world.step({},1); world.reset(); const opening = world.snapshot().entities;
      world.step({moveZRatio:-1},20);
      if (running) world.start();
      world.keyboard.enabled = true; world.keyboard.keyDown('Space'); world.keyboard.keyDown('KeyW');
      let resetCount = 0; world.onReset(() => resetCount++);
      world.reset();
      expect(world.snapshot().entities).toEqual(opening); expect(world.simulationTick).toBe(0);
      expect(world.isRunning).toBe(running); expect(clock.pending.size).toBe(running?1:0);
      expect(world.keyboard.sample()).toMatchObject({moveZRatio:0,jump:false}); expect(resetCount).toBe(1);
    } finally {world.dispose();}
  });
  it('keeps simulation callbacks before rendering and permits stop/start inside a render callback', async () => {
    const clock = frames(), world = await fixture();
    const order:string[]=[];
    world.onUpdate(({simulationTick}) => order.push(`before:${simulationTick}`));
    world.onAfterUpdate(() => order.push(`after:${world.simulationTick}`));
    let restart = false;
    world.onRender(() => {order.push(`render:${world.simulationTick}`); if(restart){restart=false;world.stop();world.start();}});
    try {
      world.start(); clock.fire(1000); order.length=0; restart=true; clock.fire(1020);
      expect(order).toEqual(['before:1','after:1','render:1']); expect(clock.pending.size).toBe(1);
      clock.fire(9000); expect(world.simulationTick).toBe(1); expect(clock.pending.size).toBe(1);
    } finally {world.dispose();}
  });
  it('disposes once, releases camera and physics, and never revives stale frames', async () => {
    const clock = frames(), world = await fixture();
    const cameraDispose = vi.spyOn(world.cameraController,'dispose');
    const physicsDispose = vi.spyOn(world.physics,'dispose');
    let cleaned = 0;
    world.onDispose(() => {throw new Error('cleanup fixture failure');}); world.onDispose(() => cleaned++);
    world.start(); const stale = [...clock.pending.values()][0]!;
    world.dispose(); world.dispose(); stale(1000);
    expect(cleaned).toBe(1); expect(cameraDispose).toHaveBeenCalledTimes(1); expect(physicsDispose).toHaveBeenCalledTimes(1);
    expect(clock.pending.size).toBe(0); expect(world.isRunning).toBe(false);
    expect(() => world.start()).toThrow('WORLD_DISPOSED'); expect(() => world.step()).toThrow('WORLD_DISPOSED');
    expect(() => world.render()).not.toThrow();
  });
  it('retains the Node/headless manual clock without requiring browser callbacks', async () => {
    vi.stubGlobal('requestAnimationFrame',undefined); vi.stubGlobal('cancelAnimationFrame',undefined);
    const world = await fixture();
    try {
      world.start(); expect(world.isRunning).toBe(true); world.advance(1/60); expect(world.simulationTick).toBe(1);
      world.stop(); world.step({},1); expect(world.simulationTick).toBe(2); expect(world.isRunning).toBe(false);
    } finally {world.dispose();}
  });
});