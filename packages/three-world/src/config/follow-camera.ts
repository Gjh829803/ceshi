/** Ordinary Three subject camera defaults. Player camera calibration is in camera.ts. */
export const FOLLOW_CAMERA_DEFAULTS=Object.freeze({
  followHalfLifeSeconds:.08,distanceMeters:4,pitchRadians:.25,activateOnInput:true,
  transitionSeconds:.35,rotationSpeedRadiansPerSecond:1.8,collisionRadiusMeters:.2,
  openingRecoveryHalfLifeSeconds:.18,targetRecoveryHalfLifeSeconds:.24,
  maximumRecoveryMetersPerSecond:3,targetHalfLifeSeconds:.1,
});
