import * as T from 'three';
import {createModelLoader,type ModelLoadOptions} from '../../../model-loader';
import type { MotionPose } from '../../presentation';
import { CreatureFlame } from './flame';
import type { FlyingCreatureStateV1 } from './state';
import {DragonMountLadder} from './mount-ladder';
import type {DragonMountTransition} from './mount';
import {dragonGroundHeading} from './ground-pose';

export interface FlyingCreatureVisualResources extends ModelLoadOptions {dragonUrl:string;flameTextureUrl:string;animationPrefix?:string}
/** 同族骨架的米制模型适配。运动、显示采样和资源释放均由现有 HumanoidRuntime 调用。 */
export class FlyingCreatureVisual {
  readonly root=new T.Group();
  private mixer?:T.AnimationMixer;
  private actions=new Map<string,T.AnimationAction>();
  private diveStart?:T.AnimationAction;
  private blendHistory?:{previousTime:number;time:number;tick:number;previous:Record<string,number>;current:Record<string,number>};
  private flame:CreatureFlame|undefined;
  private seat:T.Object3D|undefined;
  private mouth:T.Object3D|undefined;
  private body?:T.Group;
  private state?:FlyingCreatureStateV1;
  private disposed=false;
  private loading=false;
  private sampleTime=0;
  private groundHeading=0;
  private ladder=new DragonMountLadder();
  constructor(){this.root.add(this.ladder.object);}
  sampleMount(t:DragonMountTransition|undefined,rider:T.Object3D|null){return this.ladder.sample(this.root,t,rider);}
  private reins=[-1,1].map(()=>{
    const line=new T.Line(new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(new Float32Array(17*3),3)),new T.LineBasicMaterial({color:'#463729'}));
    line.name='dragon-rein';line.frustumCulled=false;line.visible=false;this.root.add(line);return line;
  });
  async load(resources:FlyingCreatureVisualResources):Promise<void>{
    if(this.mixer||this.loading||this.disposed)throw new Error('FLYING_CREATURE_VISUAL_NOT_LOADABLE');
    this.loading=true;
    try{
    const loader=createModelLoader(resources.loadTextures===undefined?{}:{loadTextures:resources.loadTextures}),model=await loader.loadAsync(resources.dragonUrl);
    this.body=model.scene;
    if(this.disposed)throw new Error('FLYING_CREATURE_VISUAL_DISPOSED');
    this.root.add(model.scene);
    // glTF 资产以 +X 为前方；旋转到 SDK +Z，仅在导入根处理一次。
    model.scene.rotation.y=-Math.PI/2;
    this.seat=model.scene.getObjectByName('Seat');this.mouth=model.scene.getObjectByName('CenturyFireSocket');
    if(!this.seat||!this.mouth)throw new Error('FLYING_CREATURE_ATTACHMENT_MISSING');
    model.scene.traverse(node=>{if(node instanceof T.Mesh){node.castShadow=node.receiveShadow=true;node.frustumCulled=false;}});
    this.groundHeading=dragonGroundHeading(model.scene,model.animations,resources.animationPrefix??'D01');
    this.mixer=new T.AnimationMixer(model.scene);
    const jaw=model.scene.getObjectByName('Jaw'),jawNames=new Set<string>();jaw?.traverse(node=>jawNames.add(node.name));
    const prefix=resources.animationPrefix??'D01';
    const reference=model.animations.find(clip=>clip.name===prefix+'_TPOSE_Closed');
    for(const suffix of ['Flight_Base','Flight_Base_L','Flight_Base_R','Flight_Base_U','Flight_Base_D','Flight_Fast','Flight_BoostLoop','Flight_Dive','Flight_Hovering','Dodge_L','Dodge_R','Shoot_FlameThrower','Shoot_FlameThrowerLoop','Shoot_FlameThrowerEnd','TPOSE_Closed'])
      if(!model.animations.some(clip=>clip.name===prefix+'_'+suffix))throw new Error('FLYING_CREATURE_CLIP_MISSING:'+prefix+'_'+suffix);
    for(const source of model.animations){
      // 控制器使用稳定的动作角色；每份资产仍使用自己的骨骼轨道和动作时长。
      const role=source.name.startsWith(prefix+'_')?'D01_'+source.name.slice(prefix.length+1):source.name;
      let clip=source;
      if(source.name.includes('FlameThrower')){
        clip=source.clone();clip.tracks=clip.tracks.filter(track=>track.name.endsWith('.quaternion')&&jawNames.has(T.PropertyBinding.parseTrackName(track.name).nodeName??''));
        if(reference)T.AnimationUtils.makeClipAdditive(clip,0,reference,30);
      }
      // Dive 的首尾姿态不同，保留第二个动作实例用于循环接缝过渡。
      if(role==='D01_Flight_Dive'){this.diveStart=this.mixer.clipAction(clip.clone());this.diveStart.play();this.diveStart.setEffectiveWeight(0);}
      const action=this.mixer.clipAction(clip);action.play();action.setEffectiveWeight(0);this.actions.set(role,action);
    }
    const texture=await new T.TextureLoader().loadAsync(resources.flameTextureUrl);
    if(this.disposed){texture.dispose();this.dispose();return;}
    this.flame=new CreatureFlame(texture);this.root.add(this.flame.object);
    }catch(error){this.dispose();throw error;}finally{this.loading=false;}
  }
  private weight(name:string,weight:number,time:number,phase?:number):void{
    const action=this.actions.get(name);if(!action)return;
    action.enabled=true;action.setEffectiveWeight(weight);
    action.time=phase===undefined?time%Math.max(.001,action.getClip().duration):Math.min(.999,Math.max(0,phase))*action.getClip().duration;
    if(name==='D01_Flight_Dive'&&this.diveStart){
      const end=action.getClip().duration,t=T.MathUtils.clamp((action.time-(end-.25))/.25,0,1),mix=t*t*(3-2*t);
      action.setEffectiveWeight(weight*(1-mix));this.diveStart.enabled=true;this.diveStart.time=0;this.diveStart.setEffectiveWeight(weight*mix);
    }
  }
  private flightWeights(pose:MotionPose):Record<string,number>{
    const state=pose.flyingCreature!;
    const hover=1-T.MathUtils.clamp(pose.speed/6,0,1),bank=T.MathUtils.clamp(state.bankRadians/.8,-1,1),pitch=T.MathUtils.clamp(state.pitchRadians/1.05,-1,1);
    const special=state.mode==='evade'?'D01_Dodge_'+(state.evadeDirection<0?'L':'R'):state.mode==='boost'?'D01_Flight_BoostLoop':state.mode==='glide'||state.mode==='dive'?'D01_Flight_Dive':pose.speed>24?'D01_Flight_Fast':null;
    const specialWeight=special?(state.mode==='evade'?Math.sin(Math.PI*(1-state.evadeRemainingSeconds/.45)):T.MathUtils.clamp((pose.speed-12)/15,0,1)):0;
    const directional=(1-hover)*(1-specialWeight),turn=Math.abs(bank)*.55,vertical=Math.abs(pitch)*.4;
    return {'D01_Flight_Hovering':hover,'D01_Flight_Base':directional*(1-turn-vertical),
      [`D01_Flight_Base_${bank>0?'R':'L'}`]:directional*turn,[`D01_Flight_Base_${pitch>0?'U':'D'}`]:directional*vertical,
      ...(special?{[special]:(1-hover)*specialWeight}:{})};
  }
  sample(pose:MotionPose,time:number):void {
    const state=pose.flyingCreature;if(!state||!this.mixer)return;this.state=state;this.sampleTime=time;
    for(const action of this.actions.values())action.setEffectiveWeight(0);this.diveStart?.setEffectiveWeight(0);
    const history=this.blendHistory,weights=this.flightWeights(pose);
    if(history){
      const alpha=history.time>history.previousTime?T.MathUtils.clamp((time-history.previousTime)/(history.time-history.previousTime),0,1):1;
      for(const name of new Set([...Object.keys(weights),...Object.keys(history.previous),...Object.keys(history.current)]))
        weights[name]=T.MathUtils.lerp(history.previous[name]??0,history.current[name]??0,alpha);
    }
    const ground=state.groundBlend??0;
    if(this.actions.has('D01_Ground_Idle')){for(const name of Object.keys(weights))weights[name]!*=1-ground;weights.D01_Ground_Idle=ground;}
    for(const [name,weight] of Object.entries(weights))this.weight(name,weight,time,name.startsWith('D01_Dodge_')?1-state.evadeRemainingSeconds/.45:undefined);
    if(state.flamePhase!=='off'){
      const name='D01_Shoot_FlameThrower'+(state.flamePhase==='loop'?'Loop':state.flamePhase==='ending'?'End':'');
      this.weight(name,1,time,state.flamePhase==='loop'?undefined:state.flamePhaseSeconds/.3);
    }
    this.mixer.update(0);
    if(this.body)this.body.rotation.y=-Math.PI/2-this.groundHeading*ground;
    this.root.updateWorldMatrix(true,true);
    this.flame?.sample(time,this.root);
  }
  /** 仅固定步调用；渲染恢复及多次观察不会重复发射。 */
  commit(pose:MotionPose,epoch:number,time:number):void {
    const state=pose.flyingCreature;if(!state||!this.mouth||!this.flame)return;
    const target=this.flightWeights(pose),history=this.blendHistory;
    if(!history||time<history.time||state.tick<history.tick){
      this.blendHistory={previousTime:time,time,tick:state.tick,previous:{...target},current:target};
    }else if(time>history.time){
      const current:Record<string,number>={},amount=1-Math.exp(-(time-history.time)/.12);
      for(const name of new Set([...Object.keys(history.current),...Object.keys(target)]))current[name]=T.MathUtils.lerp(history.current[name]??0,target[name]??0,amount);
      this.blendHistory={previousTime:history.time,time,tick:state.tick,previous:history.current,current};
    }
    // 混合历史只在固定步推进；发射点、鞍位和之后的相机读取同一份完成姿态。
    this.sample(pose,time);
    const direction=new T.Vector3(0,0,1).applyQuaternion(pose.rotation);
    const emission=state.flamePhase==='off'?0:state.flamePhase==='starting'?Math.min(1,state.flamePhaseSeconds/.3):state.flamePhase==='ending'?Math.max(0,1-state.flamePhaseSeconds/.3):1;
    this.flame.commit(epoch,state.tick,time,emission,this.mouth.getWorldPosition(new T.Vector3()),direction,pose.velocity);
  }
  /** 跟随鞍具的实际位移；剥离厘米骨架缩放，让现有角色保持真实尺寸。 */
  readSeatWorld():T.Matrix4{
    this.root.updateWorldMatrix(true,true);
    const position=this.seat?.getWorldPosition(new T.Vector3())??this.root.getWorldPosition(new T.Vector3());
    const rotation=this.root.getWorldQuaternion(new T.Quaternion());
    position.add(new T.Vector3(0,.06,0).applyQuaternion(rotation));
    // 骑手轻微反向平衡；骨盆仍留在真实鞍位，不改变角色尺寸。
    rotation.multiply(new T.Quaternion().setFromEuler(new T.Euler(-Math.min(.15,(this.state?.speedMetersPerSecond??0)/200),0,-(this.state?.bankRadians??0)*.12)));
    return new T.Matrix4().compose(position,rotation,new T.Vector3(1,1,1));
  }
  sampleReins(rider:T.Object3D|null):void{
    const jaw=this.body?.getObjectByName('Jaw');this.root.updateWorldMatrix(true,true);rider?.updateWorldMatrix(true,true);
    const inverse=this.root.matrixWorld.clone().invert();
    for(const [index,side] of (['l','r'] as const).entries()){
      const line=this.reins[index]!,hand=rider?.getObjectByName('hand_'+side);line.visible=!!hand&&!!jaw;
      if(!hand||!jaw)continue;
      const socket=this.body?.getObjectByName(side==='l'?'CenturyLeashLeft':'CenturyLeashRight');
      const start=hand.getWorldPosition(new T.Vector3()).applyMatrix4(inverse),end=(socket??jaw).getWorldPosition(new T.Vector3()).applyMatrix4(inverse);
      if(!socket){end.x+=(side==='l'?1:-1)*.48;end.y+=.15;}
      const positions=line.geometry.getAttribute('position') as T.BufferAttribute;
      for(let n=0;n<17;n++){const t=n/16,point=start.clone().lerp(end,t);point.y-=Math.sin(Math.PI*t)*.22;positions.setXYZ(n,point.x,point.y,point.z);}
      positions.needsUpdate=true;
    }
  }
  inspect(){return {sampleTimeSeconds:this.sampleTime,flameParticles:this.flame?.object.geometry.drawRange.count??0,
    clips:[...this.actions.values(),...(this.diveStart?[this.diveStart]:[])].filter(action=>action.getEffectiveWeight()>0).map(action=>({name:action.getClip().name+(action===this.diveStart?' (loop seam)':''),weight:action.getEffectiveWeight(),time:action.time})),
    attachments:Object.fromEntries(['Seat','Head','Jaw','CenturyFireSocket'].map(name=>[name,this.body?.getObjectByName(name)?.getWorldPosition(new T.Vector3()).toArray()]))};}
  dispose():void{
    this.ladder.dispose();
    this.disposed=true;this.flame?.dispose();this.flame=undefined;this.mixer?.stopAllAction();if(this.body)this.mixer?.uncacheRoot(this.body);
    for(const line of this.reins){line.geometry.dispose();(line.material as T.Material).dispose();line.removeFromParent();}
    const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();
    this.body?.traverse(node=>{if(node instanceof T.Mesh){geometries.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material]){materials.add(material);for(const value of Object.values(material))if(value instanceof T.Texture)textures.add(value);}}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());this.body?.removeFromParent();delete this.body;delete this.mixer;this.actions.clear();delete this.diveStart;delete this.blendHistory;this.root.removeFromParent();
  }
}
