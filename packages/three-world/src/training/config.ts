export type Mode = 'wheeled' | 'bus' | 'tank' | 'bike' | 'slide' | 'sled' | 'ski' | 'hover' | 'kayak' | 'boat' | 'sub' | 'glider' | 'plane' | 'space' | 'mount' | 'carriage' | 'dragon';
export type VehicleArchetype = 'unicycle' | 'raft' | 'jetski' | 'atv' | 'rover' | 'racer' | 'bus' | 'tank' | 'bike' | 'slide' | 'sled' | 'ski' | 'hover' | 'kayak' | 'boat' | 'sub' | 'glider' | 'plane' | 'space' | 'horse' | 'carriage' | 'dragon';
export interface CollisionEnvelope { kind: 'box'; halfExtents: [number, number, number]; offset: [number, number, number] }
import type {ExtendedControl} from '../config/control';
export interface VehicleSpec extends Partial<ExtendedControl> {
  id: string; name: string; en: string; mode: Mode; kernel: string; color: string;
  spawn: [number, number, number]; yaw: number; speed: number; accel: number; grip: number;
  steer: number; radius: number; seat: [number, number, number]; camera: number; hint: string; characterPose?: 'unicycle' | 'atv' | 'stand' | 'ride' | 'sled' | 'ski' | 'tank' | 'sub' | 'kayak';
  archetype: VehicleArchetype; visualVariant?: 'bubble-sub' | 'canoe' | 'utility' | 'touring' | 'rescue' | 'patrol' | 'trainer' | 'survey';
  envelope: CollisionEnvelope;
  /** Bicycle-model geometry in metres, measured from the authored visual root. */
  wheelbaseMeters?: number;
  rearAxleZMeters?: number;
}
