import { expect, it } from 'vitest';
import { Euler, Quaternion, Vector3 } from 'three';
import { resolveCameraConfiguration, type CameraOrientation, type CameraRecenterYawTarget } from '../../config/camera';
import { orbitQuaternion, prepareCameraIntent } from './evaluation';
import {cameraReferenceRotation,cameraSubjectHeading} from './heading';
import type { CameraSubjectFacts } from '../subject';

const subject: CameraSubjectFacts = {id:'actor',generation:1,kind:'ordinary',positionWorldMetersXYZ:[0,0,0],geometryQuaternionWorldXYZW:[0,0,0,1],geometryScaleXYZ:[1,1,1],semanticQuaternionWorldXYZW:[0,0,0,1],speedMetersPerSecond:5,velocityWorldMetersPerSecondXYZ:[5,0,0]};
function prepare(target: CameraRecenterYawTarget | undefined, facts=subject, orientation: Partial<CameraOrientation>={}, elapsed=2, dt=1/60, pitch=.2) {
  const configuration=resolveCameraConfiguration({kind:'world-camera',schemaVersion:1,defaultViewId:'orbit',binding:{targetEntityId:'actor'},views:{orbit:{kind:'third-person',overrides:{position:{anchor:{kind:'origin'}},orientation:{...orientation,recenter:{enabled:true,delaySeconds:1,minimumSpeedMetersPerSecond:.8,yawHalfLifeSeconds:0,...orientation.recenter,...(target?{yawTarget:target}:{})}}}}}},
    {subjectId:'actor',subjectGeneration:1,subjectKind:'ordinary',availableAnchors:[],headingAvailable:!!facts.semanticQuaternionWorldXYZW,velocityAvailable:!!facts.velocityWorldMetersPerSecondXYZ});
  return prepareCameraIntent({configuration,subject:facts,deltaSeconds:dt,intent:{yawRadians:.4,pitchRadians:pitch,distanceMeters:5,secondsSinceOrbit:elapsed}});
}
it('keeps default body heading while movement-direction follows drifting and reverse travel',()=>{
  expect(prepare(undefined).yawRadians).toBeCloseTo(0,12);
  expect(prepare({kind:'subject-forward'})).toEqual(prepare(undefined));
  expect(prepare({kind:'movement-direction'}).yawRadians).toBeCloseTo(-Math.PI/2,12);
  expect(Math.abs(prepare({kind:'movement-direction'},{...subject,velocityWorldMetersPerSecondXYZ:[0,0,5]}).yawRadians)).toBeCloseTo(Math.PI,12);
});
it.each([[0,0,0],[0,8,0],[.2,8,.1]] as const)('holds the orbit without sufficient horizontal motion: %j',(x,y,z)=>{
  expect(prepare({kind:'movement-direction'},{...subject,velocityWorldMetersPerSecondXYZ:[x,y,z],speedMetersPerSecond:Math.hypot(x,y,z)}).yawRadians).toBe(.4);
});
it('does not invent a movement direction when an adapter omits velocity',()=>{
  const {velocityWorldMetersPerSecondXYZ:_,...unknown}=subject;
  expect(prepare({kind:'movement-direction'},unknown).yawRadians).toBe(.4);
});
it('waits after orbit input and uses a world-forward target without semantic heading',()=>{
  expect(prepare({kind:'movement-direction'},subject,{},0,.5).yawRadians).toBe(.4);
  const {semanticQuaternionWorldXYZW:_,...unknown}=subject;
  expect(prepare({kind:'world-forward',yawRadians:.9},unknown).yawRadians).toBeCloseTo(.9,12);
});
it.each(['subject-heading','subject-up'] as const)('converts movement direction into %s orbit coordinates',(referenceFrame)=>{
  const rotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI/2).toArray();
  const result=prepare({kind:'movement-direction'},{...subject,semanticQuaternionWorldXYZW:rotation,velocityWorldMetersPerSecondXYZ:[0,0,-5]}, {referenceFrame,inheritSubjectYaw:true});
  expect(result.yawRadians).toBeCloseTo(-Math.PI/2,12);
});
it('keeps world-forward independent of subject yaw inheritance',()=>{
  const facts={...subject,semanticQuaternionWorldXYZW:new Quaternion().setFromAxisAngle(new Vector3(0,1,0),1).toArray()};
  expect(prepare({kind:'world-forward',yawRadians:.2},facts,{referenceFrame:'subject-heading',inheritSubjectYaw:true}).yawRadians).toBeCloseTo(-.8,12);
  expect(prepare({kind:'world-forward',yawRadians:.2},facts,{referenceFrame:'subject-heading',inheritSubjectYaw:false}).yawRadians).toBeCloseTo(.2,12);
});
it('treats half-life as error halving and never mutates source facts',()=>{
  const before=JSON.stringify(subject);
  const result=prepare({kind:'world-forward',yawRadians:1.4},subject,{recenter:{enabled:true,delaySeconds:1,minimumSpeedMetersPerSecond:0,yawHalfLifeSeconds:.5}},2,.5);
  expect(result.yawRadians).toBeCloseTo(.9,12);
  expect(JSON.stringify(subject)).toBe(before);
});

