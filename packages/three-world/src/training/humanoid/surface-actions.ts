import RAPIER from '@dimforge/rapier3d-compat';
import {Quaternion,Vector3} from 'three';
import type {HumanoidActionContext} from './types';
import type {ClimbSurface,SurfaceCommands,SurfacePose} from './surface-types';
import runtime from './action-runtime.json';

export const SURFACE_TUNING=Object.freeze({standingHeightMeters:1.68,proneHeightMeters:.66,climbHeightMeters:1.76,proneSpeedMetersPerSecond:.85,climbVerticalSpeedMetersPerSecond:.72,climbLateralSpeedMetersPerSecond:.42,entryDistanceMinimumMeters:.28,entryDistanceMaximumMeters:.8});
const DT=1/60,RADIUS=.28,STAND_HEIGHT=SURFACE_TUNING.standingHeightMeters,PRONE_HEIGHT=SURFACE_TUNING.proneHeightMeters,CLIMB_HEIGHT=SURFACE_TUNING.climbHeightMeters;
const UP=new Vector3(0,1,0),ROT={x:0,y:0,z:0,w:1};
const META=new Map(runtime.clips.map(clip=>[clip.id,clip]));
const duration=(id:string)=>META.get(id)?.duration??1;
const heightAt=(id:string,time:number)=>{
  const samples=META.get(id)!.heightSamples;
  // Guard the next 100 ms as well as the current source pose, giving animation
  // blending and the approaching head enough clearance during transitions.
  let height=0;
  for(const sample of samples)if(Math.abs(sample.time-time)<.11)height=Math.max(height,sample.height);
  return Math.max(PRONE_HEIGHT,Math.min(1.72,height+.035));
};
const PRONE_CLIPS=['prone-enter','prone-exit','prone-idle','prone-forward'];
const CLIMB_CLIPS=['hang-enter','hang-exit','hang-idle','hang-left','hang-right','climb-up','climb-down'];

/** Optional collision-backed surface skills; all poses come from converted source clips. */
export class SurfaceActions {
  availableClips=new Set<string>();
  mode:'none'|'prone'|'climbing'='none';
  pose:SurfacePose|null=null;
  surface:ClimbSurface|null=null;
  private phase='';
  private time=0;
  private loopTime=0;
  private proneMotionGrace=0;
  private alignTime=0;
  private normal=new Vector3();
  private tangent=new Vector3();
  private target=new Vector3();
  constructor(private sim:HumanoidActionContext){}

