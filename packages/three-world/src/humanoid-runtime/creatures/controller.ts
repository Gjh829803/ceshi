import { Quaternion, Vector3 } from 'three';
import { vehicleImpactMass,type VehicleSpec } from '../config';
import { vehicleBody, type EnvironmentQueries, type MoveResult, type QueryBody } from '../environment/queries';
import type { Input, VehicleState } from '../simulation';
import type { CreatureState } from './types';

export const CARRIAGE_TOW_DISTANCE = 4.8;
export const LEAD_HORSE_BODY = {kind:'box' as const,halfExtents:[.8,1.65,1.9] as const,offset:[0,1.65,0] as const};
const UP=new Vector3(0,1,0);
const MAX_ARTICULATION=Math.PI*65/180;
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const approach=(a:number,b:number,amount:number)=>a+clamp(b-a,-amount,amount);
const angleDelta=(a:number,b:number)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
const heading=(yaw:number)=>new Vector3(Math.sin(yaw),0,Math.cos(yaw));
const rotationAt=(yaw:number)=>new Quaternion().setFromAxisAngle(UP,yaw);
export function createCreatureState(spec:VehicleSpec,position:Vector3,_rotation:Quaternion,yaw:number):CreatureState {
  return {gait:spec.mode==='dragon'?'rest':'graze',phase:0,flying:false,...(spec.mode==='carriage'?{leadPosition:position.clone().addScaledVector(heading(yaw),CARRIAGE_TOW_DISTANCE),leadYaw:yaw,leadVerticalSpeed:0}:{})};
}
export function resetCreatureState(v:VehicleState){
  v.creature=v.spec.mode==='mount'||v.spec.mode==='carriage'||v.spec.mode==='dragon'?createCreatureState(v.spec,v.position,v.rotation,v.yaw):undefined;
}

/** The lead horse is a separate occupied body, also useful for boarding/exit checks. */
export function creatureBodies(v:VehicleState):{position:Vector3;rotation:Quaternion;body:QueryBody}[]{
  const parts=[{position:v.position,rotation:v.rotation,body:vehicleBody(v.spec)}];
  if(v.spec.mode==='carriage'){
    const state=v.creature??createCreatureState(v.spec,v.position,v.rotation,v.yaw);
    parts.push({position:state.leadPosition!,rotation:rotationAt(state.leadYaw!),body:LEAD_HORSE_BODY});
  }
  return parts;
}
function bodyBounds(position:Vector3,body:QueryBody,rotation:Quaternion){
  const center=new Vector3(...body.offset).applyQuaternion(rotation).add(position),extent=new Vector3();
  if(body.kind==='capsule')extent.set(body.radius,body.height/2,body.radius);
  else for(let axis=0;axis<3;axis++){
    const side=new Vector3().setComponent(axis,body.halfExtents[axis]!).applyQuaternion(rotation);
    extent.add(new Vector3(Math.abs(side.x),Math.abs(side.y),Math.abs(side.z)));
  }
  return {center,extent};
}
function clearBody(position:Vector3,body:QueryBody,rotation:Quaternion,q:EnvironmentQueries){
  const {center,extent}=bodyBounds(position,body,rotation);
  for(let axis=0;axis<3;axis++)if(center.getComponent(axis)-extent.getComponent(axis)<q.map.bounds.min[axis]!-1e-5||center.getComponent(axis)+extent.getComponent(axis)>q.map.bounds.max[axis]!+1e-5)return false;
  return !q.overlaps(position,body,rotation);
}
export function canPlaceCreature(v:VehicleState,q:EnvironmentQueries){return creatureBodies(v).every(p=>clearBody(p.position,p.body,p.rotation,q));}

function touchesWater(v:VehicleState,q:EnvironmentQueries){
  return q.map.water.length>0&&creatureBodies(v).some(part=>{
    const {center,extent}=bodyBounds(part.position,part.body,part.rotation),bottom=center.y-extent.y;
    return q.map.water.some(w=>bottom<w.surface-.01&&center.y+extent.y>w.min[1]&&
      center.x+extent.x>w.min[0]&&center.x-extent.x<w.max[0]&&center.z+extent.z>w.min[2]&&center.z-extent.z<w.max[2]);
  });
}
function stopInWater(v:VehicleState){
  v.submerged=true;v.velocity.set(0,0,0);v.speed=0;v.throttle=0;v.steering=0;v.launched=false;v.grounded=false;
  v.creature!.flying=false;v.creature!.gait=v.spec.mode==='dragon'?'rest':'graze';
  if(v.creature!.leadPosition)v.creature!.leadVerticalSpeed=0;
}

