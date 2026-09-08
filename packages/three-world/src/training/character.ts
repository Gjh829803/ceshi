import * as T from 'three';
import { Character as SourceCharacter } from './humanoid/source-character';
import type { HumanoidRenderState, SourceCharacterFrame } from './humanoid/animation';
export type { HumanoidRenderState } from './humanoid/animation';

/** Temporary vehicle-only overlay, separate from the original authored clips.
 * Source101 uses different local bone axes from the retired UAL65 character.
 * Measure each bone-to-child direction instead of assuming a local axis.
 */
export class MountedRiderPose {
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
  apply(weight = 1, mode: 'ride' | 'drive' = 'ride') {
    this.restore(); this.actor.updateWorldMatrix(true, true);
    this.actor.getWorldQuaternion(this.actorRotation).normalize();
    for (const { bone, child, side, joint, base } of this.entries) {
      base.copy(bone.quaternion);
      if (joint === 'thigh') this.targetDirection.set(side * (mode === 'ride' ? .85 : .16), mode === 'ride' ? -.62 : -.1, mode === 'ride' ? .15 : 1);
      else if (joint === 'calf') this.targetDirection.set(side * .03, -1, -.08);
      else if (joint === 'foot') this.targetDirection.set(side * .12, -.1, 1);
      else if (joint === 'upperarm') this.targetDirection.set(side * .3, -.6, .7);
      else this.targetDirection.set(-side * .1, .1, 1);
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

const emptyFrame = (): SourceCharacterFrame => ({
  position: new T.Vector3(), facing: new T.Vector3(0, 0, 1), motionSerial: 0,
  traversal: null, completedMotion: null, speed: 0, vertical: 0,
  grounded: true, animationGrounded: true, stance: 'stand', swimming: false,
  swimStyle: 'breaststroke', animationEvent: null, surface: null, skills: null,
});

/** Host placement wrapper around the unchanged traversal-lab animation class.
 * root is set by the host's common interpolated presentation. The inner source
 * root retains its authored swim offset; no model scaling or retargeting occurs.
 */
export class Character {
  readonly root = new T.Group();
  readonly actor = new T.Group();
  loaded = false;
  carriedAttachment: { id: string; position: T.Vector3 } | null = null;
  private source?: SourceCharacter;
  private overlay?: MountedRiderPose;
  private frame = emptyFrame();
  private localPosition = new T.Vector3();
  private localFacing = new T.Vector3(0, 0, 1);
  private fallbackIdentity = {};
  private simulationIdentity: object = this.fallbackIdentity;
  private mountedMode: 'stand' | 'drive' | 'ride' | null = null;
  private fallbackName = '';
  private fallbackTime = 0;
  // Source nodes are registered on adoption. Later author-added visual children
  // are not animation-owned, so their evaluated locals survive repeated frames.
  private presentationNodes=new Set<T.Object3D>([this.actor]);
  private previousPose: {node:T.Object3D;position:T.Vector3;rotation:T.Quaternion;scale:T.Vector3}[] = [];
  private currentPose: typeof this.previousPose = [];
  private snapPose = true;
  /** Snapshot source locals only after the single fixed animation evaluation. */
  capturePresentationPose():void {
    this.previousPose=this.currentPose;
    this.currentPose=[];
    for(const node of this.presentationNodes)this.currentPose.push({node,position:node.position.clone(),rotation:node.quaternion.clone(),scale:node.scale.clone()});
    if(this.snapPose||this.previousPose.length!==this.currentPose.length){this.previousPose=this.currentPose;this.snapPose=false;}
  }
  applyPresentationPose(alpha:number):void {
    this.currentPose.forEach((pose,index)=>{
      const previous=this.previousPose[index]!;
      pose.node.position.lerpVectors(previous.position,pose.position,alpha);
      pose.node.quaternion.slerpQuaternions(previous.rotation,pose.rotation,alpha);
      pose.node.scale.lerpVectors(previous.scale,pose.scale,alpha);
    });
  }
  private hipOffset = new T.Vector3();
  constructor(source?: SourceCharacter) {
    this.root.name = 'Host_Character'; this.root.add(this.actor);
    if (source) this.adopt(source);
  }
  get sourceCharacter() { return this.source; }
  get motionSources() { return this.source?.motionSources ?? []; }
  get availableHumanoidClips() { return new Set(Object.keys(this.source?.actions ?? {})); }
  get clipLabel() { return this.source?.clipLabel ?? '加载中'; }
  get phase() { return this.source?.phase ?? 0; }
  get hip() { return this.source?.bones.pelvis; }
  private adopt(source: SourceCharacter) {
    this.source = source; this.actor.add(source.root);
    this.presentationNodes=new Set([this.actor]);
    source.root.traverse(node=>this.presentationNodes.add(node));
    this.previousPose=[];this.currentPose=[];this.snapPose=true;
    this.overlay = new MountedRiderPose(source.root); this.loaded = true;
  }
  async load(assetBaseUrl?:string|((logicalPath:string)=>string)) { if (!this.source) this.adopt(await SourceCharacter.load(assetBaseUrl)); }
  dispose():void{this.presentationNodes.clear();this.previousPose=[];this.currentPose=[];this.overlay?.restore();this.source?.dispose();delete this.source;delete this.overlay;this.loaded=false;this.root.removeFromParent();}

  private legacyFrame(dt: number, name: string, speed: number) {
    if (name !== this.fallbackName) { this.fallbackName = name; this.fallbackTime = 0; }
    this.fallbackTime += Math.max(0, dt);
    const state = emptyFrame(); state.speed = speed;
    state.swimming = name.startsWith('Swim'); state.animationGrounded = !state.swimming;
    const key = ({ Jump_Start: 'jump-stand', Jump_Loop: 'fall-loop', Jump_Land: 'land-light', Sitting_Enter: 'sit-enter', Sitting_Exit: 'sit-exit' } as Record<string,string>)[name];
    if (key && this.source?.actions[key]) state.surface = { pose: { key, time: Math.min(this.fallbackTime, this.source.actions[key]!.getClip().duration) } };
    return state;
  }

  update(dt: number, name: string, speed: number, seated: boolean, riding = false, pose?: HumanoidRenderState) {
    const source = this.source; if (!source) return;
    this.applyPresentationPose(1);
    this.overlay?.restore(); this.actor.position.set(0, 0, 0); this.carriedAttachment = null;
    const mode = pose?.mounted !== undefined ? pose.mounted : riding ? 'ride' : seated || name === 'Driving_Loop' ? 'drive' : null;
    const mounted = mode !== null;
    const identity = pose?.simulationIdentity ?? this.fallbackIdentity;
    if (identity !== this.simulationIdentity || mode !== this.mountedMode) {this.frame = emptyFrame();this.snapPose=true;}
    this.simulationIdentity = identity; this.mountedMode = mode;
    const input = pose ?? this.legacyFrame(dt, name, speed);
    Object.assign(this.frame, input);
    // Position and heading already belong to the host root. Keep source-local
    // placement independent while passing every other original field unchanged.
    this.frame.position = this.localPosition; this.frame.facing = this.localFacing;
    if (mounted) {
      Object.assign(this.frame, emptyFrame(), { position: this.localPosition, facing: this.localFacing });
      if (mode !== 'stand') this.frame.skills = { pose: { key: 'sit-idle', time: 0 }, seated: null, carrying: null, active: null, syncCarried: () => {} };
    } else if (input.skills) {
      const carrying = input.skills.carrying;
      this.frame.skills = { ...input.skills, syncCarried: position => {
        if (carrying) this.carriedAttachment = { id: carrying, position: position.clone() };
      } };
    }
    this.root.updateWorldMatrix(true, true);
    source.update(dt, this.frame);
    if (mounted && mode !== 'stand') {
      this.overlay!.apply(1, mode === 'ride' ? 'ride' : 'drive');
      // Align the true source pelvis with the host's seat/saddle attachment.
      this.actor.updateWorldMatrix(true, true);
      source.bones.pelvis!.getWorldPosition(this.hipOffset); this.actor.worldToLocal(this.hipOffset);
      this.actor.position.copy(this.hipOffset).negate();
    }
    this.root.updateWorldMatrix(true, true);
  }
}
