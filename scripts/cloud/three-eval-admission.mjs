import {mkdir,rmdir} from 'node:fs/promises';
import path from 'node:path';

// Capacity reservations are serialized across processes. Brief filesystem-lock
// contention is not the business condition "four requests are still active".
// A crashed coordinator's lock is never guessed stale and removed here.
export async function withAdmissionDirectoryLock(root,key,work,{waitMilliseconds=0}={}) {
  await mkdir(root,{recursive:true});
  const directory=path.join(root,`${key}.lock`),deadline=Date.now()+waitMilliseconds;
  for(;;){
    try{await mkdir(directory);break;}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      if(Date.now()>=deadline)throw new Error(`CREATOR_CASE_ADMISSION_BUSY: ${key}; another coordinator holds this lock`);
      await new Promise(resolve=>setTimeout(resolve,25));
    }
  }
  try{return await work(path.join(root,`${key}.json`));}
  finally{await rmdir(directory);}
}
