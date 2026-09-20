import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2), root = args[args.indexOf('--capsule-root') + 1];
assert(root?.startsWith('/'));
assert.equal(process.platform, 'linux'); assert.equal(process.arch, 'x64'); assert.equal(process.version, 'v20.20.2');
const sdkRoot = path.join(root, 'sdk'), require = createRequire(path.join(sdkRoot, 'package.json'));
const sdkRequire = createRequire(path.join(sdkRoot, 'packages/three-world/package.json'));
const creatorRequire=createRequire(path.join(sdkRoot,'packages/creator-host/package.json'));
const uiRequire=createRequire(path.join(sdkRoot,'packages/world-ui/package.json'));
const versions = JSON.parse(readFileSync(path.join(sdkRoot, 'package.json')));
assert.equal(versions.dependencies.three, '0.185.1');
assert.equal(require('three').REVISION, '185');
const rapierBuild=JSON.parse(readFileSync(path.join(sdkRoot,'vendor/rapier-query-refresh/build.json')));
assert.equal(JSON.parse(readFileSync(path.join(sdkRoot, 'packages/three-world/node_modules/@dimforge/rapier3d-compat/package.json'))).version, rapierBuild.version);
const rapier=sdkRequire('@dimforge/rapier3d-compat');await rapier.init();
const queryWorld=new rapier.World({x:0,y:-9.81,z:0});
try{
  const collider=queryWorld.createCollider(rapier.ColliderDesc.ball(.5).setTranslation(0,0,2));
  queryWorld.updateSceneQueries();
  assert.equal(queryWorld.castRay(new rapier.Ray({x:0,y:0,z:0},{x:0,y:0,z:1}),5,true)?.collider.handle,collider.handle);
}finally{queryWorld.free();}
for (const dependency of ['@modelcontextprotocol/sdk/server/index.js', 'playwright', 'tsx', 'ajv', 'esbuild', 'typescript']) require.resolve(dependency);
for(const dependency of ['@worldkit/world-ui/schema','json-schema-to-typescript'])creatorRequire.resolve(dependency);
for(const dependency of ['react','react-dom','@json-render/core','@json-render/react','motion/react','fast-json-patch'])uiRequire.resolve(dependency);
const ts = require('typescript');
const sourceSchema = ts.createSourceFile('schema.ts', 'export interface Example { id: string }', ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
assert.equal(sourceSchema.statements.length, 1); assert(ts.isInterfaceDeclaration(sourceSchema.statements[0]));
assert(require('sharp').versions.vips, 'Sharp/libvips must load for the included tri-view validation helper');
for (const dependency of ['@noble/hashes/sha256', '@recast-navigation/core', '@recast-navigation/generators']) sdkRequire.resolve(dependency);
const transformed = require('esbuild').transformSync('const value: number = 6', { loader: 'ts' });
assert(transformed.code.includes('6'));
// MCP resolution checks peers too; V3 found a real peer-resolution failure here.
const importDoctor = `await import(${JSON.stringify(require.resolve('@modelcontextprotocol/sdk/server/index.js'))}); await import(${JSON.stringify(require.resolve('playwright'))}); console.log('passed')`;
assert.equal(execFileSync(process.execPath, ['--input-type=module', '-e', importDoctor], { cwd: sdkRoot, encoding: 'utf8', timeout: 90000 }).trim(), 'passed');
const report = { kind: 'worldkit-three-capsule-doctor', schemaVersion: 1, status: 'passed', node: process.version, platform: process.platform, architecture: process.arch, three: '0.185.1', rapier: rapierBuild.version, rapierQueryRefresh:'passed', esbuild: 'transform-passed', typescriptCompilerApi: {version: ts.version, status: 'parse-passed'}, sharpLibvips: 'load-passed', mcpPeerResolution: 'passed', playwrightImport: 'passed', browser: 'deferred-to-cloud', sourceFrozen: false };
if (args.includes('--compile')) {
  const workspace = mkdtempSync('/tmp/three-capsule-compile-');
  try {
    const source = `import {ThreeCompiler,readCatalog} from './packages/creator-host/src/compiler/compiler.ts'; import {RAW_EXAMPLE,SDK_EXAMPLE} from './packages/creator-host/src/discovery/examples.ts'; import {sha256} from './packages/creator-host/src/contracts.ts'; import {readFile,writeFile,mkdir} from 'node:fs/promises'; const results=[]; for(const profile of ['three-raw','three-sdk']){const workspace=${JSON.stringify(workspace)}+'/'+profile;process.env.WORLDKIT_THREE_PREBUILT_RUNTIME_ROOT=${JSON.stringify(path.join(root, 'prebuilt'))}+'/'+profile;process.env.WORLDKIT_THREE_PREBUILT_RUNTIME_MANIFEST_SHA256=sha256(await readFile(process.env.WORLDKIT_THREE_PREBUILT_RUNTIME_ROOT+'/runtime-manifest.json'));await mkdir(workspace,{recursive:true});await writeFile(workspace+'/index.html','<!doctype html><html><head></head><body><script type="module" src="./main.ts"></script></body></html>');await writeFile(workspace+'/main.ts',profile==='three-raw'?RAW_EXAMPLE:SDK_EXAMPLE);await writeFile(workspace+'/project.json',JSON.stringify({schemaVersion:1,assetIds:['humanoid.uefn-mannequin']}));const compiler=new ThreeCompiler(workspace,profile);const first=await compiler.prepare();const second=await compiler.prepare();if(!first.runtimeCacheHit||!second.runtimeCacheHit||!second.candidateCacheHit)throw Error('PREBUILT_OR_CANDIDATE_CACHE_MISS');results.push({profile,worldBuildHash:first.worldBuildHash,runtimeHash:first.runtimeHash,firstCompileUsesPinnedRuntime:first.runtimeCacheHit,runtimeCacheHit:second.runtimeCacheHit,candidateCacheHit:second.candidateCacheHit});}console.log(JSON.stringify({results,catalogCount:(await readCatalog()).length}));`;
    const output = execFileSync(process.execPath, ['--import', path.join(sdkRoot, 'node_modules/tsx/dist/loader.mjs'), '--input-type=module', '-e', source], { cwd: sdkRoot, encoding: 'utf8', timeout: 240000, maxBuffer: 16 * 1024 * 1024 });
    report.externalWorkspaceCompile = JSON.parse(output.trim()); report.sourceFrozen = true;
    const uiSource=`import {ThreeCompiler} from './packages/creator-host/src/compiler/compiler.ts'; import {sha256} from './packages/creator-host/src/contracts.ts'; import {cp,readFile} from 'node:fs/promises'; const workspace=${JSON.stringify(workspace)}+'/streaming-ui'; await cp('./examples/three-creator/streaming-ui',workspace,{recursive:true}); process.env.WORLDKIT_THREE_PREBUILT_RUNTIME_ROOT=${JSON.stringify(path.join(root,'prebuilt/three-sdk'))}; process.env.WORLDKIT_THREE_PREBUILT_RUNTIME_MANIFEST_SHA256=sha256(await readFile(process.env.WORLDKIT_THREE_PREBUILT_RUNTIME_ROOT+'/runtime-manifest.json')); const candidate=await new ThreeCompiler(workspace,'three-sdk').prepare(); const manifest=JSON.parse(await readFile(candidate.playableRoot+'/world-ui/manifest.json','utf8')); const bytes=await readFile(candidate.playableRoot+'/world-ui/'+manifest.module.path); if(sha256(bytes)!==manifest.module.sha256||!manifest.styles.length)throw Error('WORLD_UI_ARTIFACT_INVALID'); console.log(JSON.stringify({worldBuildHash:candidate.worldBuildHash,uiModuleSha256:manifest.module.sha256,styles:manifest.styles.length}));`;
    report.worldUiCompile=JSON.parse(execFileSync(process.execPath,['--import',path.join(sdkRoot,'node_modules/tsx/dist/loader.mjs'),'--input-type=module','-e',uiSource],{cwd:sdkRoot,encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024}).trim());
  } finally { rmSync(workspace, { recursive: true, force: true }); }
}
mkdirSync(root, { recursive: true });
writeFileSync(path.join(root, args.includes('--compile') ? 'doctor.json' : 'dependency-doctor.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
