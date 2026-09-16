import {Quaternion,Vector3} from 'three';
import type {CameraCollisionProbeSample,CameraInspection,RuntimeError,WorldSnapshot} from '../index.js';

type CameraPose=NonNullable<CameraInspection['current']>|NonNullable<CameraInspection['desired']>;
type CameraReader={
 inspectCamera():CameraInspection;
 snapshot():Pick<WorldSnapshot,'simulationTick'|'worldRevision'|'isRunning'|'controlledEntityId'|'errors'>;
};

function poseSummary(pose:CameraPose|undefined){
 return pose?{
  eyeWorldMetersXYZ:pose.positionWorldMetersXYZ,
  pivotWorldMetersXYZ:pose.pivotWorldMetersXYZ,
  armDistanceMeters:new Vector3(...pose.positionWorldMetersXYZ).distanceTo(new Vector3(...pose.pivotWorldMetersXYZ)),
  nominalDistanceMeters:pose.nominalDistanceMeters,
 }:null;
}

function relativeRoll(inspection:CameraInspection){
 const current=inspection.current;
 if(!current)return {status:'unavailable' as const,reason:'camera-not-committed'};
 let referenceUp:Vector3|undefined;
 if(current.composition)referenceUp=new Vector3(0,1,0).applyQuaternion(new Quaternion(...current.composition.referenceQuaternionWorldXYZW));
 else if(inspection.mode!=='authored'){
  const reference=inspection.resolved?.values.orientation.referenceFrame;
  if(reference==='world-up'||reference==='subject-heading')referenceUp=new Vector3(0,1,0);
  else if(reference==='subject-up'&&current.subject?.semanticQuaternionWorldXYZW)
   referenceUp=new Vector3(0,1,0).applyQuaternion(new Quaternion(...current.subject.semanticQuaternionWorldXYZW));
 }
 if(!referenceUp)return {status:'unavailable' as const,reason:'reference-up-unavailable'};
 const rotation=new Quaternion(...current.quaternionWorldXYZW),back=new Vector3(0,0,1).applyQuaternion(rotation);
 const up=referenceUp.clone().addScaledVector(back,-referenceUp.dot(back));
 if(up.lengthSq()<1e-8)return {status:'unavailable' as const,reason:'view-parallel-to-reference-up',referenceUpWorldXYZ:referenceUp.toArray()};
 up.normalize();
 const horizontalRight=up.clone().cross(back).normalize(),right=new Vector3(1,0,0).applyQuaternion(rotation);
 return {status:'measured' as const,degrees:Math.atan2(right.dot(up),right.dot(horizontalRight))*180/Math.PI,referenceUpWorldXYZ:referenceUp.toArray()};
}

function probeSummary(inspection:CameraInspection,simulationTick:number){
 const queries=inspection.collisionQueries;
 if(!queries)return {status:'not-sampled' as const};
 // The newest source is authoritative, including an empty presentation sample.
 const sample=[queries.fixed,queries.presentation].filter((value):value is CameraCollisionProbeSample=>!!value)
  .sort((a,b)=>b.sampleId-a.sampleId)[0];
 if(!sample)return {status:'awaiting-sample' as const};
 const contact=[...sample.probes].reverse().find(probe=>{
  const distance=new Vector3(...probe.from).distanceTo(new Vector3(...probe.to));
  return probe.hit.startedOverlapping||probe.hit.colliderEntityId!==undefined||probe.hit.distanceMeters<distance-1e-8;
 });
 return {
  status:'sampled' as const,source:sample.source,sampleId:sample.sampleId,simulationTick:sample.simulationTick,
  stale:sample.simulationTick!==simulationTick||inspection.mode==='authored',identityScope:'simulation-tick' as const,
  capturedProbeCount:sample.probes.length,droppedProbes:sample.droppedProbes,
  lastCapturedContact:contact?{
   colliderEntityId:contact.hit.colliderEntityId??null,normalWorldXYZ:contact.hit.normalWorldXYZ??null,
   hitPositionWorldMetersXYZ:contact.hit.hitPositionWorldMetersXYZ??null,
   distanceMeters:contact.hit.distanceMeters,probeRadiusMeters:contact.radius,
   startedOverlapping:contact.hit.startedOverlapping??false,
  }:null,
 };
}

const errorSummary=(error:RuntimeError)=>({code:error.code,message:error.message,category:error.category,entityIds:error.entityIds});

/** Read public SDK observations once; no rendering, sampling toggles or state writes. */
export function inspectDebugCamera(world:CameraReader){
 const snapshot=world.snapshot(),inspection=world.inspectCamera(),current=inspection.current,diagnostics=inspection.diagnostics;
 return structuredClone({
  schemaVersion:1,source:'committed-camera' as const,
  sample:{simulationTick:snapshot.simulationTick,worldRevision:snapshot.worldRevision,isRunning:snapshot.isRunning,
   cameraSimulationTick:current?.simulationTick??null,
   cameraFrameStatus:!current?'unavailable':current.simulationTick===snapshot.simulationTick?'current':'stale'},
  identity:{mode:inspection.mode,controlledEntityId:snapshot.controlledEntityId??null,
   logicalTargetId:current?.logicalTargetId??inspection.document?.binding.targetEntityId??null,
   resolvedSubjectId:current?.resolvedSubjectId??null,subjectGeneration:current?.subjectGeneration??null,
   lifecycleGeneration:current?.lifecycleGeneration??null,viewId:current?.viewId??null,viewKind:inspection.resolved?.kind??null,
   documentHash:inspection.documentHash??null,configurationRevision:inspection.configurationRevision,cameraCommitRevision:inspection.cameraCommitRevision},
  desired:poseSummary(inspection.desired),current:poseSummary(current),relativeRoll:relativeRoll(inspection),
  orbit:inspection.intent?{yawRadians:inspection.intent.yawRadians,pitchRadians:inspection.intent.pitchRadians,distanceMeters:inspection.intent.distanceMeters}:null,
  collision:diagnostics?{...diagnostics,stale:diagnostics.simulationTick!==snapshot.simulationTick||inspection.mode==='authored'}:{status:'unavailable'},
  queries:probeSummary(inspection,snapshot.simulationTick),
  errors:{camera:inspection.failure?errorSummary(inspection.failure):null,
   world:snapshot.errors.slice(-5).map(errorSummary),omittedWorldErrors:Math.max(0,snapshot.errors.length-5)},
 });
}
