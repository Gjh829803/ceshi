import {AircraftRiderPose} from './motion-families/aircraft/rider-pose';
import type {ModelLoadOptions} from '../model-loader';
import {setObjectColor,validateObjectColor,type ObjectColorBinding} from '../object-color';
import {fitUnicycleFeet} from './unicycle-rider';
import {raiseMountedFeet,RIDER_SHOE_CONTACT_RISE} from './rider-foot-clearance';
import {fitDragonClimb,type DragonClimbContacts} from './motion-families/flying-creature/mount-ladder';
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
  apply(weight = 1, mode: 'unicycle' | 'ride' | 'drive' | 'sled' | 'ski' | 'paddling' = 'ride') {
    this.restore(); this.actor.updateWorldMatrix(true, true);
    this.actor.getWorldQuaternion(this.actorRotation).normalize();
    for (const { bone, child, side, joint, base } of this.entries) {
      base.copy(bone.quaternion);
      // Fixed seat fitting only: controls never drive the rider's limbs.
      if(joint==='spine')continue;
      if(joint==='upperarm')this.targetDirection.set(side*.35,-1,.1);
      else if(joint==='lowerarm')this.targetDirection.set(0,-.25,1);
      else if(mode==='unicycle'){
        if(joint==='thigh')this.targetDirection.set(side*.2,-1,.4);
        else if(joint==='calf')this.targetDirection.set(0,-1,-.2);
        else this.targetDirection.set(0,-.02,1);
      }else if(mode==='ski'){
        if(joint==='thigh')this.targetDirection.set(side*.09,-1,.42);
        else if(joint==='calf')this.targetDirection.set(0,-1,-.42);
        else this.targetDirection.set(0,-.02,1);
      }else if(mode==='paddling'){
        if(joint==='thigh')this.targetDirection.set(side*.12,-.04,1);
        else if(joint==='calf')this.targetDirection.set(0,-.08,1);
        else this.targetDirection.set(0,.1,1);
      }else if(mode==='sled'){
        if(joint==='thigh')this.targetDirection.set(side*1.15,-.06,1);
        else if(joint==='calf')this.targetDirection.set(side*.15,-.70,.85);
        else this.targetDirection.set(side*.06,-.02,1);
      }else if(joint==='thigh')this.targetDirection.set(side*(mode==='ride'?.85:.16),mode==='ride'?-.62:-.1,mode==='ride'?.15:1);
      else if(joint==='calf')this.targetDirection.set(side*.03,-1,-.08);
      else this.targetDirection.set(side*.12,-.1,1);
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
  private colorBinding?:ObjectColorBinding;
  private authoredColor:string|null=null;
  /** Author-selected sRGB color, independent of controls, camera and gameplay roles. */
  get color():string|null{return this.authoredColor;}
  /** May be configured before load. Null restores the supplied materials. */
  setColor(color:string|null):void{
    if(this.disposed)throw new Error('CHARACTER_DISPOSED');
    const next=color===null?null:validateObjectColor(color);
    if(next===null){this.colorBinding?.dispose();delete this.colorBinding;}
    else if(this.source)this.colorBinding=setObjectColor(this.source.root,next);
    this.authoredColor=next;
  }
  private attachments?: CharacterAttachments;
  private firstPersonBody?: FirstPersonBody;
  private readonly eyeOffset = new T.Vector3();
  private overlay?: MountedRiderPose;
  private aircraftOverlay?: AircraftRiderPose;
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
    let attachments:CharacterAttachments|undefined,overlay:MountedRiderPose|undefined,firstPersonBody:FirstPersonBody|undefined,colorBinding:ObjectColorBinding|undefined;
    try{
      attachments=new CharacterAttachments(source.root);
      overlay=new MountedRiderPose(source.root);
      firstPersonBody=new FirstPersonBody(source.root);
      if(this.authoredColor!==null)colorBinding=setObjectColor(source.root,this.authoredColor);
      const nodes=new Set<T.Object3D>([this.actor]);source.root.traverse(node=>nodes.add(node));
      this.actor.add(source.root);
      this.source=source;this.attachments=attachments;this.overlay=overlay;this.firstPersonBody=firstPersonBody;
      this.presentationNodes=nodes;this.previousPose=[];this.currentPose=[];this.snapPose=true;this.loaded=true;
      if(colorBinding)this.colorBinding=colorBinding;
    }catch(error){
      try{cleanupCharacter([()=>colorBinding?.dispose(),()=>firstPersonBody?.dispose(),()=>overlay?.restore(),()=>attachments?.dispose(),()=>source.dispose()]);}catch{/* Preserve binding failure. */}
      throw error;
    }
  }
  async load(assetBaseUrl?:string|((logicalPath:string)=>string),options:ModelLoadOptions={}) {
    if(this.disposed)throw new Error('CHARACTER_DISPOSED');
    if(this.source)return;
    if(this.loading)return this.loading;
    const loading=SourceCharacter.load(assetBaseUrl,options).then(source=>{
      if(this.disposed){source.dispose();throw new Error('CHARACTER_LOAD_STALE');}
      this.adopt(source);
    });
    this.loading=loading;
    try{await loading;}finally{if(this.loading===loading)delete this.loading;}
  }
  /** Captures source identity without retaining this actor's model or mixer. */
  createFactory():(()=>Promise<Character>)|undefined{
    if(this.disposed||!this.loaded||!this.source)throw new Error('CHARACTER_NOT_LOADED');
    const factory=this.source.createFactory(),color=this.authoredColor;
    return factory?async()=>{const character=new Character(await factory());try{character.setColor(color);return character;}catch(error){character.dispose();throw error;}}:undefined;
  }
  async createInstance():Promise<Character>{
    const factory=this.createFactory();if(!factory)throw new Error('SOURCE_CHARACTER_FACTORY_UNAVAILABLE');return factory();
  }
  dispose():void{
    if(this.disposed)return;this.disposed=true;this.loaded=false;
    const firstPersonBody=this.firstPersonBody,overlay=this.overlay,aircraftOverlay=this.aircraftOverlay,attachments=this.attachments,source=this.source;
    delete this.firstPersonBody;delete this.aircraftOverlay;delete this.overlay;delete this.attachments;delete this.source;
    this.presentationNodes.clear();this.previousPose=[];this.currentPose=[];
    cleanupCharacter([()=>this.colorBinding?.dispose(),()=>firstPersonBody?.dispose(),()=>overlay?.restore(),()=>attachments?.dispose(),()=>aircraftOverlay?.restore(),()=>source?.dispose(),()=>this.root.removeFromParent()]);
    delete this.colorBinding;
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

  fitDragonClimb(contacts:DragonClimbContacts):void{if(this.source)fitDragonClimb(this.source.root,contacts);}
  update(dt: number, pose: HumanoidRenderState) {
    const source = this.source; if (!source) return;
    this.applyPresentationPose(1);
    this.aircraftOverlay?.restore();this.overlay?.restore(); this.actor.position.set(0, 0, 0); this.actor.quaternion.identity(); this.carriedAttachment = null;
    const mode = pose.mounted ?? null;
    const mounted = mode !== null;
    // 翼装地面准备仍由正常步行动画驱动，不属于固定载具坐姿。
    const fixedMountedPose = mounted && mode !== 'wingsuit-ready';
    const boarding=pose.dragonMount,progress=boarding?.progress??1;
    const rideWeight=boarding?T.MathUtils.clamp(boarding.entering?(progress-.65)/.35:1-progress/.25,0,1):1;
    const identity = pose.simulationIdentity;
    if (identity !== this.simulationIdentity || mode !== this.mountedMode) {this.frame = emptyFrame();this.snapPose=true;}
    this.simulationIdentity = identity; this.mountedMode = mode;
    Object.assign(this.frame, pose);
    this.frame.locomotionTargetSpeed=pose.locomotionTargetSpeed;
    // Position and heading already belong to the host root. Keep source-local
    // placement independent while passing action state through.
    this.frame.position = this.localPosition; this.frame.facing = this.localFacing;
    if (fixedMountedPose) {
      Object.assign(this.frame, emptyFrame(), { position: this.localPosition, facing: this.localFacing });
      const standing=mode==='stand'||mode==='ski'||mode==='wingsuit';
      this.frame.skills={pose:{key:standing?'idle':'sit-idle',time:0},seated:null,carrying:null,active:null,syncCarried:()=>{}};
      if(boarding&&rideWeight<.99)this.frame.skills={pose:{key:boarding.entering?'climb-up':'climb-down',time:progress*3},seated:null,carrying:null,active:null,syncCarried:()=>{}};
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
    if(fixedMountedPose)source.smoothing=false;
    try{source.update(dt,this.frame);}finally{source.smoothing=smoothing;}
    if(mode==='wingsuit'||mode==='paraglider'){
      // Equipment modes use a fixed flight posture, independent of control input.
      (this.aircraftOverlay??=new AircraftRiderPose(source.root)).apply(1,mode);
      this.actor.updateWorldMatrix(true,true);
      source.bones.pelvis!.getWorldPosition(this.hipOffset);this.actor.worldToLocal(this.hipOffset);
      this.actor.rotation.x=mode==='wingsuit'?Math.PI/2:0;
      this.actor.position.copy(this.hipOffset).applyQuaternion(this.actor.quaternion).negate();
    } else if (mounted && mode !== 'stand' && mode !== 'wingsuit-ready') {
      this.overlay!.apply(rideWeight, mode === 'unicycle' ? 'unicycle' : mode === 'paddling' ? 'paddling' : mode === 'ski' ? 'ski' : mode === 'sled' ? 'sled' : (mode === 'ride'||mode==='atv') ? 'ride' : 'drive');
      // Align the true source pelvis with the host's seat/saddle attachment.
      this.actor.updateWorldMatrix(true, true);
      source.bones.pelvis!.getWorldPosition(this.hipOffset); this.actor.worldToLocal(this.hipOffset);
      this.actor.position.copy(this.hipOffset).negate();
      if(mode==='unicycle'){
        this.actor.position.y+=.074;
        fitUnicycleFeet(source.root,this.root);
      }
      if(mode==='atv'||mode==='tank'||mode==='submarine'||mode==='paddling')raiseMountedFeet(source.root,this.root,RIDER_SHOE_CONTACT_RISE);
      if(mode==='sled')raiseMountedFeet(source.root,this.root,.006);
    }
    this.root.updateWorldMatrix(true, true);
  }
}
