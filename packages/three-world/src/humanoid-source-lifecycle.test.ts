import {readFile} from 'node:fs/promises';
import {afterEach,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import catalog from '../../../assets/three-creator/asset-catalog.json';
import {Character as SourceCharacter} from './humanoid-runtime/humanoid/source-character';
import {Character} from './humanoid-runtime/character';

const sources:SourceCharacter[]=[],characters:Character[]=[];
afterEach(()=>{for(const actor of characters.splice(0))actor.dispose();for(const actor of sources.splice(0))actor.dispose();vi.restoreAllMocks();vi.unstubAllGlobals();});
function resources(options:{fail?:()=>boolean;gate?:Promise<void>}={}){
  const definition=catalog.assets.find(asset=>asset.id==='humanoid.source-101')!;
  const paths=new Map(definition.resources!.map(resource=>[resource.path,resource.sourcePath]));
  const counts=new Map<string,number>();
  vi.stubGlobal('ProgressEvent',class extends Event{constructor(type:string,init:object){super(type);Object.assign(this,init);}});
  vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{
    const uri=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    const logical=decodeURIComponent(new URL(uri).pathname.slice(1));counts.set(logical,(counts.get(logical)??0)+1);
    if(options.gate)await options.gate;
    if(options.fail?.()&&logical.endsWith('idle-loop.metadata.json'))return new Response(null,{status:500});
    const file=paths.get(logical);if(!file)throw new Error(`Unexpected resource ${logical}`);
    return new Response(await readFile(file));
  });
  return {resolve:(logical:string)=>`https://source-lifecycle.test/${logical}`,counts};
}
function mesh(actor:SourceCharacter){let found:THREE.SkinnedMesh|undefined;actor.root.traverse(node=>{if(!found&&(node as THREE.SkinnedMesh).isSkinnedMesh)found=node as THREE.SkinnedMesh;});return found!;}

it('shares immutable model sources while isolating three skeletons, mixers, clips and mutable materials',async()=>{
  const {resolve,counts}=resources();
  const actors=await Promise.all([SourceCharacter.load(resolve),SourceCharacter.load(resolve),SourceCharacter.load(logical=>resolve(logical))]);sources.push(...actors);
  expect(Math.max(...counts.values())).toBe(1);
  const [a,b,c]=actors as [SourceCharacter,SourceCharacter,SourceCharacter],ma=mesh(a),mb=mesh(b),mc=mesh(c);
  expect(ma.geometry).toBe(mb.geometry);expect(mb.geometry).toBe(mc.geometry);
  expect(ma.skeleton).not.toBe(mb.skeleton);expect(ma.skeleton.boneInverses[0]).not.toBe(mb.skeleton.boneInverses[0]);expect(a.bones.root).not.toBe(b.bones.root);expect(a.mixer).not.toBe(b.mixer);
  expect(ma.material).not.toBe(mb.material);expect(a.actions.walk!.getClip()).not.toBe(b.actions.walk!.getClip());
  const pose=b.bones.calf_l!.quaternion.clone();a.actions.idle!.setEffectiveWeight(0);a.actions.walk!.setEffectiveWeight(1);a.actions.walk!.time=.23;a.mixer.update(0);
  expect(a.bones.calf_l!.quaternion.angleTo(pose)).toBeGreaterThan(.01);expect(b.bones.calf_l!.quaternion.equals(pose)).toBe(true);
  const materialA=(Array.isArray(ma.material)?ma.material[0]:ma.material) as THREE.MeshStandardMaterial;
  const materialB=(Array.isArray(mb.material)?mb.material[0]:mb.material) as THREE.MeshStandardMaterial;
  const color=materialB.color.clone();materialA.color.setRGB(.1,.2,.3);expect(materialB.color.equals(color)).toBe(true);
  const sharedDispose=vi.spyOn(ma.geometry,'dispose');
  a.dispose();a.dispose();expect(sharedDispose).not.toHaveBeenCalled();
  b.actions.idle!.setEffectiveWeight(0);b.actions.walk!.setEffectiveWeight(1);b.actions.walk!.time=.31;b.mixer.update(0);expect(b.bones.calf_l!.quaternion.angleTo(pose)).toBeGreaterThan(.01);
  b.dispose();expect(sharedDispose).not.toHaveBeenCalled();c.dispose();expect(sharedDispose).toHaveBeenCalledOnce();
  const again=await SourceCharacter.load(resolve);sources.push(again);expect(Math.max(...counts.values())).toBe(2);expect(mesh(again).geometry).not.toBe(ma.geometry);
});

it('releases all loaded model resources on a partial bundle failure and permits a clean retry',async()=>{
  let fail=true;const {resolve,counts}=resources({fail:()=>fail});
  const dispose=vi.spyOn(THREE.BufferGeometry.prototype,'dispose');
  await expect(SourceCharacter.load(resolve)).rejects.toThrow('元数据加载失败');
  expect(dispose).toHaveBeenCalled();fail=false;
  const actor=await SourceCharacter.load(resolve);sources.push(actor);expect(actor.clipCount).toBe(48);
  expect(counts.get('humanoid/source/gasp-research/idle-loop.metadata.json')).toBe(2);
});

