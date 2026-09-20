import {exportDestination,writeIntakeExport} from './export-intake.js';
const sourcePath=exportDestination();
/** Rebuild only the local observation-sub asset; never re-import the donor project. */
import { createHash } from 'node:crypto';
import { Group } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildSubmersibleModel } from '@worldkit/preset-content/submersible-model';
import { SUBMERSIBLE_SPEC } from '@worldkit/preset-content/submersible';
import { humanoid } from '@worldkit/three';
const {defaultMovementSettings}=humanoid;

Object.assign(globalThis,{FileReader:class {
  result:unknown;onloadend?:()=>void;
  readAsArrayBuffer(blob:Blob){void blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}
}});
const model=buildSubmersibleModel(),seat=new Group();seat.name='seat.driver';seat.position.set(...SUBMERSIBLE_SPEC.seat);model.add(seat);
const bytes=Buffer.from(await new GLTFExporter().parseAsync(model,{binary:true}) as ArrayBuffer);
const sha256=createHash('sha256').update(bytes).digest('hex');
const asset={id:'vehicle.observation-submarine',displayName:"单人观景潜艇 / Observation submarine",path:'vehicles/observation-sub.glb',uri:`./assets/subjects/${sha256}.glb`,
  sha256,byteLength:bytes.length,sourcePath,usage:'reusable',
  rootTransform:{positionMetersXYZ:[0,0,0],rotationEulerRadiansXYZ:[0,0,0],scaleXYZ:[1,1,1]},
  actions:{},limitations:['Hydrostatic buoyancy and ballast approximation; no fluid solver or pressure damage.','W/S propulsion, A/D yaw, Ctrl dives with ballast, Space surfaces, Q/E roll, Shift slows; hatch opens only at the surface.'],
  provenance:{source:'Local procedural geometry',generator:'packages/creator-host/scripts/assets/export-submersible.ts'},resources:[],
  locomotionBindingIds:["locomotion.submarine"],vehicle:{schemaVersion:1,spec:{...defaultMovementSettings('submarine',SUBMERSIBLE_SPEC),...SUBMERSIBLE_SPEC,id:"observation-submarine",name:"单人观景潜艇",en:"Observation submarine"}},
  sockets:[{id:'driver',node:'seat.driver',positionMetersXYZ:SUBMERSIBLE_SPEC.seat}],collision:SUBMERSIBLE_SPEC.envelope};
await writeIntakeExport(sourcePath,bytes,asset);
