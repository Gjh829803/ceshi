import {parseArgs} from 'node:util';
import path from 'node:path';
import {startStreamHost} from './server.js';

const {values}=parseArgs({options:{worlds:{type:'string'},port:{type:'string'},'web-root':{type:'string'},headed:{type:'boolean'},fps:{type:'string'},bitrate:{type:'string'},width:{type:'string'},height:{type:'string'},'allow-origin':{type:'string',multiple:true},'idle-timeout-ms':{type:'string'}},allowPositionals:true});
if(!values.worlds)throw new Error('Usage: stream-host --worlds /absolute/world-projects [--web-root /absolute/stream-web/dist] [--port 53900] [--headed]');
const host=await startStreamHost({worldsDirectory:path.resolve(values.worlds),allowedOrigins:values['allow-origin']??[],port:Number(values.port??53900),idleSessionTimeoutMs:Number(values['idle-timeout-ms']??60000),headless:!values.headed,fps:Number(values.fps??24),bitrate:Number(values.bitrate??2000000),width:Number(values.width??1280),height:Number(values.height??720),...(values['web-root']?{webRoot:path.resolve(values['web-root'])}:{})});
process.stdout.write(`${JSON.stringify({status:'ready',baseUrl:host.baseUrl,debugUrl:host.baseUrl})}\n`);
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void host.close().then(()=>process.exit(0));});
