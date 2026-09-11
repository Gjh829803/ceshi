import { Euler,Quaternion,Vector3 } from 'three';
import type { VehicleSpec } from '../../config';
import type { EnvironmentQueries } from '../../environment/queries';
import type { Input,VehicleState } from '../../simulation';
import { CREATURE_COLLISION_PROBES, CREATURE_COLLISION_ENVELOPE } from './collision-probes';
import { commitFlyingCreatureCollisionV1,compileFlyingCreatureCommandV1,stepFlyingCreatureV1 } from './flight';
import { resolveConfiguredFlyingCreatureFeel } from './state';
import {dragonGround,dragonProbes,dragonLandingSurface,dragonGroundClear} from './ground';

/** 召唤导航只在已有飞龙控制器内推进，复用体积扫掠和实际速度动画。 */
function stepSummon(v:VehicleState,dt:number,q:EnvironmentQueries):boolean {
  const s=v.motion.flyingCreature!,call=s.summon;
  if(!call||!['flying','landing'].includes(call.phase))return false;
  call.elapsed+=dt;
  if(call.phase==='landing'){
    if(s.groundPhase==='grounded'){call.phase='arrived';call.message='飞龙已抵达 · 靠近鞍侧按 F 上龙';}
    else if(s.groundFailure||s.groundPhase==='airborne'||call.elapsed>90){call.phase='blocked';call.message=s.groundFailure||'降落中断，请到开阔地重新召唤';}
    return false;
  }
  if(s.groundPhase==='grounded'||s.groundPhase==='takeoff')return false;
  const next=call.waypoints[0];
  if(!next){s.groundPhase='approach';s.groundFailure='';call.phase='landing';call.message='飞龙正在降落，请留出空间';return false;}
  const delta=new Vector3(...next).sub(v.position),distance=delta.length();
  const targetSpeed=Math.min(18,Math.sqrt(2*5*distance),distance*2);
  const desired=delta.clone().setLength(targetSpeed),change=desired.sub(v.velocity).clampLength(0,7*dt);
  v.velocity.add(change);
  const flat=Math.hypot(v.velocity.x,v.velocity.z),desiredYaw=call.waypoints.length===1?call.yaw:flat>.3?Math.atan2(v.velocity.x,v.velocity.z):v.yaw;
  const error=Math.atan2(Math.sin(desiredYaw-v.yaw),Math.cos(desiredYaw-v.yaw));
  const yaw=v.yaw+Math.max(-1.2*dt,Math.min(1.2*dt,error));
  const pitchTarget=call.waypoints.length===1?0:Math.max(-.25,Math.min(.25,Math.atan2(v.velocity.y,Math.max(3,flat))));
  const response=1-Math.exp(-4*dt),pitch=v.pitch+(pitchTarget-v.pitch)*response,bank=v.roll+(Math.max(-.3,Math.min(.3,-error*.25))-v.roll)*response;
  const rotation=new Quaternion().setFromEuler(new Euler(-pitch,yaw,bank,'YXZ'));
  const before=v.position.clone(),hit=sweepPose(v.position,v.rotation,rotation,v.velocity.clone().multiplyScalar(dt),q,v.spec.id,dragonProbes(v));
  v.position.addScaledVector(v.velocity,dt*hit.fraction);v.rotation.slerp(rotation,hit.fraction);
  const angles=new Euler().setFromQuaternion(v.rotation,'YXZ');v.yaw=s.yawRadians=angles.y;v.pitch=s.pitchRadians=-angles.x;v.roll=s.bankRadians=angles.z;
  v.velocity.subVectors(v.position,before).divideScalar(dt);v.speed=v.velocity.length();s.speedMetersPerSecond=v.speed;
  s.tick++;s.mode=v.speed>.5?'cruise':'hover';s.flamePhase='off';v.grounded=false;v.launched=true;
  if(v.motion.creature){v.motion.creature.flying=true;v.motion.creature.gait='flap';v.motion.creature.phase+=dt*10;}
  call.stalled=hit.fraction<.05?call.stalled+dt:0;
  if(call.stalled>1||call.elapsed>90){call.phase='blocked';call.message='召唤路线受阻，飞龙已悬停；请到开阔地重新召唤';v.velocity.set(0,0,0);v.speed=s.speedMetersPerSecond=0;return true;}
  if(distance<.15&&v.speed<.5&&(call.waypoints.length>1||Math.abs(error)<.04)){call.waypoints.shift();}
  return true;
}

