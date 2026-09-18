import {BUS_POWERTRAIN} from '../powertrains';
import type {VehicleSpec} from '../../config';
import { getSharedControlDefaults } from '../../control/defaults';

/** Reference-inspired 5.8 m minibus; +Z forward, metres and seconds. */
export const BUS_SPEC:VehicleSpec={
  id:'bus',name:'复古小巴',en:'MINIBUS',mode:'bus',archetype:'bus',kernel:'K15',color:'#83c7bb',
  spawn:[-226,0,64],yaw:0,...getSharedControlDefaults('bus')!,
  wheelbaseMeters:3.3,rearAxleZMeters:-1.45,
  radius:2.15,seat:[.47,1.13,1.38],
  hint:'W 油门 · S 制动后倒车 · A / D 转向 · Space 刹车 · F 上下车 · T 切换视角',
  wheelPhysics:{chassis:{kind:'box',halfExtents:[1.14,1.21,2.96],offset:[0,1.44,0]},mass:3400,radius:.46,halfTrack:1.035,halfWheelbase:1.65,hubHeight:.46,centerOfMassHeight:.8,maxRaise:.1,maxDrop:.15,wheelWidth:.22,wheels:[{x:-1.035,z:-1.45,steering:false,driven:true},{x:-1.035,z:1.85,steering:true,driven:false},{x:1.035,z:-1.45,steering:false,driven:true},{x:1.035,z:1.85,steering:true,driven:false}],powertrain:BUS_POWERTRAIN},
  envelope:{kind:'box',halfExtents:[1.22,1.34,2.96],offset:[0,1.34,0]},
};
