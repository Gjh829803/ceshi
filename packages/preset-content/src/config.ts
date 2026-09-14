import { humanoid } from '@worldkit/three';
import { ATV_SPEC } from './vehicles/atv/spec';
import { BUS_SPEC } from './vehicles/bus/spec';
import { CANOE_SPEC } from './vehicles/canoe/spec';
import { CREATURE_SPECS } from './creatures/specs';
import { JETSKI_SPEC } from './vehicles/jetski/spec';
import { KAYAK_SPEC } from './vehicles/kayak/spec';
import { RAFT_SPEC } from './vehicles/raft/spec';
import { roadSeatAnchor } from './vehicles/road/seating';
import { roverBodyParts } from './vehicles/road/collision';
import { SKI_SPEC } from './vehicles/ski/spec';
import { SLED_SPEC } from './vehicles/sled/spec';
import { SUBMERSIBLE_SPEC } from './vehicles/submersible/spec';
import { TANK_SPEC } from './vehicles/tank/spec';
import { UNICYCLE_SPEC } from './vehicles/unicycle/spec';
export type Mode = humanoid.VehicleSpec['mode'];
export type VehicleArchetype = humanoid.VehicleSpec['archetype'];
export type CollisionEnvelope = humanoid.VehicleSpec['envelope'];
export type VehicleSpec = humanoid.VehicleSpec;
/** Specialized controller families share movement modes but have distinct tuning. */
export function vehicleControlFamily(spec: Pick<VehicleSpec, 'mode' | 'archetype' | 'flyingCreature' | 'aircraftSubtype'> | undefined): string {
  if(spec?.flyingCreature)return 'flying-creature';
  if(spec?.aircraftSubtype==='glider')return 'glider';
  const archetype = spec?.archetype;
  return archetype && ['unicycle', 'raft', 'jetski', 'atv'].includes(archetype)
    ? archetype : spec?.mode ?? 'character';
}
export const SPECS: VehicleSpec[] = [
  {id:'rover',name:'越野车',en:'ROVER',mode:'wheeled',kernel:'K03',color:'#f0b64d',spawn:[-24,0,64],yaw:0,speed:28,accel:10,grip:11,steer:1,radius:1.65,seat:roadSeatAnchor('rover'),hint:'W / S 油门与制动 · A / D 转向 · Space 手刹漂移',archetype:'rover',envelope:{kind:'box',halfExtents:[1.35,1.15,2.15],offset:[0,1.15,0]}},
  {id:'racer',name:'公路赛车',en:'APEX',mode:'wheeled',kernel:'K03',color:'#f37659',spawn:[-10,0,64],yaw:0,speed:36,accel:12,grip:14,steer:1.08,radius:1.6,seat:roadSeatAnchor('racer'),hint:'W / S 油门与制动 · A / D 转向 · Space 手刹漂移',archetype:'racer',envelope:{kind:'box',halfExtents:[1.35,1.1,2.15],offset:[0,1.1,0]}},
  {id:'motorcycle',name:'两轮摩托',en:'LEAN',mode:'motorcycle',kernel:'K02',color:'#a4d479',spawn:[4,0,64],yaw:0,speed:32,accel:12,grip:13,steer:1.12,radius:0.85,seat:roadSeatAnchor('motorcycle'),hint:'W / S 油门与制动 · A / D 倾斜转弯 · Space 刹车',archetype:'motorcycle',characterPose:'ride',envelope:{kind:'box',halfExtents:[.65,1.2,1.65],offset:[0,1.2,0]}},
  {id:'skateboard',name:'贴面滑板',en:'SKIM',mode:'skateboard',kernel:'K04',color:'#f39eae',spawn:[17,0,64],yaw:0,speed:22,accel:8,grip:2.8,steer:1.65,radius:0.7,seat:[0,0.2,0],hint:'W / S 推进 · A / D 转向 · Space 强制减速',characterPose:'stand',archetype:'skateboard',envelope:{kind:'box',halfExtents:[.45,1.05,1.2],offset:[0,1,0]}},
  {id:'hovercraft',name:'定高悬浮艇',en:'FLOAT',mode:'hover',kernel:'K05',color:'#55cec5',spawn:[32,1.3,64],yaw:0,speed:28,accel:11,grip:4.8,steer:1.5,radius:1.5,seat:[0,0.48,-0.1],hint:'W / S 推进 · A / D 转向 · Q / E 侧移 · Space 制动',archetype:'hover',envelope:{kind:'box',halfExtents:[1.7,1.15,2.2],offset:[0,.775,0]}},
  {id:'boat',name:'水上快艇',en:'WAKE',mode:'boat',kernel:'K06',color:'#68baf1',spawn:[207,-1.9,10],yaw:0,speed:24,accel:7,grip:3,steer:1.05,radius:1.7,seat:[0,0.35,-0.3],hint:'W / S 推进与倒船 · A / D 船舵 · Space 减速',archetype:'boat',envelope:{kind:'box',halfExtents:[1.35,1.25,2.85],offset:[0,.5,0]}},
  {id:'submarine',name:'探索潜艇',en:'DEEP',mode:'submarine',kernel:'K07',color:'#f4ca58',spawn:[230,-3.1,45],yaw:0,speed:16,accel:6.5,grip:2.4,steer:1.15,radius:1.7,seat:[0,0.1,0.5],hint:'W / S 推进 · A / D 转向 · Space 上浮 · Ctrl 下潜 · Q / E 横滚 · Shift 制动',archetype:'submarine',envelope:{kind:'box',halfExtents:[1.8,1.6,2.9],offset:[0,.2,0]}},
  {id:'glider',name:'无动力滑翔机',en:'SOAR',mode:'glider',kernel:'K08',color:'#e2e8eb',spawn:[-130,33,-146],yaw:0,speed:32,accel:0,grip:1,steer:1.05,radius:1.8,seat:[0,0.46,0],hint:'W 俯冲 / S 拉起 · A / D 转弯 · Q / E 横滚 · Shift 释放滑翔',archetype:'glider',envelope:{kind:'box',halfExtents:[5.6,1.1,3.3],offset:[0,.9,0]}},
  {id:'plane',name:'动力飞机',en:'AERO',mode:'plane',kernel:'K09',color:'#e27e58',spawn:[-285,0,-205],yaw:0,speed:58,accel:12,grip:1,steer:1.05,radius:2,seat:[0,1.3,.1],hint:'Shift 加油门 / Ctrl 减油门 · W 俯冲 / S 拉起 · A / D 转弯 · Q / E 横滚',archetype:'plane',envelope:{kind:'box',halfExtents:[4.2,1.25,3.35],offset:[0,1.25,0]}},
  {id:'spacecraft',name:'轻型穿梭机',en:'SHUTTLE',mode:'spacecraft',kernel:'K10',color:'#a398eb',spawn:[-84,.8,-70],yaw:0,speed:36,accel:14,grip:2.4,steer:1.45,radius:2.1,seat:[0,1.3,.1],hint:'W/S 推进 · A/D 左右转向 · ↑↓ 俯仰 / ←→ 侧移 · Space/Ctrl 升降 · Q/E 横滚 · Shift 制动 · F 上下船 · T 三视角',archetype:'spacecraft',spaceFlight:{...humanoid.SPACE_FLIGHT_PRESETS.shuttle,dockingPorts:[{id:'home',name:'穿梭机泊位',positionMetersXYZ:[-84,.8,-70],rotationXYZW:[0,0,0,1]}]},envelope:{kind:'box',halfExtents:[2.1,1.5,3.8],offset:[0,1.2,0]}},
  {id:'trail-rover',name:'远征保障车',en:'TRAIL',mode:'wheeled',kernel:'K03',color:'#568f72',spawn:[-38,0,35],yaw:0,speed:24,accel:8,grip:12,steer:.95,radius:1.75,seat:roadSeatAnchor('trail-rover'),hint:'W / S 油门与制动 · A / D 转向 · Space 手刹',archetype:'rover',visualVariant:'utility',envelope:{kind:'box',halfExtents:[1.35,1.15,2.25],offset:[0,1.15,0]}},
  {id:'touring-motorcycle',name:'长途巡航摩托',en:'TOURER',mode:'motorcycle',kernel:'K02',color:'#507fc4',spawn:[-24,0,35],yaw:0,speed:28,accel:9,grip:14,steer:1.05,radius:.9,seat:roadSeatAnchor('touring-motorcycle'),hint:'W / S 油门与制动 · A / D 倾斜转弯 · Space 刹车',archetype:'motorcycle',characterPose:'ride',visualVariant:'touring',envelope:{kind:'box',halfExtents:[.65,1.2,1.65],offset:[0,1.2,0]}},
  {id:'rescue-hovercraft',name:'救援悬浮艇',en:'LIFTER',mode:'hover',kernel:'K05',color:'#e36b55',spawn:[-10,1.3,35],yaw:0,speed:24,accel:9,grip:6,steer:1.3,radius:1.65,seat:[0,.48,-.1],hint:'W / S 推进 · A / D 转向 · Q / E 侧移 · Space 制动',archetype:'hover',visualVariant:'rescue',envelope:{kind:'box',halfExtents:[1.75,1.15,2.3],offset:[0,.775,0]}},
  {id:'patrol-boat',name:'水域巡逻艇',en:'PATROL',mode:'boat',kernel:'K06',color:'#315f91',spawn:[207,-1.9,24],yaw:0,speed:21,accel:7.5,grip:3.8,steer:1.15,radius:1.85,seat:[0,.35,-.3],hint:'W / S 推进与倒船 · A / D 船舵 · Space 减速',archetype:'boat',visualVariant:'patrol',envelope:{kind:'box',halfExtents:[1.45,1.4,3],offset:[0,.65,0]}},
  {id:'trainer-plane',name:'稳定教练机',en:'MENTOR',mode:'plane',kernel:'K09',color:'#f0d04f',spawn:[-270,0,-205],yaw:0,speed:46,accel:10,grip:1.4,steer:.9,radius:2.1,seat:[0,1.3,.1],hint:'Shift 加油门 / Ctrl 减油门 · W / S 俯仰 · A / D 转弯 · Q / E 横滚',archetype:'plane',visualVariant:'trainer',envelope:{kind:'box',halfExtents:[4.6,1.25,3.5],offset:[0,1.25,0]}},
  {id:'survey-spacecraft',name:'星环飞碟',en:'SAUCER',mode:'spacecraft',kernel:'K10',color:'#64c8d0',spawn:[-68,.8,-70],yaw:0,speed:28,accel:7,grip:2,steer:1.0,radius:5.5,seat:[0,1.3,.1],hint:'W/S 推进 · A/D 左右转向 · ↑↓ 俯仰 / ←→ 侧移 · Space/Ctrl 升降 · Q/E 横滚 · Shift 制动 · F 上下船 · T 三视角',archetype:'spacecraft',spaceFlight:{...humanoid.SPACE_FLIGHT_PRESETS.saucer,dockingPorts:[{id:'home',name:'飞碟泊位',positionMetersXYZ:[-68,.8,-70],rotationXYZW:[0,0,0,1]}]},envelope:{kind:'box',halfExtents:[5.5,1.5,5.5],offset:[0,1.2,0]}},
  {id:'supercar',name:'超跑',en:'VELOCITY',mode:'wheeled',kernel:'K03',color:'#e66048',spawn:[-52,0,64],yaw:0,speed:65,accel:17,grip:18,steer:.88,radius:1.7,seat:roadSeatAnchor('supercar'),hint:'W / S 油门与制动 · A / D 转向 · Space 手刹 · Shift 加速',archetype:'racer',envelope:{kind:'box',halfExtents:[1.3,.9,2.5],offset:[0,.9,0]}},
  {id:'kart',name:'卡丁车',en:'KART',mode:'wheeled',kernel:'K03',color:'#e9bf4f',spawn:[-66,0,64],yaw:0,speed:24,accel:10,grip:19,steer:1.65,radius:1.15,seat:roadSeatAnchor('kart'),hint:'W / S 油门与制动 · A / D 转向 · Space 手刹 · Shift 加速',archetype:'racer',envelope:{kind:'box',halfExtents:[1,.85,1.45],offset:[0,.85,0]}},
];
const planeBaseline=SPECS.find(s=>s.id==='plane')!;
for(const [n,variant] of ([
 {id:'pusher-plane',name:'机尾推进式飞机',en:'PUSHER',aircraftSubtype:'pusher',color:'#639ac2'},
 {id:'helicopter',name:'单主旋翼直升机',en:'HELI',aircraftSubtype:'helicopter',color:'#e4b251'},
 {id:'multirotor',name:'四旋翼载人飞行器',en:'QUAD',aircraftSubtype:'multirotor',color:'#6dbca9'},
 {id:'tiltrotor',name:'倾转旋翼飞机',en:'TILT',aircraftSubtype:'tiltrotor',color:'#9993ca'},
] as const).entries())SPECS.push({...structuredClone(planeBaseline),...variant,spawn:[-250+n*16,0,-205],
 hint:variant.aircraftSubtype==='pusher'?planeBaseline.hint:'Shift 增加升力 / Ctrl 降低升力（50% 悬停） · W / S 前后倾 · A / D 转向 · Q / E 侧倾'+(variant.aircraftSubtype==='tiltrotor'?' · 前飞加速自动倾转，减速恢复悬停':''),
 envelope:{kind:'box',halfExtents:[4.5,1.4,variant.aircraftSubtype==='helicopter'?4.1:3.6],offset:[0,1.4,0]}});
