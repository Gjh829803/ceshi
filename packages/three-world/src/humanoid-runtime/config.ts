import type {AircraftSubtype} from '../config/aircraft';
import type {AircraftFlightTuning} from '../config/aircraft';
import {familyImpactMass} from './motion-families/registry';
import type {WheelPhysicsConfig} from './motion-families/ground-vehicle/wheel-physics';
import type {BodyPhysicsConfig} from './vehicle-dynamics';
export type Mode = 'wheeled' | 'bus' | 'tank' | 'motorcycle' | 'unicycle' | 'skateboard' | 'sled' | 'ski' | 'hover' | 'paddled_boat' | 'boat' | 'submarine' | 'glider' | 'plane' | 'spacecraft' | 'mount' | 'carriage' | 'dragon';
export type VehicleArchetype = 'unicycle' | 'canoe' | 'raft' | 'jetski' | 'atv' | 'rover' | 'racer' | 'bus' | 'tank' | 'motorcycle' | 'skateboard' | 'sled' | 'ski' | 'hover' | 'kayak' | 'boat' | 'submarine' | 'glider' | 'plane' | 'spacecraft' | 'horse' | 'carriage' | 'dragon';
/** 控制器载具的接触等效质量（含驾驶员），用于推动动态物品，不改变原有操控模型。 */
export function vehicleImpactMass(spec:VehicleSpec):number{return familyImpactMass(spec);}
export interface CollisionEnvelope { kind: 'box'; halfExtents: [number, number, number]; offset: [number, number, number] }
import type {ExtendedControl} from '../config/control';
export interface VehicleSpec extends Partial<ExtendedControl> {
  aircraftSubtype?:AircraftSubtype;
  /** Fixed-wing/transition attitude tuning; omitted values use SDK defaults. */
  aircraftFlight?:AircraftFlightTuning;
  /** 太空大类专用标定；只由 space 家族消费。 */
  spaceFlight?:import('./motion-families/space/config').SpaceFlightConfig;
  /** 原生动力飞行标定；缺省时保留现有地面起降坐骑。 */
  flyingCreatureGround?:import('./motion-families/flying-creature/ground').FlyingCreatureGround;
  flyingCreature?:import('./motion-families/flying-creature/state').FlyingCreatureTuning;
  /** 米制局部空间的躯干/颈部/头部通行球（翼尖、尾尖不阻挡）；平移/转动扫掠与物理接触共用，缺省使用 D01 标定。 */
  flyingCreatureCollision?:readonly {id:string;center:readonly [number,number,number];radius:number}[];
  /** Configuration identity. Asset/instance IDs are separate from driving modes. */
  id: string; name: string; en: string;
  /** Optional content-owned static control profile reference. The SDK does not resolve it. */
  controlProfileId?: string;
  /** Driving family and map-region permission key. paddled_boat covers kayak, canoe and raft.
   * submarine is underwater movement; spacecraft is zero-gravity six-axis movement.
   * skateboard is the vehicle; slide is a separate humanoid action. */
  mode: Mode; kernel: string; color: string;
  spawn: [number, number, number]; yaw: number; speed: number; accel: number; grip: number;
  steer: number; radius: number; seat: [number, number, number]; hint: string;
  /** Rider pose, not propulsion. paddling is shared by kayak, canoe and raft;
   * the runtime binds hands to the stroke state. Omission uses the drive pose. */
  characterPose?: 'unicycle' | 'atv' | 'stand' | 'ride' | 'sled' | 'ski' | 'tank' | 'submarine' | 'paddling' | 'wingsuit' | 'paraglider';
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
