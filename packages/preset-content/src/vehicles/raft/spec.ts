import type {VehicleSpec} from '../../config';
import { getSharedControlDefaults } from '../../control/defaults';
export const RAFT_SPEC:VehicleSpec={id:'raft',controlProfileId:'preset.raft',name:'橡皮艇',en:'INFLATABLE BOAT',mode:'paddled_boat',archetype:'raft',kernel:'K17',color:'#343b40',
 spawn:[201,-1.88,-176],yaw:Math.PI/2,...getSharedControlDefaults('raft')!,radius:1.15,seat:[0,.45,-.45],characterPose:'paddling',
 hint:'W 划桨 · S 倒划 · A / D 换侧转向 · Shift 快划 · Space 压桨/拖地制动 · F 上下艇 · T 视角',
 bodyPhysics:{kind:'paddle',mass:160,centerOfMassHeight:0.22,restitution:.36,water:{displacement:.55,depth:.50,bottom:.32,damping:6}},
  envelope:{kind:'box',halfExtents:[.84,.34,2.15],offset:[0,0,0]}};
export const RAFT_SOCKETS={
 'seat.driver':[0,.45,-.45],'seat.passenger.1':[0,.45,.85],'seat.passenger.2':[0,.45,-1.25],
 'entry.left':[1.4,.05,-.45],'entry.right':[-1.4,.05,-.45],'camera.driver':[0,1.08,-.30],
 'control.foot.left':[.123174,.389302,.521320],'control.foot.right':[-.122625,.391087,.496006],
} satisfies Record<string,[number,number,number]>;
