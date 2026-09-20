import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const appRoot=fileURLToPath(new URL('../',import.meta.url));
const source=path.join(appRoot,'.next/standalone'), output=path.join(appRoot,'dist/standalone');
await fs.access(path.join(source,'apps/asset-platform/server.js'));
await fs.rm(output,{recursive:true,force:true});
await fs.cp(source,output,{recursive:true,verbatimSymlinks:true});
await fs.cp(path.join(appRoot,'.next/static'),path.join(output,'apps/asset-platform/.next/static'),{recursive:true});
await fs.writeFile(path.join(output,'start.mjs'),`process.env.HOSTNAME ||= '0.0.0.0';\nprocess.env.PORT ||= '3188';\nawait import('./apps/asset-platform/server.js');\n`);
console.log(output);
