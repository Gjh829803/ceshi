import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
export const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export const slash = value => value.replaceAll('\\', '/');
export const write = (file, value) => {fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2)+'\n');};
export function inside(root, relative) {
  if (typeof relative !== 'string' || !relative || /[\\?#\0]/.test(relative) || /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(relative) || relative.startsWith('/')) throw Error('UNSAFE_RESOURCE_PATH: '+relative);
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(path.resolve(root)+path.sep)) throw Error('RESOURCE_OUTSIDE_LIBRARY: '+relative);
  if (fs.existsSync(absolute) && !fs.realpathSync(absolute).startsWith(fs.realpathSync(root)+path.sep)) throw Error('SYMLINK_OUTSIDE_LIBRARY: '+relative);
  return absolute;
}
export function walk(root) {
  if(!fs.existsSync(root)) return [];
  return fs.readdirSync(root,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(root,e.name)):e.isFile()?[path.join(root,e.name)]:[]);
}
export function glbInfo(file) {
  const b=fs.readFileSync(file);
  if(b.readUInt32LE(0)!==0x46546c67||b.readUInt32LE(4)!==2||b.readUInt32LE(8)!==b.length)throw Error('INVALID_GLB: '+file);
  const length=b.readUInt32LE(12); const g=JSON.parse(b.subarray(20,20+length).toString());
  const parents=new Map();(g.nodes||[]).forEach((n,i)=>(n.children||[]).forEach(c=>parents.set(c,i)));
  const joints=new Set((g.skins||[]).flatMap(s=>s.joints));
  const bones=[...joints].map(i=>({node_index:i,name:g.nodes[i].name||'node_'+i,parent_index:parents.get(i)??null,translation:g.nodes[i].translation||[0,0,0]}));
  const clips=(g.animations||[]).map((a,i)=>({index:i,name:a.name||'animation_'+i,duration_seconds:Math.max(0,...a.samplers.map(s=>g.accessors[s.input]?.max?.[0]||0)),channels:a.channels.length,loop:null,root_motion:'unknown'}));
  const triangles=(g.meshes||[]).reduce((s,m)=>s+m.primitives.reduce((v,p)=>v+((g.accessors[p.indices]?.count||g.accessors[p.attributes.POSITION]?.count||0)/3),0),0);
  return {format:'glb',gltf_version:g.asset.version,nodes:g.nodes?.length||0,meshes:g.meshes?.length||0,materials:g.materials?.length||0,skins:g.skins?.length||0,bones,clips,triangles:Math.round(triangles),extensions:g.extensionsUsed||[],external_uris:[...(g.buffers||[]),...(g.images||[])].map(x=>x.uri).filter(x=>x&&!x.startsWith('data:'))};
}
export function collect(root=ROOT) {
  return walk(path.join(root,'subjects')).filter(p=>path.basename(p)==='asset.json').map(p=>{
    const base=path.dirname(p),asset=read(p);
    return {asset,base,path:slash(path.relative(root,base)),capabilities:read(path.join(base,'capabilities.json')),resources:read(path.join(base,'resources.json')),provenance:read(path.join(base,'provenance.json')),validation:read(path.join(base,'validation/latest.json')),assembly:read(path.join(base,'assemblies/default.json'))};
  }).sort((a,b)=>a.asset.asset_id.localeCompare(b.asset.asset_id));
}
export function summary(s){return {...s.asset,path:s.path,model:s.resources.model,preview:s.resources.preview,resource_count:s.resources.files.length,bone_count:s.resources.inspection?.bones?.length||0,clip_count:s.resources.animations.length,movement_modes:s.capabilities.movement_modes,control:s.capabilities.control,interactions:s.capabilities.interactions,readiness:s.validation,license:s.provenance.license};}
export function latest(rows){const result=new Map();for(const row of rows){const previous=result.get(row.asset_id),a=row.asset_version.split('.').map(Number),b=previous?.asset_version.split('.').map(Number);if(!previous||a[0]>b[0]||a[0]===b[0]&&(a[1]>b[1]||a[1]===b[1]&&a[2]>b[2]))result.set(row.asset_id,row);}return [...result.values()];}
export function search(subjects,query='',filters={}){
  const tokens=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return subjects.filter(s=>tokens.every(q=>JSON.stringify([s.asset_id,s.display_name,s.aliases,s.semantic_type,s.morphology,s.movement_modes]).toLowerCase().includes(q))&&(!filters.group||s.browse_group===filters.group)&&(!filters.stage||s.lifecycle===filters.stage)&&(!filters.previewable||!!s.model)&&(!filters.runtime_ready||s.readiness.runtime==='verified'));
}
