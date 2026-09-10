import { MathUtils, Quaternion, Vector3 } from 'three';
import type { Group, Object3D } from 'three';
import {busWheelAngle} from './bus';
export interface VehicleVisual {root?:Object3D;wheelRigs:{steering:Group;spin:Group;radius:number}[];steering:Object3D[]}

export interface WheelPose {wheels?:readonly {hubHeight?:number;length:number;angle:number;steer:number}[]|undefined;speed?:number;spec?:{mode:string;steer:number};position:Vector3;rotation:Quaternion;steering:number}
export interface WheelFrame {grounded:boolean;dt:number;revision:number;active?:boolean}
interface RollingState {position:Vector3;direction:Vector3;angularSpeed:number}
interface VehicleRollingState {revision:number;initialized:boolean;position:Vector3;wheels:RollingState[]}
const states=new WeakMap<VehicleVisual,VehicleRollingState>();
const position=new Vector3(),direction=new Vector3(),midDirection=new Vector3(),displacement=new Vector3();
const TAU=Math.PI*2;

/** Rebase after a pause; no paused or teleported distance becomes wheel travel. */
export function resetVehicleWheels(visual:VehicleVisual){const state=states.get(visual);if(state)state.initialized=false;}

/** Render wheels from the same interpolated pose as their chassis. */
export function updateVehicleWheels(visual:VehicleVisual,pose:WheelPose,frame:WheelFrame){
  if(visual.wheelRigs.length===0)return;
  if(pose.wheels){const wheel=visual.root?.getObjectByName('steering.wheel');if(wheel)wheel.rotation.z=-(pose.wheels.find(w=>Math.abs(w.steer)>1e-6)?.steer??0)*3;visual.wheelRigs.forEach((rig,i)=>{const w=pose.wheels![i];if(!w)return;rig.steering.position.y=(w.hubHeight??rig.radius)+.25-w.length;rig.steering.rotation.y=w.steer;rig.spin.rotation.x=w.angle;});return;}
  let state=states.get(visual);
  if(!state){state={revision:frame.revision,initialized:false,position:new Vector3(),wheels:visual.wheelRigs.map(()=>({position:new Vector3(),direction:new Vector3(),angularSpeed:0}))};states.set(visual,state);}
  const teleported=state.revision!==frame.revision||state.position.distanceToSquared(pose.position)>25*25;
  const rebase=!state.initialized||teleported||frame.dt<=0;
  const active=frame.active!==false;
  const steeringAngle=pose.spec?.mode==='bus'?busWheelAngle(pose.steering,pose.speed??0,pose.spec.steer):-MathUtils.clamp(pose.steering,-1,1)*.34;
  const wheel=visual.root?.getObjectByName('steering.wheel');
  if(wheel)wheel.rotation.z=-steeringAngle*3;
  visual.wheelRigs.forEach((rig,index)=>{
    const rolling=state!.wheels[index]!;
    rig.steering.rotation.y=visual.steering.includes(rig.steering)?steeringAngle:0;
    position.copy(rig.steering.position).applyQuaternion(pose.rotation).add(pose.position);
    direction.set(Math.sin(rig.steering.rotation.y),0,Math.cos(rig.steering.rotation.y)).applyQuaternion(pose.rotation);
    if(rebase||!active){
      rolling.angularSpeed=0;
      if(teleported)rig.spin.rotation.x=0;
    }else if(frame.grounded){
      // Project travel on the tyre's rolling direction, including its steering
      // and chassis slope. Sideways skids must not look like forward rotation.
      displacement.subVectors(position,rolling.position);
      midDirection.addVectors(rolling.direction,direction).normalize();
      const angle=displacement.dot(midDirection)/rig.radius;
      rig.spin.rotation.x=(rig.spin.rotation.x+angle)%TAU;
      rolling.angularSpeed=angle/frame.dt;
    }else{
      // Airborne landing gear can coast from takeoff, but airspeed never drives it.
      const damping=1.8,decay=Math.exp(-damping*frame.dt);
      rig.spin.rotation.x=(rig.spin.rotation.x+rolling.angularSpeed*(1-decay)/damping)%TAU;
      rolling.angularSpeed*=decay;
    }
    rolling.position.copy(position);rolling.direction.copy(direction);
  });
  state.position.copy(pose.position);state.revision=frame.revision;state.initialized=true;
}
