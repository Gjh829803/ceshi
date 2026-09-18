import {readFile} from 'node:fs/promises';
import {afterEach,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import catalog from '../../../assets/three-creator/asset-catalog.json';
import {Character as SourceCharacter} from './humanoid-runtime/humanoid/source-character';
import {Character} from './humanoid-runtime/character';

const sources:SourceCharacter[]=[],characters:Character[]=[];

afterEach(()=>{for(const actor of characters.splice(0))actor.dispose();for(const actor of sources.splice(0))actor.dispose();vi.restoreAllMocks();vi.unstubAllGlobals();});
function resources(options:{fail?:()=>boolean;gate?:Promise<void>;manifestModel?:()=>string;modelAliases?:Record<string,string>;failManifest?:()=>boolean}={}){
  const definition=catalog.assets.find(asset=>asset.id==='humanoid.uefn-mannequin')!;
  const paths=new Map(definition.resources!.map(resource=>[resource.path,resource.sourcePath]));
  for(const [relative,sourcePath] of Object.entries(options.modelAliases??{}))paths.set(`humanoid/source/${relative}`,sourcePath);
  const counts=new Map<string,number>(),requestedUrls:string[]=[];
  vi.stubGlobal('ProgressEvent',class extends Event{constructor(type:string,init:object){super(type);Object.assign(this,init);}});
  vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{
    const uri=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    requestedUrls.push(uri);
    const logical=decodeURIComponent(new URL(uri).pathname.slice(1));counts.set(logical,(counts.get(logical)??0)+1);
    if(options.gate)await options.gate;
    if(options.failManifest?.()&&logical.endsWith('/manifest.json'))return new Response(null,{status:500});
    if(options.fail?.()&&logical.endsWith('idle-loop.metadata.json'))return new Response(null,{status:500});
    const file=paths.get(logical);if(!file)throw new Error(`Unexpected resource ${logical}`);
    const bytes=await readFile(file);
    if(logical.endsWith('/manifest.json')&&options.manifestModel){
      const manifest=JSON.parse(bytes.toString());manifest.model=options.manifestModel();return Response.json(manifest);
    }
    return new Response(bytes);
  });
  return {resolve:(logical:string)=>paths.has(logical)?`https://source-lifecycle.test/${logical}`:undefined as unknown as string,counts,requestedUrls};
}
function mesh(actor:SourceCharacter){let found:THREE.SkinnedMesh|undefined;actor.root.traverse(node=>{if(!found&&(node as THREE.SkinnedMesh).isSkinnedMesh)found=node as THREE.SkinnedMesh;});return found!;}

it.each([['ShiftLeft',60],['ShiftRight',120]] as const)('returns to the original walking gait after releasing %s while W stays held at %i Hz',async(shift,hz)=>{
 const {resolve}=resources(),actor=new Character();characters.push(actor);await actor.load(resolve);
 const {createWorld}=await import('./world');
 const {getDefaultProfile}=await import('@worldkit/preset-content/platform/profiles');
 const world=await createWorld({camera:new THREE.PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{
  map:{id:'gait-release',name:'Gait release',description:'',bounds:{min:[-100,-10,-100],max:[100,20,100]},boxes:[{id:'floor',position:[0,-.5,0],size:[200,1,200]}],water:[],regions:[],spawns:[],playerSpawn:[0,.03,0]},
  character:{instanceId:'person',object:actor.root,animation:actor},vehicles:[],
 }});
 try{
  world.humanoid!.applyProfile({character:getDefaultProfile('person')!.control});
  const engine=(world as unknown as {engine:import('./engine').WorldEngine}).engine,source=actor.sourceCharacter!;
  engine.keyboard.enabled=true;
  const advance=(seconds:number)=>{for(let n=0;n<Math.round(seconds*hz);n++){engine.advance(1/hz);engine.render();}};
  advance(.5);engine.keyboard.keyDown('KeyW');advance(1);expect(source.weights.walk).toBeGreaterThan(.9);
  engine.keyboard.keyDown(shift);advance(1);expect(source.weights.run).toBeGreaterThan(.9);
  engine.keyboard.keyUp(shift);advance(1/60);
  expect(world.humanoid!.inspectControls().lastApplied!.input).toMatchObject({forward:1,boost:false});
  advance(.4);expect(source.weights.walk).toBeGreaterThan(.9);expect(source.weights.run).toBeLessThan(.1);
  advance(1);expect(source.weights.walk).toBeGreaterThan(.99);
  engine.keyboard.keyDown(shift);advance(.6);expect(source.weights.run).toBeGreaterThan(.9);
  // A single contact-seam correction while sprint is held must not select walk.
  const {readHumanoid}=await import('./humanoid-runtime/humanoid/render-state');
  actor.update(1/60,{...readHumanoid(world.humanoid!.simulation.controlledActor.controller)!,speed:0});
  expect(source.weights.run).toBeGreaterThan(.9);
  // Faster normal movement still uses the existing running gait without Shift.
  world.humanoid!.applyProfile({character:{speed:3.8,maxSpeed:5.8}});
  engine.keyboard.keyUp(shift);advance(1);expect(source.weights.run).toBeGreaterThan(.99);
 }finally{world.dispose();}
});

