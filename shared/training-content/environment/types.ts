/** Metres, seconds, +Y up, +Z forward. Boxes use XYZ Euler radians. */
export type Vec3 = readonly [number, number, number];
export interface EnvironmentBox {
  id: string;
  position: Vec3;
  size: Vec3;
  rotation?: Vec3;
  color?: string;
  surface?: 'concrete' | 'asphalt' | 'grip' | 'ice' | 'metal';
  collision?: boolean;
  rigidGroup?: {id:string;massKg:number};
}
export interface WaterVolume {
  id: string;
  min: Vec3;
  max: Vec3;
  surface: number;
}
export interface MapRegion {
  id: string;
  name: string;
  description: string;
  center: Vec3;
  size: readonly [number, number];
  color: string;
  modes: readonly string[];
}
export interface MapSpawn {
  id: string;
  name: string;
  position: Vec3;
  yaw: number;
  vehicleId?: string;
  regionId: string;
}
/** Authored object anchors retain the original humanoid motion's +Z local yaw. */
export interface MapInteraction {
  id: string;
  label: string;
  kind: 'pickup' | 'seat';
  position: [number, number, number];
  approach: [number, number, number];
  yaw: number;
  size?: [number, number, number];
  massKg?: number;
  colliderIds?: string[];
}
export interface MapClimbSurface {
  id: string;
  colliderId: string;
  kind: 'wall' | 'ladder';
  center: [number, number, number];
  normal: [number, number, number];
  width: number;
  minY: number;
  maxY: number;
}
export interface CharacterTrial {
  id: string;
  name: string;
  description: string;
  position: Vec3;
  /** Host reset heading: zero faces +Z. */
  yaw: number;
  action?: string;
  completion?: { minY?:number;minZ?:number;maxZ?:number };
}
export interface LooseCrate { id: string; position: Vec3; size: number }
export interface MapDefinition {
  id: string;
  name: string;
  description: string;
  bounds: { min: Vec3; max: Vec3 };
  boxes: readonly EnvironmentBox[];
  water: readonly WaterVolume[];
  regions: readonly MapRegion[];
  spawns: readonly MapSpawn[];
  playerSpawn: Vec3;
  characterCameraDistanceMeters?: number;
  interactions?: readonly MapInteraction[];
  climbSurfaces?: readonly MapClimbSurface[];
  characterTrials?: readonly CharacterTrial[];
  /** Independent dynamic bodies, never duplicated in boxes. */
  looseCrates?: readonly LooseCrate[];
}
