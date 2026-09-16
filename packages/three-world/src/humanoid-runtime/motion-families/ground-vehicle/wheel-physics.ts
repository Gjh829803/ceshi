import {fitRoadCabin,fitRoadBodyParts} from './road-cabin';
import type {SolverSample} from '../../solver-sample';
import { Euler,Quaternion,Vector3 } from 'three';
import { vehicleBody,type EnvironmentQueries } from '../../environment/queries';
import { createPowertrain,DEFAULT_POWERTRAIN,stepPowertrain,validatePowertrain,type PowertrainConfig,type PowertrainState } from '../../powertrain';
import type { Input,VehicleState } from '../../simulation';

/** 自有简化轮胎模型：米、秒、千克。只在训练固定步中积分，不另建物理世界。 */
export interface WheelLayout {x:number;z:number;steering:boolean;driven:boolean}
/** centerOfMassHeight：相对模型原点的米数；tireFriction：地面摩擦倍率；steeringGripRatio：汽车转向轴抓地比例（默认 0.85）。 */
/** coastBrakeDeceleration：松油门时附加轮端制动，单位 m/s²，范围 0～5；省略或 0 关闭，不影响主动制动和腾空运动。 */
export interface WheelPhysicsConfig {coastBrakeDeceleration?:number;bodyParts?:import('../../config').CollisionEnvelope[];cabin?:import('../../config').CollisionEnvelope;chassis?:import('../../config').CollisionEnvelope;steeringGripRatio?:number;centerOfMassHeight?:number;tireFriction?:number;wheels?:WheelLayout[];balanceAssist?:boolean;mass:number;radius:number;halfTrack:number;halfWheelbase:number;hubHeight:number;maxRaise?:number;maxDrop?:number;wheelWidth?:number;powertrain?:PowertrainConfig}
export interface SimulatedWheel {hubHeight?:number;contact:boolean;length:number;load:number;steer:number;angle:number;omega:number;slip:number;force:number}
export interface WheelPhysicsState {sample?:SolverSample;angularVelocity:Vector3;wheels:SimulatedWheel[];powertrain:PowertrainState}
export function createWheelPhysics(c?:WheelPhysicsConfig):WheelPhysicsState{return {angularVelocity:new Vector3(),powertrain:createPowertrain(c?.powertrain),wheels:Array.from({length:c?wheelLayout(c).length:4},()=>({hubHeight:c?.hubHeight??.52,contact:false,length:.25,load:0,steer:0,angle:0,omega:0,slip:0,force:0}))};}
export function validateWheelPhysics(c:WheelPhysicsConfig):void{if(c.coastBrakeDeceleration!==undefined&&(!Number.isFinite(c.coastBrakeDeceleration)||c.coastBrakeDeceleration<0||c.coastBrakeDeceleration>5))throw new Error("VEHICLE_WHEEL_CONFIG_INVALID:coastBrakeDeceleration");if(c.bodyParts&&(c.chassis||c.cabin||c.bodyParts.length===0||c.bodyParts.length>32||c.bodyParts.some(b=>b.kind!=='box'||b.halfExtents.some(n=>!Number.isFinite(n)||n<=0)||b.offset.some(n=>!Number.isFinite(n)))))throw new Error('VEHICLE_BODY_PARTS_CONFIG_INVALID');if(c.cabin&&(c.chassis||c.cabin.kind!=='box'||c.cabin.halfExtents.some(n=>!Number.isFinite(n)||n<=0)||c.cabin.offset.some(n=>!Number.isFinite(n))||c.cabin.offset[1]-c.cabin.halfExtents[1]<1.0))throw new Error('VEHICLE_CABIN_CONFIG_INVALID');if(c.chassis&&(c.chassis.kind!=='box'||c.chassis.halfExtents.some(n=>!Number.isFinite(n)||n<=0)||c.chassis.offset.some(n=>!Number.isFinite(n))))throw new Error('VEHICLE_CHASSIS_CONFIG_INVALID');for(const k of ['mass','radius','halfTrack','halfWheelbase','hubHeight'] as const){const v=c[k];if(!Number.isFinite(v)||v<=0)throw new Error(`VEHICLE_WHEEL_CONFIG_INVALID:${k}`);}for(const [name,value,max] of [['steeringGripRatio',c.steeringGripRatio,1],['centerOfMassHeight',c.centerOfMassHeight,3],['tireFriction',c.tireFriction,3],['maxRaise',c.maxRaise,.24],['maxDrop',c.maxDrop,.4],['wheelWidth',c.wheelWidth,1]] as const)if(value!==undefined&&(!Number.isFinite(value)||value<=0||value>max))throw new Error('VEHICLE_WHEEL_CONFIG_INVALID:'+name);if(c.mass<100||c.radius<.1||c.radius>2||c.halfTrack<.2||c.halfWheelbase<.4)throw new Error('VEHICLE_WHEEL_CONFIG_INVALID');if(c.wheels){if(c.wheels.length<2||c.wheels.length>12||c.wheels.some(w=>!Number.isFinite(w.x)||!Number.isFinite(w.z)||typeof w.steering!=="boolean"||typeof w.driven!=="boolean")||!c.wheels.some(w=>w.driven)||new Set(c.wheels.map(w=>`${w.x}:${w.z}`)).size!==c.wheels.length)throw new Error("VEHICLE_WHEEL_LAYOUT_INVALID");}if(c.balanceAssist!==undefined&&typeof c.balanceAssist!=="boolean")throw new Error("VEHICLE_WHEEL_BALANCE_INVALID");if(c.powertrain)validatePowertrain(c.powertrain);}
export function wheelLayout(c:WheelPhysicsConfig):WheelLayout[]{return c.wheels??[-c.halfTrack,c.halfTrack].flatMap(x=>[-c.halfWheelbase,c.halfWheelbase].map(z=>({x,z,steering:z>0,driven:true})));}
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const Y=new Vector3(0,1,0),restLength=.25;

