import RAPIER from '@dimforge/rapier3d-compat';
import {Vector3,Quaternion,Euler} from 'three';
import {bindingLabel,DEFAULT_KEY_BINDINGS,type KeyBindings} from '../input';
import type {HumanoidActionContext} from './types';
import {ACTION_TUNING,SKILL_DEFINITIONS,type SkillId,type SkillRequest,type SkillResult} from './action-schema';

import {WorldInteractions,type TargetRuntime} from './world-interactions';
export type {TargetRuntime} from './world-interactions';

const DT=1/60,UP=new Vector3(0,1,0),ROT={x:0,y:0,z:0,w:1},RADIUS=.28;
export interface ActionCommands {roll?:boolean;slide?:boolean;interact?:boolean;putDown?:boolean}
export interface SkillPose {key:string;time:number;phase:string}
interface ActiveSkill {id:SkillId;requestId:string;targetId?:string|undefined;elapsed:number;phase:string;direction:Vector3;initialSpeed:number;attached?:boolean;cancelRequested?:boolean;alignTime:number}
const DURATIONS:Record<string,number>={roll:ACTION_TUNING.rollDurationSeconds,'slide-start':ACTION_TUNING.slideEntryDurationSeconds,'slide-exit':ACTION_TUNING.slideExitDurationSeconds,pickup:25/30,'sit-enter':1.3,'sit-exit':31/30};

