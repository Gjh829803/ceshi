import { Quaternion,Vector3 } from 'three';
import { canPlaceCreature,resetCreatureState } from '../creatures/controller';
import { vehicleBody } from '../environment/queries';
import type { MapSpawn } from '../environment/types';
import { resetFamilyRigidState } from '../motion-families/registry';
import { paddleRiderBody } from '../motion-families/surface-vessel/paddling';
import { evaluateDismount,evaluateMount,type MountContext,type MountDecision,type MountFailureCode } from '../mounted-interaction';
import type { Input,PlayerState,Simulation,VehicleState } from '../simulation';
import { actorBlocksPlayer,createVehicle,emptyInput } from '../simulation';
import { HUMANOID_BODY,HumanoidController } from './controller';
export interface ActorInput {readonly input:Input;readonly yaw:number}

export function syncPlayer(controller:HumanoidController,player:PlayerState):void{
  player.position.copy(controller.position);player.velocity.copy(controller.velocity);player.velocity.y=controller.vertical;
  player.yaw=Math.atan2(controller.facing.x,controller.facing.z);player.grounded=controller.grounded;player.swimming=controller.swimming;
  player.coyote=controller.coyote;player.jumpBuffer=controller.jumpBuffer;player.animation=controller.state;
  player.landTimer=controller.animationEvent?.kind==='land'?Math.max(0,.45-controller.animationEvent.elapsed):0;
}

/** Shared input interpretation; controller.step commits this actor, never the world clock. */
export function stepHumanoidInput(controller:HumanoidController,input:Input,yaw:number):boolean{
  const surface=controller.surface.surface;
  const direction=surface?new Vector3(input.steer,0,-input.forward).applyAxisAngle(new Vector3(0,1,0),Math.atan2(surface.normal[0],surface.normal[2])):new Vector3(-input.steer,0,input.forward).applyAxisAngle(new Vector3(0,1,0),yaw);
  if(direction.lengthSq()>1)direction.normalize();
  if(input.actions?.toggleSwimStyle&&controller.swimming)controller.swimStyle=controller.swimStyle==='freestyle'?'breaststroke':'freestyle';
  if(input.actions?.cancel&&controller.skills.active)controller.skills.cancel(controller.skills.active.requestId);
  const serial=controller.motionSerial;controller.step(direction,input.boost,input.slow,input.jump,input.actions);
  return controller.motionSerial!==serial&&!controller.traversal&&!controller.completedMotion;
}

