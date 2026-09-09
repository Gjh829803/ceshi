/** Rebuild only the local ski asset; never re-import the donor project. */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Group } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildSkiModel } from '../../shared/training-content/ski-model';
import { SKI_SPEC } from '../../shared/training-content/ski';

Object.assign(globalThis,{FileReader:class {
  result:unknown;onloadend?:()=>void;
  readAsArrayBuffer(blob:Blob){void blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}
}});
const model=buildSkiModel(),seat=new Group();seat.name='seat.driver';seat.position.set(...SKI_SPEC.seat);model.add(seat);
const bytes=Buffer.from(await new GLTFExporter().parseAsync(model,{binary:true}) as ArrayBuffer);
const sha256=createHash('sha256').update(bytes).digest('hex');
const sourcePath='assets/three-creator/training/vehicles/ski.glb';
await mkdir('assets/three-creator/training/vehicles',{recursive:true});
await writeFile(sourcePath,bytes);
const file='assets/three-creator/asset-catalog.json',catalog=JSON.parse(await readFile(file,'utf8'));
const asset={id:'training.ski',displayName:'双板滑雪 / ALPINE',path:'vehicles/ski.glb',uri:`./assets/subjects/${sha256}.glb`,
  sha256,byteLength:bytes.length,sourcePath,usage:'reusable',
  rootTransform:{positionMetersXYZ:[0,0,0],rotationEulerRadiansXYZ:[0,0,0],scaleXYZ:[1,1,1]},
  actions:{},limitations:['Unpowered parallel skiing on packed snow; no deep-snow deformation, independent leg physics or ski tricks.','W pole pushes only below groundSpeed; turns retain momentum, S / Space brakes, gravity drives downhill.'],
  provenance:{source:'Local procedural geometry',generator:'scripts/three-creator/export-ski.ts'},resources:[],
  locomotionBindingIds:['training.ski'],training:{schemaVersion:1,spec:SKI_SPEC},
  sockets:[{id:'driver',node:'seat.driver',positionMetersXYZ:SKI_SPEC.seat}],collision:SKI_SPEC.envelope};
const index=catalog.assets.findIndex((entry:{id:string})=>entry.id===asset.id);
if(index<0)catalog.assets.push(asset);else catalog.assets[index]=asset;
await writeFile(file,JSON.stringify(catalog,null,2)+'\n');
console.log(JSON.stringify({sourcePath,sha256,byteLength:bytes.length}));
