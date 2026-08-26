import type { Vec2, WaterBoundarySpecV2 } from "@whitebox-world/authoring";

export interface TerrainIntentDiagnosticV0 {
  readonly severity: "info" | "warning" | "blocking";
  readonly code: string;
  readonly instancePath: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type TerrainConstraintV0 =
  | Readonly<{
      id: string;
      kind: "water-basin";
      boundary: WaterBoundarySpecV2;
      waterLevelMeters: number;
      depthMeters: number;
      shoreWidthMeters: number;
    }>
  | Readonly<{
      id: string;
      kind: "flatten-region";
      pointsMetersXZ: readonly Vec2[];
      targetHeightMeters: number;
      falloffWidthMeters: number;
      role: "spawn";
    }>
  | Readonly<{
      id: string;
      kind: "flatten-footprint";
      centerMetersXZ: Vec2;
      sizeMetersXZ: Vec2;
      falloffWidthMeters: number;
      role: "landmark-support";
    }>
  | Readonly<{
      id: string;
      kind: "route-slope";
      pointsMetersXZ: readonly Vec2[];
      widthMeters: number;
      maximumSlopeDegrees: number;
    }>;

export interface DerivedTerrainConstraintsV0 {
  readonly terrainEntityId: string;
  readonly constraints: readonly TerrainConstraintV0[];
  readonly diagnostics: readonly TerrainIntentDiagnosticV0[];
}
