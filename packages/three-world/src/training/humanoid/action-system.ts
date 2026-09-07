import RAPIER from '@dimforge/rapier3d-compat';
import {Vector3} from 'three';
import type {HumanoidActionContext} from './types';
import {SKILL_DEFINITIONS,type InteractionTarget,type SkillId,type SkillRequest,type SkillResult} from './action-schema';

const DT=1/60,UP=new Vector3(0,1,0),ROT={x:0,y:0,z:0,w:1},RADIUS=.28;
export interface ActionCommands {roll?:boolean;slide?:boolean;interact?:boolean;putDown?:boolean}
export interface TargetRuntime {definition:InteractionTarget;position:Vector3;state:'available'|'carried'|'placed'|'occupied'|'dropped';collider?:RAPIER.Collider|undefined;body?:RAPIER.RigidBody|undefined}
export interface SkillPose {key:string;time:number;phase:string}
interface ActiveSkill {id:SkillId;requestId:string;targetId?:string|undefined;elapsed:number;phase:string;direction:Vector3;initialSpeed:number;attached?:boolean;alignTime:number}
const DURATIONS:Record<string,number>={roll:44/30,'slide-start':25/30,'slide-exit':.5,pickup:25/30,'sit-enter':1.3,'sit-exit':31/30};

/** Physical actions and target state. Rendering is optional; no DOM or model calls. */
export class ActionSystem {
  targets=new Map<string,TargetRuntime>();
  availableClips=new Set<string>();
  active:ActiveSkill|null=null;
  pose:SkillPose|null=null;
  carrying:string|null=null;
  seated:string|null=null;
  private sequence=0;
  private cooldown=0;
  private results=new Map<string,SkillResult>();
  private requests=new Map<string,string>();
  constructor(private sim:HumanoidActionContext){
    for(const definition of sim.level?.interactions??[]){
      const target:TargetRuntime={definition:structuredClone(definition),position:new Vector3(...definition.position),state:'available'};
      if(definition.kind==='pickup'){
        const size=definition.size??[.13,.13,.13];
        target.collider=sim.world.createCollider(RAPIER.ColliderDesc.cuboid(size[0]/2,size[1]/2,size[2]/2).setTranslation(...definition.position));
      }
      this.targets.set(definition.id,target);
    }
  }
  /** Dispose only this controller's interaction bodies; the map owns the world. */
  dispose(){
    for(const target of this.targets.values()){
      if(target.body)this.sim.world.removeRigidBody(target.body);
      else if(target.collider)this.sim.world.removeCollider(target.collider,true);
    }
    this.targets.clear();this.active=null;this.pose=null;this.carrying=null;this.seated=null;
  }
  reset(){
    if(this.active)this.finish('cancelled','RESET','测试点已复位');
    this.active=null;this.pose=null;this.carrying=null;this.seated=null;this.cooldown=0;
    this.sim.actionCapsuleHalf=null;
    for(const target of this.targets.values()){
      if(target.body){this.sim.world.removeRigidBody(target.body);target.body=undefined;target.collider=undefined;}
      const source=this.sim.level?.interactions?.find(t=>t.id===target.definition.id);
      if(source)target.definition=structuredClone(source);
      target.position.fromArray(target.definition.position);target.state='available';
      if(target.definition.kind==='pickup'&&!target.collider){const size=target.definition.size??[.13,.13,.13];target.collider=this.sim.world.createCollider(RAPIER.ColliderDesc.cuboid(size[0]/2,size[1]/2,size[2]/2).setTranslation(...target.definition.position));}
      target.collider?.setTranslation(target.position);target.collider?.setEnabled(true);
    }
  }
  /** Called once when the physics controller enters deep-water swimming. */
  releaseIntoWater(){
    if(this.active)this.finish('cancelled','WATER_ENTERED','进入深水，陆地动作中断');
    if(this.seated){this.targets.get(this.seated)!.state='available';this.seated=null;}
    if(!this.carrying)return;
    const target=this.targets.get(this.carrying)!,size=target.definition.size??[.13,.13,.13],sim=this.sim;
    // The hands are inside the conservative upright movement capsule. Detach
    // immediately beyond that capsule, then let a real dynamic body fall.
    const position=sim.position.clone().addScaledVector(UP,1.057).addScaledVector(sim.facing,RADIUS+Math.max(size[0],size[2])/2+.035);
    if(target.collider)sim.world.removeCollider(target.collider,true);
    target.body=sim.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(position.x,position.y,position.z).setCcdEnabled(true).lockRotations());
    target.collider=sim.world.createCollider(RAPIER.ColliderDesc.cuboid(size[0]/2,size[1]/2,size[2]/2).setMass(Math.max(.01,target.definition.massKg??1)).setFriction(.65),target.body);
    target.body.setLinvel({x:sim.velocity.x,y:Math.min(0,sim.vertical),z:sim.velocity.z},true);
    target.position.copy(position);target.state='dropped';this.carrying=null;this.pose=null;
    sim.lastResult='进入深水：物件已脱手并按重力下沉；复位可恢复到台面';
  }
  /** Safe to call every render frame; never overwrites hand-attached positions. */
  syncDropped(){for(const target of this.targets.values())if(target.body&&target.state==='dropped')target.position.copy(target.body.translation());}
  status(id:string){const result=this.results.get(id);return result?{...result}:null;}
  private save(result:SkillResult){
    this.results.set(result.requestId,{...result});
    while(this.results.size>128){const oldest=[...this.results.keys()].find(id=>id!==this.active?.requestId);if(!oldest)break;this.results.delete(oldest);this.requests.delete(oldest);}
    this.sim.lastResult=result.message;return {...result};
  }
  private reason(action:SkillId,target?:TargetRuntime):[string,string]|null{
    const sim=this.sim;
    if(this.active)return ['BUSY','已有动作正在执行'];
    if(sim.surface&&sim.surface.mode!=='none')return ['BUSY_SURFACE','请先退出匍匐或壁面攀爬，再执行这个动作'];
    if(sim.traversal||sim.swimming)return ['INVALID_STATE','需要先回到陆地可站立位置'];
    if(action==='standUp')return !this.seated?['NOT_SEATED','当前没有坐下']:!this.clearHeight(1.68)?['HEADROOM_BLOCKED','头顶空间不足，暂时不能起身']:null;
    if(this.seated)return ['SEATED','请先按 E 起身'];
    if(!sim.grounded)return ['NOT_GROUNDED','动作需要地面支撑'];
    if(action==='putDown')return this.carrying?null:['EMPTY_HANDS','当前没有搬运物件'];
    if(this.carrying)return ['HANDS_OCCUPIED','先把手中的物件放到台面'];
    if(sim.stance!=='stand')return ['STANCE_REQUIRED','请先站起再执行这个动作'];
    if(action==='slide'&&sim.speed<2.5)return ['SPEED_TOO_LOW','先跑起来，再按 Q 滑铲'];
    if((action==='slide'||action==='roll')&&this.cooldown>0)return ['COOLDOWN','动作仍在恢复中'];
    if(action==='pickup'||action==='sit'){
      if(!target||target.definition.kind!==(action==='pickup'?'pickup':'seat'))return ['INVALID_TARGET','没有对应类型的交互目标'];
      if(target.state!=='available'&&target.state!=='placed')return ['TARGET_UNAVAILABLE','目标已被占用'];
      const approach=new Vector3(...target.definition.approach),delta=approach.clone().sub(sim.position);
      if(Math.hypot(delta.x,delta.z)>.9||Math.abs(delta.y)>.16)return ['OUT_OF_REACH','靠近目标的交互位置后按 E'];
      const hit=sim.world.castShape(sim.body.translation(),ROT,delta,new RAPIER.Capsule(sim.capsuleHalf,RADIUS),0,1,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,sim.capsule);
      if(hit&&hit.time_of_impact<.99)return ['PATH_BLOCKED','交互位置被实体挡住'];
      if(action==='pickup'&&(target.definition.massKg??1)>8)return ['TOO_HEAVY','当前搬运动作支持不超过 8 kg 的物件'];
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
  listTargets(){return [...this.targets.values()].map(target=>{
    const action=target.definition.kind==='pickup'?'pickup':'sit';const reason=this.reason(action,target);
    return {...structuredClone(target.definition),position:target.position.toArray(),state:target.state,action,eligible:!reason,reason:reason?.[0]??'READY',message:reason?.[1]??'可交互'};
  });}
  hint(){
    if(this.seated)return 'E / Space 起身';
    if(this.carrying)return '搬运中 · WASD 移动 · 靠近台面按 G 放下';
    const target=this.nearest();return target?`E ${target.definition.kind==='seat'?'坐下':'拾取'} · ${target.definition.label}`:null;
  }
  private nearest(){return [...this.targets.values()].filter(t=>(t.state==='available'||t.state==='placed')&&new Vector3(...t.definition.approach).distanceTo(this.sim.position)<.95)
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
    const needed=request.action==='slide'?['slide-start','slide-loop','slide-exit']:request.action==='pickup'?['pickup','carry-walk']:request.action==='sit'?['sit-enter','sit-idle']:request.action==='standUp'?['sit-exit']:request.action==='putDown'?[]:['roll'];
    const target=request.targetId?this.targets.get(request.targetId):undefined;
    const missing=needed.find(id=>!this.availableClips.has(id));
    const reason=missing?['ASSET_UNAVAILABLE',`尚未载入动作 ${missing}`] as [string,string]:this.reason(request.action,target);
    if(reason)return this.save({...request,status:'rejected',code:reason[0],message:reason[1]});
    if(request.action==='putDown')return this.putDown(request);
    const sim=this.sim;
    this.active={id:request.action,requestId:request.requestId,targetId:request.targetId??this.seated??undefined,elapsed:0,phase:target?'align':'play',direction:sim.velocity.length()>.2?sim.velocity.clone().setY(0).normalize():sim.facing.clone(),initialSpeed:sim.speed,alignTime:0};
    sim.animationEvent=null;sim.completedMotion=null;sim.jumpBuffer=0;
    if(request.action==='roll'||request.action==='slide')sim.facing.copy(this.active.direction);
    return this.save({...request,status:'running',code:'STARTED',message:`${SKILL_DEFINITIONS.find(a=>a.id===request.action)!.label}：开始`,phase:this.active.phase});
  }
  cancel(requestId:string){
    if(this.active?.requestId!==requestId)return this.status(requestId);
    if(this.active.id==='slide'&&!this.clearHeight(1.68))return {...this.status(requestId)!,code:'HEADROOM_BLOCKED',message:'低顶下需先移出，不能强制恢复站姿'};
    if(this.active.id==='sit'||this.active.id==='standUp')return {...this.status(requestId)!,code:'ATOMIC_TRANSITION',message:'请等待坐姿过渡完成，再执行起身'};
    this.finish('cancelled','CANCELLED','动作已取消');return this.status(requestId);
  }
  private finish(status:'completed'|'cancelled',code:string,message:string){
    const active=this.active;if(!active)return;
    this.save({requestId:active.requestId,action:active.id,targetId:active.targetId,status,code,message});
    this.active=null;this.pose=null;this.cooldown=.22;
    this.setHeight(1.68);this.sim.velocity.set(0,0,0);this.sim.speed=0;
    this.sim.controller.enableAutostep(.27,.2,false);this.sim.controller.enableSnapToGround(.18);
  }
  private setHeight(height:number){
    const half=Math.max(.06,height/2-RADIUS);
    if(Math.abs(this.sim.capsuleHalf-half)<1e-5)return;
    this.sim.actionCapsuleHalf=Math.abs(height-1.68)<1e-5?null:half;
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
  private putDown(request:SkillRequest){
    const sim=this.sim,target=this.targets.get(this.carrying!)!,size=target.definition.size??[.13,.13,.13];
    const position=sim.position.clone().addScaledVector(sim.facing,.36).addScaledVector(UP,1.3);
    const floor=sim.ray(position,new Vector3(0,-1,0),.7,undefined);
    if(!floor||floor.normal.y<.9)return this.save({...request,status:'rejected',code:'NO_PLACEMENT_SURFACE',message:'靠近腰高的平整台面再按 G；当前没有地面放下动画'});
    position.y-=floor.timeOfImpact;position.y+=size[1]/2+.008;
    const occupied=sim.world.intersectionWithShape(position,ROT,new RAPIER.Cuboid(size[0]/2,size[1]/2,size[2]/2),RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,sim.capsule);
    if(occupied)return this.save({...request,status:'rejected',code:'PLACEMENT_BLOCKED',message:'台面放置位置被占用'});
    target.position.copy(position);target.state='placed';target.definition.position=position.toArray();
    target.definition.approach=sim.position.toArray();target.definition.yaw=Math.atan2(sim.facing.x,sim.facing.z);
    target.collider?.setTranslation(position);target.collider?.setEnabled(true);this.carrying=null;
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
    if(active.id==='roll'){
      this.pose={key:'roll',time:Math.min(active.elapsed,DURATIONS.roll!),phase:'roll'};sim.state='roll';
      sim.controller.disableAutostep();
      const speed=2.7/DURATIONS.roll! * Math.PI/2*Math.sin(Math.PI*Math.min(1,active.elapsed/DURATIONS.roll!));
      this.move(active.direction.clone().multiplyScalar(speed));
      if(!sim.grounded||active.elapsed>=DURATIONS.roll!)this.finish('completed','FINISHED','翻滚结束');
    }else if(active.id==='slide'){
      sim.controller.disableAutostep();
      const start=DURATIONS['slide-start']!,loopEnd=start+1.0;
      if(active.phase==='exit'){
        this.pose={key:'slide-exit',time:Math.min(active.elapsed,.5),phase:'exit'};this.setHeight(1.68);this.move(new Vector3());
        if(active.elapsed>=.5)this.finish('completed','FINISHED','滑铲结束');
      }else{
        const t=active.elapsed;const height=t<.333?1.68-(1.68-.9)*Math.min(1,t/.333):.9;
        this.setHeight(height);this.pose={key:t<start?'slide-start':'slide-loop',time:t<start?t:(t-start)%2,phase:t<loopEnd?'slide':'clearance'};
        const speed=t<loopEnd?Math.max(.6,Math.min(5.8,active.initialSpeed)*Math.exp(-.85*t)):.75;
        const direction=t>=loopEnd&&input.lengthSq()>.01?input:active.direction;
        this.move(direction.clone().multiplyScalar(t>=loopEnd&&input.lengthSq()<.01?0:speed));
        if(t>=loopEnd){if(this.clearHeight(1.68)){active.phase='exit';active.elapsed=0;}else sim.lastResult='头顶不足：保持滑铲低姿态，WASD 移出后恢复';}
        if(!sim.grounded){this.finish('cancelled','LEFT_GROUND','滑铲离开地面，恢复下落');}
      }
      sim.state='slide';
    }else if(active.id==='pickup'){
      this.move(new Vector3());this.pose={key:'pickup',time:Math.min(active.elapsed,DURATIONS.pickup!),phase:'pickup'};sim.state='pickup';
      if(active.elapsed>=.30&&!active.attached){
        active.attached=true;this.carrying=active.targetId!;const target=this.targets.get(this.carrying)!;
        target.state='carried';target.collider?.setEnabled(false);
      }
      if(active.elapsed>=DURATIONS.pickup!)this.finish('completed','ATTACHED','已拾取：WASD 搬运，靠近台面 G 放下');
    }else if(active.id==='sit'){
      this.move(new Vector3());this.pose={key:'sit-enter',time:Math.min(active.elapsed,1.3),phase:'sit-enter'};sim.state='sit';
      if(active.elapsed>=1.3){this.seated=active.targetId!;this.targets.get(this.seated)!.state='occupied';this.finish('completed','SEATED','已坐下：按 E 或空格起身');}
    }else if(active.id==='standUp'){
      this.move(new Vector3());this.pose={key:'sit-exit',time:Math.min(active.elapsed,DURATIONS['sit-exit']!),phase:'sit-exit'};sim.state='stand-up';
      if(active.elapsed>=DURATIONS['sit-exit']!){this.targets.get(this.seated!)!.state='available';this.seated=null;this.finish('completed','STANDING','已起身');}
    }
    if(this.active){const result=this.results.get(active.requestId);if(result)result.phase=this.pose?.phase??active.phase;}
    return true;
  }
  syncCarried(position?:Vector3){
    if(!this.carrying)return;
    const target=this.targets.get(this.carrying)!;
    target.position.copy(position??this.sim.position.clone().addScaledVector(UP,1.057).addScaledVector(this.sim.facing,.123));
  }
}
