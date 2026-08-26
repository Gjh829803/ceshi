export type PhysicsWorldPositionMetersXYZV1 = readonly [number, number, number];

export interface SphereSweepRequestV1 {
  readonly startPositionMetersXYZ: PhysicsWorldPositionMetersXYZV1;
  readonly endPositionMetersXYZ: PhysicsWorldPositionMetersXYZV1;
  readonly probeRadiusMeters: number;
  readonly ignoredEntityId?: string;
}

export interface SphereSweepHitV1 {
  /** Distance traveled by the probe center before the first contact. */
  readonly travelDistanceMeters: number;
  readonly travelFraction: number;
  readonly hitPositionMetersXYZ: PhysicsWorldPositionMetersXYZV1;
  readonly hitEntityId?: string;
}

/**
 * Provider-neutral collision query capability. Gameplay components depend on
 * this port instead of Babylon's scene picker or Havok's plugin instance.
 */
export interface PhysicsWorldQueryPortV1 {
  sweepSphere(request: SphereSweepRequestV1): SphereSweepHitV1 | undefined;
}
