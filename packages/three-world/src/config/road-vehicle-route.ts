/** Input-controller defaults, not changes to vehicle physics/calibration. */
export const ROAD_VEHICLE_ROUTE_DEFAULTS = Object.freeze({
  maximumSpeedMetersPerSecond: 4,
  arrivalToleranceMeters: 1.5,
  stoppedSpeedMetersPerSecond: .25,
  stoppedDurationSeconds: .4,
  maximumStopSampleGapSeconds: .5,
  brakingDecelerationMetersPerSecondSquared: 3,
  progressTimeoutSeconds: 6,
  progressDistanceMeters: .25,
  steeringGain: 1.8,
});
