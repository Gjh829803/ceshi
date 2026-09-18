import type { VehicleSpec } from '../config';
import { getSharedControlDefaults } from '../control/defaults';

export const CREATURE_SPECS: VehicleSpec[] = [
  {id:'horse',name:'骑乘骏马',en:'STEED',mode:'mount',kernel:'K11',color:'#a46942',spawn:[38,0,35],yaw:0,...getSharedControlDefaults('horse')!,radius:1.9,seat:[0,1.65,0],hint:'W / S 前进与后退 · A / D 转向 · Shift 疾驰 · Ctrl 慢走 · Space 停步',archetype:'horse',characterPose:'ride',envelope:{kind:'box',halfExtents:[.8,1.65,1.9],offset:[0,1.65,0]}},
  {id:'carriage',name:'双轴马车',en:'CARRIAGE',mode:'carriage',kernel:'K12',color:'#6b4b31',spawn:[56,0,35],yaw:0,...getSharedControlDefaults('carriage')!,radius:2.3,seat:[0,1.45,.55],hint:'W / S 驱马与倒车 · A / D 牵引转向 · Shift 加速 · Ctrl 慢行 · Space 停车',archetype:'carriage',envelope:{kind:'box',halfExtents:[1.35,1.4,1.8],offset:[0,1.4,0]}},
  {id:'dragon',name:'进化龙',en:'Evolved dragon',mode:'dragon',kernel:'K13',color:'#527a59',spawn:[80,.225,35],yaw:0,...getSharedControlDefaults('dragon')!,radius:5.5,seat:[0,2.1,.4],hint:'W / S 前进与制动 · A / D 转向 · Space 起飞 / 上升 · Ctrl 下降 / 落地 · Shift 加速',archetype:'dragon',characterPose:'ride',envelope:{kind:'box',halfExtents:[5.5,2.8,4.5],offset:[0,2.6,0]}},
];
