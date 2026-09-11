import {Quaternion,Vector3} from 'three';
import type {VehicleState} from '../../simulation';
import type {EnvironmentQueries} from '../../environment/queries';
import {dragonGround,dragonGroundClear,dragonLandingSurface,dragonProbes} from './ground';

export interface DragonSummon {
  phase:'flying'|'landing'|'arrived'|'blocked';
  waypoints:[number,number,number][];
  target:[number,number,number];
  yaw:number;
  elapsed:number;
  stalled:number;
  message:string;
}
const up=new Vector3(0,1,0);
/** 仅规划意图；不移动人物、不生成副本，也不接管时钟或相机。 */
export function planDragonSummon(v:VehicleState,q:EnvironmentQueries,person:Vector3,yaw:number):DragonSummon|string {
  const state=v.motion.flyingCreature!,g=dragonGround(v);
  if(state.summon&&['flying','landing'].includes(state.summon.phase))return '飞龙已经在赶来，请等待降落';
  if(!['airborne','grounded'].includes(state.groundPhase))return '飞龙正在起降，请稍后召唤';
  const bodyRadius=Math.max(...dragonProbes(v,0).map(p=>Math.hypot(...p.center)+p.radius));
  const spacing=Math.max(6,Math.abs(g.support[0]),Math.abs(g.support[1]))+2;
  for(const turn of [0,Math.PI/2,-Math.PI/2,Math.PI])for(const side of [-1,1]) {
    const heading=yaw+turn;
    const p=person.clone().add(new Vector3(side*spacing,0,12-g.seat[2]).applyAxisAngle(up,heading));p.y+=40;
    const candidate={...v,position:p,rotation:new Quaternion().setFromAxisAngle(up,heading),yaw:heading};
    const floor=dragonLandingSurface(candidate,q);if(floor===null)continue;
    const target=new Vector3(p.x,floor+g.rootHeight,p.z);
    if(!dragonGroundClear(candidate,q,target))continue;
    // 继续验证巡航和下降通道；登乘仍由真实鞍侧净空检查接管。
    const probes=dragonProbes(v,0);
    for(const extraHeight of [0,35,80]) {
      const height=Math.max(v.position.y+8,target.y+bodyRadius+12)+extraHeight;
      const first=new Vector3(v.position.x,height,v.position.z),last=new Vector3(p.x,height,p.z);
      if(height+bodyRadius>=q.map.bounds.max[1])continue;
      // 巡航横移采用包住核心的球验证，给转身保留空间。
      if(q.sweepActorSphere(first,last,bodyRadius,v.spec.id))continue;
      const rise=state.groundPhase==='grounded'?v.position.clone().addScaledVector(up,8):v.position;
      if(probes.some(probe=>{
        const offset=new Vector3(...probe.center).applyQuaternion(v.rotation);
        return q.sweepActorSphere(rise.clone().add(offset),first.clone().add(offset),probe.radius,v.spec.id)!==null;
      }))continue;
      const above=target.clone().addScaledVector(up,6);
      if(probes.some(probe=>{
        const offset=new Vector3(...probe.center).applyQuaternion(candidate.rotation);
        return q.sweepActorSphere(last.clone().add(offset),above.clone().add(offset),probe.radius,v.spec.id)!==null;
      }))continue;
      return {phase:'flying',waypoints:[first.toArray(),last.toArray(),above.toArray()],target:target.toArray(),yaw:heading,elapsed:0,stalled:0,message:'飞龙正在飞来'};
    }
  }
  return '附近没有安全的飞行路线和降落空间，请到开阔地重新召唤';
}
