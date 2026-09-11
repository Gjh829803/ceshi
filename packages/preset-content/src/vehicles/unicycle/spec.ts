import type {VehicleSpec} from '../../config';
export const UNICYCLE_SPEC:VehicleSpec={
  id:'unicycle',name:'独轮车',en:'UNICYCLE',mode:'unicycle',archetype:'unicycle',kernel:'K02',color:'#d9bd36',
  spawn:[-170,0,64],yaw:0,speed:4.2,maxSpeed:5.5,reverseSpeed:1.8,accel:2.2,grip:12,steer:1.3,
  coastDeceleration:2.8,brakeDeceleration:4.5,steeringResponse:5,steeringReturn:7,throttleResponse:5,pitchResponse:8,rollResponse:7,
  radius:.55,seat:[0,.94,0],characterPose:'unicycle',camera:4.6,
  bodyPhysics:{kind:'unicycle',mass:90,centerOfMassHeight:0.6},
  envelope:{kind:'box',halfExtents:[.34,.49,.39],offset:[0,.49,0]},
  hint:'W 前进 · S 制动后倒骑 · A / D 平衡转向 · 松开自动减速、单脚撑地 · 再按 W 收脚踩踏 · Space 制动 · F 上下车',
};
export const UNICYCLE_SOCKETS={'seat.driver':[0,.94,0],'entry.left':[1,0,0],'entry.right':[-1,0,0],'camera.driver':[0,1.6,.05]} satisfies Record<string,[number,number,number]>;
