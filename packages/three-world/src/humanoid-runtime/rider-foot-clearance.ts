import {Quaternion,Vector3,type Object3D} from 'three';

/** The UEFN shoe extends 35 mm farther below the old foot-control bone target. */
export const RIDER_SHOE_CONTACT_RISE=.035;

/** Bend the existing knee/hip, retaining bone lengths and the authored shoe orientation. */
export function raiseMountedFeet(actor:Object3D,seatRoot:Object3D,height:number):void {
  seatRoot.updateWorldMatrix(true,true);
  const up=new Vector3(0,1,0).transformDirection(seatRoot.matrixWorld).multiplyScalar(height);
  const aim=(bone:Object3D,child:Object3D,target:Vector3)=>{
    const p=bone.getWorldPosition(new Vector3());
    const from=child.getWorldPosition(new Vector3()).sub(p).normalize(),to=target.clone().sub(p).normalize();
    const rotation=bone.getWorldQuaternion(new Quaternion()).premultiply(new Quaternion().setFromUnitVectors(from,to));
    if(bone.parent)rotation.premultiply(bone.parent.getWorldQuaternion(new Quaternion()).invert());
    bone.quaternion.copy(rotation);bone.updateWorldMatrix(false,true);
  };
  for(const side of ['l','r']){
    const thigh=actor.getObjectByName(`thigh_${side}`),calf=actor.getObjectByName(`calf_${side}`),foot=actor.getObjectByName(`foot_${side}`);
    if(!thigh||!calf||!foot)continue;
    const a=thigh.getWorldPosition(new Vector3()),b=calf.getWorldPosition(new Vector3()),c=foot.getWorldPosition(new Vector3());
    const orientation=foot.getWorldQuaternion(new Quaternion()),target=c.clone().add(up),d=target.clone().sub(a);
    const l1=a.distanceTo(b),l2=b.distanceTo(c),distance=Math.max(Math.abs(l1-l2)+.0001,Math.min(l1+l2-.00001,d.length()));d.normalize();
    const pole=b.clone().sub(a);pole.addScaledVector(d,-pole.dot(d)).normalize();
    const along=(l1*l1-l2*l2+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along));
    aim(thigh,calf,a.clone().addScaledVector(d,along).addScaledVector(pole,height));aim(calf,foot,target);
    foot.quaternion.copy(foot.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(orientation));foot.updateWorldMatrix(false,true);
  }
}