/** Test the turning volume as well as the final box, so thin walls cannot be crossed by yaw. */
function turnIsClear(position:Vector3,body:QueryBody,fromYaw:number,toYaw:number,q:EnvironmentQueries){
  const change=angleDelta(fromYaw,toYaw),samples=Math.max(1,Math.ceil(Math.abs(change)/.02));
  for(let n=1;n<=samples;n++)if(!clearBody(position,body,rotationAt(fromYaw+change*n/samples),q))return false;
  return true;
}
function moveBody(position:Vector3,delta:Vector3,body:QueryBody,yaw:number,walking:boolean,q:EnvironmentQueries,push:{massKg:number;dt:number}):MoveResult{
  const rotation=rotationAt(yaw);
  if(!walking)return q.move(position,delta,body,rotation,0,push);
  // Separate floor support from horizontal control: combined diagonal sweeps can
  // slowly sink a long, yawed box into a flat floor through Rapier's contact tolerance.
  const horizontal=new Vector3(delta.x,0,delta.z);
  const distance=(p:Vector3)=>Math.hypot(p.x-position.x-delta.x,p.z-position.z-delta.z);
  let across=q.move(position,horizontal,body,rotation,0,push);
  if(distance(across.position)>1e-5){
    const stepped=q.move(position,horizontal,body,rotation,.45);
    if(distance(stepped.position)<distance(across.position))across=stepped;
  }
  let down=q.move(across.position,new Vector3(0,delta.y,0),body,rotation);
  if(distance(across.position)>1e-5&&horizontal.lengthSq()>1e-8&&q.support(position,.5,.02)){
    const raised=q.move(position,new Vector3(0,.45,0),body,rotation);
    if(raised.position.y-position.y>.449){
      // A few millimetres of travel can stop in the collision skin before
      // autostep finds a tread. Probe one hoof-step ahead, then sweep only the
      // requested distance at that verified step height (including headroom).
      const look=horizontal.clone().setLength(Math.max(.12,horizontal.length()));
      const ahead=q.move(raised.position,look,body,rotation);
      const settled=q.move(ahead.position,new Vector3(0,-.51,0),body,rotation);
      const complete=Math.hypot(ahead.position.x-raised.position.x-look.x,ahead.position.z-raised.position.z-look.z)<1e-5;
      const rise=settled.position.y-position.y;
      if(complete&&settled.grounded&&rise>.01&&rise<=.45){
        const lifted=q.move(position,new Vector3(0,rise,0),body,rotation);
        const stepped=q.move(lifted.position,horizontal,body,rotation);
        if(distance(stepped.position)<distance(across.position)&&clearBody(stepped.position,body,rotation,q)){
          across=stepped;down={...stepped,grounded:true};
        }
      }
    }
  }
  const result={...down,grounded:across.grounded||down.grounded,normals:[...across.normals,...down.normals]};
  const clearance=q.safeSpawn(result.position,body,rotation);
  if(clearance&&clearance.y>result.position.y+1e-5&&clearance.y-result.position.y<.08){
    const lifted=q.move(result.position,clearance.clone().sub(result.position),body,rotation);
    if(lifted.position.distanceToSquared(clearance)<1e-8&&!q.overlaps(clearance,body,rotation))result.position.copy(clearance);
  }
  const exact=result.position.clone();exact.x=position.x+delta.x;exact.z=position.z+delta.z;
  // Floor normals have small X/Z roundoff; do not let that noise stretch a towbar.
  if(distance(result.position)<.005&&result.normals.every(normal=>normal.y>.25)&&clearBody(exact,body,rotation,q))result.position.copy(exact);
  result.blocked=result.position.clone().sub(position).distanceToSquared(delta)>1e-6;
  return result;
}
function desiredSpeed(v:VehicleState,i:Input,dt:number,dragonAir=false){
  const spec=v.spec,dragon=spec.mode==='dragon',carriage=spec.mode==='carriage';
  const speed=v.velocity.dot(heading(carriage?v.creature!.leadYaw!:v.yaw));
  const maximum=dragon?(dragonAir?(i.boost?spec.maxSpeed:spec.speed):spec.groundSpeed):i.slow?spec.slowSpeed:i.boost?spec.maxSpeed:spec.speed*.58;
  const backward=dragonAir||!dragon?spec.reverseSpeed:2.5;
  const braking=!dragon&&i.brake;
  const target=braking?0:clamp(i.forward,-1,1)*(i.forward<0?backward:maximum);
  const acceleration=braking?spec.brakeDeceleration:Math.abs(i.forward)<.01?(dragon&&!dragonAir?spec.groundDeceleration:spec.coastDeceleration):target*speed<0?spec.directionChangeDeceleration:spec.accel;
  return approach(speed,target,acceleration*dt);
}
function updateGait(v:VehicleState,dt:number){
  const state=v.creature!,speed=Math.hypot(v.velocity.x,v.velocity.z);
  if(v.spec.mode==='dragon')state.gait=state.flying?(Math.abs(v.velocity.y)<.6&&speed>10?'glide':'flap'):speed>.12?'walk':'rest';
  else state.gait=speed<.12?'graze':speed<3?'walk':speed<8?'trot':'gallop';
  const rate=state.gait==='flap'?Math.PI*3.4:state.gait==='glide'?.8:Math.max(.65,speed*(state.gait==='gallop'?1.8:2.5));
  state.phase+=rate*dt;
  v.speed=v.velocity.length();v.launched=state.flying;
}
function stepMount(v:VehicleState,i:Input,dt:number,q:EnvironmentQueries){
  const body=vehicleBody(v.spec),old=v.position.clone(),speed=desiredSpeed(v,i,dt);
  const turn=v.spec.steer*(.25+.75*Math.min(Math.abs(speed)/3,1));
  const yaw=v.yaw-v.steering*turn*dt*(speed<-.1?-1:1);
  if(turnIsClear(old,body,v.yaw,yaw,q))v.yaw=yaw;
  const direction=heading(v.yaw),vertical=v.grounded?-1:v.velocity.y-18*dt;
  v.velocity.copy(direction).multiplyScalar(speed);v.velocity.y=vertical;
  const moved=moveBody(old,v.velocity.clone().multiplyScalar(dt),body,v.yaw,true,q,{massKg:vehicleImpactMass(v.spec),dt});
  if(clearBody(moved.position,body,rotationAt(v.yaw),q))v.position.copy(moved.position);
  v.velocity.copy(v.position).sub(old).divideScalar(dt);
  // Keep the full solved translation for observations and physical dismount.
  // Grounded motion chooses its resting downward probe above, independently of
  // this output velocity, so an uphill component cannot become a new jump.
  v.grounded=moved.grounded;
  v.pitch=0;v.roll=0;v.rotation.copy(rotationAt(v.yaw));
}
function stepCarriage(v:VehicleState,i:Input,dt:number,q:EnvironmentQueries){
  const state=v.creature!,oldCart=v.position.clone(),oldLead=state.leadPosition!.clone(),oldCartYaw=v.yaw,oldLeadYaw=state.leadYaw!;
  const body=vehicleBody(v.spec),speed=desiredSpeed(v,i,dt);
  let leadYaw=oldLeadYaw-v.steering*v.spec.steer*(.12+.88*Math.min(Math.abs(speed)/3,1))*dt*(speed<-.1?-1:1);
  leadYaw=oldCartYaw+clamp(angleDelta(oldCartYaw,leadYaw),-MAX_ARTICULATION,MAX_ARTICULATION);
  const desiredLead=oldLead.clone().addScaledVector(heading(leadYaw),speed*dt);
  const draw=desiredLead.clone().sub(oldCart);draw.y=0;
  const cartYaw=Math.atan2(draw.x,draw.z);
  leadYaw=cartYaw+clamp(angleDelta(cartYaw,leadYaw),-MAX_ARTICULATION,MAX_ARTICULATION);
  const desiredCart=desiredLead.clone().addScaledVector(draw.normalize(),-CARRIAGE_TOW_DISTANCE);desiredCart.y=oldCart.y;
  const leadFall=state.leadVerticalSpeed??0;
  desiredLead.y+=Math.min(-1,leadFall-18*dt)*dt;
  desiredCart.y+=(v.grounded?-1:v.velocity.y-18*dt)*dt;
  const leadTurn=turnIsClear(oldLead,LEAD_HORSE_BODY,oldLeadYaw,leadYaw,q),cartTurn=turnIsClear(oldCart,body,oldCartYaw,cartYaw,q);
  if(!leadTurn||!cartTurn){v.velocity.set(0,0,0);return;}
  const lead=moveBody(oldLead,desiredLead.clone().sub(oldLead),LEAD_HORSE_BODY,leadYaw,true,q,{massKg:550,dt});
  const cart=moveBody(oldCart,desiredCart.clone().sub(oldCart),body,cartYaw,true,q,{massKg:450,dt});
  const horizontalError=(a:Vector3,b:Vector3)=>Math.hypot(a.x-b.x,a.z-b.z);
  // A hit on EITHER part cancels the horizontal advance of BOTH; the drawbar never stretches.
  const blocked=horizontalError(lead.position,desiredLead)>1e-5||horizontalError(cart.position,desiredCart)>1e-5||
    (!clearBody(lead.position,LEAD_HORSE_BODY,rotationAt(leadYaw),q)||!clearBody(cart.position,body,rotationAt(cartYaw),q));
  if(blocked){v.velocity.set(0,0,0);state.leadVerticalSpeed=0;return;}
  // Remove only harmless sweep rounding after both complete target poses were reached.
  lead.position.x=desiredLead.x;lead.position.z=desiredLead.z;cart.position.x=desiredCart.x;cart.position.z=desiredCart.z;
  state.leadPosition!.copy(lead.position);state.leadYaw=leadYaw;state.leadVerticalSpeed=lead.grounded?0:(lead.position.y-oldLead.y)/dt;
  v.position.copy(cart.position);v.yaw=cartYaw;v.rotation.copy(rotationAt(cartYaw));v.pitch=0;v.roll=0;
  // Speed is the horse's longitudinal drive speed, while the cart follows the tow geometry.
  v.velocity.copy(heading(leadYaw)).multiplyScalar(speed);v.velocity.y=cart.grounded?0:(cart.position.y-oldCart.y)/dt;v.grounded=cart.grounded;
}
function stepDragon(v:VehicleState,i:Input,dt:number,q:EnvironmentQueries){
  const state=v.creature!,body=vehicleBody(v.spec),old=v.position.clone();
  // Space and Ctrl are an axis, never a toggle. Neutral input keeps an airborne dragon hovering.
  const lift=i.slow&&(i.brake||i.jump)?0:clamp(i.lift||(i.jump?1:0),-1,1);
  if(lift>0||!v.grounded)state.flying=true;
  const speed=desiredSpeed(v,i,dt,state.flying),turn=v.spec.steer*(state.flying?1:.35);
  const yaw=v.yaw-v.steering*turn*dt*(speed<-.1?-1:1);
  if(turnIsClear(old,body,v.yaw,yaw,q))v.yaw=yaw;
  const vertical=state.flying?approach(v.velocity.y,lift*(i.boost?10:7),18*dt):v.grounded?-1:v.velocity.y-18*dt;
  v.velocity.copy(heading(v.yaw)).multiplyScalar(speed);v.velocity.y=vertical;
  const moved=moveBody(old,v.velocity.clone().multiplyScalar(dt),body,v.yaw,!state.flying,q,{massKg:vehicleImpactMass(v.spec),dt});
  if(clearBody(moved.position,body,rotationAt(v.yaw),q))v.position.copy(moved.position);
  v.velocity.copy(v.position).sub(old).divideScalar(dt);
  v.grounded=moved.grounded;
  if(v.grounded&&lift<=0){state.flying=false;v.velocity.y=0;}
  else if(lift>0&&v.velocity.y>0)v.grounded=false;
  v.pitch=0;v.roll=0;v.rotation.copy(rotationAt(v.yaw));
}
export function stepCreature(v:VehicleState,i:Input,dt:number,q:EnvironmentQueries){
  if(!Number.isFinite(dt)||dt<=0)return;
  v.creature??=createCreatureState(v.spec,v.position,v.rotation,v.yaw);
  // These creatures stop on water contact until reset.
  if(v.submerged||touchesWater(v,q)){stopInWater(v);return;}
  const duration=Math.min(dt,.25),steps=Math.max(1,Math.ceil(duration*60)),slice=duration/steps;
  for(let n=0;n<steps;n++){
    const previous={position:v.position.clone(),rotation:v.rotation.clone(),yaw:v.yaw,pitch:v.pitch,roll:v.roll,leadPosition:v.creature.leadPosition?.clone(),leadYaw:v.creature.leadYaw};
    v.steering+=(clamp(i.steer,-1,1)-v.steering)*(1-Math.exp(-(Math.abs(i.steer)>.01?v.spec.steeringResponse:v.spec.steeringReturn)*slice));v.throttle=i.forward;
    if(v.spec.mode==='carriage')stepCarriage(v,i,slice,q);
    else if(v.spec.mode==='dragon')stepDragon(v,i,slice,q);
    else stepMount(v,i,slice,q);
    if(touchesWater(v,q)){
      // Cancel only the boundary-crossing advance. Keeping the last clear pose
      // avoids a teleport to shore and preserves the complete carriage drawbar.
      v.position.copy(previous.position);v.rotation.copy(previous.rotation);v.yaw=previous.yaw;v.pitch=previous.pitch;v.roll=previous.roll;
      if(previous.leadPosition)v.creature.leadPosition!.copy(previous.leadPosition);
      v.creature.leadYaw=previous.leadYaw;stopInWater(v);return;
    }
    updateGait(v,slice);
  }
}
