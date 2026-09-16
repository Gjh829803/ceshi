import {expect,it,vi} from 'vitest';
import {Quaternion,Vector3} from 'three';
import {createHumanoidCameraDocument,resolveCameraConfiguration,type CameraInspection,type CameraCollisionProbeSample,type RuntimeError} from '@worldkit/three';
import {inspectDebugCamera} from '@worldkit/three/debug';

function fixture(viewId='third-person'){
 const document=createHumanoidCameraDocument('person',viewId);
 const resolved=resolveCameraConfiguration(document,{subjectId:'person',subjectGeneration:2,subjectKind:'humanoid',availableAnchors:['eye','follow-pivot','shoulder-eye'],headingAvailable:true,body:{minimumHeightMeters:0,maximumHeightMeters:1.8}});
 const pose={positionWorldMetersXYZ:[0,1,2],pivotWorldMetersXYZ:[0,1,0],lookAtWorldMetersXYZ:[0,1,0],quaternionWorldXYZW:[0,0,0,1],upWorldXYZ:[0,1,0],lens:resolved.values.lens,visibility:'preserve-framing',nominalDistanceMeters:8.8,
  composition:{nominalAimQuaternionWorldXYZW:[0,0,0,1],relativeAimQuaternionXYZW:[0,0,0,1],referenceQuaternionWorldXYZW:[0,0,0,1]}} as const;
 const inspection:CameraInspection={mode:'follow',document,documentHash:'a'.repeat(64),resolved,configurationRevision:3,cameraCommitRevision:4,
  current:{...pose,simulationTick:10,lifecycleGeneration:1,configurationRevision:3,cameraCommitRevision:4,logicalTargetId:'person',resolvedSubjectId:'person',subjectGeneration:2,viewId},
  desired:{...pose,positionWorldMetersXYZ:[0,1,8.8]},intent:{yawRadians:0,pitchRadians:0,distanceMeters:8.8,secondsSinceOrbit:1},
  transition:{kind:'none',configuredDurationSeconds:0,effectiveDurationSeconds:0},adaptations:[],
  diagnostics:{status:'measured',simulationTick:10,phase:'constrained',limited:true,safeDistanceMeters:2,effectiveDistanceMeters:2,colliderEntityId:'wall'}};
 const snapshot={simulationTick:10,worldRevision:5,isRunning:true,controlledEntityId:'person',errors:[] as RuntimeError[]};
 return {inspection,snapshot};
}
function read(inspection:CameraInspection,snapshot=fixture().snapshot){return inspectDebugCamera({inspectCamera:()=>inspection,snapshot:()=>snapshot});}
const querySample=(source:CameraCollisionProbeSample['source'],sampleId:number,simulationTick=10):CameraCollisionProbeSample=>({
 source,sampleId,simulationTick,droppedProbes:0,
 probes:[{from:[0,1,8],to:[0,1,0],radius:.2,hit:{distanceMeters:4,colliderEntityId:'wall',normalWorldXYZ:[0,0,1]}}],
});
function freeze(value:unknown):void{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}}

it('reads public observations once and returns detached compact state without changing the world',()=>{
 const {inspection,snapshot}=fixture();freeze(inspection);freeze(snapshot);
 const before=JSON.stringify({inspection,snapshot});
 const world={inspectCamera:vi.fn(()=>inspection),snapshot:vi.fn(()=>snapshot),step:vi.fn(),stop:vi.fn(),render:vi.fn(),setCameraCollisionDiagnosticsEnabled:vi.fn()};
 const first=inspectDebugCamera(world),second=inspectDebugCamera(world);
 expect(first).toEqual(second);expect(world.inspectCamera).toHaveBeenCalledTimes(2);expect(world.snapshot).toHaveBeenCalledTimes(2);
 for(const mutation of [world.step,world.stop,world.render,world.setCameraCollisionDiagnosticsEnabled])expect(mutation).not.toHaveBeenCalled();
 expect(first).toMatchObject({source:'committed-camera',sample:{simulationTick:10,cameraFrameStatus:'current'},identity:{documentHash:'a'.repeat(64),subjectGeneration:2,configurationRevision:3,cameraCommitRevision:4},desired:{armDistanceMeters:8.8},current:{armDistanceMeters:2},collision:{phase:'constrained',limited:true,colliderEntityId:'wall'}});
 expect(first).not.toHaveProperty('document');expect(first).not.toHaveProperty('resolved');expect(JSON.stringify(first).length).toBeLessThan(3500);
 expect(Reflect.set(first.current!.eyeWorldMetersXYZ,0,99)).toBe(true);
 expect(JSON.stringify({inspection,snapshot})).toBe(before);
});

