import {mkdtemp,rm,writeFile as writeFixtureFile,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const writeFile:typeof writeFixtureFile=async(file,data,options)=>{await mkdir(path.dirname(String(file)),{recursive:true});return writeFixtureFile(file,data,options);};
import type {Page} from 'playwright';
import {expect,it} from 'vitest';
import sharp from 'sharp';
import {ThreeCreatorTools} from '../../src/tools/tools';

it('renders independent author colors in the opening and object sheets while preserving texture alpha',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'model-colors-')),service=new ThreeCreatorTools(root,'three-sdk');
 try{
  await writeFile(path.join(root,'project.json'),JSON.stringify({schemaVersion:1,assetIds:['humanoid.uefn-mannequin']}));
  await writeFile(path.join(root,'index.html'),'<!doctype html><html><body style="margin:0"><script type="module" src="./main.ts"></script></body></html>');
  await writeFile(path.join(root,'main.ts'),`
import * as THREE from 'three';
import {createHumanoidWorld,setObjectColor,humanoid} from '@worldkit/three';
const scene=new THREE.Scene();scene.background=new THREE.Color('#ffffff');scene.add(new THREE.HemisphereLight(0xffffff,0xffffff,2));
const canvas=document.createElement('canvas');document.body.append(canvas);
const camera=new THREE.PerspectiveCamera(40,innerWidth/innerHeight,.1,100);camera.position.set(0,2,8);camera.lookAt(0,1,0);
const map={id:'colors',name:'Colors',description:'Color integration regression',bounds:{min:[-10,-5,-10],max:[10,10,10]},
 boxes:[{id:'floor',position:[0,-.5,0],size:[20,1,20]}],water:[],
 regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[20,20],color:'#ffffff',modes:['wheeled']}],
 spawns:[{id:'car-spawn',name:'Car',vehicleId:'car',regionId:'road',position:[5,.04,0],yaw:0}],playerSpawn:[-1,.04,0]};
const spec=humanoid.createRoadVehicleSpec('car');
const world=await createHumanoidWorld({scene,canvas,camera,map,navigation:false,characterColor:'#287eca',characterLoadOptions:{loadTextures:true},
 vehicles:[{instanceId:'car',assetId:'custom.car',object:new THREE.Group(),spec}]});
const other=await world.humanoid.createCharacter();other.setColor('#cb583e');other.root.position.set(1,.04,0);
world.addCharacter({id:'other',humanoid:other});world.setCaptureTargets(['player','other']);world.useAuthoredCamera();world.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,defaultViewId:'third-person',binding:{targetEntityId:'player'},activation:'on-input',views:{'third-person':{kind:'third-person',opening:{positionWorldMetersXYZ:[0,2,8],lookAtWorldMetersXYZ:[0,1,0],fovDegrees:40},overrides:{framing:{kind:'preserve-opening'},lens:{nearMeters:.1,farMeters:100}}},'first-person':{kind:'first-person'}}}});
(window as any).__colorTest={world,other,THREE,setObjectColor};await world.start();world.stop();
`);
  const opening=await service.preview('opening');
  const page=(service as unknown as {session:{page:Page}}).session.page;
  const result=await page.evaluate(async()=>{
   const {world,other,THREE,setObjectColor}=(window as any).__colorTest;
   const colors=()=>{const result:Record<string,string[]>={};for(const [id,object] of [['player',world.humanoid.options.character.object],['other',other.root]]){
    const values=new Set<string>();object.traverse((node:any)=>{if(node.isMesh)for(const m of Array.isArray(node.material)?node.material:[node.material])values.add(m.color.getHexString());});result[id]=[...values];}return result;};
   const before=colors();world.setControlledEntity('other');world.setCameraView('first-person');world.setCameraView('third-person');world.step({},2);
   world.step({},60);world.humanoid.approach('car');const boarding=world.humanoid.inspectBoarding('car'),entered=world.humanoid.enter('car');world.step({},45);
   const mounted=world.humanoid.snapshot().mountedInstanceId,whileMounted=colors();
   const exited=world.humanoid.exit();world.step({},45);const afterExit=colors();await world.reset();
   const after=colors();
   // A red texture must contribute alpha only, even when the author chooses blue.
   const texture=new THREE.DataTexture(new Uint8Array([255,0,0,255,255,0,0,0]),2,1);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
   const source=new THREE.MeshStandardMaterial({map:texture,alphaTest:.5}),geometry=new THREE.PlaneGeometry(2,1),mesh=new THREE.Mesh(geometry,source);
   const color=setObjectColor(mesh,'#287eca'),scene=new THREE.Scene();scene.add(mesh,new THREE.AmbientLight(0xffffff,2));
   const camera=new THREE.OrthographicCamera(-1,1,.5,-.5,.1,10);camera.position.z=1;
   const renderer=world.renderer,target=new THREE.WebGLRenderTarget(64,64),previous=renderer.getRenderTarget();
   const clear=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();
   let opaque:number[]=[],cutout:number[]=[];
   try{renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.clear();renderer.render(scene,camera);
    const pixels=new Uint8Array(64*64*4);renderer.readRenderTargetPixels(target,0,0,64,64,pixels);
    opaque=[...pixels.slice((32*64+16)*4,(32*64+16)*4+4)];cutout=[...pixels.slice((32*64+48)*4,(32*64+48)*4+4)];
   }finally{renderer.setRenderTarget(previous);renderer.setClearColor(clear,alpha);color.dispose();source.dispose();geometry.dispose();texture.dispose();target.dispose();}
   return {before,after,opaque,cutout,entered,boarding,mounted,whileMounted,exited,afterExit};
  });
  expect(result.before).toEqual({player:['287eca'],other:['cb583e']});expect(result.after).toEqual(result.before);
  expect(result.entered,JSON.stringify(result.boarding)).toBe(true);expect(result.mounted).toBe('car');expect(result.exited).toBe(true);
  expect(result.whileMounted).toEqual(result.before);expect(result.afterExit).toEqual(result.before);
  expect(result.opaque[3]).toBe(255);expect(result.opaque[2]).toBeGreaterThan(result.opaque[0]!+30);expect(result.cutout[3]).toBe(0);
  const sheets=await service.triviews();expect(sheets.pageErrors).toEqual([]);
  const count=async(file:string)=>{const {data,info}=await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject:true});let blue=0,red=0;
   for(let i=0;i<data.length;i+=info.channels){const r=data[i]!,g=data[i+1]!,b=data[i+2]!;if(b>r*1.3&&b>g*1.1)blue++;if(r>b*1.3&&r>g*1.1)red++;}return {blue,red};};
  const openingColors=await count(opening.image.path);expect(openingColors.blue).toBeGreaterThan(100);expect(openingColors.red).toBeGreaterThan(100);
  const objects=sheets.images.filter(image=>image.view==='entity-triview');expect(objects).toHaveLength(2);
  const first=await count(objects[0]!.image.path),second=await count(objects[1]!.image.path);
  expect(first.blue).toBeGreaterThan(100);expect(first.red).toBe(0);expect(second.red).toBeGreaterThan(100);expect(second.blue).toBe(0);
 }finally{await service.close();await rm(root,{recursive:true,force:true});}
},40000);

