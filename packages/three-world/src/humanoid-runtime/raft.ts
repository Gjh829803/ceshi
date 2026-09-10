import {Euler,Vector3,type Object3D} from 'three';
import type {VehicleState,Input} from './simulation';
import type {EnvironmentQueries} from './environment/queries';
import {stepKayak} from './kayak';
/** Restitution is dimensionless; impact speed m/s, compression m, spring s^-2. */
export const RAFT_RUBBER={restitution:.36,threshold:1.2,maxRebound:3.2,groundFriction:.32,stiffness:95,damping:15};
export interface RaftState{compression:number;compressionVelocity:number;impactSpeed:number;impacts:number;surface:'water'|'ground'|'air'}
export const createRaftState=():RaftState=>({compression:0,compressionVelocity:0,impactSpeed:0,impacts:0,surface:'air'});
export function stepRaft(v:VehicleState,i:Input,dt:number,q:EnvironmentQueries){
 const r=v.raft!,support=q.support(v.position,1,.1),contact=v.grounded&&!!support&&v.position.y-support.height<1.4;
 r.compressionVelocity+=(-RAFT_RUBBER.stiffness*r.compression-RAFT_RUBBER.damping*r.compressionVelocity)*dt;
 r.compression=Math.max(0,Math.min(.12,r.compression+r.compressionVelocity*dt));if(!r.compression&&r.compressionVelocity<0)r.compressionVelocity=0;r.impactSpeed*=Math.exp(-5*dt);
 if(!contact){stepKayak(v,i,dt,q);r.surface=v.kayak!.immersion>.05?'water':'air';return;}
 r.surface='ground';const k=v.kayak!;k.effort=0;k.bladeImmersion=0;k.brake=0;k.yawRate=0;k.surface=q.waterAt(v.position)?.surface??null;k.immersion=0;k.buoyancy=0;
 const n=support!.normal,f=new Vector3(Math.sin(v.yaw),0,Math.cos(v.yaw));
 // Gravity acts across the whole tangent plane, including side slopes. No dry-land paddle thrust.
 v.velocity.x+=9.81*n.x*n.y*dt;v.velocity.z+=9.81*n.z*n.y*dt;
 const speed=Math.hypot(v.velocity.x,v.velocity.z),remaining=Math.max(0,Math.min(18,speed-(RAFT_RUBBER.groundFriction+(i.brake?v.spec.brakeDeceleration:0))*dt));
 if(speed){v.velocity.x*=remaining/speed;v.velocity.z*=remaining/speed;}
 // Leaning/dragging the paddle changes direction only while sliding.
 v.yaw-=v.steering*.45*Math.min(1,speed/4)*Math.sign(v.velocity.dot(f))*dt;
 const pitch=Math.atan2(-(n.x*f.x+n.z*f.z),n.y),roll=-Math.asin(Math.max(-1,Math.min(1,n.x*f.z-n.z*f.x)));
 v.pitch+=(pitch-v.pitch)*(1-Math.exp(-v.spec.pitchResponse*dt));v.roll+=(roll-v.roll)*(1-Math.exp(-v.spec.rollResponse*dt));
 v.velocity.y-=9.81*dt;v.position.addScaledVector(v.velocity,dt);v.rotation.setFromEuler(new Euler(-v.pitch,v.yaw,v.roll,'YXZ'));v.speed=remaining;
}
/** The existing solver supplies accepted contacts; only lost normal energy can rebound. */
export function finishRaftContact(v:VehicleState,incoming:Vector3,normals:readonly Vector3[]){
 const r=v.raft!;let impact=0,normal:Vector3|undefined;
 for(const n of normals){const speed=-incoming.dot(n);if(speed>impact){impact=speed;normal=n;}}
 if(!normal||impact<RAFT_RUBBER.threshold)return;
 const outward=Math.max(0,v.velocity.dot(normal)),bounce=Math.min(RAFT_RUBBER.maxRebound,impact*RAFT_RUBBER.restitution);
 v.velocity.addScaledVector(normal,Math.max(0,bounce-outward));if(normal.y>.4)v.grounded=false;
 r.impactSpeed=impact;r.impacts++;r.compressionVelocity+=Math.min(1.1,impact*.10);r.compression=Math.min(.12,r.compression+Math.min(.05,impact*.006));
}
export function sampleRaftVisual(root:Object3D,r:RaftState){
 const tubes=root.getObjectByName('raft.tubes');if(tubes){tubes.scale.y=1-r.compression*2;tubes.scale.x=1+r.compression*.3;}
}
