import {readFile} from 'node:fs/promises';
import {readHumanoidSource} from '../assets/library-fixture.js';
import {expect,it,vi} from 'vitest';
import {AnimationClip,Box3,CylinderGeometry,Mesh,PerspectiveCamera,Raycaster,SkinnedMesh,Vector3,type Object3D} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createWorld,createHumanoidCameraDocument,humanoid} from '@worldkit/three';
import {SourceCharacter,parseFixtureGlb} from '@worldkit/three/testing';
import {buildVehicle} from '@worldkit/preset-content/models';
import {SPECS} from '@worldkit/preset-content/config';
import {getMap} from '@worldkit/preset-content/environment/maps';
import {prepareCourse} from '@worldkit/preset-content/platform/scenarios';
vi.mock('../../../preset-content/src/assets/resources',()=>({resolvePresetResource:()=>{throw new Error('Unexpected creature resource load in road seating test');},definitions:{}}));

it.each(['supercar','bus'])('builds %s wheel geometry from the supplied subject profile',id=>{
 const authored=SPECS.find(spec=>spec.id===id)!,alternate=structuredClone(authored);
 alternate.wheelPhysics={...alternate.wheelPhysics!,radius:.63,hubHeight:.71,wheelWidth:.41,wheels:[
  {x:-1.23,z:-1.7,steering:true,driven:true},
  {x:1.17,z:1.91,steering:false,driven:true},
  {x:0,z:.13,steering:true,driven:false},
 ]};
 const noop=()=>{};
 vi.stubGlobal('document',{createElement:()=>({getContext:()=>({fillRect:noop,beginPath:noop,roundRect:noop,fill:noop,fillText:noop})})});
 try{for(const spec of [authored,alternate]){
  const visual=buildVehicle(spec),physics=spec.wheelPhysics!;
  try{
   expect(visual.wheelRigs).toHaveLength(physics.wheels!.length);
   for(const [index,layout] of physics.wheels!.entries()){
    const rig=visual.wheelRigs[index]!;
    expect(rig.steering.position.toArray()).toEqual([layout.x,physics.hubHeight,layout.z]);
    expect(rig.radius).toBe(physics.radius);
    expect(visual.steering.includes(rig.steering)).toBe(layout.steering);
    const tire=rig.spin.children[0] as Mesh<CylinderGeometry>;
    expect(tire.geometry.parameters).toMatchObject({radiusTop:physics.radius,radiusBottom:physics.radius,height:physics.wheelWidth});
   }
  }finally{visual.root.traverse(node=>{if(node instanceof Mesh){node.geometry.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material])material.dispose();}});}
 }}finally{vi.unstubAllGlobals();}
});

function measureCushionContact(character:Object3D,cushion:Mesh){
 // Sample the visible surface in cushion-local space. A world AABB fills in
 // the kart's centre relief and cannot represent a tilted or shaped cushion.
 cushion.updateWorldMatrix(true,false);character.updateMatrixWorld(true);
 cushion.geometry.computeBoundingBox();
 const bounds=cushion.geometry.boundingBox!,surface=new Mesh(cushion.geometry,cushion.material);
 const ray=new Raycaster(),point=new Vector3(),origin=new Vector3(),down=new Vector3(0,-1,0);
 let contactGap=Infinity,pelvisGap=Infinity,intersectingVertices=0,pelvisSamples=0;
 character.traverse(o=>{if(!(o instanceof SkinnedMesh))return;
  o.skeleton.update();
  const ids=o.geometry.attributes.skinIndex!,weights=o.geometry.attributes.skinWeight!;
  const indices=o.geometry.index?new Set<number>(o.geometry.index.array):Array.from({length:o.geometry.attributes.position!.count},(_,i)=>i);
  for(const index of indices){
   o.getVertexPosition(index,point).applyMatrix4(o.matrixWorld);cushion.worldToLocal(point);
   ray.set(origin.set(point.x,bounds.max.y+1,point.z),down);
   const hit=ray.intersectObject(surface,false)[0];if(!hit)continue;
   const gap=point.y-hit.point.y;contactGap=Math.min(contactGap,gap);
   if(gap<-.002&&point.y>bounds.min.y+.002)intersectingVertices++;
   for(let j=0;j<4;j++)if(weights.getComponent(index,j)>.5&&o.skeleton.bones[ids.getComponent(index,j)]?.name==='pelvis'){
    pelvisSamples++;pelvisGap=Math.min(pelvisGap,gap);break;
   }
  }
 });
 return {contactGap,pelvisGap,intersectingVertices,pelvisSamples};
}

