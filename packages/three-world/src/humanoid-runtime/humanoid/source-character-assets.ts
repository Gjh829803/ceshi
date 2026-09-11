import {AnimationClip,Mesh,type Group,type Object3D,type BufferGeometry,type Material,type Texture,type Skeleton,type SkinnedMesh} from 'three';
import type {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createModelLoader,resolveLoadTextures,supportsModelTextureDecoding,type ModelLoadOptions} from '../../model-loader';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {CHARACTER_ASSET_IDS,SWIMMING_ASSET_IDS} from './catalog';
import {ACTION_CLIP_IDS,SURFACE_CLIP_IDS} from './action-schema';
import type {CharacterClipEntry} from './source-character';

interface Template {model:Group;entries:CharacterClipEntry[]}
export interface SourceCharacterLease {
  readonly model:Group;readonly entries:CharacterClipEntry[];
  dispose():void;
  readonly factory:()=>Promise<SourceCharacterLease>;
}
interface CacheEntry {promise:Promise<Template>;users:number;template?:Template}
function sourceFactory(urls:ReadonlyMap<string,string>,loadTextures:boolean):()=>Promise<SourceCharacterLease>{
  return ()=>leaseSourceCharacter(logical=>urls.get(logical.slice('humanoid/source/'.length))!,{loadTextures});
}
const cache=new Map<string,CacheEntry>();
const manifests=new Map<string,{promise:Promise<string>;users:number}>();
const paths=[...CHARACTER_ASSET_IDS.flatMap(id=>[`gasp-research/${id}.experimental.glb`,`gasp-research/${id}.metadata.json`]),
  ...SWIMMING_ASSET_IDS.map(id=>`swimming/${id}.clip.json`),...[...ACTION_CLIP_IDS,...SURFACE_CLIP_IDS].map(id=>`actions/${id}.clip.json`)];

/** Dispose each owned GPU resource once, completing cleanup even if a listener throws. */
export function disposeSourceGraphs(roots:readonly Object3D[],includeGeometry=true):void {
  const geometries=new Set<BufferGeometry>(),materials=new Set<Material>(),textures=new Set<Texture>(),skeletons=new Set<Skeleton>();
  for(const root of roots)root.traverse(object=>{
    if(object instanceof Mesh){if(includeGeometry)geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}
    const skeleton=(object as SkinnedMesh).skeleton;if(skeleton)skeletons.add(skeleton);
  });
  for(const material of materials)for(const value of Object.values(material))if(value&&typeof value==='object'&&(value as Texture).isTexture)textures.add(value as Texture);
  disposeResources([...skeletons,...materials,...textures,...geometries]);
}
function disposeResources(resources:Iterable<{dispose():void}>){
  const failures:unknown[]=[];
  for(const resource of resources)try{resource.dispose();}catch(error){failures.push(error);}
  if(failures.length)throw new AggregateError(failures,'HUMANOID_RESOURCE_CLEANUP_FAILED');
}

async function readTemplate(urls:ReadonlyMap<string,string>,modelPath:string,loadTextures:boolean):Promise<Template>{
  const loader=createModelLoader({loadTextures}),models:Group[]=[];
  const readJson=async(relative:string,message:string)=>{
    const response=await fetch(urls.get(relative)!);if(!response.ok)throw new Error(message);return response.json();
  };
  const visibleModel=loader.loadAsync(urls.get(modelPath)!).then(gltf=>{models.push(gltf.scene);return gltf.scene;});
  const tasks:Promise<CharacterClipEntry>[]=[
    ...CHARACTER_ASSET_IDS.map(async id=>{
      const pair=await Promise.allSettled([
        loader.loadAsync(urls.get(`gasp-research/${id}.experimental.glb`)!).then(gltf=>{models.push(gltf.scene);return gltf;}),
        readJson(`gasp-research/${id}.metadata.json`,`GASP 元数据加载失败: ${id}`),
      ]);
      const failure=pair.find(result=>result.status==='rejected');if(failure?.status==='rejected')throw failure.reason;
      const gltf=(pair[0] as PromiseFulfilledResult<Awaited<ReturnType<GLTFLoader['loadAsync']>>>).value;
      const clip=gltf.animations[0];if(!clip)throw new Error(`GASP 动画加载失败: ${id}`);
      return {id,clip,metadata:(pair[1] as PromiseFulfilledResult<CharacterClipEntry['metadata']>).value};
    }),
    ...SWIMMING_ASSET_IDS.map(async id=>({id,clip:AnimationClip.parse(await readJson(`swimming/${id}.clip.json`,`游泳动画加载失败: ${id}`))})),
    ...[...ACTION_CLIP_IDS,...SURFACE_CLIP_IDS].map(async id=>({id,clip:AnimationClip.parse(await readJson(`actions/${id}.clip.json`,`动作加载失败: ${id}`))})),
  ];
  // Wait for every load before cleanup: a late GLB must not outlive a failed bundle.
  const [modelResult,...results]=await Promise.allSettled([visibleModel,...tasks]);
  const failure=[modelResult,...results].find(result=>result.status==='rejected');
  if(failure?.status==='rejected'){try{disposeSourceGraphs(models);}catch{/* Preserve the load error. */}throw failure.reason;}
  const entries=results.map(result=>(result as PromiseFulfilledResult<CharacterClipEntry>).value);
  const model=(modelResult as PromiseFulfilledResult<Group>).value;
  try{disposeSourceGraphs(models.filter(value=>value!==model));}
  catch(error){try{disposeSourceGraphs([model]);}catch{/* Preserve the cleanup error. */}throw error;}
  return {model,entries:entries.map(({id,clip,metadata})=>({id,clip,metadata}))};
}

