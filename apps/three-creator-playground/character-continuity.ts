import type {WorldObservation,WorldSnapshot} from '@worldkit/three';
import type {Mesh,Object3D,Skeleton,Bone,BufferGeometry} from 'three';

interface VisualBinding {
 mesh:Mesh;
 geometry:BufferGeometry;
 skeleton:Skeleton|undefined;
 bones:readonly Bone[];
}
interface Baseline {root:Object3D;instanceId:string;visuals:readonly VisualBinding[]}
export interface CharacterContinuity {
 readonly advisory:true;
 readonly status:'observed'|'issues'|'unavailable';
 readonly issues:readonly string[];
 readonly evidence:{
  readonly instanceId:string;readonly rootUuid:string;readonly baselineRootUuid:string;
  readonly mountedInstanceId:string|null;readonly meshCount:number;readonly renderableMeshCount:number;
 }|null;
 readonly scope:string;
}
const scope='Training character visual continuity from the first ready observation. This does not prove preset asset provenance, pixel visibility, animation ownership or absence of an extra rider. Inspect opening, mounted, dismounted and reset frames.';
function visuals(root:Object3D):VisualBinding[]{
 const result:VisualBinding[]=[];
 root.traverse(object=>{
  const mesh=object as Mesh & {skeleton?:Skeleton};
  if(mesh.isMesh)result.push({mesh,geometry:mesh.geometry,skeleton:mesh.skeleton,bones:[...(mesh.skeleton?.bones??[])]});
 });
 return result;
}
function renderable(mesh:Mesh,world:WorldObservation):boolean{
 let attached=false;
 for(let node:Object3D|null=mesh;node;node=node.parent){
  if(!node.visible||[node.scale.x,node.scale.y,node.scale.z].some(value=>!Number.isFinite(value)||value===0))return false;
  if(node===world.scene)attached=true;
 }
 const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
 return attached&&mesh.layers.test(world.camera.layers)&&materials.some(material=>material.visible&&material.colorWrite&&(!material.transparent||material.opacity>0));
}
function sameVisuals(before:readonly VisualBinding[],after:readonly VisualBinding[]):boolean{
 return before.length===after.length&&before.every(binding=>{
  const current=after.find(value=>value.mesh===binding.mesh);
  return current?.geometry===binding.geometry&&current.skeleton===binding.skeleton
   &&current.bones.length===binding.bones.length&&current.bones.every((bone,index)=>bone===binding.bones[index]);
 });
}

/** Host observation only. Never changes visibility, parenting, bones or SDK state. */
export class CharacterContinuityMonitor {
 // The SDK reinstalls its public observer on start; the live scene survives pause/reset.
 private readonly baselines=new WeakMap<Object3D,Baseline>();
 read(world:WorldObservation,snapshot:WorldSnapshot|null):CharacterContinuity {
  const unavailable=(code:string):CharacterContinuity=>({advisory:true,status:'unavailable',issues:[code],evidence:null,scope});
  const character=snapshot?.training?.character;
  if(!character)return unavailable('CHARACTER_TELEMETRY_UNAVAILABLE');
  const root=Object.hasOwn(world.targets,character.instanceId)?world.targets[character.instanceId]:
   snapshot.controlledEntityId===character.instanceId?world.player:undefined;
  if(!root)return unavailable('CHARACTER_ROOT_UNOBSERVED');
  const current=visuals(root);
  let baseline=this.baselines.get(world.scene);
  if(!baseline){
   if(!current.some(value=>value.bones.length>0))return unavailable('CHARACTER_RIG_UNOBSERVED');
   baseline={root,instanceId:character.instanceId,visuals:current};this.baselines.set(world.scene,baseline);
  }
  const issues:string[]=[];
  if(root!==baseline.root||character.instanceId!==baseline.instanceId)issues.push('CHARACTER_ROOT_REPLACED');
  if(!sameVisuals(baseline.visuals,current))issues.push('CHARACTER_VISUAL_REPLACED');
  const renderableMeshCount=current.filter(value=>renderable(value.mesh,world)).length;
  if(!current.length||renderableMeshCount<current.length)issues.push('CHARACTER_VISUAL_HIDDEN');
  return {advisory:true,status:issues.length?'issues':'observed',issues,scope,evidence:{
   instanceId:character.instanceId,rootUuid:root.uuid,baselineRootUuid:baseline.root.uuid,
   mountedInstanceId:snapshot.training!.mountedInstanceId,meshCount:current.length,renderableMeshCount,
  }};
 }
}

/** Preserve intermediate failures even when the character is restored before inspection. */
export function summarizeCharacterContinuity(samples:readonly {wallSeconds?:number;simulationTick?:number|null;characterContinuity?:CharacterContinuity}[]){
 const events:Array<{wallSeconds:number|null;simulationTick:number|null;observation:CharacterContinuity}>=[];
 const issues=new Set<string>();let previous:string|undefined,totalTransitions=0;
 for(const sample of samples){
  const observation=sample.characterContinuity;if(!observation)continue;
  observation.issues.forEach(issue=>issues.add(issue));
  const key=JSON.stringify(observation);if(key===previous)continue;previous=key;totalTransitions++;
  events.push({wallSeconds:sample.wallSeconds??null,simulationTick:sample.simulationTick??null,observation});
  if(events.length>128)events.shift();
 }
 return {advisory:true,issues:[...issues],events,totalTransitions,omittedTransitions:Math.max(0,totalTransitions-events.length),scope};
}
