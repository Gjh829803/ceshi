import RAPIER from '@dimforge/rapier3d-compat';
import {Vector3} from 'three';
import {bindingLabel,DEFAULT_KEY_BINDINGS,type KeyBindings} from '../input';
import type {HumanoidActionContext} from './types';
import {ACTION_TUNING,SKILL_DEFINITIONS,type SkillId,type SkillRequest,type SkillResult} from './action-schema';

import {WorldInteractions,type TargetRuntime} from './world-interactions';

const DT=1/60,UP=new Vector3(0,1,0),ROT={x:0,y:0,z:0,w:1},RADIUS=.28;
export interface ActionCommands {roll?:boolean;slide?:boolean;interact?:boolean;putDown?:boolean}
export interface SkillPose {key:string;time:number;phase:string}
interface ActiveSkill {id:SkillId;requestId:string;target?:TargetRuntime|undefined;invalidatedReason?:string;elapsed:number;phase:string;direction:Vector3;initialSpeed:number;attached?:boolean;cancelRequested?:boolean;alignTime:number}
const DURATIONS:Record<string,number>={roll:ACTION_TUNING.rollDurationSeconds,'slide-start':ACTION_TUNING.slideEntryDurationSeconds,'slide-exit':ACTION_TUNING.slideExitDurationSeconds,pickup:25/30,'sit-enter':1.3,'sit-exit':31/30};

