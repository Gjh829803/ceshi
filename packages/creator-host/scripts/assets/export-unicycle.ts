import {exportDestination,writeIntakeExport} from './export-intake.js';
const sourcePath=exportDestination();
/** Rebuild only the local unicycle asset; never re-import the donor project. */
import { createHash } from 'node:crypto';
import { Group } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildUnicycleModel } from '@worldkit/preset-content/unicycle-model';
import { UNICYCLE_SPEC,UNICYCLE_SOCKETS } from '@worldkit/preset-content/unicycle';

Object.assign(globalThis,{FileReader:class {
  result:unknown;onloadend?:()=>void;
  readAsArrayBuffer(blob:Blob){void blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}
}});
const model=buildUnicycleModel();
const bytes=Buffer.from(await new GLTFExporter().parseAsync(model,{binary:true}) as ArrayBuffer);
const sha256=createHash('sha256').update(bytes).digest('hex');
const asset={id:'vehicle.unicycle',displayName:"独轮车 / Unicycle",path:'vehicles/unicycle.glb',uri:`./assets/subjects/${sha256}.glb`,
  sha256,byteLength:bytes.length,sourcePath,usage:'reusable',
  rootTransform:{positionMetersXYZ:[0,0,0],rotationEulerRadiansXYZ:[0,0,0],scaleXYZ:[1,1,1]},
  actions:{},limitations:['Direct-drive single wheel with original humanoid balance and terrain-checked left-foot support.','Assisted balance, not a free-falling single-wheel rigid-body simulation. No aerial tricks.'],
  provenance:{source:'Local procedural geometry',generator:'packages/creator-host/scripts/assets/export-unicycle.ts'},resources:[],
  locomotionBindingIds:["locomotion.unicycle"],vehicle:{schemaVersion:1,spec:{...UNICYCLE_SPEC,id:"unicycle",name:"独轮车",en:"Unicycle"}},
  sockets:Object.entries(UNICYCLE_SOCKETS).map(([node,positionMetersXYZ])=>({id:node,node,positionMetersXYZ})),collision:UNICYCLE_SPEC.envelope};
await writeIntakeExport(sourcePath,bytes,asset);
