import { readFile, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import registry from './example-registry.json';
export const EXAMPLE_REGISTRY = registry;
export type ExampleTopic = keyof typeof registry;
export const EXAMPLE_TOPICS = Object.keys(registry) as ExampleTopic[];
export async function readExampleFiles(root:string, topic:ExampleTopic, selected?:readonly string[]) {
  const entries:{path:string;byteLength:number;sha256:string;readable:boolean}[]=[];
  async function walk(dir:string){for(const name of (await readdir(dir)).sort()){
    if(name.startsWith('.')||['node_modules','outputs','dist'].includes(name))continue;
    const file=path.join(dir,name),stat=await lstat(file);
    if(stat.isSymbolicLink())throw new Error('THREE_EXAMPLE_SYMLINK');
    if(stat.isDirectory())await walk(file);else if(stat.isFile()){
      const bytes=await readFile(file);entries.push({path:path.relative(root,file).split(path.sep).join('/'),byteLength:bytes.length,
        sha256:createHash('sha256').update(bytes).digest('hex'),readable:/\.(?:ts|json|html|css|md|txt)$/.test(name)});
    }
  }}
  await walk(root);
  const defaults=registry[topic].files;
  const files:Record<string,string>={};
  for(const name of selected??defaults){const entry=entries.find(e=>e.path===name);if(!entry?.readable){if(selected)throw new Error(`THREE_EXAMPLE_FILE_UNKNOWN: ${name}`);continue;}
    files[name]=await readFile(path.join(root,name),'utf8');}
  return {files,fileManifest:entries,readHint:'Use files:[relative paths] to read any text module listed in fileManifest. Copy the complete source graph and binary UI dependencies when using the full workspace. Choose the example matching the controlled subject; read its required modules from this manifest.'};
}
