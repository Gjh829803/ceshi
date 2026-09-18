import type { VehicleSpec } from '../../config';
import { getSharedControlDefaults } from '../../control/defaults';

/** +Z downhill-facing nose; metres, m/s, m/s², rad/s and damping in 1/s. */
export const SKI_SPEC: VehicleSpec = {
  id:'ski', name:'双板滑雪', en:'ALPINE', mode:'ski', archetype:'ski', kernel:'K14', color:'#e67839',
  spawn:[-184,0,64], yaw:0, ...getSharedControlDefaults('ski')!,
  radius:1.1, seat:[0,.91,0],  characterPose:'ski',
  hint:'W 低速撑杖 · A / D 压刃转弯 · S / Space 刹停 · 松键顺坡滑行 · F 穿脱双板',
  bodyPhysics:{kind:'sled',mass:85,centerOfMassHeight:0.65},
  envelope:{kind:'box',halfExtents:[.65,.9,1.05],offset:[0,.9,0]},
};
