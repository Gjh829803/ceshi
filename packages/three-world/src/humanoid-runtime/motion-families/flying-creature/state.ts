import type {MovementSettings} from '../../../config/control';
/** 原生飞行生物状态和标定；实例独立，单位为米、秒、弧度。 */
export const FLYING_CREATURE_SYSTEM_ID_V1 = "creature-flight";
export const FLYING_CREATURE_KERNEL_REF_V1 = "worldkit://motion-kernel/creature-flight@1";

export interface FlyingCreatureFeelV1 {
  cruiseSpeedMetersPerSecond: number;
  boostSpeedMetersPerSecond: number;
  maximumSpeedMetersPerSecond: number;
  accelerationMetersPerSecondSquared: number;
  coastingDecelerationMetersPerSecondSquared: number;
  boostAccelerationMetersPerSecondSquared: number;
  brakingMetersPerSecondSquared: number;
  diveAccelerationMetersPerSecondSquared: number;
  climbDecelerationMetersPerSecondSquared: number;
  glideSinkMetersPerSecond: number;
  maximumPitchRadians: number;
  maximumBankRadians: number;
  pitchResponsePerSecond: number;
  bankResponsePerSecond: number;
  velocityResponsePerSecond: number;
  lowSpeedYawRateRadiansPerSecond: number;
  highSpeedYawRateRadiansPerSecond: number;
  collisionRecoverySeconds: number;
}

/** 公共速度、加减速与姿态响应由 VehicleSpec/运行时调参持有；这里只存专项标定。 */
export type FlyingCreatureTuning=Partial<Pick<FlyingCreatureFeelV1,
  'maximumSpeedMetersPerSecond'|'boostAccelerationMetersPerSecondSquared'|'diveAccelerationMetersPerSecondSquared'|
  'climbDecelerationMetersPerSecondSquared'|'glideSinkMetersPerSecond'|'maximumPitchRadians'|'maximumBankRadians'|
  'velocityResponsePerSecond'|'highSpeedYawRateRadiansPerSecond'|'collisionRecoverySeconds'>>;
export function validateFlyingCreatureTuning(value:FlyingCreatureTuning):void{
  const keys=['maximumSpeedMetersPerSecond','boostAccelerationMetersPerSecondSquared','diveAccelerationMetersPerSecondSquared',
    'climbDecelerationMetersPerSecondSquared','glideSinkMetersPerSecond','maximumPitchRadians','maximumBankRadians',
    'velocityResponsePerSecond','highSpeedYawRateRadiansPerSecond','collisionRecoverySeconds'];
  if(Object.keys(value).some(key=>!keys.includes(key)))throw new Error('CREATURE_TUNING_USE_SHARED_CONTROL');
  validateFeelNumbers(value);
}

export const DEFAULT_FLYING_CREATURE_FEEL_V1: Readonly<FlyingCreatureFeelV1> = Object.freeze({
  cruiseSpeedMetersPerSecond: 18, boostSpeedMetersPerSecond: 31, maximumSpeedMetersPerSecond: 44,
  accelerationMetersPerSecondSquared: 7, coastingDecelerationMetersPerSecondSquared: 7,
  boostAccelerationMetersPerSecondSquared: 15, brakingMetersPerSecondSquared: 22,
  diveAccelerationMetersPerSecondSquared: 18, climbDecelerationMetersPerSecondSquared: 7,
  glideSinkMetersPerSecond: 2.2, maximumPitchRadians: 1.05, maximumBankRadians: 0.8,
  pitchResponsePerSecond: 3.4, bankResponsePerSecond: 5, velocityResponsePerSecond: 4,
  lowSpeedYawRateRadiansPerSecond: 1.4, highSpeedYawRateRadiansPerSecond: 0.65,
  collisionRecoverySeconds: 0.45,
});

