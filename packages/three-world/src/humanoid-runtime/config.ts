import type {WheelPhysicsConfig} from './wheel-physics';
import type {BodyPhysicsConfig} from './vehicle-dynamics';
export type Mode = 'wheeled' | 'bus' | 'tank' | 'motorcycle' | 'unicycle' | 'skateboard' | 'sled' | 'ski' | 'hover' | 'paddled_boat' | 'boat' | 'submarine' | 'glider' | 'plane' | 'spacecraft' | 'mount' | 'carriage' | 'dragon';
export type VehicleArchetype = 'unicycle' | 'canoe' | 'raft' | 'jetski' | 'atv' | 'rover' | 'racer' | 'bus' | 'tank' | 'motorcycle' | 'skateboard' | 'sled' | 'ski' | 'hover' | 'kayak' | 'boat' | 'submarine' | 'glider' | 'plane' | 'spacecraft' | 'horse' | 'carriage' | 'dragon';
/** 控制器载具的接触等效质量（含驾驶员），用于推动动态物品，不改变原有操控模型。 */
export function vehicleImpactMass(spec:VehicleSpec):number {
  return spec.wheelPhysics?.mass??spec.bodyPhysics?.mass??({bus:11000,tank:30000,sled:100,ski:85,paddled_boat:110,wheeled:1600,motorcycle:260,unicycle:90,skateboard:90,hover:450,boat:900,submarine:3000,glider:180,plane:1200,spacecraft:2000,mount:550,carriage:1000,dragon:1800}[spec.mode]);
}
export interface CollisionEnvelope { kind: 'box'; halfExtents: [number, number, number]; offset: [number, number, number] }
import type {ExtendedControl} from '../config/control';
export interface VehicleSpec extends Partial<ExtendedControl> {
  /** 原生动力飞行标定；缺省时保留现有地面起降坐骑。 */
  flyingCreature?:import('./motion-families/flying-creature/state').FlyingCreatureTuning;
  /** Configuration identity. Asset/instance IDs are separate from driving modes. */
  id: string; name: string; en: string;
  /** Driving family and map-region permission key. paddled_boat covers kayak, canoe and raft.
   * submarine is underwater movement; spacecraft is zero-gravity six-axis movement.
   * skateboard is the vehicle; slide is a separate humanoid action. */
  mode: Mode; kernel: string; color: string;
  spawn: [number, number, number]; yaw: number; speed: number; accel: number; grip: number;
  steer: number; radius: number; seat: [number, number, number]; camera: number; hint: string;
  /** Rider pose, not propulsion. paddling is shared by kayak, canoe and raft;
   * the runtime binds hands to the stroke state. Omission uses the drive pose. */
  characterPose?: 'unicycle' | 'atv' | 'stand' | 'ride' | 'sled' | 'ski' | 'tank' | 'submarine' | 'paddling';
  /** Vehicle subtype that selects mechanics and model bindings, not a free-form visual label.
   * With mode paddled_boat: kayak uses alternating double-blade strokes;
   * canoe and raft use single-blade strokes. This does not load a vehicle model. */
  archetype: VehicleArchetype;
  /** Preset-specific variant; may select additional mechanics as well as geometry. */
  visualVariant?: 'bubble-sub' | 'utility' | 'touring' | 'rescue' | 'patrol' | 'trainer' | 'survey';
  /** Opt-in progressive brake-turn slip for cars and motorcycles; recovery follows lateral velocity. */
  brakeDrift?: boolean;
  envelope: CollisionEnvelope;
  wheelPhysics?:WheelPhysicsConfig;
  /** Force-driven vehicles share the wheel vehicles' Rapier world and fixed step.
   * Paddled boats use kind: 'paddle' with water displacement parameters and real scene water. */
  bodyPhysics?:BodyPhysicsConfig;
  /** Single-track (bicycle-model) steering geometry in metres, measured from the authored root.
   * This is a mathematical steering model used by vehicles such as buses, not bicycle support. */
  wheelbaseMeters?: number;
  rearAxleZMeters?: number;
}
