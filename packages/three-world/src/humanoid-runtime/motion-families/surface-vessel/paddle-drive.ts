import {Vector3} from 'three';
import type {EnvironmentQueries} from '../../environment/queries';
import type {Input,VehicleState} from '../../simulation';
import {CANOE_WATER,KAYAK_WATER,advancePaddleStroke,paddleYawAcceleration,kayakStroke} from './paddling';
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
/** 皮艇、木舟、橡皮艇的桨叶驱动；机动船不调用此函数。 */
export function stepPaddleDrive(v:VehicleState,i:Input,h:number,q:EnvironmentQueries,c:{afloat:boolean;immersion:number;buoyancy:number;mass:number;speed:number;yawInertia:number}){
 const k=v.motion.kayak!,s=v.spec,canoe=k.craft==='canoe',period=v.motion.raft&&i.boost?.85:canoe?CANOE_WATER.strokePeriod:KAYAK_WATER.strokePeriod;
 k.surface=q.waterAt(v.position)?.surface??null;k.immersion=c.immersion;k.buoyancy=c.buoyancy;k.turn=v.steering;k.brake=i.brake?1:0;
 k.effort+=( (c.afloat&&!i.brake?Math.max(Math.abs(i.forward),Math.abs(i.steer)):0)-k.effort)*(1-Math.exp(-7*h));
 if(Math.abs(i.forward)>.01)k.reverse=Math.sign(i.forward);
 const {blade,switching}=advancePaddleStroke(v,i,h,q,period);
 const stroke=kayakStroke(k),water=q.waterAt(blade);
 k.bladeImmersion=water?clamp((water.surface-blade.y)/.1,0,1):0;
 const pulse=c.afloat&&!k.blocked&&!switching?stroke.power*k.bladeImmersion:0;
 const direction=Math.sign(i.forward),paddleForce=c.mass*s.accel*pulse*(v.motion.raft&&i.boost?1.2:1);
 const forward=new Vector3(Math.sin(v.yaw),0,Math.cos(v.yaw));
 const force=forward.clone().multiplyScalar(paddleForce*(direction||k.reverse));
 const arm=blade.clone().sub(v.position),moment=arm.cross(force).y;
 // 无前进输入时采用扫桨：船体水阻抵消净推进，桨侧及倒划方向仍决定转矩。
 const yawAcceleration=c.afloat?paddleYawAcceleration(v,moment,c.yawInertia,pulse,direction)-v.motion.body!.angularVelocity.y*(canoe?.85:1.15):v.grounded?-v.motion.body!.angularVelocity.y*8:0;
 const resistance=c.immersion>0?s.coastDeceleration+Math.abs(c.speed)*s.dragQuadratic:v.grounded?(v.motion.raft?.32:5):0;
 const deceleration=Math.abs(c.speed)*(resistance+(i.brake&&c.afloat?s.brakeDamping*k.bladeImmersion:0));
 const driveForce=paddleForce*direction-Math.sign(c.speed)*Math.min(Math.abs(c.speed)/h,deceleration)*c.mass;
 v.motion.body!.effort=pulse;v.motion.body!.cadence=k.effort>.005?60/period:0;v.throttle=direction*pulse;
 return {driveForce,yawAcceleration,pitch:direction*pulse*.025,roll:-stroke.side*pulse*.035-v.motion.body!.angularVelocity.y*c.speed*.018};
}
