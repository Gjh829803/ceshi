import {Quaternion,Vector3} from 'three';
import type {VehicleState} from '../../simulation';
import type {EnvironmentQueries} from '../../environment/queries';
import {CREATURE_COLLISION_PROBES} from './collision-probes';
import {DEFAULT_DRAGON_GROUND} from './ground-default';

export interface FlyingCreatureGround {
  rootHeight:number;
  seat:[number,number,number];
  probes:readonly {id:string;center:readonly [number,number,number];radius:number}[];
  /** 落地姿态 x/z 范围；用于拒绝窄平台、陡坡与水面。 */
  support:[number,number,number,number];
  landingSeconds:number;
  takeoffSeconds:number;
}
export const dragonGround=(v:VehicleState)=>v.spec.flyingCreatureGround??DEFAULT_DRAGON_GROUND;
export function dragonProbes(v:VehicleState,blend=v.motion.flyingCreature?.groundBlend??0){
  const air=v.spec.flyingCreatureCollision??CREATURE_COLLISION_PROBES;
  if(blend<=0)return air;
  const ground=dragonGround(v).probes;if(blend>=1)return ground;
  return air.map((a,i)=>{const b=ground[i%ground.length]!;return {id:a.id,center:new Vector3(...a.center).lerp(new Vector3(...b.center),blend).toArray(),radius:a.radius+(b.radius-a.radius)*blend};});
}
export function dragonLandingSurface(v:VehicleState,q:EnvironmentQueries):number|null{
  const g=dragonGround(v),[xmin,xmax,zmin,zmax]=g.support;
  const points=[[0,0],[(xmin+xmax)/2,(zmin+zmax)/2],[xmin*.8,zmin*.8],[xmax*.8,zmin*.8],[xmin*.8,zmax*.8],[xmax*.8,zmax*.8]];
  let height:number|undefined;
  for(const [x,z] of points){
    const p=new Vector3(x,0,z).applyAxisAngle(new Vector3(0,1,0),v.yaw).add(v.position);p.y+=1;
    const support=q.standingSupport(p,85,Math.PI/7),water=q.waterAt(p);
    if(!support||water&&water.surface>support.height+.01)return null;
    if(height!==undefined&&Math.abs(height-support.height)>.18)return null;
    height=support.height;
  }
  return height??null;
}
export function requestDragonLanding(v:VehicleState,q:EnvironmentQueries):boolean{
  const s=v.motion.flyingCreature!;
  if(s.groundPhase==='approach'){s.groundPhase='airborne';s.groundBlend=0;s.groundSeconds=0;return true;}
  if(s.groundPhase==='landing'){s.groundPhase='takeoff';s.groundSeconds=0;return true;}
  if(s.groundPhase!=='airborne'||dragonLandingSurface(v,q)===null)return false;
  s.groundPhase='approach';s.groundSeconds=0;s.groundFailure='';return true;
}
export function dragonGroundClear(v:VehicleState,q:EnvironmentQueries,position:Vector3):boolean{
  const rotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),v.yaw);
  return dragonGround(v).probes.every(p=>!q.bodyOverlap({position,rotation,body:{kind:'capsule',radius:p.radius,height:p.radius*2,offset:p.center}},{excludedActorIds:new Set([v.spec.id])}));
}
