/** Rebuild only the local kayak asset; never re-import the donor project. */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Group } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildKayakModel } from '../../shared/preset-content/kayak-model';
import { KAYAK_SPEC } from '../../shared/preset-content/kayak';
import { humanoid } from '@worldkit/three';
const {defaultMovementSettings}=humanoid;

Object.assign(globalThis,{FileReader:class {
  result:unknown;onloadend?:()=>void;
  readAsArrayBuffer(blob:Blob){void blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}
}});
const model=buildKayakModel(),seat=new Group();seat.name='seat.driver';seat.position.set(...KAYAK_SPEC.seat);model.add(seat);
const bytes=Buffer.from(await new GLTFExporter().parseAsync(model,{binary:true}) as ArrayBuffer);
const sha256=createHash('sha256').update(bytes).digest('hex');
const sourcePath='assets/three-creator/presets/vehicles/kayak.glb';
await mkdir('assets/three-creator/presets/vehicles',{recursive:true});
await writeFile(sourcePath,bytes);
const file='assets/three-creator/asset-catalog.json',catalog=JSON.parse(await readFile(file,'utf8'));
const asset={id:'vehicle.kayak',displayName:'单人皮划艇 / KAYAK',path:'vehicles/kayak.glb',uri:`./assets/subjects/${sha256}.glb`,
  sha256,byteLength:bytes.length,sourcePath,usage:'reusable',
  rootTransform:{positionMetersXYZ:[0,0,0],rotationEulerRadiansXYZ:[0,0,0],scaleXYZ:[1,1,1]},
  actions:{},limitations:['Four-sample hydrostatic buoyancy and stroke-driven drag approximation; no waves, current or capsize simulation.','W paddles, S back-paddles, A/D sweep, Space braces to slow; propulsion requires immersion.'],
  provenance:{source:'Local procedural geometry',generator:'scripts/three-creator/export-kayak.ts'},resources:[],
  locomotionBindingIds:['vehicle.kayak'],vehicle:{schemaVersion:1,spec:{...KAYAK_SPEC,...defaultMovementSettings('kayak',KAYAK_SPEC)}},
  sockets:[{id:'driver',node:'seat.driver',positionMetersXYZ:KAYAK_SPEC.seat}],collision:KAYAK_SPEC.envelope};
const index=catalog.assets.findIndex((entry:{id:string})=>entry.id===asset.id);
if(index<0)catalog.assets.push(asset);else catalog.assets[index]=asset;
await writeFile(file,JSON.stringify(catalog,null,2)+'\n');
console.log(JSON.stringify({sourcePath,sha256,byteLength:bytes.length}));
