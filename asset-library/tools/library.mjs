import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {ROOT,read,write,sha256,inside,walk,collect,summary,search,slash,latest} from './core.mjs';
import {syncWhiteboxCatalog} from './whitebox.mjs';
import {schemas} from '../client/contracts/index.mjs';
import {assertValidationEvidence} from '../client/contracts/validate.mjs';
import {readPhysicalFacts,readModelFacts,readSocketBindings,readCollisionFacts} from './content-facts.mjs';
const require=createRequire(import.meta.url);
const Ajv=require('./vendor/ajv.cjs');
const gltfValidator=require('./vendor/gltf-validator/index.js');
const schemaNames={asset:'subject',capabilities:'capabilities',resources:'resources',provenance:'provenance',assembly:'assembly',validation:'validation'};
export function validate(root=ROOT,{hashes=true}={}){
  const ajv=new Ajv({allErrors:true,strict:false});ajv.addSchema(schemas);const validators=Object.fromEntries(Object.entries(schemaNames).map(([k,v])=>[k,ajv.compile(read(path.join(root,'schemas/'+v+'.schema.json')))]));
  const subjects=collect(root),errors=[],ids=new Set(),checked=new Set();
  for(const s of subjects){
    const key=s.asset.asset_id+'@'+s.asset.asset_version;if(ids.has(key))errors.push('DUPLICATE_ID_VERSION '+key);ids.add(key);
    for(const [key,v]of Object.entries(validators))if(!v(s[key]))errors.push(s.asset.asset_id+' '+key+': '+ajv.errorsText(v.errors));
    try{readPhysicalFacts(root,s);readModelFacts(root,s);readSocketBindings(root,s);readCollisionFacts(root,s);assertValidationEvidence({asset_id:s.asset.asset_id,version:s.asset.asset_version},s.validation);}catch(e){errors.push(key+' '+e.message);}
    if(s.asset.placeholder&&s.asset.lifecycle!=='placeholder')errors.push('PLACEHOLDER_STATUS '+key);
    if(s.asset.placeholder&&(s.validation.runtime==='verified'||s.assembly.runtime_ready))errors.push('FALSE_PLACEHOLDER_RUNTIME '+key);
    if(s.assembly.subject.asset_id!==s.asset.asset_id||s.assembly.subject.version!==s.asset.asset_version)errors.push('ASSEMBLY_SUBJECT_MISMATCH '+key);
    const resourcePaths=new Set(s.resources.files.map(f=>f.path));
    for(const p of [s.resources.model,s.resources.preview,...s.resources.animations.map(a=>a.resource)].filter(Boolean))if(!resourcePaths.has(p))errors.push('UNREGISTERED_RESOURCE '+p);
    for(const p of [s.asset.default_assembly,...Object.values(s.assembly.bindings??{}),...Object.values(s.assembly.facts??{})].filter(Boolean))try{if(!fs.existsSync(inside(root,p)))errors.push('MISSING_REFERENCE '+p);}catch(e){errors.push(e.message);}
    for(const mod of s.assembly.modules??[]){const matches=walk(path.join(root,'shared/module_descriptors')).filter(p=>p.endsWith('.json')).map(read).filter(d=>d.asset_id===mod.asset_id&&d.version===mod.version);if(matches.length!==1)errors.push('MODULE_DESCRIPTOR_MISSING '+mod.asset_id);}
    for(const f of s.resources.files)try{const p=inside(root,f.path);if(!fs.existsSync(p))errors.push('FILE_MISSING '+f.path);else if(hashes&&!checked.has(f.path)){const b=fs.readFileSync(p);if(b.length!==f.byte_length||sha256(b)!==f.sha256)errors.push('HASH_MISMATCH '+f.path);checked.add(f.path);}}catch(e){errors.push(e.message);}
    if(s.resources.inspection?.external_uris.length)errors.push('EXTERNAL_GLB_DEPENDENCY '+s.asset.asset_id);
    if(s.validation.runtime==='verified'&&!s.validation.evidence.length)errors.push('RUNTIME_EVIDENCE_MISSING '+key);
    const promises=[...s.capabilities.movement_modes,...s.capabilities.movement_transitions,s.capabilities.control,...s.capabilities.interactions];
    if(promises.some(p=>p.stage==='verified')&&s.validation.runtime!=='verified')errors.push('CAPABILITY_EVIDENCE_MISSING '+key);
    if(s.asset.lifecycle==='assets_ready'&&s.validation.format==='failed')errors.push('INVALID_FORMAT_READY '+key);
  }
  for(const s of subjects)for(const d of s.asset.dependencies)if(!ids.has(d.asset_id+'@'+d.version))errors.push('DEPENDENCY_MISSING '+d.asset_id);
  return {passed:!errors.length,subjects:subjects.length,files_checked:checked.size,errors};
}
export async function validateFormats(root=ROOT){
  const files=new Map();for(const s of collect(root))for(const f of s.resources.files)if(f.format==='glb')files.set(f.path,f);
  const results=[];
  for(const f of files.values()){
    const result=await gltfValidator.validateBytes(new Uint8Array(fs.readFileSync(inside(root,f.path))),{uri:path.basename(f.path),maxIssues:100});
    results.push({path:f.path,sha256:f.sha256,errors:result.issues.numErrors,warnings:result.issues.numWarnings,infos:result.issues.numInfos,messages:result.issues.messages.slice(0,20)});
  }
  const report={tool:'Khronos glTF Validator',version:gltfValidator.version(),checked_at:new Date().toISOString(),passed:results.every(r=>!r.errors),files:results};write(path.join(root,'tests/evidence/gltf-validation.json'),report);
  for(const s of collect(root)){const r=results.filter(r=>s.resources.files.some(f=>f.path===r.path));s.validation.format=r.length?r.every(r=>!r.errors)?'passed':'failed':s.validation.format;s.validation.checked_at=report.checked_at;if(!s.validation.evidence.includes('tests/evidence/gltf-validation.json'))s.validation.evidence.push('tests/evidence/gltf-validation.json');write(path.join(s.base,'validation/latest.json'),s.validation);}
  return {passed:report.passed,files:results.length,errors:results.reduce((s,r)=>s+r.errors,0),warnings:results.reduce((s,r)=>s+r.warnings,0)};
}
export function build(root=ROOT){
  const result=validate(root);if(!result.passed)throw Error(result.errors.join('\n'));
  syncWhiteboxCatalog(root);
  for(const s of collect(root)){s.validation.structure='passed';s.validation.source_hashes='passed';write(path.join(s.base,'validation/latest.json'),s.validation);}
  const subjects=collect(root),versions=subjects.map(summary),rows=latest(versions);
  const stats={subjects:rows.length,models:rows.filter(s=>s.model).length,placeholders:rows.filter(s=>s.placeholder).length,bones:rows.reduce((n,s)=>n+s.bone_count,0),clips:rows.reduce((n,s)=>n+s.clip_count,0),groups:Object.fromEntries(['characters','animals','vehicles','robots','fantastical','objects'].map(g=>[g,rows.filter(s=>s.browse_group===g).length]))};
  write(path.join(root,'catalog/index.json'),{schema_version:'1.0',generated_at:new Date().toISOString(),stats,subjects:rows});
  write(path.join(root,'catalog/versions.json'),{schema_version:'1.0',subjects:versions});
  const files=new Map();for(const s of subjects){for(const f of s.resources.files)files.set(f.path,{path:f.path,sha256:f.sha256,byte_length:f.byte_length});for(const p of walk(s.base).filter(p=>p.endsWith('.json'))){const b=fs.readFileSync(p),rp=slash(path.relative(root,p));files.set(rp,{path:rp,sha256:sha256(b),byte_length:b.length});}}
  for(const p of walk(path.join(root,'shared')).filter(p=>p.endsWith('.json'))){const b=fs.readFileSync(p),rp=slash(path.relative(root,p));files.set(rp,{path:rp,sha256:sha256(b),byte_length:b.length});}
  const lock={schema_version:'1.0',subjects:versions.map(s=>({asset_id:s.asset_id,version:s.asset_version,path:s.path})),files:[...files.values()].sort((a,b)=>a.path.localeCompare(b.path))};
  write(path.join(root,'dist/assembly.lock.json'),lock);
  write(path.join(root,'dist/manifest.json'),{schema_version:'1.0',catalog:'catalog/index.json',lock:'dist/assembly.lock.json',base_url_policy:'All paths resolve relative to the deployed library root.',subjects:rows.map(s=>({asset_id:s.asset_id,version:s.asset_version,descriptor:s.path+'/asset.json',assembly:s.default_assembly,model:s.model,stage:s.lifecycle,runtime_ready:s.readiness.runtime==='verified'}))});
  write(path.join(root,'tests/evidence/integrity.json'),result);return stats;
}
export function materialize(root,ids,output){
  if(fs.existsSync(output))throw Error('OUTPUT_MUST_BE_NEW');
  const all=collect(root),selected=ids.length?all.filter(s=>ids.includes(s.asset.asset_id)):all;if(new Set(selected.map(s=>s.asset.asset_id)).size!==new Set(ids).size&&ids.length)throw Error('ASSET_NOT_FOUND');
  fs.mkdirSync(output,{recursive:true});
  for(const folder of ['schemas','taxonomy','client','viewer','tools','shared','docs','assemblies','migrations'])if(fs.existsSync(path.join(root,folder)))fs.cpSync(path.join(root,folder),path.join(output,folder),{recursive:true,dereference:true});
  for(const file of ['README.md','AGENTS.md','CONTRIBUTING.md','package.json','start-dashboard.cmd','index.html'])if(fs.existsSync(path.join(root,file)))fs.copyFileSync(path.join(root,file),path.join(output,file));
  for(const s of selected){fs.cpSync(s.base,path.join(output,s.path),{recursive:true});for(const f of s.resources.files){const to=inside(output,f.path);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(inside(root,f.path),to);}}
  if(fs.existsSync(path.join(root,'tests/evidence')))fs.cpSync(path.join(root,'tests/evidence'),path.join(output,'tests/evidence'),{recursive:true});
  const pkg=read(path.join(output,'package.json'));pkg.scripts.test='node tools/library.mjs validate';write(path.join(output,'package.json'),pkg);
  const readme=path.join(output,'README.md');write(readme,fs.readFileSync(readme,'utf8').replace('node --test tests/contracts.test.mjs','node tools/library.mjs validate'));
  return build(output);
}
async function main(){
  const [cmd='help',...args]=process.argv.slice(2);const opt=(key,def)=>args.includes(key)?args[args.indexOf(key)+1]:def;const root=path.resolve(opt('--root',ROOT));
  if(cmd==='build')return build(root);
  if(cmd==='validate'){const r=validate(root);if(!r.passed)process.exitCode=1;return r;}
  if(cmd==='validate-formats'){const r=await validateFormats(root);if(!r.passed)process.exitCode=1;return r;}
  if(cmd==='search')return search(latest(collect(root).map(summary)),args[0]?.startsWith('--')?'':args[0]||'',{group:opt('--group'),stage:opt('--stage'),previewable:args.includes('--previewable'),runtime_ready:args.includes('--runtime-ready')});
  if(cmd==='describe'||cmd==='resolve'){const all=collect(root),selectedVersion=opt('--version')||latest(all.map(summary)).find(s=>s.asset_id===args[0])?.asset_version;const s=all.find(s=>s.asset.asset_id===args[0]&&s.asset.asset_version===selectedVersion);if(!s)throw Error('ASSET_NOT_FOUND');if(cmd==='resolve'&&args.includes('--runtime-ready')&&s.validation.runtime!=='verified')throw Error('RUNTIME_NOT_VERIFIED');return s;}
  if(cmd==='materialize'){const output=opt('--output');if(!output)throw Error('--output required');const ids=args.filter((s,i)=>!s.startsWith('--')&&!(i&&args[i-1].startsWith('--')));return materialize(root,ids,path.resolve(output));}
  return {commands:['build','validate','validate-formats','search [query] [--group animals] [--previewable] [--runtime-ready]','describe <id> [--version 0.1.0]','resolve <id> [--runtime-ready]','materialize [id...] --output <new-directory>'],root};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
