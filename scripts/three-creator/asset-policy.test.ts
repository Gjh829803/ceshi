import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { ThreeCreatorTools } from './tools';
import { ThreeCompiler, hashTree } from './compiler';
import {sha256} from './contracts';
import catalog from './asset-catalog.json';
import defaultPolicy from './asset-policy.json';
import {createAssetPolicySnapshot,assetPolicyHash,verifyAssetPolicySources} from './asset-policy.mjs';

async function pin(overrides:Record<string,unknown>={}) {
 const root=await mkdtemp(path.join(os.tmpdir(),'three-policy-host-'));roots.push(root);
 const snapshot=createAssetPolicySnapshot({...defaultPolicy,...overrides},catalog.assets);
 const assetPolicySnapshotPath=path.join(root,'policy.json');await writeFile(assetPolicySnapshotPath,JSON.stringify(snapshot));
 return {snapshot,options:{assetPolicySnapshotPath,assetPolicySha256:assetPolicyHash(snapshot)}};
}

const roots: string[] = [];
async function workspace() {
 const root = await mkdtemp(path.join(os.tmpdir(),'three-asset-policy-')); roots.push(root);
 await writeFile(path.join(root,'index.html'),'<html><script type="module" src="./main.ts"></script></html>');
 await writeFile(path.join(root,'main.ts'),'document.title="asset policy";'); return root;
}
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});

it('hides unavailable catalog entries from both search and exact description',async()=>{
 const service=new ThreeCreatorTools(await workspace(),'three-sdk');
 try{
  expect((await service.assets('')).assets.some((a:any)=>a.id==='humanoid.preset-101')).toBe(true);
  expect((await service.assets('')).assets.some((a:any)=>a.id==='humanoid.g-bot')).toBe(false);
  expect((await service.assets('', 'humanoid.g-bot')).assets).toEqual([]);
 }finally{await service.close();}
});

it('rejects a denied asset selected by manually authored project.json',async()=>{
 const root=await workspace();
 await writeFile(path.join(root,'project.json'),JSON.stringify({schemaVersion:1,assetIds:['humanoid.g-bot']}));
 await expect(new ThreeCompiler(root,'three-sdk').prepare()).rejects.toThrow('THREE_ASSET_POLICY_DENIED');
});

it('recognizes a forbidden asset by bytes even when copied under a custom filename',async()=>{
 const root=await workspace(),gbot=catalog.assets.find(a=>a.id==='humanoid.g-bot')!;
 await writeFile(path.join(root,'custom-character.glb'),await readFile(gbot.sourcePath));
 await expect(new ThreeCompiler(root,'three-sdk').prepare()).rejects.toThrow('THREE_ASSET_POLICY_RESOURCE_DENIED');
});

it('rejects an author-supplied Host policy file instead of treating it as permission',async()=>{
 const root=await workspace();
 await writeFile(path.join(root,'asset-policy.json'),JSON.stringify({allowedAssetIds:['humanoid.g-bot']}));
 await expect(new ThreeCompiler(root,'three-sdk').prepare()).rejects.toThrow('THREE_ASSET_POLICY_RESERVED_FILE');
});

it('renders the starter from the allowed default and freezes it across file edits',async()=>{
 const {options}=await pin({allowedAssetIds:['humanoid.g-bot'],defaultHumanoidAssetId:'humanoid.g-bot'});
 const root=await workspace(),service=new ThreeCreatorTools(root,'three-sdk',options);
 try{
  const environment=await service.environment();expect(environment.assetPolicy.allowedAssetIds).toEqual(['humanoid.g-bot']);
  const guide=await service.schema('assets');
  const referenced=catalog.assets.filter(asset=>guide.sdkGuide?.includes(asset.id)).map(asset=>asset.id);
  expect(referenced).toEqual(['humanoid.g-bot']);
  expect(guide.sdkGuide).not.toContain("Playground's original 101-bone model");
  const example=await service.examples();
  for(const [name,source]of Object.entries(example.files))await writeFile(path.join(root,name),source);
  const candidate=await service.compiler.prepare();
  expect(candidate.project.assetIds).toEqual(['humanoid.g-bot']);
  expect(await readFile(path.join(candidate.playableRoot,'compiled/entry-0.js'),'utf8')).toContain('humanoid.g-bot');
  await writeFile(options.assetPolicySnapshotPath,JSON.stringify(createAssetPolicySnapshot(defaultPolicy,catalog.assets)));
  expect((await service.assets('')).assets.map((asset:any)=>asset.id)).toEqual(['humanoid.g-bot']);
  expect((await service.compiler.prepare()).worldBuildHash).toBe(candidate.worldBuildHash);
  expect(()=>new ThreeCreatorTools(root,'three-sdk',options)).toThrow('THREE_ASSET_POLICY_HASH_MISMATCH');
 }finally{await service.close();}
});

