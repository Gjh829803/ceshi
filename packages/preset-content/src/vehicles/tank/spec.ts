import {TANK_POWERTRAIN} from '../powertrains';
import type {VehicleSpec} from '../../config';
import { getSharedControlDefaults } from '../../control/defaults';

/** Enlarged humanoid tank. +Z nose. Metres, seconds, m/s, m/s², rad/s. */
export const TANK_SPEC:VehicleSpec={
  id:'tank',controlProfileId:'preset.tank',name:'履带坦克',en:'TANK',mode:'tank',archetype:'tank',kernel:'K16',color:'#7c8061',
  spawn:[-240,0,64],yaw:0,...getSharedControlDefaults('tank')!,
  radius:5.4,seat:[0,1.45,2.1],characterPose:'tank',
  hint:'W 前进 · S 制动后倒车 · A / D 差速转向（可原地）· Shift 加速 · Space 刹车 · Q / E 炮塔 · ↑ / ↓ 炮管 · F 进出 · T 视角',
  bodyPhysics:{kind:'tracks',mass:30000,centerOfMassHeight:1.4,driveRadius:.72,powertrain:TANK_POWERTRAIN},
  envelope:{kind:'box',halfExtents:[2.9,2.08,4.65],offset:[0,2.08,0]},
};

/** Fixed calibrated Source101 contact anchors, in tank root metres. */
export const TANK_SOCKETS={
  'seat.driver':[0,1.45,2.1],
  'control.hand.left':[.213968,1.735009,2.518638],
  'control.hand.right':[-.194585,1.743792,2.495255],
  'control.foot.left':[.169582,.948443,2.590657],
  'control.foot.right':[-.169582,.948443,2.590659],
  'entry.left':[3.25,.025,0], 'entry.right':[-3.25,.025,0],
  'camera.driver':[.000542,2.083,2.330046],
} satisfies Record<string,[number,number,number]>;
