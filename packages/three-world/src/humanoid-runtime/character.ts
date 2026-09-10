import {fitUnicycleFeet} from './unicycle-rider';
import {poseKayakHands} from './kayak-visual';
import {fitAtvHands} from './atv-rider';
import * as T from 'three';
import {CharacterAttachments,type CharacterAttachmentPoint,type CharacterAttachmentTransform} from './character-attachments';
export type {CharacterAttachmentPoint,CharacterAttachmentTransform} from './character-attachments';
import { FirstPersonBody } from './first-person-body';
import { Character as SourceCharacter } from './humanoid/source-character';
import type { HumanoidRenderState, SourceCharacterFrame } from './humanoid/animation';
export type { HumanoidRenderState } from './humanoid/animation';

/** Seat/saddle overlay measures each bone-to-child direction in the Source101 rig. */
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
    const spine=actor.getObjectByName('spine_01'),next=actor.getObjectByName('spine_02');
    if(spine&&next)this.entries.push({bone:spine,child:next,side:0,joint:'spine',base:new T.Quaternion()});
  }
  restore() {
    if (!this.applied) return;
    for (const { bone, base } of this.entries) bone.quaternion.copy(base);
    this.applied = false;
  }
  apply(weight = 1, mode: 'unicycle' | 'ride' | 'drive' | 'sled' | 'ski' | 'paddling' = 'ride', sled?:HumanoidRenderState['sledPose'], unicycle?:HumanoidRenderState['unicyclePose']) {
    this.restore(); this.actor.updateWorldMatrix(true, true);
    this.actor.getWorldQuaternion(this.actorRotation).normalize();
    for (const { bone, child, side, joint, base } of this.entries) {
      base.copy(bone.quaternion);
      if(joint==='spine'&&mode!=='ski'&&mode!=='unicycle')continue;
      if(mode==='unicycle'){
        const time=unicycle?.balanceTime??0,turn=unicycle?.balance??0,down=unicycle?.footDown??1;
        const sway=Math.sin(time*2.7)*.10+Math.sin(time*4.3)*.035;
        if(joint==='spine')this.targetDirection.set(-turn*.12+sway*.18,1,.035);
        else if(joint==='upperarm')this.targetDirection.set(side,-.22-down*.22+side*(sway+turn*.20),.06+Math.sin(time*2.1+side)*.10);
        else if(joint==='lowerarm')this.targetDirection.set(side*.9,.12+side*sway,.28+side*turn*.2);
        else if(joint==='thigh')this.targetDirection.set(side*.2,-1,.4);
        else if(joint==='calf')this.targetDirection.set(0,-1,-.2);
        else this.targetDirection.set(0,-.02,1);
      }else
      if(mode==='ski'){
        const turn=sled?.steer??0,push=sled?.push??0;
        if(joint==='spine')this.targetDirection.set(-turn*.38,1,.2);
        else if(joint==='thigh')this.targetDirection.set(side*.09,-1,.42);
        else if(joint==='calf')this.targetDirection.set(0,-1,-.42);
        else if(joint==='foot')this.targetDirection.set(0,-.02,1);
        else if(joint==='upperarm')this.targetDirection.set(side*.6,-.8,.25-push*.25);
        else this.targetDirection.set(side*.12,-.25,.9-push*.45);
      }
      else if(mode==='paddling'){
        if(joint==='thigh')this.targetDirection.set(side*.12,-.04,1);
        else if(joint==='calf')this.targetDirection.set(0,-.08,1);
        else if(joint==='foot')this.targetDirection.set(0,.1,1);
        else if(joint==='upperarm')this.targetDirection.set(side*.3,-.4,.7);
        else this.targetDirection.set(-side*.1,.1,1);
      }
      else if (mode === 'sled') {
        // Feet stay outside the narrow wooden seat. A low calf drop keeps the
        // supplied human's soles above the runners instead of through the floor.
        const drag=Math.max(sled?.brake??0,Math.max(0,-side*(sled?.steer??0))*.7);
        const push=sled?.push??0;
        if(joint==='thigh')this.targetDirection.set(side*1.15,-.06-drag*.28-push*.25,1);
        else if(joint==='calf')this.targetDirection.set(side*.15,-.70-drag*.65-push*.5,.85-drag*.48-push*.48);
        else if(joint==='foot')this.targetDirection.set(side*.06,-.02,1);
        else if(joint==='upperarm')this.targetDirection.set(side*.25,-.65,.65);
        else this.targetDirection.set(-side*.1,-.12,1);
      }
      else if (joint === 'thigh') this.targetDirection.set(side * (mode === 'ride' ? .85 : .16), mode === 'ride' ? -.62 : -.1, mode === 'ride' ? .15 : 1);
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

function cleanupCharacter(steps:(()=>void)[]):void {
  const failures:unknown[]=[];
  for(const step of steps)try{step();}catch(error){failures.push(error);}
  if(failures.length)throw new AggregateError(failures,'CHARACTER_CLEANUP_FAILED');
}

const emptyFrame = (): SourceCharacterFrame => ({
  position: new T.Vector3(), facing: new T.Vector3(0, 0, 1), motionSerial: 0,
  traversal: null, completedMotion: null, speed: 0, vertical: 0,
  grounded: true, animationGrounded: true, stance: 'stand', swimming: false,
  swimStyle: 'breaststroke', animationEvent: null, surface: null, skills: null,
});

/** Root placement and action rendering for the provided humanoid.
 * root is set by the host's common interpolated presentation. The inner source
 * root retains its authored swim offset; no model scaling or retargeting occurs.
 */
export class Character {
  readonly root = new T.Group();
  readonly actor = new T.Group();
  loaded = false;
  carriedAttachment: { id: string; position: T.Vector3 } | null = null;
  private source?: SourceCharacter;
  private disposed=false;
  private loading?:Promise<void>;
  private attachments?: CharacterAttachments;
  private firstPersonBody?: FirstPersonBody;
  private readonly eyeOffset = new T.Vector3();
  private overlay?: MountedRiderPose;
  private frame = emptyFrame();
  private localPosition = new T.Vector3();
  private localFacing = new T.Vector3(0, 0, 1);
  private simulationIdentity: object | undefined;
  private mountedMode: HumanoidRenderState['mounted'] = null;
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
  get attachmentPoints():readonly CharacterAttachmentPoint[]{return this.attachments?.points??[];}
  /** Caller owns the object's geometry/materials; detach before reusing it elsewhere. */
  attach(point:CharacterAttachmentPoint,object:T.Object3D,transform?:CharacterAttachmentTransform):()=>void {
    if(!this.attachments)throw new Error('CHARACTER_ATTACHMENT_NOT_READY');
    return this.attachments.attach(point,object,transform);
  }
  get sourceCharacter() { return this.source; }
  get motionSources() { return this.source?.motionSources ?? []; }
  get availableHumanoidClips() { return new Set(Object.keys(this.source?.actions ?? {})); }
  get clipLabel() { return this.source?.clipLabel ?? '加载中'; }
  get phase() { return this.source?.phase ?? 0; }
  get hip() { return this.source?.bones.pelvis; }
  setFirstPerson(active: boolean): void { this.firstPersonBody?.setActive(active); }
  presentFirstPerson(active:boolean):(()=>void)|undefined{return this.firstPersonBody?.present(active);}
  /** 使用动画求值后的头部位置，方向仍由相机负责，避免翻滚动画强制翻转视线。 */
  eyePosition(target: T.Vector3): boolean {
    const head = this.source?.bones.head;
    if (!head) return false;
    this.root.updateWorldMatrix(true, true);
    head.getWorldPosition(target);
    this.eyeOffset.set(0, .06, .08).transformDirection(this.root.matrixWorld).multiplyScalar(.1);
    target.add(this.eyeOffset);
    return true;
  }
  private adopt(source: SourceCharacter) {
    let attachments:CharacterAttachments|undefined,overlay:MountedRiderPose|undefined,firstPersonBody:FirstPersonBody|undefined;
    try{
      attachments=new CharacterAttachments(source.root);
      overlay=new MountedRiderPose(source.root);
      firstPersonBody=new FirstPersonBody(source.root);
      const nodes=new Set<T.Object3D>([this.actor]);source.root.traverse(node=>nodes.add(node));
      this.actor.add(source.root);
      this.source=source;this.attachments=attachments;this.overlay=overlay;this.firstPersonBody=firstPersonBody;
      this.presentationNodes=nodes;this.previousPose=[];this.currentPose=[];this.snapPose=true;this.loaded=true;
    }catch(error){
      try{cleanupCharacter([()=>firstPersonBody?.dispose(),()=>overlay?.restore(),()=>attachments?.dispose(),()=>source.dispose()]);}catch{/* Preserve binding failure. */}
      throw error;
    }
  }
  async load(assetBaseUrl?:string|((logicalPath:string)=>string)) {
    if(this.disposed)throw new Error('CHARACTER_DISPOSED');
    if(this.source)return;
    if(this.loading)return this.loading;
    const loading=SourceCharacter.load(assetBaseUrl).then(source=>{
      if(this.disposed){source.dispose();throw new Error('CHARACTER_LOAD_STALE');}
      this.adopt(source);
    });
    this.loading=loading;
    try{await loading;}finally{if(this.loading===loading)delete this.loading;}
  }
  dispose():void{
    if(this.disposed)return;this.disposed=true;this.loaded=false;
    const firstPersonBody=this.firstPersonBody,overlay=this.overlay,attachments=this.attachments,source=this.source;
    delete this.firstPersonBody;delete this.overlay;delete this.attachments;delete this.source;
    this.presentationNodes.clear();this.previousPose=[];this.currentPose=[];
    cleanupCharacter([()=>firstPersonBody?.dispose(),()=>overlay?.restore(),()=>attachments?.dispose(),()=>source?.dispose(),()=>this.root.removeFromParent()]);
  }

  /** Internal presentation correction. Physics and the managed root stay untouched. */
  alignMountedPelvis(anchorWorld: T.Matrix4): void {
    const pelvis = this.hip;
    if (!pelvis || !this.actor.parent) return;
    this.actor.parent.updateWorldMatrix(true, false);
    const local = this.actor.parent.matrixWorld.clone().invert().multiply(anchorWorld);
    const desired = new T.Vector3(), rotation = new T.Quaternion(), scale = new T.Vector3();
    local.decompose(desired, rotation, scale);
    if (!local.elements.every(Number.isFinite) || local.determinant() <= 0) throw new Error('VEHICLE_SEAT_ANCHOR_INVALID');
    this.actor.position.set(0, 0, 0);
    this.actor.quaternion.copy(rotation);
    this.actor.updateWorldMatrix(false, true);
    const actual = this.actor.parent.worldToLocal(pelvis.getWorldPosition(new T.Vector3()));
    this.actor.position.copy(desired).sub(actual);
    this.actor.updateWorldMatrix(false, true);
  }

  update(dt: number, pose: HumanoidRenderState) {
    const source = this.source; if (!source) return;
    this.applyPresentationPose(1);
    this.overlay?.restore(); this.actor.position.set(0, 0, 0); this.actor.quaternion.identity(); this.carriedAttachment = null;
    const mode = pose.mounted ?? null;
    const mounted = mode !== null;
    const identity = pose.simulationIdentity;
    if (identity !== this.simulationIdentity || mode !== this.mountedMode) {this.frame = emptyFrame();this.snapPose=true;}
    this.simulationIdentity = identity; this.mountedMode = mode;
    Object.assign(this.frame, pose);
    // Position and heading already belong to the host root. Keep source-local
    // placement independent while passing action state through.
    this.frame.position = this.localPosition; this.frame.facing = this.localFacing;
    if (mounted) {
      Object.assign(this.frame, emptyFrame(), { position: this.localPosition, facing: this.localFacing });
      if (mode !== 'stand' && mode !== 'ski') this.frame.skills = { pose: { key: 'sit-idle', time: 0 }, seated: null, carrying: null, active: null, syncCarried: () => {} };
    } else if (pose.skills) {
      const carrying = pose.skills.carrying;
      this.frame.skills = { ...pose.skills, syncCarried: position => {
        if (carrying) this.carriedAttachment = { id: carrying, position: position.clone() };
      } };
    }
    this.root.updateWorldMatrix(true, true);
    const smoothing=source.smoothing;
    // An enclosed driver must have its calibrated full sitting pose even on the
    // entry/reset boundary. Do not blend a standing body through the cabin roof.
    if(mode==='unicycle'||mode==='submarine'||mode==='tank'||mode==='atv')source.smoothing=false;
    try{source.update(dt,this.frame);}finally{source.smoothing=smoothing;}
    if (mounted && mode !== 'stand') {
      this.overlay!.apply(1, mode === 'unicycle' ? 'unicycle' : mode === 'paddling' ? 'paddling' : mode === 'ski' ? 'ski' : mode === 'sled' ? 'sled' : (mode === 'ride'||mode==='atv') ? 'ride' : 'drive', pose.sledPose,pose.unicyclePose);
      // Align the true source pelvis with the host's seat/saddle attachment.
      this.actor.updateWorldMatrix(true, true);
      source.bones.pelvis!.getWorldPosition(this.hipOffset); this.actor.worldToLocal(this.hipOffset);
      this.actor.position.copy(this.hipOffset).negate();
      if(mode==='unicycle'&&pose.unicyclePose){
        const down=pose.unicyclePose.footDown;
        const smooth=(t:number)=>t*t*(3-2*t);
        // Step behind the saddle to plant a foot without carrying the opposite
        // hip across the fork. Source101's visible pelvis extends below its bone:
        // lift it 55 mm onto the cushion, then clear the rear edge before lowering.
        this.actor.position.x+=.02*down;
        this.actor.position.y+=.055-.175*smooth(Math.max(0,(down-.6)/.4));
        this.actor.position.z-=.30*smooth(Math.min(1,down/.6));
        fitUnicycleFeet(source.root,this.root,pose.unicyclePose);
      }
      if(mode==='atv')fitAtvHands(source.root,this.root,pose.atvSteeringAngle??0);
    }
    this.root.updateWorldMatrix(true, true);
    if(mode==='paddling'&&pose.kayakPose)poseKayakHands(this.root,pose.kayakPose);
  }
}
