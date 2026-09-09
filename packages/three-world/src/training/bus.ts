import { Euler, Vector3 } from 'three';
import type { EnvironmentQueries } from './environment/queries';
import type { Input, VehicleState } from './simulation';
import { coastSpeed } from './handling';

/** Front-wheel steering angle, radians. High speed progressively limits lock. */
export function busWheelAngle(steering:number,speed:number,maximumRadians:number):number {
  return -steering*Math.min(.7,Math.max(0,maximumRadians))/(1+Math.abs(speed)/18);
}

/** A heavy, rear-axle bicycle model in the existing fixed clock and collision world.
 * No handbrake drift multiplier or boost engine; S brakes before engaging reverse.
 */
export function stepBus(v:VehicleState,i:Input,dt:number,q:EnvironmentQueries):void {
  const s=v.spec,f=new Vector3(Math.sin(v.yaw),0,Math.cos(v.yaw)),oldForward=f.clone();
  let speed=v.velocity.dot(f);
  const oldSpeed=speed;
  const support=q.support(v.position,2,.45),water=q.waterAt(v.position);
  const drive=v.grounded&&!(water&&v.position.y<water.surface);
  const opposite=i.forward*speed<0&&Math.abs(speed)>.08;
  const stopping=i.brake||opposite;
  const target=drive&&!stopping?i.forward:0;
  v.throttle+=(target-v.throttle)*(1-Math.exp(-s.throttleResponse*dt));
  if(drive){
    if(stopping){speed=coastSpeed(speed,s.brakeDeceleration,dt);v.throttle=0;}
    else if(Math.abs(i.forward)>.01){
      const limit=i.forward<0?s.reverseSpeed:s.speed;
      const reserve=Math.max(.15,1-Math.abs(speed)/Math.max(.1,limit));
      speed+=v.throttle*s.accel*reserve*dt;
    }else speed=coastSpeed(speed,s.coastDeceleration,dt);
    // Engine load on slopes; the service brake holds against gravity when stopped.
    if(support&&!i.brake){const n=support.normal;speed+=9.81*n.y*(n.x*f.x+n.z*f.z)*dt;}
    speed=Math.max(-s.reverseSpeed,Math.min(s.speed,speed));
    const wheelbase=Math.max(.5,s.wheelbaseMeters??3.3),rear=s.rearAxleZMeters??-1.45;
    const yawRate=speed/wheelbase*Math.tan(busWheelAngle(v.steering,speed,s.steer));
    v.yaw+=yawRate*dt;f.set(Math.sin(v.yaw),0,Math.cos(v.yaw));
    // Integrate the rear axle then recover the chassis origin: the nose swings
    // wider and the rear wheels cut inside a corner, including when reversing.
    const travel=oldForward.add(f).normalize().multiplyScalar(speed*dt)
      .addScaledVector(new Vector3(Math.sin(v.yaw-yawRate*dt)-f.x,0,Math.cos(v.yaw-yawRate*dt)-f.z),rear);
    v.velocity.x=travel.x/dt;v.velocity.z=travel.z/dt;
    if(support){
      const n=support.normal,grade=Math.atan2(-(n.x*f.x+n.z*f.z),n.y);
      const brakingPitch=Math.max(-.035,Math.min(.035,(speed-oldSpeed)/dt*.008));
      v.pitch+=(grade-brakingPitch-v.pitch)*(1-Math.exp(-s.pitchResponse*dt));
      const bank=-Math.asin(Math.max(-1,Math.min(1,n.x*f.z-n.z*f.x)));
      const lean=Math.max(-.06,Math.min(.06,-yawRate*speed*.012));
      v.roll+=(bank+lean-v.roll)*(1-Math.exp(-s.rollResponse*dt));
    }
  }
  if(water&&v.position.y<water.surface){v.velocity.x*=Math.exp(-3*dt);v.velocity.z*=Math.exp(-3*dt);}
  v.velocity.y-=9.81*dt;v.position.addScaledVector(v.velocity,dt);
  v.rotation.setFromEuler(new Euler(-v.pitch,v.yaw,v.roll,'YXZ'));
  v.speed=Math.hypot(v.velocity.x,v.velocity.z);v.submerged=!!water&&v.position.y<water.surface;
}
