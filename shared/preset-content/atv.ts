import type {VehicleSpec} from './config';
export const ATV_SPEC:VehicleSpec={
 id:'atv',name:'全地形车',en:'QUAD ATV',mode:'wheeled',archetype:'atv',kernel:'K01',color:'#bc3543',
 spawn:[-212,0,64],yaw:0,speed:110/3.6,maxSpeed:125/3.6,reverseSpeed:6,accel:7.5,grip:8,steer:.42,
 coastDeceleration:1.25,brakeDeceleration:10,steeringResponse:7,steeringReturn:9,throttleResponse:5,pitchResponse:8,rollResponse:7,
 radius:1.48,seat:[0,1,-.15],characterPose:'atv',camera:6.2,wheelbaseMeters:1.6,rearAxleZMeters:-.8,
 envelope:{kind:'box',halfExtents:[.91,.71,1.25],offset:[0,.71,0]},
 hint:'W 前进 · S 制动后倒车 · A / D 转向 · Shift 加速 · Space 手刹 · F 上下车 · T 视角',
};
export const ATV_SOCKETS={
 'seat.driver':[0,1,-.15],'seat.passenger':[0,1,-.68],
 'control.foot.left':[.420507,.309005,.012058],'control.foot.right':[-.420509,.309004,.012058],
 'entry.left':[1.35,.025,-.15],'entry.right':[-1.35,.025,-.15],'camera.driver':[.000542,1.633,.080046],
} satisfies Record<string,[number,number,number]>;
