/** 从实际导出蒙皮的完整动作周期测量米制包络；只在资产准备时执行。 */
import fs from 'node:fs/promises';
import path from 'node:path';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {humanoid} from '@worldkit/three';
const {FlyingCreatureVisual,createFlyingCreatureStateV1}=humanoid;
const [source,output]=process.argv.slice(2);
if(!source||!output)throw new Error('Usage: node measure-century-dragons.mjs <export-directory> <asset-directory>');
globalThis.ProgressEvent=class{constructor(type){this.type=type;}};
const selected=process.argv[4]?.split(',');
const variants=selected?JSON.parse(await fs.readFile(path.join(output,'variants.json'),'utf8')).filter(v=>!selected.includes(v.id)):[{id:'D01',name:'D01 · 原始飞龙',file:'dragon.glb',camera:32}];
const reports=selected?JSON.parse(await fs.readFile(path.join(output,'variant-sources.json'),'utf8')).filter(v=>!selected.includes(v.id)):[];
for(let number=2;number<=11;number++){
  const id='D'+String(number).padStart(2,'0');if(selected&&!selected.includes(id))continue;
  const bytes=await fs.readFile(path.join(source,id+'.glb'));
  const length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length)),bin=bytes.subarray(28+length);
  json.buffers=[{byteLength:bin.length,uri:'data:application/octet-stream;base64,'+bin.toString('base64')}];
  delete json.materials;delete json.images;delete json.textures;
  for(const mesh of json.meshes)for(const primitive of mesh.primitives)delete primitive.material;
  const gltf=await new GLTFLoader().parseAsync(JSON.stringify(json),'');
  gltf.scene.rotation.y=-Math.PI/2;
  const mixer=new T.AnimationMixer(gltf.scene),meshes=[];
  gltf.scene.traverse(n=>{if(n instanceof T.SkinnedMesh)meshes.push(n);});
  const cells=new Map(),bounds=new T.Box3(),seatBounds=new T.Box3();
  const point=new T.Vector3();
  for(const clip of gltf.animations.filter(c=>!c.name.includes('Shoot_')&&!c.name.includes('TPOSE'))){
    const action=mixer.clipAction(clip);action.play();
    for(let frame=0;frame<24;frame++){
      mixer.setTime(clip.duration*frame/24);gltf.scene.updateMatrixWorld(true);
      for(const mesh of meshes){
        mesh.skeleton.update();
        for(let index=0;index<mesh.geometry.attributes.position.count;index++){
          mesh.getVertexPosition(index,point).applyMatrix4(mesh.matrixWorld);bounds.expandByPoint(point);
          const key=point.toArray().map(v=>Math.floor(v/.4)).join(',');
          if(!cells.has(key))cells.set(key,point.clone());
        }
      }
      seatBounds.expandByPoint(gltf.scene.getObjectByName('Seat').getWorldPosition(point));
    }
    action.stop();
  }
  mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);
  const originalModel=GLTFLoader.prototype.loadAsync,originalTexture=T.TextureLoader.prototype.loadAsync;
  GLTFLoader.prototype.loadAsync=async()=>gltf;T.TextureLoader.prototype.loadAsync=async()=>new T.Texture();
  const visual=new FlyingCreatureVisual();
  try{await visual.load({dragonUrl:'measured',flameTextureUrl:'measured',animationPrefix:id});}
  finally{GLTFLoader.prototype.loadAsync=originalModel;T.TextureLoader.prototype.loadAsync=originalTexture;}
  const pose={position:new T.Vector3(),rotation:new T.Quaternion(),velocity:new T.Vector3(),yaw:0,speed:0,steering:0,flyingCreature:createFlyingCreatureStateV1()};
  for(const mode of ['hover','cruise','boost','dive','evade'])for(const turn of [-1,0,1])for(let frame=0;frame<24;frame++){
    pose.speed=mode==='hover'?0:31;Object.assign(pose.flyingCreature,{mode,bankRadians:turn*.8,pitchRadians:turn*.7,evadeDirection:turn<0?-1:1,evadeRemainingSeconds:.45*(1-frame/24)});
    visual.sample(pose,frame/24*2.3);visual.root.updateMatrixWorld(true);
    for(const mesh of meshes){mesh.skeleton.update();for(let index=0;index<mesh.geometry.attributes.position.count;index+=2){
      mesh.getVertexPosition(index,point).applyMatrix4(mesh.matrixWorld);bounds.expandByPoint(point);
      const key=point.toArray().map(v=>Math.floor(v/.4)).join(',');if(!cells.has(key))cells.set(key,point.clone());
    }}
  }
  // 最远点布点使细长尾部和翼尖也分配到球；不使用整只龙的单一包围球。
  const points=[...cells.values()],centers=[points[0]],distances=new Float64Array(points.length).fill(Infinity);
  for(let index=1;index<64;index++){
    const last=centers.at(-1);let farthest=0;
    for(let n=0;n<points.length;n++){distances[n]=Math.min(distances[n],points[n].distanceToSquared(last));if(distances[n]>distances[farthest])farthest=n;}
    if(distances[farthest]<2.25)break;
    centers.push(points[farthest]);
  }
  const radii=centers.map(()=>0);
  for(const point of points){let nearest=0;for(let n=1;n<centers.length;n++)if(point.distanceToSquared(centers[n])<point.distanceToSquared(centers[nearest]))nearest=n;radii[nearest]=Math.max(radii[nearest],point.distanceTo(centers[nearest]));}
  // 量化单元对角线和帧间插值留量；校验另采错开时间的真实混合姿态。
  const probes=centers.map((center,i)=>({id:`${id}-${i}`,center:center.toArray().map(n=>+n.toFixed(3)),radius:+(radii[i]+1.1).toFixed(3)}));
  const padded=bounds.clone().expandByScalar(1.1),center=padded.getCenter(new T.Vector3()),half=padded.getSize(new T.Vector3()).multiplyScalar(.5);
  pose.speed=0;pose.flyingCreature=createFlyingCreatureStateV1();visual.sample(pose,0);
  const seat=gltf.scene.getObjectByName('Seat').getWorldPosition(new T.Vector3()).toArray();
  const camera=Math.min(40,Math.max(32,Math.ceil(Math.max(half.x*2.5,half.z*1.5))));
  const variant={id,name:id+(id==='D09'?' · 长身龙':' · 飞龙'),file:id+'.glb',camera,seat,collisionProbes:probes,envelope:{kind:'box',halfExtents:half.toArray(),offset:center.toArray()}};
  variants.push(variant);
  reports.push({...JSON.parse(await fs.readFile(path.join(source,id+'.json'),'utf8')),measurement:{poses:24,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},seatBounds:{min:seatBounds.min.toArray(),max:seatBounds.max.toArray()},sphereCount:probes.length}});
  await fs.copyFile(path.join(source,id+'.glb'),path.join(output,id+'.glb'));
  console.log(id,bytes.length,'spheres',probes.length,'seat',seat,'bounds',bounds.min.toArray(),bounds.max.toArray());
  visual.dispose();
}
await fs.writeFile(path.join(output,'variants.json'),JSON.stringify(variants.sort((a,b)=>a.id.localeCompare(b.id)),null,2)+'\n');
await fs.writeFile(path.join(output,'variant-sources.json'),JSON.stringify(reports.sort((a,b)=>a.id.localeCompare(b.id)),null,2)+'\n');
