import {Mesh,MeshBasicMaterial,Object3D,Quaternion,Vector3} from 'three';
import {CANOE_GEOMETRY,paddleBlade,paddleGrip,KAYAK_GEOMETRY,kayakPaddlePose,kayakStroke,type KayakState} from './kayak';
/** Analytic projection of the fixed stroke; repeated captures cannot advance it. */
export function sampleKayakVisual(root:Object3D,k:KayakState,speed:number){
 const p=kayakPaddlePose(k),paddle=root.getObjectByName('kayak.paddle');if(paddle){paddle.position.copy(p.position);paddle.quaternion.copy(p.rotation);for(const [name,side] of [['control.hand.left',1],['control.hand.right',-1]] as const){const socket=paddle.getObjectByName(name);if(socket)socket.position.copy(paddleGrip(k,side));}}
 root.updateWorldMatrix(true,true);const stroke=kayakStroke(k),worldUp=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-Math.PI/2),inverse=root.getWorldQuaternion(new Quaternion()).invert();
 for(const side of [-1,1]){
  const ripple=root.getObjectByName(`kayak.ripple.${side}`) as Mesh|undefined;if(!ripple)continue;
  const blade=paddleBlade(k,side).applyQuaternion(p.rotation).add(p.position);root.localToWorld(blade);
  ripple.visible=k.surface!==null&&(k.brake?side===(k.craft==='canoe'?(k.side??-1):1):k.effort>.1&&side===stroke.side&&k.bladeImmersion>.01);
  if(k.surface!==null){blade.y=k.surface+.018;ripple.position.copy(root.worldToLocal(blade));}
  ripple.quaternion.copy(inverse).multiply(worldUp);ripple.scale.setScalar(.6+stroke.t*3);
  (ripple.material as MeshBasicMaterial).opacity=k.brake?.35:.55*(1-stroke.t)*k.effort;
 }
 for(let n=0;n<3;n++){
  const wake=root.getObjectByName(`kayak.wake.${n}`) as Mesh|undefined;if(!wake)continue;
  wake.visible=k.surface!==null&&speed>.2;
  const point=root.localToWorld(new Vector3(0,0,-1.6-n*.65));point.y=(k.surface??point.y)+.012;
  wake.position.copy(root.worldToLocal(point));wake.rotation.set(-Math.PI/2,0,0);wake.scale.set(1+n*.6,1+n*.35,1);
  (wake.material as MeshBasicMaterial).opacity=Math.min(.4,speed*.10)*(1-n*.23);
 }
}
/** Two-bone hand placement belongs to the supplied character's animation update. */
export function poseKayakHands(root:Object3D,k:KayakState){
 const p=kayakPaddlePose(k),rotation=root.getWorldQuaternion(new Quaternion());
 for(const [suffix,side] of [['l',1],['r',-1]] as const){
  const upper=root.getObjectByName(`upperarm_${suffix}`),lower=root.getObjectByName(`lowerarm_${suffix}`),hand=root.getObjectByName(`hand_${suffix}`);if(!upper||!lower||!hand)continue;
  const target=paddleGrip(k,side).applyQuaternion(p.rotation).add(p.position).sub(new Vector3(...(k.craft==='canoe'?CANOE_GEOMETRY:KAYAK_GEOMETRY).seat));root.localToWorld(target);
  const a=upper.getWorldPosition(new Vector3()),b=lower.getWorldPosition(new Vector3()),c=hand.getWorldPosition(new Vector3()),l1=a.distanceTo(b),l2=b.distanceTo(c);
  const direction=target.clone().sub(a),distance=Math.min(direction.length(),l1+l2-.0001);direction.normalize();
  const pole=new Vector3(side*.6,-1,-.15).applyQuaternion(rotation);pole.addScaledVector(direction,-pole.dot(direction)).normalize();
  const along=(l1*l1-l2*l2+distance*distance)/(2*Math.max(.001,distance));
  const elbow=a.clone().addScaledVector(direction,along).addScaledVector(pole,Math.sqrt(Math.max(0,l1*l1-along*along)));
  const aim=(bone:Object3D,child:Object3D,to:Vector3)=>{
   const origin=bone.getWorldPosition(new Vector3()),from=child.getWorldPosition(new Vector3()).sub(origin).normalize(),toward=to.clone().sub(origin).normalize();
   const q=bone.getWorldQuaternion(new Quaternion()).premultiply(new Quaternion().setFromUnitVectors(from,toward));
   if(bone.parent)q.premultiply(bone.parent.getWorldQuaternion(new Quaternion()).invert());bone.quaternion.copy(q);bone.updateWorldMatrix(false,true);
  };
  aim(upper,lower,elbow);aim(lower,hand,target);
 }
}
