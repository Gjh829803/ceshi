import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {ROOT,write,sha256,glbInfo} from './core.mjs';
import {build,validateFormats} from './library.mjs';
const require=createRequire(import.meta.url),validator=require('./vendor/gltf-validator/index.js');

/** Register observed content only; runtime bindings are added by an explicit integration. */
export async function ingestAsset({root=ROOT,input,id,group,name,version='0.1.0',sourceUrl=null}){
 if(!input||!id||!group||!name)throw Error('Required: --input model.glb --id stable.id --group animals --name Name [--version 0.1.0]');
 if(!/^[a-z][a-z0-9._-]*$/.test(id)||!/^\d+\.\d+\.\d+$/.test(version)||!['characters','animals','vehicles','robots','fantastical','objects'].includes(group))throw Error('INVALID_ID_VERSION_OR_GROUP');
 const base=`subjects/${group}/${id}/${version}`,dir=path.join(root,base);if(fs.existsSync(dir))throw Error('IMMUTABLE_VERSION_EXISTS: choose a new version');
 const bytes=fs.readFileSync(input),info=glbInfo(input);if(info.external_uris.length)throw Error('GLB_MUST_BE_SELF_CONTAINED');
 const format=await validator.validateBytes(new Uint8Array(bytes),{uri:path.basename(input),maxIssues:100});if(format.issues.numErrors)throw Error('GLTF_VALIDATION_FAILED: '+format.issues.numErrors+' errors. Source was not registered.');
 const model=`${base}/model/model.glb`,file={path:model,sha256:sha256(bytes),byte_length:bytes.length,format:'glb',role:'model',source_path:path.basename(input),reused_by:[id]};
 const bindings={};
 const values={
  'asset.json':{schema_version:'1.0',asset_id:id,asset_version:version,display_name:name,aliases:[name],browse_group:group,semantic_type:group+'.unclassified',semantic_subtypes:[],morphology:{architecture:info.skins?'skinned_articulated':'rigid_single',profiles:[],appendages:[],stance:'unknown'},scale:{units:'meter',up_axis:'Y',forward_axis:'unknown',dimensions_m:null,source_transform:null},lifecycle:'assets_ready',placeholder:false,description:'新入库资源；分类、骨骼语义与运行能力待标定。',default_assembly:`${base}/assemblies/default.json`,dependencies:[]},
  'capabilities.json':{schema_version:'1.0',movement_modes:[],movement_transitions:[],control:{archetype:'unknown',stage:'planned'},interactions:[],limitations:['尚未接入宿主控制器。']},
  'resources.json':{schema_version:'1.0',model,preview:null,files:[file],inspection:info,animations:info.clips.map(c=>({...c,resource:model,format:'glb',binding_status:'embedded'}))},
  'provenance.json':{schema_version:'1.0',source_type:'provided_export',source_url:sourceUrl,license:{status:'unknown',commercial_use:'unknown',redistribution:'unknown',editable_distribution:'unknown',user_export:'unknown'},license_files:[],source_hash:file.sha256,conversion_pipeline:null},
  'assemblies/default.json':{schema_version:'1.0',assembly_id:'assembly.'+id,subject:{asset_id:id,version},model,stage:'assets_ready',runtime_ready:false},
  'validation/latest.json':{schema_version:'1.0',structure:'pending',format:'passed',visual:'not_run',runtime:'not_run',checked_at:null,evidence:[]},
 };
 if(info.bones.length){bindings.rig=`${base}/bindings/rig.json`;values['bindings/rig.json']={schema_version:'1.0',bones:info.bones,semantic_bones:{},mapping_status:'unmapped'};}
 if(info.clips.length){bindings.animations=`${base}/bindings/animation_map.json`;values['bindings/animation_map.json']={schema_version:'1.0',slots:{}};}
 if(Object.keys(bindings).length)values['assemblies/default.json'].bindings=bindings;
 write(path.join(root,model),bytes);for(const [p,v]of Object.entries(values))write(path.join(dir,p),v);
 write(path.join(dir,'README.md'),`# ${name}\n\n稳定 ID: ${id} @ ${version}\n\n查看 asset.json、capabilities.json、resources.json 和 validation/latest.json。按实际需要增加 bindings、facts 和 collision；资源预览不声明宿主运行能力。\n`);
 return {id,version,path:base,format:{passed:true},search_command:'node tools/library.mjs search '+id};
}
async function main(){
 const args=process.argv.slice(2),opt=k=>args.includes(k)?args[args.indexOf(k)+1]:null;
 const result=await ingestAsset({input:opt('--input'),id:opt('--id'),group:opt('--group'),name:opt('--name'),version:opt('--version')||'0.1.0',sourceUrl:opt('--source-url')});
 const formats=args.includes('--defer-validation')?{passed:null,status:'pending'}:await validateFormats(ROOT);build(ROOT);console.log(JSON.stringify({...result,format:formats}));if(formats.passed===false)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