/** Physical actions and target state. Rendering is optional; no DOM or model calls. */
export class ActionSystem {
  availableClips=new Set<string>();
  active:ActiveSkill|null=null;
  pose:SkillPose|null=null;
  private heldTarget:TargetRuntime|null=null;
  private seatedTarget:TargetRuntime|null=null;
  get carrying():string|null{return this.heldTarget?.entityId??null;}
  get seated():string|null{return this.seatedTarget?.entityId??null;}
  private sequence=0;
  private cooldown=0;
  private results=new Map<string,SkillResult>();
  private requests=new Map<string,string>();
  constructor(private sim:HumanoidActionContext,readonly interactions:WorldInteractions){}
  /** The shared world retains target bodies after this controller leaves. */
  dispose(){this.interactions.releaseOwner(this);this.active=null;this.pose=null;this.heldTarget=null;this.seatedTarget=null;}
  reset(){
    if(this.active)this.finish('cancelled','RESET','测试点已复位');
    this.interactions.releaseOwner(this);
    this.active=null;this.pose=null;this.heldTarget=null;this.seatedTarget=null;this.cooldown=0;
    this.sim.actionCapsuleHalf=null;
  }
  /** Called once when the physics controller enters deep-water swimming. */
  releaseIntoWater(){
    if(this.active)this.finish('cancelled','WATER_ENTERED','进入深水，陆地动作中断');
    if(this.seated){this.interactions.release(this.seatedTarget!,this);this.seatedTarget=null;}
    if(!this.carrying)return;
    const target=this.heldTarget!,size=target.definition.size??[.13,.13,.13],sim=this.sim;
    // The hands are inside the conservative upright movement capsule. Detach
    // immediately beyond that capsule, then let a real dynamic body fall.
    const position=sim.position.clone().addScaledVector(UP,1.057).addScaledVector(sim.facing,RADIUS+Math.max(size[0],size[2])/2+.035);
    this.interactions.releaseHeld(this.heldTarget!,this,{reason:'water',position,velocity:new Vector3(sim.velocity.x,Math.min(0,sim.vertical),sim.velocity.z)});
    this.heldTarget=null;this.pose=null;
    sim.lastResult='进入深水：物件已脱手并按重力下沉；复位可恢复到台面';
  }
  /** Per-actor relationship check against the world's last committed target state. */
  checkSeatSupport():void{
    if(this.active?.phase==='target-exit')return;
    const target=this.seatedTarget??(this.active?.id==='sit'?this.active.target:undefined);
    if(!target||target.definition.kind!=='seat')return;
    if(this.interactions.isCurrent(target)&&target.stable&&target.hasContact(target.position,ACTION_TUNING.contactToleranceMeters)&&!(this.seatedTarget===target&&this.sim.position.distanceTo(new Vector3(...target.definition.approach))>.25))return;
    this.invalidateTarget(target,'SEAT_MOVED');
  }
  private invalidateTarget(target:TargetRuntime,reason:string):void{
    if(this.heldTarget===target)this.heldTarget=null;
    const seated=this.seatedTarget===target||this.active?.target===target&&this.active.id==='sit'&&this.active.phase!=='align';
    this.interactions.release(target,this);
    if(seated){
      this.seatedTarget=null;
      this.active??={id:'standUp',requestId:`cleanup-${++this.sequence}`,target,elapsed:0,phase:'target-exit',direction:this.sim.facing.clone(),initialSpeed:0,alignTime:0};
      this.active.phase='target-exit';this.active.invalidatedReason=reason;this.setHeight(ACTION_TUNING.seatedHeightMeters);
      this.save({requestId:this.active.requestId,action:this.active.id,targetId:target.entityId,slotId:target.slotId,status:'running',code:'CANCELLING',phase:'target-exit',message:'交互目标失效，等待安全退出后结束动作'});
    }else if(this.active?.target===target)this.finish('cancelled',reason,'交互目标或预约已失效');
    else this.pose=null;
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
      if(!target.enabled)return ['TARGET_DISABLED','目标物理实体或碰撞已停用'];
      if(action==='sit'&&!target.stable)return ['SEAT_UNSTABLE','座椅移动或翻倒，暂时不能坐下'];
      if(this.interactions.unavailable(target)||target.state!=='available'&&target.state!=='placed')return ['TARGET_UNAVAILABLE','目标已被占用'];
      const approach=new Vector3(...target.definition.approach),delta=approach.clone().sub(sim.position);
      if(Math.hypot(delta.x,delta.z)>ACTION_TUNING.approachRadiusMeters||Math.abs(delta.y)>ACTION_TUNING.approachVerticalToleranceMeters)return ['OUT_OF_REACH','靠近目标的交互位置后按 E'];
      const hit=sim.world.castShape(sim.body.translation(),ROT,delta,new RAPIER.Capsule(sim.capsuleHalf,RADIUS),0,1,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,sim.capsule);
      if(hit&&hit.time_of_impact<.99)return ['PATH_BLOCKED','交互位置被实体挡住'];
      if(action==='pickup')return this.pickupContactReason(target,approach,target.definition.yaw);
      if(action==='sit')return this.seatContactReason(target,approach,target.definition.yaw);
    }
    return null;
  }
  private pickupContactReason(target:TargetRuntime,position:Vector3,yaw:number):[string,string]|null{
    const physical=target.physical;if(!physical?.isValid)return ['TARGET_LOST','原目标物理实体已失效'];
    const body=physical.read();
    if(!body.entityEnabled||!body.collisionEnabled)return ['TARGET_DISABLED','目标碰撞或物理实体已停用'];
    if(!body.movable)return ['TARGET_IMMOVABLE','目标没有可搬运的动态刚体'];
    if(body.massKg>ACTION_TUNING.maximumPickupMassKg)return ['TOO_HEAVY',`当前搬运动作支持不超过 ${ACTION_TUNING.maximumPickupMassKg} kg 的物件`];
    // This clip has a calibrated table-height contact, not arbitrary-height IK.
    const reach=new Vector3(...ACTION_TUNING.pickupContactPositionLocalMetersXYZ).applyAxisAngle(UP,yaw).add(position);
    const contact=target.localAnchor.clone().multiply(body.scale).applyQuaternion(body.rotation).add(body.position);
    if(!target.hasContact(contact,ACTION_TUNING.contactToleranceMeters))return ['GRASP_CONTACT_MISSING','抓握锚点没有对应物体碰撞几何'];
    const tolerance=.10+Math.min(.1,Math.max(...body.sizeMetersXYZ)/2);
    return reach.distanceTo(contact)>tolerance?['GRASP_OUT_OF_REACH','目标不在当前桌面拾取动作的触碰范围内']:null;
  }
  private seatContactReason(target:TargetRuntime,position:Vector3,yaw:number):[string,string]|null{
    if(!target.hasContact(target.position,ACTION_TUNING.contactToleranceMeters))return ['SEAT_CONTACT_MISSING','座位锚点没有对应物体碰撞几何'];
    const contact=new Vector3(...ACTION_TUNING.seatedContactPositionLocalMetersXYZ).applyAxisAngle(UP,yaw).add(position);
    return contact.distanceTo(target.position)>.12?['SEAT_OUT_OF_REACH','座位超出当前坐姿动作的校准接触范围']:null;
  }
  eligibility(action:SkillId,targetId?:string,slotId?:string){
    const needed=action==='slide'?['slide-start','slide-loop','slide-exit']:action==='pickup'?['pickup','carry-walk']:action==='sit'?['sit-enter','sit-idle','sit-exit']:action==='standUp'?['sit-exit']:action==='putDown'?[]:['roll'];
    const missing=needed.find(id=>!this.availableClips.has(id));
    const owned=action==='standUp'?this.seatedTarget:action==='putDown'?this.heldTarget:null;
    const ambiguous=(action==='pickup'||action==='sit')&&targetId&&slotId===undefined&&!this.interactions.target(targetId)&&this.interactions.hasEntity(targetId);
    const mismatch=owned&&(targetId!==undefined&&targetId!==owned.entityId||slotId!==undefined&&slotId!==owned.slotId);
    const reason=this.sim.isMounted?['MOUNTED','请先离开载具或坐骑']:missing?['ASSET_UNAVAILABLE',`尚未载入动作 ${missing}`]:mismatch?['TARGET_MISMATCH','请求与角色当前持有或占座关系不一致']:ambiguous?['SLOT_REQUIRED','该目标有多个槽位，请明确 slotId']:this.reason(action,owned??(targetId?this.interactions.target(targetId,slotId):undefined));
    return {eligible:!reason,reason:reason?.[0]??'READY',message:reason?.[1]??'可执行'};
  }
  listTargets(){return [...this.interactions.targets.values()].map(target=>{
    const action=target.definition.kind==='pickup'?'pickup':'sit';const status=this.eligibility(action,target.entityId,target.slotId);
    return {...structuredClone(target.definition),entityId:target.entityId,generation:target.generation,claim:this.interactions.claimState(target),rotation:target.rotation.toArray(),position:target.position.toArray(),state:target.state,action,...status};
  });}
  hint(bindings:KeyBindings=DEFAULT_KEY_BINDINGS){
    if(this.seated)return `${bindingLabel('interact',bindings)} / ${bindingLabel('jump',bindings)} 起身`;
    if(this.carrying)return `搬运中 · 靠近台面按 ${bindingLabel('putDown',bindings)} 放下`;
    const target=this.nearest();return target?`${bindingLabel('interact',bindings)} ${target.definition.kind==='seat'?'坐下':'拾取'} · ${target.definition.label}`:null;
  }
  nearest(){return [...this.interactions.targets.values()].filter(t=>(t.state==='available'||t.state==='placed')&&new Vector3(...t.definition.approach).distanceTo(this.sim.position)<.95)
    .sort((a,b)=>new Vector3(...a.definition.approach).distanceToSquared(this.sim.position)-new Vector3(...b.definition.approach).distanceToSquared(this.sim.position))[0];}
  request(request:SkillRequest):SkillResult{
    const raw=request as unknown as Record<string,unknown>;
    if(!raw||typeof raw!=='object'||typeof raw.requestId!=='string'||!raw.requestId.length||raw.requestId.length>80
      ||!SKILL_DEFINITIONS.some(a=>a.id===raw.action)||Object.keys(raw).some(k=>!['requestId','action','targetId','slotId'].includes(k))
      ||raw.targetId!==undefined&&typeof raw.targetId!=='string'||raw.slotId!==undefined&&typeof raw.slotId!=='string')return {requestId:typeof raw?.requestId==='string'?raw.requestId:'',action:String(raw?.action??''),status:'rejected',code:'INVALID_REQUEST',message:'动作请求格式不合法'};
    const signature=JSON.stringify([request.action,request.targetId??null,request.slotId??null]);
    if(this.requests.has(request.requestId))return this.requests.get(request.requestId)===signature?this.status(request.requestId)!
      :{...request,status:'rejected',code:'REQUEST_ID_CONFLICT',message:'相同 requestId 不能用于不同请求'};
    this.requests.set(request.requestId,signature);
    const target=request.action==='standUp'?this.seatedTarget??undefined:request.targetId?this.interactions.target(request.targetId,request.slotId):undefined;
    const eligibility=this.eligibility(request.action,request.targetId,request.slotId);
    if(!eligibility.eligible)return this.save({...request,status:'rejected',code:eligibility.reason,message:eligibility.message});
    if(request.action==='putDown')return this.putDown(request);
    if(target&&(request.action==='pickup'||request.action==='sit')&&!this.interactions.reserve(target,this,request.requestId,{invalidated:(target,reason)=>this.invalidateTarget(target,reason),actorId:this.sim.actorId}))return this.save({...request,status:'rejected',code:'TARGET_UNAVAILABLE',message:'目标已被占用'});
    const sim=this.sim;
    this.active={id:request.action,requestId:request.requestId,target:target??this.seatedTarget??undefined,elapsed:0,phase:target&&(request.action==='pickup'||request.action==='sit')?'align':'play',direction:sim.velocity.length()>.2?sim.velocity.clone().setY(0).normalize():sim.facing.clone(),initialSpeed:sim.speed,alignTime:0};
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
    this.save({requestId:active.requestId,action:active.id,targetId:active.target?.entityId,slotId:active.target?.slotId,status,code,message});
    this.interactions.finish(this,active.requestId);
    this.active=null;this.pose=null;this.cooldown=ACTION_TUNING.cooldownSeconds;
    this.setHeight(this.seatedTarget?ACTION_TUNING.seatedHeightMeters:ACTION_TUNING.standingHeightMeters);this.sim.velocity.set(0,0,0);this.sim.speed=0;
    this.sim.controller.enableAutostep(.27,.2,false);this.sim.controller.enableSnapToGround(.18);
  }
  private stepStandingExit(active:ActiveSkill):void{
    const sim=this.sim;this.move(new Vector3());
    if(!this.clearHeight(ACTION_TUNING.standingHeightMeters)){
      active.elapsed-=DT;this.setHeight(ACTION_TUNING.seatedHeightMeters);this.pose={key:'sit-idle',time:0,phase:'clearance'};sim.state='seated';sim.lastResult='头顶空间不足：保持占座，等待安全起身';return;
    }
    this.setHeight(ACTION_TUNING.standingHeightMeters);this.pose={key:'sit-exit',time:Math.min(active.elapsed,DURATIONS['sit-exit']!),phase:'sit-exit'};sim.state='stand-up';
    if(active.elapsed>=DURATIONS['sit-exit']!){
      this.interactions.release(this.seatedTarget!,this);this.seatedTarget=null;
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
    const sim=this.sim,target=this.heldTarget;if(!target)return {reason:['EMPTY_HANDS','当前没有搬运物件']};
    const body=target.physical?.isValid?target.physical.read():undefined;if(!body)return {reason:['TARGET_LOST','原物理实体已失效']};
    const size=body.sizeMetersXYZ,rotation=body.rotation,centerOffset=new Vector3(...body.centerOffsetMetersXYZ).applyQuaternion(rotation);
    const center=sim.position.clone().addScaledVector(sim.facing,.36).addScaledVector(UP,1.3);
    const floor=sim.ray(center,new Vector3(0,-1,0),.7,undefined);
    if(!floor||floor.normal.y<.9)return {reason:['NO_PLACEMENT_SURFACE','靠近腰高的平整台面再放下']};
    let halfHeight=0;for(let axis=0;axis<3;axis++)halfHeight+=Math.abs(new Vector3().setComponent(axis,size[axis]!/2).applyQuaternion(rotation).y);
    center.y-=floor.timeOfImpact;center.y+=halfHeight+.008;
    const occupied=sim.world.intersectionWithShape(center,rotation,new RAPIER.Cuboid(size[0]/2,size[1]/2,size[2]/2),RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,sim.capsule);
    return occupied?{reason:['PLACEMENT_BLOCKED','台面放置位置被占用']}:{reason:null,position:center.sub(centerOffset)};
  }

  private putDown(request:SkillRequest){
    const sim=this.sim,target=this.heldTarget!,placement=this.placement();
    if(placement.reason)return this.save({...request,status:'rejected',code:placement.reason[0],message:placement.reason[1]});
    const position=placement.position!;
    if(!this.interactions.releaseHeld(this.heldTarget!,this,{reason:'place',position})){this.heldTarget=null;this.pose=null;return this.save({...request,status:'rejected',code:'TARGET_LOST',message:'原持有目标已失效'});}
    target.setApproach(sim.position,Math.atan2(sim.facing.x,sim.facing.z));this.heldTarget=null;
    return this.save({...request,targetId:target.definition.id,status:'completed',code:'PLACED',message:'已放到台面（物件状态切换，暂无专用放下动画）'});
  }
  /** Called at fixed 60 Hz on dry land before ordinary locomotion. */
  step(input:Vector3,_sprint:boolean,commands:ActionCommands={},jump=false){
    this.cooldown=Math.max(0,this.cooldown-DT);
    const invoke=(action:SkillId,targetId?:string,slotId?:string)=>this.request({action,targetId,slotId,requestId:`key-${++this.sequence}`});
    if(commands.roll)invoke('roll');if(commands.slide)invoke('slide');if(commands.putDown)invoke('putDown');
    if(commands.interact||jump&&this.seated){
      if(this.seated)invoke('standUp');else{const target=this.nearest();if(target)invoke(target.definition.kind==='seat'?'sit':'pickup',target.entityId,target.slotId);else this.sim.lastResult='附近没有可交互目标';}
    }
    const active=this.active;
    if(!active){
      if(this.seated){this.pose={key:'sit-idle',time:this.sim.elapsed%(50/30),phase:'seated'};this.sim.state='seated';this.move(new Vector3());return true;}
      this.pose=null;return false;
    }
    const sim=this.sim;sim.animationEvent=null;sim.probe=null;sim.jumpBuffer=0;
    if(active.target&&!this.interactions.isCurrent(active.target)&&active.phase!=='target-exit'){this.invalidateTarget(active.target,'TARGET_REMOVED');return true;}
    if(active.phase==='target-exit'){
      this.move(input.clone().multiplyScalar(.75));this.pose={key:'crouch-idle',time:0,phase:'clearance'};sim.state='crouch';
      if(this.clearHeight(ACTION_TUNING.standingHeightMeters))this.finish('cancelled',active.invalidatedReason??'TARGET_REMOVED','目标失效，已安全退出姿态');
      return true;
    }
    if(active.phase==='align'){
      const target=active.target!;const delta=new Vector3(...target.definition.approach).sub(sim.position).setY(0);
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
        const contactTarget=active.target,blocked=contactTarget?this.pickupContactReason(contactTarget,sim.position,Math.atan2(sim.facing.x,sim.facing.z)):['TARGET_LOST','原交互目标已失效'];
        if(blocked){this.finish('cancelled',blocked[0]!,blocked[1]!);return true;}
        if(!this.interactions.commit(active.target!,this,active.requestId,'held')){this.finish('cancelled','TARGET_UNAVAILABLE','目标预约已失效');return true;}
        active.attached=true;this.heldTarget=active.target!;
      }
      if(active.elapsed>=DURATIONS.pickup!)this.finish('completed','ATTACHED','已拾取：WASD 搬运，靠近台面 G 放下');
    }else if(active.id==='sit'){
      this.move(new Vector3());this.pose={key:'sit-enter',time:Math.min(active.elapsed,1.3),phase:'sit-enter'};sim.state='sit';
      if(active.elapsed>=1.3){const blocked=this.seatContactReason(active.target!,sim.position,Math.atan2(sim.facing.x,sim.facing.z));if(blocked){this.invalidateTarget(active.target!,blocked[0]);return true;}if(!this.interactions.commit(active.target!,this,active.requestId,'occupied')){this.finish('cancelled','TARGET_UNAVAILABLE','座位预约已失效');return true;}this.seatedTarget=active.target!;if(active.cancelRequested){active.phase='cancel-exit';active.elapsed=0;}else this.finish('completed','SEATED','已坐下：按 E 或空格起身');}

    }
    if(this.active){const result=this.results.get(active.requestId);if(result)result.phase=active.cancelRequested?'cancelling':this.pose?.phase??active.phase;}
    return true;
  }
  syncCarried(position?:Vector3){
    if(!this.carrying)return;
    const at=position??this.sim.position.clone().addScaledVector(UP,1.057).addScaledVector(this.sim.facing,.123);
    if(!this.interactions.moveHeld(this.heldTarget!,this,at)){if(this.active)this.finish('cancelled','TARGET_LOST','原持有目标已失效');this.heldTarget=null;this.pose=null;}
  }
}