function validateFeelNumbers(values:Partial<FlyingCreatureFeelV1>):void{
  for (const [key, value] of Object.entries(values)) {
    const maximum = key.includes("Radians") ? (key.includes("Rate") ? 6 : 1.5)
      : key.endsWith("Seconds") ? 5 : key.endsWith("PerSecond") && !key.includes("Meters") ? 30 : 100;
    if (!Number.isFinite(value) || value <= 0 || value > maximum) throw new Error(`CREATURE_FEEL_RANGE_INVALID:${key}`);
  }
}
export function resolveConfiguredFlyingCreatureFeel(spec:Pick<MovementSettings,'speed'|'maxSpeed'|'accel'|'brakeDeceleration'|'coastDeceleration'|'pitchResponse'|'rollResponse'|'steer'>&{flyingCreature?:FlyingCreatureTuning}):Readonly<FlyingCreatureFeelV1>{
  return resolveFlyingCreatureFeelV1({...spec.flyingCreature,cruiseSpeedMetersPerSecond:spec.speed,boostSpeedMetersPerSecond:spec.maxSpeed,
    accelerationMetersPerSecondSquared:spec.accel,brakingMetersPerSecondSquared:spec.brakeDeceleration,
    coastingDecelerationMetersPerSecondSquared:spec.coastDeceleration,pitchResponsePerSecond:spec.pitchResponse,
    bankResponsePerSecond:spec.rollResponse,lowSpeedYawRateRadiansPerSecond:spec.steer});
}

/** 范围属于开发版飞行参数，不复用人物走跑速度。 */
export function resolveFlyingCreatureFeelV1(overrides: Partial<FlyingCreatureFeelV1> = {}): Readonly<FlyingCreatureFeelV1> {
  const base = DEFAULT_FLYING_CREATURE_FEEL_V1;
  if (Object.keys(overrides).some((key) => !Object.hasOwn(base, key))) throw new Error("CREATURE_FEEL_UNKNOWN_PARAMETER");
  const resolved = { ...base, ...overrides };
  validateFeelNumbers(resolved);
  if (!(resolved.cruiseSpeedMetersPerSecond < resolved.boostSpeedMetersPerSecond &&
    resolved.boostSpeedMetersPerSecond <= resolved.maximumSpeedMetersPerSecond)) throw new Error("CREATURE_FEEL_SPEED_ORDER_INVALID");
  return Object.freeze(resolved);
}

/** 体力和动作费用属于能力配置，与运动手感分开。 */
export const FLYING_CREATURE_ABILITIES_V1 = Object.freeze({
  boostDrainRatioPerSecond: 0.22, regenerationRatioPerSecond: 0.13,
  boostRestartRatio: 0.3, evadeCostRatio: 0.2, evadeDurationSeconds: 0.45,
  evadeCooldownSeconds: 1.5,
  flameStartSeconds: 0.3, flameEndSeconds: 0.3,
});

export interface FlyingCreatureCommandV1 {
  pitchRatio: number;
  turnRatio: number;
  boostRequested: boolean;
  brakeRequested: boolean;
  glideRequested: boolean;
  primaryRequested: boolean;
  secondaryRequested: boolean;
}
export type FlyingCreatureModeV1 = "cruise" | "boost" | "glide" | "dive" | "brake" | "hover" | "evade" | "collision";
export interface FlyingCreatureStateV1 {
  tick: number;
  yawRadians: number;
  pitchRadians: number;
  bankRadians: number;
  speedMetersPerSecond: number;
  staminaRatio: number;
  boostExhausted: boolean;
  mode: FlyingCreatureModeV1;
  primaryCount: number;
  flamePhase: "off" | "starting" | "loop" | "ending";
  flamePhaseSeconds: number;
  evadeRemainingSeconds: number;
  evadeCooldownSeconds: number;
  secondaryWasHeld: boolean;
  evadeDirection: number;
  evadeCount: number;
  collisionRemainingSeconds: number;
  collisionCount: number;
}

export function createFlyingCreatureStateV1(yawRadians = 0): FlyingCreatureStateV1 {
  if (!Number.isFinite(yawRadians)) throw new Error("CREATURE_YAW_INVALID");
  return { tick: 0, yawRadians, pitchRadians: 0, bankRadians: 0,
    speedMetersPerSecond: 0, staminaRatio: 1,
    boostExhausted: false, mode: "hover", primaryCount: 0, flamePhase: "off", flamePhaseSeconds: 0,
    evadeRemainingSeconds: 0, evadeCooldownSeconds: 0, secondaryWasHeld: false,
    evadeDirection: 1, evadeCount: 0, collisionRemainingSeconds: 0, collisionCount: 0 };
}
