import type {WheelPhysicsConfig} from './wheel-physics';
import type {BodyPhysicsConfig} from './vehicle-dynamics';
export type Mode = 'wheeled' | 'bus' | 'tank' | 'motorcycle' | 'unicycle' | 'slide' | 'sled' | 'ski' | 'hover' | 'kayak' | 'boat' | 'sub' | 'glider' | 'plane' | 'space' | 'mount' | 'carriage' | 'dragon';
export type VehicleArchetype = 'unicycle' | 'raft' | 'jetski' | 'atv' | 'rover' | 'racer' | 'bus' | 'tank' | 'motorcycle' | 'slide' | 'sled' | 'ski' | 'hover' | 'kayak' | 'boat' | 'sub' | 'glider' | 'plane' | 'space' | 'horse' | 'carriage' | 'dragon';
/** 控制器载具的接触等效质量（含驾驶员），用于推动动态物品，不改变原有操控模型。 */
export function vehicleImpactMass(spec:VehicleSpec):number {
  return spec.wheelPhysics?.mass??spec.bodyPhysics?.mass??({bus:11000,tank:30000,sled:100,ski:85,kayak:110,wheeled:1600,motorcycle:260,unicycle:90,slide:90,hover:450,boat:900,sub:3000,glider:180,plane:1200,space:2000,mount:550,carriage:1000,dragon:1800}[spec.mode]);
}
export interface CollisionEnvelope { kind: 'box'; halfExtents: [number, number, number]; offset: [number, number, number] }
import type {ExtendedControl} from '../config/control';
export interface VehicleSpec extends Partial<ExtendedControl> {
  /** 原生动力飞行标定；缺省时保留现有地面起降坐骑。 */
  flyingCreature?:import('./motion-families/flying-creature/state').FlyingCreatureTuning;
  id: string; name: string; en: string; mode: Mode; kernel: string; color: string;
  spawn: [number, number, number]; yaw: number; speed: number; accel: number; grip: number;
  steer: number; radius: number; seat: [number, number, number]; camera: number; hint: string; characterPose?: 'unicycle' | 'atv' | 'stand' | 'ride' | 'sled' | 'ski' | 'tank' | 'sub' | 'kayak';
  archetype: VehicleArchetype; visualVariant?: 'bubble-sub' | 'canoe' | 'utility' | 'touring' | 'rescue' | 'patrol' | 'trainer' | 'survey';
  /** Opt-in progressive brake-turn slip for cars and motorcycles; recovery follows lateral velocity. */
  brakeDrift?: boolean;
  envelope: CollisionEnvelope;
  wheelPhysics?:WheelPhysicsConfig;
  /** Force-driven vehicles share the wheel vehicles' Rapier world and fixed step. */
  bodyPhysics?:BodyPhysicsConfig;
  /** Bicycle-model geometry in metres, measured from the authored visual root. */
  wheelbaseMeters?: number;
  rearAxleZMeters?: number;
}
