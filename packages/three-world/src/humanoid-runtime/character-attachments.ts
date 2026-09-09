import {Group,Quaternion,type Object3D} from 'three';

const POINTS = {
  head: {bone:'head',offset:[0,.16,0]},
  back: {bone:'spine_05',offset:[0,-.06,-.14]},
  handLeft: {bone:'hand_l',offset:[0,0,0]},
  handRight: {bone:'hand_r',offset:[0,0,0]},
  footLeft: {bone:'foot_l',offset:[0,0,0]},
  footRight: {bone:'foot_r',offset:[0,0,0]},
} as const;
export type CharacterAttachmentPoint = keyof typeof POINTS;
export interface CharacterAttachmentTransform {
  /** Metres in calibrated initial-reference axes (+Y up, +Z forward), before actor scaling. */
  readonly positionMetersXYZ?: readonly [number,number,number];
  /** Local XYZ Euler rotation, radians. */
  readonly rotationRadiansXYZ?: readonly [number,number,number];
  readonly scale?: number;
}

/** Rigid visual attachments only; bones and caller-owned resources stay untouched. */
export class CharacterAttachments {
  private readonly slots = new Map<CharacterAttachmentPoint,Group>();
  private readonly releases = new Set<()=>void>();
  constructor(root:Object3D) {
    root.updateWorldMatrix(true,true);
    const rootRotation=root.getWorldQuaternion(new Quaternion());
    for(const [point,definition] of Object.entries(POINTS)) {
      const bone=root.getObjectByName(definition.bone);
      if(!bone || bone.type!=='Bone')continue;
      const frame=new Group();frame.name=`attachment:${point}`;
      // Calibrate once against the adopted source's initial pose (Source101 is
      // already sampled at idle time zero). Later bone motion carries the slot.
      frame.quaternion.copy(bone.getWorldQuaternion(new Quaternion()).invert().multiply(rootRotation));
      frame.position.fromArray(definition.offset).applyQuaternion(frame.quaternion);
      bone.add(frame);this.slots.set(point as CharacterAttachmentPoint,frame);
    }
  }
  get points():readonly CharacterAttachmentPoint[]{return [...this.slots.keys()];}
  attach(point:CharacterAttachmentPoint,object:Object3D,transform:CharacterAttachmentTransform={}):()=>void {
    const slot=this.slots.get(point);
    if(!slot)throw new Error(`CHARACTER_ATTACHMENT_SLOT_UNAVAILABLE: ${point}`);
    for(let parent:Object3D|null=slot;parent;parent=parent.parent)if(parent===object)throw new Error('CHARACTER_ATTACHMENT_CYCLE');
    if(object.parent)throw new Error('CHARACTER_ATTACHMENT_OBJECT_PARENTED');
    const {positionMetersXYZ:position=[0,0,0],rotationRadiansXYZ:rotation=[0,0,0],scale=1}=transform;
    if(position.length!==3||rotation.length!==3||![...position,...rotation,scale].every(Number.isFinite)||scale<=0)throw new Error('CHARACTER_ATTACHMENT_TRANSFORM_INVALID');
    const mount=new Group();mount.name=`attachment-content:${point}`;
    mount.position.set(...position);mount.rotation.set(...rotation);mount.scale.setScalar(scale);
    slot.add(mount);mount.add(object);
    let attached=true;
    const detach=()=>{
      if(!attached)return;attached=false;
      if(object.parent===mount)mount.remove(object);
      mount.removeFromParent();this.releases.delete(detach);
    };
    this.releases.add(detach);return detach;
  }
  dispose():void {
    for(const detach of [...this.releases])detach();
    for(const slot of this.slots.values())slot.removeFromParent();
    this.slots.clear();
  }
}
