import { Euler, Quaternion, Vector3 } from 'three';
import { humanoid, emptyHumanoidInput, RoadVehicleRouteController, roadVehicleRouteInput, roadVehicleBrakeInput, type Vec3, type WorldInput, type WorldSnapshot, type AircraftSubtype } from '@worldkit/three';
import type { EpisodeSegmentPlan } from '../contracts.js';
import type {
  RouteCursor,
  RouteDecision,
} from './route-controller.js';

const {AIRCRAFT,SOARING}=humanoid;

export const VEHICLE_FAMILIES = [
  'paddled_boat',
  'wheeled',
  'bus',
  'tank',
  'motorcycle',
  'unicycle',
  'skateboard',
  'sled',
  'ski',
  'hover',
  'boat',
  'submarine',
  'glider',
  'plane',
  'spacecraft',
  'mount',
  'carriage',
  'dragon',
] as const;
export type VehicleFamily=typeof VEHICLE_FAMILIES[number];
const clamp=(n:number,a=-1,b=1)=>Math.max(a,Math.min(b,n));
const angle=(n:number)=>Math.atan2(Math.sin(n),Math.cos(n));
/** Steering is body-relative; camera orbit never steers a vehicle. No transforms are written. */
export function vehicleDirectionInput(family:VehicleFamily,position:Vec3,rotation:Vec3,velocity:Vec3,target:Vec3,_aircraft?:{subtype?:AircraftSubtype|undefined;throttle:number}):WorldInput {
  if(family==='wheeled'||family==='motorcycle')return roadVehicleRouteInput({positionWorldMetersXYZ:position,rotationWorldRadiansXYZ:rotation,velocityWorldMetersPerSecondXYZ:velocity},{positionWorldMetersXYZ:target,maximumSpeedMetersPerSecond:30,stopAtTarget:false});
  const delta=new Vector3(...target).sub(new Vector3(...position));
  const q=new Quaternion().setFromEuler(new Euler(...rotation));
  const heading=new Vector3(0,0,1).applyQuaternion(q);
  const yaw=Math.atan2(heading.x,heading.z),desiredYaw=Math.atan2(delta.x,delta.z);
  const yawError=angle(desiredYaw-yaw),horizontal=Math.hypot(delta.x,delta.z);
  const input={forward:Math.max(.15,Math.cos(yawError)),steer:clamp(-yawError*1.8),roll:0,lift:0,pitch:0,strafe:0,boost:false,brake:false,slow:false,jump:false};
  if(family==='plane'&&_aircraft?.subtype==='balloon'){
    input.forward=0;input.steer=0;input.lift=clamp((delta.y-velocity[1]*2)/3);
  } else if(family==='plane'&&_aircraft?.subtype&&['helicopter','multirotor','tiltrotor'].includes(_aircraft.subtype)){
    const desiredVelocity=new Vector3(delta.x,0,delta.z).multiplyScalar(.45).clampLength(0,6);
    const acceleration=desiredVelocity.sub(new Vector3(velocity[0],0,velocity[2])).multiplyScalar(.65).addScaledVector(new Vector3(velocity[0],0,velocity[2]),.12).applyQuaternion(q.clone().invert());
    input.steer=horizontal>8?input.steer*.5:0;
    input.forward=clamp(acceleration.z/(9.81*.32));
    input.roll=clamp((-acceleration.x/9.81-input.steer*Math.max(0,Math.min(1,Math.hypot(velocity[0],velocity[2])/35))*.3)/.38);
    const throttleCorrection=clamp((.58-(_aircraft.throttle??.5))*.8,-.15,.15);
    input.lift=clamp((delta.y*.6-velocity[1]*.15)/3+throttleCorrection);
  } else if(family==='tank'){
    input.forward=Math.abs(yawError)>1?0:input.forward;
    input.brake=horizontal<Math.hypot(velocity[0],velocity[2])**2/12+.5;
  } else if(family==='spacecraft'){
    const local=delta.clone().applyQuaternion(q.clone().invert());
    const localVelocity=new Vector3(...velocity).applyQuaternion(q.clone().invert());
    input.forward=clamp((local.z-localVelocity.z*.8)/4);input.strafe=clamp(-(local.x-localVelocity.x*.8)/4);input.lift=clamp((local.y-localVelocity.y*.8)/4);
    input.steer=0; // Translation axes are independent; preserve the captured attitude.
  } else if(family==='submarine'||family==='dragon'){
    input.lift=clamp((delta.y-velocity[1]*.8)/3);input.forward=horizontal<.5?0:input.forward;
  } else if(family==='plane'||family==='glider'){
    const soaring=family==='plane'&&_aircraft?.subtype==='glider',glider=family==='glider'||soaring;
    const pitch=Math.atan2(delta.y+(family==='glider'?1.2:0),Math.max(5,horizontal));
    const speed=Math.hypot(...velocity),flightPath=family==='plane'?Math.atan2(velocity[1]!,Math.max(1,speed)):0;
    input.pitch=clamp(-(pitch-flightPath)/(soaring?.24:family==='plane'?.27:.62));
    input.forward=glider?clamp((SOARING.targetSpeed.glider-speed)/8):clamp((56-speed)/12);
    if(family==='plane'){const speed=Math.hypot(velocity[0]!,velocity[2]!),course=speed>3?Math.atan2(velocity[0]!,velocity[2]!):yaw;
      const acceleration=2*speed*speed*Math.sin(desiredYaw-course)/Math.max(15,Math.min(horizontal,speed*1.3));
      // Soaring steers a coordinated bank; powered aircraft exposes assisted yaw rate.
      input.steer=soaring?clamp(-Math.atan(acceleration/9.81)/.55):clamp(-acceleration/Math.max(speed,16)/AIRCRAFT.turnRate);}
  } else if(family==='sled'||family==='ski'){
    // Foot propulsion is only useful near walking speed; brake before a tight
    // bend or the stopping distance, while leaving a coasting route unpowered.
    const speed=Math.hypot(velocity[0],velocity[2]);
    input.forward=speed<2.8?1:0;
    input.brake=speed>2&&(horizontal<speed*speed/10+1||Math.abs(yawError)>1);
  } else if(family==='hover')input.roll=0;
  return {humanoid:input};
}
export class VehicleRouteController {
  private roadController:RoadVehicleRouteController|undefined;
  private roadControllerKey='';
  private index=0;private direction=1;private finished=false;private anchor:Vec3|undefined;private lastProgress=0;
  private readonly route:Vec3[];
  private waypointHold: { waypointIndex: number; radiusMeters: number } | undefined;
  get cursor(): RouteCursor { return { waypointIndex: this.index - (this.segment.endBehavior === 'reverse' ? 1 : 0), direction: this.direction, finished: this.finished }; }
  seekCursor(cursor: RouteCursor) {
    this.roadController=undefined;
    this.index = cursor.waypointIndex + (this.segment.endBehavior === 'reverse' ? 1 : 0);
    this.direction = cursor.direction; this.finished = cursor.finished; this.anchor = undefined;
  }
  holdWaypoint(trigger: { waypointIndex: number; radiusMeters: number } | undefined) { this.waypointHold = trigger; }
  completeHeldWaypoint(index: number) {
    if (Math.max(0, this.cursor.waypointIndex) !== index) throw new Error('EPISODE_ACTION_ROUTE_INDEX_CHANGED');
    this.anchor = undefined; this.advanceWaypoint();
  }
  private advanceWaypoint() {
    this.roadController=undefined;
    const next = this.index + this.direction;
    if (next >= 0 && next < this.route.length) this.index = next;
    else if (this.segment.endBehavior === 'loop') this.index = 0;
    else if (this.segment.endBehavior === 'reverse') { this.direction *= -1; this.index += this.direction; }
    else this.finished = true;
  }
  constructor(private readonly segment:EpisodeSegmentPlan){this.route=segment.waypoints.map(w=>w.positionWorldMetersXYZ);if(segment.endBehavior==='reverse'){this.route.unshift(segment.start.positionWorldMetersXYZ);this.index=1;}}
  step(snapshot:WorldSnapshot,time:number):RouteDecision {
    const mounted=snapshot.humanoid?.mountedInstanceId;
    const vehicle=snapshot.humanoid?.vehicles.find(v=>v.instanceId===mounted);
    const actor=snapshot.entities.find(e=>e.id===mounted);
    if(!vehicle||!actor||!VEHICLE_FAMILIES.includes(vehicle.mode))throw new Error('EPISODE_PLAYER_VEHICLE_UNAVAILABLE');
    const position=actor.positionWorldMetersXYZ,target=this.route[this.index]!,velocity=actor.motion?.velocityWorldMetersPerSecondXYZ??[0,0,0];
    const distance=Math.hypot(...position.map((v,i)=>v-target[i]!));
    const base={waypointIndex:Math.max(0,this.cursor.waypointIndex),positionWorldMetersXYZ:position,targetPositionWorldMetersXYZ:target,distanceToTargetMeters:distance};
    const rotary=vehicle.mode==='plane'&&vehicle.aircraftSubtype&&['helicopter','multirotor','tiltrotor'].includes(vehicle.aircraftSubtype);
    const hover=rotary&&!vehicle.grounded?vehicleDirectionInput(vehicle.mode,position,actor.rotationLocalRadiansXYZ,velocity,target,{subtype:vehicle.aircraftSubtype,throttle:vehicle.throttle}):undefined;
    if(this.finished)return {...base,mode:'finished',input:hover??{humanoid:{forward:0,steer:0,roll:0,lift:0,pitch:0,strafe:0,boost:false,brake:true,slow:true,jump:false}}};
    const held = this.waypointHold?.waypointIndex === base.waypointIndex ? this.waypointHold : undefined;
    if(vehicle.mode==='wheeled'||vehicle.mode==='motorcycle'){
      if(!actor.motion)return {...base,mode:'failed',input:roadVehicleBrakeInput(),diagnostic:{code:'ROAD_ROUTE_MOTION_UNAVAILABLE',message:'Road route requires measured vehicle velocity; missing telemetry is not a stopped vehicle.',collisionEntityIds:[]}};
      const stopping=!!held||(this.index===this.route.length-1&&this.segment.endBehavior==='stop');
      const key=`${mounted}:${actor.generation}:${this.index}:${held?.radiusMeters??1}:${stopping}`;
      if(!this.roadController||this.roadControllerKey!==key){
        this.roadController=new RoadVehicleRouteController({positionWorldMetersXYZ:target,arrivalToleranceMeters:held?.radiusMeters??1,maximumSpeedMetersPerSecond:30,stopAtTarget:stopping});this.roadControllerKey=key;
      }
      const decision=this.roadController.step({positionWorldMetersXYZ:position,rotationWorldRadiansXYZ:actor.rotationLocalRadiansXYZ,velocityWorldMetersPerSecondXYZ:velocity},time);
      if(decision.status==='failed')return {...base,mode:'failed',input:decision.input,diagnostic:{code:decision.errorCode!,message:'Road vehicle route failed; inspect the recorded pose, speed and route.',collisionEntityIds:actor.motion?.collisionEntityIds??[]}};
      if(decision.status==='arrived'){
        if(held)return {...base,mode:'action',input:decision.input};
        this.advanceWaypoint();
        if(this.finished)return {...base,mode:'finished',input:decision.input};
        return {...base,mode:'travel',input:vehicleDirectionInput(vehicle.mode,position,actor.rotationLocalRadiansXYZ,velocity,this.route[this.index]!)};
      }
      return {...base,mode:'travel',input:decision.input};
    }
    if (held && distance <= held.radiusMeters) {
      this.anchor = position; this.lastProgress = time;
      return { ...base, mode: 'action', input: hover??{ humanoid: { ...emptyHumanoidInput(), brake: true, slow: true } } };
    }
    if(!this.anchor||Math.hypot(...position.map((v,i)=>v-this.anchor![i]!))>.25){this.anchor=position;this.lastProgress=time;}
    if(time-this.lastProgress>5)return {...base,mode:'failed',input:{},diagnostic:{code:'EPISODE_PLAYER_ROUTE_BLOCKED',message:'Real vehicle input made no progress for five seconds.',collisionEntityIds:actor.motion?.collisionEntityIds??[]}};
    const airborne=['spacecraft','submarine','plane','glider','dragon'].includes(vehicle.mode);
    const tolerance=held?.radiusMeters ?? (airborne?2:1);
    // All axes remain checked: a bridge below a waypoint is never counted as arrival.
    if(distance<=tolerance)this.advanceWaypoint();
    return {...base,mode:'travel',input:vehicleDirectionInput(vehicle.mode,position,actor.rotationLocalRadiansXYZ,velocity,this.route[this.index]!,{subtype:vehicle.aircraftSubtype,throttle:vehicle.throttle})};
  }
}
