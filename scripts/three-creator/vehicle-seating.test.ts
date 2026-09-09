import {readFile} from 'node:fs/promises';
import {expect,it,vi} from 'vitest';
import {AnimationClip,Box3,PerspectiveCamera,SkinnedMesh,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createWorld,humanoid} from '@worldkit/three';
import {SourceCharacter} from '@worldkit/three/testing';
import {buildVehicle} from '../../shared/preset-content/models';
import {SPECS} from '../../shared/preset-content/config';
import {getMap} from '../../shared/preset-content/environment/maps';
import {prepareCourse} from '../../shared/preset-content/platform/scenarios';
vi.mock('../../shared/preset-content/assets/resources',()=>({resolvePresetResource:()=>{throw new Error('Unexpected creature resource load in road seating test');},definitions:{}}));

it('keeps the actual seated pelvis above car and motorcycle cushions and the first-person camera at the raised head',async()=>{
 const assetRoot=new URL('../../assets/three-creator/presets/humanoid/source/',import.meta.url);
 const entries=await Promise.all(['idle-loop','walk-loop','run-loop','climb-2m5'].map(async id=>{
  const bytes=await readFile(new URL(`gasp-research/${id}.experimental.glb`,assetRoot));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  return {id,clip:gltf.animations[0]!,model:gltf.scene};
 }));
 const seated=AnimationClip.parse(JSON.parse(await readFile(new URL('actions/sit-idle.clip.json',assetRoot),'utf8')));
 const source=new SourceCharacter(entries[3]!.model,[...entries,{id:'sit-idle',clip:seated}]);
 const character=new humanoid.HumanoidCharacter(source);
 // Only label rasterization is stubbed. Vehicle meshes, source bones, skinned
 // vertices, physics, mounted placement and the camera all use real code.
 const noop=()=>{};
 vi.stubGlobal('document',{createElement:()=>({getContext:()=>({fillRect:noop,beginPath:noop,roundRect:noop,fill:noop,fillText:noop})})});
 const specs=SPECS.filter(s=>['wheeled','bike'].includes(s.mode)),visuals=specs.map(buildVehicle);
 vi.unstubAllGlobals();
 const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map:getMap('grand-prix'),character:{instanceId:'person',object:character.root,animation:character},vehicles:specs.map((spec,i)=>({instanceId:spec.id,assetId:spec.id,spec,object:visuals[i]!.root}))}});
 try{
  const runtime=world.humanoid!;
  for(const [i,spec] of specs.entries()){
   prepareCourse(runtime.simulation,getMap('grand-prix'),'gp-straight',spec.id);
   expect(runtime.enter(spec.id)).toBe(true);world.step({},60);
   const cushion=visuals[i]!.root.getObjectByName('seat-cushion');
   expect(cushion,`${spec.id} cushion`).toBeDefined();
   const cushionBounds=new Box3().setFromObject(cushion!),top=cushionBounds.max.y,pelvisBounds=new Box3();
   const cushionInterior=cushionBounds.clone().expandByScalar(-.002);let intersectingVertices=0,contactHeight=Infinity;
   character.root.updateMatrixWorld(true);
   character.root.traverse(o=>{if(!(o instanceof SkinnedMesh))return;
    const ids=o.geometry.attributes.skinIndex!,weights=o.geometry.attributes.skinWeight!,p=new Vector3();
    const indices=o.geometry.index?new Set<number>(o.geometry.index.array):Array.from({length:o.geometry.attributes.position!.count},(_,i)=>i);
    for(const index of indices){
     o.getVertexPosition(index,p);p.applyMatrix4(o.matrixWorld);if(cushionInterior.containsPoint(p))intersectingVertices++;
     if(p.x>cushionInterior.min.x&&p.x<cushionInterior.max.x&&p.z>cushionInterior.min.z&&p.z<cushionInterior.max.z)contactHeight=Math.min(contactHeight,p.y);
     for(let j=0;j<4;j++)if(weights.getComponent(index,j)>.5&&o.skeleton.bones[ids.getComponent(index,j)]?.name==='pelvis'){pelvisBounds.expandByPoint(p);break;}
    }
   });
   expect(pelvisBounds.isEmpty(),`${spec.id} actual pelvis vertices`).toBe(false);
   const gap=pelvisBounds.min.y-top;
   expect(gap,`${spec.id} pelvis/cushion gap`).toBeGreaterThanOrEqual(-.005);
   expect(contactHeight-top,`${spec.id} body floating over cushion`).toBeLessThan(.03);
   expect(intersectingVertices,`${spec.id} body intersects cushion`).toBe(0);
   runtime.setCameraMode(1);world.step({},1);
   const eye=new Vector3();expect(character.eyePosition(eye)).toBe(true);
   expect(runtime.followCamera.camera.position.distanceTo(eye)).toBeLessThan(.002);
   expect(eye.y-top).toBeGreaterThan(.7);
   runtime.setCameraMode(0);world.step({},1);expect(runtime.exit()).toBe(true);world.step({},30);
  }
 }finally{world.dispose();vi.unstubAllGlobals();}
},30000);
