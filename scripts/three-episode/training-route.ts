import { Euler, Quaternion, Vector3 } from 'three';
import { emptyTrainingInput, type Vec3, type WorldInput, type WorldSnapshot } from '@worldkit/three';
import type { EpisodeSegmentPlan } from './contracts.js';
import type { RouteCursor, RouteDecision } from './route-controller.js';
export const TRAINING_FAMILIES=['wheeled','bike','slide','hover','boat','sub','glider','plane','space','mount','carriage','dragon'] as const;
export type TrainingFamily=typeof TRAINING_FAMILIES[number];
const clamp=(n:number)=>Math.max(-1,Math.min(1,n));
const angle=(n:number)=>Math.atan2(Math.sin(n),Math.cos(n));
/** Steering is body-relative; camera orbit never steers a vehicle. No transforms are written. */
export function trainingDirectionInput(family:TrainingFamily,position:Vec3,rotation:Vec3,velocity:Vec3,target:Vec3):WorldInput {
  const delta=new Vector3(...target).sub(new Vector3(...position));
  const q=new Quaternion().setFromEuler(new Euler(...rotation));
  const heading=new Vector3(0,0,1).applyQuaternion(q);
  const yaw=Math.atan2(heading.x,heading.z),desiredYaw=Math.atan2(delta.x,delta.z);
  const yawError=angle(desiredYaw-yaw),horizontal=Math.hypot(delta.x,delta.z);
  const input={forward:Math.max(.15,Math.cos(yawError)),steer:clamp(-yawError*1.8),roll:0,lift:0,pitch:0,strafe:0,boost:false,brake:false,slow:false,jump:false};
  if(family==='space'){
    const local=delta.clone().applyQuaternion(q.clone().invert());
    const localVelocity=new Vector3(...velocity).applyQuaternion(q.clone().invert());
    input.forward=clamp((local.z-localVelocity.z*.8)/4);input.strafe=clamp(-(local.x-localVelocity.x*.8)/4);input.lift=clamp((local.y-localVelocity.y*.8)/4);
    input.steer=0; // Translation axes are independent; preserve the captured attitude.
  } else if(family==='sub'||family==='dragon'){
    input.lift=clamp((delta.y-velocity[1]*.8)/3);input.forward=horizontal<.5?0:input.forward;
  } else if(family==='plane'||family==='glider'){
    const pitch=Math.atan2(delta.y+(family==='glider'?1.2:0),Math.max(5,horizontal));
    input.forward=clamp(-pitch/.62);input.boost=family==='glider'||Math.hypot(...velocity)<26;input.slow=family==='plane'&&Math.hypot(...velocity)>36;
  } else if(family==='hover')input.roll=0;
  return {training:input};
}
export class TrainingRouteController {
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
    const mounted=snapshot.training?.mountedInstanceId;
    const vehicle=snapshot.training?.vehicles.find(v=>v.instanceId===mounted);
    const actor=snapshot.entities.find(e=>e.id===mounted);
    if(!vehicle||!actor||!TRAINING_FAMILIES.includes(vehicle.mode))throw new Error('EPISODE_TRAINING_VEHICLE_UNAVAILABLE');
    const position=actor.positionWorldMetersXYZ,target=this.route[this.index]!,velocity=actor.motion?.velocityWorldMetersPerSecondXYZ??[0,0,0];
    const distance=Math.hypot(...position.map((v,i)=>v-target[i]!));
    const base={waypointIndex:Math.max(0,this.cursor.waypointIndex),positionWorldMetersXYZ:position,targetPositionWorldMetersXYZ:target,distanceToTargetMeters:distance};
    if(this.finished)return {...base,mode:'finished',input:{training:{forward:0,steer:0,roll:0,lift:0,pitch:0,strafe:0,boost:false,brake:true,slow:true,jump:false}}};
    const held = this.waypointHold?.waypointIndex === base.waypointIndex ? this.waypointHold : undefined;
    if (held && distance <= held.radiusMeters) {
      this.anchor = position; this.lastProgress = time;
      return { ...base, mode: 'action', input: { training: { ...emptyTrainingInput(), brake: true, slow: true } } };
    }
    if(!this.anchor||Math.hypot(...position.map((v,i)=>v-this.anchor![i]!))>.25){this.anchor=position;this.lastProgress=time;}
    if(time-this.lastProgress>5)return {...base,mode:'failed',input:{},diagnostic:{code:'EPISODE_TRAINING_ROUTE_BLOCKED',message:'Real vehicle input made no progress for five seconds.',collisionEntityIds:actor.motion?.collisionEntityIds??[]}};
    const airborne=['space','sub','plane','glider','dragon'].includes(vehicle.mode);
    const tolerance=held?.radiusMeters ?? (airborne?2:1);
    // All axes remain checked: a bridge below a waypoint is never counted as arrival.
    if(distance<=tolerance)this.advanceWaypoint();
    return {...base,mode:'travel',input:trainingDirectionInput(vehicle.mode,position,actor.rotationLocalRadiansXYZ,velocity,this.route[this.index]!)};
  }
}