// 无动力小类共用注册入口；原旧滑翔机预设迁入新的飞机动力学。
Object.assign(SPECS.find(s=>s.id==='glider')!,{...structuredClone(planeBaseline),id:'glider',name:'无动力滑翔机',en:'SOAR',aircraftSubtype:'glider',color:'#e2e8eb',hint:'Shift 牵引起飞（最多 8 秒） · S 拉起 / W 低头 · A/D 转弯 · Ctrl 扰流板 · Space 地面刹车'});
for(const [n,variant] of ([
 {id:'paraglider',name:'滑翔伞',en:'CANOPY',aircraftSubtype:'paraglider',characterPose:'paraglider',color:'#e3b958'},
 {id:'wingsuit',name:'翼装飞行',en:'WINGSUIT',aircraftSubtype:'wingsuit',characterPose:'wingsuit',color:'#dfb550'},
 {id:'balloon',name:'热气球',en:'BALLOON',aircraftSubtype:'balloon',characterPose:'stand',color:'#db9369'},
] as const).entries())SPECS.push({...structuredClone(planeBaseline),...variant,spawn:variant.id==='balloon'?[-120,0,-205]:[-138+n*16,120,variant.id==='wingsuit'?-170:-138],seat:variant.id==='balloon'?[0,.18,0]:[0,1,0],radius:variant.id==='balloon'?1.2:.6,
 hint:variant.id==='balloon'?'Shift 按住加热 · 松开自然冷却 · Ctrl 放热气下降 · 水平随风漂移':variant.id==='wingsuit'?'Shift 助跑离开高台 · W/S 调整俯仰 · A/D 转向 · Space 开伞减速着陆':'Shift 助跑离开高台 · W/S 调整滑翔角 · A/D 转向 · Space 刹车缓降着陆',
 envelope:{kind:'box',halfExtents:variant.id==='balloon'?[.85,1.4,.85]:[.5,1,.5],offset:[0,1,0]}});
