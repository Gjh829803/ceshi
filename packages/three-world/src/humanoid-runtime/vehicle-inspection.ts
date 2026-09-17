import type {SolverSample} from './solver-sample';
import type {VehicleState} from './simulation';
import {vehicleDriveTelemetry,type VehicleDriveTelemetry} from './vehicle-dynamics';
export interface VehicleInspectionResult {
  worldRevision:number;simulationTick:number;simulationSeconds:number;isRunning:boolean;
  physicsStepSequence:number|null;vehicles:VehicleInspection[];
}
export interface VehicleInspectionQuery {
  readonly query?:string;
  readonly entityIds?:readonly string[];
  readonly detail?:'summary'|'wheels';
}
export interface VehicleWheelInspection {
  index:number;contact:boolean;loadNewtons:number;steeringRadians:number;rotationRadians:number;
  suspensionLengthMeters:number|null;compressionMeters:number|null;
  angularSpeedRadiansPerSecond:number|null;longitudinalSlipMetersPerSecond:number|null;longitudinalForceNewtons:number|null;
}
export interface VehicleInspection {
  sample:{status:'unmeasured'|'sampled'|'stale'|'not-applicable';solver:SolverSample|null};
  instanceId:string;mode:string;physicsOwner:'rigid-body'|'controller';grounded:boolean|null;
  speedMetersPerSecond:number;throttleRatio:number;drive:VehicleDriveTelemetry|null;
  wheelCount:number|null;wheelContacts:number|null;wheels?:VehicleWheelInspection[]|null;
  aircraft:{airspeedMetersPerSecond:number;angleOfAttackRadians:number;loadFactor:number;stalled:boolean;landingSinkMetersPerSecond:number;hardLanding:boolean;
    altitudeMeters:number;verticalSpeedMetersPerSecond:number;dynamicPressurePascals:number;liftNewtons:number;dragNewtons:number;controlAuthority:number;
    desiredLiftNewtons:number;totalRotorThrustNewtons:number;transitionFactor:number}|null;
}
/** Detached measured state only. Contact and slip are observations, not fault classifications. */
export function inspectVehicle(v:VehicleState,detail:'summary'|'wheels'='summary',physicsStepSequence?:number):VehicleInspection {
  const road=v.motion.wheelPhysics?.wheels,air=v.motion.aircraft,source=road??air?.wheels;
  const solver=v.motion.wheelPhysics?.sample??air?.sample,measured=!!solver||!source;
  const status=solver?(physicsStepSequence!==undefined&&solver.physicsStepSequence!==physicsStepSequence?'stale':'sampled'):source?'unmeasured':'not-applicable';
  return {sample:{status,solver:solver?{...solver}:null},instanceId:v.spec.id,mode:v.spec.mode,physicsOwner:v.motion.wheelPhysics||v.motion.body||air?'rigid-body':'controller',
    grounded:measured?v.grounded:null,speedMetersPerSecond:v.velocity.length(),throttleRatio:v.throttle,drive:measured?vehicleDriveTelemetry(v):null,
    wheelCount:source?.length??null,wheelContacts:solver?source?.filter(w=>w.contact).length??null:null,
    ...(detail==='wheels'?{wheels:!measured?null:road?road.map((w,index)=>({index,contact:w.contact,loadNewtons:w.load,steeringRadians:w.steer,rotationRadians:w.angle,
      suspensionLengthMeters:w.length,compressionMeters:null,angularSpeedRadiansPerSecond:w.omega,longitudinalSlipMetersPerSecond:w.slip,longitudinalForceNewtons:w.force})):
      air?air.wheels.map((w,index)=>({index,contact:w.contact,loadNewtons:w.load,steeringRadians:w.steer,rotationRadians:w.angle,
        suspensionLengthMeters:null,compressionMeters:w.compression,angularSpeedRadiansPerSecond:null,longitudinalSlipMetersPerSecond:null,longitudinalForceNewtons:null})):null}:{}),
    aircraft:air&&measured?{airspeedMetersPerSecond:air.airspeedMetersPerSecond,angleOfAttackRadians:air.angleOfAttackRadians,loadFactor:air.loadFactor,
      stalled:air.stalled,landingSinkMetersPerSecond:air.landingSinkMetersPerSecond,hardLanding:air.hardLanding,altitudeMeters:v.position.y,
      verticalSpeedMetersPerSecond:v.velocity.y,dynamicPressurePascals:air.dynamicPressurePascals,liftNewtons:air.liftNewtons,dragNewtons:air.dragNewtons,
      controlAuthority:air.controlAuthority,desiredLiftNewtons:air.desiredLiftNewtons,totalRotorThrustNewtons:air.totalRotorThrustNewtons,
      transitionFactor:air.transitionFactor}:null};
}
