import type {WorldObservation,WorldSnapshot} from '@worldkit/three';
import {Matrix4,Vector3,type Mesh,type Object3D,type Skeleton,type Bone,type BufferGeometry,type Material,type SkinnedMesh} from 'three';

interface VisualBinding {
 mesh:Mesh;
 geometry:BufferGeometry;
 skeleton:Skeleton|undefined;
 bones:readonly Bone[];
}
interface Baseline {root:Object3D;instanceId:string;visuals:readonly VisualBinding[];geometryInitialized:boolean}
export interface CharacterContinuity {
 readonly advisory:true;
 readonly status:'observed'|'partial'|'issues'|'unavailable'|'not-applicable';
 readonly issues:readonly string[];
 readonly evidence:{
  readonly instanceId:string;readonly rootUuid:string;readonly baselineRootUuid:string;
  readonly mountedInstanceId:string|null;readonly meshCount:number;readonly renderableMeshCount:number;
  readonly geometryIdentity:'checked'|'deferred-first-person'|'unobserved';
 }|null;
 readonly scope:string;
}
const scope='Player skinned character continuity from the first ready observation. First-person geometry identity is deferred because the SDK temporarily clips head geometry; empty indexed meshes are excluded from visibility checks in that view. Rigid equipment is outside the identity comparison. This does not prove preset asset provenance, pixel visibility, animation ownership or absence of an extra rider. Inspect opening, mounted, dismounted and reset frames.';
function visuals(root:Object3D):VisualBinding[]{
 const result:VisualBinding[]=[];
 root.traverse(object=>{
  const mesh=object as SkinnedMesh;
  if(mesh.isSkinnedMesh)result.push({mesh,geometry:mesh.geometry,skeleton:mesh.skeleton,bones:[...(mesh.skeleton?.bones??[])]});
 });
 return result;
}
/** Read the transform Three will use, without updating authored or cached matrices. */
function effectiveWorldMatrix(object:Object3D,cache:Map<Object3D,Matrix4>):Matrix4{
 const existing=cache.get(object);if(existing)return existing;
 const matrix=object.matrixWorldAutoUpdate===false?object.matrixWorld.clone():
  object.matrixAutoUpdate?new Matrix4().compose(object.position,object.quaternion,object.scale):object.matrix.clone();
 if(object.matrixWorldAutoUpdate!==false&&object.parent)matrix.premultiply(effectiveWorldMatrix(object.parent,cache));
 if(!matrix.elements.every(Number.isFinite))throw new Error('Nonfinite character transform');
 cache.set(object,matrix);return matrix;
}
function hasSurfaceTransform(matrix:Matrix4):boolean{
 const x=new Vector3().setFromMatrixColumn(matrix,0),y=new Vector3().setFromMatrixColumn(matrix,1),z=new Vector3().setFromMatrixColumn(matrix,2);
 // Rank two can still render a surface. Only point/line collapse is certainly hidden.
 return x.clone().cross(y).lengthSq()>0||x.clone().cross(z).lengthSq()>0||y.cross(z).lengthSq()>0;
}
function visibleMaterial(material:Material|undefined):boolean{
 return !!material&&material.visible&&material.colorWrite&&(!material.transparent||material.opacity>0);
}
function hasVisibleDraw(mesh:Mesh):boolean{
 const geometry=mesh.geometry,count=geometry.index?.count??geometry.attributes.position?.count??0;
 const start=Math.max(0,geometry.drawRange.start),end=Math.min(count,geometry.drawRange.start+geometry.drawRange.count);
 if(end<=start)return false;
 if(!Array.isArray(mesh.material))return visibleMaterial(mesh.material);
 const materials=mesh.material;
 return geometry.groups.some(group=>Math.min(end,group.start+group.count)>Math.max(start,group.start)
  &&visibleMaterial(group.materialIndex===undefined?undefined:materials[group.materialIndex]));
}
function renderable(mesh:Mesh,world:WorldObservation,matrices:Map<Object3D,Matrix4>):boolean{
 let attached=false;
 for(let node:Object3D|null=mesh;node;node=node.parent){
  if(!node.visible)return false;
  if(node===world.scene)attached=true;
 }
 return attached&&mesh.layers.test(world.camera.layers)&&hasSurfaceTransform(effectiveWorldMatrix(mesh,matrices))&&hasVisibleDraw(mesh);
}
function sameVisuals(before:readonly VisualBinding[],after:readonly VisualBinding[],checkGeometry:boolean):boolean{
 return before.length===after.length&&before.every(binding=>{
  const current=after.find(value=>value.mesh===binding.mesh);
  return !!current&&(!checkGeometry||current.geometry===binding.geometry)&&current.skeleton===binding.skeleton
   &&current.bones.length===binding.bones.length&&current.bones.every((bone,index)=>bone===binding.bones[index]);
 });
}

