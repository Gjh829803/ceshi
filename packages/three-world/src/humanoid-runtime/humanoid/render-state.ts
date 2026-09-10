import {copyUnicycleState,blendUnicycleState} from '../motion-families/ground-vehicle/unicycle';
import { Quaternion, Vector3 } from 'three';
import type { HumanoidController } from './controller';
import { SOURCE_ACTION_DURATIONS,type HumanoidRenderState } from './animation';
import type { InteractionVisualTarget } from './interaction-visuals';

/** Detach render data from mutable fixed-step actions; MotionPlan itself is immutable. */
export function readHumanoid(h?:HumanoidController):HumanoidRenderState|undefined {
  if(!h)return;
  return {simulationIdentity:h,position:h.position.clone(),facing:h.facing.clone(),motionSerial:h.motionSerial,
    traversal:h.traversal?{motion:h.traversal.motion,elapsed:h.traversal.elapsed,duration:h.traversal.duration}:null,
    completedMotion:h.completedMotion?{...h.completedMotion}:null,
    speed:h.speed,vertical:h.vertical,grounded:h.grounded,animationGrounded:h.animationGrounded,stance:h.stance,swimming:h.swimming,swimStyle:h.swimStyle,
    animationEvent:h.animationEvent?{...h.animationEvent}:null,
    surface:{pose:h.surface.pose?{...h.surface.pose}:null},
    skills:{pose:h.skills.pose?{...h.skills.pose}:null,seated:h.skills.seated,carrying:h.skills.carrying,active:h.skills.active?{id:h.skills.active.id}:null},
  };
}
export function copyHumanoid(s?:HumanoidRenderState):HumanoidRenderState|undefined {
  return s?{...s,unicyclePose:copyUnicycleState(s.unicyclePose),...(s.kayakPose?{kayakPose:{...s.kayakPose}}:{}),...(s.sledPose?{sledPose:{...s.sledPose}}:{}),position:s.position.clone(),facing:s.facing.clone(),traversal:s.traversal?{...s.traversal}:null,completedMotion:s.completedMotion?{...s.completedMotion}:null,
    animationEvent:s.animationEvent?{...s.animationEvent}:null,surface:s.surface?{pose:s.surface.pose?{...s.surface.pose}:null}:null,
    skills:s.skills?{...s.skills,pose:s.skills.pose?{...s.skills.pose}:null,active:s.skills.active?{...s.skills.active}:null}:null}:undefined;
}
export function blendHumanoid(a:HumanoidRenderState|undefined,b:HumanoidRenderState|undefined,alpha:number){
  const out=copyHumanoid(b);if(!out||!a||!b||a.simulationIdentity!==b.simulationIdentity)return out;
  if(a.atvSteeringAngle!==undefined&&b.atvSteeringAngle!==undefined)out.atvSteeringAngle=a.atvSteeringAngle+(b.atvSteeringAngle-a.atvSteeringAngle)*alpha;
  out.unicyclePose=blendUnicycleState(a.unicyclePose,b.unicyclePose,alpha);
  out.position.lerpVectors(a.position,b.position,alpha);
  const ay=Math.atan2(a.facing.x,a.facing.z),by=Math.atan2(b.facing.x,b.facing.z),yaw=ay+Math.atan2(Math.sin(by-ay),Math.cos(by-ay))*alpha;
  out.facing.set(Math.sin(yaw),0,Math.cos(yaw));
  out.speed=a.speed+(b.speed-a.speed)*alpha;out.vertical=a.vertical+(b.vertical-a.vertical)*alpha;
  if(out.traversal&&a.traversal&&a.motionSerial===b.motionSerial)out.traversal.elapsed=a.traversal.elapsed+(out.traversal.elapsed-a.traversal.elapsed)*alpha;
  for(const [previous,current] of [[a.skills?.pose,out.skills?.pose],[a.surface?.pose,out.surface?.pose]])if(previous&&current&&previous.key===current.key){
    if(current.time>=previous.time)current.time=previous.time+(current.time-previous.time)*alpha;
    else{const duration=SOURCE_ACTION_DURATIONS[current.key],travel=duration?duration-previous.time+current.time:Infinity;
      // A short forward wrap belongs to the same loop. Other backwards times
      // are a newly started pose and must not scrub backwards through the clip.
      if(duration&&travel>=0&&travel<=.1)current.time=(previous.time+travel*alpha)%duration;
    }
  }
  if(out.animationEvent&&a.animationEvent?.id===out.animationEvent.id)out.animationEvent.elapsed=a.animationEvent.elapsed+(out.animationEvent.elapsed-a.animationEvent.elapsed)*alpha;
  return out;
}
export function readInteractionTargets(h?:HumanoidController):InteractionVisualTarget[]{
  if(!h)return [];
  return [...h.skills.targets.values()].map<InteractionVisualTarget>(t=>({id:t.definition.id,kind:t.definition.kind,position:t.position.clone(),rotation:t.body?new Quaternion().copy(t.body.rotation()):new Quaternion(),state:t.state,size:t.definition.size?[...t.definition.size]:undefined}))
    .concat(h.crates.map((c,n)=>({id:`crate:${n}`,kind:'pickup' as const,position:new Vector3().copy(c.body.translation()),rotation:new Quaternion().copy(c.body.rotation()),state:'dynamic',size:[c.size,c.size,c.size]})));
}
export function copyTargets(targets:readonly InteractionVisualTarget[]){return targets.map(t=>({...t,position:t.position.clone(),rotation:t.rotation?.clone(),size:t.size?[...t.size]:undefined}));}
export function blendTargets(a:readonly InteractionVisualTarget[],b:readonly InteractionVisualTarget[],alpha:number){
  const previous=new Map(a.map(t=>[t.id,t]));return copyTargets(b).map(t=>{const p=previous.get(t.id);if(p&&p.state===t.state){t.position.lerpVectors(p.position,t.position,alpha);if(p.rotation&&t.rotation)t.rotation=p.rotation.clone().slerp(t.rotation,alpha);}return t;});
}