it('keeps the source factory usable after every model lease and its geometry are released',async()=>{
  const {resolve,counts}=resources(),actor=new Character();characters.push(actor);await actor.load(resolve);
  const factory=actor.createFactory()!,geometry=mesh(actor.sourceCharacter!).geometry,disposed=vi.spyOn(geometry,'dispose');
  actor.dispose();expect(disposed).toHaveBeenCalledOnce();
  const replacement=await factory();characters.push(replacement);expect(replacement.loaded).toBe(true);
  expect(mesh(replacement.sourceCharacter!).geometry).not.toBe(geometry);expect(Math.max(...counts.values())).toBe(2);
});

it('does not adopt an asynchronously loaded source after the character was disposed',async()=>{
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});const {resolve}=resources({gate});
  const actor=new Character(),survivor=new Character();characters.push(actor,survivor);
  const pending=actor.load(resolve),alive=survivor.load(resolve);
  actor.dispose();const rejection=expect(pending).rejects.toThrow('CHARACTER_LOAD_STALE');release();
  await Promise.all([rejection,alive]);expect(actor.loaded).toBe(false);expect(actor.root.children).not.toContain(actor.sourceCharacter?.root);
  expect(survivor.loaded).toBe(true);expect(survivor.availableHumanoidClips.size).toBe(48);
});

it('keeps an existing instance alive when another material clone fails',async()=>{
  const {resolve,counts}=resources();const actor=await SourceCharacter.load(resolve);sources.push(actor);
  const liveMesh=mesh(actor),geometryDispose=vi.spyOn(liveMesh.geometry,'dispose');
  const liveMaterial=Array.isArray(liveMesh.material)?liveMesh.material[0]!:liveMesh.material;
  const materialDispose=vi.spyOn(liveMaterial,'dispose');
  vi.spyOn(THREE.Material.prototype,'clone').mockImplementationOnce(()=>{throw new Error('CLONE_FAILED');});
  await expect(SourceCharacter.load(resolve)).rejects.toThrow('CLONE_FAILED');
  expect(geometryDispose).not.toHaveBeenCalled();expect(materialDispose).not.toHaveBeenCalled();
  const clone=await SourceCharacter.load(resolve);sources.push(clone);expect(mesh(clone).geometry).toBe(liveMesh.geometry);expect(Math.max(...counts.values())).toBe(1);
});

it('rolls back an adoption failure without retaining a hidden source lease',async()=>{
  const {resolve}=resources();const survivor=await SourceCharacter.load(resolve);sources.push(survivor);
  const geometry=mesh(survivor).geometry,dispose=vi.spyOn(geometry,'dispose');
  const actor=new Character();characters.push(actor);
  vi.spyOn(THREE.BufferGeometry.prototype,'clone').mockImplementationOnce(()=>{throw new Error('FIRST_PERSON_CLONE_FAILED');});
  await expect(actor.load(resolve)).rejects.toThrow('FIRST_PERSON_CLONE_FAILED');
  expect(actor.loaded).toBe(false);expect(actor.sourceCharacter).toBeUndefined();
  survivor.dispose();expect(dispose).toHaveBeenCalledOnce();
  await actor.load(resolve);expect(actor.loaded).toBe(true);
});

it('releases the source even if a first-person geometry disposal listener throws',async()=>{
  const {resolve}=resources();const actor=new Character();characters.push(actor);await actor.load(resolve);
  const object=mesh(actor.sourceCharacter!),shared=object.geometry,dispose=vi.spyOn(shared,'dispose');
  actor.setFirstPerson(true);expect(object.geometry).not.toBe(shared);
  object.geometry.addEventListener('dispose',()=>{throw new Error('LISTENER_FAILED');});
  expect(()=>actor.dispose()).toThrow();expect(actor.loaded).toBe(false);expect(actor.sourceCharacter).toBeUndefined();
  expect(dispose).toHaveBeenCalledOnce();expect(()=>actor.dispose()).not.toThrow();
});

it('instantiates the same immutable source without inheriting live animation or requiring the original owner',async()=>{
  const {resolve,counts}=resources();const original=new Character();characters.push(original);await original.load(resolve);
  original.root.position.set(4,2,6);original.sourceCharacter!.actions.walk!.time=.25;
  const next=await original.createInstance();characters.push(next);
  expect(next.root.position.toArray()).toEqual([0,0,0]);expect(next.availableHumanoidClips.size).toBe(48);
  expect(next.sourceCharacter!.actions.walk!.time).toBe(0);expect(Math.max(...counts.values())).toBe(1);
  original.dispose();const third=await next.createInstance();characters.push(third);
  expect(third.loaded).toBe(true);expect(mesh(third.sourceCharacter!).geometry).toBe(mesh(next.sourceCharacter!).geometry);
  expect(Math.max(...counts.values())).toBe(1);
});