export function stepWheelVehicle(v:VehicleState,input:Input,dt:number,q:EnvironmentQueries):void{
  const c=v.spec.wheelPhysics!,state=v.motion.wheelPhysics!,engine=c.powertrain??DEFAULT_POWERTRAIN;
  if(dt<=0)return;
  const layout=wheelLayout(c),wheelCount=layout.length,drivenCount=layout.filter(w=>w.driven).length;
  const raise=c.maxRaise??.1,drop=c.maxDrop??.1,minLength=restLength-raise,maxLength=restLength+drop;
  const envelope=vehicleBody(v.spec),width=envelope.kind==='box'?envelope.halfExtents[0]:c.halfTrack+.25,length=envelope.kind==='box'?envelope.halfExtents[2]:c.halfWheelbase+.5,height=envelope.kind==='box'?envelope.offset[1]+envelope.halfExtents[1]:2.2;
  const comHeight=c.centerOfMassHeight??(c.balanceAssist?.85:.65);
  const rig=q.vehicleRig(v.spec.id,state,v.position,v.rotation,c.mass,width,length,height,comHeight,c.bodyParts?c.bodyParts.map(body=>({body})):c.chassis?[{body:c.chassis}]:undefined),body=rig.body;
  if(c.bodyParts)fitRoadBodyParts(rig,c.bodyParts);
  if(c.cabin)fitRoadCabin(rig,c.cabin);
  body.setTranslation(v.position,true);body.setRotation(v.rotation,true);body.setLinvel(v.velocity,true);body.setAngvel(state.angularVelocity,true);
  rig.beforeStep=(h:number)=>{
    state.sample={physicsStepSequence:q.physicsStepSequence+1,phase:'pre-integration',deltaSeconds:h};
    const up=Y.clone().applyQuaternion(v.rotation),down=up.clone().negate();
    const forward=new Vector3(0,0,1).applyQuaternion(v.rotation),comLocal=new Vector3(0,comHeight,0),com=comLocal.clone().applyQuaternion(v.rotation).add(v.position);
    const velocityForward=v.velocity.dot(forward),water=q.waterAt(v.position);
    v.submerged=!!water&&v.position.y<water.surface-.1;
    const steerTarget=input.steer,steerRate=Math.abs(steerTarget)>.01?v.spec.steeringResponse:v.spec.steeringReturn;
    // 高速只平滑舵角的变化速率，最终仍到达完整机械舵角，避免瞬间反打激发偏航振荡。
    const steeringResponse=steerRate/(c.balanceAssist?1:1+Math.abs(velocityForward)/20);
    v.steering+=(steerTarget-v.steering)*(1-Math.exp(-steeringResponse*h));v.throttle=v.submerged?0:input.forward;
    stepPowertrain(state.powertrain,engine,{pedal:v.throttle,brake:input.brake,boost:input.boost,speed:velocityForward,
      wheelOmega:state.wheels.reduce((sum,w,i)=>sum+(layout[i]!.driven?w.omega:0),0)/drivenCount,roadWheelOmega:velocityForward/c.radius,grounded:state.wheels.some(w=>w.contact),
      slipping:state.wheels.some(w=>w.contact&&Math.abs(w.slip)>Math.max(2,Math.abs(velocityForward)*.3)),
      speedLimit:input.forward<0||state.powertrain.targetGear<0?v.spec.reverseSpeed:input.boost?v.spec.maxSpeed:v.spec.speed},h);
    // 仅显式启用的车型在松油门时增加轮端阻力；随油门回落渐入，仍由轮胎接触和摩擦上限解算。
    const coastBrake=Math.abs(input.forward)<.001&&!input.brake&&!state.powertrain.directionBraking
      ?(c.coastBrakeDeceleration??0)*(1-state.powertrain.throttle):0;
    const force=new Vector3(),torque=new Vector3();
    // 汽车方向输入使用完整机械舵角，不按车速缩小；实际转弯由逐轮摩擦和车身受力决定。
    // 两轮骑乘继续使用原有转向与平衡模型。
    const lowSpeedSteer=Math.min(.65,.5*v.spec.steer);
    const steerLimit=c.balanceAssist?Math.min(.65,.5*v.spec.steer/(1+Math.abs(velocityForward)/18)):lowSpeedSteer;
    const centralSteer=-v.steering*steerLimit;
    const wheelInertia=.5*25*c.radius*c.radius,stiffness=c.mass/wheelCount*(2*Math.PI*2.2)**2,damping=2*Math.sqrt(stiffness*c.mass/wheelCount)*.8;
    let index=0;
    for(const {x,z,steering,driven} of layout){
      const w=state.wheels[index++]!;
      const mount=new Vector3(x,c.hubHeight+restLength,z).applyQuaternion(v.rotation).add(v.position);
      // 内外轮转角不同；查询形状、压缩限位和显示使用同一转角。
      w.steer=steering&&Math.abs(centralSteer)>1e-5?Math.atan(2*c.halfWheelbase/(2*c.halfWheelbase/Math.tan(centralSteer)-x)):0;
      const localRotation=new Quaternion().setFromAxisAngle(Y,w.steer).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.PI/2));
      const wheelRotation=v.rotation.clone().multiply(localRotation);
      const hit=q.wheelSweep(mount,wheelRotation,down,c.radius,c.wheelWidth??.4,maxLength);
      w.contact=!!hit;
      w.length=w.contact?clamp(hit!.distance,minLength,maxLength):maxLength;
      const point=mount.clone().addScaledVector(down,w.length+c.radius),arm=point.clone().sub(com);
      const correctionSpeed=w.contact?Math.min(.6,Math.max(0,minLength-hit!.distance)*.15/h):0;
      let pointVelocity=state.angularVelocity.clone().cross(arm).add(v.velocity),stopLoad=0;
      if(w.contact&&hit!.distance<minLength){
        // 压缩限位只沿悬架轴传递冲量，避免把轮胎当作刚性斜坡把水平动能弹向上方。
        const localArm=arm.clone().applyQuaternion(v.rotation.clone().invert());
        const inverseMass=1/c.mass+localArm.z**2/(c.mass*(4*length*length+1)/12)+localArm.x**2/(c.mass*(4*width*width+1)/12);
        // 限位冲量沿悬架轴施加，速度约束也必须取同一轴；棱边法线会把前进速度误当压缩速度。
        const impulse=Math.max(0,(correctionSpeed-pointVelocity.dot(up))/inverseMass);
        stopLoad=impulse/h;
        body.applyImpulseAtPoint(up.clone().multiplyScalar(impulse),point,true);
        const linear=body.linvel(),angular=body.angvel();v.velocity.set(linear.x,linear.y,linear.z);state.angularVelocity.set(angular.x,angular.y,angular.z);
        pointVelocity=state.angularVelocity.clone().cross(arm).add(v.velocity);
      }
      // 保留连续坡面的行程变化；压缩阻尼以轴向下压与受限的穿透纠偏为上限，不能放大棱边的水平冲击。
      const suspensionSpeed=w.contact?Math.max(pointVelocity.dot(hit!.normal)/Math.max(.3,hit!.normal.dot(up)),Math.min(0,pointVelocity.dot(up)-correctionSpeed)):0;
      const springLoad=w.contact?clamp(c.mass*9.81/wheelCount+stiffness*(restLength-w.length)-damping*suspensionSpeed,0,c.mass*9.81):0;
      // 限位也承受轮载，必须参与轮胎摩擦；它已作为冲量作用于车身，不再重复施加弹簧力。
      w.load=springLoad+stopLoad;
      const normal=w.contact?hit!.normal:up;
      const spring=up.clone().multiplyScalar(springLoad);force.add(spring);torque.add(arm.clone().cross(spring));
      const tangent=new Vector3(Math.sin(w.steer),0,Math.cos(w.steer)).applyQuaternion(v.rotation);tangent.addScaledVector(normal,-tangent.dot(normal)).normalize();
      const right=normal.clone().cross(tangent).normalize();
      const longitudinal=pointVelocity.dot(tangent),lateral=pointVelocity.dot(right);
      const brakeCapacity=(input.brake||state.powertrain.directionBraking?c.mass*v.spec.brakeDeceleration/wheelCount*c.radius:0)+w.load*(engine.rollingResistance+coastBrake/9.81)*c.radius;
      // 汽车转向轴保留较低的摩擦上限，让后轴仍有稳定余量，避免连续反打时四轮同时饱和。
      const grip=w.load*(hit?.friction??.85)*(c.tireFriction??1)*(input.brake&&z<0?.45:1)*(steering&&!c.balanceAssist?(c.steeringGripRatio??.85):1);
      // 简化牵引力控制：接地轮的驱动扭矩不超过当前摩擦可传递的扭矩，避免加速键只制造空转。
      const requestedDrive=driven?state.powertrain.axleTorque/drivenCount:0;
      // 大转向时限制驱动扭矩，给侧向受力保留余量；直行与骑乘平衡保留原上限，低速限制逐渐减弱。
      // 这只是牵引分配，最终合力仍由同一个摩擦圆约束，不施加额外偏航力矩。
      const steeringDemand=Math.min(1,Math.abs(v.steering));
      const lateralReserve=c.balanceAssist?0:.8*steeringDemand*steeringDemand*Math.min(1,Math.abs(velocityForward)/15);
      const tractionBudget=grip*c.radius*.95*Math.sqrt(1-lateralReserve);
      const drive=w.contact?clamp(requestedDrive,-tractionBudget,tractionBudget):requestedDrive;
      const tireStiffness=c.mass*5;
      // 隐式求解纵向弹性，避免低速轮速与摩擦显式积分产生正负振荡。
      const denominator=wheelInertia+(w.contact?h*tireStiffness*c.radius*c.radius:0);
      const unbrakedOmega=(wheelInertia*w.omega+h*(drive+(w.contact?tireStiffness*c.radius*longitudinal:0)))/denominator;
      const brakeTorque=Math.sign(unbrakedOmega)*Math.min(brakeCapacity,Math.abs(unbrakedOmega)*denominator/h);
      const freeOmega=unbrakedOmega-h*brakeTorque/denominator;
      let fx=w.contact?tireStiffness*(freeOmega*c.radius-longitudinal):0;
      let fy=w.contact?-lateral*c.mass/wheelCount*v.spec.grip:0;
      const magnitude=Math.hypot(fx,fy),scale=magnitude>grip&&magnitude>0?grip/magnitude:1;fx*=scale;fy*=scale;
      w.omega=clamp(w.omega+(drive-brakeTorque-fx*c.radius)/wheelInertia*h,-220,220);
      if(!w.contact)w.omega*=Math.exp(-.4*h);
      w.angle+=w.omega*h;w.slip=w.omega*c.radius-longitudinal;w.force=fx;
      const tire=tangent.multiplyScalar(fx).addScaledVector(right,fy);force.add(tire);torque.add(arm.cross(tire));
    }
    // 骑手接地平衡辅助：施加滚转力矩而非直接改姿态；腾空或已经翻倒时不扶正。
    if(c.balanceAssist&&state.wheels.some(w=>w.contact)&&up.y>.45){
      const rollAxis=forward.clone(),rollRate=state.angularVelocity.dot(rollAxis);
      const currentRoll=Math.atan2(-up.dot(new Vector3(1,0,0).applyQuaternion(new Quaternion().setFromAxisAngle(Y,v.yaw))),up.y);
      const targetRoll=clamp(-Math.atan(velocityForward*velocityForward*Math.tan(centralSteer)/(2*c.halfWheelbase*9.81)),-.45,.45);
      const rollInertia=c.mass*(4*width*width+1)/12;
      torque.addScaledVector(rollAxis,rollInertia*((targetRoll-currentRoll)*70-rollRate*14));
    }
    // 空气阻力 = 1/2 ρ CdA v²；不再把整车质量作为空气阻力系数。
    force.addScaledVector(v.velocity,-.5*1.225*engine.dragArea*v.velocity.length());
    body.resetForces(false);body.resetTorques(false);body.addForce(force,true);body.addTorque(torque,true);
  };
  rig.afterStep=()=>{
    if(v.motion.atv){v.motion.atv.steeringAngle=-v.steering*Math.min(.65,.5*v.spec.steer);v.motion.atv.wheelSteers=state.wheels.map(w=>w.steer);v.motion.atv.wheelAngles=state.wheels.map(w=>w.angle);v.motion.atv.suspension=state.wheels.map(w=>restLength-w.length);}
    const p=body.translation(),r=body.rotation(),linear=body.linvel(),angular=body.angvel();
    // Rapier 的单精度姿态回写为单位四元数，避免 Three 将误差当成缩放并反复重建相机碰撞网格。
    v.position.set(p.x,p.y,p.z);v.rotation.set(r.x,r.y,r.z,r.w).normalize();v.velocity.set(linear.x,linear.y,linear.z);state.angularVelocity.set(angular.x,angular.y,angular.z);
    const angles=new Euler().setFromQuaternion(v.rotation,'YXZ');v.yaw=angles.y;v.pitch=-angles.x;v.roll=angles.z;
    v.grounded=state.wheels.some(w=>w.contact);v.speed=v.velocity.length();
  };
}

