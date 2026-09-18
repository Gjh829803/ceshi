import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {ROOT,walk,slash,read} from './core.mjs';
import {createRegistryHandler} from './registry-server.mjs';
import {publicationPath} from './publication-path.mjs';
import {publishLibrary} from './publish.mjs';

const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml','.md':'text/plain; charset=utf-8'};

/** Copy only explicit viewer delivery assets. No editable subject/tool/catalog exposure. */
export function copyViewer(libraryRoot,publishedRoot){
  const files=[...walk(path.join(libraryRoot,'viewer')).filter(file=>!file.endsWith('.md')),path.join(libraryRoot,'client/asset-library.mjs'),path.join(libraryRoot,'client/registry-client.mjs')];
  const staticFiles=[];
  for(const source of files){
    if(fs.lstatSync(source).isSymbolicLink())throw Error('ASSET_STATIC_SYMLINK');
    const relative=slash(path.relative(libraryRoot,source));
    const target=publicationPath(publishedRoot,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);
    staticFiles.push({path:relative,mime_type:mime[path.extname(relative)]||'application/octet-stream'});
  }
  const manifest=publicationPath(publishedRoot,'client/viewer-files.json');
  fs.writeFileSync(manifest,JSON.stringify(staticFiles,null,2)+'\n');
  return staticFiles;
}

/** Serves published bytes only. Passing an editable library root is an error. */
export function createServer(publishedRoot=path.join(ROOT,'dist/published'),options={}){
  if(!fs.existsSync(path.join(publishedRoot,'registry.json')))throw Error('ASSET_PUBLICATION_REQUIRED: run serve.mjs --publish or pass --root PUBLISHED_ROOT');
  const staticFiles=options.staticFiles??read(publicationPath(publishedRoot,'client/viewer-files.json'));
  const handler=createRegistryHandler(publishedRoot,{artifactBaseUrl:options.artifactBaseUrl,staticFiles});
  return http.createServer((req,res)=>{
    const url=new URL(req.url,'http://viewer.invalid');
    if(url.pathname==='/'||url.pathname==='/viewer/'||url.pathname==='/viewer'){res.writeHead(302,{Location:'/viewer/index.html'+url.search});res.end();return;}
    return handler(req,res);
  });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
  const source=path.resolve(option('--source',ROOT)),publishedRoot=path.resolve(option('--root',path.join(ROOT,'dist/published')));
  if(args.includes('--prepare-only')&&!args.includes('--publish'))throw Error('--prepare-only requires --publish');
  if(args.includes('--publish')){const descriptor=await publishLibrary(source,{output:publishedRoot});const files=copyViewer(source,publishedRoot);if(args.includes('--prepare-only'))console.log(JSON.stringify({published_root:publishedRoot,snapshot_id:descriptor.snapshot_id,static_files:files.length}));}
  if(!args.includes('--prepare-only'))createServer(publishedRoot,{artifactBaseUrl:option('--artifact-base-url')}).listen(Number(option('--port',process.env.PORT||3188)),'127.0.0.1',()=>console.log(`Asset Registry viewer: http://127.0.0.1:${option('--port',process.env.PORT||3188)}/viewer/index.html`));
}
