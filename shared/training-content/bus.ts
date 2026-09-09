import type {VehicleSpec} from './config';

/** Reference-inspired 5.8 m minibus; +Z forward, metres and seconds. */
export const BUS_SPEC:VehicleSpec={
  id:'bus',name:'复古小巴',en:'MINIBUS',mode:'bus',archetype:'bus',kernel:'K15',color:'#83c7bb',
  spawn:[-226,0,64],yaw:0,speed:22,accel:2.1,grip:12,steer:.52,
  maxSpeed:22,reverseSpeed:2.5,coastDeceleration:.55,brakeDeceleration:3.8,brakeDamping:0,
  steeringResponse:2.5,steeringReturn:3.2,throttleResponse:1.6,pitchResponse:3,rollResponse:2.5,
  wheelbaseMeters:3.3,rearAxleZMeters:-1.45,
  radius:2.15,seat:[.47,1.13,1.38],camera:10,
  hint:'W 油门 · S 制动后倒车 · A / D 转向 · Space 刹车 · F 上下车 · T 切换视角',
  envelope:{kind:'box',halfExtents:[1.22,1.34,2.96],offset:[0,1.34,0]},
};
