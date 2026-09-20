import {exportDestination,writeIntakeExport} from './export-intake.js';
const sourcePath=exportDestination();
/** Rebuild only the local kayak asset; never re-import the donor project. */
import { createHash } from 'node:crypto';
import { Group } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildKayakModel } from '@worldkit/preset-content/kayak-model';
import { KAYAK_SPEC } from '@worldkit/preset-content/kayak';
import { humanoid } from '@worldkit/three';
const {defaultMovementSettings}=humanoid;

Object.assign(globalThis,{FileReader:class {
  result:unknown;onloadend?:()=>void;
  readAsArrayBuffer(blob:Blob){void blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}
}});
const model=buildKayakModel(),seat=new Group();seat.name='seat.driver';seat.position.set(...KAYAK_SPEC.seat);model.add(seat);
const bytes=Buffer.from(await new GLTFExporter().parseAsync(model,{binary:true}) as ArrayBuffer);
const sha256=createHash('sha256').update(bytes).digest('hex');
const asset={id:'vehicle.kayak',displayName:"单人皮划艇 / Kayak",path:'vehicles/kayak.glb',uri:`./assets/subjects/${sha256}.glb`,
  sha256,byteLength:bytes.length,sourcePath,usage:'reusable',
  rootTransform:{positionMetersXYZ:[0,0,0],rotationEulerRadiansXYZ:[0,0,0],scaleXYZ:[1,1,1]},
  actions:{},limitations:['Four-sample hydrostatic buoyancy and stroke-driven drag approximation; no waves, current or capsize simulation.','W paddles, S back-paddles, A/D sweep, Space braces to slow; propulsion requires immersion.'],
  provenance:{source:'Local procedural geometry',generator:'packages/creator-host/scripts/assets/export-kayak.ts'},resources:[],
  locomotionBindingIds:["locomotion.paddled-boat"],vehicle:{schemaVersion:1,spec:{...KAYAK_SPEC,...defaultMovementSettings('paddled_boat',KAYAK_SPEC),id:"kayak",name:"单人皮划艇",en:"Kayak"}},
  sockets:[{id:'driver',node:'seat.driver',positionMetersXYZ:KAYAK_SPEC.seat}],collision:KAYAK_SPEC.envelope};
await writeIntakeExport(sourcePath,bytes,asset);
