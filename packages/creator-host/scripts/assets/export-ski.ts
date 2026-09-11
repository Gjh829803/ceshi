import {writeCatalogSources,syncAssetCatalog} from '../../src/assets/catalog-sources.js';
/** Rebuild only the local ski asset; never re-import the donor project. */
import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { Group } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildSkiModel } from '@worldkit/preset-content/ski-model';
import { SKI_SPEC } from '@worldkit/preset-content/ski';

Object.assign(globalThis,{FileReader:class {
  result:unknown;onloadend?:()=>void;
  readAsArrayBuffer(blob:Blob){void blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}
}});
const model=buildSkiModel(),seat=new Group();seat.name='seat.driver';seat.position.set(...SKI_SPEC.seat);model.add(seat);
const bytes=Buffer.from(await new GLTFExporter().parseAsync(model,{binary:true}) as ArrayBuffer);
const sha256=createHash('sha256').update(bytes).digest('hex');
const sourcePath='assets/three-creator/presets/vehicles/ski.glb';
await mkdir('assets/three-creator/presets/vehicles',{recursive:true});
await writeFile(sourcePath,bytes);
const asset={id:'vehicle.ski',displayName:"双板滑雪 / Skis",path:'vehicles/ski.glb',uri:`./assets/subjects/${sha256}.glb`,
  sha256,byteLength:bytes.length,sourcePath,usage:'reusable',
  rootTransform:{positionMetersXYZ:[0,0,0],rotationEulerRadiansXYZ:[0,0,0],scaleXYZ:[1,1,1]},
  actions:{},limitations:['Unpowered parallel skiing on packed snow; no deep-snow deformation, independent leg physics or ski tricks.','W pole pushes only below groundSpeed; turns retain momentum, S / Space brakes, gravity drives downhill.'],
  provenance:{source:'Local procedural geometry',generator:'packages/creator-host/scripts/assets/export-ski.ts'},resources:[],
  locomotionBindingIds:["locomotion.ski"],vehicle:{schemaVersion:1,spec:{...SKI_SPEC,id:"ski",name:"双板滑雪",en:"Skis"}},
  sockets:[{id:'driver',node:'seat.driver',positionMetersXYZ:SKI_SPEC.seat}],collision:SKI_SPEC.envelope};
await writeCatalogSources(process.cwd(),[asset]);
await syncAssetCatalog(process.cwd());
console.log(JSON.stringify({sourcePath,sha256,byteLength:bytes.length}));