it('keeps author colors independent across real humanoid factories, views and source disposal',async()=>{
 const {resolve}=resources(),actor=new Character();characters.push(actor);actor.setColor('#3a8fc4');await actor.load(resolve);
 const model=(person:Character)=>{let result:THREE.SkinnedMesh|undefined;person.root.traverse(node=>{if(!result&&(node as THREE.SkinnedMesh).isSkinnedMesh)result=node as THREE.SkinnedMesh;});return result!;};
 const material=(person:Character)=>{const m=model(person).material;return (Array.isArray(m)?m[0]:m) as THREE.MeshStandardMaterial;};
 const a=model(actor),geometry=a.geometry,bones=a.skeleton.bones,originalMaterial=material(actor),factory=actor.createFactory()!;
 const second=await factory();characters.push(second);expect(second.color).toBe('#3a8fc4');second.setColor('#c65743');
 expect(material(actor).color.getHexString()).toBe('3a8fc4');expect(material(second).color.getHexString()).toBe('c65743');
 expect(model(second).geometry).toBe(geometry);expect(model(second).skeleton.bones).not.toBe(bones);
 actor.setFirstPerson(true);actor.setFirstPerson(false);expect(a.geometry).toBe(geometry);expect(material(actor)).toBe(originalMaterial);
 const release=vi.spyOn(originalMaterial,'dispose');actor.dispose();expect(release).toHaveBeenCalledOnce();
 const third=await factory();characters.push(third);expect(third.color).toBe('#3a8fc4');expect(material(third)).not.toBe(material(second));
 third.setColor(null);expect(third.color).toBeNull();expect(material(third).color.getHexString()).toBe('ffffff');
 expect(material(second).color.getHexString()).toBe('c65743');expect(()=>second.setColor('#oops')).toThrow('OBJECT_COLOR_INVALID');
 expect(second.color).toBe('#c65743');
});

