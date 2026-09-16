import {createHash,randomUUID} from 'node:crypto';
import {mkdir,lstat,realpath,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import type {Plugin} from 'vite';
import {cameraRouteSourceIdentity} from '../scripts/camera-quality/identity';

const prefix='/__playground-diagnostics/';
const loopback=(address:string|undefined)=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address??'');
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
export async function saveDebugBundle(root:string,input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('DEBUG_BUNDLE_INVALID');
 const bundle=input as {metadata?:unknown;screenshotDataUrl?:unknown;recording?:unknown};
 if(Object.keys(bundle).some(key=>!['metadata','screenshotDataUrl','recording'].includes(key))||!bundle.metadata||typeof bundle.metadata!=='object'||Array.isArray(bundle.metadata))throw Error('DEBUG_BUNDLE_INVALID');
 let png:Buffer|undefined;
 if(bundle.screenshotDataUrl!==undefined){
  if(typeof bundle.screenshotDataUrl!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(bundle.screenshotDataUrl))throw Error('DEBUG_SCREENSHOT_INVALID');
  png=Buffer.from(bundle.screenshotDataUrl.slice('data:image/png;base64,'.length),'base64');
  if(png.length<24||png.length>16*1024*1024||png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||png.readUInt32BE(16)>4096||png.readUInt32BE(20)>4096)throw Error('DEBUG_SCREENSHOT_INVALID');
 }
 const contents:Record<string,Buffer>={'incident.json':Buffer.from(JSON.stringify(bundle.metadata,null,2)+'\n')};
 if(png)contents['frame.png']=png;
 if(bundle.recording!==undefined)contents['recording.json']=Buffer.from(JSON.stringify(bundle.recording,null,2)+'\n');
 if(Object.values(contents).reduce((sum,data)=>sum+data.length,0)>24*1024*1024)throw Error('DEBUG_BUNDLE_TOO_LARGE');
 let directory=path.resolve(root);
 if(await realpath(directory)!==directory)throw Error('DEBUG_OUTPUT_SYMLINK');
 for(const component of ['.codex-tmp','playground-incidents']){
  directory=path.join(directory,component);await mkdir(directory,{recursive:true});
  const stat=await lstat(directory);if(stat.isSymbolicLink()||!stat.isDirectory()||await realpath(directory)!==directory)throw Error('DEBUG_OUTPUT_SYMLINK');
 }
 const id=randomUUID();directory=path.join(directory,id);await mkdir(directory);
 const files:Record<string,{path:string;sha256:string;bytes:number}>={};
 for(const [name,bytes] of Object.entries(contents)){
  const file=path.join(directory,name);await writeFile(file,bytes,{flag:'wx',mode:0o600});files[name]={path:file,sha256:sha(bytes),bytes:bytes.length};
 }
 return {id,directory,files};
}

export async function readDebugRecording(root:string,id:unknown){
 if(typeof id!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))throw Error('DEBUG_BUNDLE_ID_INVALID');
 let file=path.resolve(root);
 if(await realpath(file)!==file)throw Error('DEBUG_OUTPUT_SYMLINK');
 for(const part of ['.codex-tmp','playground-incidents',id,'recording.json']){
  file=path.join(file,part);const info=await lstat(file);
  if(info.isSymbolicLink()||await realpath(file)!==file)throw Error('DEBUG_OUTPUT_SYMLINK');
  if(part==='recording.json'&&(!info.isFile()||info.size>24*1024*1024))throw Error('DEBUG_RECORDING_FILE_INVALID');
 }
 return JSON.parse(await readFile(file,'utf8'));
}

/** Local maintainer artifacts only. No endpoint or filesystem writes in preview/build. */
export function playgroundDiagnosticsPlugin(repository:string):Plugin {
 const session=randomUUID(),serverId=randomUUID();let revision=0;
 let cached:Promise<{head:string;sourceHash:string}>|undefined;
 return {name:'playground-diagnostics',apply:'serve',configureServer(server){
  if(!['127.0.0.1','::1'].includes(String(server.config.server.host)))return;
  const changed=(_event:string,file:string)=>{
   const relative=path.relative(repository,file);
   if(relative.startsWith('..')||relative.split(path.sep).some(part=>['node_modules','.git','.codex-tmp'].includes(part)))return;
   revision++;cached=undefined;
  };
  server.watcher.on('all',changed);server.httpServer?.once('close',()=>server.watcher.off('all',changed));
  server.middlewares.use(async(req,res,next)=>{
   if(!req.url?.startsWith(prefix))return next();
   res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
   const reply=(status:number,value:unknown)=>{res.statusCode=status;res.end(JSON.stringify(value));};
   try{
    const address=server.httpServer?.address();
    if(!address||typeof address==='string'||!loopback(address.address)||!loopback(req.socket.remoteAddress))return reply(403,{error:'DEBUG_LOCAL_ONLY'});
    const origin=`${server.config.server.https?'https':'http'}://${address.family==='IPv6'?'[::1]':'127.0.0.1'}:${address.port}`;
    if(req.method!=='POST'||req.headers.origin!==origin||req.headers.host!==new URL(origin).host)return reply(403,{error:'DEBUG_ORIGIN'});
    const route=req.url.slice(prefix.length);
    if(!['session','identity','save','load'].includes(route))return reply(404,{error:'DEBUG_ROUTE'});
    if(route!=='session'&&req.headers['x-debug-session']!==session)return reply(403,{error:'DEBUG_SESSION'});
    if(!req.headers['content-type']?.startsWith('application/json'))return reply(400,{error:'DEBUG_CONTENT_TYPE'});
    const chunks:Buffer[]=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>32*1024*1024)throw Error('DEBUG_BUNDLE_TOO_LARGE');chunks.push(Buffer.from(chunk));}
    const input=JSON.parse(Buffer.concat(chunks).toString());
    if(route==='session')return reply(200,{session});
    if(route==='identity'){
     const sampledRevision=revision;const identity=await(cached??=cameraRouteSourceIdentity(repository));
     if(sampledRevision!==revision)return reply(409,{error:'DEBUG_SOURCE_CHANGED_DURING_READ'});
     return reply(200,{...identity,serverId,revision});
    }
    if(route==='load')return reply(200,await readDebugRecording(repository,input?.id));
    return reply(200,await saveDebugBundle(repository,input));
   }catch(error){reply(400,{error:error instanceof Error?error.message:String(error)});}
  });
 }};
}
