import * as T from 'three';
/** Aircraft equipment poses only; other vehicle fitting stays in its own overlay. */
export class AircraftRiderPose {
  private entries: { bone: T.Object3D; child: T.Object3D; side: number; joint: string; base: T.Quaternion }[] = [];
  private applied = false;
  private actorRotation = new T.Quaternion();
  private boneRotation = new T.Quaternion();
  private parentInverse = new T.Quaternion();
  private delta = new T.Quaternion();
  private currentDirection = new T.Vector3();
  private targetDirection = new T.Vector3();
  private point = new T.Vector3();
  constructor(private actor: T.Object3D) {
    for (const [side, sign] of [['l', 1], ['r', -1]] as const) {
      for (const [joint, childName] of [['thigh','calf'],['calf','foot'],['foot','ball'],['upperarm','lowerarm'],['lowerarm','hand']] as const) {
        const bone = actor.getObjectByName(`${joint}_${side}`), child = actor.getObjectByName(`${childName}_${side}`);
        if (bone && child) this.entries.push({ bone, child, side: sign, joint, base: new T.Quaternion() });
      }
    }
  }
  restore() {
    if (!this.applied) return;
    for (const { bone, base } of this.entries) bone.quaternion.copy(base);
    this.applied = false;
  }
  apply(weight = 1, mode: 'ride' | 'drive' | 'wingsuit' | 'paraglider' = 'ride', canopyBlend = 0) {
    this.restore(); this.actor.updateWorldMatrix(true, true);
    this.actor.getWorldQuaternion(this.actorRotation).normalize();
    for (const { bone, child, side, joint, base } of this.entries) {
      base.copy(bone.quaternion);
      if (joint === 'thigh') this.targetDirection.set(side * (mode === 'ride' ? .85 : .16), mode === 'ride' ? -.62 : -.1, mode === 'ride' ? .15 : 1);
      else if (joint === 'calf') this.targetDirection.set(side * .03, -1, -.08);
      else if (joint === 'foot') this.targetDirection.set(side * .12, -.1, 1);
      else if (joint === 'upperarm') this.targetDirection.set(side * .3, -.6, .7);
      else this.targetDirection.set(-side * .1, .1, 1);
      if(mode==='wingsuit'){
        if(joint==='thigh')this.targetDirection.set(side*.28,-1,0);
        else if(joint==='calf')this.targetDirection.set(0,-1,0);
        else if(joint==='foot')this.targetDirection.set(0,-.3,1);
        else this.targetDirection.set(side, -.2, .05);
      }else if(mode==='paraglider'){
        if(joint==='upperarm')this.targetDirection.set(side*.55,.7,.2);
        else if(joint==='lowerarm')this.targetDirection.set(0,1,.1);
      }
      if(mode==='wingsuit'&&canopyBlend>0){
        const target=joint==='thigh'?new T.Vector3(side*.16,-.1,1):joint==='calf'?new T.Vector3(side*.03,-1,-.08):joint==='foot'?new T.Vector3(side*.12,-.1,1):joint==='upperarm'?new T.Vector3(side*.55,.7,.2):new T.Vector3(0,1,.1);
        this.targetDirection.normalize().lerp(target.normalize(),canopyBlend);
      }
      this.targetDirection.normalize().applyQuaternion(this.actorRotation);
      child.getWorldPosition(this.currentDirection); bone.getWorldPosition(this.point);
      this.currentDirection.sub(this.point).normalize();
      if (this.currentDirection.lengthSq() < .5) continue;
      this.delta.setFromUnitVectors(this.currentDirection, this.targetDirection);
      bone.getWorldQuaternion(this.boneRotation).normalize().premultiply(this.delta);
      if (bone.parent) {
        bone.parent.getWorldQuaternion(this.parentInverse).normalize().invert();
        this.boneRotation.premultiply(this.parentInverse);
      }
      bone.quaternion.copy(base).slerp(this.boneRotation.normalize(), T.MathUtils.clamp(weight, 0, 1));
      bone.updateWorldMatrix(false, true);
    }
    this.applied = true;
  }
}

