import fs from 'node:fs';
import {publicationPath} from './publication-path.mjs';
import path from 'node:path';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {ROOT,inside,sha256} from './core.mjs';
import {RegistryStore} from './registry.mjs';
import {canonicalJson,protocolError,assertSafePath} from '../client/contracts/index.mjs';

const fail=(code,status=400)=>{throw protocolError(code,code,status);};
const json=(res,value,status=200)=>{const bytes=Buffer.from(canonicalJson(value)+'\n');res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':bytes.length,'Cache-Control':'no-store'});res.end(bytes);};
async function body(req){let length=0,parts=[];for await(const part of req){length+=part.length;if(length>1024*1024)fail('ASSET_REQUEST_TOO_LARGE',413);parts.push(part);}try{return JSON.parse(Buffer.concat(parts).toString());}catch{fail('ASSET_JSON_INVALID');}}
function searchRequest(params){const request={};const arrays=new Set(['asset_ids','morphology','movement','capabilities']);for(const [key,value]of params){if(Object.hasOwn(request,key))fail('ASSET_QUERY_INVALID');if(arrays.has(key))request[key]=value.split(',');else if(key==='limit'){if(!/^\d+$/.test(value))fail('ASSET_QUERY_INVALID');request[key]=Number(value);}else if(['previewable','runtime_ready'].includes(key)){if(!['true','false'].includes(value))fail('ASSET_QUERY_INVALID');request[key]=value==='true';}else if(key==='runtime'){try{request.runtime=JSON.parse(value);}catch{fail('ASSET_QUERY_INVALID');}}else request[key]=value;}return request;}
function sendBytes(req,res,bytes,{mime_type='application/json',sha256:digest,mutable=false}={}){
 const etag='"'+(digest||sha256(bytes))+'"';const headers={'Content-Type':mime_type,'ETag':etag,'Cache-Control':mutable?'no-cache':'public, max-age=31536000, immutable','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff'};
 if(req.headers['if-none-match']?.split(',').map(s=>s.trim()).includes(etag)){res.writeHead(304,headers);return res.end();}
 let start=0,end=bytes.length-1,status=200;
 if(req.headers.range&&(!req.headers['if-range']||req.headers['if-range']===etag)){
  const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  if(!match||!match[1]&&!match[2]||!bytes.length){res.writeHead(416,{...headers,'Content-Range':`bytes */${bytes.length}`});return res.end();}
  if(!match[1])start=Math.max(0,bytes.length-Number(match[2]));else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=bytes.length){res.writeHead(416,{...headers,'Content-Range':`bytes */${bytes.length}`});return res.end();}
  status=206;headers['Content-Range']=`bytes ${start}-${end}/${bytes.length}`;
 }
 headers['Content-Length']=Math.max(0,end-start+1);res.writeHead(status,headers);res.end(req.method==='HEAD'?undefined:bytes.subarray(start,end+1));
}
/** Explicit publication allowlist only. Extra UI files require an explicit sealed path list. */
export function createRegistryHandler(publishedRoot,{artifactBaseUrl,staticFiles=[]}={}){
 const store=new RegistryStore(publishedRoot,{artifactBaseUrl});const extras=new Map();
 for(const entry of staticFiles){const relative=typeof entry==='string'?entry:entry.path;assertSafePath(relative);if(!/^(viewer|client)\//.test(relative))fail('ASSET_STATIC_PREFIX_INVALID');const file=publicationPath(publishedRoot,relative),bytes=fs.readFileSync(file);extras.set(relative,{sha256:sha256(bytes),mime_type:typeof entry==='string'?(relative.endsWith('.html')?'text/html':relative.endsWith('.css')?'text/css':relative.endsWith('.json')?'application/json':'text/javascript'):entry.mime_type,mutable:false});}
 return async(req,res)=>{
  try{
   res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Expose-Headers','ETag, Content-Length, Content-Range');
   if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'GET, HEAD, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Range, If-None-Match, If-Range'});return res.end();}
   const raw=req.url||'/';if(raw.split('?')[0].includes('%')||raw.split('?')[0].includes('\\')||raw.split('?')[0].split('/').some(p=>p==='.'||p==='..'))fail('ASSET_PATH_INVALID');
   const url=new URL(raw,'http://registry.invalid'),pathname=url.pathname;
   if(req.method==='POST'&&pathname==='/v1/compatibility/check')return json(res,store.checkCompatibility(await body(req)));
   if(req.method==='POST'&&pathname==='/v1/assemblies/resolve')return json(res,store.resolveAssembly(await body(req)));
   if(req.method==='POST'&&pathname==='/v1/policies/resource-scope')return json(res,store.resourceScope(await body(req)));
   if(!['GET','HEAD'].includes(req.method))fail('ASSET_ROUTE_NOT_FOUND',404);
   if(pathname==='/v1/assets'){const result=store.searchAssets(searchRequest(url.searchParams));return req.method==='HEAD'?sendBytes(req,res,Buffer.from(canonicalJson(result)+'\n'),{mutable:true}):json(res,result);}
   const describe=/^\/v1\/assets\/([a-z][a-z0-9._-]{0,127})(?:\/versions\/(\d+\.\d+\.\d+))?$/.exec(pathname);
   if(describe){if([...url.searchParams.keys()].some(k=>k!=='snapshot_id'))fail('ASSET_QUERY_INVALID');const {index}=store.index(url.searchParams.get('snapshot_id')||undefined),summary=store.select(index,describe[1],describe[2]||'latest');store.manifest(summary);return sendBytes(req,res,fs.readFileSync(publicationPath(publishedRoot,summary.manifest_path)),{sha256:summary.manifest_digest,mutable:!describe[2]&&!url.searchParams.has('snapshot_id')});}
   const artifact=/^\/v1\/artifacts\/(?:sha256:)?([a-f0-9]{64})$/.exec(pathname);
   if(artifact){const address=req.headers.host;if(!address||!/^[-a-zA-Z0-9.:[\]]+(?::\d+)?$/.test(address))fail('ASSET_HOST_INVALID');return json(res,store.locateArtifact(artifact[1],{baseUrl:`http://${address}/`}));}
   const relative=pathname.slice(1);if(!relative)fail('ASSET_ROUTE_NOT_FOUND',404);assertSafePath(relative);const metadata=extras.get(relative)||store.publishedFiles().get(relative);if(!metadata)fail('ASSET_ROUTE_NOT_FOUND',404);
   const bytes=fs.readFileSync(publicationPath(publishedRoot,relative));if(metadata.sha256&&sha256(bytes)!==metadata.sha256)fail('ASSET_ARTIFACT_CORRUPT',500);if(metadata.byte_length!==undefined&&bytes.length!==metadata.byte_length)fail('ASSET_ARTIFACT_CORRUPT',500);return sendBytes(req,res,bytes,metadata);
  }catch(error){if(res.headersSent){res.destroy();return;}const status=error.status||500;json(res,{error:{code:error.code||'ASSET_INTERNAL_ERROR',message:status>=500?'Registry data could not be served':error.message,retryable:status>=500||status===429,details:error.details||{}}},status);}
 };
}
export function createRegistryServer(root,options={}){return http.createServer(createRegistryHandler(root,options));}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const args=process.argv.slice(2),opt=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;const server=createRegistryServer(path.resolve(opt('--root',path.join(ROOT,'dist/published'))),{artifactBaseUrl:opt('--artifact-base-url')});server.listen(Number(opt('--port','8787')),'127.0.0.1',()=>console.log('Registry listening on http://127.0.0.1:'+server.address().port));}
