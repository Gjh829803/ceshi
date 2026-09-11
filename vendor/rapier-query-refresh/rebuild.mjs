#!/usr/bin/env node
/** Maintainer-only rebuild. Ordinary pnpm installs consume the checked archive. */
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {cpSync,existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import console from 'node:console';

const here=path.dirname(fileURLToPath(import.meta.url));
const metadata=JSON.parse(readFileSync(path.join(here,'build.json'),'utf8'));
const output=path.resolve(process.argv[2]??'');
assert(process.argv[2]&&!existsSync(output),'Supply a new output directory');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(readFileSync(path.join(here,'query-refresh.patch'))),metadata.patchSha256);
mkdirSync(output,{recursive:true});
const run=(command,args,cwd)=>execFileSync(command,args,{cwd,stdio:'inherit'});
const source=path.join(output,'source');
run('git',['clone','--filter=blob:none','--no-checkout',metadata.upstreamRepository,source],output);
run('git',['checkout','--detach',metadata.upstreamCommit],source);
run('git',['apply','--unidiff-zero',path.join(here,'query-refresh.patch')],source);
// Pin the collision library source as well as its narrow voxel-cast correction.
const parryPatch=path.join(here,'parry-voxel-cast.patch');
assert.equal(hash(readFileSync(parryPatch)),metadata.parry.patchSha256);
const response=await globalThis.fetch(metadata.parry.archiveUrl);assert(response.ok,'Parry source download failed');
const parryBytes=Buffer.from(await response.arrayBuffer());assert.equal(hash(parryBytes),metadata.parry.sha256);
const parryArchive=path.join(output,'parry.crate');writeFileSync(parryArchive,parryBytes);
run('tar',['-xzf',parryArchive,'-C',output],output);
const parry=path.join(output,`parry3d-${metadata.parry.version}`);
run('git',['apply','--unidiff-zero',parryPatch],parry);
const typescript=path.join(source,'typescript'),compat=path.join(typescript,'rapier-compat');
const cargoManifest=path.join(typescript,'Cargo.toml');
writeFileSync(cargoManifest,readFileSync(cargoManifest,'utf8')+`\nparry3d = { path = "../../parry3d-${metadata.parry.version}" }\n`);
// The generator only creates manifests. The checked lock governs the WASM build.
run('cargo',['run','-p','prepare_builds','--','-d','dim3','-f','non-deterministic'],typescript);
cpSync(path.join(here,'Cargo.lock'),path.join(typescript,'Cargo.lock'));
run('npx',['--yes',`wasm-pack@${metadata.wasmPack}`,'build','--target','web','--out-dir','../../rapier-compat/builds/3d/wasm-build','./builds/rapier3d','--','--locked'],typescript);
cpSync(path.join(here,'build-package.json'),path.join(compat,'package.json'));
cpSync(path.join(here,'build-package-lock.json'),path.join(compat,'package-lock.json'));
run('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],compat);
const build=path.join(compat,'builds/3d'),gen=path.join(build,'gen3d'),dist=path.join(build,'pkg/dist');
cpSync(path.join(typescript,'src.ts'),gen,{recursive:true});cpSync(path.join(compat,'src3d'),gen,{recursive:true});
function preprocess(directory){
  for(const entry of readdirSync(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name);
    if(entry.isDirectory()){preprocess(file);continue;}
    if(!entry.name.endsWith('.ts'))continue;
    let skip=false;const lines=[];
    for(const line of readFileSync(file,'utf8').split(/(?<=\n)/)){
      if(line.includes('#if DIM2'))skip=true;
      if(!skip)lines.push(line);
      if(skip&&line.includes('#endif'))skip=false;
    }
    writeFileSync(file,lines.join(''));
  }
}
preprocess(gen);mkdirSync(dist,{recursive:true});
for(const name of readdirSync(path.join(build,'wasm-build')))if(name.startsWith('rapier_wasm'))cpSync(path.join(build,'wasm-build',name),path.join(dist,name));
const wasmJs=path.join(dist,'rapier_wasm3d.js');writeFileSync(wasmJs,readFileSync(wasmJs,'utf8').replaceAll('import.meta.url','"<deleted>"'));
for(const name of ['tsconfig.common.json','tsconfig.json'])cpSync(path.join(compat,name),path.join(build,name));
cpSync(path.join(compat,'tsconfig.pkg3d.json'),path.join(build,'tsconfig.pkg.json'));
const rollup=readFileSync(path.join(compat,'rollup.config.js'),'utf8');
writeFileSync(path.join(compat,'rollup.single.config.js'),rollup.slice(0,rollup.indexOf('export default ['))+'export default [config("3d", "3d")];\n');
run('npm',['exec','--','rollup','--config','rollup.single.config.js','--bundleConfigAsCjs'],compat);
writeFileSync(path.join(dist,'raw.d.ts'),'export * from "./rapier_wasm3d";\n');
const pkg=path.join(build,'pkg'),manifest=JSON.parse(readFileSync(path.join(pkg,'package.json'),'utf8'));
manifest.version=metadata.version;manifest.description='Rapier 0.20.0 with native query refresh and collision fixes.';
writeFileSync(path.join(pkg,'package.json'),JSON.stringify(manifest,null,2)+'\n');
run('npm',['pack','--ignore-scripts','--pack-destination',output],pkg);
const archive=readdirSync(output).find(name=>name.endsWith('.tgz'));
assert(archive);console.log(JSON.stringify({archive:path.join(output,archive),sha256:hash(readFileSync(path.join(output,archive))),upstreamCommit:metadata.upstreamCommit},null,2));
