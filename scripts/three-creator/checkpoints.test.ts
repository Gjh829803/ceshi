import {afterEach,describe,expect,it,vi} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath,symlink} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import os from 'node:os';
import {ThreeCompiler} from './compiler.js';
import {CreatorCheckpoints} from './checkpoints.js';
import {sha256} from './contracts.js';
const roots:string[]=[];
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlS8AAAAASUVORK5CYII=','base64');
const exec=promisify(execFile);
afterEach(async()=>{vi.unstubAllEnvs();await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
async function fixture(){
  const temporary=await mkdtemp(path.join(os.tmpdir(),'three-checkpoint-'));roots.push(temporary);const root=await realpath(temporary);
  await writeFile(path.join(root,'index.html'),'<html><script type="module" src="./main.js"></script></html>');await writeFile(path.join(root,'main.js'),'document.title="LOCAL checkpoint fixture";');
  const compiler=new ThreeCompiler(root,'three-raw'),candidate=await compiler.prepare();
  const imagePath=path.join(root,'.three-creator','evidence',candidate.worldBuildHash,'preview-fixture','opening.png');await mkdir(path.dirname(imagePath),{recursive:true});await writeFile(imagePath,png);
  const preview={kind:'three-creator-browser-preview',schemaVersion:1,profile:'three-raw',sourceHash:candidate.sourceHash,worldBuildHash:candidate.worldBuildHash,view:'opening',pageErrors:[],runtimeErrors:[],blockedNetworkRequests:[],image:{path:imagePath,sha256:sha256(png),byteLength:png.length}};
  return{root,compiler,candidate,preview};
}
describe('runnable checkpoints',()=>{
 it('roundtrips a hash-closed compiled build, deduplicates saves and never claims delivery',async()=>{
  const f=await fixture(),writer=new CreatorCheckpoints(f.root,'three-raw');vi.stubEnv('WORLDKIT_CREATOR_RUNTIME_HASH','a'.repeat(64));
  const first=await writer.save(f.candidate,f.preview),bytes=await readFile(path.join(f.root,'outputs/creator-checkpoint.json'));
  expect(first.status).toBe('runnable');expect(first.creatorRuntimeLockHash).toBe('a'.repeat(64));expect(first).not.toHaveProperty('technicalStatus');expect(first).not.toHaveProperty('deliveryStatus');
  expect(await writer.save(f.candidate,f.preview)).toEqual(first);expect(await readFile(path.join(f.root,'outputs/creator-checkpoint.json'))).toEqual(bytes);
  const output=path.join(f.root,'verified');await exec('python3',['scripts/cloud/three-checkpoint-unpack.py','--archive',path.join(f.root,'outputs/creator-checkpoint.tar.gz'),'--receipt',path.join(f.root,'outputs/creator-checkpoint.json'),'--output',output,'--expected-json',JSON.stringify({profile:'three-raw',creatorRuntimeLockHash:'a'.repeat(64)})],{cwd:process.cwd()});
  expect(await readFile(path.join(output,'payload/playable/index.html'),'utf8')).toContain('script');expect(await readFile(path.join(output,'payload/source/main.js'),'utf8')).toContain('LOCAL checkpoint');
 },60000);
 it('keeps the previous checkpoint when a new preview fails or source/image bytes change',async()=>{
  const f=await fixture(),writer=new CreatorCheckpoints(f.root,'three-raw');await writer.save(f.candidate,f.preview);const receipt=await readFile(path.join(f.root,'outputs/creator-checkpoint.json'));
  await expect(writer.save(f.candidate,{...f.preview,pageErrors:['fixture error']})).rejects.toThrow('PREVIEW_NOT_CLEAN');
  await writeFile(path.join(f.candidate.playableRoot,'index.html'),'changed immutable build');await expect(writer.save(f.candidate,f.preview)).rejects.toThrow('THREE_ARTIFACT_CHANGED');
  expect(await readFile(path.join(f.root,'outputs/creator-checkpoint.json'))).toEqual(receipt);
  const next=await fixture();await writeFile(next.preview.image.path,'changed image');await expect(new CreatorCheckpoints(next.root,'three-raw').save(next.candidate,next.preview)).rejects.toThrow('IMAGE_CHANGED');
 });
 it('rejects linked output roots before overwriting anything outside the workspace',async()=>{
  const f=await fixture(),outside=await fixture();await symlink(outside.root,path.join(f.root,'outputs'));
  await expect(new CreatorCheckpoints(f.root,'three-raw').save(f.candidate,f.preview)).rejects.toThrow('PATH_INVALID');
  await expect(readFile(path.join(outside.root,'creator-checkpoint.json'))).rejects.toMatchObject({code:'ENOENT'});
 });
});
