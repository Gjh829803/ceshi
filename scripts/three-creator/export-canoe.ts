import {writeCatalogSources,syncAssetCatalog} from './catalog-sources.js';
/** Rebuild only the local canoe asset; never re-import the donor project. */
import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { Group } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildCanoeModel } from '../../shared/preset-content/canoe-model';
import { CANOE_SPEC } from '../../shared/preset-content/canoe';
import { humanoid } from '@worldkit/three';
const {defaultMovementSettings}=humanoid;

Object.assign(globalThis,{FileReader:class {
  result:unknown;onloadend?:()=>void;
  readAsArrayBuffer(blob:Blob){void blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}
}});
const model=buildCanoeModel(),seat=new Group();seat.name='seat.driver';seat.position.set(...CANOE_SPEC.seat);model.add(seat);
const bytes=Buffer.from(await new GLTFExporter().parseAsync(model,{binary:true}) as ArrayBuffer);
const sha256=createHash('sha256').update(bytes).digest('hex');
const sourcePath='assets/three-creator/presets/vehicles/canoe.glb';
await mkdir('assets/three-creator/presets/vehicles',{recursive:true});
await writeFile(sourcePath,bytes);
const asset={id:'vehicle.canoe',displayName:'单桨木舟 / CANOE',path:'vehicles/canoe.glb',uri:`./assets/subjects/${sha256}.glb`,
  sha256,byteLength:bytes.length,sourcePath,usage:'reusable',
  rootTransform:{positionMetersXYZ:[0,0,0],rotationEulerRadiansXYZ:[0,0,0],scaleXYZ:[1,1,1]},
  actions:{},limitations:['Four-sample hydrostatic buoyancy and stroke-driven drag approximation; no waves, current or capsize simulation.','W repeats single-sided strokes with yaw, S back-paddles, A/D change sides and sweep, Space braces to slow; propulsion requires immersion.'],
  provenance:{source:'Local procedural geometry',generator:'scripts/three-creator/export-canoe.ts'},resources:[],
  locomotionBindingIds:['vehicle.canoe'],vehicle:{schemaVersion:1,spec:{...defaultMovementSettings('paddled_boat',CANOE_SPEC),...CANOE_SPEC}},
  sockets:[{id:'driver',node:'seat.driver',positionMetersXYZ:CANOE_SPEC.seat}],collision:CANOE_SPEC.envelope};
await writeCatalogSources(process.cwd(),[asset]);
await syncAssetCatalog(process.cwd());
console.log(JSON.stringify({sourcePath,sha256,byteLength:bytes.length}));