it('does not disclose example bundles requiring unavailable assets',async()=>{
 const {options}=await pin({allowedAssetIds:['humanoid.preset-101']});
 const service=new ThreeCreatorTools(await workspace(),'three-sdk',options);
 try{await expect(service.examples('independent-world')).rejects.toThrow('THREE_EXAMPLE_ASSETS_UNAVAILABLE');}
 finally{await service.close();}
});

it('allows custom model files only when enabled and includes policy in candidate identity',async()=>{
 const root=await workspace(),allowed=await pin(),restricted=await pin({allowCustomAssets:false});
 const first=new ThreeCompiler(root,'three-raw',allowed.options),second=new ThreeCompiler(root,'three-raw',restricted.options);
 const a=await first.prepare(),b=await second.prepare();
 expect(a.sourceHash).not.toBe(b.sourceHash);expect(a.worldBuildHash).not.toBe(b.worldBuildHash);
 await writeFile(path.join(root,'custom.gltf'),JSON.stringify({asset:{version:'2.0'},scenes:[{nodes:[]}],scene:0}));
 await expect(first.prepare()).resolves.toHaveProperty('assetPolicySha256',allowed.options.assetPolicySha256);
 await expect(second.prepare()).rejects.toThrow('THREE_CUSTOM_ASSET_NOT_ALLOWED');
});

it('rejects partial pins and policy files inside the author workspace',async()=>{
 const root=await workspace(),{options}=await pin();
 expect(()=>new ThreeCreatorTools(root,'three-sdk',{assetPolicySha256:options.assetPolicySha256})).toThrow('THREE_ASSET_POLICY_PIN_REQUIRED');
 expect(()=>new ThreeCreatorTools(root,'three-sdk',{assetPolicySnapshotPath:'',assetPolicySha256:''})).toThrow('THREE_ASSET_POLICY_PIN_REQUIRED');
 const file=path.join(root,'copied-policy.json');await writeFile(file,await readFile(options.assetPolicySnapshotPath));
 expect(()=>new ThreeCreatorTools(root,'three-sdk',{...options,assetPolicySnapshotPath:file})).toThrow('THREE_ASSET_POLICY_HOST_PATH_REQUIRED');
});

it('rejects invalid defaults, unknown permissions and ambiguous IDs',()=>{
 for(const overrides of [
  {defaultHumanoidAssetId:'humanoid.g-bot'},
  {allowedAssetIds:[...defaultPolicy.allowedAssetIds,'unknown.asset']},
  {allowedAssetIds:[...defaultPolicy.allowedAssetIds,defaultPolicy.allowedAssetIds[0]]},
  {defaultHumanoidAssetId:'training.rover'},
  {allowCustomAssets:'true'},
 ])expect(()=>createAssetPolicySnapshot({...defaultPolicy,...overrides},catalog.assets)).toThrow('THREE_ASSET_POLICY');
});

