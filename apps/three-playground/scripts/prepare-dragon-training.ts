import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const directory=path.resolve(import.meta.dirname,'../../../assets/dragon-training');
const files:Record<string,{bytes:number;sha256:string}>={};
for(const name of ['FireGenLoop01_8x8.png','dragon.glb','manifest.json','rider.glb']){
  const relative='__creature-assets/'+name,bytes=await readFile(path.join(directory,relative));
  files[relative]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
await writeFile(path.join(directory,'bundle.json'),JSON.stringify({kind:'native-flying-creature-assets',schemaVersion:2,files},null,2)+'\n');
console.log('Updated native dragon asset identities; no external source workspace required.');
