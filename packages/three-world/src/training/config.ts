export type Mode = 'wheeled' | 'bike' | 'slide' | 'hover' | 'boat' | 'sub' | 'glider' | 'plane' | 'space' | 'mount' | 'carriage' | 'dragon';
export type VehicleArchetype = 'rover' | 'racer' | 'bike' | 'slide' | 'hover' | 'boat' | 'sub' | 'glider' | 'plane' | 'space' | 'horse' | 'carriage' | 'dragon';
export interface CollisionEnvelope { kind: 'box'; halfExtents: [number, number, number]; offset: [number, number, number] }
import type {ExtendedControl} from '../config/control';
export interface VehicleSpec extends Partial<ExtendedControl> {
  id: string; name: string; en: string; mode: Mode; kernel: string; color: string;
  spawn: [number, number, number]; yaw: number; speed: number; accel: number; grip: number;
  steer: number; radius: number; seat: [number, number, number]; camera: number; hint: string; characterPose?: 'stand' | 'ride';
  archetype: VehicleArchetype; visualVariant?: 'utility' | 'touring' | 'rescue' | 'patrol' | 'trainer' | 'survey';
  /** Opt-in progressive brake-turn slip for cars and motorcycles; recovery follows lateral velocity. */
  brakeDrift?: boolean;
  envelope: CollisionEnvelope;
}
