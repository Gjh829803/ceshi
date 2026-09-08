import * as T from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Simulation, angleDelta, clamp, damp } from './simulation';
import { groundHeight, wetHeight } from './terrain';
import { WATER } from './config';
import type { MotionPose } from './presentation';
import { DEFAULT_CAMERA_TUNING, type CameraTuning } from './platform/session';
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
    this.currentPresentation={
      position:this.camera.position.clone(), rotation:this.camera.quaternion.clone(),
      target:this.target.clone(), subject:(sim.vehicle?.position??sim.player.position).clone(),
      up:this.camera.up.clone(), fov:this.camera.fov, near:this.camera.near,
    };
    if(snap||!this.previousPresentation)this.previousPresentation=this.currentPresentation;
  }
  present(pose:MotionPose,alpha:number):void {
    const a=this.previousPresentation,b=this.currentPresentation;
    if(!a||!b)return;
    const subject=a.subject.clone().lerp(b.subject,alpha);
    const offset=pose.position.clone().sub(subject);
    const target=a.target.clone().lerp(b.target,alpha).add(offset);
    this.displayedTarget=target;
    const eye=a.position.clone().lerp(b.position,alpha).add(offset);
    const resolved=this.tuning.collisionEnabled&&this.environment
      ? this.environment.cameraCast(target,eye,this.tuning.collisionRadiusMeters) : eye;
    this.camera.position.copy(resolved);
    this.camera.quaternion.slerpQuaternions(a.rotation,b.rotation,alpha);
    this.camera.up.copy(a.up).lerp(b.up,alpha).normalize();
    if(this.camera.position.distanceToSquared(eye)>1e-10)this.camera.lookAt(target);
    this.camera.fov=a.fov+(b.fov-a.fov)*alpha;
    this.camera.near=b.near;
    this.camera.updateProjectionMatrix();
  }

  tuning:CameraTuning={...DEFAULT_CAMERA_TUNING};
  baseDistance?:number;
  yaw=0;pitch=.3;zoom=1;mode=0;lastOrbit=-10;target=new T.Vector3();initialized=false;lastActive=-2;distance=6;
  ray=new T.Raycaster();up=new T.Vector3(0,1,0);collisionLimited=false;
  private sourceCharacter=false;
  private globalOverview=false;
  private readonly originalNear:number;
  private readonly characterSphere=new RAPIER.Ball(.2);
  private readonly identity=new T.Quaternion();
  private readonly lastCharacterPosition=new T.Vector3();
  private anchor=new T.Vector3();private lastAnchor=new T.Vector3();private delta=new T.Vector3();private aim=new T.Vector3();private desired=new T.Vector3();private candidate=new T.Vector3();private direction=new T.Vector3();private origin=new T.Vector3();private offset=new T.Vector3();private targetUp=new T.Vector3();private localLook=new T.Vector3();private localRotation=new T.Euler(0,0,0,'YXZ');private hits:T.Intersection[]=[];private revision=-1;
  private readonly probeOffsets=[new T.Vector3(),new T.Vector3(.23,0,0),new T.Vector3(-.23,0,0),new T.Vector3(0,.23,0),new T.Vector3(0,-.23,0)];
  constructor(public camera:T.PerspectiveCamera,public solids:T.Object3D[],public environment?:EnvironmentQueries){this.originalNear=camera.near;}
  get desiredPosition():T.Vector3{return this.desired.clone();}
  orbit(dx:number,dy:number,time:number,sim?:Simulation){
    const character=sim?!!sim.humanoid&&!sim.vehicle:this.sourceCharacter;
    this.yaw-=dx*.004;this.pitch=character?clamp(this.pitch+dy*.004,.12,1.1):clamp(this.pitch+dy*.003,-.6,1.25);this.lastOrbit=time;
  }
  scroll(deltaY:number,sim:Simulation){
    if(sim.humanoid&&!sim.vehicle){const base=this.characterDistance();this.zoom=clamp(base*this.zoom+deltaY*.007,3.2,12)/base;}
    else this.zoom=clamp(this.zoom+deltaY*.0007,.45,2.5);
  }
  reset(sim:Simulation){this.sourceCharacter=!!sim.humanoid&&!sim.vehicle;this.yaw=sim.vehicle?.yaw??sim.player.yaw;this.pitch=this.sourceCharacter?.35:.3;this.zoom=1;this.lastOrbit=sim.time;this.initialized=false;}
  update(sim:Simulation,dt:number,pose?:MotionPose){
    const v=sim.vehicle,body=pose??v??sim.player,speed=body.velocity.length(),position=body.position,yaw=pose?.yaw??v?.yaw??sim.player.yaw,rotation=pose?.rotation??v?.rotation;
    if(this.revision!==sim.teleportRevision){this.revision=sim.teleportRevision;this.reset(sim);}
    const globalOverview=!v&&!!sim.humanoid&&this.mode===2;
    // A map-centred observation camera and an actor camera have different
    // origins and arm scales. Never damp a kilometre-wide overview into a seat.
    if(globalOverview!==this.globalOverview){this.globalOverview=globalOverview;this.initialized=false;}
    const subjectChanged=this.lastActive!==sim.active;
    if(subjectChanged){this.lastActive=sim.active;this.lastOrbit=sim.time;this.yaw=yaw;this.pitch=!v&&sim.humanoid?.35:.3;this.initialized=false;}
    if(!v&&sim.humanoid){
      if(!this.sourceCharacter||subjectChanged){this.zoom=1;this.initialized=false;}
      this.sourceCharacter=true;this.updateHumanoid(sim,dt,pose);return;
    }
    if(this.sourceCharacter){this.sourceCharacter=false;this.zoom=1;}
    if(this.camera.near!==this.originalNear){this.camera.near=this.originalNear;this.camera.updateProjectionMatrix();}
    const airborne=v&&['space','plane','glider','sub','dragon'].includes(v.spec.mode);
    if(v&&this.mode!==1&&sim.time-this.lastOrbit>this.tuning.recenterDelaySeconds&&speed>.8){this.yaw+=angleDelta(this.yaw,yaw)*(1-Math.exp(-this.tuning.recenterResponsePerSecond*(airborne?1.3/1.9:1)*dt));this.pitch=damp(this.pitch,airborne?.2:.28,1.2*this.tuning.recenterResponsePerSecond/1.9,dt);}
    this.anchor.copy(position);this.anchor.y+=(v?(v.creature?v.spec.seat[1]+.6:1):1.25)+this.tuning.targetHeightOffset;
    this.anchor.x+=Math.cos(this.yaw)*this.tuning.horizontalOffset;this.anchor.z-=Math.sin(this.yaw)*this.tuning.horizontalOffset;this.aim.copy(this.anchor);
    this.targetUp.set(0,1,0);if(v?.spec.mode==='space'&&rotation)this.targetUp.applyQuaternion(rotation);
    this.up.lerp(this.targetUp,1-Math.exp(-5*dt)).normalize();
    const idealDistance=(this.baseDistance??(v?v.spec.camera:5.5))*this.zoom+Math.min(speed*.075,4);
    this.distance=this.initialized?damp(this.distance,idealDistance,idealDistance>this.distance?3:1.2,dt):idealDistance;
    if(this.mode===1&&v&&rotation){
      this.offset.set(...v.spec.seat).add(this.localLook.set(this.tuning.horizontalOffset,.65+this.tuning.targetHeightOffset,.6)).applyQuaternion(rotation);this.desired.copy(position).add(this.offset);
      this.localRotation.set(clamp(this.pitch-.3,-.7,.7),clamp(angleDelta(yaw,this.yaw),-1.3,1.3),0,'YXZ');
      this.localLook.set(0,0,12).applyEuler(this.localRotation).applyQuaternion(rotation);this.aim.copy(this.desired).add(this.localLook);
    }else if(this.mode===2){this.desired.copy(this.anchor).add(this.offset.set(0,this.distance*2,-this.distance*.25));}
    else {
      const distance=this.mode===1?3.2:this.distance,orbit=v?.spec.mode==='space'?angleDelta(yaw,this.yaw):this.yaw;
      this.offset.set(-Math.sin(orbit)*Math.cos(this.pitch)*distance,Math.sin(this.pitch)*distance,-Math.cos(orbit)*Math.cos(this.pitch)*distance);
      if(v?.spec.mode==='space'&&rotation)this.offset.applyQuaternion(rotation);
      this.desired.copy(this.anchor).add(this.offset);if(this.mode===1)this.desired.x+=.6;
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
    const collisionRadius=this.tuning.collisionRadiusMeters;
    if(this.tuning.collisionEnabled&&this.environment){
      const resolved=this.environment.cameraCast(this.anchor,this.candidate,collisionRadius);
      this.collisionLimited=resolved.distanceToSquared(this.candidate)>.000001;
      this.candidate.copy(resolved);
    }else if(this.tuning.collisionEnabled&&!(this.mode===1&&v)){
      // Test the smoothed candidate. Only actual ray hits shorten the arm.
      this.direction.subVectors(this.candidate,this.anchor);const length=this.direction.length();let safe=length;
      if(length>.001){this.direction.multiplyScalar(1/length);for(const offset of this.probeOffsets){this.origin.copy(this.anchor).addScaledVector(offset,collisionRadius/.25);this.ray.set(this.origin,this.direction);this.ray.far=length;this.hits.length=0;this.ray.intersectObjects(this.solids,false,this.hits);const hit=this.hits[0];if(hit)safe=Math.min(safe,Math.max(collisionRadius+.1,hit.distance-collisionRadius-.05));}
        this.collisionLimited=safe<length-.001;this.candidate.copy(this.anchor).addScaledVector(this.direction,safe);
      }
      this.candidate.y=Math.max(this.candidate.y,groundHeight(this.candidate.x,this.candidate.z)+collisionRadius+.15);
    }
    this.camera.position.copy(this.candidate);this.target.lerp(this.aim,1-Math.exp(-12*dt));this.camera.up.copy(this.up);this.camera.lookAt(this.target);
    const fov=damp(this.camera.fov,this.tuning.baseFovDegrees+Math.min(12,speed*.23),3,dt);if(Math.abs(fov-this.camera.fov)>.0001){this.camera.fov=fov;this.camera.updateProjectionMatrix();}
  }
  private characterDistance(){
    const configured=this.baseDistance??8.8;
    // Preserve the source's indoor default even when the UI supplies the
    // unchanged 8.8 m asset baseline; non-default user tuning takes precedence.
    return configured===8.8?this.environment?.map.characterCameraDistanceMeters??configured:configured;
  }
  private capsuleVisible(eye:T.Vector3,position:T.Vector3,height:number,capsule:RAPIER.Collider,world:RAPIER.World):boolean{
    // Original Whitebox (12d2445d, native-block-subject-occlusion) tests the
    // whole subject, independently of the spring arm. Here sample the actual
    // capsule, without its fade margins: a point outside the body is not proof
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
        if(!world.castRay(ray,.99999,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,capsule))return true;
      }
    }
    return false;
  }
  private updateHumanoid(sim:Simulation,dt:number,pose?:MotionPose){
    const humanoid=sim.humanoid!;
    // The source camera follows its posture at 7/s. Feed it the same interpolated
    // position and capsule height as the renderer, never a second fixed-tick pose.
    const height=pose?.cameraHeight??(pose?1.68*.655:humanoid.swimming?1.4:humanoid.capsuleHeight*.655);
    const position=pose?.position??sim.player.position;
    this.origin.copy(position).add(this.offset.set(0,height,0));
    this.anchor.copy(this.origin).add(this.offset.set(Math.cos(this.yaw)*this.tuning.horizontalOffset,this.tuning.targetHeightOffset,-Math.sin(this.yaw)*this.tuning.horizontalOffset));
    const overview=this.mode===2,bounds=this.environment?.map.bounds;
    if(overview&&bounds)this.anchor.set((bounds.min[0]+bounds.max[0])/2,2,(bounds.min[2]+bounds.max[2])/2);
    const response=this.baseDistance===undefined?7:this.tuning.followResponsePerSecond;
    if(!this.initialized)this.target.copy(this.anchor);
    else {
      // Inherit locomotion, damping only posture/shoulder changes. World-space
      // follow lag stretches the arm and can leave its pivot behind a wall.
      if(!overview)this.target.add(this.delta.subVectors(position,this.lastCharacterPosition));
      this.target.lerp(this.anchor,1-Math.exp(-Math.max(0,dt)*response));
    }
    this.lastCharacterPosition.copy(position);
    const pitch=overview?.92:this.pitch;
    // Source forward is -Z. Negating the horizontal boom keeps the host's +Z
    // yaw contract, so camera-relative movement needs no second conversion.
    this.direction.set(-Math.sin(this.yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(this.yaw)*Math.cos(pitch));
    const desiredDistance=overview&&bounds?Math.max(bounds.max[0]-bounds.min[0],bounds.max[2]-bounds.min[2])*.94:this.mode===1?3.2:clamp(this.characterDistance()*this.zoom,3.2,12);
    let safeDistance=desiredDistance;
    if(!overview&&this.tuning.collisionEnabled){
      this.characterSphere.radius=this.baseDistance===undefined?.2:this.tuning.collisionRadiusMeters;
      // Sweep the shoulder offset from the anatomical pivot first. Otherwise a
      // wall beside the actor produces a zero-distance hit along the whole boom.
      this.delta.subVectors(this.target,this.origin);
      const pivotTravel=this.delta.length();
      if(pivotTravel>.00001){
        this.delta.divideScalar(pivotTravel);
        const pivotHit=humanoid.world.castShape(this.origin,this.identity,this.delta,this.characterSphere,0,pivotTravel,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,humanoid.capsule);
        if(pivotHit)this.target.copy(this.origin).addScaledVector(this.delta,Math.max(0,pivotHit.time_of_impact-.02));
      }
      // Native sensor filtering avoids callbacks into a borrowed Rapier collider
      // set; exclude only this actor, so parked vehicles and carried props count.
      // Resolve actual pivot penetration with Rapier contact normals, as in the
      // main Whitebox rig. Do not mistake an embedded pivot for a wall at the eye.
      for(let attempt=0;attempt<8;attempt++){
        const collider=humanoid.world.intersectionWithShape(this.target,this.identity,this.characterSphere,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,humanoid.capsule);
        if(!collider)break;
        const contact=collider.contactShape(this.characterSphere,this.target,this.identity,0);
        if(!contact||contact.distance>0)break;
        this.target.addScaledVector(this.delta.copy(contact.normal1),-contact.distance+.02);
      }
      const hit=humanoid.world.castShape(this.target,this.identity,this.direction,this.characterSphere,0,desiredDistance,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,humanoid.capsule);
      if(hit){
        this.candidate.copy(this.target).addScaledVector(this.direction,desiredDistance);
        const eyeBlocked=humanoid.world.intersectionWithShape(this.candidate,this.identity,this.characterSphere,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,humanoid.capsule);
        // A pole or low wall across the arm is not a camera collision. Keep
        // framing while any sampled part of the physical capsule is visible.
        if(eyeBlocked||!this.capsuleVisible(this.candidate,position,humanoid.capsuleHeight,humanoid.capsule,humanoid.world))safeDistance=Math.max(0,hit.time_of_impact-.04);
      }
    }
    this.collisionLimited=safeDistance<desiredDistance-.001;
    this.desired.copy(this.target).addScaledVector(this.direction,desiredDistance);
    // Preserve source controls.ts: obstruction retracts immediately; release is
    // eased at 5/s. Damping a camera position after collision would cross walls.
    this.distance=!this.initialized||overview||safeDistance<this.distance?safeDistance:this.distance+(safeDistance-this.distance)*(1-Math.exp(-Math.max(0,dt)*5));
    this.candidate.copy(this.target).addScaledVector(this.direction,this.distance);
    // Visibility tolerance must not permit the camera itself to tunnel through
    // a thin wall during free orbit. A fully blocked arm still uses the inward
    // visibility relocation above; free/partly-visible travel is sphere-swept.
    if(this.initialized&&!overview&&this.tuning.collisionEnabled&&safeDistance===desiredDistance){
      this.delta.subVectors(this.candidate,this.camera.position);const travel=this.delta.length();
      if(travel>.00001&&!humanoid.world.intersectionWithShape(this.camera.position,this.identity,this.characterSphere,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,humanoid.capsule)){
        this.delta.divideScalar(travel);
        const motionHit=humanoid.world.castShape(this.camera.position,this.identity,this.delta,this.characterSphere,0,travel,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,humanoid.capsule);
        if(motionHit){this.candidate.copy(this.camera.position).addScaledVector(this.delta,Math.max(0,motionHit.time_of_impact-.02));this.collisionLimited=true;this.distance=this.candidate.distanceTo(this.target);}
      }
    }
    this.camera.position.copy(this.candidate);
    this.up.set(0,1,0);this.camera.up.copy(this.up);this.camera.lookAt(this.target);
    const fov=this.baseDistance===undefined?58:this.tuning.baseFovDegrees;
    if(this.camera.fov!==fov||this.camera.near!==.08){this.camera.fov=fov;this.camera.near=.08;this.camera.updateProjectionMatrix();}
    this.lastAnchor.copy(this.anchor);this.initialized=true;
  }
  get underwater(){
    if(this.environment){const p=this.camera.position;return this.environment.map.water.some(w=>p.x>=w.min[0]&&p.x<=w.max[0]&&p.z>=w.min[2]&&p.z<=w.max[2]&&p.y>=w.min[1]&&p.y<w.surface-.15);}
    return wetHeight(this.camera.position.x,this.camera.position.z)&&this.camera.position.y<WATER-.15;
  }
}
