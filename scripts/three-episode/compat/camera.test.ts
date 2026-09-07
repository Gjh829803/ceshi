import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ThreeCameraRig} from './creator-camera.js';
import type {Vec3} from '../../../packages/three-world/src/engine-contracts.js';

describe('delivered Creator camera compatibility',()=>{
 it('retains the pinned follow kernel byte-for-byte outside the Episode relocation extension',async()=>{
  const provenance=JSON.parse(await readFile(new URL('./creator-camera-provenance.json',import.meta.url),'utf8'));
  const file=await readFile(new URL('./creator-camera.ts',import.meta.url),'utf8');
  const original=file.replace(/^\/\/ Compatibility kernel[^\n]*\n/,'').replace("from '../../../packages/three-world/src/engine-contracts.js'","from './engine-contracts.js'").replace(/  \/\*\* Rebase camera memory[\s\S]*?(?=  snapshot\(\): CameraRigState)/,'');
  expect(createHash('sha256').update(original).digest('hex')).toBe(provenance.originalCameraSha256);
 });
 it('rebases pending camera pose and memory once, preserves projection, and resets for another segment',()=>{
  let target:Vec3=[0,0,0];
  const camera=new THREE.PerspectiveCamera(48,1.6,.05,500);camera.position.set(3,4,8);camera.lookAt(-2,1,-12);
  const rig=new ThreeCameraRig(camera,(a,b)=>({distanceMeters:new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b))}),()=>target);
  rig.setFollow({targetEntityId:'traveler',framingMode:'preserve-opening',followHalfLifeSeconds:.045});rig.sealInitialState();
  const opening=camera.clone(),projection=camera.projectionMatrix.clone(),turn=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2);
  target=[8,0,-6];rig.relocateEpisodeStart([0,0,0],target,Math.PI/2,opening.position.clone(),opening.quaternion.clone());
  const expected=opening.position.clone().applyQuaternion(turn).add(new THREE.Vector3(...target));
  expect(camera.position.distanceTo(expected)).toBeLessThan(1e-9);expect(camera.quaternion.angleTo(opening.quaternion.clone().premultiply(turn))).toBeLessThan(1e-7);
  expect(camera.projectionMatrix.equals(projection)).toBe(true);
  rig.updateDesired({activate:true},1/60);rig.update(1/60);expect(camera.position.distanceTo(expected)).toBeLessThan(1e-8);
  target=[0,0,0];rig.reset();expect(camera.position.distanceTo(opening.position)).toBeLessThan(1e-9);
 });
});
