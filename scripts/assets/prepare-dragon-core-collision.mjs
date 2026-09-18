import fs from 'node:fs/promises';
import path from 'node:path';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {measureDragonCore} from './dragon-core-collision.mjs';

const [directory,output,codeOutput]=process.argv.slice(2);
if(!directory||!output)throw new Error('Usage: node prepare-dragon-core-collision.mjs <source-directory> <new-measurements-directory> [code-output.ts]; review measurements for library bindings');
await fs.mkdir(output,{recursive:false});
globalThis.ProgressEvent=class{constructor(type){this.type=type;}};
const variants=JSON.parse(await fs.readFile(path.join(directory,'variants.json'),'utf8'));
const reports=JSON.parse(await fs.readFile(path.join(directory,'variant-sources.json'),'utf8'));
for(const variant of variants){
  const bytes=await fs.readFile(path.join(directory,variant.file)),length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length)),bin=bytes.subarray(28+length);
  json.buffers=[{byteLength:bin.length,uri:'data:application/octet-stream;base64,'+bin.toString('base64')}];
  delete json.images;delete json.textures;
  for(const material of json.materials)for(const key of Object.keys(material))if(key!=='name')delete material[key];
  const gltf=await new GLTFLoader().parseAsync(JSON.stringify(json),'');gltf.scene.rotation.y=-Math.PI/2;
  const core=measureDragonCore(gltf,variant.id),before=variant.envelope?.halfExtents;
  variant.collisionProbes=core.probes;variant.envelope=core.envelope;
  const report=reports.find(r=>r.id===variant.id);if(report){report.collisionMeasurement=core.measurement;if(report.measurement)report.measurement.sphereCount=core.probes.length;}
  console.log(variant.id,'before',before,'after',core.envelope.halfExtents,'radii',core.probes.map(p=>p.radius));
}
await fs.writeFile(path.join(output,'variants.json'),JSON.stringify(variants,null,2)+'\n');
await fs.writeFile(path.join(output,'variant-sources.json'),JSON.stringify(reports,null,2)+'\n');
const d01=variants.find(v=>v.id==='D01');
if(codeOutput)await fs.writeFile(codeOutput,
  '/** D01 躯干、颈部和头部的米制通行体积；翼尖/尾尖允许擦边。由 prepare-dragon-core-collision.mjs 生成。 */\n'+
  'export const CREATURE_COLLISION_PROBES:readonly {id:string;center:readonly [number,number,number];radius:number}[] = '+JSON.stringify(d01.collisionProbes,null,2)+';\n'+
  'export const CREATURE_COLLISION_ENVELOPE = '+JSON.stringify(d01.envelope,null,2)+' as const;\n');
