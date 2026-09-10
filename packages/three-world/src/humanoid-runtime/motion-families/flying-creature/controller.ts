import { Euler,Quaternion,Vector3 } from 'three';
import type { VehicleSpec } from '../../config';
import type { EnvironmentQueries } from '../../environment/queries';
import type { Input,VehicleState } from '../../simulation';
import { CREATURE_COLLISION_PROBES } from './collision-probes';
import { commitFlyingCreatureCollisionV1,compileFlyingCreatureCommandV1,stepFlyingCreatureV1 } from './flight';
import { resolveConfiguredFlyingCreatureFeel } from './state';

function sweepPose(origin:Vector3,before:Quaternion,rotation:Quaternion,delta:Vector3,q:EnvironmentQueries,actorId:string){
  const count=Math.max(1,Math.ceil(before.angleTo(rotation)/.08));
  let fraction=1;const normal=new Vector3();
  for(let step=0;step<count&&step/count<fraction;step++){
    const a=step/count,b=(step+1)/count;
    const from=before.clone().slerp(rotation,a),to=before.clone().slerp(rotation,b);
    for(const probe of CREATURE_COLLISION_PROBES){
      const p=new Vector3(...probe.center).applyQuaternion(from).add(origin).addScaledVector(delta,a);
      const end=new Vector3(...probe.center).applyQuaternion(to).add(origin).addScaledVector(delta,b);
      const hit=q.sweepActorSphere(p,end,probe.radius,actorId);
      if(hit!==null&&(step+hit.fraction)/count<fraction){fraction=(step+hit.fraction)/count;normal.copy(hit.normal);}
      for(let axis=0;axis<3;axis++){
        const start=p.getComponent(axis),finish=end.getComponent(axis),delta=finish-start;
        const limit=delta>0?q.map.bounds.max[axis]!-probe.radius-.025:q.map.bounds.min[axis]!+probe.radius+.025;
        if((delta>0&&finish>limit)||(delta<0&&finish<limit)){const hit=(step+Math.max(0,(limit-start)/delta))/count;if(hit<fraction){fraction=hit;normal.set(0,0,0).setComponent(axis,-Math.sign(delta));}}
      }
    }
  }
  return {fraction,normal};
}

/** D01 动画体积的保守扫掠体积，姿态、平移均进入同一个 Rapier 查询。 */
export function stepNativeFlyingCreature(v:VehicleState,input:Input,dt:number,q:EnvironmentQueries):void {
  if(!(dt>0)||!Number.isFinite(dt))return;
  const state=v.motion.flyingCreature!,before=v.rotation.clone(),origin=v.position.clone();
  const feel=resolveConfiguredFlyingCreatureFeel(v.spec);
  state.yawRadians=v.yaw;state.pitchRadians=v.pitch;state.bankRadians=v.roll;
  const requested=stepFlyingCreatureV1(state,compileFlyingCreatureCommandV1(input),feel,v.velocity,dt);
  const rotation=new Quaternion().setFromEuler(new Euler(-state.pitchRadians,state.yawRadians,state.bankRadians,'YXZ'));
  const hit=sweepPose(origin,before,rotation,requested.clone().multiplyScalar(dt),q,v.spec.id),fraction=hit.fraction;
  v.rotation.copy(before).slerp(rotation,fraction);
  const angles=new Euler().setFromQuaternion(v.rotation,'YXZ');
  state.pitchRadians=v.pitch=-angles.x;state.yawRadians=v.yaw=angles.y;state.bankRadians=v.roll=angles.z;
  v.velocity.copy(requested).multiplyScalar(fraction);v.position.addScaledVector(v.velocity,dt);
  if(fraction<1&&hit.normal.lengthSq()>.5){
    // 法线回弹也扫掠完整体积；给下一步转向留净空，不瞬移穿出墙角。
    const rebound=hit.normal.clone().multiplyScalar(dt*4);
    const clearance=sweepPose(v.position,v.rotation,v.rotation,rebound,q,v.spec.id);
    v.position.addScaledVector(rebound,clearance.fraction);
    v.velocity.subVectors(v.position,origin).divideScalar(dt);
  }
  commitFlyingCreatureCollisionV1(state,feel,requested,v.velocity,fraction<1);v.speed=v.velocity.length();v.launched=true;v.grounded=false;
  if(v.motion.creature){v.motion.creature.flying=true;v.motion.creature.gait=state.mode==='glide'?'glide':'flap';v.motion.creature.phase+=dt*10;}
}

/** 创建配置，不创建场景、相机、时钟或资源。模型尺寸按 D01 米制资产标定。 */
export function createFlyingCreatureSpec(id='century-dragon'):VehicleSpec {
  return {id,name:'飞龙',en:'DRAGON',mode:'dragon',kernel:'creature-flight',archetype:'dragon',color:'#527a59',
    spawn:[0,40,0],yaw:0,speed:18,maxSpeed:31,accel:7,grip:4,steer:1.4,radius:18,seat:[0,2.6,0],camera:32,
    brakeDeceleration:22,coastDeceleration:7,pitchResponse:3.4,rollResponse:5,characterPose:'ride',flyingCreature:{},
    hint:'W/S 俯冲/抬头 · A/D 转向 · Shift 加速 · Ctrl 刹停 · Space 滑翔 · E 喷火 · Q 闪避',
    envelope:{kind:'box',halfExtents:[18,15,18],offset:[0,0,0]}};
}