function sweepPose(origin:Vector3,before:Quaternion,rotation:Quaternion,delta:Vector3,q:EnvironmentQueries,actorId:string,probes:typeof CREATURE_COLLISION_PROBES,nextProbes=probes){
  const count=Math.max(1,Math.ceil(before.angleTo(rotation)/.08));
  let fraction=1;const normal=new Vector3();
  for(let step=0;step<count&&step/count<fraction;step++){
    const a=step/count,b=(step+1)/count;
    const from=before.clone().slerp(rotation,a),to=before.clone().slerp(rotation,b);
    for(const [index,probe] of probes.entries()){
      const next=nextProbes[index%nextProbes.length]!,radius=Math.max(probe.radius,next.radius);
      const p=new Vector3(...probe.center).lerp(new Vector3(...next.center),a).applyQuaternion(from).add(origin).addScaledVector(delta,a);
      const end=new Vector3(...probe.center).lerp(new Vector3(...next.center),b).applyQuaternion(to).add(origin).addScaledVector(delta,b);
      const hit=q.sweepActorSphere(p,end,radius,actorId);
      if(hit!==null&&(step+hit.fraction)/count<fraction){fraction=(step+hit.fraction)/count;normal.copy(hit.normal);}
      for(let axis=0;axis<3;axis++){
        const start=p.getComponent(axis),finish=end.getComponent(axis),delta=finish-start;
        const limit=delta>0?q.map.bounds.max[axis]!-radius-.025:q.map.bounds.min[axis]!+radius+.025;
        if((delta>0&&finish>limit)||(delta<0&&finish<limit)){const hit=(step+Math.max(0,(limit-start)/delta))/count;if(hit<fraction){fraction=hit;normal.set(0,0,0).setComponent(axis,-Math.sign(delta));}}
      }
    }
  }
  return {fraction,normal};
}

function stepGround(v:VehicleState,input:Input,dt:number,q:EnvironmentQueries):boolean {
  const s=v.motion.flyingCreature!,g=dragonGround(v);
  if(s.groundPhase==='airborne'||s.groundPhase==='approach')return false;
  const floor=dragonLandingSurface(v,q);
  if(floor===null){s.groundFailure='落地点支撑已失效';s.groundPhase='takeoff';s.groundSeconds=0;}
  else s.groundHeight=floor;
  if(s.groundPhase==='grounded'){
    v.grounded=true;v.launched=false;v.velocity.set(0,0,0);v.speed=0;s.mode='hover';s.speedMetersPerSecond=0;s.tick++;s.groundSeconds+=dt;
    s.staminaRatio=Math.min(1,s.staminaRatio+dt*.13);s.flamePhase='off';
    if(input.jump||input.brake){
      const targetPosition=v.position.clone().add(new Vector3(0,8,0));
      const blocked=dragonProbes(v,0).some(p=>q.bodyOverlap({position:targetPosition,rotation:v.rotation,body:{kind:'capsule',radius:p.radius,height:p.radius*2,offset:p.center}},{excludedActorIds:new Set([v.spec.id])}));
      if(blocked){s.groundFailure='上方空间不足，无法起飞';return true;}
      s.groundPhase='takeoff';s.groundSeconds=0;s.groundFailure='';
    }
    else return true;
  }
  const before=v.position.clone(),old=dragonProbes(v),oldBlend=s.groundBlend;
  s.tick++;s.groundSeconds+=dt;s.flamePhase='off';s.mode='hover';
  const target=new Quaternion().setFromEuler(new Euler(0,v.yaw,0,'YXZ'));
  let dy:number;
  if(s.groundPhase==='landing'){
    const remaining=Math.max(0,v.position.y-(s.groundHeight+g.rootHeight));
    s.groundBlend=Math.max(0,Math.min(1,1-remaining/5));
    dy=-Math.min(remaining,Math.max(.5,Math.min(5,remaining*3.6/g.landingSeconds))*dt);
  }else{
    const t=Math.min(1,s.groundSeconds/g.takeoffSeconds);
    s.groundBlend=Math.min(oldBlend,1-Math.max(0,Math.min(1,(t-.4)/.6)));
    const targetY=s.groundHeight+g.rootHeight+8;
    dy=Math.max(0,Math.min(targetY-v.position.y,8/g.takeoffSeconds*dt));
  }
  const next=dragonProbes(v),delta=new Vector3(0,dy,0);
  const hit=sweepPose(v.position,v.rotation,target,delta,q,v.spec.id,old,next);
  v.position.addScaledVector(delta,hit.fraction);v.rotation.slerp(target,hit.fraction);
  s.groundBlend=oldBlend+(s.groundBlend-oldBlend)*hit.fraction;
  v.velocity.subVectors(v.position,before).divideScalar(dt);v.speed=v.velocity.length();s.speedMetersPerSecond=0;
  const angles=new Euler().setFromQuaternion(v.rotation,'YXZ');v.pitch=s.pitchRadians=-angles.x;v.roll=s.bankRadians=angles.z;
  v.grounded=false;v.launched=true;
  if(s.groundPhase==='landing'&&v.position.y<=s.groundHeight+g.rootHeight+.012&&Math.abs(v.pitch)+Math.abs(v.roll)<.02){
    s.groundPhase='grounded';s.groundSeconds=0;s.groundBlend=1;v.grounded=true;v.launched=false;v.velocity.set(0,0,0);v.speed=0;
  }else if(s.groundPhase==='takeoff'&&s.groundSeconds>=g.takeoffSeconds&&s.groundBlend<.01){
    s.groundPhase='airborne';s.groundSeconds=0;s.groundBlend=0;v.velocity.set(0,0,0);v.speed=0;
  }else if(hit.fraction<.01){
    s.groundFailure='起降路径受阻';s.collisionCount++;s.groundSeconds=Math.max(0,s.groundSeconds-dt);
    if(s.groundPhase==='takeoff'){s.groundPhase='landing';s.groundSeconds=0;}
  }
  if(v.motion.creature){v.motion.creature.flying=!v.grounded;v.motion.creature.gait=v.grounded?'graze':'flap';}
  return true;
}

