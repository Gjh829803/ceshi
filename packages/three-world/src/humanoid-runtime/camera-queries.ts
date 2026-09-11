import RAPIER from '@dimforge/rapier3d-compat';
import type { CameraCollisionProbeResult } from '@whitebox-world/camera-collision';
import type { Vec3 } from '../contracts';
import {contactColliderVolume} from '../physics-box';

const identity = { x:0,y:0,z:0,w:1 };
/** Query adaptation only. World.castShape normal1/witness1 are world-space in Rapier 0.20. */
export function probeHumanoidCamera(
  world: RAPIER.World, from: Vec3, to: Vec3, radius: number,
  exclude?: RAPIER.Collider, predicate?: (collider: RAPIER.Collider)=>boolean,
  targetDistance=0,
): CameraCollisionProbeResult {
  const start={x:from[0],y:from[1],z:from[2]},shape=new RAPIER.Ball(radius);
  const collider=world.intersectionWithShape(start,identity,shape,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,exclude,undefined,predicate);
  if(collider){
    const contact=contactColliderVolume(collider,shape,start,identity,0);
    if(contact&&contact.distance<=0)return {distanceMeters:0,colliderEntityId:String(collider.handle),startedOverlapping:true,
      normalWorldXYZ:[contact.normal1.x,contact.normal1.y,contact.normal1.z],penetrationDepthMeters:-contact.distance};
  }
  const dx=to[0]-from[0],dy=to[1]-from[1],dz=to[2]-from[2],length=Math.hypot(dx,dy,dz);
  if(length<=1e-12)return {distanceMeters:0};
  const hit=world.castShape(start,identity,{x:dx/length,y:dy/length,z:dz/length},shape,targetDistance,length,true,
    RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,exclude,undefined,predicate);
  return hit?{distanceMeters:hit.time_of_impact,colliderEntityId:String(hit.collider.handle),
    normalWorldXYZ:[hit.normal1.x,hit.normal1.y,hit.normal1.z],
    hitPositionWorldMetersXYZ:[hit.witness1.x,hit.witness1.y,hit.witness1.z],startedOverlapping:false,penetrationDepthMeters:0}
    :{distanceMeters:length};
}
