import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const check=process.argv.includes('--check');
const files=['index.mjs','index.d.mts','validate.mjs','validate.d.mts','schemas/v1.schema.json'];
for(const relative of files){
 const source=path.join(root,'packages/asset-contracts',relative),target=path.join(root,'asset-library/client/contracts',relative);
 let content=fs.readFileSync(source,'utf8');
 if(relative==='validate.mjs')content=content.replace("from 'ajv'","from '../../tools/vendor/ajv.cjs'");
 if(check){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==content)throw Error('ASSET_CONTRACT_COPY_DRIFT: '+relative);}
 else{fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);}
}
console.log(JSON.stringify({contracts:check?'verified':'generated',version:'1.0.0',files:files.length}));
