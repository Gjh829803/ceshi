import * as T from 'three';
import type {DragonMountTransition} from './mount';

export interface DragonClimbContacts {hands:T.Vector3[];feet:T.Vector3[];normal:T.Vector3;across:T.Vector3;weight:number}

/** 鞍侧可收起绳梯。路径、可见踏棍与手脚目标共享米制世界坐标。 */
export class DragonMountLadder {
  readonly object=new T.InstancedMesh(new T.CylinderGeometry(.027,.027,1,6),new T.MeshStandardMaterial({color:0x60452b,roughness:1}),128);
  constructor(){this.object.name='dragon-saddle-ladder';this.object.frustumCulled=false;this.object.visible=false;this.object.castShadow=true;}
  sample(root:T.Object3D,t:DragonMountTransition|undefined,rider:T.Object3D|null):DragonClimbContacts|undefined{
    this.object.visible=!!t;if(!t)return;
    root.updateWorldMatrix(true,false);
    const yaw=root.getWorldQuaternion(new T.Quaternion()),normal=new T.Vector3(t.side,0,0).applyQuaternion(yaw),across=new T.Vector3(0,0,t.side).applyQuaternion(yaw);
    const path=t.path.map(p=>new T.Vector3(...p));
    const upper=t.entering?path.at(-2)!:path[1]!,lower=t.entering?path[1]!:path.at(-1)!;
    const climbAxis=upper.clone().sub(lower).normalize();
    const top=upper.clone().addScaledVector(normal,-.22).addScaledVector(climbAxis,.7);
    const bottom=lower.clone().addScaledVector(normal,-.22).addScaledVector(climbAxis,-.84);
    const axis=top.clone().sub(bottom),length=axis.length(),count=Math.max(2,Math.min(100,Math.ceil(length/.28))),tangent=axis.clone().normalize();
    const rung=(n:number)=>bottom.clone().addScaledVector(axis,n/count);
    let index=0;const inverse=root.matrixWorld.clone().invert(),dummy=new T.Object3D(),unit=new T.Vector3(0,1,0);
    const segment=(a:T.Vector3,b:T.Vector3)=>{a=a.clone().applyMatrix4(inverse);b=b.clone().applyMatrix4(inverse);dummy.position.copy(a).add(b).multiplyScalar(.5);dummy.quaternion.setFromUnitVectors(unit,b.clone().sub(a).normalize());dummy.scale.set(1,a.distanceTo(b),1);dummy.updateMatrix();this.object.setMatrixAt(index++,dummy.matrix);};
    for(const side of [-1,1]){
      const offset=across.clone().multiplyScalar(side*.26),end=top.clone().add(offset);
      segment(bottom.clone().add(offset),end);
      // 绳索上端固定在真实鞍座处，随待机呼吸微调。
      const seat=root.getObjectByName('Seat')?.getWorldPosition(new T.Vector3())??(t.entering?path.at(-1)!:path[0]!);
      segment(end,seat.clone().add(offset));
    }
    for(let n=0;n<=count;n++){const p=rung(n);segment(p.clone().addScaledVector(across,-.26),p.clone().addScaledVector(across,.26));}
    this.object.count=index;this.object.instanceMatrix.needsUpdate=true;
    const hip=rider?.getObjectByName('pelvis');if(!hip)return;
    const pelvis=hip.getWorldPosition(new T.Vector3()),projected=T.MathUtils.clamp(pelvis.clone().sub(bottom).dot(tangent)/length,0,1);
    const seat=t.entering?path.at(-1)!:path[0]!;
    const weight=T.MathUtils.smoothstep(pelvis.distanceTo(seat),.15,.9)*T.MathUtils.smoothstep(pelvis.y-lower.y,-.1,.4);
    const target=(height:number,width:number,joint?:string)=>{
      const ideal=joint?rider!.getObjectByName(joint)!.getWorldPosition(new T.Vector3()):pelvis.clone().add(new T.Vector3(0,height,0));
      const n=T.MathUtils.clamp(Math.round(ideal.clone().sub(bottom).dot(tangent)/length*count),0,count);
      return rung(n).addScaledVector(across,width);
    };
    // 相邻踏棍交错，关节求解只旋转、不改变人体骨长。
    return {hands:[target(0,.23,'upperarm_l'),target(0,-.23,'upperarm_r')],feet:[target(-.69,.16),target(-.49,-.16)],normal,across,weight:projected>0?weight:0};
  }
  dispose(){this.object.geometry.dispose();(this.object.material as T.Material).dispose();this.object.dispose();this.object.removeFromParent();}
}

export function fitDragonClimb(actor:T.Object3D,c:DragonClimbContacts):void{
  const aim=(bone:T.Object3D,child:T.Object3D,to:T.Vector3)=>{
    const origin=bone.getWorldPosition(new T.Vector3()),from=child.getWorldPosition(new T.Vector3()).sub(origin).normalize();
    const rotation=bone.getWorldQuaternion(new T.Quaternion()).premultiply(new T.Quaternion().setFromUnitVectors(from,to.clone().sub(origin).normalize()));
    if(bone.parent)rotation.premultiply(bone.parent.getWorldQuaternion(new T.Quaternion()).invert());
    bone.quaternion.copy(rotation);bone.updateWorldMatrix(false,true);
  };
  for(const [n,side] of ['l','r'].entries())for(const arm of [true,false]){
    const upper=actor.getObjectByName((arm?'upperarm_':'thigh_')+side),lower=actor.getObjectByName((arm?'lowerarm_':'calf_')+side),end=actor.getObjectByName((arm?'hand_':'foot_')+side);
    if(!upper||!lower||!end)continue;
    const a=upper.getWorldPosition(new T.Vector3()),b=lower.getWorldPosition(new T.Vector3()),e=end.getWorldPosition(new T.Vector3()),l1=a.distanceTo(b),l2=b.distanceTo(e),target=(arm?c.hands:c.feet)[n]!;
    const delta=target.clone().sub(a),d=T.MathUtils.clamp(delta.length(),Math.abs(l1-l2)+.001,l1+l2-.001),direction=delta.normalize();
    const pole=c.normal.clone().multiplyScalar(arm?1:-1).addScaledVector(c.across,(n===0?1:-1)*.4);pole.addScaledVector(direction,-pole.dot(direction)).normalize();
    const along=(l1*l1-l2*l2+d*d)/(2*d),height=Math.sqrt(Math.max(0,l1*l1-along*along)),bend=a.clone().addScaledVector(direction,along).addScaledVector(pole,height);
    const uq=upper.quaternion.clone(),lq=lower.quaternion.clone();
    aim(upper,lower,bend);aim(lower,end,a.clone().addScaledVector(direction,d));
    upper.quaternion.slerp(uq,1-c.weight);lower.quaternion.slerp(lq,1-c.weight);upper.updateWorldMatrix(false,true);
  }
}
