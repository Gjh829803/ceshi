import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
export async function kube(args,input){
  const child=spawn('kubectl',args,{stdio:['pipe','pipe','pipe']});const out=[],err=[];
  child.stdout.on('data',v=>out.push(v));child.stderr.on('data',v=>err.push(v));child.stdin.end(input===undefined?undefined:JSON.stringify(input));
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
  if(code){const message=Buffer.concat(err).toString();throw Object.assign(Error(`EPISODE_KUBE: ${message.slice(0,1500)}`),{code:/\(Conflict\)|\(AlreadyExists\)/.test(message)?'CONFLICT':'KUBE_FAILED'});}
  const data=Buffer.concat(out).toString().trim();return data?JSON.parse(data):null;
}
export const cohortName=id=>`three-cohort-${createHash('sha256').update(id).digest('hex').slice(0,24)}`;
export const GLOBAL_QUEUE='three-episode-gpu-queue';
export function createBatchStore({namespace='lwdp',request=kube}={}){
  async function read(name){return request(['get','configmap',name,'-n',namespace,'--ignore-not-found','-o','json']);}
  async function change(name,transform,initial){
    for(let attempt=0;attempt<20;attempt++){
      const resource=await read(name);if(!resource&&initial===undefined)throw Error('EPISODE_QUEUE_NOT_REGISTERED');
      const state=resource?JSON.parse(resource.data.state):structuredClone(initial);
      const result=transform(state);
      const serialized=JSON.stringify(state);if(Buffer.byteLength(serialized)>850_000)throw Error('EPISODE_QUEUE_SIZE_LIMIT');
      if(resource&&serialized===resource.data.state)return {state,result};
      const next={apiVersion:'v1',kind:'ConfigMap',metadata:{name,namespace,...(resource?{resourceVersion:resource.metadata.resourceVersion}:{}),labels:{'app.kubernetes.io/name':'worldkit-three-episode-queue'}},data:{state:serialized}};
      try{await request([resource?'replace':'create','-f','-','-o','json'],next);return {state,result};}catch(e){if(e.code!=='CONFLICT')throw e;}
    }throw Error('EPISODE_QUEUE_CONTENTION');
  }
  return {namespace,request,read,change,async state(name){const r=await read(name);if(!r)throw Error('EPISODE_QUEUE_NOT_REGISTERED');return JSON.parse(r.data.state);},async list(){const r=await request(['get','configmaps','-n',namespace,'-l','app.kubernetes.io/name=worldkit-three-episode-queue','-o','json']);return r.items.filter(r=>r.metadata.name.startsWith('three-cohort-')).map(r=>({name:r.metadata.name,state:JSON.parse(r.data.state)}));}};
}