/** One controller, committed pose and riding relationship for every humanoid. */
export class HumanoidActor {
  readonly controller:HumanoidController;
  readonly player:PlayerState={position:new Vector3(),velocity:new Vector3(),yaw:0,grounded:false,swimming:false,coyote:0,jumpBuffer:0,animation:'Idle_Loop',landTimer:0};
  vehicleIndex=-1;
  transition=0;
  transitionKind:''|'enter'|'exit'='';
  message='';
  failureCode:MountFailureCode|undefined;
  teleportRevision=0;
  get environment(){return this.world.environment;}
  get vehicles(){return this.world.vehicles;}
  get time(){return this.world.time;}
  constructor(readonly id:string,readonly world:Simulation,position:Vector3,yaw=0){
    this.controller=new HumanoidController(world.environment);
    try{this.resetAt(position,yaw);}catch(error){this.controller.dispose();throw error;}
  }
  resetAt(position:Vector3,yaw:number):void{this.vehicleIndex=-1;this.transition=0;this.transitionKind='';this.controller.resetAt(position,yaw);syncPlayer(this.controller,this.player);this.teleportRevision++;}
  beginStep(dt:number):void{this.transition=Math.max(0,this.transition-dt);this.controller.skills.syncSeats((id,point)=>this.environment.propAnchor(id,point));}
  step(input:Input,yaw:number):void{
    const v=this.vehicle,p=this.player;
    if(v){p.position.copy(v.position);if(v.spec.mode==='mount')p.position.add(new Vector3(...v.spec.seat).applyQuaternion(v.rotation));p.yaw=v.yaw;p.animation=this.transition>0?'Sitting_Enter':v.spec.characterPose==='stand'?'Idle_Loop':'Driving_Loop';return;}
    if(stepHumanoidInput(this.controller,this.transition>0?emptyInput():input,yaw))this.teleportRevision++;syncPlayer(this.controller,this.player);
  }
  finishStep():void{const v=this.vehicle;if(v&&(v.motion.wheelPhysics||v.motion.body||v.motion.aircraft)){this.player.position.copy(v.position);this.player.yaw=v.yaw;}this.controller.skills.syncDropped();this.controller.skills.syncSeats((id,point)=>this.environment.propAnchor(id,point));}
  dispose():void{this.controller.dispose();}
  private canRelocate(){if(this.vehicleIndex<0&&!this.controller.canBoard){this.message=this.controller.boardingReason;return false;}return true;}
  /** Explicit reset for authored test starts; ordinary vehicle visits retain world targets. */
  prepareCharacter(position:Vector3,yaw:number){
    const safe=this.environment.safeSpawn(position,HUMANOID_BODY);if(!safe||this.environment.bodyOverlap({position:safe,rotation:new Quaternion(),body:HUMANOID_BODY},{excludedColliderHandles:new Set([this.controller.capsule.handle])},.015)){this.message='人物测试点没有站立净空';return false;}
    this.vehicleIndex=-1;this.transition=0;this.transitionKind='';this.controller.resetAt(safe,yaw);syncPlayer(this.controller,this.player);this.teleportRevision++;return true;
  }
  prepare(n:number,spawn:MapSpawn):boolean {
    const v=this.vehicles[n],q=this.environment;if(!v)return false;
    if(!this.canRelocate())return false;
    if([...this.world.actors.values()].some(actor=>actor!==this&&actor.vehicle===v)){this.message='该载具已被其他人物占用';return false;}
    const rotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),spawn.yaw);
    let safe=q.safeSpawn(new Vector3(...spawn.position),vehicleBody(v.spec),rotation);
    if(!safe){this.message='该准备点没有足够净空';return false;}
    const candidate=createVehicle(v.spec);candidate.position.copy(safe);candidate.rotation.copy(rotation);candidate.yaw=spawn.yaw;resetCreatureState(candidate);
    if(!canPlaceCreature(candidate,q)){this.message='该准备点无法容纳完整载具及牵引马匹';return false;}
    if(q.withVehicleCollisions(v.spec.id,()=>!canPlaceCreature(candidate,q))){this.message='准备点被其他载具占用';return false;}
    const boarding=this.boardingPoint(candidate);
    if(!boarding){this.message='准备点旁没有安全交互位置';return false;}
    q.releaseVehicleRig(v.spec.id);Object.assign(v,candidate);this.world.preparedVehicleSpawns.set(v.spec.id,spawn);
    this.vehicleIndex=-1;this.transition=0;this.transitionKind='';this.teleportRevision++;
    this.player.position.copy(boarding);this.player.velocity.set(0,0,0);Object.assign(this.player,{yaw:v.yaw,grounded:false,swimming:!!q.waterAt(boarding),coyote:0,jumpBuffer:0,landTimer:0,animation:'Idle_Loop'});
    this.controller.setMounted(false,boarding,v.yaw);this.world.syncActorBodies();
    this.message=`${v.spec.name}已就位 · 按 F 驾驶`;return true;
  }
  get vehicle(){return this.vehicles[this.vehicleIndex];}
  nearest():number {let best=-1,d=Infinity;this.vehicles.forEach((v,n)=>{const ds=v.position.distanceTo(this.player.position),body=vehicleBody(v.spec),range=body.kind==='box'?Math.max(5.3,body.halfExtents[0]+2):Math.max(5.3,v.motion.creature?v.spec.radius+1.6:0);if(this.world.available(v)&&ds<range&&ds<d&&v.velocity.length()<3){d=ds;best=n;}});return best;}
  private boardingPoint(v:VehicleState):Vector3|null {
    const q=this.environment;const body=vehicleBody(v.spec);
    const rx=body.kind==='box'?body.halfExtents[0]+(v.motion.submersible?1.35:.9):v.spec.radius+1.2,rz=body.kind==='box'?body.halfExtents[2]+(v.motion.submersible?1.35:.9):v.spec.radius+1.2;
    const offsets=[[rx,0],[-rx,0],[0,-rz],[0,rz]];
    // Prefer a dry pontoon when boarding a paddle craft; retain swimming exits offshore.
    for(const dryOnly of (v.spec.mode==='paddled_boat'||v.motion.submersible?[true,false]:[false]))for(const [x=0,z=0] of offsets){
      const p=new Vector3(x,0,z).applyAxisAngle(new Vector3(0,1,0),v.yaw).add(v.position);
      const floor=q.support(p,4,.45),water=q.waterAt(p);
      if(dryOnly){if(!floor||(water&&floor.height<water.surface)||Math.abs(floor.height-v.position.y)>1)continue;p.y=floor.height+.025;}
      else if(water&&v.position.y<water.surface+2)p.y=water.surface-1.25;
      else if(floor&&Math.abs(floor.height-v.position.y)<4)p.y=floor.height+.025;
      else continue;
      const selectedDistance=v.position.distanceTo(p);
      if(v.motion.creature?.leadPosition&&v.motion.creature.leadPosition.distanceTo(p)<2.3)continue;
      if(this.vehicles.some(o=>o.spec.id!==v.spec.id&&this.world.available(o)&&(actorBlocksPlayer(o,p,.5)||(o.velocity.length()<3&&o.position.distanceTo(p)<=selectedDistance))))continue;
      const safe=q.safeSpawn(p,HUMANOID_BODY);if(safe)return safe;
    }return null;
  }
  private mountContext(): MountContext {
    return {
      environment: this.environment,
      humanoid: this.controller,
      vehicles: this.vehicles,
      available: v => this.world.available(v),
      transitionSeconds: this.transition,
      mountedInstanceId: this.vehicle?.spec.id ?? null,
    };
  }
  private boardingDecision(id:string):MountDecision {
    const v=this.vehicles.find(v=>v.spec.id===id);
    if(v&&[...this.world.actors.values()].some(actor=>actor!==this&&actor.vehicle===v))return {ok:false,code:'HUMANOID_TARGET_UNAVAILABLE',message:'该载具已被其他人物占用'};
    if(v?.spec.mode==='mount'||!v||this.vehicle?.spec.mode==='mount')return evaluateMount(this.mountContext(),id);
    const fail=(code:MountFailureCode,message:string):MountDecision=>({ok:false,code,message});
    if(this.transition>0)return fail('HUMANOID_TRANSITION_ACTIVE','骑乘切换尚未完成');
    if(this.vehicle)return fail('HUMANOID_ALREADY_MOUNTED','人物已经骑乘');
    if(!this.controller.canBoard)return fail('HUMANOID_CHARACTER_BUSY',this.controller.boardingReason);
    if(!this.world.available(v))return fail('HUMANOID_TARGET_UNAVAILABLE','当前地图不支持该载具');
    if(v.velocity.length()>=3)return fail('VEHICLE_MOUNT_TOO_FAST','载具速度过快');
    const body=vehicleBody(v.spec),range=Math.max(5.3,body.kind==='box'?body.halfExtents[0]+2:0);
    if(v.position.distanceTo(this.player.position)>=range)return fail('VEHICLE_MOUNT_OUT_OF_REACH','靠近载具，按 F 进入驾驶位');
    if(v.spec.bodyPhysics?.kind==='paddle'&&this.environment.bodyOverlap({position:v.position,rotation:v.rotation,body:paddleRiderBody(v.spec.seat)},{excludedActorIds:new Set([v.spec.id]),excludedColliderHandles:new Set([this.controller.capsule.handle])}))return fail('VEHICLE_MOUNT_SPACE_BLOCKED','座位上方空间不足，无法搭乘');
    return {ok:true,instanceId:id,position:new Vector3(...v.spec.seat).applyQuaternion(v.rotation).add(v.position),yaw:v.yaw,velocity:new Vector3()};
  }
  /** On-demand read of existing boarding geometry and the execution admission decision. */
  inspectBoarding(id:string):{approachPositionWorldMetersXYZ:[number,number,number]|null;eligible:boolean;reason:string;message:string} {
    const v=this.vehicles.find(v=>v.spec.id===id),decision=this.boardingDecision(id);
    const approach=v&&this.world.available(v)&&v.velocity.length()<3?this.boardingPoint(v):null;
    return {approachPositionWorldMetersXYZ:approach?approach.toArray():null,eligible:decision.ok,
      reason:decision.ok?'ELIGIBLE':decision.code,message:decision.ok?'可以登乘':decision.message};
  }
  private commitInteraction(decision: MountDecision, entering: boolean): boolean {
    if (!decision.ok) {
      this.failureCode = decision.code;
      this.message = decision.message;
      return false;
    }
    if(entering&&[...this.world.actors.values()].some(actor=>actor!==this&&actor.vehicle?.spec.id===decision.instanceId)){this.failureCode='HUMANOID_TARGET_UNAVAILABLE';this.message='该载具已被其他人物占用';return false;}
    const index = this.vehicles.findIndex(v => v.spec.id === decision.instanceId);
    if (entering) {
      if (!this.controller.setMounted(true)) return false;
      this.vehicleIndex = index;
      this.player.position.copy(decision.position);
      this.player.velocity.set(0, 0, 0);
      this.player.yaw = decision.yaw;
    } else {
      this.controller.commitDismount(decision.position, decision.yaw, decision.velocity);
      this.vehicleIndex = -1;
      syncPlayer(this.controller,this.player);
    }
    this.failureCode = undefined;
    this.transition = entering ? 0.5 : 0.38;
    this.transitionKind = entering ? 'enter' : 'exit';
    this.player.animation = entering ? 'Sitting_Enter' : 'Sitting_Exit';
    this.teleportRevision++;
    this.message = entering ? '控制权已交给坐骑' : '已离开坐骑';
    this.world.syncActorBodies();
    return true;
  }
  enter(id: string): boolean {
    this.failureCode = undefined;
    this.world.syncActorBodies();
    const target = this.vehicles.find(v => v.spec.id === id);
    if (target?.spec.mode === 'mount' || !target || this.vehicle?.spec.mode === 'mount')
      return this.commitInteraction(this.boardingDecision(id), true);
    if (this.vehicle) {
      this.failureCode = 'HUMANOID_ALREADY_MOUNTED';
      return false;
    }
    return this.interact(id);
  }
  exit(): boolean {
    this.failureCode = undefined;
    if (this.vehicle?.spec.mode === 'mount' || !this.vehicle) {
      this.world.syncActorBodies();
      return this.commitInteraction(evaluateDismount(this.mountContext()), false);
    }
    return this.interact();
  }
  interact(targetId?: string): boolean {
    this.failureCode = undefined;
    if (this.vehicle?.spec.mode === 'mount') return this.exit();
    if (targetId && this.vehicles.find(v => v.spec.id === targetId)?.spec.mode === 'mount')
      return this.enter(targetId);
    if (this.transition > 0) {
      this.failureCode = 'HUMANOID_TRANSITION_ACTIVE';
      return false;
    }
    if (!this.vehicle && !targetId) {
      this.world.syncActorBodies();
      const nearby = this.vehicles.filter(v => this.world.available(v)).sort((a, b) =>
        a.position.distanceToSquared(this.player.position) - b.position.distanceToSquared(this.player.position));
      for (const v of nearby) {
        if (v.spec.mode === 'mount') {
          const decision = evaluateMount(this.mountContext(), v.spec.id);
          if (decision.ok) return this.commitInteraction(decision, true);
        } else if (this.nearest() === this.vehicles.indexOf(v)) return this.interact(v.spec.id);
      }
      const first = nearby.find(v => v.spec.mode === 'mount');
      if (first) return this.commitInteraction(evaluateMount(this.mountContext(), first.spec.id), true);
    }
    if (this.vehicle) {
      const v = this.vehicle;
      if(v.motion.submersible&&(this.environment.waterAt(v.position)?.surface??-Infinity)-v.position.y>.4){this.message='请先上浮至水面，再打开舱门离开潜艇';return false;}
      if (v.velocity.length() > 5) {
        this.message = '速度过快，请先减速至 18 km/h 以下再离开载具';
        return false;
      }
      const pt = this.boardingPoint(v);
      if (!pt) {
        this.message = '两侧没有安全落点，移动载具后再试';
        return false;
      }
      if (!this.controller.setMounted(false, pt, v.yaw)) return false;
      this.vehicleIndex = -1;
      this.player.position.copy(pt); this.player.velocity.copy(v.velocity); this.player.yaw = v.yaw;
      this.player.grounded = false; this.player.animation = 'Sitting_Exit';
      this.transition = .38; this.transitionKind = 'exit'; this.message = '已离开载具';
      return true;
    }
    if (!this.controller.canBoard) { this.message = this.controller.boardingReason; return false; }
    const n = targetId ? this.vehicles.findIndex(v => v.spec.id === targetId) : this.nearest();
    if (n < 0) { this.message = '靠近载具，按 F 进入驾驶位'; return false; }
    {const decision=this.boardingDecision(this.vehicles[n]!.spec.id);
      if(!decision.ok){this.failureCode=decision.code;this.message=decision.message;return false;}
    }
    const entering=this.vehicles[n]!;
    if(entering.motion.submersible&&(this.environment.waterAt(entering.position)?.surface??-Infinity)-entering.position.y>.4){this.message='潜艇尚在水下，请先准备到水面再登艇';return false;}
    if (!this.controller.setMounted(true)) return false;
    this.vehicleIndex = n; this.player.velocity.set(0, 0, 0); this.player.animation = 'Sitting_Enter';
    this.transition = .5; this.transitionKind = 'enter'; this.message = '控制权已交给载具';
    return true;
  }
  visit(n:number) {
    const v=this.vehicles[n];if(!v)return;
    const spawn=this.world.preparedVehicleSpawns.get(v.spec.id)??this.environment.map.spawns.find(s=>s.vehicleId===v.spec.id)??this.environment.map.spawns.find(s=>this.environment.map.regions.find(r=>r.id===s.regionId)?.modes.includes(v.spec.mode));
    if(spawn)this.prepare(n,spawn);
  }
  approach(id:string):boolean {
    if(!this.canRelocate())return false;
    const v=this.vehicles.find(vehicle=>vehicle.spec.id===id);
    if(!v){this.message='未找到该载具';return false;}
    if(!this.world.available(v)){this.message='当前地图不支持该载具';return false;}
    if(v.velocity.length()>=3){this.message='载具仍在移动，请减速或使用场景预设重新准备';return false;}
    const pt=this.boardingPoint(v);if(!pt){this.message='载具附近没有安全交互位置，请重新准备';return false;}
    if(!this.controller.setMounted(false,pt,v.yaw))return false;
    this.vehicleIndex=-1;this.transition=0;this.transitionKind='';this.teleportRevision++;this.player.position.copy(pt);this.player.velocity.set(0,0,0);Object.assign(this.player,{yaw:v.yaw,grounded:false,swimming:!!this.environment.waterAt(pt),coyote:0,jumpBuffer:0,landTimer:0,animation:'Idle_Loop'});return true;
  }
    recoverVehicle():boolean {
      const v=this.vehicle,q=this.environment;
      if(!v||!['wheeled','motorcycle','unicycle','skateboard'].includes(v.spec.mode)){this.message='请先进入地面车辆，再使用原地扶正';return false;}
      const forward=new Vector3(0,0,1).applyQuaternion(v.rotation);
      const yaw=Math.hypot(forward.x,forward.z)>.05?Math.atan2(forward.x,forward.z):v.yaw;
      const rotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),yaw),body=vehicleBody(v.spec);
      const support=q.support(v.position,4,.5);
      if(!support||support.normal.y<.65||(q.waterAt(v.position)?.surface??-Infinity)>support.height+.1){this.message='附近没有适合扶正的地面，请落地后重试或返回起点';return false;}
      const width=body.kind==='box'?body.halfExtents[0]:body.radius,length=body.kind==='box'?body.halfExtents[2]:body.radius;
      const offsets=[new Vector3()];
      // 从原点向外逐圈寻找；覆盖整个底盘及边沿余量，不能只检测车身中心。
      for(let radius=.5;radius<=6;radius+=.5)for(let n=0;n<24;n++)offsets.push(new Vector3(Math.cos(n*Math.PI/12)*radius,0,Math.sin(n*Math.PI/12)*radius));
      let safe:Vector3|undefined;
      for(const offset of offsets){
        const candidate=v.position.clone().add(offset),heights:number[]=[];let supported=true;
        for(const x of [-width-.3,0,width+.3])for(const z of [-length-.3,0,length+.3]){
          const point=new Vector3(x,0,z).applyQuaternion(rotation).add(candidate);point.y=support.height+.5;
          const hit=q.support(point,4,0);
          if(!hit||hit.normal.y<.97||(q.waterAt(point)?.surface??-Infinity)>hit.height+.1){supported=false;break;}
          heights.push(hit.height);
        }
        if(!supported||Math.max(...heights)-Math.min(...heights)>.18)continue;
        candidate.y=Math.max(...heights)+.12;
        // 不借扶正穿过墙体，也不穿过中途的低顶。
        const from=v.position.clone().add(new Vector3(0,.8,0)),to=candidate.clone().add(new Vector3(0,.8,0)),delta=to.sub(from),distance=delta.length();
        if(distance>.01&&q.raycast(from,delta.divideScalar(distance),distance))continue;
        const placed=q.safeSpawn(candidate,body,rotation);
        if(!placed||q.bodyOverlap({position:placed,rotation,body},{excludedActorIds:new Set([v.spec.id])}))continue;
        safe=placed;break;
      }
      if(!safe){this.message='附近 6 米内没有稳定且有净空的落点，请使用返回起点';return false;}
      const relocated=Math.hypot(safe.x-v.position.x,safe.z-v.position.z)>.01;
      // 找到稳定支撑并验证净空后才替换；保留驾驶关系、配置和当前测试点。
      q.releaseVehicleRig(v.spec.id);v.position.copy(safe);v.rotation.copy(rotation);v.yaw=yaw;v.pitch=v.roll=0;
      v.velocity.set(0,0,0);v.speed=v.steering=v.throttle=0;v.grounded=false;v.submerged=false;
      resetFamilyRigidState(v);
      this.player.position.copy(v.position);this.player.velocity.set(0,0,0);this.player.yaw=yaw;
      this.transition=0;this.transitionKind='';this.teleportRevision++;this.world.syncActorBodies();this.message=relocated?'车辆已移至附近安全地面并扶正 · 可以继续驾驶':'车辆已原地扶正 · 可以继续驾驶';return true;
    }
}
