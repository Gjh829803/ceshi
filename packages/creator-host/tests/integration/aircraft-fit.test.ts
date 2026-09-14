import {buildSoaringShell} from '@worldkit/preset-content/soaring-shell';
import {readFile} from 'node:fs/promises';
import {expect,it,vi} from 'vitest';
import {AnimationClip,Box3,PerspectiveCamera,SkinnedMesh,Vector3,Group,Mesh,MeshStandardMaterial,Quaternion} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createWorld,humanoid} from '@worldkit/three';
import {SourceCharacter} from '@worldkit/three/testing';
import {buildVehicle} from '@worldkit/preset-content/models';
import {SPECS} from '@worldkit/preset-content/config';
import {getMap} from '@worldkit/preset-content/environment/maps';
import {prepareCourse} from '@worldkit/preset-content/platform/scenarios';
vi.mock('../../../preset-content/src/assets/resources',()=>({resolvePresetResource:()=>{throw new Error('Unexpected creature resource load in road seating test');},definitions:{}}));

it('fits fixed aircraft riders to actual Source101 skin, pedals and ground clearance',async()=>{
 const assetRoot=new URL('../../../../assets/three-creator/presets/humanoid/source/',import.meta.url);
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
 const specs=SPECS.filter(s=>s.mode==='plane'&&!['wingsuit','paraglider','balloon'].includes(s.aircraftSubtype??'')),visuals=specs.map(buildVehicle);
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
   // 人物不再握持操控件；验证同一固定姿势在载具运动中保持稳定。
   const fixedBones=new Map<string,number[]>();character.actor.traverse(n=>{if(n.type==='Bone'){n.updateMatrix();fixedBones.set(n.name,n.matrix.toArray());}});
   for(const name of ['foot_l','foot_r']){
    const foot=new Box3().setFromPoints(parts.get(name)!);
    expect(foot.min.y-.74,name+' sole gap').toBeGreaterThanOrEqual(0);
    expect(foot.min.y-.74,name+' sole gap').toBeLessThan(.01);
   }
   const visual=visuals[i]!;
   expect(visual.rotors.length).toBe(spec.aircraftSubtype==='glider'?0:spec.aircraftSubtype==='multirotor'?4:['helicopter','tiltrotor'].includes(spec.aircraftSubtype??'')?2:1);
   // 精确顶点边界避免新增圆形桨盘的局部方形包围盒旋转后虚增半径。
   for(let angle=0;angle<Math.PI*2;angle+=Math.PI/24){visual.aircraftShell!.update({rotorPhases:visual.rotors.map(()=>angle),tilt:0});root.updateMatrixWorld(true);for(const prop of visual.rotors){const bounds=new Box3().setFromObject(prop,true);expect(bounds.min.y-runtime.simulation.controlledActor.vehicle!.position.y,`${spec.id} propeller clearance`).toBeGreaterThan(.29);}}
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
   world.setCameraView('first-person');world.step({},1);
   const eye=new Vector3();expect(character.eyePosition(eye)).toBe(true);
   expect(world.camera.position.distanceTo(eye)).toBeLessThan(.002);
   expect(eye.y-top).toBeGreaterThan(.65);
   world.setCameraView('third-person');world.step({},1);
   // 通过同一 SDK 输入链检查爬升、左右满转向和俯冲时的接触，不额外写骨骼。
   for(const input of [{boost:true},{forward:-1},{steer:1},{steer:-1},{forward:1}]){
    world.step({humanoid:{...humanoid.emptyInput(),...input}},input.boost?300:90);
    character.root.updateMatrixWorld(true);
    character.actor.traverse(n=>{if(n.type==='Bone'){n.updateMatrix();n.matrix.toArray().forEach((v,k)=>expect(v,`${spec.id}/${n.name} fixed pose`).toBeCloseTo(fixedBones.get(n.name)![k]!,5));}});
   }
   prepareCourse(runtime.simulation,getMap('aircraft-training'),'airfield',spec.id);expect(runtime.enter(spec.id)).toBe(true);world.step({},60);
   expect(runtime.exit()).toBe(true);world.step({},30);
  }
 }finally{world.dispose();vi.unstubAllGlobals();}
},30000);

