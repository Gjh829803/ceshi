import type {VehicleSpec} from './config';
import {defaultMovementSettings} from '../config/control';
import {createRoadPhysicsProfile,wheelLayout,type WheelPhysicsConfig,type WheelLayout} from './wheel-physics';
import {DEFAULT_POWERTRAIN,type PowertrainConfig} from './powertrain';

export type RoadVehicleKind='car'|'motorcycle';
/** Model-free configuration: metre coordinates, kg mass, m/s speeds, +Y up, +Z forward. */
export interface RoadVehicleSpec extends VehicleSpec {
  wheelPhysics:WheelPhysicsConfig & {wheels:WheelLayout[];powertrain:PowertrainConfig;wheelWidth:number};
}

/** Select handling before authoring geometry. Each call returns independent mutable data, no model or world. */
export function createRoadVehicleSpec(kind:RoadVehicleKind):RoadVehicleSpec {
  if(kind!=='car'&&kind!=='motorcycle')throw new Error('VEHICLE_ROAD_KIND_INVALID');
  const motorcycle=kind==='motorcycle';
  const physics=createRoadPhysicsProfile(kind,{
    centerOfMassHeight:motorcycle?.85:.65,tireFriction:1.4,
  });
  const spec:RoadVehicleSpec={
    id:kind,name:motorcycle?'自绘摩托':'自绘汽车',en:kind.toUpperCase(),
    mode:motorcycle?'bike':'wheeled',kernel:motorcycle?'K02':'K03',archetype:motorcycle?'bike':'rover',
    color:'#eeeeee',spawn:[0,0,0],yaw:0,
    speed:(motorcycle?150:160)/3.6,maxSpeed:(motorcycle?180:200)/3.6,reverseSpeed:motorcycle?2:8.4,
    accel:motorcycle?12:10,grip:motorcycle?13:11,steer:motorcycle?1.12:1,
    radius:motorcycle?.85:1.65,seat:motorcycle?[0,1.135,-.2]:[0,1.1,0],camera:motorcycle?6.8:8.2,
    ...(motorcycle?{characterPose:'ride' as const}:{}),
    hint:'W/S 油门与制动 · A/D 转向 · Shift 加速 · Space 制动 · F 上下车',
    envelope:motorcycle?{kind:'box',halfExtents:[.65,1.2,1.65],offset:[0,1.2,0]}:
      {kind:'box',halfExtents:[1.35,.99,2.15],offset:[0,1.31,0]},
    wheelPhysics:{...physics,wheels:wheelLayout(physics),wheelWidth:physics.wheelWidth??.4,
      powertrain:structuredClone(physics.powertrain??{...DEFAULT_POWERTRAIN,boostTorqueMultiplier:3})},
  };
  return {...defaultMovementSettings(spec.mode,spec),...spec};
}
