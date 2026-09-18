import type {VehicleSpec} from './config';
import {defaultMovementSettings} from '../config/control';
import {AIRCRAFT} from '../config/aircraft';
export type AircraftKind='plane';
export interface AircraftSpec extends VehicleSpec {
  /** Read-only authoring reference, not per-instance physics overrides. The existing solver uses AIRCRAFT. */
  readonly airframe:typeof AIRCRAFT;
}
/** Model-free light fixed wing. Metres, kilograms, seconds; +Y up, +Z forward. */
export function createAircraftSpec(kind:AircraftKind):AircraftSpec {
  if(kind!=='plane')throw new Error('VEHICLE_AIRCRAFT_KIND_INVALID');
  const spec:AircraftSpec={id:'plane',name:'自绘固定翼飞机',en:'PLANE',mode:'plane',kernel:'K09',archetype:'plane',
    color:'#eeeeee',spawn:[0,0,0],yaw:0,speed:58,accel:12,grip:1,steer:1.05,
    radius:2,seat:[0,1.3,.1],
    hint:'W / S 增减油门 · Q / E 低头 / 抬头 · A / D 转向 · Ctrl 减油门 / 地面制动 · Shift 辅助加油门 · Space 地面制动 · F 上下机',
    envelope:{kind:'box',halfExtents:[4.2,1.25,3.35],offset:[0,1.25,0]},
    airframe:structuredClone(AIRCRAFT),
  };
  return {...defaultMovementSettings(spec.mode,spec),...spec};
}
