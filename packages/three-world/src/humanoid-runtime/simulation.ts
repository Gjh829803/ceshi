import {hasUnoccupiedBody,releaseUnoccupiedBody,stepUnoccupiedBody} from './motion-families/shared/unoccupied-body';
import {familyUnoccupiedPhysics} from './motion-families/registry';
import { HumanoidActor,type ActorInput } from './humanoid/actor';
import { resolveConfiguredFlyingCreatureFeel } from './motion-families/flying-creature/state';
import { copyAtvState } from './motion-families/ground-vehicle/atv';
import { copyUnicycleState,finishUnicycleStep } from './motion-families/ground-vehicle/unicycle';
import { createFamilyPhysics,motionFamilyForMode,resolveFamilyPhysics,resolveMotionFamilyMovement,stepMotionFamily } from './motion-families/registry';
import type { MotionFamilyState } from './motion-families/state';
import { copyJetSkiState,finishJetSkiStep } from './motion-families/surface-vessel/jetski';
import { copySubmersibleState } from './motion-families/underwater/submersible';






import { Quaternion,Vector3 } from 'three';
import {
CONTROL_RANGES,
DEFAULT_CHARACTER_CONTROL_BASE,
defaultMovementSettings,
type MovementSettings,
} from '../config/control';
import { creatureBodies,resetCreatureState } from './creatures/controller';
import { HUMANOID_BODY } from './humanoid/controller';



import { type VehicleSpec } from './config';
import { EnvironmentQueries,vehicleBody } from './environment/queries';
import type { MapSpawn } from './environment/types';
export const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export const damp=(a:number,b:number,k:number,dt:number)=>a+(b-a)*(1-Math.exp(-k*dt));
export const angleDelta=(a:number,b:number)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
export interface HumanoidActionInput {summonDragon?:boolean;toggleCrouch?:boolean;roll?:boolean;slide?:boolean;interact?:boolean;putDown?:boolean;prone?:boolean;climb?:boolean;releaseClimb?:boolean;toggleSwimStyle?:boolean;cancel?:boolean}
export interface Input { primary?:boolean;secondary?:boolean; forward:number; steer:number; lift:number; roll:number; pitch:number; strafe:number; boost:boolean; brake:boolean; jump:boolean; slow:boolean;actions?:HumanoidActionInput }
export const emptyInput=():Input=>({forward:0,steer:0,lift:0,roll:0,pitch:0,strafe:0,boost:false,brake:false,jump:false,slow:false});
export interface VehicleState {motion:MotionFamilyState;spec:VehicleSpec & MovementSettings;position:Vector3;velocity:Vector3;rotation:Quaternion;yaw:number;pitch:number;roll:number;steering:number;throttle:number;grounded:boolean;launched:boolean;speed:number;submerged:boolean}

