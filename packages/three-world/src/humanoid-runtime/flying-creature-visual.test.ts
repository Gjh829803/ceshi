import {readFileSync} from 'node:fs';
import {afterEach,expect,it,vi} from 'vitest';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {FlyingCreatureVisual} from './motion-families/flying-creature/visual';
import {createFlyingCreatureStateV1} from './motion-families/flying-creature/state';
import {CREATURE_COLLISION_PROBES} from './motion-families/flying-creature/collision-probes';
import {CreatureFlame} from './motion-families/flying-creature/flame';
import type {MotionPose} from './presentation';
afterEach(()=>vi.restoreAllMocks());
async function fixture(){
  vi.stubGlobal('ProgressEvent',class{constructor(public type:string){}});
  const bytes=readFileSync(new URL('../../../../assets/dragon-training/__creature-assets/dragon.glb',import.meta.url));
  const length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length).toString()),bin=bytes.subarray(28+length);
  json.buffers=[{byteLength:bin.length,uri:'data:application/octet-stream;base64,'+bin.toString('base64')}];
  // 保留真实蒙皮、骨架和动作；几何回归不需要解码像素纹理。
  delete json.materials;delete json.images;delete json.textures;for(const mesh of json.meshes)for(const p of mesh.primitives)delete p.material;
  const model=await new GLTFLoader().parseAsync(JSON.stringify(json),'');
  vi.spyOn(GLTFLoader.prototype,'loadAsync').mockResolvedValue(model);vi.spyOn(T.TextureLoader.prototype,'loadAsync').mockResolvedValue(new T.Texture());
  const visual=new FlyingCreatureVisual();await visual.load({dragonUrl:'fixture',flameTextureUrl:'fixture'});
  const pose:MotionPose={position:new T.Vector3(),rotation:new T.Quaternion(),velocity:new T.Vector3(),yaw:0,speed:0,steering:0,flyingCreature:createFlyingCreatureStateV1()};
  return {visual,pose,model};
}
it('samples real flight skin inside the collision volume, including blended turns and wing strokes',async()=>{
  const {visual,pose}=await fixture(),meshes:T.SkinnedMesh[]=[];visual.root.traverse(n=>{if(n instanceof T.SkinnedMesh)meshes.push(n);});
  try{
    let worst=-Infinity,detail:unknown;
    for(const mode of ['hover','cruise','boost','dive','evade'] as const)for(const turn of [-1,0,1])for(let frame=0;frame<12;frame++){
      Object.assign(pose.flyingCreature!,{mode,bankRadians:turn*.8,pitchRadians:mode==='dive'?-1:0,evadeDirection:turn||1,evadeRemainingSeconds:.45*(1-frame/12)});pose.speed=mode==='hover'?0:mode==='cruise'?18:31;
      visual.sample(pose,frame*.13);
      for(const mesh of meshes){mesh.skeleton.update();for(let n=0;n<mesh.geometry.attributes.position!.count;n+=11){
        const p=mesh.getVertexPosition(n,new T.Vector3()).applyMatrix4(mesh.matrixWorld);
        const outside=Math.min(...CREATURE_COLLISION_PROBES.map(probe=>p.distanceTo(new T.Vector3(...probe.center))-probe.radius));if(outside>worst){worst=outside;detail={mode,turn,frame,point:p.toArray(),mesh:mesh.name};}
      }}
    }
    expect(meshes.length).toBeGreaterThan(0);expect(worst,JSON.stringify(detail)).toBeLessThan(.05);
  }finally{visual.dispose();vi.unstubAllGlobals();}
});
it('flame opens the jaw without shortening the neck and repeated display sampling is stable',async()=>{
  const {visual,pose}=await fixture();try{
    const head=visual.root.getObjectByName('Head')!,jaw=visual.root.getObjectByName('Jaw')!;
    visual.sample(pose,.21);const originalHead=head.matrixWorld.clone(),originalJaw=jaw.quaternion.clone();
    Object.assign(pose.flyingCreature!,{flamePhase:'loop',flamePhaseSeconds:.4});visual.sample(pose,.21);
    expect(head.matrixWorld.elements).toEqual(originalHead.elements);expect(jaw.quaternion.angleTo(originalJaw)).toBeGreaterThan(.01);
    const sample=jaw.quaternion.clone(),seat=visual.readSeatWorld();visual.sample(pose,.4);visual.sample(pose,.21);
    expect(jaw.quaternion.angleTo(sample)).toBeLessThan(1e-7);expect(visual.readSeatWorld().elements).toEqual(seat.elements);
    const size=new T.Vector3();seat.decompose(new T.Vector3(),new T.Quaternion(),size);expect(size.distanceTo(new T.Vector3(1,1,1))).toBeLessThan(1e-7);
  }finally{visual.dispose();vi.unstubAllGlobals();}
});
it('flame history advances only on commits and clears on reset',()=>{
  const flame=new CreatureFlame(new T.Texture()),root=new T.Group();root.add(flame.object);try{
    for(let tick=0;tick<60;tick++)flame.commit(1,tick,tick/60,1,new T.Vector3(),new T.Vector3(0,0,1),new T.Vector3());
    flame.sample(.95,root);const count=flame.object.geometry.drawRange.count,positions=Array.from(flame.object.geometry.attributes.position!.array);
    expect(count).toBeGreaterThan(20);flame.sample(.95,root);expect(flame.object.geometry.drawRange.count).toBe(count);expect(Array.from(flame.object.geometry.attributes.position!.array)).toEqual(positions);
    flame.commit(2,0,0,0,new T.Vector3(),new T.Vector3(0,0,1),new T.Vector3());flame.sample(0,root);expect(flame.object.geometry.drawRange.count).toBe(0);
  }finally{flame.dispose();}
});
