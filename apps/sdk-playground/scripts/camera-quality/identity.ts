import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {lstat,readlink} from 'node:fs/promises';
import path from 'node:path';

/** Fingerprint Git-visible workspace bytes, including dirty assets and tooling.
 * Stream files sequentially so large models do not accumulate in memory. */
export async function cameraRouteSourceIdentity(directory=process.cwd()) {
  const git=(args:string[])=>execFileSync('git',args,{cwd:directory,encoding:'utf8',maxBuffer:16*1024*1024});
  const root=git(['rev-parse','--show-toplevel']).trim();
  const names=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024}).split('\0').filter(Boolean);
  const entries:{path:string;linkTarget?:string;contentHash:string|null}[]=[];
  for(const name of [...new Set(names)].sort()) {
    const file=path.join(root,name),entry:{path:string;linkTarget?:string;contentHash:string|null}={path:name,contentHash:null};
    try {
      const metadata=await lstat(file);
      if(metadata.isSymbolicLink())entry.linkTarget=await readlink(file);
      if(!metadata.isFile()&&!metadata.isSymbolicLink())throw new Error(`CAMERA_ROUTE_SOURCE_NOT_FILE: ${name}`);
      const digest=createHash('sha256');
      for await(const chunk of createReadStream(file))digest.update(chunk);
      entry.contentHash=digest.digest('hex');
    } catch(error) {
      if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
      // Deleted tracked inputs remain part of the identity rather than disappearing.
    }
    entries.push(entry);
  }
  return {head:git(['rev-parse','HEAD']).trim(),sourceHash:createHash('sha256').update(JSON.stringify(entries)).digest('hex')};
}
