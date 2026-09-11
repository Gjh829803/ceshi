import {writeCatalogSources,syncAssetCatalog} from '../../src/assets/catalog-sources.js';
/** Rebuild only the local sled asset; never re-import the donor project. */
import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { Group } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildSledModel } from '@worldkit/preset-content/sled-model';
import { SLED_SPEC } from '@worldkit/preset-content/sled';
import { humanoid } from '@worldkit/three';
const {defaultMovementSettings}=humanoid;

Object.assign(globalThis,{FileReader:class {
  result:unknown;onloadend?:()=>void;
  readAsArrayBuffer(blob:Blob){void blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}
}});
const model=buildSledModel(),seat=new Group();seat.name='seat.driver';seat.position.set(...SLED_SPEC.seat);model.add(seat);
const bytes=Buffer.from(await new GLTFExporter().parseAsync(model,{binary:true}) as ArrayBuffer);
const sha256=createHash('sha256').update(bytes).digest('hex');
const sourcePath='assets/three-creator/presets/vehicles/sled.glb';
await mkdir('assets/three-creator/presets/vehicles',{recursive:true});
await writeFile(sourcePath,bytes);
const asset={id:'vehicle.sled',displayName:"木座雪橇 / Sled",path:'vehicles/sled.glb',uri:`./assets/subjects/${sha256}.glb`,
  sha256,byteLength:bytes.length,sourcePath,usage:'reusable',
  rootTransform:{positionMetersXYZ:[0,0,0],rotationEulerRadiansXYZ:[0,0,0],scaleXYZ:[1,1,1]},
  actions:{},limitations:['Unpowered packed-snow approximation; no deep-snow deformation or rollover simulation.','W pushes only below groundSpeed; downhill speed comes from gravity.'],
  provenance:{source:'Local procedural geometry',generator:'packages/creator-host/scripts/assets/export-sled.ts'},resources:[],
  locomotionBindingIds:["locomotion.sled"],vehicle:{schemaVersion:1,spec:{...SLED_SPEC,...defaultMovementSettings('sled',SLED_SPEC),id:"sled",name:"木座雪橇",en:"Sled"}},
  sockets:[{id:'driver',node:'seat.driver',positionMetersXYZ:SLED_SPEC.seat}],collision:SLED_SPEC.envelope};
await writeCatalogSources(process.cwd(),[asset]);
await syncAssetCatalog(process.cwd());
console.log(JSON.stringify({sourcePath,sha256,byteLength:bytes.length}));