export function resolveVehicleSpec(spec:VehicleSpec):VehicleSpec & MovementSettings {
 if(spec.aircraftSubtype!==undefined&&spec.mode!=='plane')throw Error('VEHICLE_AIRCRAFT_SUBTYPE_INVALID');
  spec=resolveFamilyPhysics(spec);
  const authored=Object.fromEntries(Object.keys(CONTROL_RANGES).filter(key=>Object.hasOwn(spec,key)).map(key=>[key,spec[key as keyof MovementSettings]]));
  const family=motionFamilyForMode(spec.mode);
  const control=resolveMotionFamilyMovement(family,`${family}.${spec.mode}`,authored,defaultMovementSettings(spec.mode,spec));
  const resolved={...structuredClone(spec),...control};
  if(resolved.flyingCreature)resolveConfiguredFlyingCreatureFeel(resolved);
  if(resolved.flyingCreatureCollision){
    const probes=resolved.flyingCreatureCollision;
    if(!resolved.flyingCreature||!Array.isArray(probes)||probes.length<1||probes.length>128||new Set(probes.map(p=>p.id)).size!==probes.length
      ||probes.some(p=>!p.id||p.center.length!==3||!p.center.every(Number.isFinite)||!Number.isFinite(p.radius)||p.radius<=0))
      throw new Error('FLYING_CREATURE_COLLISION_INVALID');
  }
  if(resolved.flyingCreatureGround){
    const g=resolved.flyingCreatureGround;
    const finiteTuple=(v:readonly number[],length:number)=>Array.isArray(v)&&v.length===length&&v.every(Number.isFinite);
    if(!resolved.flyingCreature||!Number.isFinite(g.rootHeight)||g.rootHeight<0||!finiteTuple(g.seat,3)||!finiteTuple(g.support,4)
      ||g.support[0]>=g.support[1]||g.support[2]>=g.support[3]||![g.landingSeconds,g.takeoffSeconds].every(n=>Number.isFinite(n)&&n>0)
      ||!Array.isArray(g.probes)||g.probes.length!==(resolved.flyingCreatureCollision?.length??12)
      ||new Set(g.probes.map(p=>p.id)).size!==g.probes.length||g.probes.some(p=>!p.id||!finiteTuple(p.center,3)||!Number.isFinite(p.radius)||p.radius<=0))
      throw new Error('FLYING_CREATURE_GROUND_INVALID');
  }
  return resolved;
}
export function createVehicle(spec:VehicleSpec):VehicleState {
 const resolved=resolveVehicleSpec(spec);
 const state:VehicleState={motion:createFamilyPhysics(resolved),spec:resolved,position:new Vector3(...spec.spawn),velocity:new Vector3(),rotation:new Quaternion().setFromAxisAngle(new Vector3(0,1,0),spec.yaw),yaw:spec.yaw,pitch:0,roll:0,steering:0,throttle:0,grounded:true,launched:false,speed:0,submerged:false};
 if(state.motion.submersible||state.motion.jetski)state.grounded=false;resetCreatureState(state);return state;
}
function actorFootprints(v:VehicleState){return creatureBodies(v).map((part,index)=>{
  const center=new Vector3(...part.body.offset).applyQuaternion(part.rotation).add(part.position);
  let halfHeight=part.body.kind==='capsule'?part.body.height/2:0;
  if(part.body.kind==='box')for(let axis=0;axis<3;axis++)halfHeight+=Math.abs(new Vector3().setComponent(axis,part.body.halfExtents[axis]!).applyQuaternion(part.rotation).y);
  return {position:part.position,radius:index===0?v.spec.radius:1.9,minY:center.y-halfHeight,maxY:center.y+halfHeight};
});}
function actorsTouch(a:VehicleState,b:VehicleState){return actorFootprints(a).some(p=>actorFootprints(b).some(o=>o.maxY>p.minY+.01&&p.maxY>o.minY+.01&&Math.hypot(o.position.x-p.position.x,o.position.z-p.position.z)<o.radius+p.radius));}
export function actorBlocksPlayer(v:VehicleState,p:Vector3,margin:number){return actorFootprints(v).some(part=>p.y+1.75>part.minY&&p.y<part.maxY&&Math.hypot(part.position.x-p.x,part.position.z-p.z)<part.radius+margin);}
export function stepVehicle(v:VehicleState,i:Input,dt:number,time:number,environment:EnvironmentQueries){stepMotionFamily(v,i,dt,time,environment);}
export interface PlayerState { position:Vector3; velocity:Vector3; yaw:number; grounded:boolean; swimming:boolean; coyote:number; jumpBuffer:number; animation:string; landTimer:number }
export class Simulation {
  readonly actors=new Map<string,HumanoidActor>();
  readonly preparedVehicleSpawns=new Map<string,MapSpawn>();
  /** Explicit relocation occurrences, distinct from entity identity and continuous movement. */
  private readonly vehicleRelocations=new Map<string,number>();
  noteVehicleRelocation(id:string):void{this.vehicleRelocations.set(id,this.vehicleRelocationOccurrence(id)+1);}
  vehicleRelocationOccurrence(id:string):number{return this.vehicleRelocations.get(id)??0;}
  readonly vehicles:VehicleState[];
  characterControl=defaultMovementSettings('character',DEFAULT_CHARACTER_CONTROL_BASE);
  time=0;
  controlledActorId:string|undefined;
  get controlledActor():HumanoidActor{if(this.controlledActorId===undefined)throw new Error('HUMANOID_INPUT_ACTOR_REQUIRED');return this.actor(this.controlledActorId);}
  actor(id:string):HumanoidActor{const actor=this.actors.get(id);if(!actor)throw new Error(`HUMANOID_ACTOR_UNKNOWN: ${id}`);return actor;}
  constructor(readonly environment:EnvironmentQueries,specs:readonly VehicleSpec[]=[],initialActor?:{id:string;position?:Vector3;yaw?:number}){
    this.controlledActorId=initialActor?.id;this.vehicles=specs.map(createVehicle);const q=environment;
    let parked=0;
    for(const v of this.vehicles){Object.assign(v,createVehicle(v.spec));
      const spawn=q.map.spawns.find(s=>s.vehicleId===v.spec.id);
      if(spawn){v.position.set(...spawn.position);v.yaw=spawn.yaw;v.rotation.setFromAxisAngle(new Vector3(0,1,0),spawn.yaw);this.preparedVehicleSpawns.set(v.spec.id,spawn);}
      else if(this.available(v)){v.position.set(q.map.playerSpawn[0]-30+(parked%6)*12,q.map.playerSpawn[1],q.map.playerSpawn[2]-45-Math.floor(parked/6)*12);parked++;}
      const safe=q.safeSpawn(v.position,vehicleBody(v.spec),v.rotation);if(safe)v.position.copy(safe);
      resetCreatureState(v);
      if(safe&&this.available(v))this.preparedVehicleSpawns.set(v.spec.id,{id:`parked-${v.spec.id}`,name:v.spec.name,vehicleId:v.spec.id,regionId:spawn?.regionId??q.map.regions.find(r=>r.modes.includes(v.spec.mode))!.id,position:[safe.x,safe.y,safe.z],yaw:v.yaw});
    }
    const position=q.safeSpawn(new Vector3(...q.map.playerSpawn),HUMANOID_BODY)??new Vector3(...q.map.playerSpawn);
    if(initialActor)this.addActor(initialActor.id,initialActor.position??position,initialActor.yaw??0,true);this.syncActorBodies();
  }
  checkActorSpawn(position:Vector3):Vector3{const safe=this.environment.safeSpawn(position,HUMANOID_BODY);if(!safe||this.environment.bodyOverlap({position:safe,rotation:new Quaternion(),body:HUMANOID_BODY},undefined,.015))throw new Error('HUMANOID_ACTOR_SPAWN_BLOCKED');return safe;}
  addActor(id:string,position:Vector3,yaw=0,prevalidated=false):HumanoidActor{
    if(!id.trim()||this.actors.has(id))throw new Error('HUMANOID_ACTOR_ID_CONFLICT');
    const actor=new HumanoidActor(id,this,prevalidated?position:this.checkActorSpawn(position),yaw);this.actors.set(id,actor);return actor;
  }
  removeActor(id:string):void{const actor=this.actors.get(id);if(actor){this.actors.delete(id);actor.dispose();}}
  dispose():void{for(const id of this.actors.keys())this.removeActor(id);for(const v of this.vehicles)this.environment.releaseVehicleRig(v.spec.id);}
  available(v:VehicleState){return this.environment.map.regions.some(r=>r.modes.includes(v.spec.mode));}
  syncActorBodies(){const vehicles=this.vehicles.filter(v=>this.available(v)&&!v.motion.aircraft?.wearable?.groundLocomotion);this.environment.retainVehicleRigs(new Set(vehicles.filter(v=>v.motion.wheelPhysics||v.motion.body||v.motion.aircraft||hasUnoccupiedBody(v)).map(v=>v.spec.id)));this.environment.syncActorBodies(vehicles.flatMap(v=>creatureBodies(v).map((part,n)=>({id:`${v.spec.id}:${n}`,actorId:v.spec.id,physical:!!(v.motion.wheelPhysics||v.motion.body||v.motion.aircraft||hasUnoccupiedBody(v)),...part}))));}
  summonDragon(id?:string,actorId:string=this.controlledActor.id):boolean{return this.actor(actorId).summonDragon(id);}
  reset():void{
    const selected=this.controlledActorId===undefined?undefined:this.actors.get(this.controlledActorId),index=selected?.vehicleIndex??-1;
    for(const actor of this.actors.values()){const p=actor.controller.checkpoint;actor.resetAt(new Vector3(p.x,p.y,p.z),p.yaw+Math.PI);}
    this.environment.resetContents();
    if(selected&&index>=0)selected.visit(index);else if(selected)selected.message='人物与交互物已复位';
  }

