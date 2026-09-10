import type { VehicleState } from './simulation';
export { createBodyPhysics,validateBodyPhysics } from './motion-families/shared/body-state';
export type { BodyPhysicsConfig,BodyPhysicsState } from './motion-families/shared/body-state';
export interface VehicleDriveTelemetry {kind:'engine'|'pedal'|'paddle'|'push'|'motion';speed:number;effort:number;cadence:number;rpm:number;maxRpm:number;gear:string;shifting:boolean}
/** A read-only sample shared by the UI and observations. Sampling advances nothing. */
export function vehicleDriveTelemetry(v:VehicleState):VehicleDriveTelemetry|null {
  const p=v.motion.wheelPhysics?.powertrain??v.motion.body?.powertrain,c=v.spec.wheelPhysics?.powertrain??v.spec.bodyPhysics?.powertrain;
  if(p)return {kind:'engine',speed:v.speed,effort:p.throttle,cadence:0,rpm:p.rpm,maxRpm:c?.maxRpm??6200,gear:p.gear<0?'R':p.gear===0?'N':'D'+p.gear,shifting:p.shiftRemaining>0};
  if(v.motion.body)return {kind:v.spec.bodyPhysics?.kind==='motion'?'motion':v.motion.unicycle?'pedal':v.motion.kayak?'paddle':'push',speed:v.speed,effort:v.motion.body.effort,cadence:v.motion.body.cadence,rpm:0,maxRpm:0,gear:'',shifting:false};
  return null;
}