it('keeps the actual seated pelvis above car and motorcycle cushions and the first-person camera at the raised head',async()=>{
 const entries=await Promise.all(['idle-loop','walk-loop','run-loop','climb-2m5'].map(async id=>{
  const bytes=await readHumanoidSource(`gasp-research/${id}.experimental.glb`);
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  return {id,clip:gltf.animations[0]!,model:gltf.scene};
 }));
 const seated=AnimationClip.parse(JSON.parse((await readHumanoidSource('actions/sit-idle.clip.json')).toString('utf8')));
 const model=await parseFixtureGlb(await readHumanoidSource('uefn-mannequin-lod1.glb'));
 const source=new SourceCharacter(model.scene,[...entries,{id:'sit-idle',clip:seated}]);
 const character=new humanoid.HumanoidCharacter(source);
 // Only label rasterization is stubbed. Vehicle meshes, source bones, skinned
 // vertices, physics, mounted placement and the camera all use real code.
 const noop=()=>{};
 vi.stubGlobal('document',{createElement:()=>({getContext:()=>({fillRect:noop,beginPath:noop,roundRect:noop,fill:noop,fillText:noop})})});
 const specs=SPECS.filter(s=>['wheeled','motorcycle'].includes(s.mode)),visuals=specs.map(buildVehicle);
 vi.unstubAllGlobals();
 const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map:getMap('grand-prix'),character:{instanceId:'person',object:character.root,animation:character},vehicles:specs.map((spec,i)=>({instanceId:spec.id,assetId:spec.id,spec,object:visuals[i]!.root}))}});
 try{
  const runtime=world.humanoid!;world.setCameraFollow({configuration:createHumanoidCameraDocument('person')});
  world.setCameraView('first-person');const initialCamera=world.inspectCamera().document!;
  world.setCameraFollow({configuration:{...initialCamera,views:{...initialCamera.views,'first-person':{kind:'first-person',overrides:{position:{subjectTranslationHalfLifeSeconds:0,anchorHalfLifeSeconds:0}}}}}});
  world.step({},1);
  // On foot the established camera uses a stable capsule eye, not animated head bob.
  const actor=runtime.simulation.controlledActor;
  const onFootEye=actor.player.position.clone().add(new Vector3(0,actor.controller.capsuleHeight-.12,0));
  expect(world.camera.position.distanceTo(onFootEye)).toBeLessThan(.002);world.setCameraView('third-person');
  for(const [i,spec] of specs.entries()){
   prepareCourse(runtime.simulation,getMap('grand-prix'),'gp-straight',spec.id);
   expect(runtime.enter(spec.id)).toBe(true);world.step({},60);
   if(spec.archetype==='unicycle'){
    // At rest the rider stands behind the saddle with a support foot down.
    // Use real forward input to reach the seated pedalling phase for contact checks.
    world.step({humanoid:{...humanoid.emptyInput(),forward:1}},60);
    expect(runtime.simulation.controlledActor.vehicle!.motion.unicycle!.phase).toBe('riding');
   }
   const cushion=visuals[i]!.root.getObjectByName('seat-cushion');
   expect(cushion,`${spec.id} cushion`).toBeDefined();
   expect(cushion).toBeInstanceOf(Mesh);
   const top=new Box3().setFromObject(cushion!).max.y;
   const contact=measureCushionContact(character.root,cushion as Mesh);
   expect(contact.pelvisSamples,`${spec.id} actual pelvis vertices over cushion`).toBeGreaterThan(0);
   expect(contact.pelvisGap,`${spec.id} pelvis/cushion gap`).toBeGreaterThanOrEqual(-.005);
   expect(contact.contactGap,`${spec.id} body floating over cushion`).toBeLessThan(.03);
   expect(contact.intersectingVertices,`${spec.id} body intersects cushion`).toBe(0);
   if(spec.id==='kart'){
    // Prove the surface check still rejects actual penetration and floating;
    // do not make the test pass by increasing tolerances or skipping the kart.
    const position=character.root.position.clone();
    try{
     character.root.position.y-=.04;
     const sunk=measureCushionContact(character.root,cushion as Mesh);
     expect(sunk.pelvisGap).toBeLessThan(-.005);expect(sunk.intersectingVertices).toBeGreaterThan(0);
     character.root.position.copy(position);character.root.position.y+=.08;
     expect(measureCushionContact(character.root,cushion as Mesh).contactGap).toBeGreaterThan(.03);
    }finally{character.root.position.copy(position);character.root.updateMatrixWorld(true);}
   }
   world.setCameraView('first-person');world.step({},1);
   const eye=new Vector3();expect(character.eyePosition(eye)).toBe(true);
   expect(world.camera.position.distanceTo(eye)).toBeLessThan(.002);
   expect(eye.y-top).toBeGreaterThan(.7);
   world.setCameraView('third-person');world.step({},1);
   if(spec.archetype==='unicycle')world.step({humanoid:{...humanoid.emptyInput(),brake:true}},120);
   expect(runtime.exit()).toBe(true);world.step({},30);
  }
 }finally{world.dispose();vi.unstubAllGlobals();}
},30000);