  step(dt:number,inputs:ReadonlyMap<string,ActorInput>=new Map()):void{
    const carry=this.environment.stepLifts(dt,[...this.actors.values()].filter(actor=>!actor.vehicle||actor.wingsuitGroundControl).map(actor=>({id:actor.id,feet:actor.controller.position,grounded:actor.controller.grounded})));
    for(const [id,delta] of carry)this.actor(id).controller.carryPlatform(delta);
    const incidents=new Map([...this.actors].map(([id,actor])=>[id,actor.recoveryTrigger()]));
    this.environment.interactions.syncPhysicalState();this.time+=dt;for(const actor of this.actors.values()){if(inputs.get(actor.id)?.input.actions?.summonDragon)actor.summonDragon();actor.beginStep(dt);}this.syncActorBodies();
    const drivers=new Map<VehicleState,HumanoidActor>();for(const actor of this.actors.values())if(actor.vehicle)drivers.set(actor.vehicle,actor);
    for(const v of this.vehicles){const driver=drivers.get(v);this.stepVehicle(v,driver,inputs.get(driver?.id??'')?.input??emptyInput(),dt);}
    for(const [id,actor] of this.actors){const controls=inputs.get(id);actor.step(controls?.input??emptyInput(),controls?.yaw??0);}
    this.syncActorBodies();this.environment.stepPhysics(dt);this.syncActorBodies();for(const actor of this.actors.values()){actor.finishStep();actor.recoverBoundary(incidents.get(actor.id)??actor.recoveryTrigger());}
  }
  private stepVehicle(v:VehicleState,driver:HumanoidActor|undefined,i:Input,dt:number):void{
    if(driver?.wingsuitGroundControl)return;
    const vehicle=driver?.vehicle;
    const unoccupied=familyUnoccupiedPhysics(v.spec);
    if(!driver&&unoccupied&&this.available(v)){stepUnoccupiedBody(v,unoccupied,this.environment);return;}
    // 仅已选择空载物理的小类在登乘时交还控制权；其他载具不经过此分支。
    releaseUnoccupiedBody(v,this.environment);
    if(v.motion.kayak)v.motion.kayak.riderMounted=v===vehicle&&driver?.transition===0;
    if(v.motion.family==='space')v.motion.body.riderMounted=v===vehicle&&driver?.transition===0;
    const vehicleBefore=vehicle?.position.clone();
    const before=vehicle?{unicycle:copyUnicycleState(vehicle.motion.unicycle),submersible:copySubmersibleState(vehicle.motion.submersible),jetski:copyJetSkiState(vehicle.motion.jetski),atv:copyAtvState(vehicle.motion.atv),rotation:vehicle.rotation.clone(),yaw:vehicle.yaw,pitch:vehicle.pitch,roll:vehicle.roll,creature:vehicle.motion.creature?{...vehicle.motion.creature,leadPosition:vehicle.motion.creature.leadPosition?.clone()}:undefined}:undefined;

      // 只有驾驶中的载具接收输入；四轮车停车后仍计算重力、悬架和驻车制动。
      if (v === vehicle && driver?.transition === 0)
        stepVehicle(v, i, dt, this.time, this.environment);
      else if ((v.motion.wheelPhysics||v.motion.body||v.motion.aircraft||v.motion.flyingCreature)&&this.available(v))
        stepVehicle(v,{...emptyInput(),brake:!v.motion.flyingCreature,slow:!!v.motion.flyingCreature},dt,this.time,this.environment);
      else if (
        (v !== vehicle || v.spec.mode === 'paddled_boat' || !!v.motion.jetski || !!v.motion.submersible) &&
        (!!v.motion.submersible || !!v.motion.jetski || v.spec.mode === "paddled_boat" || v.spec.mode === "mount" || v.spec.mode === "sled" || v.spec.mode === "ski") &&
        this.available(v) &&
        (!!v.motion.submersible || !!v.motion.jetski || v.velocity.lengthSq() > 1e-8 ||
          !v.grounded ||
          (this.environment &&
            !this.environment.standingSupport(
              v.position,
              0.08,
              Math.PI / 2 - 0.01,
            )))
      ) {
        const previous = {
          ...(v.motion.submersible?{submersible:copySubmersibleState(v.motion.submersible)}:{}),
          ...(v.motion.jetski?{jetski:copyJetSkiState(v.motion.jetski)}:{}),
          position: v.position.clone(),
          rotation: v.rotation.clone(),
          yaw: v.yaw,
          pitch: v.pitch,
          roll: v.roll,
          creature: v.motion.creature
            ? { ...v.motion.creature, leadPosition: v.motion.creature.leadPosition?.clone() }
            : undefined,
        };
        stepVehicle(v, emptyInput(), dt, this.time, this.environment);
        if (
          this.vehicles.some(
            (o) => o !== v && this.available(o) && actorsTouch(v, o),
          )
        ) {
          const {creature,submersible,jetski,...pose}=previous;Object.assign(v,pose);if(v.motion.creature)v.motion.creature=creature;if(v.motion.submersible&&submersible)v.motion.submersible=submersible;if(v.motion.jetski&&jetski)v.motion.jetski=jetski;
          if(v.motion.jetski)finishJetSkiStep(v,previous.position,dt,this.time);
          v.velocity.set(0, 0, 0);
          v.speed = 0;
        }
      }
    if(vehicle&&!vehicle.motion.flyingCreature&&!vehicle.motion.wheelPhysics&&!vehicle.motion.body&&!vehicle.motion.aircraft&&vehicleBefore){if(this.vehicles.some(o=>o!==vehicle&&this.available(o)&&actorsTouch(vehicle!,o))){vehicle.position.copy(vehicleBefore);vehicle.rotation.copy(before!.rotation);vehicle.yaw=before!.yaw;vehicle.pitch=before!.pitch;vehicle.roll=before!.roll;vehicle.motion.creature=before!.creature;if(vehicle.motion.atv&&before!.atv){vehicle.motion.atv.wheelAngles=[...before!.atv.wheelAngles];vehicle.motion.atv.suspension=[...before!.atv.suspension];}if(vehicle.motion.submersible&&before!.submersible)vehicle.motion.submersible=before!.submersible;if(vehicle.motion.jetski&&before!.jetski){vehicle.motion.jetski=before!.jetski;finishJetSkiStep(vehicle,vehicleBefore,dt,this.time);}vehicle.velocity.set(0,0,0);vehicle.speed=0;if(vehicle.motion.unicycle&&before!.unicycle){vehicle.motion.unicycle=before!.unicycle;finishUnicycleStep(vehicle,vehicleBefore,i,dt,this.environment);}}}
  }
}
