import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry, LoopOnce, Mesh, MeshBasicMaterial, Quaternion, type Object3D } from 'three';
import contentCatalog from '@worldkit/asset-library/catalog';
import {composeAssetCatalog} from '@worldkit/preset-content/assets/host-adapter';
const catalog={...contentCatalog,assets:composeAssetCatalog(contentCatalog.assets)};
import { loadAsset, playLocomotion } from './assets';
import { WorldAssets } from './assets-library';
import { createWorld } from './world';
import type { AssetDefinition, AssetInstance } from './engine-contracts';

const humanoid = catalog.assets.find(asset => asset.id === 'humanoid.uefn-mannequin')! as unknown as AssetDefinition & { sourcePath: string };
const instances: AssetInstance[] = [];
async function load() {
  const instance = await loadAsset(humanoid, { fetchBytes: () => readFile(resolve(humanoid.sourcePath)) });
  instances.push(instance);
  return instance;
}
function legBones(instance: AssetInstance): Object3D[] {
  const result: Object3D[] = [];
  instance.object.traverse(object => {
    if (/^(thigh|calf|foot)_[lr]$/.test(object.name)) result.push(object);
  });
  expect(result).toHaveLength(6);
  return result;
}
const pose = (bones: readonly Object3D[]) => bones.map(bone => bone.quaternion.clone().normalize());
const maximumPoseChange = (a: readonly Quaternion[], b: readonly Quaternion[]) => Math.max(...a.map((q, index) => q.angleTo(b[index]!)));
function effectiveDuration(instance: AssetInstance, id: 'walk' | 'run') {
  const clip = instance.clips.find(clip => clip.name === id)!;
  return clip.duration - Math.min(...clip.tracks.map(track => track.times[0]!));
}

afterEach(() => { for (const instance of instances.splice(0)) instance.dispose(); vi.restoreAllMocks(); });

