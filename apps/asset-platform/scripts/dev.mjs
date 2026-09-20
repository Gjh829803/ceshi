import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const appRoot=fileURLToPath(new URL('../',import.meta.url));
const child=spawn(process.execPath,[fileURLToPath(import.meta.resolve('next/dist/bin/next')),'dev','--hostname','127.0.0.1','--port',process.env.PORT||'3188'],{cwd:appRoot,stdio:'inherit',env:{...process.env,ASSET_PUBLICATION_ROOT:process.env.ASSET_PUBLICATION_ROOT||path.resolve(appRoot,'../../asset-library/dist/published')}});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
child.on('exit',(code)=>{process.exitCode=code??1;});
