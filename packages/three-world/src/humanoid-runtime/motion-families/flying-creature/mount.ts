import {Quaternion,Vector3} from 'three';
import type {MountContext} from '../../mounted-interaction';
import type {VehicleState} from '../../simulation';
import {dragonGround,dragonLandingSurface} from './ground';

export interface DragonMountTransition {
  instanceId:string;entering:boolean;duration:number;side:number;
  path:[number,number,number][];
  destination:[number,number,number];
}
const up=new Vector3(0,1,0);
export const DRAGON_RIDER_HIP_HEIGHT=.94;
export function dragonSeat(v:VehicleState){return new Vector3(...dragonGround(v).seat).applyQuaternion(v.rotation).add(v.position).addScaledVector(up,.06);}
export function dragonStandingPoint(c:MountContext,v:VehicleState,side:number):Vector3|null{
  const g=dragonGround(v),human=c.humanoid.standingQueryBody;
  if(human.kind!=='capsule')return null;
  const x=side>0?Math.max(...g.probes.map(p=>p.center[0]+p.radius)):Math.min(...g.probes.map(p=>p.center[0]-p.radius));
  const p=new Vector3(x+side*(human.radius+.18),0,g.seat[2]).applyAxisAngle(up,v.yaw).add(v.position);
  p.y=v.motion.flyingCreature!.groundHeight+.3;
  const support=c.environment.standingSupport(p,.6,Math.PI/7),water=c.environment.waterAt(p);
  if(!support||water&&water.surface>support.height+.01)return null;
  p.y=support.height+.025;
  const filter={excludedColliderHandles:new Set([c.humanoid.capsule.handle])};
  if(c.environment.bodyOverlap({position:p,rotation:new Quaternion(),body:human},filter,.025))return null;
  // 下龙落点不只是能站住，还必须能向鞍外迈出一步，避免落在墙与身体夹缝。
  const escape=p.clone().add(new Vector3(side*.8,0,0).applyAxisAngle(up,v.yaw));
  const exitSupport=c.environment.standingSupport(escape.clone().addScaledVector(up,.1),.3,Math.PI/7),exitWater=c.environment.waterAt(escape);
  if(!exitSupport||Math.abs(exitSupport.height-support.height)>.15||exitWater&&exitWater.surface>exitSupport.height+.01)return null;
  escape.y=exitSupport.height+.025;
  return c.environment.bodyPathBlocked([p,escape].map(position=>({position,rotation:new Quaternion(),body:human})),filter)?null:p;
}
export function planDragonMount(c:MountContext,v:VehicleState,entering:boolean):DragonMountTransition|string{
  const s=v.motion.flyingCreature!;
  if(s.summon&&['flying','landing'].includes(s.summon.phase))return '等待飞龙结束召唤并落稳';
  if(c.transitionSeconds>0)return '骑乘切换尚未完成';
  if(s.groundPhase!=='grounded'||!v.grounded||v.speed>.2||dragonLandingSurface(v,c.environment)===null)return '飞龙需要先在平整干燥地面落稳';
  if(entering&&!c.humanoid.canBoard)return c.humanoid.boardingReason;
  const local=c.humanoid.position.clone().sub(v.position).applyAxisAngle(up,-v.yaw);
  const sides=entering?[local.x>=0?1:-1]:[1,-1];
  for(const side of sides){
    const ground=dragonStandingPoint(c,v,side);if(!ground)continue;
    if(entering&&c.humanoid.position.distanceTo(ground)>2.5)continue;
    const seat=dragonSeat(v),stand=ground.clone().addScaledVector(up,DRAGON_RIDER_HIP_HEIGHT);
    const over=seat.clone().addScaledVector(up,.2).add(new Vector3(side*.55,0,0).applyAxisAngle(up,v.yaw));
    const path=entering?[c.humanoid.position.clone().addScaledVector(up,DRAGON_RIDER_HIP_HEIGHT),stand,over,seat]:[seat,over,stand];
    const body=c.humanoid.standingQueryBody;
    const poses=path.map(p=>({position:p.clone().sub(new Vector3(...body.offset)),rotation:new Quaternion(),body}));
    if(c.environment.bodyPathBlocked(poses,{excludedActorIds:new Set([v.spec.id]),excludedColliderHandles:new Set([c.humanoid.capsule.handle])}))continue;
    return {instanceId:v.spec.id,entering,side,duration:Math.max(2.2,Math.abs(seat.y-stand.y)/1.3+1.2),path:path.map(p=>p.toArray()),destination:ground.toArray()};
  }
  return entering?'靠近飞龙鞍座侧面，确认登乘路径没有障碍':'两侧没有安全的下龙路径和落点';
}
/** 沿经过净空检查的折线路径平滑行进；固定步与显示插值使用同一时间。 */
export function dragonMountPosition(t:DragonMountTransition,progress:number):Vector3{
  const points=t.path.map(p=>new Vector3(...p)),lengths=points.slice(1).map((p,i)=>p.distanceTo(points[i]!));
  const total=lengths.reduce((a,b)=>a+b,0),smooth=progress*progress*(3-2*progress);
  let distance=Math.max(0,Math.min(1,smooth))*total;
  for(let i=0;i<lengths.length;i++){const length=lengths[i]!;if(distance<=length)return points[i]!.lerp(points[i+1]!,length>0?distance/length:1);distance-=length;}
  return points.at(-1)!;
}
export function dragonTransitionClear(c:MountContext,t:DragonMountTransition,from:number,to:number):boolean{
  const body=c.humanoid.standingQueryBody;
  const filter={excludedActorIds:new Set([t.instanceId]),excludedColliderHandles:new Set([c.humanoid.capsule.handle])};
  const poses=[from,to].map(progress=>({position:dragonMountPosition(t,progress).sub(new Vector3(...body.offset)),rotation:new Quaternion(),body}));
  if(c.environment.bodyPathBlocked(poses,filter))return false;
  if(!t.entering&&to>=1){
    const p=new Vector3(...t.destination),support=c.environment.standingSupport(p.clone().addScaledVector(up,.08),.16,Math.PI/7);
    const water=c.environment.waterAt(p);
    if(!support||Math.abs(p.y-support.height)>.08||water&&water.surface>support.height+.01)return false;
    if(c.environment.bodyOverlap({position:p,rotation:new Quaternion(),body},{excludedColliderHandles:new Set([c.humanoid.capsule.handle])},.025))return false;
  }
  return true;
}
