import { Group, Quaternion, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { CameraDocument } from '../config/camera/index';
import type { CameraSubjectFacts } from './subject';
import { WorldCameraSubjects, type CameraSubjectSource } from './world-subject';

const binding:CameraDocument['binding']={targetEntityId:'rider'};
function facts(id='mount',generation=1):CameraSubjectFacts {
 return {id,generation,kind:'vehicle',positionWorldMetersXYZ:[1,2,3],geometryQuaternionWorldXYZW:[0,0,0,1],geometryScaleXYZ:[1,1,1],speedMetersPerSecond:4};
}

describe('camera subject source boundary',()=>{
 it.each([
  {targetEntityId:'rider'},
  {targetEntityId:'rider',mountTarget:'actor' as const},
  {targetEntityId:'mount'},
 ])('preserves binding and fixed/display sampling for $targetEntityId / $mountTarget',selected=>{
  const fixed=facts(),display={...fixed,positionWorldMetersXYZ:[4,5,6] as const};
  const sampleCamera=vi.fn<CameraSubjectSource['sampleCamera']>((_,generation,isDisplay)=>{
   expect(generation('mount')).toBe(7);
   return isDisplay?display:fixed;
  });
  const entity=vi.fn(),velocity=vi.fn();
  const subjects=new WorldCameraSubjects(entity,velocity,{sampleCamera,cameraOperation:()=>''});
  // World supplies the live generation reader after constructing the adapter.
  subjects.generation=id=>id==='mount'?7:undefined;
  expect(subjects.sample(selected)).toEqual(fixed);
  expect(subjects.sample(selected,true)).toEqual(display);
  expect(sampleCamera.mock.calls).toEqual([[selected,subjects.generation,false],[selected,subjects.generation,true]]);
  expect(entity).not.toHaveBeenCalled();expect(velocity).not.toHaveBeenCalled();
 });

 it('falls back to ordinary world-space facts only when the native source has no subject',()=>{
  const parent=new Group(),object=new Group();parent.add(object);
  parent.position.set(10,2,-4);parent.rotation.y=Math.PI/2;parent.scale.setScalar(2);object.position.x=1;
  const entity={object,character:{heightMeters:1.8},options:{eyePositionLocalMetersXYZ:[0,1,0] as const,frontYawRadians:Math.PI/2}};
  const source:CameraSubjectSource={sampleCamera:()=>undefined,cameraOperation:()=>''};
  for(const native of [undefined,source]){
   const subjects=new WorldCameraSubjects(id=>id==='rider'?entity:undefined,()=>[3,0,4],native);
   subjects.generation=id=>id==='rider'?2:undefined;
   const value=subjects.sample(binding,true)!;
   expect(value).toMatchObject({id:'rider',generation:2,kind:'ordinary',speedMetersPerSecond:5,geometryScaleXYZ:[2,2,2],body:{minimumHeightMeters:0,maximumHeightMeters:3.6}});
   expect(new Vector3(...value.positionWorldMetersXYZ).distanceTo(new Vector3(10,2,-6))).toBeLessThan(1e-12);
   expect(new Vector3(...value.eyeWorldMetersXYZ!).distanceTo(new Vector3(10,4,-6))).toBeLessThan(1e-12);
   expect(new Quaternion(...value.semanticQuaternionWorldXYZW!).angleTo(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI))).toBeLessThan(1e-7);
   expect(subjects.sample({targetEntityId:'missing'})).toBeUndefined();
   subjects.generation=()=>undefined;
   expect(subjects.sample(binding)).toBeUndefined();
  }
 });

 it('preserves native source failures instead of silently substituting ordinary geometry',()=>{
  const failure=new Error('native sampling failed'),entity=vi.fn();
  const subjects=new WorldCameraSubjects(entity,()=>undefined,{sampleCamera:()=>{throw failure;},cameraOperation:()=>''});
  expect(()=>subjects.sample(binding)).toThrow(failure);expect(entity).not.toHaveBeenCalled();
 });

 it('distinguishes relocation, same-ID replacement and mount handoff using live source identity',()=>{
  let subject=facts(),operation='initial';
  const subjects=new WorldCameraSubjects(()=>undefined,()=>undefined,{sampleCamera:()=>subject,cameraOperation:()=>operation});
  subjects.lifecycle=()=>9;subjects.adopt(binding);
  expect(subjects.event(binding)).toBeUndefined();
  operation='teleported';
  expect(subjects.event(binding)).toMatchObject({operationId:'9:1',kind:'relocate',subject,previousSubject:subject});
  subjects.adopt(binding);expect(subjects.event(binding)).toBeUndefined();
  subject=facts('mount',2);
  expect(subjects.event(binding)).toMatchObject({operationId:'9:2',kind:'retarget',subject:{id:'mount',generation:2},previousSubject:{id:'mount',generation:1}});
  subjects.adopt(binding);subject={...facts('rider',3),kind:'humanoid'};
  expect(subjects.event(binding)).toMatchObject({operationId:'9:3',kind:'retarget',subject:{id:'rider'},previousSubject:{id:'mount'}});
  subjects.adopt(binding);subjects.relocated(['unrelated']);expect(subjects.event(binding)).toBeUndefined();
  subjects.relocated(['rider']);expect(subjects.event(binding)?.kind).toBe('relocate');
  subjects.clear();expect(subjects.event(binding)).toBeUndefined();
 });
});