/** Physical actions and target state. Rendering is optional; no DOM or model calls. */
export class ActionSystem {
  readonly targets:Map<string,TargetRuntime>;
  availableClips=new Set<string>();
  active:ActiveSkill|null=null;
  pose:SkillPose|null=null;
  carrying:string|null=null;
  seated:string|null=null;
  private sequence=0;
  private cooldown=0;
  private results=new Map<string,SkillResult>();
  private requests=new Map<string,string>();
  private unstableSeats=new Set<string>();
  constructor(private sim:HumanoidActionContext,private readonly content:WorldInteractions){this.targets=content.targets;}
  /** The shared world retains target bodies after this controller leaves. */
  dispose(){this.content.releaseOwner(this);this.active=null;this.pose=null;this.carrying=null;this.seated=null;}
  reset(){
    if(this.active)this.finish('cancelled','RESET','测试点已复位');
    this.content.releaseOwner(this);
    this.active=null;this.pose=null;this.carrying=null;this.seated=null;this.cooldown=0;this.unstableSeats.clear();
    this.sim.actionCapsuleHalf=null;
  }
  /** Called once when the physics controller enters deep-water swimming. */
  releaseIntoWater(){
    if(this.active)this.finish('cancelled','WATER_ENTERED','进入深水，陆地动作中断');
    if(this.seated){this.targets.get(this.seated)!.state='available';this.content.release(this.seated,this);this.seated=null;}
    if(!this.carrying)return;
    const target=this.targets.get(this.carrying)!,size=target.definition.size??[.13,.13,.13],sim=this.sim;
    // The hands are inside the conservative upright movement capsule. Detach
    // immediately beyond that capsule, then let a real dynamic body fall.
    const position=sim.position.clone().addScaledVector(UP,1.057).addScaledVector(sim.facing,RADIUS+Math.max(size[0],size[2])/2+.035);
    if(!target.body||!target.collider)throw new Error('INTERACTION_BODY_MISSING');
    target.body.setTranslation(position,true);target.body.setEnabled(true);target.body.setGravityScale(1,true);
    target.body.setLinvel({x:sim.velocity.x,y:Math.min(0,sim.vertical),z:sim.velocity.z},true);
    target.body.setAngvel({x:0,y:0,z:0},false);target.body.resetForces(false);target.body.resetTorques(false);
    target.collider.setEnabled(true);target.collider.setMass(Math.max(.01,target.definition.massKg??1));target.collider.setFriction(.65);
    this.content.release(this.carrying,this);
    target.position.copy(position);target.state='dropped';this.carrying=null;this.pose=null;
    sim.lastResult='进入深水：物件已脱手并按重力下沉；复位可恢复到台面';
  }
  /** Safe to call every render frame; never overwrites hand-attached positions. */
  syncDropped(){for(const target of this.targets.values())if(target.body&&target.state!=='carried')target.position.copy(target.body.translation());}
  syncSeats(resolve:(id:string,point:readonly number[])=>{position:Vector3;rotation:Quaternion;stable:boolean}|null){
    this.unstableSeats.clear();
    for(const source of this.sim.level.interactions){if(source.kind!=='seat'||!source.colliderIds?.length)continue;const anchor=resolve(source.colliderIds[0]!,source.position),approach=resolve(source.colliderIds[0]!,source.approach),target=this.targets.get(source.id);if(!anchor||!approach||!target)continue;
      target.position.copy(anchor.position);target.definition.position=anchor.position.toArray();target.definition.approach=approach.position.toArray();target.definition.yaw=source.yaw+new Euler().setFromQuaternion(anchor.rotation,'YXZ').y;
      if(!anchor.stable||(this.seated===source.id&&this.sim.position.distanceTo(approach.position)>.25)){this.unstableSeats.add(source.id);if(this.active?.targetId===source.id)this.finish('cancelled','SEAT_MOVED','座椅移动或翻倒，坐姿交互已中断');if(this.seated===source.id){this.content.release(this.seated,this);this.seated=null;this.pose=null;this.sim.actionCapsuleHalf=null;target.state='available';}}
    }
  }
  status(id:string){const result=this.results.get(id);return result?{...result}:null;}
  private save(result:SkillResult){
    this.results.set(result.requestId,{...result});
    while(this.results.size>128){const oldest=[...this.results.keys()].find(id=>id!==this.active?.requestId);if(!oldest)break;this.results.delete(oldest);this.requests.delete(oldest);}
    this.sim.lastResult=result.message;return {...result};
  }
  private reason(action:SkillId,target?:TargetRuntime):[string,string]|null{
    const sim=this.sim;
    if(sim.isMounted)return ['MOUNTED','请先离开载具或坐骑'];
    if(this.active)return ['BUSY','已有动作正在执行'];
    if(sim.surface&&sim.surface.mode!=='none')return ['BUSY_SURFACE','请先退出匍匐或壁面攀爬，再执行这个动作'];
    if(sim.traversal||sim.swimming)return ['INVALID_STATE','需要先回到陆地可站立位置'];
    if(action==='standUp')return !this.seated?['NOT_SEATED','当前没有坐下']:!this.clearHeight(ACTION_TUNING.standingHeightMeters)?['HEADROOM_BLOCKED','头顶空间不足，暂时不能起身']:null;
    if(this.seated)return ['SEATED','请先按 E 起身'];
    if(!sim.grounded)return ['NOT_GROUNDED','动作需要地面支撑'];
    if(action==='putDown')return this.carrying?this.placement().reason:['EMPTY_HANDS','当前没有搬运物件'];
    if(this.carrying)return ['HANDS_OCCUPIED','先把手中的物件放到台面'];
    if(sim.stance!=='stand')return ['STANCE_REQUIRED','请先站起再执行这个动作'];
    if(action==='slide'&&sim.speed<ACTION_TUNING.slideMinimumSpeedMetersPerSecond)return ['SPEED_TOO_LOW','实际速度不足，请先助跑，再按冲刺 + 蹲伏滑铲'];
    if((action==='slide'||action==='roll')&&this.cooldown>0)return ['COOLDOWN','动作仍在恢复中'];
    if(action==='pickup'||action==='sit'){
      if(!target||target.definition.kind!==(action==='pickup'?'pickup':'seat'))return ['INVALID_TARGET','没有对应类型的交互目标'];
      if(action==='sit'&&this.unstableSeats.has(target.definition.id))return ['SEAT_UNSTABLE','座椅移动或翻倒，暂时不能坐下'];
      if(this.content.unavailable(target.definition.id)||target.state!=='available'&&target.state!=='placed')return ['TARGET_UNAVAILABLE','目标已被占用'];
      const approach=new Vector3(...target.definition.approach),delta=approach.clone().sub(sim.position);
      if(Math.hypot(delta.x,delta.z)>ACTION_TUNING.approachRadiusMeters||Math.abs(delta.y)>ACTION_TUNING.approachVerticalToleranceMeters)return ['OUT_OF_REACH','靠近目标的交互位置后按 E'];
      const hit=sim.world.castShape(sim.body.translation(),ROT,delta,new RAPIER.Capsule(sim.capsuleHalf,RADIUS),0,1,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,sim.capsule);
      if(hit&&hit.time_of_impact<.99)return ['PATH_BLOCKED','交互位置被实体挡住'];
      if(action==='pickup'&&(target.definition.massKg??1)>ACTION_TUNING.maximumPickupMassKg)return ['TOO_HEAVY',`当前搬运动作支持不超过 ${ACTION_TUNING.maximumPickupMassKg} kg 的物件`];
      if(action==='pickup'){
        // This is a table-height authored reach, not a general IK pickup.
        // Reject incompatible targets rather than teleporting them to a hand.
        const reach=new Vector3(.051,.894,.363).applyAxisAngle(UP,target.definition.yaw).add(approach);
        const tolerance=.10+Math.min(.1,Math.max(...(target.definition.size??[.13,.13,.13]))/2);
        if(reach.distanceTo(target.position)>tolerance)return ['GRASP_OUT_OF_REACH','目标不在当前桌面拾取动作的触碰范围内'];
      }
    }
    return null;
  }
  eligibility(action:SkillId,targetId?:string){
    const needed=action==='slide'?['slide-start','slide-loop','slide-exit']:action==='pickup'?['pickup','carry-walk']:action==='sit'?['sit-enter','sit-idle','sit-exit']:action==='standUp'?['sit-exit']:action==='putDown'?[]:['roll'];
    const missing=needed.find(id=>!this.availableClips.has(id));
    const reason=this.sim.isMounted?['MOUNTED','请先离开载具或坐骑']:missing?['ASSET_UNAVAILABLE',`尚未载入动作 ${missing}`]:this.reason(action,targetId?this.targets.get(targetId):undefined);
    return {eligible:!reason,reason:reason?.[0]??'READY',message:reason?.[1]??'可执行'};
  }
  listTargets(){return [...this.targets.values()].map(target=>{
    const action=target.definition.kind==='pickup'?'pickup':'sit';const status=this.eligibility(action,target.definition.id);
    return {...structuredClone(target.definition),position:target.position.toArray(),state:target.state,action,...status};
  });}
  hint(bindings:KeyBindings=DEFAULT_KEY_BINDINGS){
    if(this.seated)return `${bindingLabel('interact',bindings)} / ${bindingLabel('jump',bindings)} 起身`;
    if(this.carrying)return `搬运中 · 靠近台面按 ${bindingLabel('putDown',bindings)} 放下`;
    const target=this.nearest();return target?`${bindingLabel('interact',bindings)} ${target.definition.kind==='seat'?'坐下':'拾取'} · ${target.definition.label}`:null;
  }
  nearest(){return [...this.targets.values()].filter(t=>(t.state==='available'||t.state==='placed')&&new Vector3(...t.definition.approach).distanceTo(this.sim.position)<.95)
    .sort((a,b)=>new Vector3(...a.definition.approach).distanceToSquared(this.sim.position)-new Vector3(...b.definition.approach).distanceToSquared(this.sim.position))[0];}
  request(request:SkillRequest):SkillResult{
    const raw=request as unknown as Record<string,unknown>;
    if(!raw||typeof raw!=='object'||typeof raw.requestId!=='string'||!raw.requestId.length||raw.requestId.length>80
      ||!SKILL_DEFINITIONS.some(a=>a.id===raw.action)||Object.keys(raw).some(k=>!['requestId','action','targetId'].includes(k))
      ||raw.targetId!==undefined&&typeof raw.targetId!=='string')return {requestId:typeof raw?.requestId==='string'?raw.requestId:'',action:String(raw?.action??''),status:'rejected',code:'INVALID_REQUEST',message:'动作请求格式不合法'};
    const signature=JSON.stringify([request.action,request.targetId??null]);
    if(this.requests.has(request.requestId))return this.requests.get(request.requestId)===signature?this.status(request.requestId)!
      :{...request,status:'rejected',code:'REQUEST_ID_CONFLICT',message:'相同 requestId 不能用于不同请求'};
    this.requests.set(request.requestId,signature);
    const target=request.targetId?this.targets.get(request.targetId):undefined;
    const eligibility=this.eligibility(request.action,request.targetId);
    if(!eligibility.eligible)return this.save({...request,status:'rejected',code:eligibility.reason,message:eligibility.message});
    if(request.action==='putDown')return this.putDown(request);
    if(target&&(request.action==='pickup'||request.action==='sit')&&!this.content.reserve(target.definition.id,this,request.requestId))return this.save({...request,status:'rejected',code:'TARGET_UNAVAILABLE',message:'目标已被占用'});
    const sim=this.sim;
    this.active={id:request.action,requestId:request.requestId,targetId:request.targetId??this.seated??undefined,elapsed:0,phase:target?'align':'play',direction:sim.velocity.length()>.2?sim.velocity.clone().setY(0).normalize():sim.facing.clone(),initialSpeed:sim.speed,alignTime:0};
    sim.animationEvent=null;sim.completedMotion=null;sim.jumpBuffer=0;
    if(request.action==='roll'||request.action==='slide')sim.facing.copy(this.active.direction);
    return this.save({...request,status:'running',code:'STARTED',message:`${SKILL_DEFINITIONS.find(a=>a.id===request.action)!.label}：开始`,phase:this.active.phase});
  }
  cancel(requestId:string){
    const active=this.active;if(active?.requestId!==requestId)return this.status(requestId);
    if(active.id==='slide'||active.id==='standUp'||active.id==='sit'&&active.phase!=='align'){
      active.cancelRequested=true;
      return this.save({...this.status(requestId)!,code:'CANCELLING',phase:'cancelling',message:'取消已请求，等待安全退出后释放动作资源'});
    }
    this.finish('cancelled','CANCELLED','动作已取消');return this.status(requestId);
  }
  private finish(status:'completed'|'cancelled',code:string,message:string){
    const active=this.active;if(!active)return;
    this.save({requestId:active.requestId,action:active.id,targetId:active.targetId,status,code,message});
    this.content.finish(this,active.requestId);
    this.active=null;this.pose=null;this.cooldown=ACTION_TUNING.cooldownSeconds;
    this.setHeight(ACTION_TUNING.standingHeightMeters);this.sim.velocity.set(0,0,0);this.sim.speed=0;
    this.sim.controller.enableAutostep(.27,.2,false);this.sim.controller.enableSnapToGround(.18);
  }
  private stepStandingExit(active:ActiveSkill):void{
    const sim=this.sim;this.move(new Vector3());
    if(!this.clearHeight(ACTION_TUNING.standingHeightMeters)){
      active.elapsed-=DT;this.pose={key:'sit-idle',time:0,phase:'clearance'};sim.state='seated';sim.lastResult='头顶空间不足：保持占座，等待安全起身';return;
    }
    this.pose={key:'sit-exit',time:Math.min(active.elapsed,DURATIONS['sit-exit']!),phase:'sit-exit'};sim.state='stand-up';
    if(active.elapsed>=DURATIONS['sit-exit']!){
      this.targets.get(this.seated!)!.state='available';this.content.release(this.seated!,this);this.seated=null;
      this.finish(active.cancelRequested?'cancelled':'completed',active.cancelRequested?'CANCELLED':'STANDING',active.cancelRequested?'已安全起身并取消动作':'已起身');
    }
  }
  private setHeight(height:number){
    const half=Math.max(.06,height/2-RADIUS);
    if(Math.abs(this.sim.capsuleHalf-half)<1e-5)return;
    this.sim.actionCapsuleHalf=Math.abs(height-ACTION_TUNING.standingHeightMeters)<1e-5?null:half;
    this.sim.capsule.setShape(new RAPIER.Capsule(half,RADIUS));
    const center=this.sim.position.clone().addScaledVector(UP,half+RADIUS);
    this.sim.body.setTranslation(center,true);this.sim.body.setNextKinematicTranslation(center);
    this.sim.world.propagateModifiedBodyPositionsToColliders();
  }
  private clearHeight(height:number){return !this.sim.world.intersectionWithShape(this.sim.position.clone().addScaledVector(UP,height/2),ROT,new RAPIER.Capsule(height/2-RADIUS,RADIUS),RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,this.sim.capsule);}
  private move(velocity:Vector3){
    const sim=this.sim;sim.vertical=Math.max(-16,sim.vertical-18*DT);
    sim.controller.computeColliderMovement(sim.capsule,{x:velocity.x*DT,y:sim.vertical*DT,z:velocity.z*DT},RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    const movement=sim.controller.computedMovement(),current=sim.body.translation();
    sim.body.setNextKinematicTranslation({x:current.x+movement.x,y:current.y+movement.y,z:current.z+movement.z});
    sim.grounded=sim.controller.computedGrounded();sim.collisions=sim.controller.numComputedCollisions();
    if(sim.grounded&&sim.vertical<0)sim.vertical=0;
    sim.speed=Math.hypot(movement.x,movement.z)/DT;sim.velocity.copy(velocity);
    sim.commitPose();sim.sync();
  }
  private placement():{reason:[string,string]|null;position?:Vector3}{
    const sim=this.sim,target=this.targets.get(this.carrying!);if(!target)return {reason:['EMPTY_HANDS','当前没有搬运物件']};
    const size=target.definition.size??[.13,.13,.13];
    const position=sim.position.clone().addScaledVector(sim.facing,.36).addScaledVector(UP,1.3);
    const floor=sim.ray(position,new Vector3(0,-1,0),.7,undefined);
    if(!floor||floor.normal.y<.9)return {reason:['NO_PLACEMENT_SURFACE','靠近腰高的平整台面再放下']};
    position.y-=floor.timeOfImpact;position.y+=size[1]/2+.008;
    const occupied=sim.world.intersectionWithShape(position,ROT,new RAPIER.Cuboid(size[0]/2,size[1]/2,size[2]/2),RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,sim.capsule);
    return occupied?{reason:['PLACEMENT_BLOCKED','台面放置位置被占用']}:{reason:null,position};
  }
  private putDown(request:SkillRequest){
    const sim=this.sim,target=this.targets.get(this.carrying!)!,placement=this.placement();
    if(placement.reason)return this.save({...request,status:'rejected',code:placement.reason[0],message:placement.reason[1]});
    const position=placement.position!;
    target.position.copy(position);target.state='placed';target.definition.position=position.toArray();
    target.definition.approach=sim.position.toArray();target.definition.yaw=Math.atan2(sim.facing.x,sim.facing.z);
    if(target.body){target.body.setTranslation(position,true);target.body.setLinvel({x:0,y:0,z:0},false);target.body.setEnabled(true);}else target.collider?.setTranslation(position);target.collider?.setEnabled(true);this.content.release(this.carrying!,this);this.carrying=null;
    return this.save({...request,targetId:target.definition.id,status:'completed',code:'PLACED',message:'已放到台面（物件状态切换，暂无专用放下动画）'});
  }
  /** Called at fixed 60 Hz on dry land before ordinary locomotion. */
  step(input:Vector3,_sprint:boolean,commands:ActionCommands={},jump=false){
    this.syncDropped();
    this.cooldown=Math.max(0,this.cooldown-DT);
    const invoke=(action:SkillId,targetId?:string)=>this.request({action,targetId,requestId:`key-${++this.sequence}`});
    if(commands.roll)invoke('roll');if(commands.slide)invoke('slide');if(commands.putDown)invoke('putDown');
    if(commands.interact||jump&&this.seated){
      if(this.seated)invoke('standUp');else{const target=this.nearest();if(target)invoke(target.definition.kind==='seat'?'sit':'pickup',target.definition.id);else this.sim.lastResult='附近没有可交互目标';}
    }
    const active=this.active;
    if(!active){
      if(this.seated){this.pose={key:'sit-idle',time:this.sim.elapsed%(50/30),phase:'seated'};this.sim.state='seated';this.move(new Vector3());return true;}
      this.pose=null;return false;
    }
    const sim=this.sim;sim.animationEvent=null;sim.probe=null;sim.jumpBuffer=0;
    if(active.phase==='align'){
      const target=this.targets.get(active.targetId!)!;const delta=new Vector3(...target.definition.approach).sub(sim.position).setY(0);
      const angle=Math.atan2(sim.facing.x,sim.facing.z),turn=Math.atan2(Math.sin(target.definition.yaw-angle),Math.cos(target.definition.yaw-angle));
      const next=angle+Math.max(-4*DT,Math.min(4*DT,turn));sim.facing.set(Math.sin(next),0,Math.cos(next));
      active.alignTime+=DT;
      this.move(delta.length()>.018?delta.setLength(Math.min(.7,delta.length()/DT)):new Vector3());
      this.pose=null;sim.state=sim.speed>.06?'walk':'idle';
      if(delta.length()<=.018&&Math.abs(turn)<.035){active.phase='play';active.elapsed=0;}
      else if(active.alignTime>2.5)this.finish('cancelled','ALIGNMENT_BLOCKED','无法对齐交互位置，动作取消');
      return true;
    }
    active.elapsed+=DT;
    if(active.id==='standUp'||active.id==='sit'&&active.phase==='cancel-exit'){
      this.stepStandingExit(active);
    }else if(active.id==='roll'){
      this.pose={key:'roll',time:Math.min(active.elapsed,DURATIONS.roll!),phase:'roll'};sim.state='roll';
      sim.controller.disableAutostep();
      const speed=2.7/DURATIONS.roll! * Math.PI/2*Math.sin(Math.PI*Math.min(1,active.elapsed/DURATIONS.roll!));
      this.move(active.direction.clone().multiplyScalar(speed));
      if(!sim.grounded||active.elapsed>=DURATIONS.roll!)this.finish('completed','FINISHED','翻滚结束');
    }else if(active.id==='slide'){
      sim.controller.disableAutostep();
      const start=DURATIONS['slide-start']!,loopEnd=start+ACTION_TUNING.slideLoopSeconds;
      if(active.cancelRequested&&active.phase!=='exit'&&this.clearHeight(ACTION_TUNING.standingHeightMeters)){active.phase='exit';active.elapsed=0;}
      if(active.phase==='exit'&&!this.clearHeight(ACTION_TUNING.standingHeightMeters)){active.phase='clearance';active.elapsed=loopEnd;this.setHeight(ACTION_TUNING.slideHeightMeters);}
      if(active.phase==='exit'){
        this.pose={key:'slide-exit',time:Math.min(active.elapsed,ACTION_TUNING.slideExitDurationSeconds),phase:'exit'};this.setHeight(ACTION_TUNING.standingHeightMeters);this.move(new Vector3());
        if(active.elapsed>=ACTION_TUNING.slideExitDurationSeconds)this.finish(active.cancelRequested?'cancelled':'completed',active.cancelRequested?'CANCELLED':'FINISHED',active.cancelRequested?'已安全退出滑铲并取消动作':'滑铲结束');
      }else{
        const t=active.elapsed;const height=t<.333?ACTION_TUNING.standingHeightMeters-(ACTION_TUNING.standingHeightMeters-ACTION_TUNING.slideHeightMeters)*Math.min(1,t/.333):ACTION_TUNING.slideHeightMeters;
        this.setHeight(height);this.pose={key:t<start?'slide-start':'slide-loop',time:t<start?t:(t-start)%2,phase:t<loopEnd?'slide':'clearance'};
        const speed=t<loopEnd?Math.max(.6,Math.min(5.8,active.initialSpeed)*Math.exp(-.85*t)):.75;
        const direction=t>=loopEnd&&input.lengthSq()>.01?input:active.direction;
        this.move(direction.clone().multiplyScalar(t>=loopEnd&&input.lengthSq()<.01?0:speed));
        if(t>=loopEnd){if(this.clearHeight(ACTION_TUNING.standingHeightMeters)){active.phase='exit';active.elapsed=0;}else sim.lastResult='头顶不足：保持滑铲低姿态，WASD 移出后恢复';}
        if(!sim.grounded){this.finish('cancelled','LEFT_GROUND','滑铲离开地面，恢复下落');}
      }
      sim.state='slide';
    }else if(active.id==='pickup'){
      this.move(new Vector3());this.pose={key:'pickup',time:Math.min(active.elapsed,DURATIONS.pickup!),phase:'pickup'};sim.state='pickup';
      if(active.elapsed>=.30&&!active.attached){
        if(!this.content.commit(active.targetId!,this,active.requestId,'held')){this.finish('cancelled','TARGET_UNAVAILABLE','目标预约已失效');return true;}
        active.attached=true;this.carrying=active.targetId!;const target=this.targets.get(this.carrying)!;
        target.state='carried';target.collider?.setEnabled(false);target.body?.setEnabled(false);
      }
      if(active.elapsed>=DURATIONS.pickup!)this.finish('completed','ATTACHED','已拾取：WASD 搬运，靠近台面 G 放下');
    }else if(active.id==='sit'){
      this.move(new Vector3());this.pose={key:'sit-enter',time:Math.min(active.elapsed,1.3),phase:'sit-enter'};sim.state='sit';
      if(active.elapsed>=1.3){if(!this.content.commit(active.targetId!,this,active.requestId,'occupied')){this.finish('cancelled','TARGET_UNAVAILABLE','座位预约已失效');return true;}this.seated=active.targetId!;this.targets.get(this.seated)!.state='occupied';if(active.cancelRequested){active.phase='cancel-exit';active.elapsed=0;}else this.finish('completed','SEATED','已坐下：按 E 或空格起身');}

    }
    if(this.active){const result=this.results.get(active.requestId);if(result)result.phase=active.cancelRequested?'cancelling':this.pose?.phase??active.phase;}
    return true;
  }
  syncCarried(position?:Vector3){
    if(!this.carrying)return;
    const target=this.targets.get(this.carrying)!;
    target.position.copy(position??this.sim.position.clone().addScaledVector(UP,1.057).addScaledVector(this.sim.facing,.123));
  }
}
