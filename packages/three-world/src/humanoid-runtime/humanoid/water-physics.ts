/** The swimming source clips place their root on the water plane. The physics
 * controller retains the same upright capsule and a foot-based position. */
import {SWIMMING_TUNING} from '../../config/actions';
export const SWIM_ROOT_DEPTH = SWIMMING_TUNING.rootDepthMeters;
export const SWIM_SPEED = SWIMMING_TUNING.speedMetersPerSecond;
export const SWIM_FAST_SPEED = SWIMMING_TUNING.fastSpeedMetersPerSecond;

export interface WaterContact {
  /** Native control mode; null when contact does not qualify for swimming. */
  swimmingMode:'surface'|'underwater'|null;
  volumeId:string;
  surfaceY:number;
  /** Water depth above the actual supporting collider, including shelves. */
  depth:number;
  /** Fraction of the upright movement capsule beneath the surface. */
  submersion:number;
  entrySpeed:number;
  entrySerial:number;
  /** Read-only diagnostic operands from the same existing contact decision. */
  feetBelowSurfaceMeters:number;
  requiredDepthMeters:number;
  requiredFeetBelowSurfaceMeters:number;
  depthCheckPassed:boolean;
  immersionCheckPassed:boolean;
  wasSwimmingAtSample:boolean;
}

/** A critically damped surface spring preserves entry velocity, then removes
 * momentum in water. It never assigns the character's position directly. */
export function swimVerticalVelocity(footY:number,vertical:number,surfaceY:number,dt:number){
  const target=surfaceY-SWIM_ROOT_DEPTH;
  return Math.max(-16,Math.min(3.5,vertical+((target-footY)*36-vertical*12)*dt));
}

/** Signed input changes velocity; neutral input brakes to a depth hold. */
export function underwaterVerticalVelocity(vertical:number,lift:number,dt:number){
  const target=Math.max(-1,Math.min(1,lift))*SWIMMING_TUNING.verticalSpeedMetersPerSecond;
  const change=SWIMMING_TUNING.verticalAccelerationMetersPerSecondSquared*dt;
  return vertical+Math.max(-change,Math.min(change,target-vertical));
}