  reset(){
    const owned=this.mode!=='none';
    this.mode='none';this.pose=null;this.surface=null;this.phase='';this.time=0;this.loopTime=0;this.proneMotionGrace=0;
    if(owned){this.setHeight(STAND_HEIGHT);this.restoreController();}
  }
  private restoreController(){this.sim.controller.enableAutostep(.27,.2,false);this.sim.controller.enableSnapToGround(.18);}
  private clearHeight(height:number){
    return !this.sim.world.intersectionWithShape(this.sim.position.clone().addScaledVector(UP,height/2),ROT,
      new RAPIER.Capsule(height/2-RADIUS,RADIUS),RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,this.sim.capsule);
  }
  private setHeight(height:number){
    const sim=this.sim,half=height/2-RADIUS;
    if(Math.abs(sim.capsuleHalf-half)<1e-6)return;
    sim.actionCapsuleHalf=Math.abs(height-STAND_HEIGHT)<1e-6?null:half;
    sim.capsule.setShape(new RAPIER.Capsule(half,RADIUS));
    const center=sim.position.clone().addScaledVector(UP,height/2);
    sim.body.setTranslation(center,true);sim.body.setNextKinematicTranslation(center);
    sim.world.propagateModifiedBodyPositionsToColliders();
  }
  private move(delta:Vector3,gravity:boolean){
    const sim=this.sim;
    if(gravity){sim.vertical=Math.max(-16,sim.vertical-18*DT);delta.y=sim.vertical*DT;}
    sim.controller.computeColliderMovement(sim.capsule,delta,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    const movement=sim.controller.computedMovement(),current=sim.body.translation();
    sim.body.setNextKinematicTranslation({x:current.x+movement.x,y:current.y+movement.y,z:current.z+movement.z});
    sim.collisions=sim.controller.numComputedCollisions();
    sim.grounded=gravity&&sim.controller.computedGrounded();
    if(sim.grounded&&sim.vertical<0)sim.vertical=0;
    sim.velocity.set(movement.x/DT,0,movement.z/DT);sim.speed=(gravity?Math.hypot(movement.x,movement.z):Math.hypot(movement.x,movement.y,movement.z))/DT;
    sim.commitPose();sim.sync();return new Vector3(movement.x,movement.y,movement.z);
  }
  /** Additional query hull covers the extended prone limbs beyond the main low capsule. */
  private proneHull(position=this.sim.position){
    const forward=this.sim.facing;
    return {center:position.clone().addScaledVector(UP,.36).addScaledVector(forward,-.25),
      rotation:new Quaternion().setFromAxisAngle(UP,Math.atan2(forward.x,forward.z)),shape:new RAPIER.Cuboid(.36,.30,.94)};
  }
  private proneObstacle=(collider:RAPIER.Collider)=>{
    const block=this.sim.blocks.find(block=>block.collider?.handle===collider.handle);
    // The KCC capsule still handles ground and step edges. The additional body
    // hull must not latch onto the platform behind the hips while moving off it.
    return !block||!!block.rotation||(block.y??0)+block.h>this.sim.position.y+.18;
  };
  private clearProne(){const hull=this.proneHull();return !this.sim.world.intersectionWithShape(hull.center,hull.rotation,hull.shape,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,this.sim.capsule,undefined,this.proneObstacle);}
  private proneMovement(input:Vector3){
    const sim=this.sim;
    if(input.lengthSq()>.01){
      const a=Math.atan2(sim.facing.x,sim.facing.z),b=Math.atan2(input.x,input.z),diff=Math.atan2(Math.sin(b-a),Math.cos(b-a));
      const yaw=a+Math.max(-3*DT,Math.min(3*DT,diff));
      const old=sim.facing.clone();sim.facing.set(Math.sin(yaw),0,Math.cos(yaw));
      if(!this.clearProne())sim.facing.copy(old);
    }
    const delta=input.clone().setY(0).multiplyScalar(SURFACE_TUNING.proneSpeedMetersPerSecond*DT);
    const hull=this.proneHull();
    if(delta.lengthSq()>0){
      const hit=sim.world.castShape(hull.center,hull.rotation,delta,hull.shape,0,1,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,sim.capsule,undefined,this.proneObstacle);
      if(hit)delta.multiplyScalar(Math.max(0,hit.time_of_impact-.03));
    }
    return this.move(delta,true);
  }
  eligibility(action:'prone'|'climb'|'releaseClimb'){
    const sim=this.sim;
    const reject=(reason:string,message:string)=>({eligible:false,reason,message});
    if(sim.isMounted)return reject('MOUNTED','请先离开载具或坐骑');
    if(action==='releaseClimb')return this.mode==='climbing'?{eligible:true,reason:'READY',message:'可松手'}:reject('NOT_CLIMBING','当前未攀爬');
    if(sim.skills.active||sim.skills.carrying||sim.skills.seated)return reject('BUSY','请先完成动作、放下物件或起身');
    if(action==='prone'&&this.mode==='prone')return this.phase!=='loop'?reject('BUSY','姿态过渡中'):!this.clearHeight(1.72)?reject('HEADROOM_BLOCKED','低顶下不能起身'): {eligible:true,reason:'READY',message:'可起身'};
    if(this.mode!=='none'||sim.traversal||sim.swimming)return reject('INVALID_STATE','请先回到可站立地面');
    const missing=(action==='prone'?PRONE_CLIPS:CLIMB_CLIPS).find(id=>!this.availableClips.has(id));
    if(missing)return reject('ASSET_UNAVAILABLE',`尚未载入动作 ${missing}`);
    if(action==='prone'){
      if(!sim.grounded)return reject('NOT_GROUNDED','匍匐需要地面支撑');
      if(!this.clearProne())return reject('BODY_CLEARANCE_BLOCKED','周围空间不足，身体无法趴下');
    }else{
      if(sim.stance!=='stand')return reject('STANCE_REQUIRED','请先站立');
      if(!this.chooseSurface())return reject('NO_CLIMB_SURFACE','靠近并正对绑定碰撞体的攀爬面');
      if(!this.clearHeight(CLIMB_HEIGHT))return reject('HEADROOM_BLOCKED','攀爬入口头顶空间不足');
    }
    return {eligible:true,reason:'READY',message:'可执行'};
  }
  private startProne(){
    const sim=this.sim;
    const eligibility=this.eligibility('prone');if(!eligibility.eligible){sim.lastResult=eligibility.message;return false;}
    this.mode='prone';this.phase='enter';this.time=0;this.loopTime=0;
    sim.stance='stand';sim.animationEvent=null;sim.completedMotion=null;sim.jumpBuffer=0;
    sim.controller.disableAutostep();sim.lastResult='匍匐：正在趴下';return true;
  }
  private stepProne(input:Vector3,commands:SurfaceCommands,jump:boolean){
    const sim=this.sim;
    if((commands.prone||jump)&&this.phase==='loop'){
      if(this.clearHeight(1.72)){this.phase='exit';this.time=0;sim.lastResult='匍匐：正在起身';}
      else sim.lastResult='低顶下不能起身；继续爬出通道后按 Z';
    }
    if(this.phase==='enter'||this.phase==='exit'){
      const key=this.phase==='enter'?'prone-enter':'prone-exit',next=this.time+DT;
      const height=heightAt(key,next);
      if(height>sim.capsuleHeight+.001&&!this.clearHeight(height)){
        this.phase='loop';this.time=0;this.setHeight(PRONE_HEIGHT);sim.lastResult='头顶被挡，保持匍匐';
      }else{
        this.time=next;this.setHeight(height);this.pose={key,time:Math.min(this.time,duration(key)),phase:this.phase==='enter'?'趴下过渡':'起身过渡'};
        this.move(new Vector3(),true);sim.state='prone-transition';
        if(this.time>=duration(key)){
          if(this.phase==='enter'){this.phase='loop';this.time=0;this.setHeight(PRONE_HEIGHT);}
          else {this.reset();sim.state='idle';sim.lastResult='已从匍匐恢复站立';}
        }
        return true;
      }
    }
    this.setHeight(PRONE_HEIGHT);this.loopTime+=DT;this.proneMovement(input);
    // Ground contact correction can consume an isolated physics tick. Keep the
    // crawl cycle through that tick; sustained blocking still becomes idle.
    this.proneMotionGrace=sim.speed>.06?.1:Math.max(0,this.proneMotionGrace-DT);
    const moving=input.lengthSq()>.01&&this.proneMotionGrace>0;
    this.pose={key:moving?'prone-forward':'prone-idle',time:this.loopTime%(duration(moving?'prone-forward':'prone-idle')),phase:moving?'匍匐移动':'匍匐待机'};
    sim.state=sim.grounded?(moving?'prone-move':'prone'):'fall';
    if(!sim.grounded&&sim.vertical< -2&&this.clearHeight(STAND_HEIGHT)){this.reset();sim.state='fall';}
    return true;
  }
  private chooseSurface(){
    const sim=this.sim,definitions=(sim.level as {climbSurfaces?:ClimbSurface[]}|undefined)?.climbSurfaces??[];
    return definitions.map(surface=>{
      const normal=new Vector3(...surface.normal).setY(0).normalize(),tangent=new Vector3(normal.z,0,-normal.x),center=new Vector3(...surface.center);
      const delta=sim.position.clone().sub(center),distance=delta.dot(normal),lateral=delta.dot(tangent);
      const collider=sim.blocks.find(block=>block.id===surface.colliderId)?.collider;
      const margin=surface.kind==='ladder'?.18:.65;
      if(!collider||normal.lengthSq()<.9||surface.maxY-surface.minY<1.7||surface.width<.65||distance<SURFACE_TUNING.entryDistanceMinimumMeters||distance>SURFACE_TUNING.entryDistanceMaximumMeters
        ||Math.abs(lateral)>surface.width/2-margin||sim.facing.dot(normal)>-.55||sim.position.y<surface.minY-.05||sim.position.y>surface.maxY-1.4)return null;
      const origin=sim.position.clone().addScaledVector(UP,.95);
      const hit=sim.ray(origin,normal.clone().negate(),.85,undefined);
      if(!hit||hit.collider.handle!==collider.handle||new Vector3(hit.normal.x,hit.normal.y,hit.normal.z).dot(normal)<.9)return null;
      return {surface,normal,tangent,center,distance,lateral};
    }).filter(item=>item!==null).sort((a,b)=>a.distance-b.distance)[0];
  }
  private startClimb(){
    const sim=this.sim;
    const eligibility=this.eligibility('climb');if(!eligibility.eligible){sim.lastResult=eligibility.message;return false;}
    const match=this.chooseSurface()!;
    this.surface=match.surface;this.normal.copy(match.normal);this.tangent.copy(match.tangent);
    this.target.copy(match.center).addScaledVector(match.normal,.30).addScaledVector(match.tangent,match.surface.kind==='ladder'?0:match.lateral);
    this.target.y=Math.max(sim.position.y,match.surface.minY+.08);
    this.mode='climbing';this.phase='align';this.time=0;this.alignTime=0;this.loopTime=0;this.pose=null;
    sim.animationEvent=null;sim.completedMotion=null;sim.jumpBuffer=0;
    sim.controller.disableAutostep();sim.controller.disableSnapToGround();this.setHeight(CLIMB_HEIGHT);
    sim.lastResult='攀爬：靠近墙面';return true;
  }
  private release(){
    const sim=this.sim;this.reset();sim.grounded=false;sim.vertical=Math.min(-.5,sim.vertical);sim.jumpBuffer=0;sim.cooldown=.25;
    sim.lastResult='已松开攀爬面，恢复重力';sim.state='fall';
  }
  private tryTop(){
    const sim=this.sim;
    this.setHeight(STAND_HEIGHT);
    const probe=sim.detect(this.normal.clone().negate(),false);
    // A supported wall contact has no falling momentum; the existing GASP
    // close-wall entry planner can take over from this precise 3-D anchor.
    sim.controller.enableAutostep(.27,.2,false);
    if(probe&&probe.kind!=='blocked'&&sim.begin(probe,false)){
      this.mode='none';this.phase='';this.surface=null;this.pose=null;sim.lastResult='攀爬到顶，接入 GASP 翻上';return true;
    }
    sim.controller.disableAutostep();this.setHeight(CLIMB_HEIGHT);sim.lastResult='顶部暂不具备可翻上的空间';return false;
  }
  private stepClimb(input:Vector3,commands:SurfaceCommands,jump:boolean){
    const sim=this.sim,surface=this.surface!;
    if(commands.releaseClimb){this.release();return false;}
    if(jump){if(this.phase==='loop'&&this.tryTop())return true;sim.lastResult='顶部暂不具备可翻上的空间';}
    if(commands.climb){
      if(this.phase==='loop'&&sim.position.y<=surface.minY+.16){this.phase='exit';this.time=0;}
      else {this.release();return false;}
    }
    const wall=sim.blocks.find(block=>block.id===surface.colliderId)?.collider;
    const hit=sim.ray(sim.position.clone().addScaledVector(UP,.95),this.normal.clone().negate(),.85,undefined);
    if(!wall||!hit||hit.collider.handle!==wall.handle){this.release();return false;}
    sim.facing.copy(this.normal).negate();sim.jumpBuffer=0;sim.animationEvent=null;
    if(this.phase!=='align')sim.vertical=0;
    if(this.phase==='align'){
      this.alignTime+=DT;
      const delta=this.target.clone().sub(sim.position).setY(0);if(delta.length()>1.2*DT)delta.setLength(1.2*DT);
      // Ordinary support/gravity continues until actual wall contact. A null
      // surface pose therefore displays locomotion on the ground, not falling.
      this.move(delta,true);sim.state=sim.grounded?'climb-approach':'fall';
      if(Math.hypot(sim.position.x-this.target.x,sim.position.z-this.target.z)<.035){this.phase='enter';this.time=0;}
      else if(this.alignTime>1.2){this.release();sim.lastResult='攀爬接近路径被挡';}
      return true;
    }
    if(this.phase==='enter'||this.phase==='exit'){
      this.time+=DT;const key=this.phase==='enter'?'hang-enter':'hang-exit';
      this.pose={key,time:Math.min(duration(key),this.time),phase:this.phase==='enter'?'握住攀爬面':'离开攀爬面'};
      const lift=this.phase==='enter'?Math.max(0,Math.min(.35*DT,surface.minY+.08-sim.position.y)):0;
      this.move(new Vector3(0,lift,0),false);sim.state='climb-surface';
      if(this.time>=duration(key)){
        if(this.phase==='enter'){this.phase='loop';this.loopTime=0;}
        else this.release();
      }
      return true;
    }
    const up=Math.max(-1,Math.min(1,-input.dot(this.normal))),side=surface.kind==='ladder'?0:input.dot(this.tangent);
    const currentSide=sim.position.clone().sub(new Vector3(...surface.center)).dot(this.tangent);
    const limit=surface.width/2-(surface.kind==='ladder'?.18:.65);
    const nextSide=Math.max(-limit,Math.min(limit,currentSide+side*SURFACE_TUNING.climbLateralSpeedMetersPerSecond*DT));
    const top=surface.maxY-1.4;
    const nextY=Math.max(surface.minY+.08,Math.min(top,sim.position.y+up*SURFACE_TUNING.climbVerticalSpeedMetersPerSecond*DT));
    const delta=this.tangent.clone().multiplyScalar(nextSide-currentSide);delta.y=nextY-sim.position.y;
    const actual=this.move(delta,false);this.loopTime+=DT;
    const key=actual.y>.001?'climb-up':actual.y<-.001?'climb-down':Math.abs(actual.dot(this.tangent))>.001?(side<0?'hang-left':'hang-right'):'hang-idle';
    this.pose={key,time:this.loopTime%duration(key),phase:surface.kind==='ladder'?'梯子攀爬':Math.abs(side)>.1?'沿墙横移':'岩壁攀爬'};
    sim.state=surface.kind==='ladder'?'ladder':'climb-surface';
    if(up>.3&&sim.position.y>=top-.02)this.tryTop();
    return true;
  }

  /** Returns true after consuming this fixed physics tick. */
  step(input:Vector3,commands:SurfaceCommands={},jump=false){
    if(this.sim.swimming||this.sim.traversal){if(this.mode!=='none')this.reset();return false;}
    if(this.mode==='none'){
      if(commands.prone){if(!this.startProne())return false;}
      else if(commands.climb){if(!this.startClimb())return false;}
      else return false;
      // The activation edge must not immediately toggle the new mode off.
      commands={};jump=false;
    }
    return this.mode==='prone'?this.stepProne(input,commands,jump):this.stepClimb(input,commands,jump);
  }
}