function unavailable(code:string):CharacterContinuity{
 return {advisory:true,status:'unavailable',issues:[code],evidence:null,scope};
}

/** Host observation only. Never changes visibility, parenting, bones or SDK state. */
export class CharacterContinuityMonitor {
 // The SDK reinstalls its public observer on start; the live scene survives pause/reset.
 private readonly baselines=new WeakMap<Object3D,Baseline>();
 read(world:WorldObservation,snapshot:WorldSnapshot|null):CharacterContinuity {
  try{return this.observe(world,snapshot);}
  catch{return unavailable('CHARACTER_DIAGNOSTICS_UNAVAILABLE');}
 }
 private observe(world:WorldObservation,snapshot:WorldSnapshot|null):CharacterContinuity {
  if(snapshot?.schemaVersion===2&&!snapshot.humanoid&&!this.baselines.has(world.scene))return {advisory:true,status:'not-applicable',issues:[],evidence:null,scope};
  const character=snapshot?.humanoid?.character;
  if(!character)return unavailable('CHARACTER_TELEMETRY_UNAVAILABLE');
  const root=Object.hasOwn(world.targets,character.instanceId)?world.targets[character.instanceId]:
   snapshot.controlledEntityId===character.instanceId?world.controlledObject:undefined;
  if(!root)return unavailable('CHARACTER_ROOT_UNOBSERVED');
  const current=visuals(root);
  const firstPerson=snapshot.humanoid!.cameraMode===1&&snapshot.camera?.mode==='follow';
  let baseline=this.baselines.get(world.scene);
  if(!baseline){
   if(!current.some(value=>value.bones.length>0))return unavailable('CHARACTER_RIG_UNOBSERVED');
   baseline={root,instanceId:character.instanceId,visuals:current,geometryInitialized:!firstPerson};
  }
  const issues:string[]=[];
  if(root!==baseline.root||character.instanceId!==baseline.instanceId)issues.push('CHARACTER_ROOT_REPLACED');
  if(!sameVisuals(baseline.visuals,current,!firstPerson&&baseline.geometryInitialized))issues.push('CHARACTER_VISUAL_REPLACED');
  const matrices=new Map<Object3D,Matrix4>();
  const renderableMeshCount=current.filter(value=>renderable(value.mesh,world,matrices)).length;
  const expectedVisible=firstPerson?current.filter(value=>value.geometry.index?.count!==0):current;
  if(!renderableMeshCount||renderableMeshCount<expectedVisible.length)issues.push('CHARACTER_VISUAL_HIDDEN');
  // Initial first-person geometry is temporary. Capture canonical geometry only
  // in a normal view with the original root, meshes and rig still present.
  if(!firstPerson&&!baseline.geometryInitialized&&!issues.length)baseline={...baseline,visuals:current,geometryInitialized:true};
  this.baselines.set(world.scene,baseline);
  return {advisory:true,status:issues.length?'issues':firstPerson?'partial':'observed',issues,scope,evidence:{
   instanceId:character.instanceId,rootUuid:root.uuid,baselineRootUuid:baseline.root.uuid,
   mountedInstanceId:snapshot.humanoid!.mountedInstanceId,meshCount:current.length,renderableMeshCount,
   geometryIdentity:firstPerson?'deferred-first-person':baseline.geometryInitialized?'checked':'unobserved',
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