for(const spec of SPECS){if(spec.mode==='wheeled'){
  const sporty=spec.archetype==='racer',utility=spec.id==='trail-rover';
  spec.reverseSpeed=spec.speed*.3;
  const defaults=humanoid.createRoadVehicleSpec('car');
  spec.speed=sporty?180/3.6:defaults.speed;spec.maxSpeed=sporty?220/3.6:defaults.maxSpeed;
  const powertrain:humanoid.PowertrainConfig={...defaults.wheelPhysics.powertrain,
    ...(sporty?{maxRpm:7200,upshiftRpm:6200,torqueCurve:[[850,180],[2500,280],[4500,340],[6000,320],[7200,240]] as const,finalDrive:3.9,shiftSeconds:.24,dragArea:.65}:
      utility?{torqueCurve:[[850,290],[1800,410],[2800,440],[4500,350],[6200,230]] as const,finalDrive:4.6,dragArea:1.3}:{})};
  // 短行程底盘：低障碍超过轮子行程后，由物理压缩限位抬升车身；显示仍读取实际悬架状态。
  spec.wheelPhysics={...defaults.wheelPhysics,powertrain,
    ...(sporty?{centerOfMassHeight:.5,tireFriction:1.55,mass:1250,radius:.39,hubHeight:.39,maxRaise:.02,wheelWidth:.32}:
      utility?{centerOfMassHeight:.75,mass:1900,maxRaise:.04,maxDrop:.045}:{})};
  if(spec.id==='racer')spec.wheelPhysics.cabin={kind:'box',halfExtents:[.99,.47,.90],offset:[0,1.49,.10]};
  if(spec.id==='rover'||utility)spec.wheelPhysics.bodyParts=roverBodyParts(utility);
  if(spec.id==='supercar'){
    spec.wheelPhysics={...spec.wheelPhysics,centerOfMassHeight:.45,radius:.37,hubHeight:.37,halfTrack:1.02,halfWheelbase:1.5,wheelWidth:.32};
    // The authored dimensions previously drove the implicit four-wheel layout.
    const {halfTrack,halfWheelbase}=spec.wheelPhysics;
    spec.wheelPhysics.wheels=[-halfTrack,halfTrack].flatMap(x=>[-halfWheelbase,halfWheelbase].map(z=>({x,z,steering:z>0,driven:true})));
    spec.speed=65;spec.maxSpeed=65*1.15;
  }
  if(spec.id==='kart'){
    spec.wheelPhysics=humanoid.createRoadPhysicsProfile('car',{centerOfMassHeight:.3,tireFriction:1.4,mass:180,radius:.24,hubHeight:.24,halfTrack:.78,halfWheelbase:.87,wheelWidth:.24,maxRaise:.02,maxDrop:.025,wheels:[-.78,.78].flatMap(x=>[-.89,.85].map(z=>({x,z,steering:z>0,driven:z<0}))),powertrain:{...powertrain,torqueCurve:powertrain.torqueCurve.map(([rpm,torque])=>[rpm,torque*.08]),engineBrakeTorque:5,dragArea:.45,boostTorqueMultiplier:1.6}});
    spec.speed=24;spec.maxSpeed=24*1.15;
  }
  // 训练场汽车逐车型调校；其他载具以及模型无关的 SDK 默认值不启用松油门辅助。
  if(['rover','racer','trail-rover','supercar','kart'].includes(spec.id)){
    spec.wheelPhysics.coastBrakeDeceleration=spec.id==='trail-rover'?1:1.2;
    if(spec.id==='racer'||spec.id==='supercar'){
      const torqueScale=spec.id==='supercar'?1.65:1.22;
      spec.wheelPhysics.powertrain={...powertrain,
        torqueCurve:powertrain.torqueCurve.map(([rpm,torque])=>[rpm,torque*torqueScale]),
        // 普通油门增强，加速键保持原来的峰值扭矩预算。
        boostTorqueMultiplier:(powertrain.boostTorqueMultiplier??1.8)/torqueScale};
    }
  }
  // 底盘底面在轮轴之上；车轮接地由逐轮查询负责，保留车身/驾驶员顶部范围。
  spec.envelope={...spec.envelope,halfExtents:[spec.envelope.halfExtents[0],spec.envelope.halfExtents[1]-.16,spec.envelope.halfExtents[2]],offset:[0,spec.envelope.offset[1]+.16,0]};
}}
for(const spec of SPECS)if(spec.mode==='motorcycle'){
  spec.wheelPhysics=humanoid.createRoadPhysicsProfile('motorcycle',spec.id==='touring-motorcycle'?{mass:320}:{});
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
