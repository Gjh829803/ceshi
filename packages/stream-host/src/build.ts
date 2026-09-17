import {build} from 'esbuild';
import {ThreeCompiler,verifyFiles,type Candidate} from '@worldkit/creator-host/compiler';
import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {UiBundleManifest,UiCatalog,UiDocument,JsonSchema} from '@worldkit/world-ui/schema';

export interface StreamWorld {
  id:string;name:string;candidate:Candidate;uiBundleHash:string;manifest:UiBundleManifest;
  catalog:UiCatalog;document:UiDocument;stateSchema:JsonSchema;
}
export async function loadWorlds(directory:string):Promise<StreamWorld[]> {
  const direct=await stat(path.join(directory,'project.json')).then(()=>true,()=>false);
  const roots=direct?[directory]:(await readdir(directory,{withFileTypes:true})).filter(e=>e.isDirectory()&&!e.name.startsWith('.')).sort((a,b)=>a.name.localeCompare(b.name)).map(e=>path.join(directory,e.name));
  const worlds:StreamWorld[]=[];
  for(const root of roots){
    if(!await stat(path.join(root,'project.json')).then(()=>true,()=>false))continue;
    const compiler=new ThreeCompiler(root,'three-sdk');
    const candidate=await compiler.prepare();if(!candidate.project.ui)throw new Error(`STREAM_WORLD_UI_REQUIRED: ${root}`);
    await verifyFiles(candidate.root,candidate.files);
    const uiRoot=path.join(candidate.playableRoot,'world-ui');
    const bytes=await readFile(path.join(uiRoot,'manifest.json'));
    const manifest=JSON.parse(bytes.toString()) as UiBundleManifest;
    const uiBundleHash=createHash('sha256').update(bytes).digest('hex');
    const id=path.basename(root);if(worlds.some(w=>w.id===id))throw new Error('STREAM_WORLD_ID_DUPLICATE');
    let name=id;
    const metadataPath=path.join(root,'case.json');
    if(await stat(metadataPath).then(()=>true,()=>false)){
      const metadata=JSON.parse(await readFile(metadataPath,'utf8')) as {schemaVersion?:number;title?:unknown;uiProtocolVersion?:number};
      if(metadata.schemaVersion!==1||typeof metadata.title!=='string'||!metadata.title.trim()||metadata.title.length>80||metadata.uiProtocolVersion!==1)throw new Error(`STREAM_WORLD_METADATA_INVALID: ${metadataPath}`);
      name=metadata.title.trim();
    }
    worlds.push({id,name,candidate,uiBundleHash,manifest,catalog:JSON.parse(await readFile(path.join(uiRoot,manifest.catalog.path),'utf8')),document:JSON.parse(await readFile(path.join(uiRoot,manifest.definition.path),'utf8')),stateSchema:JSON.parse(await readFile(path.join(uiRoot,manifest.stateSchema.path),'utf8'))});
  }
  if(!worlds.length)throw new Error('STREAM_NO_WORLDS');return worlds;
}

export async function buildProducerScript(entry:string):Promise<string>{
 const result=await build({entryPoints:[entry],bundle:true,write:false,format:'iife',globalName:'WorldkitStreamProducer',platform:'browser',target:'es2022',logLevel:'silent'});
 return result.outputFiles[0]!.text;
}
