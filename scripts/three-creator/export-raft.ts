import {writeCatalogSources,syncAssetCatalog} from './catalog-sources.js';
/** Rebuild only the local raft asset; never re-import the donor project. */
import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { Group } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildRaftModel } from '../../shared/preset-content/raft-model';
import { RAFT_SPEC,RAFT_SOCKETS } from '../../shared/preset-content/raft';
import { humanoid } from '@worldkit/three';
const {defaultMovementSettings}=humanoid;

Object.assign(globalThis,{FileReader:class {
  result:unknown;onloadend?:()=>void;
  readAsArrayBuffer(blob:Blob){void blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}
}});
const model=buildRaftModel();
const bytes=Buffer.from(await new GLTFExporter().parseAsync(model,{binary:true}) as ArrayBuffer);
const sha256=createHash('sha256').update(bytes).digest('hex');
const sourcePath='assets/three-creator/presets/vehicles/raft.glb';
await mkdir('assets/three-creator/presets/vehicles',{recursive:true});
await writeFile(sourcePath,bytes);
const asset={id:'vehicle.raft',displayName:'橡皮艇 / INFLATABLE BOAT',path:'vehicles/raft.glb',uri:`./assets/subjects/${sha256}.glb`,
  sha256,byteLength:bytes.length,sourcePath,usage:'reusable',
  rootTransform:{positionMetersXYZ:[0,0,0],rotationEulerRadiansXYZ:[0,0,0],scaleXYZ:[1,1,1]},
  actions:{},limitations:['Unpowered inflatable boat; paddle propulsion on water, gravity sliding on land and damped contact restitution. Single active driver; passenger anchors reserved.','W repeats single-sided strokes with yaw, S back-paddles, A/D change sides and sweep, Space braces to slow; propulsion requires immersion.'],
  provenance:{source:'Local procedural geometry',generator:'scripts/three-creator/export-raft.ts'},resources:[],
  locomotionBindingIds:['vehicle.raft'],vehicle:{schemaVersion:1,spec:{...defaultMovementSettings('paddled_boat',RAFT_SPEC),...RAFT_SPEC}},
  sockets:Object.entries(RAFT_SOCKETS).map(([node,positionMetersXYZ])=>({id:node,node,positionMetersXYZ})).concat([{id:'control.hand.left',node:'control.hand.left',positionMetersXYZ:[0,0,0]},{id:'control.hand.right',node:'control.hand.right',positionMetersXYZ:[0,-.56,0]}]),collision:RAFT_SPEC.envelope};
await writeCatalogSources(process.cwd(),[asset]);
await syncAssetCatalog(process.cwd());
console.log(JSON.stringify({sourcePath,sha256,byteLength:bytes.length}));
