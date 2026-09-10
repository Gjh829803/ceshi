import { Euler, Quaternion, Vector3 } from 'three';
import { humanoid, emptyHumanoidInput, type Vec3, type WorldInput, type WorldSnapshot } from '@worldkit/three';
import type { EpisodeSegmentPlan } from './contracts.js';
import type {
  RouteCursor,
  RouteDecision,
} from './route-controller.js';

const {AIRCRAFT}=humanoid;

export const VEHICLE_FAMILIES = [
  'kayak',
  'wheeled',
  'bus',
  'tank',
  'motorcycle',
  'unicycle',
  'slide',
  'sled',
  'ski',
  'hover',
  'boat',
  'sub',
  'glider',
  'plane',
  'space',
  'mount',
  'carriage',
  'dragon',
] as const;
export type VehicleFamily=typeof VEHICLE_FAMILIES[number];
const clamp=(n:number)=>Math.max(-1,Math.min(1,n));
const angle=(n:number)=>Math.atan2(Math.sin(n),Math.cos(n));
/** Steering is body-relative; camera orbit never steers a vehicle. No transforms are written. */
export function vehicleDirectionInput(family:VehicleFamily,position:Vec3,rotation:Vec3,velocity:Vec3,target:Vec3):WorldInput {
  const delta=new Vector3(...target).sub(new Vector3(...position));
  const q=new Quaternion().setFromEuler(new Euler(...rotation));
  const heading=new Vector3(0,0,1).applyQuaternion(q);
  const yaw=Math.atan2(heading.x,heading.z),desiredYaw=Math.atan2(delta.x,delta.z);
  const yawError=angle(desiredYaw-yaw),horizontal=Math.hypot(delta.x,delta.z);
  const input={forward:Math.max(.15,Math.cos(yawError)),steer:clamp(-yawError*1.8),roll:0,lift:0,pitch:0,strafe:0,boost:false,brake:false,slow:false,jump:false};
  if(family==='tank'){
    input.forward=Math.abs(yawError)>1?0:input.forward;
    input.brake=horizontal<Math.hypot(velocity[0],velocity[2])**2/12+.5;
  } else if(family==='space'){
    const local=delta.clone().applyQuaternion(q.clone().invert());
    const localVelocity=new Vector3(...velocity).applyQuaternion(q.clone().invert());
    input.forward=clamp((local.z-localVelocity.z*.8)/4);input.strafe=clamp(-(local.x-localVelocity.x*.8)/4);input.lift=clamp((local.y-localVelocity.y*.8)/4);
    input.steer=0; // Translation axes are independent; preserve the captured attitude.
  } else if(family==='sub'||family==='dragon'){
    input.lift=clamp((delta.y-velocity[1]*.8)/3);input.forward=horizontal<.5?0:input.forward;
  } else if(family==='plane'||family==='glider'){
    const pitch=Math.atan2(delta.y+(family==='glider'?1.2:0),Math.max(5,horizontal));
    input.forward=clamp(-(pitch-(family==='plane'?Math.atan2(velocity[1]!,Math.max(1,Math.hypot(velocity[0]!,velocity[2]!))):0))/(family==='plane'?.27:.62));input.boost=family==='glider'||Math.hypot(...velocity)<32;input.slow=family==='plane'&&Math.hypot(...velocity)>40;
    if(family==='plane'){const speed=Math.hypot(velocity[0]!,velocity[2]!),course=speed>3?Math.atan2(velocity[0]!,velocity[2]!):yaw;
      const acceleration=2*speed*speed*Math.sin(desiredYaw-course)/Math.max(15,Math.min(horizontal,speed*1.3));input.steer=clamp(-acceleration/Math.max(speed,16)/AIRCRAFT.turnRate);}
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
  private index=0;private direction=1;private finished=false;private anchor:Vec3|undefined;private lastProgress=0;
  private readonly route:Vec3[];
  private waypointHold: { waypointIndex: number; radiusMeters: number } | undefined;
  get cursor(): RouteCursor { return { waypointIndex: this.index - (this.segment.endBehavior === 'reverse' ? 1 : 0), direction: this.direction, finished: this.finished }; }
  seekCursor(cursor: RouteCursor) {
    this.index = cursor.waypointIndex + (this.segment.endBehavior === 'reverse' ? 1 : 0);
    this.direction = cursor.direction; this.finished = cursor.finished; this.anchor = undefined;
  }
  holdWaypoint(trigger: { waypointIndex: number; radiusMeters: number } | undefined) { this.waypointHold = trigger; }
  completeHeldWaypoint(index: number) {
    if (Math.max(0, this.cursor.waypointIndex) !== index) throw new Error('EPISODE_ACTION_ROUTE_INDEX_CHANGED');
    this.anchor = undefined; this.advanceWaypoint();
  }
  private advanceWaypoint() {
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
    if(this.finished)return {...base,mode:'finished',input:{humanoid:{forward:0,steer:0,roll:0,lift:0,pitch:0,strafe:0,boost:false,brake:true,slow:true,jump:false}}};
    const held = this.waypointHold?.waypointIndex === base.waypointIndex ? this.waypointHold : undefined;
    if (held && distance <= held.radiusMeters) {
      this.anchor = position; this.lastProgress = time;
      return { ...base, mode: 'action', input: { humanoid: { ...emptyHumanoidInput(), brake: true, slow: true } } };
    }
    if(!this.anchor||Math.hypot(...position.map((v,i)=>v-this.anchor![i]!))>.25){this.anchor=position;this.lastProgress=time;}
    if(time-this.lastProgress>5)return {...base,mode:'failed',input:{},diagnostic:{code:'EPISODE_PLAYER_ROUTE_BLOCKED',message:'Real vehicle input made no progress for five seconds.',collisionEntityIds:actor.motion?.collisionEntityIds??[]}};
    const airborne=['space','sub','plane','glider','dragon'].includes(vehicle.mode);
    const tolerance=held?.radiusMeters ?? (airborne?2:1);
    // All axes remain checked: a bridge below a waypoint is never counted as arrival.
    if(distance<=tolerance)this.advanceWaypoint();
    return {...base,mode:'travel',input:vehicleDirectionInput(vehicle.mode,position,actor.rotationLocalRadiansXYZ,velocity,this.route[this.index]!)};
  }
}