it.each(['js','jsx','ts','tsx','mjs'])('checks embedded forbidden bytes in %s and preserves shared allowed dependencies',async extension=>{
 const snapshot=createAssetPolicySnapshot(defaultPolicy,catalog.assets);
 const bytes=await readFile(catalog.assets.find(a=>a.id==='humanoid.g-bot')!.sourcePath);
 expect(()=>verifyAssetPolicySources(snapshot,{[`main.${extension}`]:Buffer.from(`const url="data:model/gltf-binary;base64,${bytes.toString('base64')}";`)})).toThrow('THREE_ASSET_POLICY_RESOURCE_DENIED');
 const shared=catalog.assets.find(a=>a.id==='humanoid.preset-101')!.resources![0]!;
 const customCatalog=[...catalog.assets,{...catalog.assets[0],id:'disabled.alias',resources:[shared]}];
 const sharedSnapshot=createAssetPolicySnapshot(defaultPolicy,customCatalog);
 expect(sharedSnapshot.deniedResourceSha256).not.toContain(shared.sha256);
 expect(()=>verifyAssetPolicySources(sharedSnapshot,{'notice.txt':Buffer.from('ordinary author text')})).not.toThrow();
});

it('rejects changed packaged dependencies independently of the declared asset ID',async()=>{
 const root=await workspace(),compiler=new ThreeCompiler(root,'three-sdk');
 await writeFile(path.join(root,'project.json'),JSON.stringify({schemaVersion:1,assetIds:['humanoid.preset-101']}));
 const candidate=await compiler.prepare();
 const selected=JSON.parse(await readFile(path.join(candidate.playableRoot,'asset-definitions.json'),'utf8'));
 await writeFile(path.join(candidate.playableRoot,selected.assets[0].uri),'changed model bytes');
 await expect(compiler.verifyCandidatePolicy(candidate)).rejects.toThrow('THREE_ASSET_POLICY_RESOURCE_MISMATCH');
});

it('carries the same policy through the real submit serializer and archive using mocked completed evidence',async()=>{
 const root=await workspace(),service=new ThreeCreatorTools(root,'three-sdk');
 try{
  const episode=JSON.stringify({schemaVersion:1,steps:[{keysDown:['w'],durationSeconds:180}],targets:[]});
  await writeFile(path.join(root,'episode.json'),episode);
  const candidate=await service.compiler.prepare();
  const playRoot=path.join(service.evidenceRoot,'mock-play'),captureRoot=path.join(service.evidenceRoot,'mock-captures');
  await mkdir(playRoot,{recursive:true});await mkdir(captureRoot,{recursive:true});
  // Controlled unit fixtures only: this does not claim any actual recording.
  const report={status:'passed',isCompleteEpisode:true,capturedInput:true,actualWallSeconds:180,inputWallSeconds:180,activePlaySeconds:180,
   videoMetadata:{durationSeconds:180},worldBuildHash:candidate.worldBuildHash,episodeHash:sha256(episode)};
  const captures={worldBuildHash:candidate.worldBuildHash,pageErrors:[]};
  await writeFile(path.join(playRoot,'mock.json'),JSON.stringify(report));await writeFile(path.join(captureRoot,'mock.json'),JSON.stringify(captures));
  Object.assign(service,{playtestEvidence:{root:playRoot,files:await hashTree(playRoot),report},captureEvidence:{root:captureRoot,files:await hashTree(captureRoot),report:captures}});
  const receipt=await service.submit();
  expect(receipt.assetPolicySha256).toBe(service.compiler.assetPolicySha256);
  const archived=JSON.parse(execFileSync('tar',['-xOf',receipt.archivePath,'payload/playable/asset-policy.json'],{encoding:'utf8'}));
  const delivery=JSON.parse(execFileSync('tar',['-xOf',receipt.archivePath,'payload/delivery.json'],{encoding:'utf8'}));
  expect(assetPolicyHash(archived)).toBe(receipt.assetPolicySha256);
  expect(delivery.assetPolicySha256).toBe(receipt.assetPolicySha256);
  expect(delivery.files['playable/asset-policy.json']).toBe(sha256(execFileSync('tar',['-xOf',receipt.archivePath,'payload/playable/asset-policy.json'])));
 }finally{await service.close();}
});
