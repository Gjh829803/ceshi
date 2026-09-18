import {ATV_POWERTRAIN} from '../powertrains';
import type {VehicleSpec} from '../../config';
import { getSharedControlDefaults } from '../../control/defaults';
export const ATV_SPEC:VehicleSpec={
 id:'atv',controlProfileId:'preset.atv',name:'全地形车',en:'QUAD ATV',mode:'wheeled',archetype:'atv',kernel:'K01',color:'#bc3543',
 spawn:[-212,0,64],yaw:0,...getSharedControlDefaults('atv')!,
 radius:1.48,seat:[0,1,-.15],characterPose:'atv',wheelbaseMeters:1.6,rearAxleZMeters:-.8,
 wheelPhysics:{chassis:{kind:'box',halfExtents:[.85,.5,1.2],offset:[0,.88,0]},mass:360,radius:.39,halfTrack:.7,halfWheelbase:.8,hubHeight:.39,centerOfMassHeight:.25,tireFriction:1.4,maxRaise:.03,maxDrop:.04,wheelWidth:.28,wheels:[{x:.7,z:.8,steering:true,driven:true},{x:-.7,z:.8,steering:true,driven:true},{x:.7,z:-.8,steering:false,driven:true},{x:-.7,z:-.8,steering:false,driven:true}],powertrain:ATV_POWERTRAIN},
  envelope:{kind:'box',halfExtents:[.91,.71,1.25],offset:[0,.71,0]},
 hint:'W 前进 · S 制动后倒车 · A / D 转向 · Shift 加速 · Space 手刹 · F 上下车 · T 视角',
};
export const ATV_SOCKETS={
 'seat.driver':[0,1,-.15],'seat.passenger':[0,1,-.68],
 'control.foot.left':[.420507,.309005,.012058],'control.foot.right':[-.420509,.309004,.012058],
 'entry.left':[1.35,.025,-.15],'entry.right':[-1.35,.025,-.15],'camera.driver':[.000542,1.633,.080046],
} satisfies Record<string,[number,number,number]>;