it('measures roll against the composed reference up instead of world Y',()=>{
 const {inspection}=fixture();
 const reference=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),.9);
 const rotation=reference.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),.3));
 const result=read({...inspection,current:{...inspection.current!,quaternionWorldXYZW:rotation.toArray(),composition:{...inspection.current!.composition!,referenceQuaternionWorldXYZW:reference.toArray()}}});
 expect(result.relativeRoll.status).toBe('measured');
 if(result.relativeRoll.status==='measured')expect(result.relativeRoll.degrees).toBeCloseTo(.3*180/Math.PI,8);
});

it.each([-1,1])('marks a pole as unavailable rather than inventing zero roll (%s)',sign=>{
 const {inspection}=fixture();const rotation=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),sign*Math.PI/2);
 const result=read({...inspection,current:{...inspection.current!,quaternionWorldXYZW:rotation.toArray()}});
 expect(result.relativeRoll).toMatchObject({status:'unavailable',reason:'view-parallel-to-reference-up'});
 expect(result.relativeRoll).not.toHaveProperty('degrees');
});

it('uses the declared world-up reference in first person without a composition frame',()=>{
 const {inspection}=fixture('first-person');const {composition:_,...current}=inspection.current!;
 const result=read({...inspection,current:{...current,quaternionWorldXYZW:new Quaternion().setFromAxisAngle(new Vector3(0,0,1),-.2).toArray()}});
 expect(result.relativeRoll.status).toBe('measured');
 if(result.relativeRoll.status==='measured')expect(result.relativeRoll.degrees).toBeCloseTo(-.2*180/Math.PI,8);
});

it('does not invent an authored reference or a missing camera frame',()=>{
 const {inspection}=fixture();const {composition:_,...current}=inspection.current!;
 expect(read({...inspection,mode:'authored',current}).relativeRoll).toEqual({status:'unavailable',reason:'reference-up-unavailable'});
 const {current:_current,desired:_desired,...empty}=inspection;
 expect(read(empty)).toMatchObject({sample:{cameraFrameStatus:'unavailable'},current:null,desired:null,relativeRoll:{status:'unavailable',reason:'camera-not-committed'}});
});

it('distinguishes disabled capture from enabled capture awaiting its first sample',()=>{
 const {inspection}=fixture();
 expect(read(inspection).queries).toEqual({status:'not-sampled'});
 expect(read({...inspection,collisionQueries:{}}).queries).toEqual({status:'awaiting-sample'});
});

it('uses only the newest source and does not revive fixed contacts after an empty presentation',()=>{
 const {inspection}=fixture();const fixed=querySample('fixed',7),presentation={...querySample('presentation',8),probes:[]};
 expect(read({...inspection,collisionQueries:{fixed,presentation}}).queries).toMatchObject({status:'sampled',source:'presentation',sampleId:8,stale:false,capturedProbeCount:0,lastCapturedContact:null});
 const newestFixed={...fixed,sampleId:9};
 expect(read({...inspection,collisionQueries:{fixed:newestFixed,presentation}}).queries).toMatchObject({source:'fixed',lastCapturedContact:{normalWorldXYZ:[0,0,1]}});
});

it('marks older collision queries and committed frames stale without relabelling their tick',()=>{
 const {inspection,snapshot}=fixture();
 const result=read({...inspection,collisionQueries:{fixed:querySample('fixed',7,10)}},{...snapshot,simulationTick:11});
 expect(result.sample).toMatchObject({simulationTick:11,cameraSimulationTick:10,cameraFrameStatus:'stale'});
 expect(result.collision).toMatchObject({simulationTick:10,stale:true});
 expect(result.queries).toMatchObject({simulationTick:10,stale:true,identityScope:'simulation-tick'});
 expect(read({...inspection,mode:'authored',collisionQueries:{fixed:querySample('fixed',7)}}).queries).toMatchObject({stale:true});
});

it('preserves truncation and a missing last-contact normal instead of borrowing another hit',()=>{
 const {inspection}=fixture(),sample=querySample('fixed',7);
 const probes=[...sample.probes,{...sample.probes[0]!,hit:{distanceMeters:2,colliderEntityId:'other'}}];
 const result=read({...inspection,collisionQueries:{fixed:{...sample,probes,droppedProbes:20}}});
 expect(result.queries).toMatchObject({droppedProbes:20,capturedProbeCount:2,lastCapturedContact:{colliderEntityId:'other',normalWorldXYZ:null}});
 expect(result.queries).not.toHaveProperty('probes');
});

it('returns recent errors with an explicit omitted count and keeps the camera failure separate',()=>{
 const {inspection,snapshot}=fixture();
 const errors=Array.from({length:7},(_,index)=>({code:`ERROR_${index}`,message:'Test',category:'runtime' as const,phase:'fixed-update',entityIds:['person']}));
 const result=read({...inspection,failure:errors[0]!},{...snapshot,errors});
 expect(result.errors.world).toHaveLength(5);expect(result.errors.world[0]!.code).toBe('ERROR_2');
 expect(result.errors.omittedWorldErrors).toBe(2);expect(result.errors.camera?.code).toBe('ERROR_0');
});
