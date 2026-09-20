// Tiny authoring fixture shared by focused publication/Registry tests.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {write,sha256,collect} from './core.mjs';
export function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'registry-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const shared=Buffer.from('tiny model bytes'), secret=Buffer.from('private author source');
 write(path.join(root,'shared/model.glb'),shared);write(path.join(root,'intake/private.fbx'),secret);
 const add=(id,version='1.0.0',dependencies=[])=>{
  const base=path.join(root,'subjects/objects',id,version);
  write(path.join(base,'asset.json'),{asset_id:id,asset_version:version,display_name:id,description:'fixture',browse_group:'objects',lifecycle:'assets_ready',placeholder:false,dependencies,morphology:{profiles:['rigid']},scale:{units:'meter'}});
  write(path.join(base,'capabilities.json'),{movement_modes:[],interactions:[],control:{},limitations:[]});
  write(path.join(base,'resources.json'),{model:'shared/model.glb',preview:null,files:[{path:'shared/model.glb',sha256:sha256(shared),byte_length:shared.length,format:'glb',role:'model',logical_paths:['models/shared.glb']},{path:'intake/private.fbx',sha256:sha256(secret),byte_length:secret.length,format:'fbx',role:'source_reference'}],animations:[],inspection:null});
  write(path.join(base,'provenance.json'),{license:{status:'unknown',redistribution:'unknown'}});
  write(path.join(base,'validation/latest.json'),{runtime:'not_run',evidence:[]});
  write(path.join(base,'assemblies/default.json'),{subject:{asset_id:id,version},bindings:{},facts:{},modules:[],stage:'assets_ready'});
  return base;
 };
 add('object.a');add('object.b','1.0.0',[{asset_id:'object.a',version:'1.0.0'}]);
 return {root,output:path.join(root,'published'),add};
}

/** An actual authored subject, including schemas and bytes, for cross-stage contract tests. */
export function subjectFixture(t,sourceRoot,id='vehicle.helicopter'){
 const all=collect(sourceRoot).filter(s=>s.asset.asset_id===id);
 const source=all.sort((a,b)=>b.asset.asset_version.localeCompare(a.asset.asset_version,undefined,{numeric:true}))[0];
 if(!source)throw Error('FIXTURE_SUBJECT_MISSING: '+id);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'asset-subject-test-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const folder of ['schemas','shared/module_descriptors',source.path])fs.cpSync(path.join(sourceRoot,folder),path.join(root,folder),{recursive:true});
 for(const file of source.resources.files){const target=path.join(root,file.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(sourceRoot,file.path),target);}
 return {root,base:path.join(root,source.path),output:path.join(root,'published'),asset:source.asset};
}
