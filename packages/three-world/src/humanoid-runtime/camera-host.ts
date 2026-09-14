import {mountedRiderOffset} from './motion-families/aircraft/wearable-flight';
import * as THREE from 'three';
import type { CameraDocument } from '../config/camera/index';
import type { CameraInspection } from '../camera/state';
import type { CameraSubjectFacts } from '../camera/subject';
import type { CameraFollowOptions,CameraState } from '../contracts';
import type { Simulation } from './simulation';
import type { EnvironmentQueries } from './environment/queries';
import { probeHumanoidCamera } from './camera-queries';
import { VehicleCameraQueries } from './vehicle-camera-queries';

/** Native camera requests forwarded to the World owner. */
export interface HumanoidCameraRequests {
 assertExternalMutation():void;
 follow(options:CameraFollowOptions):void;
 view(id:string,cut?:boolean):void;
 authored():void;
 inspect():CameraInspection;
 snapshot():CameraState;
 forward():readonly [number,number,number];
 changed():void;
}
export function sampleHumanoidCameraSubject(simulation:Simulation,binding:CameraDocument['binding'],generation:(id:string)=>number|undefined,objects:ReadonlyMap<string,THREE.Object3D>,display:boolean,eye:(id:string,target:THREE.Vector3)=>boolean):CameraSubjectFacts|undefined {
 const actor=simulation.actors.get(binding.targetEntityId);
 const vehicle=actor&&binding.mountTarget!=='actor'?actor.vehicle:simulation.vehicles.find(v=>v.spec.id===binding.targetEntityId);
 const id=vehicle?.spec.id??binding.targetEntityId,gen=generation(id);
 if(gen===undefined||(!actor&&!vehicle))return;
 const object=objects.get(id);
 const mounted=actor&&!actor.dragonTransition?actor.vehicle:undefined;
 const poseVehicle=vehicle??mounted;
 const rotation=poseVehicle?poseVehicle.rotation.clone().normalize():new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),actor!.player.yaw);
 const position=vehicle?vehicle.position.clone():mounted?mounted.position.clone().add(new THREE.Vector3(...mountedRiderOffset(mounted)).applyQuaternion(rotation)):actor!.player.position.clone();
 if(display&&object){position.copy(object.getWorldPosition(new THREE.Vector3()));rotation.copy(object.getWorldQuaternion(new THREE.Quaternion()).normalize());}
 const body=vehicle?{minimumHeightMeters:vehicle.spec.envelope.offset[1]-vehicle.spec.envelope.halfExtents[1],maximumHeightMeters:vehicle.spec.envelope.offset[1]+vehicle.spec.envelope.halfExtents[1]}:{minimumHeightMeters:0,maximumHeightMeters:actor!.controller.capsuleHeight};
 const seatVehicle=vehicle??actor?.vehicle;
 const seatObject=display&&seatVehicle?objects.get(seatVehicle.spec.id):undefined;
 const seatRotation=seatObject?seatObject.getWorldQuaternion(new THREE.Quaternion()).normalize():seatVehicle?.rotation;
 const seatPosition=seatObject?seatObject.getWorldPosition(new THREE.Vector3()):seatVehicle?.position;
 const seat=seatVehicle?new THREE.Vector3(...mountedRiderOffset(seatVehicle)).applyQuaternion(seatRotation!).add(seatPosition!):undefined;
 const eyePoint=new THREE.Vector3();
 const hasAnimatedEye=!!(poseVehicle&&actor&&eye(actor.id,eyePoint));
 if(!hasAnimatedEye){
  if(poseVehicle)eyePoint.copy(seat!).add(new THREE.Vector3(0,poseVehicle.spec.characterPose==='stand'?1.55:.72,.08).applyQuaternion(seatRotation!));
  else eyePoint.copy(position).add(new THREE.Vector3(0,actor!.controller.swimming?1.35:Math.max(.18,actor!.controller.capsuleHeight-.12),0));
 }
 const shoulderEye=eyePoint.clone();
 if(!poseVehicle)shoulderEye.copy(position).add(new THREE.Vector3(0,actor!.controller.swimming?1.35:Math.max(.25,actor!.controller.capsuleHeight-.2),0));
 else if(!hasAnimatedEye)shoulderEye.sub(new THREE.Vector3(0,0,.08).applyQuaternion(seatRotation!));
 if(poseVehicle?.spec.mode==='tank')shoulderEye.set(0,4.35,-1.2).applyQuaternion(seatRotation!).add(seatPosition!);
 const wearable=vehicle?.motion.aircraft?.wearable;
 const followPivot=vehicle?wearable?position.clone().add(new THREE.Vector3(0,1+wearable.seated*1.1,0)):undefined:position.clone().add(new THREE.Vector3(0,actor!.controller.swimming?1.4:actor!.controller.capsuleHeight*.655,0));
 return {...(poseVehicle?.motion.aircraft&&!poseVehicle.motion.aircraft.wearable&&poseVehicle.motion.aircraft.subtype!=='balloon'?{continuousHeadingSeedRadians:poseVehicle.yaw+Math.PI}:{}),id,generation:gen,kind:vehicle?'vehicle':'humanoid',states:{swimming:!!actor&&!poseVehicle&&actor.controller.swimming},positionWorldMetersXYZ:position.toArray(),geometryQuaternionWorldXYZW:rotation.toArray(),geometryScaleXYZ:[1,1,1],semanticQuaternionWorldXYZW:rotation.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI)).toArray(),...(wearable?{preferredOrbitPitchRadians:wearable.seated>.5?.25:.2}:{}),shoulderEyeWorldMetersXYZ:shoulderEye.toArray(),...(followPivot?{followPivotWorldMetersXYZ:followPivot.toArray()}:{}),speedMetersPerSecond:(poseVehicle?.velocity??actor!.player.velocity).length(),body,eyeWorldMetersXYZ:eyePoint.toArray(),...(seat?{seatWorldMetersXYZ:seat.toArray()}:{})};
}
/** Native query policy and refined vehicle surfaces; returned distances contain no padding. */
export class HumanoidCameraGeometry {
 private readonly vehicles:VehicleCameraQueries;
 constructor(vehicles:readonly {instanceId:string;object:THREE.Object3D}[]){this.vehicles=new VehicleCameraQueries(vehicles);}
 bind(environment:EnvironmentQueries,simulation:Simulation,subject:CameraSubjectFacts){
  this.vehicles.sync(environment.cameraFallbackBounds());
  const capsule=simulation.actors.get(subject.id)?.controller.capsule;
  const world=environment.borrowPhysics().world;
  let filterRevision=-1,filter:((collider:import('@dimforge/rapier3d-compat').Collider)=>boolean)|undefined;
  const probe=(from:readonly [number,number,number],to:readonly [number,number,number],radius:number)=>{
   // Refine current candidates before excluding their movement envelopes. Each
   // probe may reach a different vehicle or discover a whole-vehicle fallback.
   const refined=this.vehicles.probe(from,to,radius,subject.id);
   if(filterRevision!==this.vehicles.refinementRevision){
    const excluded=new Set(this.vehicles.refinedActorIds);excluded.add(subject.id);
    const baseFilter=environment.cameraFilter(excluded);
    filter=collider=>baseFilter(collider)&&environment.colliderId(collider.handle)!==subject.id;
    filterRevision=this.vehicles.refinementRevision;
   }
   const raw=probeHumanoidCamera(world,from,to,radius,capsule,filter,0);
   const hit={...raw,...(raw.colliderEntityId?{colliderEntityId:environment.colliderId(Number(raw.colliderEntityId))}:{})};
   return refined.startedOverlapping||refined.distanceMeters<hit.distanceMeters?refined:hit;
  };
  return {probe,...(capsule?{isSubjectVisible:(eye:readonly [number,number,number])=>{
   const height=subject.body!.maximumHeightMeters,radius=(capsule.shape as import('@dimforge/rapier3d-compat').Capsule).radius;
   const position=subject.positionWorldMetersXYZ;
   for(const ratio of [1,0,.5,.25,.75,.125,.875,.375,.625]){
    const y=.001+(height-.002)*ratio;
    const capOffset=Math.max(radius-y,y-(height-radius),0);
    const ringRadius=Math.sqrt(Math.max(0,radius*radius-capOffset*capOffset))*.999;
    for(let sample=0;sample<9;sample++){
     const angle=(sample-1)*Math.PI/4,r=sample===0?0:ringRadius;
     const target:readonly [number,number,number]=[position[0]+Math.cos(angle)*r,position[1]+y,position[2]+Math.sin(angle)*r];
     const travel=Math.hypot(...target.map((v,i)=>v-eye[i]!)),hit=probe(eye,target,0);
     if(!hit.startedOverlapping&&hit.distanceMeters>=travel*.99999)return true;
    }
   }
   return false;
  }}:{})};
 }
 dispose():void{this.vehicles.dispose();}
}
