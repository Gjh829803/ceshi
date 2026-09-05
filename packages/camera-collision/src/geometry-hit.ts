export interface CameraGeometryHitV2 {
  readonly schemaVersion: 2;
  readonly travelDistanceMeters: number;
  readonly travelFraction: number;
  readonly hitPointMetersXYZ: readonly [number, number, number];
  /** For start overlap, the unit direction that moves the probe out of geometry. */
  readonly hitNormalXYZ: readonly [number, number, number];
  readonly hitEntityId?: string;
  readonly startedOverlapping: boolean;
  readonly penetrationDepthMeters: number;
  readonly obstructionClass: "hard";
}
