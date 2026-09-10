import {Quaternion,Vector3,type Object3D} from 'three';
import {ATV_GEOMETRY} from './motion-families/ground-vehicle/atv';

/** Two-bone arm solve: rotations only; bone lengths and original geometry stay intact. */
export function fitAtvHands(actor:Object3D,seatRoot:Object3D,angle:number):void{
 seatRoot.updateWorldMatrix(true,true);
 for(const [index,side] of ['l','r'].entries()){
  const upper=actor.getObjectByName(`upperarm_${side}`),lower=actor.getObjectByName(`lowerarm_${side}`),hand=actor.getObjectByName(`hand_${side}`);
  if(!upper||!lower||!hand)continue;
  const start=upper.getWorldPosition(new Vector3()),elbow=lower.getWorldPosition(new Vector3()),wrist=hand.getWorldPosition(new Vector3());
  const l1=start.distanceTo(elbow),l2=elbow.distanceTo(wrist);
  const target=new Vector3(...ATV_GEOMETRY.grips[index]!).applyAxisAngle(new Vector3(0,1,0),angle).add(new Vector3(...ATV_GEOMETRY.handlebar)).sub(new Vector3(...ATV_GEOMETRY.seat)).applyMatrix4(seatRoot.matrixWorld);
  const direction=target.clone().sub(start),distance=Math.max(.001,Math.min(l1+l2-.00001,direction.length()));direction.normalize();
  const pole=new Vector3(side==='l'?1:-1,-.7,-.25).transformDirection(seatRoot.matrixWorld);pole.addScaledVector(direction,-pole.dot(direction)).normalize();
  const along=(l1*l1-l2*l2+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along));
  const bend=start.clone().addScaledVector(direction,along).addScaledVector(pole,height);
  const aim=(bone:Object3D,child:Object3D,to:Vector3)=>{const origin=bone.getWorldPosition(new Vector3()),from=child.getWorldPosition(new Vector3()).sub(origin).normalize(),toward=to.clone().sub(origin).normalize();
   const rotation=bone.getWorldQuaternion(new Quaternion()).premultiply(new Quaternion().setFromUnitVectors(from,toward));
   if(bone.parent)rotation.premultiply(bone.parent.getWorldQuaternion(new Quaternion()).invert());bone.quaternion.copy(rotation);bone.updateWorldMatrix(false,true);};
  aim(upper,lower,bend);aim(lower,hand,target);
 }
}
