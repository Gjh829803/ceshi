import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach,expect,it} from 'vitest';
import {cameraRouteSourceIdentity} from './identity';

const roots:string[]=[];
afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
async function fixture() {
  const root=await mkdtemp(path.join(os.tmpdir(),'camera-route-identity-'));roots.push(root);
  const names=['model.glb','tool.mjs','style.css','index.html','pnpm-lock.yaml','vendor.tgz','model with\nnewline.glb'];
  const bytes=Buffer.from([0,255,7,10]);
  for(const name of names)await writeFile(path.join(root,name),bytes);
  await writeFile(path.join(root,'.gitignore'),'output/\n');
  const git=(args:string[])=>execFileSync('git',['-c','user.name=Camera Test','-c','user.email=camera@example.invalid','-c','commit.gpgsign=false','-c','core.hooksPath=/dev/null',...args],{cwd:root,stdio:'pipe'});
  git(['init']);git(['add','.']);git(['commit','-m','fixture']);
  return {root,names,bytes};
}
it('records dirty binary, tooling, style, HTML and lock bytes without relying on HEAD',async()=>{
  const {root,names,bytes}=await fixture(),before=await cameraRouteSourceIdentity(root);
  for(const name of names){
    await writeFile(path.join(root,name),Buffer.from([1,2,3]));
    const after=await cameraRouteSourceIdentity(root);
    expect(after.head).toBe(before.head);expect(after.sourceHash).not.toBe(before.sourceHash);
    await writeFile(path.join(root,name),bytes);
  }
  expect(await cameraRouteSourceIdentity(root)).toEqual(before);
});
it('detects additions and deletions while excluding ignored capture output',async()=>{
  const {root}=await fixture(),before=await cameraRouteSourceIdentity(root);
  await mkdir(path.join(root,'output'));await writeFile(path.join(root,'output/frame.png'),'capture');
  expect(await cameraRouteSourceIdentity(root)).toEqual(before);
  await writeFile(path.join(root,'new.glb'),'new');expect(await cameraRouteSourceIdentity(root)).not.toEqual(before);
  await rm(path.join(root,'new.glb'));expect(await cameraRouteSourceIdentity(root)).toEqual(before);
  await rm(path.join(root,'model.glb'));expect(await cameraRouteSourceIdentity(root)).not.toEqual(before);
});
it('hashes linked asset bytes as well as the link target',async()=>{
  const {root}=await fixture();await mkdir(path.join(root,'output'));
  await writeFile(path.join(root,'output/model.glb'),'first');
  await symlink('output/model.glb',path.join(root,'linked.glb'));
  const before=await cameraRouteSourceIdentity(root);
  await writeFile(path.join(root,'output/model.glb'),'second');
  expect(await cameraRouteSourceIdentity(root)).not.toEqual(before);
});
