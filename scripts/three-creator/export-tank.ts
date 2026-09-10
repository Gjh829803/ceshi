/** Rebuild only the local tank asset; never re-import the donor project. */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Group } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildTankModel } from '../../shared/preset-content/tank-model';
import { TANK_SPEC,TANK_SOCKETS } from '../../shared/preset-content/tank';

Object.assign(globalThis,{FileReader:class {
  result:unknown;onloadend?:()=>void;
  readAsArrayBuffer(blob:Blob){void blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}
}});
const model=buildTankModel();
const bytes=Buffer.from(await new GLTFExporter().parseAsync(model,{binary:true}) as ArrayBuffer);
const sha256=createHash('sha256').update(bytes).digest('hex');
const sourcePath='assets/three-creator/presets/vehicles/tank.glb';
await mkdir('assets/three-creator/presets/vehicles',{recursive:true});
await writeFile(sourcePath,bytes);
const file='assets/three-creator/asset-catalog.json',catalog=JSON.parse(await readFile(file,'utf8'));
const asset={id:'vehicle.tank',displayName:'履带坦克 / TANK',path:'vehicles/tank.glb',uri:`./assets/subjects/${sha256}.glb`,
  sha256,byteLength:bytes.length,sourcePath,usage:'reusable',
  rootTransform:{positionMetersXYZ:[0,0,0],rotationEulerRadiansXYZ:[0,0,0],scaleXYZ:[1,1,1]},
  actions:{},limitations:['Enlarged enclosed single-driver humanoid tank; differential tracked drive and independent turret/elevation.','No firing, ballistics, damage, full suspension or interior walking. F transfers control at a safe boarding point.'],
  provenance:{source:'Local procedural geometry',generator:'scripts/three-creator/export-tank.ts'},resources:[],
  locomotionBindingIds:['vehicle.tank'],vehicle:{schemaVersion:1,spec:TANK_SPEC},
  sockets:Object.entries(TANK_SOCKETS).map(([node,positionMetersXYZ])=>({id:node,node,positionMetersXYZ})).concat([{id:'muzzle',node:'socket.muzzle',positionMetersXYZ:[0,0,5]}]),collision:TANK_SPEC.envelope};
const index=catalog.assets.findIndex((entry:{id:string})=>entry.id===asset.id);
if(index<0)catalog.assets.push(asset);else catalog.assets[index]=asset;
await writeFile(file,JSON.stringify(catalog,null,2)+'\n');
console.log(JSON.stringify({sourcePath,sha256,byteLength:bytes.length}));
