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

it('fits both aircraft to actual Source101 skin, controls, pedals and ground clearance',async()=>{
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
 const specs=SPECS.filter(s=>s.mode==='plane'),visuals=specs.map(buildVehicle);
 vi.unstubAllGlobals();
 const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map:getMap('aircraft-training'),character:{instanceId:'person',object:character.root,animation:character},vehicles:specs.map((spec,i)=>({instanceId:spec.id,assetId:spec.id,spec,object:visuals[i]!.root}))}});
 try{
  const runtime=world.humanoid!;
  for(const [i,spec] of specs.entries()){
   prepareCourse(runtime.simulation,getMap('aircraft-training'),'airfield',spec.id);
   expect(runtime.enter(spec.id)).toBe(true);world.step({},60);
   character.root.updateMatrixWorld(true);
   const root=visuals[i]!.root,points:Vector3[]=[],parts=new Map<string,Vector3[]>();
   character.root.traverse(o=>{if(!(o instanceof SkinnedMesh))return;
    for(let j=0;j<o.geometry.attributes.position!.count;j++){
     const p=root.worldToLocal(o.getVertexPosition(j,new Vector3()).applyMatrix4(o.matrixWorld));points.push(p);
     for(let k=0;k<4;k++)if(o.geometry.attributes.skinWeight!.getComponent(j,k)>.5){const name=o.skeleton.bones[o.geometry.attributes.skinIndex!.getComponent(j,k)]!.name;parts.set(name,[...(parts.get(name)??[]),p]);break;}
    }
   });
   for(const name of ['aircraft-floor','aircraft-side','aircraft-panel','aircraft-wing','seat-back'])root.traverse(o=>{
    if(o.name!==name)return;const bounds=new Box3().setFromObject(o).expandByScalar(-.002);
    expect(points.filter(p=>bounds.containsPoint(root.localToWorld(p.clone()))).length,name+' penetration').toBe(0);
   });
   for(const [n,name] of ['hand_l','hand_r'].entries()){
    const grip=root.children.filter(o=>o.name==='aircraft-grip')[n]!;
    const bounds=new Box3().setFromObject(grip);const skin=parts.get(name)!;
    const distance=Math.min(...skin.map(p=>bounds.distanceToPoint(root.localToWorld(p.clone()))));
    expect(distance,name+' contact gap').toBeLessThan(.015);
   }
   for(const name of ['foot_l','foot_r']){
    const foot=new Box3().setFromPoints(parts.get(name)!);
    expect(foot.min.y-.74,name+' sole gap').toBeGreaterThanOrEqual(0);
    expect(foot.min.y-.74,name+' sole gap').toBeLessThan(.01);
   }
   const prop=visuals[i]!.rotors[0]!;
   for(let angle=0;angle<Math.PI*2;angle+=Math.PI/24){prop.rotation.z=angle;root.updateMatrixWorld(true);const bounds=new Box3().setFromObject(prop);expect(bounds.min.y-runtime.simulation.vehicle!.position.y).toBeGreaterThan(.29);}
   for(const rig of visuals[i]!.wheelRigs){expect(rig.steering.position.y-rig.radius).toBeCloseTo(0,5); const wheelBounds=new Box3().setFromObject(rig.steering);root.traverse(o=>{if(['aircraft-floor','aircraft-side','aircraft-nose','aircraft-tail'].includes(o.name))expect(wheelBounds.intersectsBox(new Box3().setFromObject(o)),o.name+' wheel penetration').toBe(false);});}
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
   expect(eye.y-top).toBeGreaterThan(.65);
   runtime.setCameraMode(0);world.step({},1);
   // 通过同一 SDK 输入链检查爬升、左右满转向和俯冲时的接触，不额外写骨骼。
   for(const input of [{boost:true},{forward:-1},{steer:1},{steer:-1},{forward:1}]){
    world.step({humanoid:{...humanoid.emptyInput(),...input}},input.boost?300:90);
    character.root.updateMatrixWorld(true);
    const hands=root.children.filter(o=>o.name==='aircraft-grip');
    for(const [j,name] of ['hand_l','hand_r'].entries()){
     const bone=character.actor.getObjectByName(name)!;
     const local=root.worldToLocal(bone.getWorldPosition(new Vector3()));
     const baseline=name==='hand_l'?new Vector3(.214,1.585,.51864):new Vector3(-.19459,1.59379,.49525);
     expect(local.distanceTo(baseline),name+' dynamic attachment').toBeLessThan(.005);
     expect(hands[j]!.position.distanceTo(local)).toBeLessThan(.09);
    }
   }
   prepareCourse(runtime.simulation,getMap('aircraft-training'),'airfield',spec.id);expect(runtime.enter(spec.id)).toBe(true);world.step({},60);
   expect(runtime.exit()).toBe(true);world.step({},30);
  }
 }finally{world.dispose();vi.unstubAllGlobals();}
},30000);

