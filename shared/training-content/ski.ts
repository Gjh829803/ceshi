import type { VehicleSpec } from './config';

/** +Z downhill-facing nose; metres, m/s, m/s², rad/s and damping in 1/s. */
export const SKI_SPEC: VehicleSpec = {
  id:'ski', name:'双板滑雪', en:'ALPINE', mode:'ski', archetype:'ski', kernel:'K14', color:'#e67839',
  spawn:[-184,0,64], yaw:0, speed:24, accel:5, grip:4.5, steer:1.1,
  groundSpeed:3, coastDeceleration:.18, brakeDeceleration:7, dragQuadratic:.004,
  steeringResponse:3.5, steeringReturn:5, pitchResponse:12, rollResponse:10,
  radius:1.1, seat:[0,.91,0], camera:6, characterPose:'ski',
  hint:'W 低速撑杖 · A / D 压刃转弯 · S / Space 刹停 · 松键顺坡滑行 · F 穿脱双板',
  envelope:{kind:'box',halfExtents:[.65,.9,1.05],offset:[0,.9,0]},
};
