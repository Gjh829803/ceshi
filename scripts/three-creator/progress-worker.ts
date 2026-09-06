/** Host process only: does not invoke the model, import author code, or run a browser. */
import {CreatorProgress} from './progress.js';
import type {CreatorProfile} from './contracts.js';

const args=process.argv.slice(2);
function argument(name:string):string {
  const index=args.indexOf(name);
  if(index<0 || index===args.length-1 || args.indexOf(name,index+1)!==-1)throw new Error('THREE_PROGRESS_ARGUMENT_INVALID');
  return args[index+1]!;
}
const publisher=new CreatorProgress(argument('--workspace'),{
  profile:argument('--profile') as CreatorProfile,caseId:argument('--case-id'),taskId:argument('--task-id'),
  runtimeHash:argument('--runtime-hash'),creatorRuntimeLockHash:argument('--creator-runtime-lock-hash'),
});
const interval=Number(argument('--interval-ms'));
if(!Number.isSafeInteger(interval)||interval<100||interval>60000)throw new Error('THREE_PROGRESS_INTERVAL_INVALID');
let pending:Promise<unknown>=Promise.resolve(),stopping=false;
const snapshot=()=>{pending=publisher.save().catch(()=>undefined);};
snapshot();const timer=setInterval(snapshot,interval);
async function stop() {
  if(stopping)return;stopping=true;clearInterval(timer);
  const deadline=setTimeout(()=>process.exit(0),12000);
  await pending;
  // Flush again after any in-flight snapshot: edits made during it are retained.
  await publisher.save().catch(()=>undefined);
  clearTimeout(deadline);process.exit(0);
}
process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());
let input='';process.stdin.setEncoding('utf8');
process.stdin.on('data',(chunk:string)=>{input=(input+chunk).slice(-64);if(input.includes('stop\n'))void stop();});
process.stdin.on('end',()=>void stop());process.stdin.resume();
