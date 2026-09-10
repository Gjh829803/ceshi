import {Euler,Quaternion,Vector3} from 'three';
import type {Input,VehicleState} from './simulation';
import {vehicleBody,type EnvironmentQueries} from './environment/queries';
import {createPowertrain,stepPowertrain,validatePowertrain,type PowertrainConfig,type PowertrainState} from './powertrain';
import {finishUnicycleStep,UNICYCLE_GEOMETRY} from './unicycle';
import {kayakStroke,kayakPaddlePose,paddleBlade,paddleRiderBody,KAYAK_WATER,CANOE_WATER} from './kayak';
import {finishJetSkiStep} from './jetski';
import {finishSubmersibleStep} from './submersible';
import {tankBarrel,TANK_CONTROLS,TANK_GEOMETRY} from './tank';
import {motionForces,type MotionIntent} from './vehicle-motion-forces';
import {creatureBodies} from './creatures/controller';

/** SI units. These controllers supply forces to the existing vehicle rigid rig;
 * EnvironmentQueries.stepPhysics remains the sole integrator. */
export interface BodyPhysicsConfig {
  kind:'unicycle'|'sled'|'paddle'|'tracks'|'jet'|'submersible'|'motion';
  mass:number;centerOfMassHeight:number;
  friction?:number;restitution?:number;
  /** Effective driven wheel/track/propulsor radius, in metres. */
  driveRadius?:number;powertrain?:PowertrainConfig;
  /** Displaced volume m³, immersion depth m, bottom below root m, heave damping s⁻¹. */
  water?:{displacement:number;depth:number;bottom:number;damping:number};
}
export interface BodyPhysicsState {
  riderMounted:boolean;
  angularVelocity:Vector3;powertrain:PowertrainState|undefined;
  effort:number;cadence:number;mass:number;contactCount:number;elapsed:number;
}
export const createBodyPhysics=(c:BodyPhysicsConfig):BodyPhysicsState=>({riderMounted:false,angularVelocity:new Vector3(),powertrain:c.powertrain?createPowertrain(c.powertrain):undefined,effort:0,cadence:0,mass:c.mass,contactCount:0,elapsed:0});
export function validateBodyPhysics(c:BodyPhysicsConfig):void {
  const fail=()=>{throw new Error('VEHICLE_BODY_PHYSICS_CONFIG_INVALID');};
  if(!['unicycle','sled','paddle','tracks','jet','submersible','motion'].includes(c.kind)||!Number.isFinite(c.mass)||c.mass<20||!Number.isFinite(c.centerOfMassHeight)||Math.abs(c.centerOfMassHeight)>5)fail();
  if(c.friction!==undefined&&(!Number.isFinite(c.friction)||c.friction<0||c.friction>2))fail();
  if(c.restitution!==undefined&&(!Number.isFinite(c.restitution)||c.restitution<0||c.restitution>1))fail();
  if(c.powertrain){validatePowertrain(c.powertrain);if(!c.driveRadius||!Number.isFinite(c.driveRadius)||c.driveRadius<.05)fail();}
  if(['tracks','jet','submersible'].includes(c.kind)&&!c.powertrain)fail();
  if(['paddle','jet','submersible'].includes(c.kind)&&!c.water)fail();
  if(c.water&&Object.values(c.water).some(n=>!Number.isFinite(n)||n<=0))fail();
}
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const blend=(a:number,b:number,k:number,h:number)=>a+(b-a)*(1-Math.exp(-k*h));

