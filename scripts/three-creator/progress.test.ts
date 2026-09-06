import {afterEach,describe,expect,it} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath,symlink,link,readdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import os from 'node:os';
import {CreatorProgress,collectProgressSources,progressSourceHash} from './progress.js';
const roots:string[]=[];
const exec=promisify(execFile);
const identity={profile:'three-sdk' as const,caseId:'local-case',taskId:'local-case--three-sdk',runtimeHash:'a'.repeat(64),creatorRuntimeLockHash:'b'.repeat(64)};
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
async function fixture(){const temporary=await mkdtemp(path.join(os.tmpdir(),'three-progress-'));roots.push(temporary);return realpath(temporary);}
async function verify(root:string,name='verified') {
  const output=path.join(root,name);
  await exec('python3',['scripts/cloud/three-progress-unpack.py','--archive',path.join(root,'outputs/creator-progress.tar.gz'),'--receipt',path.join(root,'outputs/creator-progress.json'),'--output',output,'--expected-json',JSON.stringify(identity)],{cwd:process.cwd()});return output;
}
describe('unverified author progress',()=>{
 it('accepts long case IDs admitted by the cloud runner',async()=>{const root=await fixture(),caseId='case-'+ 'a'.repeat(80);await writeFile(path.join(root,'main.ts'),'export const partial = true;');const receipt=await new CreatorProgress(root,{...identity,caseId,taskId:caseId+'--three-sdk'}).save();expect(receipt?.caseId).toBe(caseId);});
 it('saves incomplete source before first Preview, including notes/map bytes and malformed project, with no runtime claim',async()=>{
  const root=await fixture(),publisher=new CreatorProgress(root,identity);
  expect(await publisher.save()).toBeNull();
  await mkdir(path.join(root,'plans'));
  const map=Buffer.from([137,80,78,71,0,32,144]);
  await writeFile(path.join(root,'plans','地图.md'),'# Original plan\nContinue from the north corridor.');
  await writeFile(path.join(root,'plans','top-down.png'),map);
  await writeFile(path.join(root,'project.json'),'{unfinished:');
  await writeFile(path.join(root,'world.ts'),'export const world =');
  const receipt=await publisher.save(),source=await collectProgressSources(root);
  expect(receipt).toMatchObject({...identity,status:'unverified',sourceHashAlgorithm:'author-inventory-sha256-v1',sourceHash:progressSourceHash(source)});
  expect(receipt).not.toHaveProperty('worldBuildHash');expect(receipt).not.toHaveProperty('technicalStatus');
  const output=await verify(root);
  expect(await readFile(path.join(output,'payload/source/plans/top-down.png'))).toEqual(map);
  expect(await readFile(path.join(output,'payload/source/project.json'),'utf8')).toBe('{unfinished:');
  expect(await readFile(path.join(output,'payload/source/plans/地图.md'),'utf8')).toContain('north corridor');
  expect(JSON.parse(await readFile(path.join(output,'progress-verification.json'),'utf8')).sourceStatus).toBe('unverified');
 });
 it('deduplicates unchanged source and preserves the previous pair when later source is broken, oversized or absent',async()=>{
  const root=await fixture();await writeFile(path.join(root,'world.ts'),'const first=1;');
  const publisher=new CreatorProgress(root,identity,{maximumTotalBytes:64});const first=await publisher.save();
  const archive=await readFile(path.join(root,'outputs/creator-progress.tar.gz')),receipt=await readFile(path.join(root,'outputs/creator-progress.json'));
  expect(await publisher.save()).toEqual(first);expect(await readFile(path.join(root,'outputs/creator-progress.json'))).toEqual(receipt);
  await writeFile(path.join(root,'world.ts'),'x'.repeat(65));await expect(publisher.save()).rejects.toThrow('SOURCE_BUDGET');
  expect(await readFile(path.join(root,'outputs/creator-progress.tar.gz'))).toEqual(archive);
  expect(await readFile(path.join(root,'outputs/creator-progress.json'))).toEqual(receipt);
  await rm(path.join(root,'world.ts'));expect(await publisher.save()).toBeNull();
  expect(await readFile(path.join(root,'outputs/creator-progress.json'))).toEqual(receipt);
  await writeFile(path.join(root,'world.ts'),'const first=2;');expect((await publisher.save())?.sourceHash).not.toBe(first?.sourceHash);
  await verify(root);
 });
 it('excludes host/private names before traversing them and rejects admitted symlinks and hardlinks',async()=>{
  const root=await fixture(),outside=await fixture();await writeFile(path.join(root,'world.ts'),'safe');await writeFile(path.join(outside,'private.json'),'do not read');
  for(const name of ['scratch','inputs','outputs','codex_home_runtime','.creator-session','runtime'])await symlink(outside,path.join(root,name));
  for(const name of ['auth.json','secrets.json','credentials.json','creator-continuation.json'])await writeFile(path.join(root,name),'credential/report placeholder');
  expect([...await collectProgressSources(root)].map(([name])=>name)).toEqual(['world.ts']);
  await symlink(path.join(outside,'private.json'),path.join(root,'other.json'));await expect(collectProgressSources(root)).rejects.toThrow('LINK_REJECTED');
  await rm(path.join(root,'other.json'));await link(path.join(outside,'private.json'),path.join(root,'other.json'));await expect(collectProgressSources(root)).rejects.toThrow('FILE_NOT_ADMITTED');
 });
 it('rejects linked output roots without creating files outside the workspace',async()=>{
  const root=await fixture(),outside=await fixture();await writeFile(path.join(root,'world.js'),'void 0;');await symlink(outside,path.join(root,'outputs'));
  await expect(new CreatorProgress(root,identity).save()).rejects.toThrow('PATH_INVALID');expect(await readdir(outside)).toEqual([]);
  await rm(path.join(root,'outputs'));await symlink(outside,path.join(root,'.three-creator'));
  await expect(new CreatorProgress(root,identity).save()).rejects.toThrow('PATH_INVALID');expect(await readdir(outside)).toEqual([]);
 });
 it('serializes overlapping saves and bounds immutable generations',async()=>{
  const root=await fixture(),publisher=new CreatorProgress(root,identity);await writeFile(path.join(root,'world.js'),'let n=0;');
  const first=publisher.save();expect(publisher.save()).toBe(first);await first;
  for(let n=1;n<4;n++){await writeFile(path.join(root,'world.js'),`let n=${n};`);await publisher.save();}
  expect((await readdir(path.join(root,'.three-creator/progress'))).length).toBe(2);await verify(root);
 });
});
