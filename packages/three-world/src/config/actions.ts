/** Metres, seconds and kilograms; validation, controller and capability cards share these values. */
export const ACTION_TUNING = Object.freeze({slideMinimumSpeedMetersPerSecond:2.5,slideHeightMeters:.9,standingHeightMeters:1.68,
  approachRadiusMeters:.9,approachVerticalToleranceMeters:.16,maximumPickupMassKg:8,cooldownSeconds:.22,
  rollDurationSeconds:44/30,slideEntryDurationSeconds:25/30,slideLoopSeconds:1,slideExitDurationSeconds:.5});

export const SURFACE_TUNING=Object.freeze({standingHeightMeters:1.68,proneHeightMeters:.66,climbHeightMeters:1.76,proneSpeedMetersPerSecond:.85,climbVerticalSpeedMetersPerSecond:.72,climbLateralSpeedMetersPerSecond:.42,entryDistanceMinimumMeters:.28,entryDistanceMaximumMeters:.8});