// These cases deliberately use the browser's actual embedded-image decoder.
// No GLTFLoader hooks, placeholder textures, fetch replacements or asset rewrites.
it.each([false,true])('keeps real model texture loads and factories isolated when loadTextures starts %s',async firstMode=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'model-textures-'));
  const service=new ThreeCreatorTools(root,'three-sdk');
  try{
    await writeFile(path.join(root,'project.json'),JSON.stringify({schemaVersion:1,assetIds:['humanoid.uefn-mannequin']}));
    await writeFile(path.join(root,'index.html'),'<!doctype html><html><body style="margin:0"><script type="module" src="./main.ts"></script></body></html>');
    await writeFile(path.join(root,'main.ts'),`
import * as THREE from 'three';
import {createHumanoidWorld,HumanoidCharacter} from '@worldkit/three';
const catalog=await (await fetch('./asset-definitions.json')).json();
const definitions=Object.fromEntries(catalog.assets.map(asset=>[asset.id,asset]));
const resourceUris=new Map(definitions['humanoid.uefn-mannequin'].resources.map(resource=>[resource.path,resource.uri]));
const resourceUrl=logicalPath=>new URL(resourceUris.get(logicalPath),document.baseURI).href;
const canvas=document.createElement('canvas');document.body.append(canvas);
const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.08,100);
const map={id:'model-textures',name:'Model texture test',description:'Real browser texture decoding',
 bounds:{min:[-20,-5,-20],max:[20,20,20]},boxes:[{id:'floor',position:[0,-.5,0],size:[40,1,40]}],water:[],regions:[],spawns:[],playerSpawn:[0,.04,0]};
const world=await createHumanoidWorld({canvas,camera,map,navigation:false,assetDefinitions:definitions,
 ${firstMode?'':'characterLoadOptions:{loadTextures:false},'}});
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
          const instance=mode?await world.assets.load('humanoid.uefn-mannequin',{loadTextures:true}):await world.assets.load('humanoid.uefn-mannequin');ownedAssets.push(instance);
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
          if(mode)await character.load(resourceUrl);else await character.load(resourceUrl,{loadTextures:false});
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
