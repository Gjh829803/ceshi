import {writeCatalogSources,syncAssetCatalog} from '../../src/assets/catalog-sources.js';
/** Rebuild only the local jetski asset; never re-import the donor project. */
import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { Group } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildJetSkiModel } from '@worldkit/preset-content/jetski-model';
import { JETSKI_SPEC,JETSKI_SOCKETS } from '@worldkit/preset-content/jetski';

Object.assign(globalThis,{FileReader:class {
  result:unknown;onloadend?:()=>void;
  readAsArrayBuffer(blob:Blob){void blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}
}});
const model=buildJetSkiModel();
const bytes=Buffer.from(await new GLTFExporter().parseAsync(model,{binary:true}) as ArrayBuffer);
const sha256=createHash('sha256').update(bytes).digest('hex');
const sourcePath='assets/three-creator/presets/vehicles/jetski.glb';
await mkdir('assets/three-creator/presets/vehicles',{recursive:true});
await writeFile(sourcePath,bytes);
const asset={id:'vehicle.jetski',displayName:"水上摩托 / Personal watercraft",path:'vehicles/jetski.glb',uri:`./assets/subjects/${sha256}.glb`,
  sha256,byteLength:bytes.length,sourcePath,usage:'reusable',
  rootTransform:{positionMetersXYZ:[0,0,0],rotationEulerRadiansXYZ:[0,0,0],scaleXYZ:[1,1,1]},
  actions:{},limitations:['Jet propelled personal watercraft with buoyancy, independent handlebars and world-space water spray.','Single original straddle rider; no fuel, damage or ocean wave simulation.'],
  provenance:{source:'Local procedural geometry',generator:'packages/creator-host/scripts/assets/export-jetski.ts'},resources:[],
  locomotionBindingIds:["locomotion.boat"],vehicle:{schemaVersion:1,spec:{...JETSKI_SPEC,id:"jetski",name:"水上摩托",en:"Personal watercraft"}},
  sockets:Object.entries(JETSKI_SOCKETS).map(([node,positionMetersXYZ])=>({id:node,node,positionMetersXYZ})).concat([{id:'control.hand.left',node:'control.hand.left',positionMetersXYZ:[.29,0,0]},{id:'control.hand.right',node:'control.hand.right',positionMetersXYZ:[-.29,0,0]}]),collision:JETSKI_SPEC.envelope};
await writeCatalogSources(process.cwd(),[asset]);
await syncAssetCatalog(process.cwd());
console.log(JSON.stringify({sourcePath,sha256,byteLength:bytes.length}));
