import {actorResources,FULL_BODY_RESOURCES,type ActorResources} from '../../actor-resources';
import RAPIER from '@dimforge/rapier3d-compat';
import {contactColliderVolume} from '../../physics-box';
import { Vector3 } from 'three';
import {type EnvironmentQueries,type HumanoidRig,type QueryBody} from '../environment/queries';
import {humanoidLevel,type HumanoidLevel,type LevelBox} from './level-adapter';
import {createTraversalMotion,type MotionPlan,type MotionSource} from './motion';
import {SWIM_ROOT_DEPTH,SWIM_SPEED,SWIM_FAST_SPEED,swimVerticalVelocity,underwaterVerticalVelocity,type WaterContact} from './water-physics';
import {SWIMMING_TUNING} from '../../config/actions';
import {ActionSystem,type ActionCommands} from './action-system';
import {SurfaceActions} from './surface-actions';
import type {SurfaceCommands} from './surface-types';

export const FIXED_DT = 1 / 60;
export const RADIUS = 0.28;
export const HALF = 0.56;
export const CENTER = RADIUS + HALF;
export const HUMANOID_BODY:QueryBody=Object.freeze({kind:'capsule',radius:RADIUS,height:CENTER*2,offset:[0,CENTER,0] as const});
// Rapier checks free space beyond the capsule after stepping. Requiring .30 m
// stalls on .36 m treads when the next riser enters that probe; .20 m still
// requires forward clearance without increasing the .27 m climb height.
const STEP_MIN_WIDTH = .2;
// The source crouch-walk's measured head height reaches 1.264 m.
export const CROUCH_HALF = .38;
export interface AnimationEvent { id:number; kind:'jump'|'land'|'start'|'stop'|'turn'|'pivot'; elapsed:number; turn:number; heavy:boolean; moving:boolean; speed?:number; strength?:number }
export type Kind = 'vault' | 'mantle' | 'climb' | 'blocked';
export interface Block extends LevelBox { collider?: RAPIER.Collider|undefined }
export interface Probe { kind: Kind; height: number; heightKnown: boolean; depth: number; reason: string; front: Vector3; top: Vector3; normal: Vector3; end: Vector3; collider: RAPIER.Collider; topCollider?: RAPIER.Collider; distance: number }
export interface Traversal { probe: Probe; start: Vector3; elapsed: number; duration: number; progress: number; phase: string; motion:MotionPlan; safePositions:Vector3[]; entryVelocity?:Vector3; airborne?:boolean }
const UP = new Vector3(0,1,0);
const ROT = {x:0,y:0,z:0,w:1};
export const ease = (x:number) => { x=Math.max(0,Math.min(1,x)); return x*x*(3-2*x); };
export const TRAVERSAL_LIMITS=Object.freeze({minimumHeightMeters:.35,maximumHeightMeters:2.75,minimumDepthMeters:.55});
export function classify(height:number, depth:number):Kind {
  if (height > TRAVERSAL_LIMITS.maximumHeightMeters || height < TRAVERSAL_LIMITS.minimumHeightMeters || depth < TRAVERSAL_LIMITS.minimumDepthMeters) return 'blocked';
  if (height <= 1.05 && depth <= 1.15) return 'vault';
  return height <= 1.65 ? 'mantle' : 'climb';
}
export function trajectory(tr:Traversal,t:number):Vector3 {
  return tr.motion.sample(t*tr.duration).position;
}
/** Original tuned traversal controller, borrowing the host map's single Rapier world.
 * step() advances actor data by FIXED_DT; only the host calls q.stepPhysics().
 */
