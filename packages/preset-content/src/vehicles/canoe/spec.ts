import type {VehicleSpec} from '../../config';
import { getSharedControlDefaults } from '../../control/defaults';
/** Single-blade craft uses the shared paddle/buoyancy owner with its canoe profile. */
export const CANOE_SPEC:VehicleSpec={id:'canoe',name:'单桨木舟',en:'CANOE',mode:'paddled_boat',archetype:'canoe',kernel:'K17',color:'#95643a',
 spawn:[205,-1.888,-140.5],yaw:Math.PI/2,...getSharedControlDefaults('canoe')!,radius:.7,seat:[0,.45,-.45],characterPose:'paddling',
 hint:'W 单侧划桨 · S 倒划 · A / D 换侧扫桨转向 · Space 压桨减速 · F 上下舟 · T 切换视角',
 bodyPhysics:{kind:'paddle',mass:165,centerOfMassHeight:0.22,water:{displacement:.38,depth:.48,bottom:.32,damping:6}},
  envelope:{kind:'box',halfExtents:[.60,.34,2.4],offset:[0,.10,0]}};
