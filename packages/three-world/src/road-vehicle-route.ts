import {Euler, Quaternion, Vector3} from 'three';
import type {Vec3, WorldInput} from './contracts.js';
import {emptyInput} from './humanoid-runtime/simulation.js';
import {ROAD_VEHICLE_ROUTE_DEFAULTS as defaults} from './config/road-vehicle-route.js';

export interface RoadVehicleRouteTarget {
  readonly positionWorldMetersXYZ: Vec3;
  readonly maximumSpeedMetersPerSecond?: number;
  readonly arrivalToleranceMeters?: number;
  readonly stopAtTarget?: boolean;
}
export interface RoadVehicleRouteMotion {
  readonly positionWorldMetersXYZ: Vec3;
  readonly rotationWorldRadiansXYZ: Vec3;
  readonly velocityWorldMetersPerSecondXYZ: Vec3;
}
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export const roadVehicleBrakeInput=():WorldInput=>({humanoid:{...emptyInput(),brake:true}});

/** Pure body-relative input calculation. It never writes a transform or advances time. */
export function roadVehicleRouteInput(motion:RoadVehicleRouteMotion,target:RoadVehicleRouteTarget):WorldInput {
  const delta=new Vector3(...target.positionWorldMetersXYZ).sub(new Vector3(...motion.positionWorldMetersXYZ));
  const heading=new Vector3(0,0,1).applyQuaternion(new Quaternion().setFromEuler(new Euler(...motion.rotationWorldRadiansXYZ)));
  const error=Math.atan2(Math.sin(Math.atan2(delta.x,delta.z)-Math.atan2(heading.x,heading.z)),Math.cos(Math.atan2(delta.x,delta.z)-Math.atan2(heading.x,heading.z)));
  const distance=delta.length(),speed=Math.hypot(...motion.velocityWorldMetersPerSecondXYZ);
  const tolerance=target.arrivalToleranceMeters??defaults.arrivalToleranceMeters;
  const maximum=target.maximumSpeedMetersPerSecond??defaults.maximumSpeedMetersPerSecond;
  const stop=target.stopAtTarget!==false;
  if(stop&&distance<=tolerance)return roadVehicleBrakeInput();
  // Slow before a tight turn; retain enough propulsion to steer a road vehicle.
  let desiredSpeed=Math.min(maximum,Math.max(1.2,maximum*Math.max(.2,Math.cos(error))));
  if(stop)desiredSpeed=Math.min(desiredSpeed,Math.sqrt(2*defaults.brakingDecelerationMetersPerSecondSquared*Math.max(0,distance-tolerance*.65)));
  const brake=speed>desiredSpeed+.3;
  return {humanoid:{...emptyInput(),forward:brake?0:clamp((desiredSpeed-speed)*.35,.08,1),steer:clamp(-error*defaults.steeringGain,-1,1),brake}};
}

export interface RoadVehicleRouteDecision {
  readonly status:'driving'|'stopping'|'arrived'|'failed';
  readonly input:WorldInput;
  readonly distanceMeters:number;
  readonly speedMetersPerSecond:number;
  readonly errorCode?:'ROAD_ROUTE_BLOCKED'|'ROAD_ROUTE_STATE_INVALID'|'ROAD_ROUTE_CLOCK_CHANGED';
}
/** One target, with simulation-time progress and stop confirmation. Hosts own sequencing. */
export class RoadVehicleRouteController {
  private lastTime:number|undefined;
  private progressAt:number|undefined;
  private bestDistance=Infinity;
  private stoppedAt:number|undefined;
  private stopConfirmed=false;
  private failure:RoadVehicleRouteDecision['errorCode'];
  private readonly target:RoadVehicleRouteTarget;
  constructor(target:RoadVehicleRouteTarget){
    if(target.positionWorldMetersXYZ.length!==3||!target.positionWorldMetersXYZ.every(Number.isFinite)||
      (target.maximumSpeedMetersPerSecond!==undefined&&(!Number.isFinite(target.maximumSpeedMetersPerSecond)||target.maximumSpeedMetersPerSecond<=0))||
      (target.arrivalToleranceMeters!==undefined&&(!Number.isFinite(target.arrivalToleranceMeters)||target.arrivalToleranceMeters<=0)))throw new Error('ROAD_ROUTE_TARGET_INVALID');
    this.target={...target,positionWorldMetersXYZ:[...target.positionWorldMetersXYZ]};
  }
  step(motion:RoadVehicleRouteMotion,simulationSeconds:number):RoadVehicleRouteDecision {
    const distance=Math.hypot(...motion.positionWorldMetersXYZ.map((v,i)=>v-this.target.positionWorldMetersXYZ[i]!));
    const speed=Math.hypot(...motion.velocityWorldMetersPerSecondXYZ);
    if(!Number.isFinite(simulationSeconds)||![...motion.positionWorldMetersXYZ,...motion.rotationWorldRadiansXYZ,...motion.velocityWorldMetersPerSecondXYZ,distance,speed].every(Number.isFinite))this.failure='ROAD_ROUTE_STATE_INVALID';
    else if(this.lastTime!==undefined&&simulationSeconds<this.lastTime)this.failure='ROAD_ROUTE_CLOCK_CHANGED';
    const sampleGap=this.lastTime===undefined?0:simulationSeconds-this.lastTime;
    this.lastTime=simulationSeconds;
    const result=(status:RoadVehicleRouteDecision['status'],input:WorldInput):RoadVehicleRouteDecision=>({status,input,distanceMeters:distance,speedMetersPerSecond:speed,...(this.failure?{errorCode:this.failure}:{})});
    if(this.failure)return result('failed',roadVehicleBrakeInput());
    const inside=distance<=(this.target.arrivalToleranceMeters??defaults.arrivalToleranceMeters);
    if(inside){
      if(this.target.stopAtTarget===false)return result('arrived',{humanoid:emptyInput()});
      if(speed<=defaults.stoppedSpeedMetersPerSecond){
        if(this.stopConfirmed)return result('arrived',roadVehicleBrakeInput());
        if(sampleGap>defaults.maximumStopSampleGapSeconds)this.stoppedAt=undefined;
        this.stoppedAt??=simulationSeconds;
        if(simulationSeconds-this.stoppedAt>=defaults.stoppedDurationSeconds){this.stopConfirmed=true;return result('arrived',roadVehicleBrakeInput());}
      }else {this.stoppedAt=undefined;this.stopConfirmed=false;}
      this.progressAt=simulationSeconds;
      return result('stopping',roadVehicleBrakeInput());
    }
    this.stoppedAt=undefined;
    this.stopConfirmed=false;
    // A deliberately slow route must be able to make measurable progress before
    // the same stall deadline. Stationary vehicles still fail after six seconds.
    const progressDistance=Math.min(defaults.progressDistanceMeters,
      (this.target.maximumSpeedMetersPerSecond??defaults.maximumSpeedMetersPerSecond)*defaults.progressTimeoutSeconds*.5);
    if(this.progressAt===undefined||distance<this.bestDistance-progressDistance){this.bestDistance=distance;this.progressAt=simulationSeconds;}
    if(simulationSeconds-this.progressAt>defaults.progressTimeoutSeconds){this.failure='ROAD_ROUTE_BLOCKED';return result('failed',roadVehicleBrakeInput());}
    return result('driving',roadVehicleRouteInput(motion,this.target));
  }
}