export class HumanoidController {
  movementTuning={speedScale:1,accelerationScale:1,airControlScale:1,turnScale:1,maxSpeed:5.8,slowSpeed:1.45,coastDeceleration:20,jumpSpeed:6.3};
  world: RAPIER.World;
  body: RAPIER.RigidBody;
  capsule: RAPIER.Collider;
  controller:RAPIER.KinematicCharacterController;
  blocks:Block[];
  level:HumanoidLevel;
  private rig:HumanoidRig;
  private mounted=false;
  private disposed=false;
  // A vertical face sweep fills the gaps between horizontal detector rays,
  // including thin suspended ledges; it does not change the movement capsule.
  private readonly ledgeSweep=new RAPIER.Cuboid(.002,1.2,.002);
  checkpoint={x:-6,y:.03,z:2.1,yaw:0};
  crates:{id:string;body:RAPIER.RigidBody;size:number;initial:Vector3}[]=[];
  position=new Vector3(-6,.03,2.1);
  velocity=new Vector3();
  locomotionTargetSpeed=0;
  facing=new Vector3(0,0,-1);
  grounded=false;
  vertical=0;
  probe:Probe|null=null;
  traversal:Traversal|null=null;
  state='idle';
  stance:'stand'|'crouch'='stand';
  swimming=false;
  private underwaterControl=false;
  swimStyle:'breaststroke'|'freestyle'='breaststroke';
  water:WaterContact|null=null;
  waterEntrySerial=0;
  waterEntrySpeed=0;
  actionCapsuleHalf:number|null=null;
  skills:ActionSystem;
  surface:SurfaceActions;
  get capsuleHalf(){return this.actionCapsuleHalf??(this.stance==='crouch'?CROUCH_HALF:HALF);}
  get capsuleCenter(){return RADIUS+this.capsuleHalf;}
  get capsuleHeight(){return this.capsuleCenter*2;}
  animationEvent:AnimationEvent|null=null;
  private animationSerial=0;
  private wasMoving=false;
  private stationaryTime=0;
  private positionHistory:Vector3[]=[];
  private airborneTime=0;
  private turnCooldown=0;
  private inputHeldTime=0;
  private runHeldTime=0;
  private startEmitted=false;
  private lastMoveInput=new Vector3();
  private recentSpeeds:number[]=[];
  // Brief support gaps at seams do not constitute a new visual fall. A real
  // upward jump switches immediately; collision itself always uses grounded.
  get animationGrounded(){return !this.swimming&&(this.grounded||this.airborneTime<=.08&&this.vertical<=0&&this.vertical> -1.5);}
  // Automatic traversal is an opt-in lab aid. Normal play requires movement + Space.
  autoTraverse=false;
  // One directional jump can catch a ledge throughout its airborne approach.
  // Releasing movement, landing, changing action/possession, or teleporting cancels it.
  private traversalRequested=false;
  events:{time:number;kind:string;height:number;result:string}[]=[];
  elapsed=0;
  cooldown=0;
  jumpBuffer=0;
  coyote=0;
  speed=0;
  collisions=0;
  handTargets:Vector3[]=[];
  motionSources:MotionSource[]=[];
  /** Last pose retained through the physics completion tick for exit blending. */
  completedMotion:{sourceId:string;sourceTime:number;serial:number}|null=null;
  motionSerial=0;
  lastResult='朝障碍移动 + 空格：翻越 / 攀上';
  get resources():ActorResources{return this.queries.interactions.actorResources;}
  get canBoard(){return !this.skills.active&&!this.skills.carrying&&!this.skills.seated&&this.surface.mode==='none'&&!this.traversal&&this.stance==='stand';}
  get boardingReason(){return this.skills.carrying?'请先放下手中物件':this.skills.seated?'请先起身':this.surface.mode==='prone'?'请先从匍匐起身':this.surface.mode==='climbing'?'请先退出攀爬':this.traversal||this.skills.active?'请等待当前动作完成':this.stance==='crouch'?'请先站起':'';}
  get isMounted(){return this.mounted;}
  constructor(private queries:EnvironmentQueries,readonly actorId:string|null=null) {
    this.level=humanoidLevel(queries.map);
    this.blocks=this.level.boxes.map(b=>({...b,collider:queries.colliderForId(b.id)}));
    this.position.set(...queries.map.playerSpawn);
    this.checkpoint={x:this.position.x,y:this.position.y,z:this.position.z,yaw:Math.PI};
    this.rig=queries.createHumanoidRig(this.position,HALF,RADIUS);
    this.world=this.rig.world;this.body=this.rig.body;this.capsule=this.rig.capsule;this.controller=this.rig.controller;
    this.controller.enableAutostep(.27,STEP_MIN_WIDTH,false);
    this.controller.enableSnapToGround(.18);
    this.controller.setMaxSlopeClimbAngle(Math.PI/4);
    this.controller.setMinSlopeSlideAngle(Math.PI/3);
    this.controller.setApplyImpulsesToDynamicBodies(true);
    this.controller.setCharacterMass(75);
    this.crates=queries.looseCrates;
    this.skills=new ActionSystem(this,queries.interactions);
    this.surface=new SurfaceActions(this);
    this.facing.set(0,0,1);
    this.world.propagateModifiedBodyPositionsToColliders();
  }
  reset(x=this.checkpoint.x,z=this.checkpoint.z,y=this.checkpoint.y,yaw=this.checkpoint.yaw){
    this.skills.reset();
    this.surface.reset();
    this.checkpoint={x,y,z,yaw};
    this.resetMovement(x,z,y,yaw);
  }
  /** External host heading uses +Z. The original reset() above retains its source -Z convention. */
  resetAt(position:Vector3,yaw=0){this.mounted=false;this.capsule.setEnabled(true);this.reset(position.x,position.z,position.y,yaw-Math.PI);}
  /** Teleports do not recreate, move, or reset any world interaction target. */
  carryPlatform(deltaY:number){if(!deltaY)return;this.position.y+=deltaY;const p=this.body.translation();this.body.setTranslation({x:p.x,y:p.y+deltaY,z:p.z},true);this.body.setNextKinematicTranslation({x:p.x,y:p.y+deltaY,z:p.z});}
  teleportTo(position:Vector3,yaw=0){
    if(!this.canBoard){this.lastResult=this.boardingReason;return false;}
    this.surface.reset();this.resetMovement(position.x,position.z,position.y,yaw-Math.PI);return true;
  }
  /** The Simulation has already checked standing and carried-body clearance. */
  recoverTo(position:Vector3,yaw=0){
    this.skills.interruptForRecovery();this.surface.reset();
    this.resetMovement(position.x,position.z,position.y,yaw-Math.PI);
    this.skills.syncCarried();this.grounded=true;this.lastResult='已返回安全检查点';
  }
  get standingQueryBody(): QueryBody {
    return {
      kind: "capsule",
      radius: RADIUS,
      height: 2 * CENTER,
      offset: [0, CENTER, 0],
    };
  }
  /** Receives an already validated synchronous dismount decision. */
  commitDismount(position: Vector3, yaw: number, velocity: Vector3): void {
    this.surface.reset();
    this.resetMovement(position.x, position.z, position.y, yaw - Math.PI);
    this.velocity.set(velocity.x, 0, velocity.z);
    this.vertical = velocity.y;
    this.mounted = false;
    this.capsule.setEnabled(true);
    this.commitPose();
  }
  setMounted(mounted:boolean,position?:Vector3,yaw=0){
    if(mounted&&!this.canBoard){this.lastResult=this.boardingReason;return false;}
    if(position&&!this.teleportTo(position,yaw))return false;
    this.traversalRequested=false;
    this.mounted=mounted;this.capsule.setEnabled(!mounted);return true;
  }
  setAvailableClips(clips:ReadonlySet<string>,sources:readonly MotionSource[]){
    this.skills.availableClips=new Set(clips);this.surface.availableClips=new Set(clips);this.motionSources=[...sources];
  }
  /** Synchronize the actor immediately for queries; never integrate world physics here. */
  commitPose(){this.body.setTranslation(this.body.nextTranslation(),true);this.world.updateSceneQueries([this.capsule.handle]);}
  private resetMovement(x:number,z:number,y:number,yaw:number){
    this.locomotionTargetSpeed=0;
    this.resources.release(this);
    this.traversalRequested=false;
    this.completedMotion=null;this.motionSerial++;this.controller.enableSnapToGround(.18);this.controller.enableAutostep(.27,STEP_MIN_WIDTH,false);
    this.swimming=false;this.underwaterControl=false;this.water=null;this.waterEntrySpeed=0;
    this.stance='stand';this.actionCapsuleHalf=null;this.capsule.setShape(new RAPIER.Capsule(HALF,RADIUS));this.animationEvent=null;this.wasMoving=false;this.stationaryTime=0;this.positionHistory=[];this.airborneTime=0;this.turnCooldown=0;
    this.inputHeldTime=0;this.runHeldTime=0;this.startEmitted=false;this.lastMoveInput.set(0,0,0);
    this.recentSpeeds=[];
    this.position.set(x,y,z); this.body.setTranslation({x,y:CENTER+y,z},true); this.body.setNextKinematicTranslation({x,y:CENTER+y,z});
    this.velocity.set(0,0,0); this.vertical=0; this.facing.set(-Math.sin(yaw),0,-Math.cos(yaw)); this.traversal=null; this.probe=null;this.handTargets=[];this.state='idle';this.cooldown=.25;this.grounded=false;this.jumpBuffer=0;this.coyote=0;this.speed=0;this.lastResult='朝障碍移动 + 空格：翻越 / 攀上';
    this.commitPose();
  }
  resetCrates(){for(const c of this.crates){c.body.setTranslation(c.initial,true);c.body.setRotation(ROT,true);c.body.setLinvel({x:0,y:0,z:0},true);c.body.setAngvel({x:0,y:0,z:0},true);} }
  ray(origin:Vector3,dir:Vector3,length:number,predicate?:(c:RAPIER.Collider)=>boolean){
    return this.world.castRayAndGetNormal(new RAPIER.Ray(origin,dir),length,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,this.capsule,undefined,predicate);
  }
  private emitAnimation(kind:AnimationEvent['kind'],turn=0,heavy=false,moving=this.speed>.2,strength=1,speed=this.speed){
    this.animationEvent={id:++this.animationSerial,kind,elapsed:0,turn,heavy,moving,strength,speed};
  }
  crouchEligibility(){
    const reject=(reason:string,message:string)=>({eligible:false,reason,message});
    if(this.mounted)return reject('MOUNTED','请先离开载具或坐骑');
    if(!this.grounded)return reject('NOT_GROUNDED','蹲伏需要地面支撑');
    if(this.skills.active||this.skills.carrying||this.skills.seated||this.surface.mode!=='none'||this.swimming||this.traversal)return reject('INVALID_STATE','请先回到空手且可自由移动的状态');
    const half=this.stance==='stand'?CROUCH_HALF:HALF;
    if(this.world.intersectionWithShape(this.position.clone().addScaledVector(UP,half+RADIUS),ROT,new RAPIER.Capsule(half,RADIUS),RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,this.capsule))return reject('HEADROOM_BLOCKED','头顶空间不足');
    return {eligible:true,reason:'READY',message:'可切换蹲伏姿态'};
  }
  private changeStance(stance:'stand'|'crouch'){
    if(stance===this.stance)return true;
    const half=stance==='stand'?HALF:CROUCH_HALF,center=half+RADIUS;
    if(this.world.intersectionWithShape(this.position.clone().addScaledVector(UP,center),ROT,new RAPIER.Capsule(half,RADIUS),RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,this.capsule)){
      this.lastResult='头顶空间不足，无法站起';return false;
    }
    this.stance=stance;this.animationEvent=null;this.capsule.setShape(new RAPIER.Capsule(half,RADIUS));
    this.startEmitted=true;this.runHeldTime=0;
    this.recentSpeeds=[];
    const position=this.position.clone().addScaledVector(UP,center);
    this.body.setTranslation(position,true);this.body.setNextKinematicTranslation(position);
    this.world.propagateModifiedBodyPositionsToColliders();
    this.lastResult=stance==='crouch'?'蹲伏：降低胶囊通过低矮空间':'已站起';return true;
  }
  private updateWaterContact(){
    const wasSwimming=this.swimming;
    const volume=this.level?.waters?.find(w=>Math.abs(this.position.x-w.x)<=w.w/2&&Math.abs(this.position.z-w.z)<=w.d/2
      &&this.position.y<w.surfaceY+.03&&this.position.y+this.capsuleHeight>w.bottomY);
    if(volume){
      // Measure support below the swimmer, not a submerged roof above them.
      const floorOrigin=new Vector3(this.position.x,Math.min(volume.surfaceY+.025,this.position.y+.025),this.position.z);
      const floor=this.ray(floorOrigin,new Vector3(0,-1,0),Math.max(.1,floorOrigin.y-volume.bottomY+.1),undefined);
      const floorY=floor&&floor.normal.y>.3?floorOrigin.y-floor.timeOfImpact:volume.bottomY;
      const depth=Math.max(0,volume.surfaceY-Math.max(volume.bottomY,floorY));
      this.water={swimmingMode:null,volumeId:volume.id,surfaceY:volume.surfaceY,depth,
        submersion:Math.max(0,Math.min(1,(volume.surfaceY-this.position.y)/this.capsuleHeight)),
        feetBelowSurfaceMeters:volume.surfaceY-this.position.y,
        requiredDepthMeters:wasSwimming?SWIM_ROOT_DEPTH+.01:SWIM_ROOT_DEPTH+.13,
        requiredFeetBelowSurfaceMeters:wasSwimming?.5:.95,
        depthCheckPassed:depth>(wasSwimming?SWIM_ROOT_DEPTH+.01:SWIM_ROOT_DEPTH+.13),
        immersionCheckPassed:this.position.y<volume.surfaceY-(wasSwimming?.5:.95),
        wasSwimmingAtSample:wasSwimming,
        entrySpeed:this.waterEntrySpeed,entrySerial:this.waterEntrySerial};
      // Hysteresis prevents repeated stance switches at the sloping shoreline.
      this.swimming=depth>(wasSwimming?SWIM_ROOT_DEPTH+.01:SWIM_ROOT_DEPTH+.13)
        &&this.position.y<volume.surfaceY-(wasSwimming?.5:.95);
    }else{this.water=null;this.swimming=false;}
    if(this.swimming&&!wasSwimming){
      this.skills.releaseIntoWater();
      this.waterEntrySerial++;this.waterEntrySpeed=Math.max(0,-this.vertical);
      this.water!.entrySpeed=this.waterEntrySpeed;this.water!.entrySerial=this.waterEntrySerial;
      this.animationEvent=null;this.completedMotion=null;this.jumpBuffer=0;this.coyote=0;
      this.inputHeldTime=0;this.runHeldTime=0;this.lastMoveInput.set(0,0,0);this.recentSpeeds=[];
      this.controller.disableSnapToGround();this.controller.disableAutostep();
      if(this.stance==='crouch')this.changeStance('stand');
      this.grounded=false;this.airborneTime=0;
      this.lastResult=this.waterEntrySpeed>7?'入水：水阻力减速，浮力恢复到水面':'进入深水：水面游泳';
    }else if(wasSwimming&&!this.swimming){
      this.controller.enableSnapToGround(.18);this.controller.enableAutostep(.27,STEP_MIN_WIDTH,false);
      this.animationEvent=null;this.airborneTime=0;this.wasMoving=false;this.startEmitted=true;
      this.lastResult=this.water?'水深变浅：恢复涉水行走':'离开水域：恢复陆地运动';
    }
    if(!this.swimming)this.underwaterControl=false;
    if(this.water)this.water.swimmingMode=this.swimming?(this.underwaterControl?'underwater':'surface'):null;
    return this.swimming;
  }
  private stepSwimming(input:Vector3,sprint:boolean,lift:number){
    const dt=FIXED_DT,water=this.water!;
    const surfaceTarget=water.surfaceY-SWIM_ROOT_DEPTH;
    if(lift<0)this.underwaterControl=true;
    else if(this.underwaterControl&&this.position.y>=surfaceTarget-SWIMMING_TUNING.surfaceReturnToleranceMeters)this.underwaterControl=false;
    const hasInput=input.lengthSq()>.01;
    const target=input.clone().setY(0).multiplyScalar(sprint?SWIM_FAST_SPEED:SWIM_SPEED);
    const change=target.sub(this.velocity).setY(0),acceleration=hasInput?3.8:5;
    if(change.length()>acceleration*dt)change.setLength(acceleration*dt);
    this.velocity.add(change);
    if(hasInput){
      const a=Math.atan2(this.facing.x,this.facing.z),b=Math.atan2(input.x,input.z);
      const diff=Math.atan2(Math.sin(b-a),Math.cos(b-a)),angle=a+Math.max(-4*dt,Math.min(4*dt,diff));
      this.facing.set(Math.sin(angle),0,Math.cos(angle));
    }
    this.probe=this.detect(hasInput?input:this.facing);
    const wantsClimb=hasInput&&(this.traversalRequested||this.autoTraverse);
    // A submerged swimmer first recovers to the surface. No underwater magnetic
    // catches, and the same ledge/headroom/path checks protect dry traversal.
    const atSurface=Math.abs(this.position.y-(water.surfaceY-SWIM_ROOT_DEPTH))<.2&&Math.abs(this.vertical)<2;
    // Only surface swimmers may step onto a shallow bank; divers cannot step
    // upward against their requested descent or through an underwater obstacle.
    if(atSurface&&!this.underwaterControl)this.controller.enableAutostep(.27,STEP_MIN_WIDTH,false);
    else this.controller.disableAutostep();
    if(wantsClimb&&!this.underwaterControl&&atSurface&&this.cooldown<=0&&this.probe&&this.probe.kind!=='blocked'
      &&this.probe.top.y>=water.surfaceY-.1&&this.begin(this.probe)){
      this.jumpBuffer=0;this.swimming=false;this.water=null;this.controller.enableAutostep(.27,STEP_MIN_WIDTH,false);
      return;
    }
    this.jumpBuffer=0;this.coyote=0;
    this.vertical=this.underwaterControl?underwaterVerticalVelocity(this.vertical,lift,dt):swimVerticalVelocity(this.position.y,this.vertical,water.surfaceY,dt);
    if(this.underwaterControl&&this.vertical>0)this.vertical=Math.min(this.vertical,Math.max(0,(surfaceTarget-this.position.y)/dt));
    const desired={x:this.velocity.x*dt,y:this.vertical*dt,z:this.velocity.z*dt};
    this.controller.computeColliderMovement(this.capsule,desired,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    const corrected=this.controller.computedMovement(),cur=this.body.translation();
    this.collisions=this.controller.numComputedCollisions();
    if(Math.abs(corrected.y-desired.y)>.005)this.vertical=0;
    this.body.setNextKinematicTranslation({x:cur.x+corrected.x,y:cur.y+corrected.y,z:cur.z+corrected.z});
    this.speed=Math.hypot(corrected.x,corrected.y,corrected.z)/dt;
    this.commitPose();this.sync();this.grounded=false;this.animationEvent=null;
    this.updateWaterContact();
    this.state=this.swimming?(this.speed<.12?'swim-idle':sprint?'swim-fast':'swim'):'fall';
    this.positionHistory.push(this.position.clone());if(this.positionHistory.length>36)this.positionHistory.shift();
    this.checkBounds();
  }
  detect(dir:Vector3,airborne=false):Probe|null {
    const direction=dir.clone().setY(0);
    if(direction.lengthSq()<1e-6)return null;
    direction.normalize();
    const reach=airborne?.86:1.12;
    let hit:RAPIER.RayColliderIntersection|null=null;
    let front=new Vector3(),normal=new Vector3(),distance=Infinity;
    // A center ray misses reachable faces during oblique camera-relative input.
    // Search a forward fan, but require a substantial inward movement component.
    // Looking beside a wall, moving parallel or moving away must not attract it.
    const probeFace=(origin:Vector3)=>{
      let found:RAPIER.RayColliderIntersection|null=null;
      for(const angle of [0,-25,25,-50,50]){
        const rayDirection=direction.clone().applyAxisAngle(UP,angle*Math.PI/180);
        const candidate=this.ray(origin,rayDirection,reach,undefined);
        if(!candidate || Math.abs(candidate.normal.y)>.25 || candidate.collider.parent()?.isDynamic() || this.queries.isActorCollider(candidate.collider))continue;
        const candidateNormal=new Vector3(candidate.normal.x,0,candidate.normal.z).normalize();
        if(direction.dot(candidateNormal)>-.45)continue;
        const rayContact=origin.clone().addScaledVector(rayDirection,candidate.timeOfImpact);
        const wallDistance=origin.clone().sub(rayContact).dot(candidateNormal);
        if(wallDistance<.02 || wallDistance>reach || wallDistance>=distance)continue;
        // Recheck the closest point on the physical face. This avoids dragging
        // the character sideways toward a distant ray contact or around a corner.
        const towardWall=candidateNormal.clone().negate();
        const closest=this.ray(origin,towardWall,Math.min(reach,wallDistance+.025),undefined);
        if(!closest || closest.collider.handle!==candidate.collider.handle
          || new Vector3(closest.normal.x,closest.normal.y,closest.normal.z).dot(candidateNormal)<.98)continue;
        found=closest;normal=candidateNormal;distance=closest.timeOfImpact;
        front=origin.clone().addScaledVector(towardWall,distance);
      }
      return found;
    };
    for(const height of airborne?[.12,.48,1,1.5]:[.48])hit=probeFace(this.position.clone().addScaledVector(UP,height))??hit;
    if(!hit){
      // Keep the tuned low-ray/air-catch results first. When those miss, sweep
      // continuously from .35 to 2.75 m, then recheck the actual hit height with
      // the same rays/normal/approach gates. Scattered extra rays still miss a
      // thin slab that lies between their sample heights.
      const origin=this.position.clone().addScaledVector(UP,1.55),sampledHeights:number[]=[];
      for(const angle of [0,-25,25,-50,50]){
        const rayDirection=direction.clone().applyAxisAngle(UP,angle*Math.PI/180);
        const candidate=this.world.castShape(origin,ROT,rayDirection,this.ledgeSweep,0,reach,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,this.capsule);
        if(!candidate || Math.abs(candidate.normal1.y)>.25 || candidate.collider.parent()?.isDynamic() || this.queries.isActorCollider(candidate.collider))continue;
        const y=candidate.witness1.y;
        if(sampledHeights.some(height=>Math.abs(height-y)<.001))continue;
        sampledHeights.push(y);hit=probeFace(new Vector3(this.position.x,y,this.position.z))??hit;
      }
    }
    if(!hit)return null;
    const obstacle=hit.collider;
    if(this.queries.isBoundaryCollider(obstacle))return {kind:'blocked',height:0,heightKnown:false,depth:0,
      reason:'场地空气边界不可翻越或攀爬',front,top:front.clone(),normal,end:this.position.clone(),collider:obstacle,distance};
    const sample=front.clone().addScaledVector(normal,-.15); sample.y=this.position.y+2.95;
    let topCollider=obstacle;
    // A low face can belong to a thin supporting wall beneath a separate slab.
    // Only combine a top hit that physically touches that face's collider;
    // floating ceilings, actors and dynamic props remain independent obstacles.
    const upper=this.ray(sample,new Vector3(0,-1,0),2.95);
    if(upper&&upper.normal.y>.7&&upper.collider.handle!==obstacle.handle
      &&!upper.collider.parent()?.isDynamic()&&!this.queries.isActorCollider(upper.collider)
      &&!this.queries.isBoundaryCollider(upper.collider)&&contactColliderVolume(upper.collider,obstacle.shape,obstacle.translation(),obstacle.rotation(),.01))topCollider=upper.collider;
    const down=this.ray(sample,new Vector3(0,-1,0),2.95,c=>c.handle===topCollider.handle);
    const heightKnown=!!down&&down.normal.y>.7&&down.timeOfImpact>.0001;
    const top=sample.clone(); top.y=heightKnown? sample.y-down!.timeOfImpact:this.position.y+2.95;
    const height=top.y-this.position.y;
    // March downward probes over the top surface to estimate usable depth.
    let depth=0;
    for(let d=.05;d<=3.1;d+=.1){const o=front.clone().addScaledVector(normal,-d);o.y=top.y+.08;
      const r=this.ray(o,new Vector3(0,-1,0),.15,c=>c.handle===topCollider.handle);
      if(!r || r.normal.y<.7) break; depth=d+.05;
    }
    let kind=heightKnown?classify(height,depth):'blocked' as Kind;
    if(airborne && heightKnown)kind=height>=.35&&height<=2.45&&depth>=.75?(height>1.15?'climb':'mantle'):'blocked';
    let reason=kind==='blocked'?'墙面过高或台面太窄':kind==='vault'?'低且薄：翻越落到另一侧':kind==='mantle'?'中等高度：撑上台面':'高墙：双手抓沿，再拉升';
    if(!heightKnown)reason='顶部超出探测范围（>2.95 m）';
    const end=front.clone().addScaledVector(normal,kind==='vault'?-depth-.72:-.64);
    end.y=top.y+.04;
    if(kind==='vault') {
      const floorOrigin=end.clone();floorOrigin.y=top.y+.5;
      const floor=this.ray(floorOrigin,new Vector3(0,-1,0),3.4);
      if(floor && floor.normal.y>.7)end.y=floorOrigin.y-floor.timeOfImpact+.03;
      else {kind='blocked';reason='另一侧没有安全落地面';}
    }
    if(kind!=='blocked') {
      const center=end.clone().addScaledVector(UP,CENTER);
      const occupied=this.world.intersectionWithShape(center,ROT,new RAPIER.Capsule(HALF,RADIUS),undefined,undefined,this.capsule);
      // Both hand contacts must have a supporting top surface.
      const tangent=new Vector3(normal.z,0,-normal.x);
      const handsFit=[-.24,.24].every(side=>{
        const o=front.clone().addScaledVector(normal,-.13).addScaledVector(tangent,side);o.y=top.y+.1;
        const support=this.ray(o,new Vector3(0,-1,0),.2,c=>c.handle===topCollider.handle);
        return support!==null&&support.normal.y>.7;
      });
      if(occupied || !handsFit){kind='blocked';reason=occupied?'落点胶囊空间被占用':'墙沿不足以支撑双手';}
    }
    return {kind,height,heightKnown,depth,reason,front,top,normal,end,collider:obstacle,topCollider,distance};
  }
  begin(probe:Probe,airborne=false){
    if(this.queries.isBoundaryCollider(probe.collider)){this.lastResult='场地空气边界不可翻越或攀爬';return false;}
    if(probe.kind==='blocked')return false;
    if(this.queries.isActorCollider(probe.collider)){this.lastResult='载具碰撞包围体不可攀爬，请按 F 进入载具';return false;}
    const sourceId=probe.kind==='vault'?'hurdle-1m':probe.kind==='mantle'?'mantle-1m':'climb-2m5';
    const source=this.motionSources.find(s=>s.id===sourceId);
    if(!source){this.lastResult='GASP 动作尚未载入';return false;}
    let motion:MotionPlan;
    const entryVelocity=this.velocity.clone().setY(this.vertical);
    try{
      const target={start:this.position.clone(),front:probe.front,normal:probe.normal,height:probe.height,depth:probe.depth,end:probe.end,kind:probe.kind,entryMode:airborne?'air' as const:'ground' as const,entryVelocity};
      if(airborne){
        const plans:MotionPlan[]=[];
        for(const candidate of this.motionSources.filter(s=>s.id==='mantle-1m'||s.id==='climb-2m5')){
          try{plans.push(createTraversalMotion(candidate,target));}catch{/* This source cannot meet this airborne pose. */}
        }
        plans.sort((a,b)=>(a.entryError??Infinity)-(b.entryError??Infinity));
        if(!plans[0])throw new Error('No reachable airborne entry');
        motion=plans[0];
      }else motion=createTraversalMotion(source,target);
    }
    catch{this.lastResult='没有适合当前距离的原始动作';probe.kind='blocked';probe.reason=this.lastResult;this.cooldown=.2;return false;}
    // The standing capsule cannot represent a horizontal vault pose. Only the
    // selected face and its verified contacting top are excluded during traversal; other
    // geometry is checked along the whole root path and on every movement tick.
    const shape=new RAPIER.Capsule(HALF,RADIUS);
    const count=Math.ceil(motion.duration/FIXED_DT);
    let previous=motion.sample(0).position.clone().addScaledVector(UP,CENTER);
    for(let i=1;i<=count;i++){
      const next=motion.sample(motion.duration*i/count).position.clone().addScaledVector(UP,CENTER);
      const hit=this.world.castShape(previous,ROT,next.clone().sub(previous),shape,0,1,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,this.capsule,undefined,c=>c.handle!==probe.collider.handle&&c.handle!==probe.topCollider?.handle);
      if(hit){this.lastResult='动画路径被其他障碍阻挡';probe.kind='blocked';probe.reason=this.lastResult;this.cooldown=.2;return false;}
      previous=next;
    }
    const requests=this.actorId?actorResources(this.actorId,FULL_BODY_RESOURCES):[],identity={kind:'action' as const,id:`traversal:${sourceId}`};
    const acquired=this.surface.mode==='climbing'?this.resources.transfer(this.surface,this,requests,identity):this.resources.acquire(this,requests,identity);
    if(!acquired){this.lastResult='ACTOR_RESOURCE_BUSY: 角色资源被其他任务占用';return false;}
    this.traversal={probe,start:this.position.clone(),elapsed:0,duration:motion.duration,progress:0,phase:'reach',motion,safePositions:[...this.positionHistory.map(p=>p.clone()),this.position.clone()],entryVelocity,airborne};
    this.traversalRequested=false;
    this.animationEvent=null;this.inputHeldTime=0;this.runHeldTime=0;this.startEmitted=true;this.lastMoveInput.set(0,0,0);
    this.recentSpeeds=[];
    this.completedMotion=null;this.motionSerial++;this.controller.disableSnapToGround();
    this.velocity.set(0,0,0);this.vertical=0;this.facing.copy(probe.normal).negate();
    const tangent=new Vector3(probe.normal.z,0,-probe.normal.x);
    this.handTargets=[-.24,.24].map(side=>{const h=probe.front.clone().addScaledVector(probe.normal,-.04).addScaledVector(tangent,side);h.y=probe.top.y+.035;return h;});
    this.events.push({time:this.elapsed,kind:probe.kind,height:probe.height,result:'started'});
    return true;
  }
  private clearCapsule(position:Vector3){
    return !this.world.intersectionWithShape(position.clone().addScaledVector(UP,CENTER),ROT,new RAPIER.Capsule(HALF,RADIUS),undefined,undefined,this.capsule);
  }
  private restoreSafePosition(tr:Traversal){
    // The upright capsule may overlap the authored target during a vault.
    // Before restoring ordinary collision, return to a still-clear position
    // already visited by this traversal, also accounting for newly moved props.
    const safe=[...tr.safePositions].reverse().find(p=>this.clearCapsule(p))
      ?? Array.from({length:12},(_,i)=>tr.start.clone().addScaledVector(tr.probe.normal,(i+1)*.1)).find(p=>this.clearCapsule(p))
      ?? new Vector3(this.checkpoint.x,this.checkpoint.y,this.checkpoint.z);
    this.position.copy(safe);const center=safe.clone().addScaledVector(UP,CENTER);
    this.body.setTranslation(center,true);this.body.setNextKinematicTranslation(center);this.commitPose();this.sync();
  }
  step(input:Vector3,sprint:boolean,walk:boolean,jump:boolean,actions?:{toggleCrouch?:boolean}&ActionCommands&SurfaceCommands,lift=0){
    if(this.disposed)throw new Error('Humanoid controller disposed');
    if(this.mounted)return;
    if(actions?.toggleCrouch&&this.surface.mode==='climbing'||actions?.slide&&this.surface.mode==='climbing')actions={...actions,toggleCrouch:false,slide:false,releaseClimb:true};
    if(actions?.interact&&!this.skills.active&&!this.skills.seated&&!this.skills.carrying&&!this.skills.nearest()){
      actions={...actions,interact:false};
      if(this.surface.mode==='none')actions.climb=true;
    }
    const dt=FIXED_DT;this.elapsed+=dt;this.cooldown-=dt;this.jumpBuffer=jump?.13:Math.max(0,this.jumpBuffer-dt);
    const hasInput=input.lengthSq()>.01;
    const canRequest=!this.traversal&&!this.skills.active&&!this.skills.carrying&&!this.skills.seated&&this.surface.mode==='none';
    // A fresh directional jump buffered just before landing still belongs to
    // the next jump. Never create this intent from an ordinary jump buffer.
    if(!hasInput||this.grounded&&this.jumpBuffer<=0||this.swimming||!canRequest)this.traversalRequested=false;
    // jump is the host's fresh key/button pulse, never a held-key repeat.
    if(jump&&hasInput&&canRequest)this.traversalRequested=true;
    if(this.animationEvent)this.animationEvent.elapsed+=dt;
    this.turnCooldown=Math.max(0,this.turnCooldown-dt);
    this.airborneTime=this.grounded?0:this.airborneTime+dt;
    if(this.traversal){
      const tr=this.traversal;tr.elapsed+=dt;tr.progress=Math.min(1,tr.elapsed/tr.duration);
      const sample=tr.motion.sample(tr.elapsed);tr.phase=sample.phase;this.state=tr.probe.kind;
      const next=sample.position;
      const current=this.body.translation();
      const delta=next.clone().addScaledVector(UP,CENTER).sub(new Vector3(current.x,current.y,current.z));
      this.controller.computeColliderMovement(this.capsule,delta,undefined,undefined,c=>c.handle!==tr.probe.collider.handle&&c.handle!==tr.probe.topCollider?.handle);
      const movement=this.controller.computedMovement();
      this.body.setNextKinematicTranslation({x:current.x+movement.x,y:current.y+movement.y,z:current.z+movement.z});
      this.speed=Math.hypot(movement.x,movement.z)/dt;this.collisions=this.controller.numComputedCollisions();
      this.commitPose();this.sync();this.grounded=false;
      if(this.position.distanceTo(next)>.12){
        this.restoreSafePosition(tr);
        this.lastResult='动作被其他碰撞中断';this.events.push({time:this.elapsed,kind:tr.probe.kind,height:tr.probe.height,result:'interrupted'});
        this.completedMotion={sourceId:tr.motion.sourceId,sourceTime:sample.sourceTime,serial:this.motionSerial};
        this.traversal=null;this.resources.release(this);this.handTargets=[];this.cooldown=.55;this.vertical=tr.airborne?Math.min(-1,tr.entryVelocity?.y??-1):0;
        if(tr.airborne)this.velocity.copy(tr.entryVelocity!).setY(0);
        this.grounded=false;this.controller.enableSnapToGround(.18);return;
      }
      if(this.clearCapsule(this.position))tr.safePositions.push(this.position.clone());
      if(tr.progress>=1){
        const error=this.position.distanceTo(tr.probe.end);
        const floor=this.ray(this.position.clone().addScaledVector(UP,.05),new Vector3(0,-1,0),.18,undefined);
        const complete=error<.18&&!!floor&&floor.normal.y>.7&&this.clearCapsule(this.position);
        this.lastResult=complete?'完成：落点与胶囊空间有效':'动作被碰撞中断';
        this.events.push({time:this.elapsed,kind:tr.probe.kind,height:tr.probe.height,result:complete?'completed':'interrupted'});
        this.completedMotion={sourceId:tr.motion.sourceId,sourceTime:sample.sourceTime,serial:this.motionSerial};
        if(!complete)this.restoreSafePosition(tr);
        this.traversal=null;this.resources.release(this);this.handTargets=[];this.cooldown=.55;this.vertical=complete?0:Math.min(-1,tr.entryVelocity?.y??-1);this.grounded=complete;this.controller.enableSnapToGround(.18);
      }
      return;
    }
    if(this.updateWaterContact()){this.surface.reset();this.stepSwimming(input,sprint,lift);return;}
    if(!this.skills.active&&!this.skills.carrying&&!this.skills.seated&&this.surface.step(input,actions,jump)){this.checkBounds();return;}
    if(this.skills.step(input,sprint,actions,jump)){this.checkBounds();return;}
    if(this.skills.carrying){sprint=false;walk=true;this.jumpBuffer=0;}
    if(actions?.toggleCrouch){const eligibility=this.crouchEligibility();if(eligibility.eligible)this.changeStance(this.stance==='stand'?'crouch':'stand');else this.lastResult=eligibility.message;}
    if(this.jumpBuffer>0&&this.stance==='crouch'&&this.grounded){this.changeStance('stand');this.jumpBuffer=0;this.traversalRequested=false;}
    // Four actual displacement samples reject a single solver correction;
    // requested velocity alone would falsely qualify running against a wall.
    const previousSpeed=this.recentSpeeds.length?this.recentSpeeds.reduce((a,b)=>a+b,0)/this.recentSpeeds.length:this.speed;
    const released=!hasInput&&this.lastMoveInput.lengthSq()>.01;
    const establishedInput=this.inputHeldTime>=.2;
    const intentTurn=hasInput&&this.lastMoveInput.lengthSq()>.01
      ?Math.atan2(this.lastMoveInput.z*input.x-this.lastMoveInput.x*input.z,this.lastMoveInput.dot(input)):0;
    if((hasInput&&this.animationEvent?.kind==='stop')||(!hasInput&&this.animationEvent?.kind==='start'))this.animationEvent=null;
    const targetSpeed=this.stance==='crouch'?(walk?.8:1.5)*this.movementTuning.speedScale:walk?this.movementTuning.slowSpeed:sprint?this.movementTuning.maxSpeed:3.1*this.movementTuning.speedScale;
    const target=input.clone().multiplyScalar(targetSpeed);
    this.locomotionTargetSpeed=target.length();
    const accel=this.grounded?(input.lengthSq()?14*this.movementTuning.accelerationScale:this.movementTuning.coastDeceleration):5*this.movementTuning.airControlScale;
    const change=target.clone().sub(this.velocity);change.y=0;
    if(change.length()>accel*dt)change.setLength(accel*dt);
    this.velocity.add(change);
    if(input.lengthSq()>.01){
      const a=Math.atan2(this.facing.x,this.facing.z),b=Math.atan2(input.x,input.z);
      const diff=Math.atan2(Math.sin(b-a),Math.cos(b-a));const turn=8*this.movementTuning.turnScale*dt;const angle=a+Math.max(-turn,Math.min(turn,diff));
      this.facing.set(Math.sin(angle),0,Math.cos(angle));
    }
    this.probe=this.stance==='stand'?this.detect(input.lengthSq()>.01?input:this.facing,!this.grounded):null;
    const wantsTraverse=!this.skills.carrying&&hasInput&&(this.autoTraverse||this.traversalRequested);
    const canCatch=this.airborneTime>.08&&this.vertical>-8&&this.vertical<7&&hasInput
      &&this.velocity.dot(input)>.35&&!!this.probe&&this.velocity.dot(this.probe.normal)<-.15;
    if(this.stance==='stand'&&this.cooldown<=0&&this.probe&&this.probe.kind!=='blocked'&&wantsTraverse&&(this.grounded||canCatch)){
      if(this.begin(this.probe,!this.grounded)){this.jumpBuffer=0;return;}
    }
    this.coyote=this.grounded?.1:Math.max(0,this.coyote-dt);
    let jumped=false;
    if(this.jumpBuffer>0 && this.coyote>0 && this.stance==='stand'){this.vertical=this.movementTuning.jumpSpeed;this.jumpBuffer=0;this.coyote=0;this.grounded=false;this.cooldown=.08;jumped=true;this.emitAnimation('jump',0,false,input.lengthSq()>.01);}
    const wasGrounded=this.grounded,fallSpeed=this.vertical;
    this.vertical=Math.max(-16,this.vertical-18*dt);
    const desired={x:this.velocity.x*dt,y:this.vertical*dt,z:this.velocity.z*dt};
    this.controller.computeColliderMovement(this.capsule,desired);
    const corrected=this.controller.computedMovement(), cur=this.body.translation();
    this.grounded=this.controller.computedGrounded();this.collisions=this.controller.numComputedCollisions();
    if(this.grounded && this.vertical<0)this.vertical=0;
    if(this.vertical>0 && corrected.y<desired.y-.01)this.vertical=0;
    this.body.setNextKinematicTranslation({x:cur.x+corrected.x,y:cur.y+corrected.y,z:cur.z+corrected.z});
    this.speed=Math.hypot(corrected.x,corrected.z)/dt;
    this.commitPose();this.sync();
    if(this.updateWaterContact()){
      this.state=this.speed<.12?'swim-idle':sprint?'swim-fast':'swim';
      this.checkBounds();return;
    }
    this.state=!this.grounded?(this.vertical>0?'jump':'fall'):this.stance==='crouch'?(this.speed<.12?'crouch-idle':'crouch-walk'):this.speed<.12?'idle':walk?'walk':sprint?'sprint':'run';
    this.stationaryTime=this.speed>.2?0:this.stationaryTime+dt;
    // A single tiny correction from the contact solver is not a real stop.
    const moving=this.speed>.2||this.wasMoving&&this.stationaryTime<.12;
    const landed=!wasGrounded&&this.grounded&&this.airborneTime>.08;
    const protectedEvent=this.animationEvent?.kind==='land'?this.animationEvent.elapsed<(this.animationEvent.heavy?.75:.45)
      :this.animationEvent?.kind==='jump'&&this.animationEvent.elapsed<.28;
    if(landed){this.emitAnimation('land',0,fallSpeed<-7,moving);this.startEmitted=hasInput;this.runHeldTime=0;}
    else if(!jumped&&this.grounded&&this.stance==='stand'&&!protectedEvent){
      // A tap uses the ordinary gait. Authored running brakes only start at
      // release after sustained fast movement, while there is momentum left.
      if(released&&this.runHeldTime>=.25&&this.inputHeldTime>=.35&&previousSpeed>=2.2){
        this.emitAnimation('stop',0,false,false,Math.min(1,previousSpeed/5.8),previousSpeed);
      }else if(hasInput&&this.inputHeldTime>=.12&&this.speed>=1.2&&!walk&&!this.startEmitted){
        this.emitAnimation('start',0,false,true,Math.min(1,targetSpeed/5.8));this.startEmitted=true;
      }else if(hasInput&&establishedInput&&this.wasMoving&&Math.abs(intentTurn)>.7&&this.turnCooldown===0){
        this.emitAnimation(moving&&previousSpeed>2&&Math.abs(intentTurn)>=2.35?'pivot':'turn',intentTurn,false,moving);this.turnCooldown=.65;
      }
    }
    this.inputHeldTime=hasInput?this.inputHeldTime+dt:0;
    this.runHeldTime=hasInput&&this.grounded?Math.max(0,this.runHeldTime+(this.speed>=2.5?dt:-dt)):0;
    this.recentSpeeds.push(this.speed);if(this.recentSpeeds.length>4)this.recentSpeeds.shift();
    if(!hasInput)this.startEmitted=false;
    this.lastMoveInput.copy(input);
    this.wasMoving=moving;
    this.positionHistory.push(this.position.clone());if(this.positionHistory.length>36)this.positionHistory.shift();
    this.checkBounds();
    this.skills.syncCarried();
  }
  private checkBounds(){
    if(this.queries.map.recovery)return; // Configured recovery belongs to Simulation's fixed-step owner.
    const bounds=this.level?.bounds??{minX:-28,maxX:28,minZ:-29,maxZ:29,killY:-5};
    if(this.position.y<bounds.killY || this.position.x<bounds.minX || this.position.x>bounds.maxX || this.position.z<bounds.minZ || this.position.z>bounds.maxZ){this.reset();this.lastResult='已返回当前测试点';}
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;
    this.skills.dispose();this.resources.release(this.surface);this.resources.release(this);this.crates=[];
    this.queries.releaseHumanoidRig(this.rig);
  }
  sync(){const p=this.body.translation();this.position.set(p.x,p.y-this.capsuleCenter,p.z);}
  snapshot(){return {position:this.position.toArray(),speed:this.speed,grounded:this.grounded,state:this.state,stance:this.stance,swimming:this.swimming,water:this.water,waterEntrySerial:this.waterEntrySerial,waterEntrySpeed:this.waterEntrySpeed,capsuleHeight:this.capsuleHeight,animationEvent:this.animationEvent,probe:this.probe?{kind:this.probe.kind,height:this.probe.height,depth:this.probe.depth,reason:this.probe.reason}:null,traversal:this.traversal?{kind:this.traversal.probe.kind,progress:this.traversal.progress,phase:this.traversal.phase,airborne:!!this.traversal.airborne}:null,events:this.events.slice(-20),lastResult:this.lastResult,crates:this.crates.map(c=>c.body.translation())};}
}
