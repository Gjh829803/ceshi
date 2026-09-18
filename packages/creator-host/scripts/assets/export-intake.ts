/** Procedural exporters produce an intake candidate; canonical subjects are created by tools/ingest.mjs. */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
export function exportDestination(args=process.argv.slice(2)){
  const i=args.indexOf('--output'),value=i<0?undefined:args[i+1];
  if(!value||value.startsWith('--'))throw new Error('Required: --output <new-intake-file.glb>; then use asset-library/tools/ingest.mjs');
  const output=path.resolve(value),relative=path.relative(root,output).split(path.sep);
  if(path.extname(output).toLowerCase()!=='.glb')throw new Error('EXPORT_REQUIRES_GLB');
  if(relative[0]==='assets'||(relative[0]==='asset-library'&&relative[1]!=='intake'))throw new Error('EXPORT_REQUIRES_INTAKE_OUTPUT');
  if(existsSync(output)||existsSync(output+'.intake.json'))throw new Error('EXPORT_OUTPUT_EXISTS');
  return output;
}
export async function writeIntakeExport(output:string,bytes:Buffer,asset:Record<string,unknown>){
  await mkdir(path.dirname(output),{recursive:true});
  await writeFile(output,bytes,{flag:'wx'});
  const next_step='Review this candidate, then run asset-library/tools/ingest.mjs with --input, --id, --group, --name and a new --version; transfer reviewed bindings/profiles to that subject before publishing.';
  await writeFile(output+'.intake.json',JSON.stringify({schema_version:'1.0',status:'unregistered_candidate',asset,next_step},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({output,sha256:asset.sha256,byteLength:bytes.length,next_step}));
}