/** 新增轮式主体时显式选择模板，再覆盖与模型相符的尺寸和质量。 */
export function createRoadPhysicsProfile(kind:'car'|'motorcycle',overrides:Partial<WheelPhysicsConfig>={}):WheelPhysicsConfig {
  const defaults:WheelPhysicsConfig=kind==='motorcycle'?{
    mass:260,radius:.48,hubHeight:.48,halfTrack:.3,halfWheelbase:1.1,wheelWidth:.28,maxRaise:.055,maxDrop:.065,balanceAssist:true,
    wheels:[{x:0,z:-1.1,steering:false,driven:true},{x:0,z:1.1,steering:true,driven:false}],
    powertrain:{idleRpm:1200,maxRpm:10500,upshiftRpm:9000,downshiftRpm:3200,torqueCurve:[[1200,24],[3500,48],[6500,65],[9000,58],[10500,42]],forwardRatios:[2.8,2.1,1.6,1.3,1.1,.95],reverseRatio:2.8,finalDrive:5.5,efficiency:.9,shiftSeconds:.22,engineBrakeTorque:12,dragArea:.55,rollingResistance:.018,boostTorqueMultiplier:1.6}
  }:{mass:1600,radius:.52,hubHeight:.52,halfTrack:1.1,halfWheelbase:1.27,maxRaise:.025,maxDrop:.025,wheelWidth:.4};
  const result=structuredClone({...defaults,...overrides});if(kind==='motorcycle'&&!overrides.wheels)result.wheels=[{x:0,z:-result.halfWheelbase,steering:false,driven:true},{x:0,z:result.halfWheelbase,steering:true,driven:false}];validateWheelPhysics(result);return result;
}
