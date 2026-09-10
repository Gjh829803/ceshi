import {resetFamilyAuxiliaryState} from '../motion-families/registry';
import {createCreatureState} from '../motion-families/ground-vehicle/physics-state';
import {createFlyingCreatureStateV1} from '../motion-families/flying-creature/state';
import {CREATURE_COLLISION_PROBES} from '../motion-families/flying-creature/collision-probes';
import {tankBarrel} from '../motion-families/ground-vehicle/tank';
import { Quaternion, Vector3 } from 'three';
import { vehicleImpactMass,type VehicleSpec } from '../config';
import { vehicleBody, type EnvironmentQueries, type MoveResult, type QueryBody } from '../environment/queries';
import type { Input, VehicleState } from '../simulation';
import type { CreatureState } from './types';

export const CARRIAGE_TOW_DISTANCE = 4.8;
export const LEAD_HORSE_BODY = {kind:'box' as const,halfExtents:[.8,1.65,1.9] as const,offset:[0,1.65,0] as const};
const UP=new Vector3(0,1,0);
const MAX_ARTICULATION=Math.PI*65/180;
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const approach=(a:number,b:number,amount:number)=>a+clamp(b-a,-amount,amount);
const angleDelta=(a:number,b:number)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
const heading=(yaw:number)=>new Vector3(Math.sin(yaw),0,Math.cos(yaw));
const rotationAt=(yaw:number)=>new Quaternion().setFromAxisAngle(UP,yaw);
export function resetCreatureState(v:VehicleState){resetFamilyAuxiliaryState(v);}

/** The lead horse is a separate occupied body, also useful for boarding/exit checks. */
export function creatureBodies(v:VehicleState):{position:Vector3;rotation:Quaternion;body:QueryBody}[]{
  if(v.motion.flyingCreature)return CREATURE_COLLISION_PROBES.map(p=>({position:v.position,rotation:v.rotation,body:{kind:"capsule" as const,radius:p.radius,height:p.radius*2,offset:p.center}}));
  const parts=[{position:v.position,rotation:v.rotation,body:vehicleBody(v.spec)}];
  if(v.motion.tank)parts.push(tankBarrel(v));
  if(v.spec.mode==='carriage'){
    const state=v.motion.creature??createCreatureState(v.spec,v.position,v.rotation,v.yaw);
    parts.push({position:state.leadPosition!,rotation:rotationAt(state.leadYaw!),body:LEAD_HORSE_BODY});
  }
  return parts;
}
function bodyBounds(position:Vector3,body:QueryBody,rotation:Quaternion){
  const center=new Vector3(...body.offset).applyQuaternion(rotation).add(position),extent=new Vector3();
  if(body.kind==='capsule')extent.set(body.radius,body.height/2,body.radius);
  else for(let axis=0;axis<3;axis++){
    const side=new Vector3().setComponent(axis,body.halfExtents[axis]!).applyQuaternion(rotation);
    extent.add(new Vector3(Math.abs(side.x),Math.abs(side.y),Math.abs(side.z)));
  }
  return {center,extent};
}
function clearBody(position:Vector3,body:QueryBody,rotation:Quaternion,q:EnvironmentQueries){
  const {center,extent}=bodyBounds(position,body,rotation);
  for(let axis=0;axis<3;axis++)if(center.getComponent(axis)-extent.getComponent(axis)<q.map.bounds.min[axis]!-1e-5||center.getComponent(axis)+extent.getComponent(axis)>q.map.bounds.max[axis]!+1e-5)return false;
  return !q.overlaps(position,body,rotation);
}
export function canPlaceCreature(v:VehicleState,q:EnvironmentQueries){return creatureBodies(v).every(p=>clearBody(p.position,p.body,p.rotation,q));}
