import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,writeFile,readdir,lstat,mkdir,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import type {Plugin} from 'esbuild';

const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const within=(root:string,file:string)=>file.startsWith(root+path.sep);
const packages=['three-world','camera-collision'] as const;
export type WorkspaceRuntime={sourceHash:string;files:Map<string,Buffer>;entry:string;plugin:Plugin};
export function workspaceRuntimeSourceHash(files:Readonly<Record<string,Buffer>>):string { return hash(JSON.stringify(Object.keys(files).sort().map(name=>[name,hash(files[name]!)]))); }
export async function runtimeDependencyIdentity(repository:string){
 const inputs=await Promise.all(['pnpm-lock.yaml','package.json',...packages.map(name=>`packages/${name}/package.json`)].map(async name=>[name,hash(await readFile(path.join(repository,name)))]));
 return hash(JSON.stringify(inputs));
}
async function sourceTree(root:string):Promise<Map<string,Buffer>>{
 const files=new Map<string,Buffer>();let size=0;
 async function visit(dir:string){
  const stat=await lstat(dir);if(stat.isSymbolicLink())throw new Error('THREE_RUNTIME_SOURCE_SYMLINK');
  for(const name of (await readdir(dir)).sort()){
   const file=path.join(dir,name),entry=await lstat(file);
   if(entry.isSymbolicLink())throw new Error('THREE_RUNTIME_SOURCE_SYMLINK');
   if(entry.isDirectory())await visit(file);
   else if(entry.isFile()){
    if(!/\.(?:ts|tsx|js|mjs|json)$/.test(name))throw new Error(`THREE_RUNTIME_SOURCE_FILE_INVALID: ${name}`);
    const bytes=await readFile(file);size+=bytes.length;
    if(size>32*1024*1024||files.size>=1000)throw new Error('THREE_RUNTIME_SOURCE_BUDGET');
    files.set(path.relative(root,file).split(path.sep).join('/'),bytes);
   }else throw new Error('THREE_RUNTIME_SOURCE_FILE_INVALID');
  }
 }
 await visit(root);return files;
}
export async function materializeWorkspaceRuntime(repository:string,workspace:string){
 const destination=path.join(workspace,'sdk');
 try {await lstat(destination);const existing=await readWorkspaceRuntime(repository,workspace);return {directory:'sdk',runtimeSourceHash:existing!.sourceHash,created:false};}
 catch(error:any){if(error.code!=='ENOENT')throw error;}
 const temporary=path.join(workspace,`.three-sdk-${randomUUID()}`);
 await mkdir(temporary);
 try{
  for(const name of packages){
   const sourceRoot=path.join(repository,'packages',name,'src');
   async function copy(dir:string){for(const entry of await readdir(dir)){
    const file=path.join(dir,entry),stat=await lstat(file);
    if(stat.isSymbolicLink())throw new Error('THREE_RUNTIME_SOURCE_SYMLINK');
    if(stat.isDirectory())await copy(file);
    else if(stat.isFile()&&/\.(?:ts|json)$/.test(entry)&&!entry.endsWith('.test.ts')&&entry!=='testing.ts'){
     const target=path.join(temporary,name,'src',path.relative(sourceRoot,file));await mkdir(path.dirname(target),{recursive:true});await writeFile(target,await readFile(file));
    }
   }}await copy(sourceRoot);
  }
  await writeFile(path.join(temporary,'runtime.json'),JSON.stringify({schemaVersion:1,entry:'three-world/src/index.ts',dependencyIdentity:await runtimeDependencyIdentity(repository)},null,2));
  await rename(temporary,destination);
 }finally{await rm(temporary,{recursive:true,force:true});}
 const runtime=await readWorkspaceRuntime(repository,workspace);
 return {directory:'sdk',runtimeSourceHash:runtime!.sourceHash,created:true};
}
export async function readWorkspaceRuntime(repository:string,workspace:string):Promise<WorkspaceRuntime|undefined>{
 const root=path.join(workspace,'sdk');try{await lstat(root);}catch(error:any){if(error.code==='ENOENT')return;throw error;}
 const files=await sourceTree(root),manifest=files.get('runtime.json');
 if(!manifest)throw new Error('THREE_RUNTIME_SOURCE_MANIFEST_REQUIRED');
 const value=JSON.parse(manifest.toString());
 if(value.schemaVersion!==1||value.entry!=='three-world/src/index.ts'||value.dependencyIdentity!==await runtimeDependencyIdentity(repository))throw new Error('THREE_RUNTIME_DEPENDENCY_IDENTITY_MISMATCH');
 const sourceHash=workspaceRuntimeSourceHash(Object.fromEntries(files));
 const sdkRequire=createRequire(path.join(repository,'packages/three-world/package.json'));
 const locked=new Set(Object.keys(JSON.parse(await readFile(path.join(repository,'packages/three-world/package.json'),'utf8')).dependencies));
 const resolveLocal=(file:string)=>{
  if(!within(root,file))throw new Error('THREE_RUNTIME_IMPORT_PATH_ESCAPE');
  const relative=path.relative(root,file).split(path.sep).join('/');
  const candidates=[relative,relative.replace(/\.js$/,'.ts'),relative+'.ts',relative+'/index.ts'];
  const found=candidates.find(name=>files.has(name));if(!found)throw new Error(`THREE_RUNTIME_IMPORT_MISSING: ${relative}`);
  return {path:found,namespace:'workspace-sdk'};
 };
 const entry=path.join(root,value.entry);resolveLocal(entry);
 const plugin:Plugin={name:'workspace-runtime-browser-boundary',setup(build){
  build.onResolve({filter:/.*/},args=>{
   if(args.kind==='entry-point'&&path.resolve(args.path).startsWith(root+path.sep))return resolveLocal(args.path);
   if(args.namespace!=='workspace-sdk')return;
   if(args.path==='three'||args.path==='@worldkit/three')return {path:args.path,external:true};
   if(args.path==='@worldkit/camera-collision')return resolveLocal(path.join(root,'camera-collision/src/index.ts'));
   if(args.path.startsWith('.'))return resolveLocal(path.resolve(args.resolveDir,args.path));
   const packageId=args.path.startsWith('@')?args.path.split('/').slice(0,2).join('/'):args.path.split('/')[0]!;
   if(!locked.has(packageId)||args.path.includes('..')||args.path.includes('\\'))throw new Error(`THREE_RUNTIME_IMPORT_NOT_ALLOWED: ${args.path}`);
   return {path:sdkRequire.resolve(args.path)};
  });
  build.onLoad({filter:/.*/,namespace:'workspace-sdk'},args=>({contents:files.get(args.path)!,loader:args.path.endsWith('.json')?'json':args.path.endsWith('.tsx')?'tsx':'ts',resolveDir:path.join(root,path.dirname(args.path))}));
 }};
 return {sourceHash,files,entry,plugin};
}
