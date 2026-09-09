/** Rebuild only the local jetski asset; never re-import the donor project. */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Group } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildJetSkiModel } from '../../shared/training-content/jetski-model';
import { JETSKI_SPEC,JETSKI_SOCKETS } from '../../shared/training-content/jetski';

Object.assign(globalThis,{FileReader:class {
  result:unknown;onloadend?:()=>void;
  readAsArrayBuffer(blob:Blob){void blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}
}});
const model=buildJetSkiModel();
const bytes=Buffer.from(await new GLTFExporter().parseAsync(model,{binary:true}) as ArrayBuffer);
const sha256=createHash('sha256').update(bytes).digest('hex');
const sourcePath='assets/three-creator/training/vehicles/jetski.glb';
await mkdir('assets/three-creator/training/vehicles',{recursive:true});
await writeFile(sourcePath,bytes);
const file='assets/three-creator/asset-catalog.json',catalog=JSON.parse(await readFile(file,'utf8'));
const asset={id:'training.jetski',displayName:'水上摩托 / JET SKI',path:'vehicles/jetski.glb',uri:`./assets/subjects/${sha256}.glb`,
  sha256,byteLength:bytes.length,sourcePath,usage:'reusable',
  rootTransform:{positionMetersXYZ:[0,0,0],rotationEulerRadiansXYZ:[0,0,0],scaleXYZ:[1,1,1]},
  actions:{},limitations:['Jet propelled personal watercraft with buoyancy, independent handlebars and world-space water spray.','Single original straddle rider; no fuel, damage or ocean wave simulation.'],
  provenance:{source:'Local procedural geometry',generator:'scripts/three-creator/export-jetski.ts'},resources:[],
  locomotionBindingIds:['training.jetski'],training:{schemaVersion:1,spec:JETSKI_SPEC},
  sockets:Object.entries(JETSKI_SOCKETS).map(([node,positionMetersXYZ])=>({id:node,node,positionMetersXYZ})).concat([{id:'control.hand.left',node:'control.hand.left',positionMetersXYZ:[.29,0,0]},{id:'control.hand.right',node:'control.hand.right',positionMetersXYZ:[-.29,0,0]}]),collision:JETSKI_SPEC.envelope};
const index=catalog.assets.findIndex((entry:{id:string})=>entry.id===asset.id);
if(index<0)catalog.assets.push(asset);else catalog.assets[index]=asset;
await writeFile(file,JSON.stringify(catalog,null,2)+'\n');
console.log(JSON.stringify({sourcePath,sha256,byteLength:bytes.length}));