export function stepBodyVehicle(v:VehicleState,input:Input,dt:number,time:number,q:EnvironmentQueries,intent?:MotionIntent):void {
  if(dt<=0)return;
  const c=v.spec.bodyPhysics!,state=v.bodyPhysics!,e=v.spec.envelope;
  const parts:{body:ReturnType<typeof vehicleBody>;rotation?:Quaternion}[]=[{body:vehicleBody(v.spec)}];
  if(v.tank){const barrel=tankBarrel({...v,position:new Vector3(),rotation:new Quaternion()});parts.push({body:{...barrel.body,offset:new Vector3(...barrel.body.offset).applyQuaternion(barrel.rotation).add(barrel.position).toArray()},rotation:barrel.rotation});}
  if(c.kind==='paddle')parts.push({body:paddleRiderBody(v.spec.seat)});
  if(c.kind==='motion'&&v.spec.mode==='carriage'){
    const lead=creatureBodies(v)[1]!,inverse=v.rotation.clone().invert();
    parts.push({body:{...lead.body,offset:new Vector3(...lead.body.offset).applyQuaternion(lead.rotation).add(lead.position).sub(v.position).applyQuaternion(inverse).toArray()},rotation:inverse.multiply(lead.rotation)});
  }
  const rig=q.vehicleRig(v.spec.id,state,v.position,v.rotation,state.mass,e.halfExtents[0],e.halfExtents[2],e.offset[1]+e.halfExtents[1],c.centerOfMassHeight,parts,c.friction??.02,c.restitution??.08),body=rig.body;
  if(c.kind==='paddle')rig.colliders[parts.length-1]!.setEnabled(state.riderMounted);
  // Synchronise explicit reset/teleport once; substeps below only read the solver.
  const prior=body.translation();let relocated=new Vector3(prior.x,prior.y,prior.z).distanceToSquared(v.position)>.01;
  body.setTranslation(v.position,true);body.setRotation(v.rotation,true);body.setLinvel(v.velocity,true);body.setAngvel(state.angularVelocity,true);
  let h=dt,advanced=0,old=v.position.clone(),oldYaw=v.yaw,incoming=v.velocity.clone(),leadOffset:Vector3|undefined,leadAngle=0;
  const inertia=(mass:number)=>new Vector3(mass*(4*e.halfExtents[2]**2+1)/12,mass*(4*e.halfExtents[0]**2+4*e.halfExtents[2]**2)/12,mass*(4*e.halfExtents[0]**2+1)/12);
  rig.beforeStep=step=>{
    h=step;old=v.position.clone();oldYaw=v.yaw;incoming=v.velocity.clone();
    if(c.kind==='motion'){
      if(!intent)throw new Error('VEHICLE_MOTION_INTENT_MISSING');
      const result=motionForces(v,input,h,time-dt+advanced,q,state.mass,intent);
      if(v.creature?.leadPosition){
        const inverse=result.draftRotation.clone().invert();
        leadOffset=v.creature.leadPosition.clone().sub(result.draftPosition).applyQuaternion(inverse);
        leadAngle=v.creature.leadYaw!-result.draftYaw;
        const rotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),leadAngle);
        rig.colliders[1]!.setTranslationWrtParent(new Vector3(0,1.65,0).applyQuaternion(rotation).add(leadOffset));
        rig.colliders[1]!.setRotationWrtParent(rotation);
      }
      body.resetForces(true);body.resetTorques(true);body.addForce(result.force,true);body.addTorque(result.torque,true);
      state.effort=Math.abs(v.throttle);return;
    }
    const s=v.spec,f=new Vector3(Math.sin(v.yaw),0,Math.cos(v.yaw)),right=new Vector3(f.z,0,-f.x);
    const speed=v.velocity.dot(f),water=q.waterAt(v.position);
    const normals=relocated?[]:q.vehicleContactNormals(rig),contactNormal=normals.filter(n=>n.y>.45).sort((a,b)=>b.y-a.y)[0];
    const normal=contactNormal?(q.support(v.position,3,.15)?.normal??contactNormal):undefined;
    v.grounded=!!normal;state.contactCount=normals.length;
    v.steering=blend(v.steering,input.steer,Math.abs(input.steer)>.01?s.steeringResponse:s.steeringReturn,h);
    const force=new Vector3(),torque=new Vector3();
    let immersion=0,wet=0,buoyancy=0,mass=c.mass,pitch=0,roll=0,yawTarget=0,yawAcceleration:number|undefined;
    if(c.water){
      for(const x of [-e.halfExtents[0]*.65,e.halfExtents[0]*.65])for(const z of [-e.halfExtents[2]*.6,e.halfExtents[2]*.6]){
        const p=new Vector3(x,0,z).applyQuaternion(v.rotation).add(v.position),w=q.waterAt(p);
        if(w){wet++;immersion+=clamp((w.surface-p.y+c.water.bottom)/c.water.depth,0,1)/4;}
      }
      if(v.submersible){const k=v.submersible;k.surface=water?.surface??null;k.depth=water?Math.max(0,water.surface-v.position.y):0;
        if(input.lift<-.01&&wet>=2)k.diving=true;if(input.lift>.01&&k.depth<.5)k.diving=false;
        k.ballast=blend(k.ballast,k.diving?1:0,1.5,h);mass=c.mass+(c.water.displacement*1000-c.mass)*k.ballast;k.mass=mass;
      }
      buoyancy=9.81*1000*c.water.displacement*immersion/mass;
      force.y+=mass*(buoyancy-(v.submersible?s.verticalDamping:c.water.damping)*immersion*v.velocity.y);
    }
    if(Math.abs(state.mass-mass)>1e-6){state.mass=mass;const j=inertia(mass);body.setAdditionalMassProperties(mass,{x:0,y:c.centerOfMassHeight,z:0},j,new Quaternion(),true);}
    const afloat=wet>=2&&immersion>.08&&!v.grounded;
    v.submerged=!!water&&v.position.y<water.surface-(c.kind==='submersible'?.65:c.kind==='jet'?.45:.4);
    const dryGround=v.grounded&&!(water&&v.position.y<water.surface-.05);
    const engineActive=c.kind==='tracks'?dryGround:c.kind==='submersible'?wet>=2&&immersion>.08:afloat;
    let driveForce=0;
    if(state.powertrain&&c.powertrain){
      const pivot=c.kind==='tracks'&&Math.abs(input.forward)<.01?Math.abs(input.steer):0;
      const roadOmega=(speed+pivot*Math.abs(state.angularVelocity.y)*TANK_GEOMETRY.trackHalfSpacing)/(c.driveRadius!);
      stepPowertrain(state.powertrain,c.powertrain,{pedal:engineActive?(pivot||input.forward):0,brake:input.brake||c.kind==='submersible'&&input.boost,boost:input.boost&&c.kind!=='submersible',speed,wheelOmega:roadOmega,roadWheelOmega:roadOmega,grounded:engineActive,slipping:false,speedLimit:input.forward<0?s.reverseSpeed:input.boost?s.maxSpeed:s.speed},h);
      driveForce=engineActive?state.powertrain.axleTorque/c.driveRadius!:0;
      if(pivot)driveForce=0;
      v.throttle=state.powertrain.throttle*Math.sign(input.forward);state.effort=engineActive?state.powertrain.throttle:0;
    }else{state.effort=0;v.throttle=0;}
    const resist=(deceleration:number)=>-Math.sign(speed)*Math.min(Math.abs(speed)/h,Math.max(0,deceleration))*mass;
    let lateral=c.water?immersion>0?s.grip:v.grounded?7:0:dryGround?s.grip:0;
    if(c.kind==='paddle'){
      const k=v.kayak!,canoe=k.craft==='canoe',period=canoe?CANOE_WATER.strokePeriod:KAYAK_WATER.strokePeriod;
      k.surface=water?.surface??null;k.immersion=immersion;k.buoyancy=buoyancy;k.turn=v.steering;k.brake=input.brake?1:0;
      k.effort=blend(k.effort,afloat&&!input.brake?Math.max(Math.abs(input.forward),Math.abs(input.steer)):0,7,h);
      if(Math.abs(input.forward)>.01)k.reverse=Math.sign(input.forward);
      else if(Math.abs(input.steer)>.1)k.reverse=1;
      // +X is the rider's left. Forward sweeps turn away from the blade;
      // reverse sweeps turn toward it. Change sides during recovery only.
      if(canoe&&Math.abs(input.steer)>.1&&(k.phase%1<.2||k.effort<.05))k.side=Math.sign(input.steer)*k.reverse;
      if(k.effort>.005)k.phase+=h/(v.raft&&input.boost?.85:period);
      const stroke=kayakStroke(k),paddle=kayakPaddlePose(k),blade=paddleBlade(k,k.brake?1:stroke.side).applyQuaternion(paddle.rotation).add(paddle.position).applyQuaternion(v.rotation).add(v.position),w=q.waterAt(blade);
      k.bladeImmersion=w?clamp((w.surface-blade.y)/.1,0,1):0;
      const pulse=afloat?stroke.power*k.bladeImmersion:0,direction=Math.sign(input.forward);
      driveForce=mass*direction*s.accel*pulse*(v.raft&&input.boost?1.2:1);
      const resistance=immersion>0?s.coastDeceleration+Math.abs(speed)*s.dragQuadratic:v.grounded?(v.raft?.32:5):0;
      driveForce+=resist(Math.abs(speed)*(resistance+(input.brake&&afloat?s.brakeDamping*k.bladeImmersion:0)));
      yawAcceleration=afloat?-stroke.side*pulse*(k.reverse*Math.abs(v.steering)*s.steer+direction*(v.raft?.035:canoe?.20:.10))-state.angularVelocity.y*(canoe?.85:1.15):v.grounded?-state.angularVelocity.y*8:0;
      pitch=direction*pulse*.025;roll=-stroke.side*pulse*.035-state.angularVelocity.y*speed*.018;
      state.effort=pulse;state.cadence=k.effort>.005?60/(v.raft&&input.boost?.85:period):0;v.throttle=direction*pulse;
    }else if(c.kind==='jet'||c.kind==='submersible'){
      const brake=input.brake||state.powertrain!.directionBraking||c.kind==='submersible'&&input.boost;
      const drag=c.kind==='jet'?s.coastDeceleration+speed*speed*.0015:Math.abs(speed)*((Math.abs(input.forward)<.01?s.linearDamping:s.drag)+Math.abs(speed)*s.dragQuadratic);
      driveForce+=resist(immersion>0?(brake?s.brakeDeceleration:drag):v.grounded?6:0);
      if(v.jetski){const k=v.jetski;k.surface=water?.surface??null;k.immersion=immersion;k.buoyancy=buoyancy;k.steeringAngle=-v.steering*.42;
        yawTarget=afloat?-v.steering*s.steer*Math.min(1,Math.abs(speed)/4)*(.18+.82*Math.abs(v.throttle))*Math.sign(speed)/(1+Math.abs(speed)/24):0;
        pitch=afloat?Math.min(.11,Math.max(0,speed)*.004):0;roll=clamp(yawTarget*speed*.018,-.2,.2);if(afloat)force.y+=mass*Math.min(1.8,Math.abs(speed)*.08);
      }
      if(v.submersible){const k=v.submersible;k.immersion=immersion;k.buoyancy=buoyancy;
        yawTarget=engineActive?-v.steering*s.steer:0;pitch=engineActive?input.lift*.1:0;roll=engineActive?input.roll*.25:0;
        if(engineActive&&(input.lift<0||k.depth>.15))force.y+=mass*input.lift*s.verticalAcceleration;
        if(input.boost)force.y-=mass*v.velocity.y*s.brakeDamping;
        k.power=engineActive?Math.min(1,Math.abs(v.throttle)+Math.abs(input.lift)*.7+Math.abs(v.steering)*.35):0;k.rotorPhase+=k.power*28*h;
      }
    }else if(c.kind==='unicycle'){
      const u=v.unicycle!,resting=u.footDown>0||u.blockedSeconds>.25,brake=input.brake||input.forward*speed<-.08;
      if(dryGround){driveForce=resting||brake?resist(s.brakeDeceleration):Math.abs(input.forward)>.01?mass*input.forward*s.accel:resist(s.coastDeceleration);
        state.effort=!resting&&!brake?Math.abs(input.forward):0;v.throttle=Math.sign(input.forward)*state.effort;
        yawTarget=-v.steering*s.steer*Math.min(Math.abs(speed)/1.5,1)*Math.sign(speed);roll=clamp(v.steering*speed*.025,-.14,.14);
      }
      state.cadence=v.grounded?Math.abs(speed)/UNICYCLE_GEOMETRY.wheelRadius*60/(2*Math.PI):0;
    }else if(c.kind==='sled'){
      const k=v.sled!,brake=input.brake||input.forward<-.01,push=dryGround&&!brake&&input.forward>.01&&Math.abs(speed)<s.groundSpeed;
      k.push=blend(k.push,push?1:0,10,h);k.brake=blend(k.brake,brake?1:0,10,h);k.steer=v.steering;if(k.push>.01)k.phase+=h/.85;
      const pulse=push?Math.max(0,Math.sin(k.phase*Math.PI*2)):0;
      if(dryGround){driveForce=mass*s.accel*pulse+resist(s.coastDeceleration+s.dragQuadratic*speed*speed+(brake?s.brakeDeceleration:0)+Math.abs(v.steering)*.15);
        yawTarget=-v.steering*s.steer*Math.min(Math.abs(speed)/4,1)*Math.sign(speed);}
      state.effort=pulse;state.cadence=push?60/.85:0;v.throttle=pulse;
    }else if(c.kind==='tracks'){
      if(dryGround){driveForce+=resist(input.brake||state.powertrain!.directionBraking?s.brakeDeceleration:9.81*c.powertrain!.rollingResistance+.5*1.225*c.powertrain!.dragArea*speed*speed/mass);
        yawTarget=input.brake?0:-v.steering*s.steer/(1+Math.abs(speed)/14);}
      const t=v.tank!,previous={...t};t.turretYaw-=input.roll*TANK_CONTROLS.turretRadiansPerSecond*h;t.gunElevation=clamp(t.gunElevation-input.pitch*TANK_CONTROLS.gunRadiansPerSecond*h,TANK_CONTROLS.minimumGunRadians,TANK_CONTROLS.maximumGunRadians);
      const barrel=tankBarrel(v);t.articulationBlocked=q.overlaps(barrel.position,barrel.body,barrel.rotation);
      if(t.articulationBlocked){t.turretYaw=previous.turretYaw;t.gunElevation=previous.gunElevation;}
      const local=tankBarrel({...v,position:new Vector3(),rotation:new Quaternion()});rig.colliders[1]!.setTranslationWrtParent(new Vector3(...local.body.offset).applyQuaternion(local.rotation).add(local.position));rig.colliders[1]!.setRotationWrtParent(local.rotation);
    }
    // Propulsion is limited, never velocity-clamped: collisions, falls and downhill
    // motion remain the shared rigid body's result.
    const limit=speed<0?s.reverseSpeed:input.boost?s.maxSpeed:s.speed;
    if(Math.abs(speed)>limit&&Math.sign(driveForce)===Math.sign(speed))driveForce=0;
    const tangent=f.clone(),side=right.clone();
    if(normal){tangent.addScaledVector(normal,-tangent.dot(normal)).normalize();side.addScaledVector(normal,-side.dot(normal)).normalize();}
    force.addScaledVector(tangent,driveForce).addScaledVector(side,-mass*v.velocity.dot(side)*Math.min(lateral,1/h));
    const holding=input.brake||c.kind==='sled'&&input.forward<0||!!v.unicycle&&(v.unicycle.footDown>0||Math.abs(input.forward)<.01);
    if(normal&&holding&&Math.abs(speed)<.15){
      const gravityTangent=new Vector3(0,-9.81,0).addScaledVector(normal,9.81*normal.y);
      force.addScaledVector(gravityTangent,-mass);
    }
    if(normal){const n=q.support(v.position,3,.15)?.normal??normal;
      pitch+=Math.atan2(-(n.x*f.x+n.z*f.z),n.y);roll+=Math.atan2(n.x*f.z-n.z*f.x,n.y);}
    if(v.grounded||immersion>.05){
      const desired=new Quaternion().setFromEuler(new Euler(-pitch,v.yaw,roll,'YXZ')),error=desired.multiply(v.rotation.clone().invert());if(error.w<0)error.set(-error.x,-error.y,-error.z,-error.w);
      const j=inertia(mass),omega=state.angularVelocity;
      // Force/torque balance assist, without writing rotation or angular velocity.
      const localError=new Vector3(error.x,error.y,error.z).multiplyScalar(2).applyQuaternion(v.rotation.clone().invert()),localOmega=omega.clone().applyQuaternion(v.rotation.clone().invert());
      const localTorque=new Vector3(j.x*(localError.x*12*s.pitchResponse-localOmega.x*12),0,j.z*(localError.z*12*s.rollResponse-localOmega.z*12));torque.add(localTorque.applyQuaternion(v.rotation));
      torque.y+=j.y*(yawAcceleration??(yawTarget-omega.y)*6);
    }
    if(v.raft){const r=v.raft;r.compressionVelocity+=(-95*r.compression-15*r.compressionVelocity)*h;r.compression=clamp(r.compression+r.compressionVelocity*h,0,.12);if(!r.compression&&r.compressionVelocity<0)r.compressionVelocity=0;r.impactSpeed*=Math.exp(-5*h);r.surface=v.grounded?'ground':immersion>.05?'water':'air';}
    body.resetForces(true);body.resetTorques(true);body.addForce(force,true);body.addTorque(torque,true);
  };
  rig.afterStep=()=>{
    // Normalize at the physics boundary so float32 roundoff cannot deform the
    // visual hierarchy or invalidate rigid camera geometry every fixed step.
    const p=body.translation(),r=body.rotation(),velocity=body.linvel(),angular=body.angvel();v.position.set(p.x,p.y,p.z);v.rotation.set(r.x,r.y,r.z,r.w).normalize();v.velocity.set(velocity.x,velocity.y,velocity.z);state.angularVelocity.set(angular.x,angular.y,angular.z);
    const angles=new Euler().setFromQuaternion(v.rotation,'YXZ');v.pitch=-angles.x;v.yaw=angles.y;v.roll=angles.z;v.speed=v.submersible||['plane','glider','spacecraft'].includes(v.spec.mode)?v.velocity.length():Math.hypot(velocity.x,velocity.z);
    // Glider sink is a vertical flight-path offset, not loss of airspeed on
    // every solver slice. Recover airspeed from the actual horizontal motion.
    if(c.kind==='motion'&&['plane','glider'].includes(v.spec.mode))v.speed=Math.hypot(velocity.x,velocity.z)/Math.max(.2,Math.cos(v.pitch));
    if(c.kind==='motion'&&v.creature?.leadPosition&&leadOffset){v.creature.leadPosition.copy(leadOffset).applyQuaternion(v.rotation).add(v.position);v.creature.leadYaw=v.yaw+leadAngle;}
    const normals=q.vehicleContactNormals(rig);v.grounded=normals.some(n=>n.y>.45);state.contactCount=normals.length;state.elapsed+=h;
    if(v.unicycle)finishUnicycleStep(v,old,input,h,q);
    if(v.kayak)v.kayak.yawRate=angular.y;
    advanced+=h;relocated=false;
    if(v.jetski)finishJetSkiStep(v,old,h,time-dt+advanced);
    if(v.submersible)finishSubmersibleStep(v,h,time-dt+advanced);
    if(v.tank&&v.grounded){const yaw=Math.atan2(Math.sin(v.yaw-oldYaw),Math.cos(v.yaw-oldYaw)),travel=v.position.clone().sub(old).dot(new Vector3(Math.sin(oldYaw+yaw/2),0,Math.cos(oldYaw+yaw/2)));v.tank.leftTravel+=travel-yaw*TANK_GEOMETRY.trackHalfSpacing;v.tank.rightTravel+=travel+yaw*TANK_GEOMETRY.trackHalfSpacing;}
    if(v.raft){const impact=Math.max(0,...normals.map(n=>-incoming.dot(n)));if(impact>1.2){v.raft.impactSpeed=impact;v.raft.impacts++;v.raft.compressionVelocity+=Math.min(1.1,impact*.1);}}
  };
}

export interface VehicleDriveTelemetry {kind:'engine'|'pedal'|'paddle'|'push'|'motion';speed:number;effort:number;cadence:number;rpm:number;maxRpm:number;gear:string;shifting:boolean}
/** A read-only sample shared by the UI and observations. Sampling advances nothing. */
export function vehicleDriveTelemetry(v:VehicleState):VehicleDriveTelemetry|null {
  const p=v.wheelPhysics?.powertrain??v.bodyPhysics?.powertrain,c=v.spec.wheelPhysics?.powertrain??v.spec.bodyPhysics?.powertrain;
  if(p)return {kind:'engine',speed:v.speed,effort:p.throttle,cadence:0,rpm:p.rpm,maxRpm:c?.maxRpm??6200,gear:p.gear<0?'R':p.gear===0?'N':'D'+p.gear,shifting:p.shiftRemaining>0};
  if(v.bodyPhysics)return {kind:v.spec.bodyPhysics?.kind==='motion'?'motion':v.unicycle?'pedal':v.kayak?'paddle':'push',speed:v.speed,effort:v.bodyPhysics.effort,cadence:v.bodyPhysics.cadence,rpm:0,maxRpm:0,gear:'',shifting:false};
  return null;
}
