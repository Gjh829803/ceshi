import {SUB_POWERTRAIN} from '../powertrains';
import type {VehicleSpec} from '../../config';
export const SUBMERSIBLE_SPEC:VehicleSpec={id:'observation-submarine',name:'单人观景潜艇',en:'SUBMERSIBLE',mode:'submarine',archetype:'submarine',visualVariant:'bubble-sub',kernel:'K07',color:'#d4ad38',
 spawn:[205,-1.88,-105],yaw:Math.PI/2,speed:5,accel:2.1,grip:1.4,steer:.75,radius:1.6,seat:[0,.24,.25],camera:6.5,characterPose:'submarine',
 maxSpeed:5,reverseSpeed:2.2,drag:.18,dragQuadratic:.08,linearDamping:.5,verticalAcceleration:4.5,verticalDamping:2.6,brakeDamping:2.8,throttleResponse:2.5,steeringResponse:2.5,steeringReturn:3,pitchResponse:3,rollResponse:3,
 hint:'W / S 前进倒航 · A / D 转向 · Ctrl 下潜 · Space 上浮 · Q / E 横滚 · Shift 减速 · 水面 F 上下艇 · T 视角',
 bodyPhysics:{kind:'submersible',mass:720,centerOfMassHeight:0,driveRadius:.4,powertrain:SUB_POWERTRAIN,water:{displacement:2.4,depth:2.2,bottom:.78,damping:2.6}},
  envelope:{kind:'box',halfExtents:[1.55,1.2,1.55],offset:[0,.15,0]}};
