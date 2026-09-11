import type { VehicleSpec } from '../../config';

/** Metres, m/s, m/s²; +Z is the nose. Seat is the source humanoid pelvis anchor. */
export const SLED_SPEC: VehicleSpec = {
  id:'sled', name:'木座雪橇', en:'SLED', mode:'sled', archetype:'sled', kernel:'K14', color:'#b89465',
  spawn:[-198,0,64], yaw:0, speed:24, accel:4, grip:2.2, steer:.9,
  radius:1.15, seat:[0,.63,-.22], camera:5.8, characterPose:'sled',
  hint:'W 蹬地起步 · A / D 单侧拖脚转向 · S / Space 双脚制动 · 松键顺坡滑行 · F 上下雪橇',
  bodyPhysics:{kind:'sled',mass:100,centerOfMassHeight:0.35},
  envelope:{kind:'box',halfExtents:[.65,.78,1.05],offset:[0,.78,0]},
};
