import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {fixtureTextureLoader} from './humanoid-runtime/textured-glb-fixture';
import catalog from '../../../assets/three-creator/asset-catalog.json';
import { loadAsset, cloneAsset, playLocomotion } from './assets';
import { createWorld } from './engine';
import type { AssetDefinition, AssetInstance } from './engine-contracts';

const instances: AssetInstance[] = [];
async function preset() {
  const definition = catalog.assets.find(a => a.id === 'humanoid.source-101');
  expect(definition, 'Creator must expose the ordinary SDK preset').toBeDefined();
  const asset = await loadAsset(definition as unknown as AssetDefinition, {
    fetchBytes: () => readFile(definition!.sourcePath),
  });
  instances.push(asset); return asset;
}
beforeEach(()=>{
  const parse=GLTFLoader.prototype.parse;
  vi.spyOn(GLTFLoader.prototype,'parse').mockImplementation(function(this:GLTFLoader,data,path,onLoad,onError){return parse.call(fixtureTextureLoader(this),data,path,onLoad,onError);});
});
afterEach(() => { for (const asset of instances.splice(0)) asset.dispose(); vi.restoreAllMocks(); });

it('loads the preset skeleton, a grounded human body and independent clone animation', async () => {
  const asset = await preset();
  expect(asset.actionIds).toEqual(expect.arrayContaining(['idle','walk','run','jump','fall']));
  const bones: THREE.Object3D[] = [];
  asset.object.traverse(o => {
    if ((o as THREE.Bone).isBone) bones.push(o);
    if(o instanceof THREE.SkinnedMesh)for(const material of Array.isArray(o.material)?o.material:[o.material]){
      expect(material.transparent,'opaque shell must not enter the transparent pass').toBe(false);
      expect(material.depthWrite,'joint occlusion requires depth writes').toBe(true);
    }
  });
  expect(bones).toHaveLength(101);
  asset.play('idle'); asset.update(0); asset.object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(asset.object, true);
  expect(bounds.min.y).toBeGreaterThan(-.12); expect(bounds.min.y).toBeLessThan(.12);
  expect(bounds.max.y).toBeGreaterThan(1.6); expect(bounds.max.y).toBeLessThan(2.1);
  const toe = asset.object.getObjectByName('ball_l')!.getWorldPosition(new THREE.Vector3());
  const heel = asset.object.getObjectByName('foot_l')!.getWorldPosition(new THREE.Vector3());
  expect(toe.z, 'preset faces SDK semantic -Z').toBeLessThan(heel.z);
  const clone = cloneAsset(asset); instances.push(clone);
  clone.play('idle'); clone.update(0);
  const leg = clone.object.getObjectByName('calf_l')!, before = leg.quaternion.clone();
  asset.play('run'); asset.update(.3);
  expect(leg.quaternion.angleTo(before)).toBeLessThan(1e-6);
  expect(asset.object.getObjectByName('calf_l')!.quaternion.angleTo(before)).toBeGreaterThan(.02);
});

it.each(['walk','run'] as const)('animates %s without root drift or frozen loops', async action => {
  const asset = await preset();
  const leg = asset.object.getObjectByName('calf_l')!, root = asset.object.getObjectByName('root')!;
  playLocomotion(asset, action); asset.update(0);
  let previous = leg.quaternion.clone(), lastTime = 0, wraps = 0, frozen = 0;
  const duration = asset.clips.find(clip => clip.name === action)!.duration;
  for (let tick = 0; tick < Math.ceil(duration * 60 * 4); tick++) {
    playLocomotion(asset, action); asset.update(1/60);
    if (leg.quaternion.angleTo(previous) < 1e-6) frozen++;
    if (asset.timeSeconds < lastTime) wraps++;
    expect(root.position.length()).toBeLessThan(1e-6);
    previous = leg.quaternion.clone(); lastTime = asset.timeSeconds;
  }
  expect(wraps).toBeGreaterThan(2); expect(frozen).toBe(0);
});

it('uses real Rapier movement, jump/landing, reset and independent Episode starts', async () => {
  const asset = await preset();
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0,3,6); camera.lookAt(0,1,0);
  const world = await createWorld({ scene:new THREE.Scene(), camera, navigation:false });
  try {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(100,1,100)); floor.position.y=-.5;
    world.addEntity({id:'floor',object:floor,role:'terrain'});
    world.addCharacter({id:'person',object:asset.object,asset}); world.setControlledEntity('person');
    world.step({},30); expect(asset.currentActionId).toBe('idle');
    world.step({moveZRatio:-1},60); expect(asset.currentActionId).toBe('walk');
    const walk = asset.object.position.clone(); expect(walk.length()).toBeGreaterThan(2);
    world.step({moveZRatio:-1,run:true},60); expect(asset.currentActionId).toBe('run');
    expect(asset.object.position.distanceTo(walk)).toBeGreaterThan(4);
    world.step({jump:true}); expect(asset.currentActionId).toBe('jump');
    expect(world.physics.state('person')!.isGrounded).toBe(false);
    world.step({},100); expect(world.physics.state('person')!.isGrounded).toBe(true);
    expect(asset.currentActionId).toBe('idle');
    world.reset(); expect(asset.currentActionId).toBe('idle'); expect(asset.timeSeconds).toBe(0);
    expect(Math.hypot(asset.object.position.x,asset.object.position.z)).toBeLessThan(.01);
    world.prepareEpisodeStart([4,5,0],0); world.step({},35);
    expect(asset.currentActionId).toBe('fall'); expect(world.physics.state('person')!.isGrounded).toBe(false);
    world.prepareEpisodeStart([0,.04,0],0); world.step({},30);
    expect(asset.currentActionId).toBe('idle'); expect(world.snapshot().errors).toEqual([]);
  } finally { world.dispose(); }
});
