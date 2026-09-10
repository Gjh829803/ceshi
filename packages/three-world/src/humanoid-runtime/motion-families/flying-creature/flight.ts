import {Vector3} from 'three';
import {FLYING_CREATURE_ABILITIES_V1 as abilities,type FlyingCreatureStateV1,type FlyingCreatureCommandV1,type FlyingCreatureFeelV1} from './state';
import type {Input} from '../../simulation';
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const moveTowards=(a:number,b:number,d:number)=>a+clamp(b-a,-d,d);
export function compileFlyingCreatureCommandV1(i:Input):FlyingCreatureCommandV1{return {pitchRatio:-i.forward,turnRatio:i.steer,boostRequested:i.boost,brakeRequested:i.slow,glideRequested:i.brake,primaryRequested:i.primary??i.roll>0,secondaryRequested:i.secondary??i.roll<0};}

/** 一次固定步只计算请求；碰撞结果由 Runtime 提交，不读取场景或设备。 */
export function stepFlyingCreatureV1(state: FlyingCreatureStateV1, command: FlyingCreatureCommandV1,
  feel: FlyingCreatureFeelV1, currentVelocity: Vector3, dt = 1 / 60): Vector3 {
  if (!(dt > 0) || !Number.isFinite(dt)) return currentVelocity.clone();
  if (![command.pitchRatio, command.turnRatio, ...currentVelocity.toArray()].every(Number.isFinite)) throw new Error("CREATURE_INPUT_INVALID");
  // 松键主动减速；喷火、闪避和镜头动作不能隐式开启巡航。显式加速／滑翔仍保留原用途。
  const hasFlightInput = Math.abs(command.pitchRatio) > 1e-4 || Math.abs(command.turnRatio) > 1e-4 || command.boostRequested || command.glideRequested;
  const stopping = command.brakeRequested || !hasFlightInput;
  state.tick++;
  state.evadeRemainingSeconds = Math.max(0, state.evadeRemainingSeconds - dt);
  state.evadeCooldownSeconds = Math.max(0, state.evadeCooldownSeconds - dt);
  state.collisionRemainingSeconds = Math.max(0, state.collisionRemainingSeconds - dt);
  state.flamePhaseSeconds += dt;
  if (command.primaryRequested && (state.flamePhase === "off" || state.flamePhase === "ending")) {
    state.flamePhase = "starting"; state.flamePhaseSeconds = 0; state.primaryCount++;
  } else if (!command.primaryRequested && (state.flamePhase === "starting" || state.flamePhase === "loop")) {
    state.flamePhase = "ending"; state.flamePhaseSeconds = 0;
  } else if (state.flamePhase === "starting" && state.flamePhaseSeconds >= abilities.flameStartSeconds) {
    state.flamePhase = "loop"; state.flamePhaseSeconds = 0;
  } else if (state.flamePhase === "ending" && state.flamePhaseSeconds >= abilities.flameEndSeconds) {
    state.flamePhase = "off"; state.flamePhaseSeconds = 0;
  }
  if (command.secondaryRequested && !state.secondaryWasHeld && state.evadeCooldownSeconds === 0 && state.staminaRatio >= abilities.evadeCostRatio) {
    state.evadeRemainingSeconds = abilities.evadeDurationSeconds;
    state.evadeCooldownSeconds = abilities.evadeCooldownSeconds;
    state.evadeDirection = command.turnRatio < 0 ? -1 : 1;
    state.staminaRatio -= abilities.evadeCostRatio;
    state.evadeCount++;
  }
  state.secondaryWasHeld = command.secondaryRequested;
  if (!command.boostRequested && state.staminaRatio >= abilities.boostRestartRatio) state.boostExhausted = false;
  const boosting = command.boostRequested && !command.brakeRequested && !command.glideRequested && !state.boostExhausted && state.staminaRatio > 0;
  state.staminaRatio = clamp(state.staminaRatio + (boosting ? -abilities.boostDrainRatioPerSecond : abilities.regenerationRatioPerSecond) * dt, 0, 1);
  if (state.staminaRatio === 0) state.boostExhausted = true;
  const pitch = clamp(command.pitchRatio, -1, 1);
  const turn = clamp(command.turnRatio, -1, 1);
  state.pitchRadians += (pitch * feel.maximumPitchRadians - state.pitchRadians) * (1 - Math.exp(-feel.pitchResponsePerSecond * dt));
  // Three 以 +Z 前向；屏幕右侧为 -X，D 对应负偏航，正侧倾使右侧下沉。
  state.bankRadians += (turn * feel.maximumBankRadians * (stopping ? 0.2 : 1) - state.bankRadians) * (1 - Math.exp(-feel.bankResponsePerSecond * dt));
  const speedRatio = clamp(state.speedMetersPerSecond / feel.maximumSpeedMetersPerSecond, 0, 1);
  const yawRate = feel.lowSpeedYawRateRadiansPerSecond +
    (feel.highSpeedYawRateRadiansPerSecond - feel.lowSpeedYawRateRadiansPerSecond) * speedRatio * speedRatio;
  const controlRatio = state.collisionRemainingSeconds > 0 ? 0.25 : 1;
  state.yawRadians -= turn * yawRate * controlRatio * dt;
  state.yawRadians = Math.atan2(Math.sin(state.yawRadians), Math.cos(state.yawRadians));
  state.mode = state.collisionRemainingSeconds > 0 ? "collision" : state.evadeRemainingSeconds > 0 ? "evade"
    : stopping ? "brake" : command.glideRequested ? "glide" : boosting ? "boost"
      : state.pitchRadians < -0.35 ? "dive" : "cruise";
  const targetSpeed = stopping ? 0
    : boosting ? feel.boostSpeedMetersPerSecond : feel.cruiseSpeedMetersPerSecond;
  // 滑翔保留惯性；下俯增加势能转换，上仰消耗速度，最终硬限只保护数值稳定。
  const acceleration = command.brakeRequested ? feel.brakingMetersPerSecondSquared
    : stopping ? feel.coastingDecelerationMetersPerSecondSquared : command.glideRequested ? 0.6 : boosting ? feel.boostAccelerationMetersPerSecondSquared : feel.accelerationMetersPerSecondSquared;
  state.speedMetersPerSecond = moveTowards(state.speedMetersPerSecond, targetSpeed, acceleration * dt);
  if (!stopping) state.speedMetersPerSecond += (
    Math.max(0, -Math.sin(state.pitchRadians)) * feel.diveAccelerationMetersPerSecondSquared
    - Math.max(0, Math.sin(state.pitchRadians)) * feel.climbDecelerationMetersPerSecondSquared) * dt;
  state.speedMetersPerSecond = clamp(state.speedMetersPerSecond, 0, feel.maximumSpeedMetersPerSecond);
  const cosine = Math.cos(state.pitchRadians);
  const velocity = new Vector3(Math.sin(state.yawRadians) * cosine,
    Math.sin(state.pitchRadians), Math.cos(state.yawRadians) * cosine).multiplyScalar(state.speedMetersPerSecond);
  if (command.glideRequested && !command.brakeRequested) velocity.y -= feel.glideSinkMetersPerSecond;
  if (state.evadeRemainingSeconds > 0) velocity.add(new Vector3(-Math.cos(state.yawRadians), 0, Math.sin(state.yawRadians))
    .multiplyScalar(state.evadeDirection * 10 * Math.sin(Math.PI * state.evadeRemainingSeconds / abilities.evadeDurationSeconds)));
  const result = currentVelocity.clone().lerp(velocity, 1 - Math.exp(-feel.velocityResponsePerSecond * dt));
  if (stopping && state.speedMetersPerSecond === 0 && result.length() < 0.03 && state.evadeRemainingSeconds === 0) {
    result.set(0,0,0); state.mode = "hover";
  }
  return result;
}

/** 用物理求解后的实际速度损失反馈减速，不以包围盒或高度猜碰撞。 */
export function commitFlyingCreatureCollisionV1(state: FlyingCreatureStateV1, feel: FlyingCreatureFeelV1,
  requestedVelocity: Vector3, actualVelocity: Vector3, contact = false): void {
  const loss = requestedVelocity.length() - actualVelocity.length();
  if (contact || loss > Math.max(2, requestedVelocity.length() * 0.18)) {
    if (state.collisionRemainingSeconds === 0) state.collisionCount++;
    state.collisionRemainingSeconds = feel.collisionRecoverySeconds;
    state.speedMetersPerSecond = Math.max(0, Math.min(state.speedMetersPerSecond, actualVelocity.length()));
    state.mode = "collision";
  }
}
