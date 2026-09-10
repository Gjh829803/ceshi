import {Quaternion,Vector3,type Object3D} from 'three';
import {UNICYCLE_GEOMETRY,unicyclePedal,type UnicycleState} from './unicycle';

function aim(bone:Object3D,child:Object3D,target:Vector3){
  const p=bone.getWorldPosition(new Vector3()),from=child.getWorldPosition(new Vector3()).sub(p).normalize(),to=target.clone().sub(p).normalize();
  const rotation=bone.getWorldQuaternion(new Quaternion()).premultiply(new Quaternion().setFromUnitVectors(from,to));
  if(bone.parent)rotation.premultiply(bone.parent.getWorldQuaternion(new Quaternion()).invert());
  bone.quaternion.copy(rotation);bone.updateWorldMatrix(false,true);
}
/** Rotation-only two-bone solve on the supplied rig. Targets share the vehicle's fixed sample. */
export function fitUnicycleFeet(actor:Object3D,seatRoot:Object3D,s:UnicycleState):void {
  seatRoot.updateWorldMatrix(true,true);
  for(const [suffix,side] of [['l',1],['r',-1]] as const){
    const thigh=actor.getObjectByName(`thigh_${suffix}`),calf=actor.getObjectByName(`calf_${suffix}`),foot=actor.getObjectByName(`foot_${suffix}`),ball=actor.getObjectByName(`ball_${suffix}`);
    if(!thigh||!calf||!foot||!ball)continue;
    const contact=unicyclePedal(s.wheelAngle,side);contact.y+=UNICYCLE_GEOMETRY.soleOffset;
    if(side===1&&s.supportLocal){contact.lerp(new Vector3(...s.supportLocal),s.footDown);contact.y+=Math.sin(Math.PI*s.footDown)*.09;}
    contact.sub(new Vector3(...UNICYCLE_GEOMETRY.seat)).applyMatrix4(seatRoot.matrixWorld);
    const a=thigh.getWorldPosition(new Vector3()),b=calf.getWorldPosition(new Vector3()),c=foot.getWorldPosition(new Vector3());
    const toe=new Vector3(0,-.02,1).normalize().transformDirection(seatRoot.matrixWorld).multiplyScalar(c.distanceTo(ball.getWorldPosition(new Vector3())));
    const target=contact.clone().sub(toe),l1=a.distanceTo(b),l2=b.distanceTo(c),d=target.clone().sub(a),length=Math.max(Math.abs(l1-l2)+.0001,Math.min(l1+l2-.00001,d.length()));d.normalize();
    // Both thighs straddle the cushion; the pedal-side knee opens farther at rest.
    const spread=1.5+(side===-1?.2*s.footDown:0);
    const pole=new Vector3(side*spread,0,1).transformDirection(seatRoot.matrixWorld);pole.addScaledVector(d,-pole.dot(d)).normalize();
    const along=(l1*l1-l2*l2+length*length)/(2*length),height=Math.sqrt(Math.max(0,l1*l1-along*along));
    aim(thigh,calf,a.clone().addScaledVector(d,along).addScaledVector(pole,height));aim(calf,foot,target);
    aim(foot,ball,foot.getWorldPosition(new Vector3()).add(toe));
  }
}
