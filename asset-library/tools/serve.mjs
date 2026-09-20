import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ROOT} from './core.mjs';
import {createRegistryServer} from './registry-server.mjs';
import {publishLibrary} from './publish.mjs';

/** Published-data API for CLI consumers. The Atlas application owns the Web UI. */
export function createServer(publishedRoot=path.join(ROOT,'dist/published'),options={}) {
  if(!fs.existsSync(path.join(publishedRoot,'registry.json')))throw Error('ASSET_PUBLICATION_REQUIRED: publish the library or pass --root PUBLISHED_ROOT');
  return createRegistryServer(publishedRoot,options);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
  const source=path.resolve(option('--source',ROOT)),publishedRoot=path.resolve(option('--root',path.join(ROOT,'dist/published')));
  if(args.includes('--prepare-only')&&!args.includes('--publish'))throw Error('--prepare-only requires --publish');
  if(args.includes('--publish')){const descriptor=await publishLibrary(source,{output:publishedRoot});if(args.includes('--prepare-only'))console.log(JSON.stringify({published_root:publishedRoot,snapshot_id:descriptor.snapshot_id}));}
  if(!args.includes('--prepare-only'))createServer(publishedRoot,{artifactBaseUrl:option('--artifact-base-url')}).listen(Number(option('--port',process.env.PORT||8787)),'127.0.0.1',()=>console.log('Asset Registry API listening on port '+option('--port',process.env.PORT||8787)));
}
