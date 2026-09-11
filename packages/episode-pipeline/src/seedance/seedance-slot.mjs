import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

/** Authenticated admission client. Retries recover the same lease, never a new identity. */
export async function requestSlot(operation,key,inputHash,metadata,{
 url=process.env.SEEDANCE_ADMISSION_URL,token=process.env.SEEDANCE_ADMISSION_TOKEN,
 request=fetch,timeoutMs=1_750_000,retryMs=500,now=Date.now,sleep=delay,
}={}){
 if(!['enter','leave'].includes(operation)||!/^[a-f0-9]{64}$/.test(key)||inputHash!==key)throw Error('SEEDANCE_SLOT_IDENTITY_INVALID');
 if(!metadata||typeof metadata.attempt!=='string'||!/^attempt-[0-9]{2,}$/.test(metadata.attempt))throw Error('SEEDANCE_SLOT_ATTEMPT_REQUIRED');
 if(metadata.taskId!=null&&(typeof metadata.taskId!=='string'||!metadata.taskId.trim()))throw Error('SEEDANCE_SLOT_TASK_ID_INVALID');
 if(typeof token!=='string'||token.length<16)throw Error('SEEDANCE_ADMISSION_TOKEN_REQUIRED');
 if(typeof url!=='string'||!url)throw Error('SEEDANCE_ADMISSION_URL_REQUIRED');
 const endpoint=new URL(url),loopback=['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname);
 if(endpoint.username||endpoint.password||endpoint.search||endpoint.hash||!['http:','https:'].includes(endpoint.protocol)||(endpoint.protocol==='http:'&&!loopback))throw Error('SEEDANCE_ADMISSION_URL_INVALID');
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1)throw Error('SEEDANCE_SLOT_TIMEOUT_INVALID');
 const deadline=now()+timeoutMs;
 for(;;){
  try{
   const response=await request(`${endpoint.href.replace(/\/$/,'')}/${operation}`,{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},redirect:'error',
    body:JSON.stringify({key,attempt:metadata.attempt,...(metadata.taskId?{taskId:metadata.taskId}:{})}),
    signal:AbortSignal.timeout(Math.max(1,deadline-now())),
   });
   if(!response.ok){
    const detail=await response.json().catch(()=>({})),code=/^SEEDANCE_[A-Z_]+$/.test(detail.error)?detail.error:'SEEDANCE_ADMISSION_SERVICE_FAILED';
    throw Object.assign(Error(code),{fatal:response.status<500});
   }
   const result=await response.json();
   if(result.ok!==true)throw Object.assign(Error('SEEDANCE_ADMISSION_NOT_CONFIRMED'),{fatal:true});
   return result;
  }catch(error){
   if(error.fatal)throw error;
   if(now()+retryMs>=deadline)throw Error('SEEDANCE_ADMISSION_UNCONFIRMED');
   await sleep(retryMs);
  }
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 if(process.argv.length!==6)throw Error('SEEDANCE_SLOT_ARGUMENTS_REQUIRED');
 await requestSlot(process.argv[2],process.argv[3],process.argv[4],JSON.parse(process.argv[5]));
}
