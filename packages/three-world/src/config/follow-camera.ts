/** Ordinary Three subject camera defaults. Player camera calibration is in camera.ts. */
export const FOLLOW_CAMERA_DEFAULTS=Object.freeze({
  followHalfLifeSeconds:.08,distanceMeters:4,pitchRadians:.25,activateOnInput:true,
  transitionSeconds:.35,rotationSpeedRadiansPerSecond:1.8,collisionRadiusMeters:.2,
  openingRecoveryHalfLifeSeconds:.18,targetRecoveryHalfLifeSeconds:.24,
  maximumRecoveryMetersPerSecond:3,targetHalfLifeSeconds:.1,
});

/** Shortest-arc recenter shared by tuned vehicle views and authored follow. */
export function recenterCameraYaw(current:number,target:number,responsePerSecond:number,deltaSeconds:number):number {
 return current+Math.atan2(Math.sin(target-current),Math.cos(target-current))*(1-Math.exp(-responsePerSecond*deltaSeconds));
}