/** URL closure and texture loading mode form the cache identity; resources at those URLs must be immutable.
 * Geometry is shared read-only. Bones, mixers, clips, materials and texture objects
 * are instance-owned; changing geometry requires an explicitly cloned geometry. */
export async function leaseSourceCharacter(assetBaseUrl:string|((logicalPath:string)=>string),options:ModelLoadOptions={}):Promise<SourceCharacterLease>{
  const loadTextures=resolveLoadTextures(options,supportsModelTextureDecoding());
  const resolve=(relative:string)=>{
    const uri=typeof assetBaseUrl==='function'?assetBaseUrl(`humanoid/source/${relative}`):`${assetBaseUrl.replace(/\/$/,'')}/${relative}`;
    if(typeof uri!=='string'||!uri)throw new Error('HUMANOID_MODEL_RESOURCE_UNDECLARED');
    return typeof document==='undefined'?uri:new URL(uri,document.baseURI).href;
  };
  const manifestUrl=resolve('manifest.json');let manifest=manifests.get(manifestUrl);
  if(!manifest){
    const promise=(async()=>{
      const response=await fetch(manifestUrl);if(!response.ok)throw new Error('人形资源清单加载失败');
      const value=await response.json();
      if(typeof value?.model!=='string'||!value.model)throw new Error('HUMANOID_MODEL_RESOURCE_UNDECLARED');
      return value.model as string;
    })();
    manifest={promise,users:0};manifests.set(manifestUrl,manifest);
    const created=manifest;void promise.catch(()=>{if(manifests.get(manifestUrl)===created)manifests.delete(manifestUrl);});
  }
  manifest.users++;const ownedManifest=manifest;let manifestReleased=false;
  const releaseManifest=()=>{
    if(manifestReleased)return;manifestReleased=true;ownedManifest.users--;
    if(ownedManifest.users===0&&manifests.get(manifestUrl)===ownedManifest)manifests.delete(manifestUrl);
  };
  try{
    const modelPath=await ownedManifest.promise;
    const urls=new Map<string,string>([...new Set(['manifest.json',modelPath,...paths])].map(relative=>[relative,relative==='manifest.json'?manifestUrl:resolve(relative)]));
    return await leaseResolvedSource(urls,modelPath,loadTextures,releaseManifest);
  }catch(error){releaseManifest();throw error;}
}

async function leaseResolvedSource(urls:ReadonlyMap<string,string>,modelPath:string,loadTextures:boolean,releaseManifest:()=>void):Promise<SourceCharacterLease>{
  const key=JSON.stringify([loadTextures,[...urls]]);let entry=cache.get(key);
  if(!entry){
    entry={promise:readTemplate(urls,modelPath,loadTextures),users:0};cache.set(key,entry);
    const created=entry;void entry.promise.catch(()=>{if(cache.get(key)===created)cache.delete(key);});
  }
  entry.users++;const ownedEntry=entry;let released=false;
  const release=()=>{
    if(released)return;released=true;ownedEntry.users--;releaseManifest();
    if(ownedEntry.users===0){
      if(cache.get(key)===ownedEntry)cache.delete(key);
      if(ownedEntry.template)disposeSourceGraphs([ownedEntry.template.model]);
    }
  };
  const owned=new Set<{dispose():void}>();
  try{
    const template=await ownedEntry.promise;ownedEntry.template=template;
    const model=cloneSkeleton(template.model) as Group;
    model.traverse(object=>{const skeleton=(object as SkinnedMesh).skeleton;if(skeleton&&!owned.has(skeleton)){skeleton.boneInverses=skeleton.boneInverses.map(matrix=>matrix.clone());owned.add(skeleton);}});
    const materials=new Map<Material,Material>(),textures=new Map<Texture,Texture>();
    const cloneMaterial=(source:Material)=>{
      let material=materials.get(source);if(material)return material;
      material=source.clone();materials.set(source,material);owned.add(material);
      for(const [field,value] of Object.entries(source))if(value&&typeof value==='object'&&(value as Texture).isTexture){
        let texture=textures.get(value as Texture);if(!texture){texture=(value as Texture).clone();textures.set(value as Texture,texture);owned.add(texture);}
        (material as unknown as Record<string,unknown>)[field]=texture;
      }
      return material;
    };
    model.traverse(object=>{if(object instanceof Mesh)object.material=Array.isArray(object.material)?object.material.map(cloneMaterial):cloneMaterial(object.material);});
    let disposed=false;
    return {model,entries:template.entries,dispose(){if(disposed)return;disposed=true;try{disposeResources(owned);}finally{release();}},
      factory:sourceFactory(urls,loadTextures)};
  }catch(error){try{disposeResources(owned);}catch{/* Preserve construction failure. */}try{release();}catch{/* Preserve construction failure. */}throw error;}
}