it('keeps canopy handles and ropes on the displayed rider after a bank or turn',()=>{
 const root=new Group(),avatar=new Group(),material=new MeshStandardMaterial();
 const pelvis=new Group(),left=new Group(),right=new Group();pelvis.name='pelvis';left.name='hand_l';right.name='hand_r';
 left.position.set(.7,1,.2);right.position.set(-.7,1,.2);avatar.add(pelvis,left,right);
 const shell=buildSoaringShell(root,'paraglider',material);
 root.position.set(20,120,-70);shell.update({grounded:false,aircraft:{canopy:1},throttle:0},avatar);
 const lookup=vi.spyOn(avatar,'getObjectByName');
 for(const yaw of [-1,.7,2]){
  shell.update({grounded:false,aircraft:{canopy:1},throttle:0},avatar);
  root.rotation.set(.2,yaw,.45);avatar.rotation.copy(root.rotation);avatar.position.copy(root.position).add(new Vector3(.3,1,-.2));
  root.updateWorldMatrix(true,true);avatar.updateWorldMatrix(true,true);
  root.traverse(node=>{if(node instanceof Mesh||node.type==='Line')Reflect.apply(node.onBeforeRender,node,[]);});
  const handles:Mesh[]=[];root.traverse(node=>{if(node.name==='soaring-brake-handle')handles.push(node as Mesh);});
  for(let n=0;n<2;n++){
   const hand=(n===0?right:left).getWorldPosition(new Vector3());
   expect(new Vector3().setFromMatrixPosition(handles[n]!.matrixWorld).distanceTo(hand)).toBeLessThan(.04);
   const rope=root.getObjectByName('soaring-brake-line-'+n)!;
   expect(new Vector3().applyMatrix4(rope.matrixWorld).distanceTo(new Vector3().setFromMatrixPosition(handles[n]!.matrixWorld))).toBeLessThan(1e-6);
  }
  const expected=pelvis.getWorldPosition(new Vector3()).add(new Vector3(0,-.175,0).applyQuaternion(root.getWorldQuaternion(new Quaternion())));
  expect(new Vector3().setFromMatrixPosition(root.getObjectByName('soaring-harness')!.matrixWorld).distanceTo(expected)).toBeLessThan(1e-6);
 }
 expect(lookup).not.toHaveBeenCalled();lookup.mockRestore();
 root.traverse(node=>{if(node instanceof Mesh||node.type==='Line')(node as Mesh).geometry.dispose();});material.dispose();
});

it('binds a late wingsuit rig and reuses membrane buffers across frames',()=>{
 const root=new Group(),avatar=new Group(),material=new MeshStandardMaterial(),shell=buildSoaringShell(root,'wingsuit',material);
 const state={grounded:false,aircraft:{canopy:0},throttle:0};shell.update(state,avatar);
 for(const [name,x,y,z] of [['pelvis',0,1,0],['hand_l',1,1.4,.3],['hand_r',-1,1.4,.3],['foot_l',.2,0,0],['foot_r',-.2,0,0]] as const){const b=new Group();b.name=name;b.position.set(x,y,z);avatar.add(b);}
 shell.update(state,avatar);const lookup=vi.spyOn(avatar,'getObjectByName');
 const cloth=root.getObjectByName('wingsuit-membrane') as Mesh,positions=cloth.geometry.getAttribute('position'),normals=cloth.geometry.getAttribute('normal');
 for(let n=0;n<60;n++){avatar.rotation.y=n*.02;avatar.updateWorldMatrix(true,true);root.updateWorldMatrix(true,true);shell.update(state,avatar);Reflect.apply(cloth.onBeforeRender,cloth,[]);}
 expect(lookup).not.toHaveBeenCalled();expect(cloth.geometry.getAttribute('position')).toBe(positions);expect(cloth.geometry.getAttribute('normal')).toBe(normals);
 expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);expect(Array.from(normals.array).some(x=>Math.abs(x)>.5)).toBe(true);
 lookup.mockRestore();root.traverse(n=>{if(n instanceof Mesh||n.type==='Line')(n as Mesh).geometry.dispose();});material.dispose();
});