describe('automatic humanoid locomotion with the original project GLB', () => {
  it.each([
    ['walk', 60], ['walk', 120], ['run', 60], ['run', 120],
  ] as const)('advances real leg poses across every %s loop at %i Hz', async (id, hz) => {
    const instance = await load(), bones = legBones(instance);
    playLocomotion(instance, id); instance.update(0);
    let previous = pose(bones), previousTime = instance.timeSeconds, wraps = 0;
    const frozenTicks: number[] = [];
    for (let tick = 1; tick <= hz * 4; tick++) {
      // This is the engine's repeated automatic selection, without any physics
      // or input transition that could restart or pause the current action.
      playLocomotion(instance, id); instance.update(1 / hz);
      const current = pose(bones);
      if (maximumPoseChange(previous, current) < 1e-5) frozenTicks.push(tick);
      if (instance.timeSeconds < previousTime) wraps++;
      previous = current; previousTime = instance.timeSeconds;
    }
    expect(wraps).toBeGreaterThanOrEqual(Math.floor(4*humanoid.actions[id]!.timeScale/effectiveDuration(instance,id)));
    expect(frozenTicks).toEqual([]);
  });

  it('keeps the same stride phase when moving between automatic walk and run', async () => {
    const instance = await load();
    const walkDuration = effectiveDuration(instance, 'walk'), runDuration = effectiveDuration(instance, 'run');
    playLocomotion(instance, 'walk'); instance.update(walkDuration * 0.7 / humanoid.actions.walk!.timeScale);
    playLocomotion(instance, 'run');
    expect(instance.currentActionId).toBe('run');
    expect(instance.timeSeconds / runDuration).toBeCloseTo(0.7, 6);
    instance.update(runDuration * 0.1 / humanoid.actions.run!.timeScale);
    playLocomotion(instance, 'walk');
    expect(instance.currentActionId).toBe('walk');
    expect(instance.timeSeconds / walkDuration).toBeCloseTo(0.8, 6);
  });

  it('renders continuous walk poses at the recorder\'s 24 fps over a 60 Hz clock', async () => {
    const automatic = await load(), reference = await load();
    const automaticBones = legBones(automatic), referenceBones = legBones(reference);
    const sourceClip = reference.clips.find(clip => clip.name === 'walk')!;
    const firstKey = Math.min(...sourceClip.tracks.map(track => track.times[0]!));
    const cycleSeconds = sourceClip.duration - firstKey;
    reference.play('walk'); const sourceAction = reference.mixer.existingAction(sourceClip)!;
    playLocomotion(automatic, 'walk'); automatic.update(0);
    let previousTick = 0;
    const mismatchedFrames: number[] = [];
    for (let frame = 0; frame < 96; frame++) {
      // The actual recorder alternates three and two simulation ticks per frame.
      const tick = Math.round(frame / 24 * 60);
      for (let t = previousTick; t < tick; t++) { playLocomotion(automatic, 'walk'); automatic.update(1 / 60); }
      // Evaluate the original authored movement range directly, excluding its
      // non-animated prefix. Compare bones, not just a reported action clock.
      sourceAction.time = firstKey + (tick / 60 * humanoid.actions.walk!.timeScale) % cycleSeconds; reference.update(0);
      if (maximumPoseChange(pose(automaticBones), pose(referenceBones)) > 1e-5) mismatchedFrames.push(frame);
      previousTick = tick;
    }
    expect(mismatchedFrames).toEqual([]);
  });

  it('preserves the first valid pose while leaving source clip timing untouched', async () => {
    const manual = await load(), automatic = await load();
    const sourceTiming = automatic.clips.map(clip => ({ duration: clip.duration, times: clip.tracks.map(track => Array.from(track.times)) }));
    manual.play('walk'); manual.update(0);
    playLocomotion(automatic, 'walk'); automatic.update(0);
    expect(maximumPoseChange(pose(legBones(manual)), pose(legBones(automatic)))).toBeLessThan(1e-6);
    automatic.update(2); playLocomotion(automatic, 'run'); automatic.update(2);
    expect(automatic.clips.map(clip => ({ duration: clip.duration, times: clip.tracks.map(track => Array.from(track.times)) }))).toEqual(sourceTiming);
  });

  it('starts an explicit manual walk from zero with the original one-shot duration', async () => {
    const instance = await load(), walk = instance.clips.find(clip => clip.name === 'walk')!;
    playLocomotion(instance, 'walk'); instance.update(0.6);
    instance.play('walk', { playback: 'once' });
    const action = instance.mixer.existingAction(walk)!;
    expect(action).toBeDefined();
    expect(action.loop).toBe(LoopOnce);
    expect(action.getClip()).toBe(walk);
    expect(walk.duration).toBeGreaterThan(0);
    expect(instance.timeSeconds).toBe(0);
    instance.update(walk.duration/humanoid.actions.walk!.timeScale-.01); expect(instance.isActionComplete).toBe(false);
    instance.update(.02); expect(instance.isActionComplete).toBe(true);
    expect(instance.timeSeconds).toBe(walk.duration);
  });

  it.each(['walk', 'run'] as const)('keeps generic manual %s playback on its original clip', async id => {
    const instance = await load(), source = instance.clips.find(clip => clip.name === id)!;
    playLocomotion(instance, id); instance.update(0.6);
    instance.play(id);
    expect(instance.timeSeconds).toBe(0);
    expect(instance.mixer.existingAction(source)?.isRunning()).toBe(true);
    // Finish the check with no outgoing automatic clip contributing to a fade.
    instance.mixer.stopAllAction(); instance.play(id);
    const bones = legBones(instance); instance.update(0); const first = pose(bones);
    instance.update(1 / 60);
    // The bound source starts at an authored key and moves continuously.
    expect(maximumPoseChange(first, pose(bones))).toBeGreaterThan(1e-6);
  });

  it.each(['idle', 'jump'] as const)('does not carry automatic phase through %s', async action => {
    const instance = await load();
    playLocomotion(instance, 'walk'); instance.update(0.6);
    instance.play(action); instance.update(0.05);
    playLocomotion(instance, 'run');
    expect(instance.timeSeconds).toBe(0);
  });

  it.each(['walk', 'run'] as const)('does not inherit stopped phase when starting automatic %s', async id => {
    const instance = await load();
    playLocomotion(instance, 'walk'); instance.update(0.6);
    instance.mixer.stopAllAction();
    playLocomotion(instance, id);
    expect(instance.timeSeconds).toBe(0);
    instance.update(1 / 60); expect(instance.timeSeconds).toBeCloseTo(humanoid.actions[id]!.timeScale / 60);
  });

  it('restores the original idle reset pose and starts a new gait from the beginning', async () => {
    const instance = await load(), bones = legBones(instance);
    instance.play('idle'); instance.update(0); const initial = pose(bones);
    playLocomotion(instance, 'walk'); instance.update(0.6);
    instance.mixer.stopAllAction(); instance.play('idle'); instance.update(0);
    expect(maximumPoseChange(initial, pose(bones))).toBeLessThan(1e-6);
    playLocomotion(instance, 'run'); expect(instance.timeSeconds).toBe(0);
  });

  it('keeps gait phase independent between instances sharing the source GLB', async () => {
    const first = await load(), second = await load();
    playLocomotion(first, 'walk'); playLocomotion(second, 'walk');
    first.update(effectiveDuration(first, 'walk') * 0.2 / humanoid.actions.walk!.timeScale);
    second.update(effectiveDuration(second, 'walk') * 0.7 / humanoid.actions.walk!.timeScale);
    const secondTime = second.timeSeconds;
    playLocomotion(first, 'run');
    expect(first.timeSeconds / effectiveDuration(first, 'run')).toBeCloseTo(0.2, 6);
    expect(second.currentActionId).toBe('walk'); expect(second.timeSeconds).toBe(secondTime);
    playLocomotion(second, 'run');
    expect(second.timeSeconds / effectiveDuration(second, 'run')).toBeCloseTo(0.7, 6);
    first.dispose(); second.update(0.1);
    expect(second.timeSeconds).toBeCloseTo(effectiveDuration(second, 'run') * 0.7 + 0.1 * humanoid.actions.run!.timeScale, 6);
  });

  it('uses automatic gait through the managed asset handle supplied to the engine', async () => {
    vi.stubGlobal('fetch', async () => new Response(await readFile(resolve(humanoid.sourcePath))));
    const library = new WorldAssets({ definitions: { [humanoid.id]: humanoid }, baseUri: 'https://gait.test/managed/' });
    try {
      const handle = await library.load(humanoid.id), managed = library.internal(handle);
      managed.mixer.stopAllAction(); playLocomotion(managed, 'walk'); managed.update(0);
      const bones = legBones(managed), first = pose(bones);
      managed.update(1 / 60);
      expect(maximumPoseChange(first, pose(bones))).toBeGreaterThan(1e-5);
      managed.update(effectiveDuration(managed, 'walk') * 0.7 / humanoid.actions.walk!.timeScale - 1 / 60);
      playLocomotion(managed, 'run');
      expect(managed.timeSeconds / effectiveDuration(managed, 'run')).toBeCloseTo(0.7, 6);
      const cloned = library.internal(await library.clone(handle));
      playLocomotion(cloned, 'walk'); expect(cloned.timeSeconds).toBe(0);
      library.release(handle); cloned.update(0.1);
      expect(cloned.timeSeconds).toBeCloseTo(.1*humanoid.actions.walk!.timeScale);
    } finally { library.dispose(); vi.unstubAllGlobals(); }
  });

  it('drives continuous automatic gait through the public world and real character physics', async () => {
    vi.stubGlobal('fetch', async () => new Response(await readFile(resolve(humanoid.sourcePath))));
    const world = await createWorld({ navigation: false, assetDefinitions: { [humanoid.id]: humanoid } });
    const geometry = new BoxGeometry(80, 1, 80), material = new MeshBasicMaterial();
    try {
      const floor = new Mesh(geometry, material); floor.position.y = -0.5;
      world.addEntity({ id: 'ground', object: floor, role: 'terrain' });
      const handle = await world.assets.load(humanoid.id), managed = world.assets.internal(handle);
      world.addCharacter({ id: 'hero', asset: handle, movement: { kind: 'ground', walkSpeedMetersPerSecond: 2.1, runSpeedMetersPerSecond: 4.2 } });
      world.setControlledEntity('hero'); world.camera.position.set(0, 3, 6); world.camera.lookAt(0, 1, 0);
      const bones = legBones(managed), initial = pose(bones);
      await world.start(); world.stop(); world.step({}, 30);
      expect(world.getEntityState('hero').motion?.isGrounded).toBe(true);
      let previous = pose(bones);
      const frozenTicks: number[] = [];
      for (let tick = 1; tick <= 180; tick++) {
        world.step({ moveZRatio: -1 });
        const state = world.getEntityState('hero'), current = pose(bones);
        expect(state.animation?.actionId).toBe('walk');
        // Skip the initial idle blend, then observe multiple complete cycles.
        if (tick > 15 && maximumPoseChange(previous, current) < 1e-5) frozenTicks.push(tick);
        previous = current;
      }
      expect(frozenTicks).toEqual([]);
      const phase = managed.timeSeconds / effectiveDuration(managed, 'walk');
      world.step({ moveZRatio: -1, run: true });
      expect(world.getEntityState('hero').animation?.actionId).toBe('run');
      expect(managed.timeSeconds).toBeCloseTo((phase * effectiveDuration(managed, 'run') + humanoid.actions.run!.timeScale / 60) % effectiveDuration(managed, 'run'), 6);
      await world.reset();
      expect(world.getEntityState('hero').animation?.actionId).toBe('idle');
      expect(managed.timeSeconds).toBe(0);
      expect(maximumPoseChange(initial, pose(bones))).toBeLessThan(1e-6);
    } finally { world.dispose(); geometry.dispose(); material.dispose(); vi.unstubAllGlobals(); }
  });
});
