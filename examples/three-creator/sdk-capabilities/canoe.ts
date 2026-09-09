import type {VehicleSpec} from './config';
/** Single-blade craft uses the shared paddle/buoyancy owner with its canoe profile. */
export const CANOE_SPEC:VehicleSpec={id:'canoe',name:'单桨木舟',en:'CANOE',mode:'kayak',archetype:'kayak',visualVariant:'canoe',kernel:'K17',color:'#95643a',
 spawn:[205,-1.888,-140.5],yaw:Math.PI/2,speed:3.1,accel:1.9,grip:1.2,steer:1.7,radius:.7,seat:[0,.45,-.45],camera:6.5,characterPose:'kayak',
 maxSpeed:3.1,reverseSpeed:1.2,coastDeceleration:.11,dragQuadratic:.11,brakeDamping:1.8,steeringResponse:2.8,steeringReturn:3,pitchResponse:3,rollResponse:2.5,
 hint:'W 单侧划桨 · S 倒划 · A / D 换侧扫桨转向 · Space 压桨减速 · F 上下舟 · T 切换视角',
 envelope:{kind:'box',halfExtents:[.60,.34,2.4],offset:[0,.10,0]}};
