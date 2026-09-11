import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {Page} from 'playwright';
import {expect,it} from 'vitest';
import {ThreeCreatorTools} from './tools';

// These cases deliberately use the browser's actual embedded-image decoder.
// No GLTFLoader hooks, placeholder textures, fetch replacements or asset rewrites.
it.each([false,true])('keeps real model texture loads and factories isolated when loadTextures starts %s',async firstMode=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'model-textures-'));
  const service=new ThreeCreatorTools(root,'three-sdk');
  try{
    await writeFile(path.join(root,'project.json'),JSON.stringify({schemaVersion:1,assetIds:['humanoid.source-101']}));
    await writeFile(path.join(root,'index.html'),'<!doctype html><html><body style="margin:0"><script type="module" src="./main.ts"></script></body></html>');
    await writeFile(path.join(root,'main.ts'),`
import * as THREE from 'three';
import {createHumanoidWorld,HumanoidCharacter} from '@worldkit/three';
const catalog=await (await fetch('./asset-definitions.json')).json();
const definitions=Object.fromEntries(catalog.assets.map(asset=>[asset.id,asset]));
const resourceUris=new Map(definitions['humanoid.source-101'].resources.map(resource=>[resource.path,resource.uri]));
const resourceUrl=logicalPath=>new URL(resourceUris.get(logicalPath),document.baseURI).href;
const canvas=document.createElement('canvas');document.body.append(canvas);
const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.08,100);
const map={id:'model-textures',name:'Model texture test',description:'Real browser texture decoding',
 bounds:{min:[-20,-5,-20],max:[20,20,20]},boxes:[{id:'floor',position:[0,-.5,0],size:[40,1,40]}],water:[],regions:[],spawns:[],playerSpawn:[0,.04,0]};
const world=await createHumanoidWorld({canvas,camera,map,navigation:false,assetDefinitions:definitions,
 ${firstMode?'characterLoadOptions:{loadTextures:true},':''}});
(window as any).__modelTextureTest={world,HumanoidCharacter,resourceUrl};
await world.start();world.stop();
`);
    const initial=await service.inspect();expect(initial.pageErrors).toEqual([]);
    const page=(service as unknown as {session:{page:Page}}).session.page;
    const result=await page.evaluate(async firstMode=>{
      type ModelRoot=import('three').Object3D;
      type Material=import('three').MeshStandardMaterial;
      const {world,HumanoidCharacter,resourceUrl}=(window as unknown as {__modelTextureTest:{
        world:import('@worldkit/three').ThreeWorld;
        HumanoidCharacter:typeof import('@worldkit/three').HumanoidCharacter;
        resourceUrl:(logicalPath:string)=>string;
      }}).__modelTextureTest;
      await window.__THREE_CREATOR_HOST__!.stop();
      function materials(root:ModelRoot):Material[]{
        const found=new Set<Material>();root.traverse(object=>{
          const mesh=object as import('three').Mesh;
          if(mesh.isMesh)for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])found.add(material as Material);
        });return [...found];
      }
      function report(root:ModelRoot){
        return materials(root).map(material=>({name:material.name,color:material.color.toArray(),
          textures:Object.entries(material).filter(([,value])=>(value as import('three').Texture|null)?.isTexture).map(([key])=>key),
          map:imageReport(material.map),normalMap:imageReport(material.normalMap)}));
      }
      function imageReport(texture:import('three').Texture|null){
        if(!texture)return null;
        const image=texture.image as HTMLImageElement|ImageBitmap;
        return {width:image?.width??0,height:image?.height??0,decoded: image instanceof HTMLImageElement||image instanceof ImageBitmap};
      }
      function isolated(source:ModelRoot,copy:ModelRoot){
        const a=materials(source),b=materials(copy);
        return {materials:a.length>0&&a.length===b.length&&a.every((material,index)=>material!==b[index]),
          textures:a.every((material,index)=>Object.entries(material).every(([key,value])=>{
            if(!(value as import('three').Texture|null)?.isTexture)return true;
            const other=(b[index] as unknown as Record<string,unknown>)[key];
            return (other as import('three').Texture|null)?.isTexture&&value!==other;
          })),
          skeletons:(()=>{
            const skins=(root:ModelRoot)=>{const result:import('three').SkinnedMesh[]=[];root.traverse(object=>{if((object as import('three').SkinnedMesh).isSkinnedMesh)result.push(object as import('three').SkinnedMesh);});return result;};
            const original=skins(source),cloned=skins(copy);
            return original.length>0&&original.length===cloned.length&&original.every((mesh,index)=>mesh.skeleton!==cloned[index]!.skeleton);
          })()};
      }
      const ownedAssets:import('@worldkit/three').AssetInstance[]=[],ownedCharacters:InstanceType<typeof HumanoidCharacter>[]=[];
      try{
        const assets=[];
        for(const mode of [firstMode,!firstMode,firstMode]){
          const instance=mode?await world.assets.load('humanoid.source-101',{loadTextures:true}):await world.assets.load('humanoid.source-101');ownedAssets.push(instance);
          const copy=await world.assets.clone(instance);ownedAssets.push(copy);
          const before=report(instance.object),cloneBefore=report(copy.object),identity=isolated(instance.object,copy.object);
          const copyMaterials=materials(copy.object),first=copyMaterials[0]!;first.color.setRGB(.2,.3,.4);
          // Generic AssetInstance GLB textures are borrowed immutable resources;
          // clone isolation here applies to material edits, not texture mutation.
          const originalUnchanged=JSON.stringify(report(instance.object))===JSON.stringify(before);
          world.assets.release(copy);ownedAssets.splice(ownedAssets.indexOf(copy),1);
          assets.push({mode,before,cloneBefore,identity,originalUnchanged,afterCloneDisposed:report(instance.object)});
        }
        // The world factory inherits its initial load option. Directly loading the
        // other option uses the same source URLs while the first template is live.
        const initialCharacter=world.humanoid!.options.character.animation!;
        const worldClone=await world.humanoid!.createCharacter();ownedCharacters.push(worldClone);
        const worldFactory={mode:firstMode,original:report(initialCharacter.root),copy:report(worldClone.root),identity:isolated(initialCharacter.root,worldClone.root)};
        const sourceCharacters=[];
        for(const mode of [!firstMode,firstMode]){
          const character=new HumanoidCharacter();ownedCharacters.push(character);
          if(mode)await character.load(resourceUrl,{loadTextures:true});else await character.load(resourceUrl);
          const factory=character.createFactory();if(!factory)throw new Error('SOURCE_FACTORY_MISSING');
          const copy=await factory();ownedCharacters.push(copy);
          const original=report(character.root),before=report(copy.root),identity=isolated(character.root,copy.root);
          const originalMaterials=materials(character.root),copyMaterials=materials(copy.root),mapped=copyMaterials.find(material=>material.map);
          let unchanged=true;
          copyMaterials[0]!.color.setRGB(.4,.3,.2);
          if(mapped){const i=copyMaterials.indexOf(mapped),offset=originalMaterials[i]!.map!.offset.x;mapped.map!.offset.x+=.25;unchanged=originalMaterials[i]!.map!.offset.x===offset;}
          unchanged&&=JSON.stringify(report(character.root))===JSON.stringify(original);
          character.dispose();ownedCharacters.splice(ownedCharacters.indexOf(character),1);
          // A factory must retain the original option after its caller is disposed.
          const later=await factory();ownedCharacters.push(later);
          sourceCharacters.push({mode,original,before,identity,unchanged,afterSourceDisposed:report(copy.root),later:report(later.root),laterIdentity:isolated(copy.root,later.root)});
        }
        return {assets,retainedAssets:ownedAssets.map(asset=>report(asset.object)),worldFactory,retainedWorldCharacter:report(initialCharacter.root),sourceCharacters};
      }finally{
        for(const character of ownedCharacters)character.dispose();
        for(const asset of ownedAssets)world.assets.release(asset);
      }
    },firstMode);
    function assertMode(materials:typeof result.assets[number]['before'],mode:boolean,checkWhite=true){
      expect(materials.length).toBeGreaterThan(0);
      if(mode){
        expect(materials.some(material=>material.map)).toBe(true);
        expect(materials.some(material=>material.normalMap)).toBe(true);
        for(const material of materials)for(const image of [material.map,material.normalMap])if(image){expect(image.decoded).toBe(true);expect(image.width).toBeGreaterThan(0);expect(image.height).toBeGreaterThan(0);}
      }else for(const material of materials){
        expect(material.map).toBeNull();expect(material.normalMap).toBeNull();expect(material.textures).toEqual([]);
        if(checkWhite)expect(material.color).toEqual([1,1,1]);
      }
    }
    for(const asset of result.assets){
      assertMode(asset.before,asset.mode);assertMode(asset.cloneBefore,asset.mode);
      expect(asset.identity).toMatchObject({materials:true,skeletons:true});expect(asset.originalUnchanged).toBe(true);expect(asset.afterCloneDisposed).toEqual(asset.before);
    }
    expect(result.retainedAssets).toEqual(result.assets.map(asset=>asset.before));
    expect(result.retainedWorldCharacter).toEqual(result.worldFactory.original);
    const factory=result.worldFactory;assertMode(factory.original,factory.mode);assertMode(factory.copy,factory.mode);expect(factory.identity).toEqual({materials:true,textures:true,skeletons:true});
    for(const character of result.sourceCharacters){
      assertMode(character.original,character.mode);assertMode(character.before,character.mode);assertMode(character.afterSourceDisposed,character.mode,false);assertMode(character.later,character.mode);
      expect(character.identity).toEqual({materials:true,textures:true,skeletons:true});expect(character.laterIdentity).toEqual({materials:true,textures:true,skeletons:true});expect(character.unchanged).toBe(true);
    }
    expect((await service.inspect()).pageErrors).toEqual([]);
  }finally{await service.close();await rm(root,{recursive:true,force:true});}
},60000);
