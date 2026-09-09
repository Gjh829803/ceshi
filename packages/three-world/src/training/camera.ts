import {applyVehicleCameraRoll} from './camera-roll';
import {VehicleCameraQueries} from './vehicle-camera-queries';
import * as T from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CameraCollisionSolver, type CameraCollisionRequest } from '@whitebox-world/camera-collision';
import { probeTrainingCamera } from './camera-queries';
import { Simulation, angleDelta, clamp, damp } from './simulation';
import type { MotionPose } from './presentation';
import { DEFAULT_CAMERA_TUNING, HUMANOID_CAMERA_DEFAULTS, CHARACTER_CAMERA_DISTANCE_METERS, parseCameraTuning, type CameraTuning } from '../config/camera';
import type { EnvironmentQueries } from './environment/queries';
interface CameraPresentationPose {
  position:T.Vector3; rotation:T.Quaternion; target:T.Vector3; subject:T.Vector3;
  up:T.Vector3; fov:number; near:number;
}
export class FollowCamera {
  private displayedTarget:T.Vector3|undefined;
  get presentationTarget():T.Vector3 {return (this.displayedTarget??this.target).clone();}
  private previousPresentation:CameraPresentationPose|undefined;
  private currentPresentation:CameraPresentationPose|undefined;
  private presentationHumanoid:Simulation['humanoid']|undefined;
  /** Rendering keeps the displayed camera; fixed damping starts from this saved pose. */
  beforeFixedUpdate():void {
    this.displayedTarget=undefined;
    const pose=this.currentPresentation;
    if(pose){
      this.camera.position.copy(pose.position);
      this.camera.quaternion.copy(pose.rotation);
      this.camera.up.copy(pose.up);
      this.camera.fov=pose.fov;
      this.camera.near=pose.near;
      this.camera.updateProjectionMatrix();
    }
    this.previousPresentation=pose;
  }
  capturePresentationPose(sim:Simulation,snap=false):void {
    this.presentationHumanoid=sim.vehicle?undefined:sim.humanoid;
    this.currentPresentation={
      position:this.camera.position.clone(), rotation:this.camera.quaternion.clone(),
      target:this.target.clone(), subject:(sim.vehicle?.position??sim.player.position).clone(),
      up:this.camera.up.clone(), fov:this.camera.fov, near:this.camera.near,
    };
    if(snap||!this.previousPresentation)this.previousPresentation=this.currentPresentation;
  }
  present(pose:MotionPose,alpha:number):void {
    this.syncVehicleQueries();
    const a=this.previousPresentation,b=this.currentPresentation;
    if(!a||!b)return;
    const subject=a.subject.clone().lerp(b.subject,alpha);
    const offset=pose.position.clone().sub(subject);
    const target=a.target.clone().lerp(b.target,alpha).add(offset);
    this.displayedTarget=target;
    const eye=a.position.clone().lerp(b.position,alpha).add(offset);
    let resolved=eye;
    const humanoid=this.presentationHumanoid;
    if(this.tuning.collisionEnabled&&this.mode!==1&&alpha!==1){
      const input=humanoid
        ? this.humanoidCollisionRequest(humanoid,pose.position,
          pose.position.clone().add(new T.Vector3(0,pose.cameraHeight??(humanoid.swimming?1.4:humanoid.capsuleHeight*.655),0)),target,eye,a.position,b.position)
        : {target:target.toArray(),eye:eye.toArray(),current:b.position.toArray(),radius:this.tuning.collisionRadiusMeters,armClearance:0};
      const projected=this.collision.project(input);
      resolved=new T.Vector3(...projected.position);
      target.fromArray(projected.target);
    }
    this.camera.position.copy(resolved);
    this.camera.quaternion.slerpQuaternions(a.rotation,b.rotation,alpha);
    this.camera.up.copy(a.up).lerp(b.up,alpha).normalize();
    if(this.camera.position.distanceToSquared(eye)>1e-10)this.camera.lookAt(target);
    this.camera.fov=a.fov+(b.fov-a.fov)*alpha;
    this.camera.near=b.near;
    this.camera.updateProjectionMatrix();
  }

