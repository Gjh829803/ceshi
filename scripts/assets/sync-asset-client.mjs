import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root=fileURLToPath(new URL('../../',import.meta.url)),check=process.argv.includes('--check');
const entries=[['registry-client.mjs','browser'],['materialize.mjs','node'],['cli.mjs','node']];

function portableModuleLabels(result) {
  let content=result.outputFiles[0].text;
  // esbuild labels CommonJS wrappers with real paths, including a worktree's
  // shared pnpm store. Normalize only generated labels, never source literals.
  for(const input of Object.keys(result.metafile.inputs)) {
    const start=input.lastIndexOf('node_modules/');
    if(start<0)continue;
    const label=input.slice(start);
    content=content.replaceAll(`\n// ${input}\n`,`\n// ${label}\n`)
      .replaceAll(`\n  ${JSON.stringify(input)}(`,`\n  ${JSON.stringify(label)}(`);
  }
  return content;
}

for(const [entry,platform] of entries){
  const result=await build({absWorkingDir:root,entryPoints:[`packages/asset-client/src/${entry}`],bundle:true,platform,format:'esm',target:'es2022',write:false,metafile:true,legalComments:'inline',banner:{js:'// Generated from packages/asset-client. Run node scripts/assets/sync-asset-client.mjs.'}});
  const target=path.join(root,'asset-library/client',entry),content=portableModuleLabels(result);
  if(check){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==content)throw Error('ASSET_CLIENT_COPY_DRIFT: '+entry);}
  else{fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);}
}
console.log(JSON.stringify({client:check?'verified':'generated',files:entries.length}));
