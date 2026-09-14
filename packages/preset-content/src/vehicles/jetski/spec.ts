import {JET_POWERTRAIN} from '../powertrains';
import type {VehicleSpec} from '../../config';
export const JETSKI_SPEC:VehicleSpec={
 id:'jetski',name:'水上摩托',en:'JET SKI',mode:'boat',archetype:'jetski',kernel:'K06',color:'#bad43e',
 spawn:[220,-1.98,-145],yaw:0,speed:23,maxSpeed:29,reverseSpeed:5,accel:6.5,grip:4,steer:1.15,
 coastDeceleration:.65,brakeDeceleration:8,steeringResponse:7,steeringReturn:9,throttleResponse:5,pitchResponse:6,rollResponse:6,
 radius:1.8,seat:[0,1,-.15],characterPose:'atv',
 bodyPhysics:{kind:'jet',mass:330,centerOfMassHeight:0.3,driveRadius:.35,powertrain:JET_POWERTRAIN,water:{displacement:.70,depth:.6,bottom:.30,damping:6}},
  envelope:{kind:'box',halfExtents:[.72,.84,1.65],offset:[0,.54,0]},
 hint:'W 推进 · S 制动后倒船 · A / D 喷口转向 · Shift 加速 · Space 水阻制动 · F 上下车 · T 视角',
};
export const JETSKI_SOCKETS={
 'seat.driver':[0,1,-.15],
 'control.foot.left':[.420507,.309005,.012058],'control.foot.right':[-.420509,.309004,.012058],
 'entry.left':[1.4,.05,-.15],'entry.right':[-1.4,.05,-.15],'camera.driver':[.000542,1.633,.080046],
 'water.intake':[0,-.25,-.85],'water.jet':[0,-.02,-1.5],
} satisfies Record<string,[number,number,number]>;