  tuning:CameraTuning={...DEFAULT_CAMERA_TUNING};
  private humanoidTuning:CameraTuning={...HUMANOID_CAMERA_DEFAULTS};
  private vehicleTuning:CameraTuning={...DEFAULT_CAMERA_TUNING};
  private activeSubject:'character'|'vehicle'='character';
  private selectTuning(sim:Simulation):CameraTuning{return sim.vehicle?this.vehicleTuning:this.humanoidTuning;}
  getEffectiveTuning(sim:Simulation):CameraTuning{return {...this.selectTuning(sim)};}
  /** Explicit overrides apply independently; distance never selects unrelated defaults. */
  configureTuning(overrides:Partial<CameraTuning>):void {
    const tuning=parseCameraTuning({...DEFAULT_CAMERA_TUNING,...overrides});
    const humanoid=parseCameraTuning({...HUMANOID_CAMERA_DEFAULTS,...overrides});
    this.vehicleTuning=tuning;this.humanoidTuning=humanoid;
    this.tuning=this.activeSubject==='character'?humanoid:tuning;
  }
  baseDistance?:number;
  yaw=0;pitch=.3;zoom=1;mode=0;lastOrbit=-10;target=new T.Vector3();initialized=false;lastActive=-2;distance=6;
  up=new T.Vector3(0,1,0);collisionLimited=false;
  private sourceCharacter=false;
  /** 座位局部观察角，与车体偏航独立；相机仍是唯一写入者。 */
  private seatLookYaw=0;
  private previousMode=-1;
  eyePosition:((target:T.Vector3)=>boolean)|undefined;
  private shoulderDistance=2;
  private readonly originalNear:number;
  private collisionHumanoid:Simulation['humanoid']|undefined;
  private readonly vehicleQueries:VehicleCameraQueries;
  private cameraFilter:((collider:RAPIER.Collider)=>boolean)|undefined;
  private mountedId:string|undefined;
  private syncVehicleQueries():void {
    this.vehicleQueries.sync();const excluded=new Set(this.vehicleQueries.refinedActorIds);
    if(this.mountedId)excluded.add(this.mountedId);
    this.cameraFilter=this.environment.cameraFilter(excluded);
  }
  private collisionTick=0;
  private readonly collision=new CameraCollisionSolver((from,to,radius)=>{
    if(!this.tuning.collisionEnabled)return {distanceMeters:Math.hypot(to[0]-from[0],to[1]-from[1],to[2]-from[2])};
    const h=this.collisionHumanoid;
    const environment=h?probeTrainingCamera(h.world,from,to,radius,h.capsule,this.cameraFilter):this.environment.cameraProbe(from,to,radius,this.cameraFilter);
    const vehicle=this.vehicleQueries.probe(from,to,radius,this.mountedId);
    return vehicle.startedOverlapping||vehicle.distanceMeters<environment.distanceMeters?vehicle:environment;
  });
  get collisionState(){return this.collision.captureTransactionState();}
  private readonly lastCharacterPosition=new T.Vector3();
  private anchor=new T.Vector3();private lastAnchor=new T.Vector3();private delta=new T.Vector3();private aim=new T.Vector3();private desired=new T.Vector3();private candidate=new T.Vector3();private direction=new T.Vector3();private origin=new T.Vector3();private offset=new T.Vector3();private targetUp=new T.Vector3();private localLook=new T.Vector3();private localRotation=new T.Euler(0,0,0,'YXZ');private revision=-1;
  constructor(public camera:T.PerspectiveCamera,public environment:EnvironmentQueries,vehicles:readonly {instanceId:string;object:T.Object3D}[]=[]){this.originalNear=camera.near;this.vehicleQueries=new VehicleCameraQueries(vehicles);}
  get desiredPosition():T.Vector3{return this.desired.clone();}
  dispose():void{this.vehicleQueries.dispose();}
  /** Canonical angular input. Pixel adapters keep their own sensitivity. */
  orbitRadians(yawDelta:number,pitchDelta:number,time:number,sim?:Simulation){
    if(this.mode===1||this.mode===2){
      if(sim?.vehicle)this.seatLookYaw=clamp(this.seatLookYaw+yawDelta,-Math.PI*5/6,Math.PI*5/6);
      else this.yaw+=yawDelta;
      this.pitch=clamp(this.pitch+pitchDelta,this.mode===2?-.65:-1.35,this.mode===2?1.05:1.4);
    }else{
      const character=sim?!!sim.humanoid&&!sim.vehicle:this.sourceCharacter;
      this.yaw+=yawDelta;this.pitch=clamp(this.pitch+pitchDelta,character ? .12 : -.6,character ? 1.1 : 1.25);
    }
    this.lastOrbit=time;
  }
  /** Changes the nominal arm in meters; collision, speed pullback and smoothing remain separate. */
  zoomByMeters(delta:number,sim:Simulation){
    if(this.mode===1)return;
    if(this.mode===2){this.shoulderDistance=clamp(this.shoulderDistance+delta,1.3,3.2);return;}
    if(sim.humanoid&&!sim.vehicle){const base=this.characterDistance();this.zoom=clamp(base*this.zoom+delta,3.2,12)/base;}
    else{
      const base=this.baseDistance??sim.vehicle?.spec.camera??5.5;
      // A configured zero arm stays collapsed; never divide by zero.
      if(base>0)this.zoom=clamp(this.zoom+delta/base,.45,2.5);
    }
  }
  /** Legacy pointer pixels, retained for direct integrations. */
  orbit(dx:number,dy:number,time:number,sim?:Simulation){
    const character=sim?!!sim.humanoid&&!sim.vehicle:this.sourceCharacter;
    this.orbitRadians(-dx*.004,dy*((this.mode===1||this.mode===2||character) ? .004 : .003),time,sim);
  }
  scroll(deltaY:number,sim:Simulation){
    if(this.mode===1)return;
    if(this.mode===2){this.zoomByMeters(deltaY*.003,sim);return;}
    if(sim.humanoid&&!sim.vehicle)this.zoomByMeters(deltaY*.007,sim);
    else this.zoom=clamp(this.zoom+deltaY*.0007,.45,2.5);
  }
  reset(sim: Simulation) {
    this.activeSubject = sim.vehicle ? 'vehicle' : 'character';
    this.tuning = this.selectTuning(sim);
    this.sourceCharacter = !!sim.humanoid && !sim.vehicle;
    this.yaw = sim.vehicle?.yaw ?? sim.player.yaw;

    this.pitch =
      this.mode === 1
        ? (
            sim.vehicle?.spec.archetype === 'atv' ||
            sim.vehicle?.spec.archetype === 'jetski'
          )
          ? .34
          : 0
        : this.mode === 2
          ? .12
          : this.sourceCharacter
            ? .35
            : .3;

    this.seatLookYaw = 0;
    this.zoom = 1;
    this.lastOrbit = sim.time;
    this.initialized = false;
    this.collision.reset();
    this.collisionTick = 0;
  }
  update(sim:Simulation,dt:number,pose?:MotionPose){
    this.activeSubject=sim.vehicle?'vehicle':'character';this.tuning=this.selectTuning(sim);
    this.collisionHumanoid=sim.vehicle?undefined:sim.humanoid;
    this.mountedId=sim.vehicle?.spec.id;this.syncVehicleQueries();
    const v=sim.vehicle,body=pose??v??sim.player,speed=body.velocity.length(),position=body.position,yaw=pose?.yaw??v?.yaw??sim.player.yaw,rotation=pose?.rotation??v?.rotation;
    if(this.revision!==sim.teleportRevision){this.revision=sim.teleportRevision;this.reset(sim);}
    if(this.previousMode!==this.mode){this.previousMode=this.mode;this.reset(sim);}
    const subjectChanged=this.lastActive!==sim.active;
    if(subjectChanged){this.lastActive=sim.active;this.lastOrbit=sim.time;this.yaw=yaw;this.pitch=this.mode===1?((v?.spec.archetype==='atv'||v?.spec.archetype==='jetski')?.34:0):this.mode===2?.12:!v&&sim.humanoid?.35:.3;this.seatLookYaw=0;this.initialized=false;}
    if(!this.initialized||subjectChanged)this.collision.reset();
    if(this.mode===1){this.updateFirstPerson(sim,pose);return;}
    if(this.mode===2){this.updateShoulder(sim,dt,pose);return;}
    if(!v&&sim.humanoid){
      if(!this.sourceCharacter||subjectChanged){this.zoom=1;this.initialized=false;}
      this.sourceCharacter=true;this.updateHumanoid(sim,dt,pose);return;
    }
    if(this.sourceCharacter){this.sourceCharacter=false;this.zoom=1;}
    if(this.camera.near!==this.originalNear){this.camera.near=this.originalNear;this.camera.updateProjectionMatrix();}
    const airborne=v&&['space','plane','glider','sub','dragon'].includes(v.spec.mode);
    if(v&&this.mode!==1&&sim.time-this.lastOrbit>this.tuning.recenterDelaySeconds&&speed>.8){this.yaw+=angleDelta(this.yaw,yaw)*(1-Math.exp(-this.tuning.recenterResponsePerSecond*(airborne?1.3/1.9:1)*dt));this.pitch=damp(this.pitch,airborne?.2:.28,1.2*this.tuning.recenterResponsePerSecond/1.9,dt);}
    this.anchor.copy(position);this.anchor.y+=(v?(v.spec.mode==='tank'?2.3:v.creature?v.spec.seat[1]+.6:1):1.25)+this.tuning.targetHeightOffset;
    this.anchor.x+=Math.cos(this.yaw)*this.tuning.horizontalOffset;this.anchor.z-=Math.sin(this.yaw)*this.tuning.horizontalOffset;this.aim.copy(this.anchor);
    this.targetUp.set(0,1,0);if(v?.spec.mode==='space'&&rotation)this.targetUp.applyQuaternion(rotation);
    this.up.lerp(this.targetUp,1-Math.exp(-5*dt)).normalize();
    const idealDistance=(this.baseDistance??(v?v.spec.camera:5.5))*this.zoom+Math.min(speed*.075,4);
    this.distance=this.initialized?damp(this.distance,idealDistance,idealDistance>this.distance?3:1.2,dt):idealDistance;
    {
      const distance=this.distance,orbit=v?.spec.mode==='space'?angleDelta(yaw,this.yaw):this.yaw;
      this.offset.set(-Math.sin(orbit)*Math.cos(this.pitch)*distance,Math.sin(this.pitch)*distance,-Math.cos(orbit)*Math.cos(this.pitch)*distance);
      if(v?.spec.mode==='space'&&rotation)this.offset.applyQuaternion(rotation);
      this.desired.copy(this.anchor).add(this.offset);
    }
    if(!this.initialized){this.camera.position.copy(this.desired);this.target.copy(this.aim);this.lastAnchor.copy(this.anchor);this.initialized=true;}
    else if(!subjectChanged){
      // Inherit world translation; damp only the relative arm, never follow lag.
      this.delta.subVectors(this.anchor,this.lastAnchor);this.camera.position.add(this.delta);this.target.add(this.delta);
    }
    this.lastAnchor.copy(this.anchor);
    if(this.mode===1&&v)this.candidate.copy(this.desired);
    else this.candidate.copy(this.camera.position).lerp(this.desired,1-Math.exp(-this.tuning.followResponsePerSecond*dt));
    this.collisionLimited=false;
    if(this.tuning.collisionEnabled){
      const solved=this.collision.solve({target:this.anchor.toArray(),eye:this.candidate.toArray(),
        current:this.camera.position.toArray(),radius:this.tuning.collisionRadiusMeters,armClearance:0},{
        authorityTick:++this.collisionTick,deltaSeconds:dt,clearHoldSeconds:0,recoveryHalfLifeSeconds:0,maximumRecoveryMetersPerSecond:Number.MAX_VALUE,
      });
      this.collisionLimited=solved.limited;this.candidate.fromArray(solved.position);
    }else this.collision.reset();
    this.camera.position.copy(this.candidate);this.target.lerp(this.aim,1-Math.exp(-12*dt));this.camera.up.copy(this.up);this.camera.lookAt(this.target);
    const fov=damp(this.camera.fov,this.tuning.baseFovDegrees+Math.min(12,speed*.23),3,dt);if(Math.abs(fov-this.camera.fov)>.0001){this.camera.fov=fov;this.camera.updateProjectionMatrix();}
  }
  private characterDistance(){
    const configured=this.baseDistance??CHARACTER_CAMERA_DISTANCE_METERS;
    // Preserve the source's indoor default even when the UI supplies the
    // unchanged 8.8 m asset baseline; non-default user tuning takes precedence.
    return configured===CHARACTER_CAMERA_DISTANCE_METERS?this.environment.map.characterCameraDistanceMeters??configured:configured;
  }
  private updateShoulder(sim:Simulation,dt:number,pose?:MotionPose):void {
    const v=sim.vehicle,h=sim.humanoid,position=pose?.position??v?.position??sim.player.position;
    const speed=(pose?.velocity??v?.velocity??sim.player.velocity).length();
    const pace=clamp(speed/(v?Math.max(8,v.spec.speed):5.8),0,1);
    const rotation=pose?.rotation??v?.rotation;
    if(v&&rotation){
      if(sim.time-this.lastOrbit>this.tuning.recenterDelaySeconds&&speed>.8)this.seatLookYaw=damp(this.seatLookYaw,0,this.tuning.recenterResponsePerSecond,dt);
      this.yaw=(pose?.yaw??v.yaw)+this.seatLookYaw;
      if(!this.eyePosition?.(this.origin))this.origin.set(...v.spec.seat).add(this.offset.set(0,v.spec.characterPose==='stand'?1.55:.72,0)).applyQuaternion(rotation).add(position);
      if(v.spec.mode==='tank'&&this.mode===2)this.origin.set(0,4.35,-1.2).applyQuaternion(rotation).add(position);
      this.localRotation.set(this.pitch,this.seatLookYaw,0,'YXZ');
      this.direction.set(0,0,-1).applyEuler(this.localRotation).applyQuaternion(rotation);
      this.offset.set(-1,0,0).applyAxisAngle(this.targetUp.set(0,1,0),this.seatLookYaw).applyQuaternion(rotation);
      this.up.set(0,1,0).applyQuaternion(rotation);
    }else{
      const height=h?(h.swimming?1.35:Math.max(.25,h.capsuleHeight-.2)):1.5;
      this.origin.copy(position).add(this.offset.set(0,height,0));
      this.direction.set(-Math.sin(this.yaw)*Math.cos(this.pitch),Math.sin(this.pitch),-Math.cos(this.yaw)*Math.cos(this.pitch));
      this.offset.set(-Math.cos(this.yaw),0,Math.sin(this.yaw));this.up.set(0,1,0);
    }
    // 镜头右肩偏移；位置立即继承主体运动，仅柔化肩位/姿态变化。
    this.anchor.copy(this.origin).addScaledVector(this.offset,.48+this.tuning.horizontalOffset).addScaledVector(this.up,(v?.22:.08)+this.tuning.targetHeightOffset);
    if(!this.initialized)this.target.copy(this.anchor);
    else {this.target.add(this.delta.subVectors(position,this.lastCharacterPosition));this.target.lerp(this.anchor,1-Math.exp(-this.tuning.followResponsePerSecond*Math.max(0,dt)));}
    this.lastCharacterPosition.copy(position);
    const radius=Math.min(.2,this.tuning.collisionRadiusMeters);
    const ideal=this.shoulderDistance+pace*.3;
    this.desired.copy(this.target).addScaledVector(this.direction,ideal);
    const solved=this.collision.solve({target:this.target.toArray(),eye:this.desired.toArray(),
      current:this.camera.position.toArray(),pivotOrigin:this.origin.toArray(),radius,
      preserveArmDirection:true,armClearance:.025,
      ...(this.initialized?{sweepFrom:this.camera.position.toArray()}:{}),
    },{authorityTick:++this.collisionTick,deltaSeconds:Math.max(0,dt),clearHoldSeconds:0,
      recoveryHalfLifeSeconds:Math.LN2/5,maximumRecoveryMetersPerSecond:Number.MAX_VALUE,resetWhenClear:false});
    this.target.fromArray(solved.target);this.desired.fromArray(solved.desiredPosition);
    this.candidate.fromArray(solved.position);this.collisionLimited=solved.limited;
    this.camera.position.copy(this.candidate);this.camera.up.copy(this.up);this.camera.lookAt(this.target);
    this.distance=this.camera.position.distanceTo(this.target);this.initialized=true;
    // 克制的速度反馈，不把逐帧头骨摆动传给相机。
    const fov=damp(this.camera.fov,this.tuning.baseFovDegrees+pace*4,5,dt);
    this.camera.fov=fov;this.camera.near=.05;this.camera.updateProjectionMatrix();
  }
  private updateFirstPerson(sim:Simulation,pose?:MotionPose):void {
    const v=sim.vehicle,rotation=pose?.rotation??v?.rotation;
    if(v&&rotation){
      // 眼位来自驾驶员，缺少人物骨架时才使用明确的座位姿态回退。
      if(!this.eyePosition?.(this.desired))this.desired.set(...v.spec.seat).add(this.offset.set(0,v.spec.characterPose==='stand'?1.55:.72,.08)).applyQuaternion(rotation).add(pose?.position??v.position);
      this.yaw=(pose?.yaw??v.yaw)+this.seatLookYaw;
      this.localRotation.set(this.pitch,this.seatLookYaw,0,'YXZ');
      this.direction.set(0,0,1).applyEuler(this.localRotation).applyQuaternion(rotation);
      this.up.set(0,1,0).applyQuaternion(rotation);
      applyVehicleCameraRoll(this.up,this.direction);
    }else{
      const h=sim.humanoid;
      // 稳定眼位随真实胶囊蹲伏/匍匐变化，不继承翻滚动画的旋转或头部摆动。
      const eyeHeight=h?(h.swimming?1.35:Math.max(.18,h.capsuleHeight-.12)):1.55;
      this.desired.copy(pose?.position??sim.player.position).add(this.offset.set(0,eyeHeight,0));
      this.direction.set(Math.sin(this.yaw)*Math.cos(this.pitch),-Math.sin(this.pitch),Math.cos(this.yaw)*Math.cos(this.pitch));
      this.up.set(0,1,0);
    }
    this.anchor.copy(this.desired);this.target.copy(this.desired);
    this.aim.copy(this.desired).add(this.direction);
    this.camera.position.copy(this.desired);this.camera.up.copy(this.up);this.camera.lookAt(this.aim);
    this.distance=0;this.collisionLimited=false;this.initialized=true;
    // 角色胶囊/载具接触负责位置约束；不把包含驾驶员的整车包围盒当墙推开眼睛。
    const fov=this.tuning.baseFovDegrees;
    if(this.camera.near!==.035||this.camera.fov!==fov){this.camera.near=.035;this.camera.fov=fov;this.camera.updateProjectionMatrix();}
  }
  private capsuleVisible(eye:T.Vector3,position:T.Vector3,height:number,capsule:RAPIER.Collider,world:RAPIER.World):boolean{
    // Test visibility on the actual capsule independently of the spring arm.
    // A point outside the body is not proof
    // that the character is visible. Never use the camera's thick sphere as a
    // visibility ray, which hides small but genuinely visible head/side slivers.
    const radius=(capsule.shape as RAPIER.Capsule).radius;
    const ray=new RAPIER.Ray(eye,{x:0,y:0,z:0});
    for(const ratio of [1,0,.5,.25,.75,.125,.875,.375,.625]){
      const y=.001+(height-.002)*ratio;
      const capOffset=Math.max(radius-y,y-(height-radius),0);
      const ringRadius=Math.sqrt(Math.max(0,radius*radius-capOffset*capOffset))*.999;
      for(let sample=0;sample<9;sample++){
        const angle=(sample-1)*Math.PI/4,r=sample===0?0:ringRadius;
        ray.dir.x=position.x+Math.cos(angle)*r-eye.x;
        ray.dir.y=position.y+y-eye.y;
        ray.dir.z=position.z+Math.sin(angle)*r-eye.z;
        if(!world.castRay(ray,.99999,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,capsule,undefined,this.cameraFilter)&&
          this.vehicleQueries.visibleBetween(eye.toArray(),[eye.x+ray.dir.x,eye.y+ray.dir.y,eye.z+ray.dir.z],this.mountedId))return true;
      }
    }
    return false;
  }
  private humanoidCollisionRequest(humanoid:NonNullable<Simulation['humanoid']>,position:T.Vector3,origin:T.Vector3,target:T.Vector3,eye:T.Vector3,sweepFrom?:T.Vector3,current=this.camera.position):CameraCollisionRequest {
    return {target:target.toArray(),eye:eye.toArray(),current:current.toArray(),
      radius:this.humanoidTuning.collisionRadiusMeters,
      pivotOrigin:origin.toArray(),preserveArmDirection:true,armClearance:.04,
      canIgnoreArmObstruction:eye=>this.capsuleVisible(new T.Vector3(...eye),position,humanoid.capsuleHeight,humanoid.capsule,humanoid.world),
      ...(sweepFrom?{sweepFrom:sweepFrom.toArray()}:{}),
    };
  }
  private updateHumanoid(sim:Simulation,dt:number,pose?:MotionPose){
    const humanoid=sim.humanoid!;
    // The source camera follows its posture at 7/s. Feed it the same interpolated
    // position and capsule height as the renderer, never a second fixed-tick pose.
    const height=pose?.cameraHeight??(pose?1.68*.655:humanoid.swimming?1.4:humanoid.capsuleHeight*.655);
    const position=pose?.position??sim.player.position;
    this.origin.copy(position).add(this.offset.set(0,height,0));
    this.anchor.copy(this.origin).add(this.offset.set(Math.cos(this.yaw)*this.tuning.horizontalOffset,this.tuning.targetHeightOffset,-Math.sin(this.yaw)*this.tuning.horizontalOffset));
    const response=this.humanoidTuning.followResponsePerSecond;
    if(!this.initialized)this.target.copy(this.anchor);
    else {
      // Inherit locomotion, damping only posture/shoulder changes. World-space
      // follow lag stretches the arm and can leave its pivot behind a wall.
      this.target.add(this.delta.subVectors(position,this.lastCharacterPosition));
      this.target.lerp(this.anchor,1-Math.exp(-Math.max(0,dt)*response));
    }
    this.lastCharacterPosition.copy(position);
    const pitch=this.pitch;
    // Source forward is -Z. Negating the horizontal boom keeps the host's +Z
    // yaw contract, so camera-relative movement needs no second conversion.
    this.direction.set(-Math.sin(this.yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(this.yaw)*Math.cos(pitch));
    const desiredDistance=clamp(this.characterDistance()*this.zoom,3.2,12);
    this.desired.copy(this.target).addScaledVector(this.direction,desiredDistance);
    this.collisionLimited=false;
    {
      const solved=this.collision.solve(this.humanoidCollisionRequest(humanoid,position,this.origin,this.target,this.desired,
        this.initialized?this.camera.position:undefined),{
        authorityTick:++this.collisionTick,deltaSeconds:Math.max(0,dt),clearHoldSeconds:0,
        recoveryHalfLifeSeconds:Math.LN2/5,maximumRecoveryMetersPerSecond:Number.MAX_VALUE,resetWhenClear:false,
      });
      this.target.fromArray(solved.target);this.desired.fromArray(solved.desiredPosition);
      // Keep the configured free arm exact; constrained length comes from geometry.
      this.distance=solved.limited?solved.effectiveDistance:desiredDistance;this.candidate.fromArray(solved.position);this.collisionLimited=solved.limited;
    }
    this.camera.position.copy(this.candidate);
    this.up.set(0,1,0);this.camera.up.copy(this.up);this.camera.lookAt(this.target);
    const fov=this.humanoidTuning.baseFovDegrees;
    if(this.camera.fov!==fov||this.camera.near!==.08){this.camera.fov=fov;this.camera.near=.08;this.camera.updateProjectionMatrix();}
    this.lastAnchor.copy(this.anchor);this.initialized=true;
  }
  get underwater(){
    const p=this.camera.position;return this.environment.map.water.some(w=>p.x>=w.min[0]&&p.x<=w.max[0]&&p.z>=w.min[2]&&p.z<=w.max[2]&&p.y>=w.min[1]&&p.y<w.surface-.15);
  }
}
