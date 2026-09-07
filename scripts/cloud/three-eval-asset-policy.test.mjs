import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm, symlink, realpath, cp, chmod} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {freezeRunAssetPolicy, freezeTaskAssetPolicy, readPinnedAssetPolicy} from './three-eval-mcp-bridge.mjs';
const toolkitRoot = path.resolve('.');
async function fixture(t) {
 const root=await realpath(await mkdtemp(path.join(tmpdir(),'three-policy-')));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const workspace=path.join(root,'case-one--three-sdk');
 await mkdir(path.join(workspace,'inputs'),{recursive:true});
 const layout={workspace,caseId:'case-one',taskId:'case-one--three-sdk',profile:'three-sdk'};
 const lock={toolkitRoot,hostCacheRoot:path.join(root,'host-cache'),runtimeHash:'a'.repeat(64)};
 const frozen=await freezeRunAssetPolicy({toolkitRoot});
 const input={kind:'three-creator-case-input',schemaVersion:1,...layout,runtimeHash:lock.runtimeHash,...frozen};
 delete input.workspace;
 const inputPath=path.join(workspace,'inputs','case-input.json');
 await writeFile(inputPath,JSON.stringify(input));
 return {root,layout,lock,frozen,input,inputPath};
}
test('new runs freeze policy and resumes preserve exact persisted policy without reading current config',async()=>{
 const frozen=await freezeRunAssetPolicy({toolkitRoot});
 assert.equal(frozen.assetPolicySha256.length,64);
 assert(!frozen.assetPolicySnapshot.policy.allowedAssetIds.includes('humanoid.g-bot'));
 assert.deepEqual(await freezeRunAssetPolicy({toolkitRoot:'/does-not-exist',previousPlan:frozen}),frozen);
 assert.deepEqual(await freezeRunAssetPolicy({toolkitRoot:'/does-not-exist',previousPlan:{schemaVersion:1}}),{});
 await assert.rejects(freezeRunAssetPolicy({toolkitRoot,previousPlan:{...frozen,assetPolicySha256:'b'.repeat(64)}}),/POLICY_HASH/);
});
test('launcher freezes exact task input outside workspace; restarts ignore model input edits and retain pinned hash',async t=>{
 const f=await fixture(t),pinned=await freezeTaskAssetPolicy(f);
 assert(!pinned.assetPolicySnapshotPath.startsWith(f.layout.workspace+'/'));
 assert.equal(pinned.assetPolicySha256,f.frozen.assetPolicySha256);
 await writeFile(f.inputPath,'{}');
 assert.deepEqual(await freezeTaskAssetPolicy(f),pinned);
 assert.deepEqual(await readPinnedAssetPolicy({...pinned,workspace:f.layout.workspace,toolkitRoot}),f.frozen.assetPolicySnapshot);
 await chmod(pinned.assetPolicySnapshotPath,0o600);
 const changed=structuredClone(f.frozen.assetPolicySnapshot);changed.policy.allowCustomAssets=false;
 await writeFile(pinned.assetPolicySnapshotPath,JSON.stringify(changed));
 await assert.rejects(readPinnedAssetPolicy({...pinned,workspace:f.layout.workspace,toolkitRoot}),/POLICY_HASH/);
});
test('launcher rejects missing, unrelated, duplicate and tampered policy inputs',async t=>{
 const f=await fixture(t);
 await rm(f.inputPath);
 await assert.rejects(freezeTaskAssetPolicy(f),/CASE_INPUT/);
 const noPolicy={...f.input};delete noPolicy.assetPolicySnapshot;delete noPolicy.assetPolicySha256;
 await writeFile(f.inputPath,JSON.stringify(noPolicy));
 await assert.rejects(freezeTaskAssetPolicy(f),/POLICY_PIN/);
 await writeFile(f.inputPath,JSON.stringify({...f.input,taskId:'another--three-sdk'}));
 await assert.rejects(freezeTaskAssetPolicy(f),/CASE_INPUT/);
 await writeFile(f.inputPath,JSON.stringify({...f.input,assetPolicySha256:'b'.repeat(64)}));
 await assert.rejects(freezeTaskAssetPolicy(f),/POLICY_HASH/);
 await writeFile(f.inputPath,JSON.stringify(f.input));
 await writeFile(path.join(f.layout.workspace,'inputs','duplicate.json'),JSON.stringify(f.input));
 await assert.rejects(freezeTaskAssetPolicy(f),/CASE_INPUT/);
});
test('pinned bridge rejects workspace policy, symlinks and incomplete pins',async t=>{
 const f=await fixture(t),pinned=await freezeTaskAssetPolicy(f);
 await assert.rejects(readPinnedAssetPolicy({...pinned,assetPolicySnapshotPath:f.inputPath,workspace:f.layout.workspace,toolkitRoot}),/POLICY_PATH/);
 await assert.rejects(readPinnedAssetPolicy({assetPolicySnapshotPath:pinned.assetPolicySnapshotPath,workspace:f.layout.workspace,toolkitRoot}),/POLICY_PIN/);
 const link=path.join(f.root,'policy-link.json');await symlink(pinned.assetPolicySnapshotPath,link);
 await assert.rejects(readPinnedAssetPolicy({...pinned,assetPolicySnapshotPath:link,workspace:f.layout.workspace,toolkitRoot}),/POLICY_PATH/);
});

test('installed catalog drift or resource-byte drift rejects before a task can freeze',async t=>{
 const f=await fixture(t), isolated=path.join(f.root,'toolkit');
 await mkdir(path.join(isolated,'scripts/three-creator'),{recursive:true});
 for(const name of ['asset-policy.mjs','asset-catalog.json'])await cp(path.join(toolkitRoot,'scripts/three-creator',name),path.join(isolated,'scripts/three-creator',name));
 const catalogPath=path.join(isolated,'scripts/three-creator/asset-catalog.json'),catalog=JSON.parse(await readFile(catalogPath,'utf8'));
 const original=catalog.assets[0].displayName;catalog.assets[0].displayName+=' drift';
 await writeFile(catalogPath,JSON.stringify(catalog));
 await assert.rejects(freezeTaskAssetPolicy({...f,lock:{...f.lock,toolkitRoot:isolated}}),/POLICY_CATALOG/);
 catalog.assets[0].displayName=original;await writeFile(catalogPath,JSON.stringify(catalog));
 const resourcePath=path.join(isolated,catalog.assets[0].sourcePath);await mkdir(path.dirname(resourcePath),{recursive:true});await writeFile(resourcePath,'changed');
 await assert.rejects(freezeTaskAssetPolicy({...f,lock:{...f.lock,toolkitRoot:isolated}}),/POLICY_RESOURCE_MISMATCH/);
});
