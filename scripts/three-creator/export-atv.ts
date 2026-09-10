import {writeCatalogSources,syncAssetCatalog} from './catalog-sources.js';
/** Rebuild only the local atv asset; never re-import the donor project. */
import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { Group } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildAtvModel } from '../../shared/preset-content/atv-model';
import { ATV_SPEC,ATV_SOCKETS } from '../../shared/preset-content/atv';

Object.assign(globalThis,{FileReader:class {
  result:unknown;onloadend?:()=>void;
  readAsArrayBuffer(blob:Blob){void blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}
}});
const model=buildAtvModel();
const bytes=Buffer.from(await new GLTFExporter().parseAsync(model,{binary:true}) as ArrayBuffer);
const sha256=createHash('sha256').update(bytes).digest('hex');
const sourcePath='assets/three-creator/presets/vehicles/atv.glb';
await mkdir('assets/three-creator/presets/vehicles',{recursive:true});
await writeFile(sourcePath,bytes);
const asset={id:'vehicle.atv',displayName:'全地形车 / QUAD ATV',path:'vehicles/atv.glb',uri:`./assets/subjects/${sha256}.glb`,
  sha256,byteLength:bytes.length,sourcePath,usage:'reusable',
  rootTransform:{positionMetersXYZ:[0,0,0],rotationEulerRadiansXYZ:[0,0,0],scaleXYZ:[1,1,1]},
  actions:{},limitations:['Racing quad inspired by PUBG; short-wheelbase four-wheel drive with front-wheel steering and original straddle rider.','Single active driver under the current Training contract. Rear passenger socket is reserved; no fuel, damage or multiplayer passenger simulation.'],
  provenance:{source:'Local procedural geometry',generator:'scripts/three-creator/export-atv.ts'},resources:[],
  locomotionBindingIds:['vehicle.atv'],vehicle:{schemaVersion:1,spec:ATV_SPEC},
  sockets:Object.entries(ATV_SOCKETS).map(([node,positionMetersXYZ])=>({id:node,node,positionMetersXYZ})).concat([{id:'control.hand.left',node:'control.hand.left',positionMetersXYZ:[.29,0,0]},{id:'control.hand.right',node:'control.hand.right',positionMetersXYZ:[-.29,0,0]}]),collision:ATV_SPEC.envelope};
await writeCatalogSources(process.cwd(),[asset]);
await syncAssetCatalog(process.cwd());
console.log(JSON.stringify({sourcePath,sha256,byteLength:bytes.length}));
