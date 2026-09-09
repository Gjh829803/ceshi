import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { ThreeCompiler, isWithin } from './compiler.js';
const workspace=path.resolve(process.argv[2]??'examples/three-creator/training-independent');
const port=Number(process.argv[3]??5175);
const compiler=new ThreeCompiler(workspace,'three-sdk');
const candidate=await compiler.prepare();
const mime:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'};
const server=createServer(async(req,res)=>{try{
  const pathname=decodeURIComponent(new URL(req.url??'/',`http://127.0.0.1:${port}`).pathname);
  const file=path.resolve(candidate.playableRoot,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
  if(!isWithin(candidate.playableRoot,file)||(await stat(file)).isDirectory()){res.writeHead(404).end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(file)]??'application/octet-stream','cache-control':'no-store'});res.end(await readFile(file));
}catch{res.writeHead(404).end();}});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({url:`http://127.0.0.1:${port}/`,worldBuildHash:candidate.worldBuildHash,sourceHash:candidate.sourceHash})));
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>server.close(()=>process.exit()));