it('shares immutable model sources while isolating three skeletons, mixers, clips and mutable materials',async()=>{
  const {resolve,counts}=resources();
  const actors=await Promise.all([SourceCharacter.load(resolve),SourceCharacter.load(resolve),SourceCharacter.load(logical=>resolve(logical))]);sources.push(...actors);
  expect(Math.max(...counts.values())).toBe(1);
  const [a,b,c]=actors as [SourceCharacter,SourceCharacter,SourceCharacter],ma=mesh(a),mb=mesh(b),mc=mesh(c);
  expect(ma.name).toBe('UEFN_Mannequin_BlackJoints_LOD1_Medium');
  expect(counts.get('humanoid/source/manifest.json')).toBe(1);
  expect(counts.get('humanoid/source/uefn-mannequin-lod1.glb')).toBe(1);
  expect(ma.geometry).toBe(mb.geometry);expect(mb.geometry).toBe(mc.geometry);
  expect(ma.skeleton).not.toBe(mb.skeleton);expect(ma.skeleton.boneInverses[0]).not.toBe(mb.skeleton.boneInverses[0]);expect(a.bones.root).not.toBe(b.bones.root);expect(a.mixer).not.toBe(b.mixer);
  expect(ma.material).not.toBe(mb.material);expect(a.actions.walk!.getClip()).not.toBe(b.actions.walk!.getClip());
  const pose=b.bones.calf_l!.quaternion.clone();a.actions.idle!.setEffectiveWeight(0);a.actions.walk!.setEffectiveWeight(1);a.actions.walk!.time=.23;a.mixer.update(0);
  expect(a.bones.calf_l!.quaternion.angleTo(pose)).toBeGreaterThan(.01);expect(b.bones.calf_l!.quaternion.equals(pose)).toBe(true);
  const materialA=(Array.isArray(ma.material)?ma.material[0]:ma.material) as THREE.MeshStandardMaterial;
  const materialB=(Array.isArray(mb.material)?mb.material[0]:mb.material) as THREE.MeshStandardMaterial;
  expect(materialA.transparent).toBe(false);expect(materialA.depthWrite).toBe(true);
  expect(materialA.map).toBeNull();expect(materialB.map).toBeNull();
  expect(materialA.normalMap).toBeNull();expect(materialB.normalMap).toBeNull();
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

it('rejects an undeclared manifest model before loading graphics and permits a corrected manifest retry',async()=>{
  let model='unregistered.glb';const {resolve,counts}=resources({manifestModel:()=>model});
  await expect(SourceCharacter.load(resolve)).rejects.toThrow('HUMANOID_MODEL_RESOURCE_UNDECLARED');
  expect([...counts.keys()]).toEqual(['humanoid/source/manifest.json']);
  model='uefn-mannequin-lod1.glb';const actor=await SourceCharacter.load(resolve);sources.push(actor);
  expect(mesh(actor).name).toBe('UEFN_Mannequin_BlackJoints_LOD1_Medium');
  expect(counts.get('humanoid/source/manifest.json')).toBe(2);
});


it('loads an alternate declared model filename and keeps the factory URL closure after its caller changes',async()=>{
  const model='skins/alternate.glb';
  const {resolve,counts,requestedUrls}=resources({manifestModel:()=>model,modelAliases:{[model]:'assets/three-creator/presets/humanoid/source/uefn-mannequin-lod1.glb'}});
  let version='original';
  const resolver=(logical:string)=>{
    if(logical.endsWith('/uefn-mannequin-lod1.glb'))throw new Error('Default skin must not be resolved');
    return resolve(logical)+(logical.endsWith(model)?`?version=${version}`:'');
  };
  const [a,b]=await Promise.all([SourceCharacter.load(resolver),SourceCharacter.load(resolver)]);sources.push(a,b);
  expect(mesh(a).name).toBe('UEFN_Mannequin_BlackJoints_LOD1_Medium');expect(mesh(a).geometry).toBe(mesh(b).geometry);
  expect(counts.get(`humanoid/source/${model}`)).toBe(1);expect(counts.has('humanoid/source/uefn-mannequin-lod1.glb')).toBe(false);
  const factory=a.createFactory()!;a.dispose();b.dispose();version='changed';
  const clone=await factory();sources.push(clone);
  expect(mesh(clone).name).toBe('UEFN_Mannequin_BlackJoints_LOD1_Medium');
  expect(requestedUrls.filter(url=>url.includes(model))).toEqual([resolve(`humanoid/source/${model}`)+'?version=original',resolve(`humanoid/source/${model}`)+'?version=original']);
});

it('includes the resolved model URL in source identity while sharing the manifest request',async()=>{
  const {resolve,counts}=resources();
  const model='humanoid/source/uefn-mannequin-lod1.glb';
  const variant=(version:string)=>(logical:string)=>resolve(logical)+(logical===model?`?version=${version}`:'');
  const [a,b,c]=await Promise.all([SourceCharacter.load(variant('a')),SourceCharacter.load(variant('b')),SourceCharacter.load(variant('a'))]);sources.push(a,b,c);
  expect(counts.get('humanoid/source/manifest.json')).toBe(1);expect(counts.get(model)).toBe(2);
  expect(mesh(a).geometry).toBe(mesh(c).geometry);expect(mesh(a).geometry).not.toBe(mesh(b).geometry);
  const dispose=vi.spyOn(mesh(b).geometry,'dispose');a.dispose();c.dispose();expect(dispose).not.toHaveBeenCalled();
});

it('deduplicates a failed manifest request and permits a clean retry',async()=>{
  let fail=true;const {resolve,counts}=resources({failManifest:()=>fail});
  const results=await Promise.allSettled([SourceCharacter.load(resolve),SourceCharacter.load(resolve)]);
  for(const result of results){expect(result.status).toBe('rejected');if(result.status==='rejected')expect(result.reason.message).toBe('人形资源清单加载失败');}
  expect(counts.get('humanoid/source/manifest.json')).toBe(1);
  fail=false;const actor=await SourceCharacter.load(resolve);sources.push(actor);
  expect(actor.clipCount).toBe(48);expect(counts.get('humanoid/source/manifest.json')).toBe(2);
});


it('loads model textures off by default using the real Node GLTF parser',async()=>{
  const {resolve}=resources(),actor=await SourceCharacter.load(resolve);sources.push(actor);
  expect(actor.rigTargets).toBe(101);expect(actor.clipCount).toBe(48);
  actor.root.traverse(object=>{if(object instanceof THREE.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material]){
    expect(Object.values(material).some(value=>value instanceof THREE.Texture)).toBe(false);
  }});
});

it('decodes enabled Node textures without reusing or poisoning the default cache',async()=>{
  const {resolve}=resources(),actor=await SourceCharacter.load(resolve);sources.push(actor);
  const textured=await SourceCharacter.load(resolve,{loadTextures:true});sources.push(textured);
  expect(((mesh(textured).material as THREE.MeshStandardMaterial).map as THREE.DataTexture).image.width).toBeGreaterThan(0);
  const again=await SourceCharacter.load(resolve);sources.push(again);expect(mesh(again).geometry).toBe(mesh(actor).geometry);
  const publicActor=new Character();characters.push(publicActor);
  await publicActor.load(resolve,{loadTextures:true});expect(publicActor.loaded).toBe(true);
});

it('captures model textures options before async loading and retains them in the immutable source factory',async()=>{
  const {resolve}=resources(),options={loadTextures:false};
  const loading=SourceCharacter.load(resolve,options);options.loadTextures=true;
  const actor=await loading;sources.push(actor);const factory=actor.createFactory()!;actor.dispose();
  const clone=await factory();sources.push(clone);
  const material=mesh(clone).material as THREE.MeshStandardMaterial;expect(material.map).toBeNull();
});