/** 各实例动画体积的保守扫掠，姿态、平移均进入同一个 Rapier 查询。 */
export function stepNativeFlyingCreature(v:VehicleState,input:Input,dt:number,q:EnvironmentQueries):void {
  if(!(dt>0)||!Number.isFinite(dt))return;
  if(stepSummon(v,dt,q))return;
  if(v.motion.flyingCreature!.summon?.phase==='flying'&&v.motion.flyingCreature!.groundPhase==='grounded')input={...input,jump:true};
  if(stepGround(v,input,dt,q))return;
  const phase=v.motion.flyingCreature!.groundPhase;
  if(phase==='approach')input={...input,forward:0,steer:0,boost:false,slow:true,brake:false,primary:false,secondary:false};
  const state=v.motion.flyingCreature!,before=v.rotation.clone(),origin=v.position.clone(),probes=dragonProbes(v);
  const feel=resolveConfiguredFlyingCreatureFeel(v.spec);
  state.yawRadians=v.yaw;state.pitchRadians=v.pitch;state.bankRadians=v.roll;
  const requested=stepFlyingCreatureV1(state,compileFlyingCreatureCommandV1(input),feel,v.velocity,dt);
  const rotation=new Quaternion().setFromEuler(new Euler(-state.pitchRadians,state.yawRadians,state.bankRadians,'YXZ'));
  const hit=sweepPose(origin,before,rotation,requested.clone().multiplyScalar(dt),q,v.spec.id,probes),fraction=hit.fraction;
  v.rotation.copy(before).slerp(rotation,fraction);
  const angles=new Euler().setFromQuaternion(v.rotation,'YXZ');
  state.pitchRadians=v.pitch=-angles.x;state.yawRadians=v.yaw=angles.y;state.bankRadians=v.roll=angles.z;
  v.velocity.copy(requested).multiplyScalar(fraction);v.position.addScaledVector(v.velocity,dt);
  if(fraction<1&&hit.normal.lengthSq()>.5){
    // 法线回弹也扫掠完整体积；给下一步转向留净空，不瞬移穿出墙角。
    const rebound=hit.normal.clone().multiplyScalar(dt*4);
    const clearance=sweepPose(v.position,v.rotation,v.rotation,rebound,q,v.spec.id,probes);
    v.position.addScaledVector(rebound,clearance.fraction);
    v.velocity.subVectors(v.position,origin).divideScalar(dt);
  }
  commitFlyingCreatureCollisionV1(state,feel,requested,v.velocity,fraction<1);v.speed=v.velocity.length();v.launched=true;v.grounded=false;
  if(phase==='approach'&&v.speed<.8&&Math.abs(v.pitch)+Math.abs(v.roll)<.08){
    const floor=dragonLandingSurface(v,q),g=dragonGround(v);
    if(floor!==null&&dragonGroundClear(v,q,new Vector3(v.position.x,floor+g.rootHeight,v.position.z))){state.groundHeight=floor;state.groundPhase='landing';state.groundSeconds=0;state.groundFailure='';}
    else{state.groundPhase='airborne';state.groundFailure='落地点没有足够的平整干燥空间';}
  }
  if(v.motion.creature){v.motion.creature.flying=true;v.motion.creature.gait=state.mode==='glide'?'glide':'flap';v.motion.creature.phase+=dt*10;}
}

/** 创建配置，不创建场景、相机、时钟或资源。模型尺寸按 D01 米制资产标定。 */
export function createFlyingCreatureSpec(id='century-dragon'):VehicleSpec {
  return {id,name:'飞龙',en:'DRAGON',mode:'dragon',kernel:'creature-flight',archetype:'dragon',color:'#527a59',
    spawn:[0,40,0],yaw:0,speed:18,maxSpeed:31,accel:7,grip:4,steer:1.4,radius:CREATURE_COLLISION_ENVELOPE.halfExtents[0],seat:[0,2.6,0],camera:32,
    brakeDeceleration:22,coastDeceleration:7,pitchResponse:3.4,rollResponse:5,characterPose:'ride',flyingCreature:{},
    hint:'W/S 俯冲/抬头 · A/D 转向 · Shift 加速 · Ctrl 刹停 · F 着陆/上下龙 · Space 起飞/滑翔 · E 喷火 · Q 闪避',
    envelope:{kind:'box',halfExtents:[...CREATURE_COLLISION_ENVELOPE.halfExtents],offset:[...CREATURE_COLLISION_ENVELOPE.offset]}};
}
