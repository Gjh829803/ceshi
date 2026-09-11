import {writeCatalogSources,syncAssetCatalog} from '../../src/assets/catalog-sources.js';
/** Rebuild only the local bus asset; never re-import the donor project. */
import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { Group } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildBusModel } from '@worldkit/preset-content/bus-model';
import { BUS_SPEC } from '@worldkit/preset-content/bus';
import { humanoid } from '@worldkit/three';
const {defaultMovementSettings}=humanoid;

Object.assign(globalThis,{FileReader:class {
  result:unknown;onloadend?:()=>void;
  readAsArrayBuffer(blob:Blob){void blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}
}});
const visual=buildBusModel(),model=visual.root,seat=new Group();
visual.wheelRigs.forEach((rig,i)=>{rig.steering.name='wheel.'+i+'.steer';rig.spin.name='wheel.'+i+'.spin';});seat.name='seat.driver';seat.position.set(...BUS_SPEC.seat);model.add(seat);
const bytes=Buffer.from(await new GLTFExporter().parseAsync(model,{binary:true}) as ArrayBuffer);
const sha256=createHash('sha256').update(bytes).digest('hex');
const sourcePath='assets/three-creator/presets/vehicles/bus.glb';
await mkdir('assets/three-creator/presets/vehicles',{recursive:true});
await writeFile(sourcePath,bytes);
const asset={id:'vehicle.bus',displayName:"复古小巴 / Bus",path:'vehicles/bus.glb',uri:`./assets/subjects/${sha256}.glb`,
  sha256,byteLength:bytes.length,sourcePath,usage:'reusable',
  rootTransform:{positionMetersXYZ:[0,0,0],rotationEulerRadiansXYZ:[0,0,0],scaleXYZ:[1,1,1]},
  actions:{},limitations:['Shared rigid-body wheel physics, raycast suspension, tire forces and automatic powertrain; no deformable tires or damage simulation.','W throttle; S brakes before reversing; Space brakes. Shift adds no boost.'],
  provenance:{source:'Local procedural geometry',generator:'packages/creator-host/scripts/assets/export-bus.ts'},resources:[],
  locomotionBindingIds:["locomotion.bus"],vehicle:{schemaVersion:1,spec:{...defaultMovementSettings('bus',BUS_SPEC),...BUS_SPEC,id:"bus",name:"复古小巴",en:"Bus"}},
  sockets:[{id:'driver',node:'seat.driver',positionMetersXYZ:BUS_SPEC.seat}],collision:BUS_SPEC.envelope};
await writeCatalogSources(process.cwd(),[asset]);
await syncAssetCatalog(process.cwd());
console.log(JSON.stringify({sourcePath,sha256,byteLength:bytes.length}));
