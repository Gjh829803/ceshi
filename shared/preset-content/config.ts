import {UNICYCLE_SPEC} from './unicycle';
import {SUBMERSIBLE_SPEC} from './submersible';
import {CANOE_SPEC} from './canoe';
import {KAYAK_SPEC} from './kayak';
import {RAFT_SPEC} from './raft';
import {JETSKI_SPEC} from './jetski';
import {ATV_SPEC} from './atv';
import { SKI_SPEC } from './ski';
import { SLED_SPEC } from './sled';
import { TANK_SPEC } from './tank';
import { BUS_SPEC } from './bus';
import {humanoid} from '@worldkit/three';
import { CREATURE_SPECS } from './creatures/specs';
import { roadSeatAnchor } from './road-seating';
export type Mode = humanoid.VehicleSpec['mode'];
export type VehicleArchetype = humanoid.VehicleSpec['archetype'];
export type CollisionEnvelope = humanoid.VehicleSpec['envelope'];
export type VehicleSpec = humanoid.VehicleSpec;
/** Specialized controller families share movement modes but have distinct tuning. */
export function vehicleControlFamily(spec: Pick<VehicleSpec, 'mode' | 'archetype'> | undefined): string {
  const archetype = spec?.archetype;
  return archetype && ['unicycle', 'raft', 'jetski', 'atv'].includes(archetype)
    ? archetype : spec?.mode ?? 'character';
}
export const SPECS: VehicleSpec[] = [
  {id:'rover',name:'越野车',en:'ROVER',mode:'wheeled',kernel:'K03',color:'#f0b64d',spawn:[-24,0,64],yaw:0,speed:28,accel:10,grip:11,steer:1,radius:1.65,seat:roadSeatAnchor('rover'),camera:8.2,hint:'W / S 油门与制动 · A / D 转向 · Space 手刹漂移',archetype:'rover',envelope:{kind:'box',halfExtents:[1.35,1.15,2.15],offset:[0,1.15,0]}},
  {id:'racer',name:'公路赛车',en:'APEX',mode:'wheeled',kernel:'K03',color:'#f37659',spawn:[-10,0,64],yaw:0,speed:36,accel:12,grip:14,steer:1.08,radius:1.6,seat:roadSeatAnchor('racer'),camera:8,hint:'W / S 油门与制动 · A / D 转向 · Space 手刹漂移',archetype:'racer',envelope:{kind:'box',halfExtents:[1.35,1.1,2.15],offset:[0,1.1,0]}},
  {id:'bike',name:'两轮摩托',en:'LEAN',mode:'motorcycle',kernel:'K02',color:'#a4d479',spawn:[4,0,64],yaw:0,speed:32,accel:12,grip:13,steer:1.12,radius:0.85,seat:roadSeatAnchor('bike'),camera:6.8,hint:'W / S 油门与制动 · A / D 倾斜转弯 · Space 刹车',archetype:'motorcycle',characterPose:'ride',envelope:{kind:'box',halfExtents:[.65,1.2,1.65],offset:[0,1.2,0]}},
  {id:'slide',name:'贴面滑板',en:'SKIM',mode:'slide',kernel:'K04',color:'#f39eae',spawn:[17,0,64],yaw:0,speed:22,accel:8,grip:2.8,steer:1.65,radius:0.7,seat:[0,0.2,0],camera:6,hint:'W / S 推进 · A / D 转向 · Space 强制减速',characterPose:'stand',archetype:'slide',envelope:{kind:'box',halfExtents:[.45,1.05,1.2],offset:[0,1,0]}},
  {id:'hover',name:'定高悬浮艇',en:'FLOAT',mode:'hover',kernel:'K05',color:'#55cec5',spawn:[32,1.3,64],yaw:0,speed:28,accel:11,grip:4.8,steer:1.5,radius:1.5,seat:[0,0.48,-0.1],camera:8,hint:'W / S 推进 · A / D 转向 · Q / E 侧移 · Space 制动',archetype:'hover',envelope:{kind:'box',halfExtents:[1.7,1.15,2.2],offset:[0,.775,0]}},
  {id:'boat',name:'水上快艇',en:'WAKE',mode:'boat',kernel:'K06',color:'#68baf1',spawn:[207,-1.9,10],yaw:0,speed:24,accel:7,grip:3,steer:1.05,radius:1.7,seat:[0,0.35,-0.3],camera:9,hint:'W / S 推进与倒船 · A / D 船舵 · Space 减速',archetype:'boat',envelope:{kind:'box',halfExtents:[1.35,1.25,2.85],offset:[0,.5,0]}},
  {id:'sub',name:'探索潜艇',en:'DEEP',mode:'sub',kernel:'K07',color:'#f4ca58',spawn:[230,-3.1,45],yaw:0,speed:16,accel:6.5,grip:2.4,steer:1.15,radius:1.7,seat:[0,0.1,0.5],camera:9,hint:'W / S 推进 · A / D 转向 · Space 上浮 · Ctrl 下潜 · Q / E 横滚 · Shift 制动',archetype:'sub',envelope:{kind:'box',halfExtents:[1.8,1.6,2.9],offset:[0,.2,0]}},
  {id:'glider',name:'无动力滑翔机',en:'SOAR',mode:'glider',kernel:'K08',color:'#e2e8eb',spawn:[-130,33,-146],yaw:0,speed:32,accel:0,grip:1,steer:1.05,radius:1.8,seat:[0,0.46,0],camera:11,hint:'W 俯冲 / S 拉起 · A / D 转弯 · Q / E 横滚 · Shift 释放滑翔',archetype:'glider',envelope:{kind:'box',halfExtents:[5.6,1.1,3.3],offset:[0,.9,0]}},
  {id:'plane',name:'动力飞机',en:'AERO',mode:'plane',kernel:'K09',color:'#e27e58',spawn:[-285,0,-205],yaw:0,speed:58,accel:12,grip:1,steer:1.05,radius:2,seat:[0,0.6,0.4],camera:13,hint:'Shift 加油门 / Ctrl 减油门 · W 俯冲 / S 拉起 · A / D 转弯 · Q / E 横滚',archetype:'plane',envelope:{kind:'box',halfExtents:[4.2,1.5,3.35],offset:[0,.45,0]}},
  {id:'space',name:'无重力飞行器',en:'ORBIT',mode:'space',kernel:'K10',color:'#a398eb',spawn:[-84,0.8,-70],yaw:0,speed:36,accel:14,grip:2.4,steer:1.45,radius:1.6,seat:[0,0.15,0.4],camera:9,hint:'W / S 前后 · A / D 偏航 · Space / Ctrl 升降 · Q / E 横滚 · ↑↓ 俯仰 / ←→ 侧移 · Shift 制动',archetype:'space',envelope:{kind:'box',halfExtents:[2,1.2,2.15],offset:[0,.35,0]}},
  {id:'trail-rover',name:'远征保障车',en:'TRAIL',mode:'wheeled',kernel:'K03',color:'#568f72',spawn:[-38,0,35],yaw:0,speed:24,accel:8,grip:12,steer:.95,radius:1.75,seat:roadSeatAnchor('trail-rover'),camera:8.8,hint:'W / S 油门与制动 · A / D 转向 · Space 手刹',archetype:'rover',visualVariant:'utility',envelope:{kind:'box',halfExtents:[1.35,1.15,2.25],offset:[0,1.15,0]}},
  {id:'touring-bike',name:'长途巡航摩托',en:'TOURER',mode:'motorcycle',kernel:'K02',color:'#507fc4',spawn:[-24,0,35],yaw:0,speed:28,accel:9,grip:14,steer:1.05,radius:.9,seat:roadSeatAnchor('touring-bike'),camera:7.3,hint:'W / S 油门与制动 · A / D 倾斜转弯 · Space 刹车',archetype:'motorcycle',characterPose:'ride',visualVariant:'touring',envelope:{kind:'box',halfExtents:[.65,1.2,1.65],offset:[0,1.2,0]}},
  {id:'rescue-hover',name:'救援悬浮艇',en:'LIFTER',mode:'hover',kernel:'K05',color:'#e36b55',spawn:[-10,1.3,35],yaw:0,speed:24,accel:9,grip:6,steer:1.3,radius:1.65,seat:[0,.48,-.1],camera:8.8,hint:'W / S 推进 · A / D 转向 · Q / E 侧移 · Space 制动',archetype:'hover',visualVariant:'rescue',envelope:{kind:'box',halfExtents:[1.75,1.15,2.3],offset:[0,.775,0]}},
  {id:'patrol-boat',name:'水域巡逻艇',en:'PATROL',mode:'boat',kernel:'K06',color:'#315f91',spawn:[207,-1.9,24],yaw:0,speed:21,accel:7.5,grip:3.8,steer:1.15,radius:1.85,seat:[0,.35,-.3],camera:9.8,hint:'W / S 推进与倒船 · A / D 船舵 · Space 减速',archetype:'boat',visualVariant:'patrol',envelope:{kind:'box',halfExtents:[1.45,1.4,3],offset:[0,.65,0]}},
  {id:'trainer-plane',name:'稳定教练机',en:'MENTOR',mode:'plane',kernel:'K09',color:'#f0d04f',spawn:[-270,0,-205],yaw:0,speed:46,accel:10,grip:1.4,steer:.9,radius:2.1,seat:[0,.6,.4],camera:13.5,hint:'Shift 加油门 / Ctrl 减油门 · W / S 俯仰 · A / D 转弯 · Q / E 横滚',archetype:'plane',visualVariant:'trainer',envelope:{kind:'box',halfExtents:[4.6,1.5,3.5],offset:[0,.45,0]}},
  {id:'survey-space',name:'轨道测绘艇',en:'SURVEYOR',mode:'space',kernel:'K10',color:'#64c8d0',spawn:[-70,1,-70],yaw:0,speed:28,accel:11,grip:4,steer:1.3,radius:1.8,seat:[0,.15,.4],camera:10,hint:'W / S 前后 · A / D 偏航 · Space / Ctrl 升降 · Q / E 横滚 · 方向键姿态 · Shift 制动',archetype:'space',visualVariant:'survey',envelope:{kind:'box',halfExtents:[2.8,1.2,2.4],offset:[0,.35,0]}},
  {id:'supercar',name:'超跑',en:'VELOCITY',mode:'wheeled',kernel:'K03',color:'#e66048',spawn:[-52,0,64],yaw:0,speed:65,accel:17,grip:18,steer:.88,radius:1.7,seat:roadSeatAnchor('supercar'),camera:8.2,hint:'W / S 油门与制动 · A / D 转向 · Space 手刹 · Shift 加速',archetype:'racer',envelope:{kind:'box',halfExtents:[1.3,.9,2.5],offset:[0,.9,0]}},
  {id:'kart',name:'卡丁车',en:'KART',mode:'wheeled',kernel:'K03',color:'#e9bf4f',spawn:[-66,0,64],yaw:0,speed:24,accel:10,grip:19,steer:1.65,radius:1.15,seat:roadSeatAnchor('kart'),camera:6,hint:'W / S 油门与制动 · A / D 转向 · Space 手刹 · Shift 加速',archetype:'racer',envelope:{kind:'box',halfExtents:[1,.85,1.45],offset:[0,.85,0]}},
];
for(const spec of SPECS){if(spec.mode==='wheeled'){
  const sporty=spec.archetype==='racer',utility=spec.id==='trail-rover';
  spec.reverseSpeed=spec.speed*.3;
  spec.speed=(sporty?180:160)/3.6;spec.maxSpeed=(sporty?220:200)/3.6;
  const powertrain:humanoid.PowertrainConfig={idleRpm:850,maxRpm:sporty?7200:6200,upshiftRpm:sporty?6200:5200,downshiftRpm:2100,
    torqueCurve:sporty?[[850,180],[2500,280],[4500,340],[6000,320],[7200,240]]:utility?[[850,290],[1800,410],[2800,440],[4500,350],[6200,230]]:[[850,230],[1800,330],[3200,380],[4500,360],[6200,250]],
    forwardRatios:[3.8,2.3,1.55,1.1,.85,.68],reverseRatio:3.3,finalDrive:utility?4.6:sporty?3.9:4.1,
    efficiency:.88,shiftSeconds:sporty?.24:.38,engineBrakeTorque:65,dragArea:sporty?.65:utility?1.3:1.1,rollingResistance:.018,boostTorqueMultiplier:3};
  // 短行程底盘：低障碍超过轮子行程后，由物理压缩限位抬升车身；显示仍读取实际悬架状态。
  spec.wheelPhysics={centerOfMassHeight:sporty?.5:utility?.75:.65,tireFriction:sporty?1.55:1.4,mass:utility?1900:sporty?1250:1600,radius:sporty?.39:.52,hubHeight:sporty?.39:.52,halfTrack:1.1,halfWheelbase:1.27,maxRaise:sporty?.02:utility?.04:.025,maxDrop:sporty?.025:utility?.045:.025,wheelWidth:sporty?.32:.4,powertrain};
  if(spec.id==='supercar'){
    spec.wheelPhysics={...spec.wheelPhysics,centerOfMassHeight:.45,radius:.37,hubHeight:.37,halfTrack:1.02,halfWheelbase:1.5,wheelWidth:.32};
    spec.speed=65;spec.maxSpeed=65*1.15;
  }
  if(spec.id==='kart'){
    spec.wheelPhysics=humanoid.createRoadPhysicsProfile('car',{centerOfMassHeight:.3,tireFriction:1.4,mass:180,radius:.24,hubHeight:.24,halfTrack:.78,halfWheelbase:.87,wheelWidth:.24,maxRaise:.02,maxDrop:.025,wheels:[-.78,.78].flatMap(x=>[-.89,.85].map(z=>({x,z,steering:z>0,driven:z<0}))),powertrain:{...powertrain,torqueCurve:powertrain.torqueCurve.map(([rpm,torque])=>[rpm,torque*.08]),engineBrakeTorque:5,dragArea:.45,boostTorqueMultiplier:1.6}});
    spec.speed=24;spec.maxSpeed=24*1.15;
  }
  // 底盘底面在轮轴之上；车轮接地由逐轮查询负责，保留车身/驾驶员顶部范围。
  spec.envelope={...spec.envelope,halfExtents:[spec.envelope.halfExtents[0],spec.envelope.halfExtents[1]-.16,spec.envelope.halfExtents[2]],offset:[0,spec.envelope.offset[1]+.16,0]};
}}
for(const spec of SPECS)if(spec.mode==='motorcycle'){
  spec.wheelPhysics=humanoid.createRoadPhysicsProfile('motorcycle',{mass:spec.id==='touring-bike'?320:260});
  spec.speed=150/3.6;spec.maxSpeed=180/3.6;spec.reverseSpeed=2;
}
SPECS.push(...CREATURE_SPECS,UNICYCLE_SPEC,SUBMERSIBLE_SPEC,CANOE_SPEC,KAYAK_SPEC,RAFT_SPEC,JETSKI_SPEC,ATV_SPEC,SKI_SPEC,SLED_SPEC,TANK_SPEC,BUS_SPEC);
export const START: [number,number,number] = [-24,0,55];
export const WORLD_LIMIT = 490;
export const WATER = -2;
export const DEPTH = -44;
export const ZONES = [
  {name:'载具整备区',short:'GARAGE',x:-18,z:55},
  {name:'高速环道',short:'CIRCUIT',x:-60,z:220},
  {name:'坡道与高台',short:'ELEVATION',x:-110,z:132},
  {name:'深水测试区',short:'DEEP WATER',x:300,z:20},
  {name:'起降跑道',short:'AIRFIELD',x:-285,z:-90},
  {name:'滑翔发射台',short:'LAUNCH',x:-130,z:-158},
];
