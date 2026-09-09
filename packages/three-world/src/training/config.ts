import type {WheelPhysicsConfig} from './wheel-physics';
export type Mode = 'wheeled' | 'bike' | 'slide' | 'hover' | 'boat' | 'sub' | 'glider' | 'plane' | 'space' | 'mount' | 'carriage' | 'dragon';
export type VehicleArchetype = 'rover' | 'racer' | 'bike' | 'slide' | 'hover' | 'boat' | 'sub' | 'glider' | 'plane' | 'space' | 'horse' | 'carriage' | 'dragon';
/** 控制器载具的接触等效质量（含驾驶员），用于推动动态物品，不改变原有操控模型。 */
export function vehicleImpactMass(spec:VehicleSpec):number {
  return spec.wheelPhysics?.mass??({wheeled:1600,bike:260,slide:90,hover:450,boat:900,sub:3000,glider:180,plane:1200,space:2000,mount:550,carriage:1000,dragon:1800}[spec.mode]);
}
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
  wheelPhysics?:WheelPhysicsConfig;
}