it.each([true,false])('preserves world bearings under combined subject pitch/roll (inherit yaw: %s)',inheritSubjectYaw=>{
  for(const angles of [[.6,.2,.7],[-.5,1.1,-.6],[.9,-.7,.3]]){
    const rotation=new Quaternion().setFromEuler(new Euler(...angles as [number,number,number]));
    for(const yaw of [0,.7,-1.2]){
      const direction=new Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
      const facts={...subject,semanticQuaternionWorldXYZW:rotation.toArray(),velocityWorldMetersPerSecondXYZ:direction.clone().multiplyScalar(5).toArray()};
      for(const target of [{kind:'world-forward',yawRadians:yaw},{kind:'movement-direction'}] as const){
        const result=prepare(target,facts,{referenceFrame:'subject-up',inheritSubjectYaw});
        const reference=cameraReferenceRotation(facts,'subject-up',cameraSubjectHeading(facts),inheritSubjectYaw);
        const forward=new Vector3(0,0,-1).applyQuaternion(orbitQuaternion(result.yawRadians,result.pitchRadians)).applyQuaternion(reference).setY(0).normalize();
        expect(forward.distanceTo(direction)).toBeLessThan(1e-9);
        expect(result.pitchRadians).toBe(.2);
      }
    }
  }
});

it('uses the same-step clamped pitch when finding a tilted world bearing',()=>{
  const facts={...subject,semanticQuaternionWorldXYZW:new Quaternion().setFromEuler(new Euler(.6,.2,.7)).toArray()};
  const result=prepare({kind:'world-forward',yawRadians:0},facts,{referenceFrame:'subject-up',pitchLimitsRadians:{kind:'bounded',minimumRadians:-.3,maximumRadians:.3},recenter:{enabled:true,delaySeconds:0,minimumSpeedMetersPerSecond:0,yawHalfLifeSeconds:0,pitch:{targetRadians:.8,halfLifeSeconds:0}}});
  const forward=new Vector3(0,0,-1).applyQuaternion(orbitQuaternion(result.yawRadians,result.pitchRadians)).applyQuaternion(new Quaternion(...facts.semanticQuaternionWorldXYZW)).setY(0).normalize();
  expect(result.pitchRadians).toBe(.3);expect(forward.distanceTo(new Vector3(0,0,-1))).toBeLessThan(1e-9);
});

it('holds yaw when a tilted orbit cannot reach the bearing, or yaw limits exclude it',()=>{
  const sideways={...subject,semanticQuaternionWorldXYZW:new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.PI/2).toArray()};
  expect(prepare({kind:'world-forward',yawRadians:0},sideways,{referenceFrame:'subject-up'}).yawRadians).toBe(.4);
  expect(prepare({kind:'world-forward',yawRadians:1},subject,{yawLimitsRadians:{kind:'bounded',minimumRadians:-.5,maximumRadians:.5}}).yawRadians).toBe(.4);
});

it('chooses the nearest reachable branch and respects exact yaw limits',()=>{
  const sideways={...subject,semanticQuaternionWorldXYZW:new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.PI/2).toArray()};
  const target={kind:'world-forward' as const,yawRadians:-Math.PI/2};
  expect(prepare(target,sideways,{referenceFrame:'subject-up'}).yawRadians).toBeCloseTo(Math.PI/2,10);
  expect(prepare(target,sideways,{referenceFrame:'subject-up',yawLimitsRadians:{kind:'bounded',minimumRadians:-2,maximumRadians:-1}}).yawRadians).toBeCloseTo(-Math.PI/2,10);
  expect(prepare({kind:'world-forward',yawRadians:.7},subject,{yawLimitsRadians:{kind:'bounded',minimumRadians:-.5,maximumRadians:.7}}).yawRadians).toBeCloseTo(.7,10);
});

it('keeps a world bearing past the local pitch pole without inventing yaw at the pole',()=>{
  const orientation={pitchLimitsRadians:{kind:'unbounded' as const}};
  const past=prepare({kind:'world-forward',yawRadians:0},subject,orientation,2,1/60,2.8);
  const forward=new Vector3(0,0,-1).applyQuaternion(orbitQuaternion(past.yawRadians,past.pitchRadians)).setY(0).normalize();
  expect(forward.distanceTo(new Vector3(0,0,-1))).toBeLessThan(1e-9);
  expect(prepare({kind:'world-forward',yawRadians:0},subject,orientation,2,1/60,Math.PI/2).yawRadians).toBe(.4);
});

it('recovers reachable bearings across varied three-dimensional orbit frames',()=>{
  for(let index=1;index<=48;index++){
    const rotation=new Quaternion().setFromEuler(new Euler(Math.sin(index)*2,Math.cos(index*.7)*3,Math.sin(index*.3)*2));
    const facts={...subject,semanticQuaternionWorldXYZW:rotation.toArray()};
    const inheritSubjectYaw=index%2===0,pitch=Math.sin(index*.4)*2.8;
    const reference=cameraReferenceRotation(facts,'subject-up',cameraSubjectHeading(facts),inheritSubjectYaw);
    const expected=new Vector3(0,0,-1).applyQuaternion(orbitQuaternion(Math.cos(index*.2)*3,pitch)).applyQuaternion(reference).setY(0).normalize();
    const result=prepare({kind:'world-forward',yawRadians:Math.atan2(-expected.x,-expected.z)},facts,{referenceFrame:'subject-up',inheritSubjectYaw,pitchLimitsRadians:{kind:'unbounded'}},2,1/60,pitch);
    const actual=new Vector3(0,0,-1).applyQuaternion(orbitQuaternion(result.yawRadians,result.pitchRadians)).applyQuaternion(reference).setY(0).normalize();
    expect(actual.distanceTo(expected)).toBeLessThan(1e-8);
  }
});
