/** The swimming source clips place their root on the water plane. The physics
 * controller retains the same upright capsule and a foot-based position. */
export const SWIM_ROOT_DEPTH = 1.15;
export const SWIM_SPEED = 1.6;
export const SWIM_FAST_SPEED = 2.6;

export interface WaterContact {
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
