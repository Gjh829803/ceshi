import type {VehicleSpec} from './config';
export const KAYAK_SPEC:VehicleSpec={id:'kayak',name:'单人皮划艇',en:'KAYAK',mode:'kayak',archetype:'kayak',kernel:'K17',color:'#b84047',
 spawn:[205,-1.93,-124],yaw:Math.PI/2,speed:4.6,accel:2.7,grip:1.8,steer:3,radius:.48,seat:[0,.23,-.35],camera:6,characterPose:'kayak',
 maxSpeed:4.6,reverseSpeed:1.8,coastDeceleration:.16,dragQuadratic:.08,brakeDamping:2.1,steeringResponse:5,steeringReturn:5,pitchResponse:4,rollResponse:4,
 hint:'W 交替划桨 · S 倒划 · A / D 单侧转向 · Space 压桨制动 · F 上下艇 · T 切换视角',
 envelope:{kind:'box',halfExtents:[.40,.24,2.2],offset:[0,.01,0]}};
