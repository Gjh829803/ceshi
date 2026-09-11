import fs from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {measureDragonCore} from './dragon-core-collision.mjs';
import {humanoid} from '@worldkit/three';
const {dragonGroundHeading}=humanoid;
const directory='assets/dragon-training/__creature-assets';
globalThis.ProgressEvent=class{};
const variants=JSON.parse(await fs.readFile(directory+'/variants.json','utf8'));
const sources=[];
for(const variant of variants){
  const b=await fs.readFile(directory+'/'+variant.file),n=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+n)),bin=b.subarray(28+n);
  j.buffers=[{byteLength:bin.length,uri:'data:application/octet-stream;base64,'+bin.toString('base64')}];delete j.images;delete j.textures;
  for(const m of j.materials)for(const k of Object.keys(m))if(k!=='name')delete m[k];
  const gltf=await new GLTFLoader().parseAsync(JSON.stringify(j),'');gltf.scene.rotation.y=-Math.PI/2;
  const heading=dragonGroundHeading(gltf.scene,gltf.animations,variant.id);gltf.scene.rotation.y-=heading;
  const core=measureDragonCore(gltf,variant.id,[variant.id+'_Ground_Idle']);
  const mixer=new T.AnimationMixer(gltf.scene),clip=gltf.animations.find(c=>c.name===variant.id+'_Ground_Idle');mixer.clipAction(clip).play();
  let minimum=Infinity;const bounds=new T.Box3();
  for(let f=0;f<24;f++){
    mixer.setTime(clip.duration*f/24);gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(mesh=>{
      if(!(mesh instanceof T.SkinnedMesh))return;mesh.skeleton.update();
      const si=mesh.geometry.attributes.skinIndex,sw=mesh.geometry.attributes.skinWeight;
      for(let v=0;v<si.count;v++){
        const p=mesh.getVertexPosition(v,new T.Vector3()).applyMatrix4(mesh.matrixWorld);bounds.expandByPoint(p);
        let weight=0;for(let axis=0;axis<4;axis++)if(/^(Foot|Toe|Ball)/i.test(mesh.skeleton.bones[si.getComponent(v,axis)].name))weight+=sw.getComponent(v,axis);
        if(weight>.65)minimum=Math.min(minimum,p.y);
      }
    });
  }
  mixer.setTime(0);gltf.scene.updateMatrixWorld(true);
  const seat=gltf.scene.getObjectByName('Seat').getWorldPosition(new T.Vector3()).toArray();
  const bottom=Math.min(...core.probes.map(p=>p.center[1]-p.radius));
  const height=Math.max(.025-(Number.isFinite(minimum)?minimum:bounds.min.y),.04-bottom);
  // 大厅待机为同族落地姿态；地面支撑检查覆盖身体与尾部落地范围。
  variant.ground={rootHeight:Math.max(.025,+height.toFixed(3)),seat:seat.map(x=>+x.toFixed(3)),probes:core.probes,
    support:[bounds.min.x,bounds.max.x,bounds.min.z,bounds.max.z].map(x=>+x.toFixed(3)),
    landingSeconds:1.8,takeoffSeconds:1.4};
  const source=JSON.parse(await fs.readFile(process.argv[2]+'/'+variant.id+'.json','utf8'));
  delete source.clips[variant.id+'_Ground_ReferenceHover'];sources.push(source);
  console.log(variant.id,JSON.stringify(variant.ground));
  mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);
}
await fs.writeFile(directory+'/variants.json',JSON.stringify(variants,null,2)+'\n');
await fs.writeFile(directory+'/ground-sources.json',JSON.stringify(sources,null,2)+'\n');
await fs.writeFile('packages/three-world/src/humanoid-runtime/motion-families/flying-creature/ground-default.ts',
  '/** 由 measure-dragon-ground.mjs 从 D01 原生待机蒙皮生成，米制。 */\nimport type {FlyingCreatureGround} from "./ground";\nexport const DEFAULT_DRAGON_GROUND: FlyingCreatureGround = '+JSON.stringify(variants[0].ground,null,2)+';\n');
